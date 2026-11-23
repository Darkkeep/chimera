"""Non-sensitive build provenance. No runtime git guesses and no credential exposure."""
import os
import re
from datetime import datetime, timezone
from .version import __version__

_SHA = re.compile(r"^[0-9a-fA-F]{7,40}$")
_STAMP = re.compile(r"^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$")
_LABEL = re.compile(r"^[A-Za-z0-9_.+/-]{1,80}$")

def _sha(name: str) -> str | None:
    value = os.environ.get(name, "").strip()
    return value.lower() if _SHA.fullmatch(value) else None

def _stamp(name: str) -> str | None:
    value = os.environ.get(name, "").strip()
    if not _STAMP.fullmatch(value):
        return None
    try:
        datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(timezone.utc)
        return value
    except ValueError:
        return None

def _label(name: str) -> str | None:
    value = os.environ.get(name, "").strip()
    return value if _LABEL.fullmatch(value) else None

def runtime_build_information() -> dict[str, object]:
    """Deployment owner supplies immutable build values; unknown is explicit."""
    return {
        "version": __version__ if __version__ else None,
        "backend": {
            "gitSha": _sha("CHIMERA_BUILD_SHA"),
            "builtAt": _stamp("CHIMERA_BUILD_TIMESTAMP"),
        },
        "frontend": {
            "gitSha": _sha("CHIMERA_FRONTEND_BUILD_SHA"),
            "builtAt": _stamp("CHIMERA_FRONTEND_BUILD_TIMESTAMP"),
        },
        "environment": _label("CHIMERA_BUILD_ENVIRONMENT"),
        "pythiaContractVersion": _label("CHIMERA_PYTHIA_CONTRACT_VERSION"),
    }
