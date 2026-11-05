"""Asynchronous presenter and title renders using saved video connections."""
import ipaddress
import http.client
import json
import math
import re
import socket
import time
import urllib.error
import urllib.parse
import urllib.request

from . import ai_connection, narration_connections, storage
from .models import MediaGenerationJob

MAX_VIDEO_BYTES = 100 * 1024 * 1024
POLL_SECONDS = 5
MAX_RENDER_SECONDS = 20 * 60


def _document(connection: narration_connections.NarrationConnection, path: str, body: dict | None = None) -> dict:
    try:
        document = json.loads(narration_connections._request(connection, path, body, metered=body is not None))
        if not isinstance(document, dict):
            raise ValueError()
        if connection.settings["provider"] == "shotstack":
            if document.get("success") is not True or not isinstance(document.get("response"), dict):
                raise ValueError()
            return document["response"]
        return document
    except (ValueError, TypeError):
        raise RuntimeError("The video provider returned invalid render metadata. Check the provider dashboard before retrying.") from None


def _download(connection: narration_connections.NarrationConnection, url: str) -> bytes:
    try:
        parsed = urllib.parse.urlsplit(url)
        host = parsed.hostname or ""
        suffixes = ("synthesia.io", "shotstack.io", "amazonaws.com", "cloudfront.net")
        if (len(url) > 8192 or any(ord(character) <= 32 or ord(character) > 126 for character in url)
                or parsed.scheme != "https" or parsed.username or parsed.password or parsed.fragment or parsed.port not in {None, 443}
                or not any(host == suffix or host.endswith("." + suffix) for suffix in suffixes)):
            raise ValueError()
        addresses = socket.getaddrinfo(host, 443, type=socket.SOCK_STREAM)
        if not addresses or any(not ipaddress.ip_address(item[4][0]).is_global for item in addresses):
            raise ValueError()
    except (ValueError, TypeError, OSError):
        raise RuntimeError("The video provider returned an unsupported download location.") from None
    request = urllib.request.Request(url, headers={"Accept": "video/mp4"})
    try:
        # CDN requests never carry the provider credential and never follow redirects.
        with ai_connection.open_provider_request(connection.budget, request, 180) as response:
            content = response.read(MAX_VIDEO_BYTES + 1)
    except (urllib.error.URLError, TimeoutError, OSError, ValueError, http.client.HTTPException) as error:
        if isinstance(error, urllib.error.HTTPError):
            error.close()
        raise RuntimeError("Video download failed. The render may already be billed; check the provider dashboard before retrying.") from None
    if len(content) > MAX_VIDEO_BYTES or len(content) < 12 or content[4:8] != b"ftyp":
        raise RuntimeError("The video provider did not return a supported MP4 under 100 MiB.")
    return content


class VideoProvider:
    image_model = ""
    audio_model = ""

    def __init__(self, job: MediaGenerationJob) -> None:
        self.connection = narration_connections.resolve_narration_connection(storage.ROOT, job.connectionId or "", job.aiConnectionRevision)
        self.name = self.connection.settings["provider"]
        if self.name not in {"synthesia", "shotstack"}:
            raise ValueError("Select a supported video connection.")
        self.video_model = self.name + "-video"

    def generate_video(self, job: MediaGenerationJob) -> tuple[bytes, str, str]:
        portrait = (job.width or 1280) < (job.height or 720)
        if self.name == "synthesia":
            if not job.script.strip() or not re.fullmatch(r"[A-Za-z0-9_.-]{1,200}", job.avatar):
                raise ValueError("Synthesia requires a presenter script and an authorized avatar ID.")
            path = "/videos"
            body = {"title": job.prompt, "visibility": "private", "callbackId": job.id,
                    "aspectRatio": "9:16" if portrait else "16:9",
                    "input": [{"avatar": job.avatar, "background": "off_white", "scriptText": job.script}]}
        else:
            path = "/render"
            shots = [(shot.text, shot.durationSeconds, shot.transition) for shot in job.videoTreatment.treatment.shots] if job.videoTreatment else [
                (job.prompt, job.durationSeconds or 30, "fade")
            ]
            clips = []
            start = 0
            for text, duration, transition in shots:
                clip = {
                    "asset": {"type": "rich-text", "text": text,
                              "font": {"family": "SpecialElite-Regular", "size": 48, "color": "#ffffff"},
                              "align": {"horizontal": "center", "vertical": "middle"}},
                    "width": 640 if portrait else 1120, "height": 1120 if portrait else 640,
                    "start": start, "length": duration,
                }
                if transition == "fade":
                    clip["transition"] = {"in": "fade", "out": "fade"}
                clips.append(clip)
                start += duration
            body = {"timeline": {"background": "#101828",
                "fonts": [{"src": "https://shotstack-assets.s3.amazonaws.com/fonts/SpecialElite-Regular.ttf"}],
                "tracks": [{"clips": clips}]},
                "output": {"format": "mp4", "resolution": "hd", "aspectRatio": "9:16" if portrait else "16:9"}}
        submitted = _document(self.connection, path, body)
        operation = submitted.get("id")
        if not isinstance(operation, str) or not re.fullmatch(r"[A-Za-z0-9_-]{1,200}", operation):
            raise RuntimeError("The provider did not return a valid render ID. Check its dashboard before retrying.")
        storage.update_media_generation_job(job.projectId, job.id, providerOperationId=operation, progress=30,
                                            message="Video render submitted; waiting for provider")
        deadline = time.monotonic() + MAX_RENDER_SECONDS
        while time.monotonic() < deadline:
            current = storage.read_media_generation_job(job.projectId, job.id)
            if current.cancelRequested:
                raise RuntimeError("Cancelled locally; the remote render may continue and incur charges.")
            status_path = "/videos/" + operation + "?includeRejected=true" if self.name == "synthesia" else "/render/" + operation
            result = _document(self.connection, status_path)
            if result.get("id") != operation:
                raise RuntimeError("The provider returned a mismatched render ID.")
            status = result.get("status")
            complete = status == ("complete" if self.name == "synthesia" else "done")
            if complete:
                url = result.get("download" if self.name == "synthesia" else "url")
                if not isinstance(url, str) or not url:
                    raise RuntimeError("The completed video has no download URL.")
                if self.name == "synthesia":
                    try:
                        value = result["duration"]
                        if isinstance(value, str) and ":" in value:
                            clock = re.fullmatch(r"(\d+):([0-5]\d):([0-5]\d(?:\.\d+)?)", value)
                            if not clock:
                                raise ValueError()
                            duration = int(clock[1]) * 3600 + int(clock[2]) * 60 + float(clock[3])
                        elif isinstance(value, (str, int, float)) and not isinstance(value, bool):
                            duration = float(value)
                        else:
                            raise ValueError()
                        if not math.isfinite(duration) or duration <= 0 or duration > (job.durationSeconds or 30):
                            raise ValueError()
                    except (KeyError, ValueError, TypeError):
                        raise RuntimeError("The presenter render has an invalid duration or exceeds the requested limit (maximum 30 seconds). Shorten the script; the provider may already have billed this render.") from None
                    storage.update_media_generation_job(job.projectId, job.id, actualDurationSeconds=duration)
                content = _download(self.connection, url)
                return content, "video/mp4", self.video_model
            if status in {"error", "failed", "deleted", "rejected"}:
                raise RuntimeError("Video rendering failed or was rejected. Check the provider dashboard before retrying.")
            pending = {"in_progress", "approved"} if self.name == "synthesia" else {"queued", "fetching", "rendering", "saving"}
            if status not in pending:
                raise RuntimeError("The provider returned an unsupported video status. Check its dashboard before retrying.")
            time.sleep(POLL_SECONDS)
        raise RuntimeError("Video rendering timed out locally. The remote render may continue; check its dashboard before explicitly retrying.")
