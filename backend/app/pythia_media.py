"""Chimera image jobs executed by the configured Pythia service."""
import base64
import binascii
import hashlib
import json
import os

from .learning_intelligence import PythiaProvider, PythiaUnavailableError


def enabled():
    selection = os.environ.get("CHIMERA_IMAGE_PROVIDER")
    if selection is not None:
        return selection.lower() == "pythia"
    from . import storage
    path = storage.ROOT / "pythia-connection.json"
    if not path.exists():
        return False
    return json.loads(path.read_text(encoding="utf-8")).get("imageProvider") == "pythia"


def image_status():
    try:
        value = PythiaProvider().image_status()
    except (PythiaUnavailableError, ValueError):
        return {"configured": False, "revision": "pythia-unavailable", "provider": "Pythia"}
    configured = value.get("configured") is True and isinstance(value.get("revision"), str) and isinstance(value.get("model"), str)
    return {"configured": configured, "provider": "Pythia", "imageModel": value.get("model"),
            "revision": "pythia-" + value["revision"] if configured else "pythia-unavailable"}


class PythiaImageProvider:
    name = "Pythia"
    audio_model = ""

    def __init__(self, expected_revision=None):
        self.client = PythiaProvider()
        status = self.client.image_status()
        if status.get("configured") is not True:
            raise RuntimeError("Pythia image generation is unavailable. Check the existing Pythia connection.")
        self.revision = "pythia-" + status["revision"]
        if expected_revision and expected_revision != self.revision:
            raise RuntimeError("Pythia's image connection changed after submission. Submit a new request explicitly.")
        self.image_model = status["model"]

    def generate_image(self, job):
        result = self.client.generate_image({"request_id": job.id, "prompt": job.prompt,
                                            "width": job.width or 1024, "height": job.height or 1024,
                                            "expected_revision": self.revision.removeprefix("pythia-")})
        try:
            if (result.get("format") != "pythia-image-result-v1" or result.get("request_id") != job.id
                    or result.get("media_type") != "image/png" or result.get("model") != self.image_model
                    or not isinstance(result.get("image_base64"), str) or len(result["image_base64"]) > 40000000):
                raise ValueError()
            image = base64.b64decode(result["image_base64"], validate=True)
            if not image.startswith(b"\x89PNG\r\n\x1a\n") or hashlib.sha256(image).hexdigest() != result.get("sha256"):
                raise ValueError()
        except (ValueError, TypeError, binascii.Error):
            raise RuntimeError("Pythia returned an invalid or mismatched image. No direct-provider fallback was made.") from None
        return image, "image/png", self.image_model


def media_status():
    try:
        return PythiaProvider().media_status()
    except (PythiaUnavailableError, ValueError):
        return {"configured": False}


def media_connection_status(kind):
    status = media_status()
    configured = status.get("configured") is True and isinstance(status.get("models", {}).get(kind), str)
    return {"configured": configured, "revision": "pythia-media-" + status["revision"] if configured else "pythia-unavailable",
            "provider": "Pythia", "model": status.get("models", {}).get(kind)}


def draft_scene(payload, guidance):
    from uuid import uuid4
    client = PythiaProvider()
    status = client.media_status()
    if status.get("configured") is not True:
        raise RuntimeError("Pythia scene drafting is unavailable. Start Pythia with media enabled.")
    operation = "chimera-scene-" + uuid4().hex
    result = client.scene_draft({"request_id": operation, "expected_revision": status["revision"],
                                 "payload": payload, "guidance": guidance})
    if result.get("request_id") != operation or result.get("producer") != "Pythia" or not isinstance(result.get("draft"), dict):
        raise RuntimeError("Pythia returned an invalid scene draft")
    return {**result["draft"], "producer": "Pythia", "model": result["model"]}


class PythiaMediaProvider:
    name = "Pythia"
    image_model = ""

    def __init__(self, kind, expected_revision=None):
        self.client = PythiaProvider()
        status = self.client.media_status()
        if status.get("configured") is not True or kind not in status.get("models", {}):
            raise RuntimeError("Pythia media execution is unavailable. Check the existing Pythia connection.")
        self.revision = "pythia-media-" + status["revision"]
        if expected_revision and self.revision != expected_revision:
            raise RuntimeError("Pythia's media connection changed after submission. Submit explicitly again.")
        self.model = status["models"][kind]
        self.audio_model = status["models"]["narration"]
        self.video_model = status["models"].get("video", "")

    def _decode(self, result, job, media_type):
        try:
            if (result.get("format") != "pythia-media-result-v1" or result.get("request_id") != job.id
                    or result.get("media_type") != media_type or result.get("model") != self.model
                    or not isinstance(result.get("data_base64"), str) or len(result["data_base64"]) > 90000000):
                raise ValueError()
            content = base64.b64decode(result["data_base64"], validate=True)
            if not content or hashlib.sha256(content).hexdigest() != result.get("sha256"):
                raise ValueError()
        except (ValueError, TypeError, binascii.Error):
            raise RuntimeError("Pythia returned invalid or mismatched media; no fallback or generation retry was made") from None
        return content, media_type, self.model

    def generate_narration(self, job):
        result = self.client.generate_narration({"request_id": job.id,
            "expected_revision": self.revision.removeprefix("pythia-media-"), "script": job.script, "voice": job.voice or "alloy"})
        return self._decode(result, job, "audio/mpeg")

    def generate_video(self, job):
        raise RuntimeError("A supported video provider is required. OpenAI's Videos API was retired on September 24, 2026.")
