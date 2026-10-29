"""Installation-local endpoint preference; credentials remain server-managed."""
import json
import os
from pathlib import Path
from urllib.parse import urlsplit
from uuid import uuid4

from pydantic import BaseModel, ConfigDict, Field


class LocalEngineConnection(BaseModel):
    model_config = ConfigDict(extra="forbid")
    baseUrl: str = Field(min_length=1, max_length=200)


def local_engine_url(value: str) -> str:
    try:
        parsed = urlsplit(value.strip())
        valid = parsed.scheme == "http" and parsed.hostname in {"127.0.0.1", "localhost", "::1"} and parsed.port and not parsed.username and not parsed.password and parsed.path in {"", "/"} and not parsed.query and not parsed.fragment
    except ValueError:
        valid = False
    if not valid:
        raise ValueError("Use an HTTP loopback address with an explicit port, such as http://127.0.0.1:8001")
    return value.strip().rstrip("/")


def configured_engine_url(root: Path) -> str:
    environment = os.environ.get("CHIMERA_PYTHIA_BASE_URL", "").strip()
    if environment:
        return environment
    path = root / "pythia-connection.json"
    if path.exists():
        return local_engine_url(json.loads(path.read_text(encoding="utf-8"))["baseUrl"])
    return "http://127.0.0.1:8001"


def save_engine_url(root: Path, value: str) -> None:
    if os.environ.get("CHIMERA_PYTHIA_BASE_URL", "").strip():
        raise ValueError("Pythia's address is managed by CHIMERA_PYTHIA_BASE_URL. Update the backend environment instead.")
    value = local_engine_url(value)
    root.mkdir(parents=True, exist_ok=True)
    target = root / "pythia-connection.json"
    temporary = root / f".pythia-connection-{uuid4().hex}.tmp"
    temporary.write_text(json.dumps({"baseUrl": value}), encoding="utf-8")
    temporary.replace(target)
