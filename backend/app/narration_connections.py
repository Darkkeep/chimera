import base64
import hashlib
import json
import os
import re
import urllib.error
import urllib.parse
import urllib.request
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Literal

import google.auth
from google.auth.exceptions import GoogleAuthError
from google.auth.transport.requests import Request
from pydantic import BaseModel, ConfigDict, Field, SecretStr, model_validator
from keyring.errors import KeyringError

from . import ai_connection


ELEVEN_URL = "https://api.elevenlabs.io"
GOOGLE_URL = "https://texttospeech.googleapis.com/v1"
CARTESIA_URL = "https://api.cartesia.ai"
CARTESIA_VERSION = "2026-08-14"
SPEECH_PROVIDERS = {"elevenlabs", "google-cloud", "cartesia"}
KEY_ENVIRONMENTS = {
    "elevenlabs": "ELEVENLABS_API_KEY", "cartesia": "CARTESIA_API_KEY",
    "synthesia": "SYNTHESIA_API_KEY",
}
MAX_AUDIO_BYTES = 25 * 1024 * 1024


class NarrationConnectionUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    expectedRevision: str = Field(min_length=1, max_length=128)
    id: str | None = Field(default=None, pattern=r"^narration-[a-f0-9]{12}$")
    name: str = Field(min_length=1, max_length=100)
    provider: Literal["elevenlabs", "google-cloud", "cartesia", "synthesia", "shotstack"]
    credentialSource: Literal["secure-store", "environment", "adc"]
    apiKey: SecretStr | None = Field(default=None, max_length=512)
    voice: str = Field(default="", max_length=200, pattern=r"^[A-Za-z0-9_.-]*$")
    model: str = Field(default="", max_length=100, pattern=r"^[A-Za-z0-9_.-]*$")
    language: str = Field(default="en-US", pattern=r"^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$", max_length=40)
    projectId: str = Field(default="", max_length=100, pattern=r"^[a-z0-9-]*$")
    environment: Literal["stage", "v1"] = "stage"

    @model_validator(mode="after")
    def validate_provider(self) -> "NarrationConnectionUpdate":
        if self.provider == "google-cloud":
            if self.credentialSource != "adc" or self.apiKey:
                raise ValueError("Google Cloud requires server Application Default Credentials, not an uploaded key.")
            if self.model:
                raise ValueError("Google Cloud speech models are selected through the voice, not a separate model ID.")
        elif self.credentialSource == "adc":
            raise ValueError("This provider requires secure-store or environment credentials.")
        if self.provider in {"elevenlabs", "cartesia"} and not self.model:
            raise ValueError("This narration provider requires a speech model.")
        if self.provider in {"synthesia", "shotstack"} and (self.model or self.voice or self.projectId):
            raise ValueError("Video connection setup does not accept narration settings.")
        if self.provider != "shotstack" and self.environment != "stage":
            raise ValueError("Environment selection is supported only for Shotstack.")
        if self.credentialSource != "secure-store" and self.apiKey:
            raise ValueError("Keys can only be supplied for secure-store connections.")
        return self


@dataclass(frozen=True)
class NarrationConnection:
    root: Path
    revision: str
    settings: dict
    api_key: str = field(default="", repr=False)

    @property
    def budget(self) -> ai_connection.Connection:
        return ai_connection.Connection(self.root, self.revision, self.settings["provider"], "", "", "", "", "")


def _metadata(root: Path) -> dict:
    path = root / "identity" / "narration-connections.json"
    return json.loads(path.read_text(encoding="utf-8")) if path.is_file() else {"revision": "unconfigured", "connections": []}


def _service(root: Path) -> str:
    return ai_connection._service(root) + ".Narration"


def _revision(settings: dict) -> str:
    environment = os.environ.get(_key_environment(settings), "") if settings["credentialSource"] == "environment" else ""
    if settings["credentialSource"] == "adc":
        environment = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS", "") + os.environ.get("GOOGLE_CLOUD_QUOTA_PROJECT", "")
    return hashlib.sha256((settings["revision"] + environment).encode()).hexdigest()


def _key_environment(settings: dict) -> str:
    if settings["provider"] == "shotstack":
        return "SHOTSTACK_PRODUCTION_API_KEY" if settings.get("environment") == "v1" else "SHOTSTACK_SANDBOX_API_KEY"
    return KEY_ENVIRONMENTS.get(settings["provider"], "")


def _google_credentials(project_id: str):
    try:
        credentials, _ = google.auth.default(
            scopes=["https://www.googleapis.com/auth/cloud-platform"],
            quota_project_id=project_id or None,
        )
        return credentials
    except (GoogleAuthError, OSError, ValueError):
        raise RuntimeError("Google Cloud Application Default Credentials are unavailable for the backend service account.") from None


def resolve_narration_connection(root: Path, identifier: str, expected_revision: str | None = None) -> NarrationConnection:
    settings = next((item for item in _metadata(root)["connections"] if item["id"] == identifier), None)
    if settings is None:
        raise ValueError("The selected narration connection no longer exists. Select a saved connection.")
    revision = _revision(settings)
    if expected_revision and revision != expected_revision:
        raise ValueError("The narration connection changed after submission. Submit a new run.")
    key = ""
    if settings["credentialSource"] == "environment":
        key = os.environ.get(_key_environment(settings), "").strip()
    elif settings["credentialSource"] == "secure-store":
        try:
            key = ai_connection._secure_backend().get_password(_service(root), settings["credentialId"]) or ""
        except (RuntimeError, KeyringError):
            raise RuntimeError("The saved provider credential could not be read from the secure store.") from None
    if settings["provider"] != "google-cloud" and (not key or len(key) > 512 or any(character.isspace() or ord(character) < 33 or ord(character) > 126 for character in key)):
        raise RuntimeError("The selected provider credential is missing or invalid for the backend.")
    if settings["provider"] == "google-cloud":
        _google_credentials(settings["projectId"])
    return NarrationConnection(root, revision, settings, key)


def narration_status(root: Path) -> dict:
    metadata = _metadata(root)
    try:
        ai_connection._secure_backend()
        storage_available = True
    except (RuntimeError, KeyringError):
        storage_available = False
    connections = []
    for settings in metadata["connections"]:
        try:
            resolve_narration_connection(root, settings["id"])
            configured, credential_error = True, False
        except RuntimeError:
            configured, credential_error = False, True
        connections.append({
            **{key: settings[key] for key in ("id", "name", "provider", "credentialSource", "voice", "model", "language", "projectId")},
            "configured": configured, "credentialError": credential_error,
            "environment": settings.get("environment", "stage"),
        })
    return {
        "revision": metadata["revision"], "connections": connections,
        "storageAvailable": storage_available,
        "legacyConfigured": ai_connection.connection_status(root)["configured"],
    }


def _check_revision(root: Path, expected: str) -> dict:
    metadata = _metadata(root)
    if metadata["revision"] != expected:
        raise ValueError("Narration connections changed. Reload before continuing.")
    return metadata


def _write_connections(root: Path, connections: list[dict], previous: dict | None) -> None:
    backend = ai_connection._secure_backend() if previous and previous.get("credentialId") else None
    credential_id = previous["credentialId"] if backend and previous else ""
    previous_key = backend.get_password(_service(root), credential_id) if backend else None
    try:
        if backend and previous_key is not None:
            backend.delete_password(_service(root), credential_id)
        ai_connection._atomic_json(root / "identity" / "narration-connections.json", {
            "revision": uuid.uuid4().hex, "connections": connections,
        })
    except (OSError, KeyringError):
        if backend and previous_key is not None:
            backend.set_password(_service(root), credential_id, previous_key)
        raise


def save_narration_connection(root: Path, data: NarrationConnectionUpdate) -> None:
    metadata = _check_revision(root, data.expectedRevision)
    previous = next((item for item in metadata["connections"] if item["id"] == data.id), None)
    if data.id and previous is None:
        raise ValueError("The selected narration connection no longer exists.")
    if previous and previous["provider"] != data.provider:
        raise ValueError("A saved connection cannot change provider. Create a new connection instead.")
    if previous and previous["provider"] == "shotstack" and previous.get("environment", "stage") != data.environment and data.credentialSource == "secure-store" and not data.apiKey:
        raise ValueError("Enter the matching Shotstack key when changing environment.")
    if not previous and len(metadata["connections"]) >= 20:
        raise ValueError("An installation can save at most 20 narration connections.")
    settings = data.model_dump(exclude={"apiKey", "expectedRevision", "id"})
    settings.update({"id": data.id or f"narration-{uuid.uuid4().hex[:12]}", "revision": uuid.uuid4().hex})
    backend = None
    if data.credentialSource == "secure-store":
        backend = ai_connection._secure_backend()
        key = data.apiKey.get_secret_value().strip() if data.apiKey else ""
        if not key and previous and previous["credentialSource"] == "secure-store" and previous["provider"] == data.provider:
            key = backend.get_password(_service(root), previous["credentialId"]) or ""
        if not key or any(character.isspace() or ord(character) < 33 or ord(character) > 126 for character in key):
            raise ValueError("Enter a valid provider API key for secure storage.")
        settings["credentialId"] = uuid.uuid4().hex
        backend.set_password(_service(root), settings["credentialId"], key)
    updated = [settings if item["id"] == data.id else item for item in metadata["connections"]]
    if not previous:
        updated.append(settings)
    try:
        _write_connections(root, updated, previous)
    except (OSError, KeyringError, RuntimeError):
        if backend:
            backend.delete_password(_service(root), settings["credentialId"])
        raise RuntimeError("Provider settings could not be saved.") from None


def disconnect_narration_connection(root: Path, identifier: str, expected: str) -> None:
    metadata = _check_revision(root, expected)
    previous = next((item for item in metadata["connections"] if item["id"] == identifier), None)
    if previous is None:
        raise ValueError("The selected narration connection no longer exists.")
    _write_connections(root, [item for item in metadata["connections"] if item["id"] != identifier], previous)


def _request(connection: NarrationConnection, path: str, body: dict | None = None, limit: int = 2 * 1024 * 1024) -> bytes:
    settings = connection.settings
    headers = {"Accept": "application/json", "Content-Type": "application/json"}
    if settings["provider"] == "elevenlabs":
        url = ELEVEN_URL + path
        headers["xi-api-key"] = connection.api_key
    elif settings["provider"] == "cartesia":
        url = CARTESIA_URL + path
        headers.update({"Authorization": "Bearer " + connection.api_key, "Cartesia-Version": CARTESIA_VERSION})
    elif settings["provider"] == "synthesia":
        url = "https://api.synthesia.io/v2" + path
        headers["Authorization"] = connection.api_key
    elif settings["provider"] == "shotstack":
        url = "https://api.shotstack.io/edit/" + settings.get("environment", "stage") + path
        headers["x-api-key"] = connection.api_key
    else:
        url = GOOGLE_URL + path
        credentials = _google_credentials(settings["projectId"])
        try:
            credentials.before_request(Request(), "POST" if body is not None else "GET", url, headers)
        except (GoogleAuthError, OSError, ValueError):
            raise RuntimeError("Google Cloud credentials could not be refreshed. Check the backend service identity.") from None
    if body is not None and settings["provider"] in {"elevenlabs", "cartesia"}:
        headers["Accept"] = "audio/mpeg"
    request = urllib.request.Request(url, data=json.dumps(body).encode() if body is not None else None, headers=headers)
    try:
        with ai_connection.request_budget(connection.budget), ai_connection.open_provider_request(connection.budget, request, 180 if body else 15) as response:
            content = response.read(limit + 1)
            if len(content) > limit:
                raise RuntimeError("The provider response exceeds the supported size.")
            return content
    except (urllib.error.URLError, TimeoutError, OSError):
        raise RuntimeError("Provider request failed. Check credentials, API access, quota, and provider status.") from None


def test_narration_connection(root: Path, identifier: str, expected: str) -> dict:
    _check_revision(root, expected)
    connection = resolve_narration_connection(root, identifier)
    try:
        if connection.settings["provider"] == "elevenlabs":
            voices_data = json.loads(_request(connection, "/v2/voices?page_size=100"))
            models_data = json.loads(_request(connection, "/v1/models"))
            voices = [{"id": item["voice_id"], "name": item["name"], "language": ""} for item in voices_data["voices"]]
            models = [{"id": item["model_id"], "name": item["name"]} for item in models_data if item.get("can_do_text_to_speech")]
            continuation = " Additional voices may exist beyond this first page." if voices_data.get("has_more") else ""
        elif connection.settings["provider"] == "cartesia":
            voices_data = json.loads(_request(connection, "/voices?limit=100"))
            voices = [{"id": item["id"], "name": item["name"], "language": ""} for item in voices_data["data"]]
            models = []
            continuation = " Additional voices may exist beyond this first page." if voices_data["has_more"] else ""
        elif connection.settings["provider"] in {"synthesia", "shotstack"}:
            synthesia = connection.settings["provider"] == "synthesia"
            metadata = json.loads(_request(connection, "/videos?limit=1" if synthesia else "/templates"))
            valid = isinstance(metadata, dict) and (isinstance(metadata.get("videos"), list) if synthesia else metadata.get("success") is True and isinstance(metadata.get("response"), dict))
            if not valid:
                raise ValueError("Invalid metadata")
            return {"connected": True, "message": "Read-only connection test succeeded; no video was generated. Video generation is not yet available in Chimera.", "voices": [], "models": []}
        else:
            voices_data = json.loads(_request(connection, "/voices?languageCode=" + urllib.parse.quote(connection.settings["language"])))
            voices = [{"id": item["name"], "name": item["name"], "language": ", ".join(item["languageCodes"])} for item in voices_data.get("voices", [])]
            models, continuation = [], ""
    except (ValueError, KeyError, TypeError, AttributeError):
        raise RuntimeError("The provider returned invalid connection or discovery metadata.") from None
    return {"connected": True, "message": "Voice discovery succeeded; no speech was generated. Synthesis permissions and model/voice compatibility still require an explicit generation." + continuation, "voices": voices, "models": models}


def synthesize_narration(connection: NarrationConnection, script: str, voice: str | None, language: str | None) -> tuple[bytes, str, str]:
    settings = connection.settings
    if settings["provider"] not in SPEECH_PROVIDERS:
        raise ValueError("Video connection setup does not enable narration or video generation.")
    selected_voice = voice or settings["voice"]
    if not re.fullmatch(r"[A-Za-z0-9_.-]{1,200}", selected_voice):
        raise ValueError("Select a valid provider voice identifier.")
    if settings["provider"] == "elevenlabs":
        raw = _request(connection, "/v1/text-to-speech/" + selected_voice + "?output_format=mp3_44100_128", {
            "text": script, "model_id": settings["model"],
        }, MAX_AUDIO_BYTES)
        model = settings["model"]
    elif settings["provider"] == "cartesia":
        raw = _request(connection, "/tts/bytes", {
            "model_id": settings["model"], "transcript": script, "voice": {"id": selected_voice},
            "language": language or settings["language"],
            "output_format": {"container": "mp3", "sample_rate": 44100, "bit_rate": 128000},
        }, MAX_AUDIO_BYTES)
        model = settings["model"]
    else:
        if len(script.encode("utf-8")) > 5000:
            raise ValueError("Google Cloud narration is limited to 5,000 UTF-8 bytes per request. Split this script into smaller scenes.")
        body = {"input": {"text": script}, "voice": {"languageCode": language or settings["language"], "name": selected_voice}, "audioConfig": {"audioEncoding": "MP3"}}
        try:
            encoded = json.loads(_request(connection, "/text:synthesize", body, MAX_AUDIO_BYTES))["audioContent"]
            raw = base64.b64decode(encoded, validate=True)
        except (ValueError, KeyError, TypeError):
            raise RuntimeError("Google Cloud returned invalid speech audio.") from None
        model = selected_voice
    if not raw or not (raw.startswith(b"ID3") or len(raw) >= 2 and raw[0] == 0xFF and raw[1] & 0xE0 == 0xE0):
        raise RuntimeError("The narration provider did not return valid MP3 audio.")
    return raw, "audio/mpeg", model
