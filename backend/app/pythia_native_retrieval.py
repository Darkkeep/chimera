"""Read-only recovery of original Pythia media associated with a Chimera job.

This is NOT a media generator. The authenticated Chimera route first validates
project.export; this module verifies project/job/candidate provenance and compares
recovered bytes against the original Chimera candidate receipt before returning them.
"""
import base64
import binascii
import hashlib

from . import storage
from .learning_intelligence import PythiaProvider

MAX_MEDIA_BYTES = 26_214_400


class SourceConflict(ValueError):
    pass


def recover_candidate(project_id: str, candidate_id: str, provider=None):
    candidate = storage.read_generated_candidate(project_id, candidate_id)
    job = storage.read_media_generation_job(project_id, candidate.jobId)
    kind = "image" if candidate.kind == "image" else "narration" if candidate.kind == "audio" else None
    expected_type = "image/png" if kind == "image" else "audio/mpeg"
    if (kind is None or candidate.projectId != project_id or job.projectId != project_id
            or candidate.jobId != job.id or candidate.id not in job.candidateIds
            or job.status != "completed" or candidate.provider != "Pythia"
            or job.provider != "Pythia" or job.kind != kind
            or candidate.contentType != expected_type):
        raise SourceConflict("A completed Pythia candidate linked to this project is required")
    provider = provider or PythiaProvider()
    result = provider.retrieve_native_output(kind, job.id)
    encoded_key = "image_base64" if kind == "image" else "data_base64"
    expected_format = "pythia-image-result-v1" if kind == "image" else "pythia-media-result-v1"
    if (not isinstance(result, dict) or result.get("format") != expected_format
            or result.get("request_id") != job.id or result.get("media_type") != expected_type
            or not isinstance(result.get(encoded_key), str)
            or len(result[encoded_key]) > 36_000_000):
        raise SourceConflict("Pythia source response does not match this Chimera job")
    try:
        raw = base64.b64decode(result[encoded_key], validate=True)
    except (ValueError, binascii.Error):
        raise SourceConflict("Pythia source bytes could not be decoded") from None
    if (not raw or len(raw) > MAX_MEDIA_BYTES
            or len(raw) != candidate.sizeBytes
            or hashlib.sha256(raw).hexdigest() != candidate.sha256
            or result.get("sha256") != candidate.sha256):
        raise SourceConflict("Pythia source bytes differ from the retained Chimera candidate")
    if kind == "image" and not raw.startswith(b"\x89PNG\r\n\x1a\n"):
        raise SourceConflict("Pythia returned invalid PNG source bytes")
    if kind == "narration" and not (raw.startswith(b"ID3") or raw.startswith(b"\xff\xfb")):
        raise SourceConflict("Pythia returned invalid MP3 source bytes")
    return candidate, raw
