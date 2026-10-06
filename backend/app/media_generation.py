import base64
from contextvars import copy_context
import hashlib
import json
import os
import threading
import urllib.error
import urllib.request
from typing import Protocol

from . import storage
from .models import GeneratedAssetCandidate, MediaGenerationJob, MediaGenerationJobCreate


class MediaGenerationProvider(Protocol):
    name: str
    image_model: str
    audio_model: str

    def generate_image(self, job: MediaGenerationJob) -> tuple[bytes, str, str]: ...
    def generate_narration(self, job: MediaGenerationJob) -> tuple[bytes, str, str]: ...


class OpenAICompatibleMediaProvider:
    def __init__(self) -> None:
        self.base_url = os.environ["CHIMERA_AI_BASE_URL"].rstrip("/")
        self.api_key = os.environ["CHIMERA_AI_API_KEY"]
        self.name = os.environ.get("CHIMERA_AI_PROVIDER", "openai-compatible")
        self.image_model = os.environ.get("CHIMERA_AI_IMAGE_MODEL", os.environ["CHIMERA_AI_MODEL"])
        self.audio_model = os.environ.get("CHIMERA_AI_AUDIO_MODEL", os.environ["CHIMERA_AI_MODEL"])

    def _request(self, path: str, body: dict[str, object], accept: str = "application/json") -> tuple[bytes, str]:
        request = urllib.request.Request(
            f"{self.base_url}{path}",
            data=json.dumps(body).encode("utf-8"),
            headers={"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json", "Accept": accept},
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=180) as response:
                return response.read(), response.headers.get_content_type()
        except (urllib.error.URLError, TimeoutError, OSError) as error:
            raise RuntimeError(f"Media provider request failed: {error}") from error

    def generate_image(self, job: MediaGenerationJob) -> tuple[bytes, str, str]:
        size = f"{job.width or 1024}x{job.height or 1024}"
        raw, _ = self._request("/images/generations", {"model": self.image_model, "prompt": job.prompt, "size": size, "response_format": "b64_json"})
        try:
            encoded = json.loads(raw.decode("utf-8"))["data"][0]["b64_json"]
            return base64.b64decode(encoded), "image/png", self.image_model
        except (KeyError, IndexError, TypeError, ValueError, json.JSONDecodeError) as error:
            raise RuntimeError("Media provider returned an invalid image response") from error

    def generate_narration(self, job: MediaGenerationJob) -> tuple[bytes, str, str]:
        raw, content_type = self._request("/audio/speech", {"model": self.audio_model, "input": job.script, "voice": job.voice or "alloy", "response_format": "mp3"}, "audio/mpeg")
        if not raw:
            raise RuntimeError("Media provider returned an empty narration")
        return raw, content_type or "audio/mpeg", self.audio_model


def _provider() -> MediaGenerationProvider:
    required = ("CHIMERA_AI_BASE_URL", "CHIMERA_AI_API_KEY", "CHIMERA_AI_MODEL")
    if not all(os.environ.get(name) for name in required):
        raise RuntimeError("AI media generation is not configured. Set CHIMERA_AI_BASE_URL, CHIMERA_AI_API_KEY, and CHIMERA_AI_MODEL on the server.")
    return OpenAICompatibleMediaProvider()


_registry_lock = threading.Lock()
_active_threads: dict[str, threading.Thread] = {}
_provider_factory = _provider


def start_media_generation_job(project_id: str, job_id: str) -> None:
    with _registry_lock:
        current = _active_threads.get(job_id)
        if current and current.is_alive():
            return
        thread = threading.Thread(target=copy_context().run, args=(_run_job, project_id, job_id), name=job_id, daemon=True)
        _active_threads[job_id] = thread
        thread.start()


def recover_media_generation_jobs() -> None:
    for project in storage.list_projects():
        for job in storage.list_media_generation_jobs(project.id):
            if job.status in {"queued", "running"}:
                if job.cancelRequested:
                    storage.update_media_generation_job(project.id, job.id, status="cancelled", progress=100, message="Cancelled before server restart")
                else:
                    if job.status == "running":
                        storage.update_media_generation_job(project.id, job.id, status="queued", progress=0, message="Resuming after server restart")
                    start_media_generation_job(project.id, job.id)


def _run_job(project_id: str, job_id: str) -> None:
    try:
        job = storage.read_media_generation_job(project_id, job_id)
        if job.status != "queued":
            return
        if job.cancelRequested:
            storage.update_media_generation_job(project_id, job_id, status="cancelled", progress=100, message="Cancelled before processing")
            return
        provider = _provider_factory()
        storage.update_media_generation_job(project_id, job_id, status="running", progress=20, message="Generating media", provider=provider.name, model=provider.image_model if job.kind == "image" else provider.audio_model)
        job = storage.read_media_generation_job(project_id, job_id)
        content, content_type, model = provider.generate_image(job) if job.kind == "image" else provider.generate_narration(job)
        job = storage.read_media_generation_job(project_id, job_id)
        if job.cancelRequested:
            storage.update_media_generation_job(project_id, job_id, status="cancelled", progress=100, message="Cancelled; generated media was discarded")
            return
        if not content:
            raise RuntimeError("Media provider returned empty output")
        digest = hashlib.sha256(content).hexdigest()
        extension = ".png" if job.kind == "image" else ".mp3"
        asset_kind = "image" if job.kind == "image" else "audio"
        candidate_id = f"candidate-{__import__('uuid').uuid4().hex[:12]}"
        filename = f"{candidate_id}{extension}"
        candidate = GeneratedAssetCandidate(
            id=candidate_id,
            projectId=project_id,
            jobId=job.id,
            sourceRevision=job.sourceRevision,
            sceneId=job.sceneId,
            kind=asset_kind,
            filename=filename,
            contentType=content_type,
            sizeBytes=len(content),
            sha256=digest,
            path=f"generated-candidates/{filename}",
            purpose=job.purpose,
            prompt=job.prompt,
            style=job.style,
            width=job.width,
            height=job.height,
            script=job.script,
            voice=job.voice,
            language=job.language,
            altText=job.altText,
            captions=job.captions,
            provider=provider.name,
            model=model,
            createdAt=storage.now_iso(),
        )
        with storage.storyboard_transaction():
            storage.write_generated_candidate(candidate, content)
            storage.update_media_generation_job(project_id, job_id, status="completed", progress=100, message="Generated candidate is ready for author review", candidateIds=[candidate.id], error=None)
    except Exception as error:
        try:
            current = storage.read_media_generation_job(project_id, job_id)
            if current.status not in {"cancelled", "completed"}:
                storage.update_media_generation_job(project_id, job_id, status="failed", progress=100, message="Media generation failed", error=str(error)[:2000])
        except Exception:
            pass
    finally:
        with _registry_lock:
            _active_threads.pop(job_id, None)


def cancel_media_generation_job(project_id: str, job_id: str) -> MediaGenerationJob:
    job = storage.read_media_generation_job(project_id, job_id)
    if job.status in {"completed", "failed", "cancelled"}:
        raise ValueError("Only queued or running media jobs can be cancelled")
    return storage.update_media_generation_job(project_id, job_id, cancelRequested=True, message="Cancellation requested")


def retry_media_generation_job(project_id: str, job_id: str) -> MediaGenerationJob:
    job = storage.read_media_generation_job(project_id, job_id)
    if job.status not in {"failed", "cancelled"}:
        raise ValueError("Only failed or cancelled media jobs can be retried")
    data = MediaGenerationJobCreate.model_validate(job.model_dump(include={"kind", "sceneId", "purpose", "style", "width", "height", "prompt", "script", "voice", "language", "altText", "captions"}))
    retry = storage.create_media_generation_job(project_id, data).model_copy(update={"retryOf": job.id})
    storage.write_media_generation_job(retry)
    start_media_generation_job(project_id, retry.id)
    return retry


def regenerate_candidate(project_id: str, candidate_id: str) -> MediaGenerationJob:
    candidate = storage.read_generated_candidate(project_id, candidate_id)
    if candidate.status != "pending":
        raise ValueError("Only pending candidates can be regenerated")
    data = MediaGenerationJobCreate(
        kind="image" if candidate.kind == "image" else "narration",
        sceneId=candidate.sceneId,
        purpose=candidate.purpose,
        style=candidate.style,
        width=candidate.width,
        height=candidate.height,
        prompt=candidate.prompt,
        script=candidate.script,
        voice=candidate.voice,
        language=candidate.language,
        altText=candidate.altText,
        captions=candidate.captions,
    )
    job = storage.create_media_generation_job(project_id, data)
    start_media_generation_job(project_id, job.id)
    return job
