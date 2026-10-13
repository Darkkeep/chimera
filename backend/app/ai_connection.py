import hashlib
import json
import os
import threading
import urllib.error
import urllib.request
import uuid
from contextlib import contextmanager
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterator, Literal

import keyring
from pydantic import BaseModel, ConfigDict, Field, SecretStr


TEXT_MODELS = ("gpt-4.1-mini", "gpt-4.1", "gpt-4o-mini")
IMAGE_MODELS = ("gpt-image-1",)
AUDIO_MODELS = ("gpt-4o-mini-tts", "tts-1")
OPENAI_URL = "https://api.openai.com/v1"
_usage_lock = threading.RLock()
_active_requests: dict[str, int] = {}


class ConnectionUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    expectedRevision: str
    provider: Literal["openai"] = "openai"
    textModel: Literal["gpt-4.1-mini", "gpt-4.1", "gpt-4o-mini"] = "gpt-4.1-mini"
    imageModel: Literal["gpt-image-1"] = "gpt-image-1"
    audioModel: Literal["gpt-4o-mini-tts", "tts-1"] = "gpt-4o-mini-tts"
    apiKey: SecretStr | None = Field(default=None, max_length=512)
    maxRequestsPerDay: int = Field(default=20, ge=1, le=1000)
    maxConcurrentRequests: int = Field(default=1, ge=1, le=4)


class ConnectionRevision(BaseModel):
    model_config = ConfigDict(extra="forbid")
    expectedRevision: str = Field(min_length=1, max_length=128)


@dataclass(frozen=True)
class Connection:
    root: Path
    revision: str
    provider: str
    base_url: str
    text_model: str
    image_model: str
    audio_model: str
    api_key: str = field(repr=False)
    max_requests_per_day: int = 20
    max_concurrent_requests: int = 1


def _secure_backend():
    backend = keyring.get_keyring()
    candidates = getattr(backend, "backends", [backend])
    for candidate in candidates:
        module = type(candidate).__module__
        if module in {"keyring.backends.Windows", "keyring.backends.macOS", "keyring.backends.SecretService", "keyring.backends.kwallet"} and candidate.priority > 0:
            return candidate
    raise RuntimeError("A secure OS credential store is unavailable for this server account.")


def _service(root: Path) -> str:
    return "Chimera.AI." + hashlib.sha256(str(root.resolve()).encode()).hexdigest()[:24]


def _metadata(root: Path) -> dict:
    path = root / "identity" / "ai-connection.json"
    return json.loads(path.read_text(encoding="utf-8")) if path.is_file() else {}


def _atomic_json(path: Path, value: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f".{path.name}-{uuid.uuid4().hex}.tmp")
    try:
        temporary.write_text(json.dumps(value, indent=2), encoding="utf-8")
        temporary.chmod(0o600)
        temporary.replace(path)
    finally:
        temporary.unlink(missing_ok=True)


def resolve_connection(root: Path, expected_revision: str | None = None) -> Connection | None:
    metadata = _metadata(root)
    if metadata:
        if metadata.get("disabled"):
            return None
        try:
            api_key = _secure_backend().get_password(_service(root), metadata["credentialId"])
        except Exception:
            raise RuntimeError("The saved AI credential could not be read from the secure store.") from None
        if not api_key:
            return None
        connection = Connection(root, metadata["revision"], "openai", OPENAI_URL, metadata["textModel"], metadata["imageModel"], metadata["audioModel"], api_key, metadata["maxRequestsPerDay"], metadata["maxConcurrentRequests"])
    else:
        values = [os.environ.get(name, "") for name in ("CHIMERA_AI_BASE_URL", "CHIMERA_AI_API_KEY", "CHIMERA_AI_MODEL")]
        if not all(values):
            return None
        base_url, api_key, model = values
        image_model = os.environ.get("CHIMERA_AI_IMAGE_MODEL", model)
        audio_model = os.environ.get("CHIMERA_AI_AUDIO_MODEL", model)
        revision = "environment-" + hashlib.sha256(json.dumps([base_url, api_key, model, image_model, audio_model]).encode()).hexdigest()
        connection = Connection(root, revision, os.environ.get("CHIMERA_AI_PROVIDER", "openai-compatible"), base_url.rstrip("/"), model, image_model, audio_model, api_key)
    if expected_revision and expected_revision != connection.revision:
        raise RuntimeError("The AI connection changed after submission. Submit a new run.")
    return connection


def connection_status(root: Path) -> dict:
    metadata = _metadata(root)
    try:
        _secure_backend()
        storage_available = True
    except Exception:
        storage_available = False
    try:
        connection = resolve_connection(root)
        credential_error = False
    except RuntimeError:
        connection = None
        credential_error = True
    return {
        "configured": connection is not None,
        "keyConfigured": connection is not None,
        "storageAvailable": storage_available,
        "credentialError": credential_error,
        "revision": connection.revision if connection else metadata.get("revision", "unconfigured"),
        "source": "saved" if metadata else "environment" if connection else "none",
        "provider": connection.provider if connection else metadata.get("provider", "openai"),
        "textModel": connection.text_model if connection else metadata.get("textModel", TEXT_MODELS[0]),
        "imageModel": connection.image_model if connection else metadata.get("imageModel", IMAGE_MODELS[0]),
        "audioModel": connection.audio_model if connection else metadata.get("audioModel", AUDIO_MODELS[0]),
        "maxRequestsPerDay": connection.max_requests_per_day if connection else 20,
        "maxConcurrentRequests": connection.max_concurrent_requests if connection else 1,
        "textModels": TEXT_MODELS,
        "imageModels": IMAGE_MODELS,
        "audioModels": AUDIO_MODELS,
    }


def save_connection(root: Path, data: ConnectionUpdate) -> dict:
    status = connection_status(root)
    if status["revision"] != data.expectedRevision:
        raise ValueError("The connection settings changed. Reload before saving.")
    try:
        backend = _secure_backend()
    except Exception:
        raise RuntimeError("A secure OS credential store is unavailable for this server account.") from None
    api_key = data.apiKey.get_secret_value().strip() if data.apiKey else ""
    if not api_key:
        previous = resolve_connection(root)
        if previous and previous.base_url != OPENAI_URL:
            raise ValueError("Enter an OpenAI API key when replacing a different provider.")
        api_key = previous.api_key if previous else ""
    if not api_key or any(character.isspace() for character in api_key) or len(api_key) > 512:
        raise ValueError("Provide a valid API key to configure the connection.")
    previous_metadata = _metadata(root)
    credential_id = uuid.uuid4().hex
    metadata = data.model_dump(exclude={"apiKey", "expectedRevision"})
    metadata.update({"revision": uuid.uuid4().hex, "credentialId": credential_id})
    try:
        backend.set_password(_service(root), credential_id, api_key)
        _atomic_json(root / "identity" / "ai-connection.json", metadata)
    except Exception:
        try:
            backend.delete_password(_service(root), credential_id)
        except Exception:
            pass
        raise RuntimeError("AI settings could not be saved securely.") from None
    if previous_metadata.get("credentialId"):
        try:
            backend.delete_password(_service(root), previous_metadata["credentialId"])
        except Exception:
            pass
    return connection_status(root)


def disconnect_connection(root: Path, expected_revision: str) -> dict:
    if connection_status(root)["revision"] != expected_revision:
        raise ValueError("The connection settings changed. Reload before disconnecting.")
    metadata = _metadata(root)
    if metadata.get("credentialId"):
        try:
            _secure_backend().delete_password(_service(root), metadata["credentialId"])
        except Exception:
            raise RuntimeError("The saved credential could not be removed from the secure store.") from None
    _atomic_json(root / "identity" / "ai-connection.json", {"disabled": True, "revision": uuid.uuid4().hex})
    return connection_status(root)


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, response, code, message, headers, new_url):
        return None


@contextmanager
def request_budget(connection: Connection) -> Iterator[None]:
    from .storage import storyboard_transaction

    identifier = str(connection.root.resolve())
    with _usage_lock, storyboard_transaction():
        if _active_requests.get(identifier, 0) >= connection.max_concurrent_requests:
            raise RuntimeError("The AI connection is busy. Try again after the current request finishes.")
        path = connection.root / "identity" / "ai-usage.json"
        usage = json.loads(path.read_text(encoding="utf-8")) if path.is_file() else {}
        today = datetime.now(timezone.utc).date().isoformat()
        count = usage.get("requests", 0) if usage.get("date") == today else 0
        if count >= connection.max_requests_per_day:
            raise RuntimeError("The daily AI request limit has been reached.")
        _atomic_json(path, {"date": today, "requests": count + 1})
        _active_requests[identifier] = _active_requests.get(identifier, 0) + 1
    try:
        yield
    finally:
        with _usage_lock:
            _active_requests[identifier] -= 1


def open_provider_request(connection: Connection, request: urllib.request.Request, timeout: int):
    return urllib.request.build_opener(NoRedirect()).open(request, timeout=timeout)


def test_connection(root: Path) -> dict[str, object]:
    connection = resolve_connection(root)
    if not connection:
        raise ValueError("Configure and save an AI connection before testing it.")
    if connection.base_url != OPENAI_URL:
        raise ValueError("Connection testing is available only for the approved OpenAI endpoint.")
    request = urllib.request.Request(OPENAI_URL + "/models", headers={"Authorization": "Bearer " + connection.api_key})
    try:
        with request_budget(connection), open_provider_request(connection, request, 10) as response:
            if response.status != 200:
                raise RuntimeError("The AI connection test failed.")
    except urllib.error.HTTPError as error:
        message = "The provider rejected the credential." if error.code in {401, 403} else "The provider did not accept the connection test."
        raise RuntimeError(message) from None
    except (urllib.error.URLError, TimeoutError, OSError):
        raise RuntimeError("The AI provider could not be reached securely.") from None
    return {"connected": True, "message": "Connection verified. Model access and generation costs depend on your provider account."}