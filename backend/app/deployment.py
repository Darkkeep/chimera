"""Installation profiles; hosted profiles never inherit anonymous local identity."""
import os
from urllib.parse import urlsplit

from .identity import OrganizationPolicy


def deployment_profile() -> str | None:
    value = os.environ.get("CHIMERA_DEPLOYMENT_PROFILE")
    if value not in (None, "local", "encarta", "darkrogue"):
        raise RuntimeError("Unknown CHIMERA_DEPLOYMENT_PROFILE")
    return value


def installation_policy(directory) -> OrganizationPolicy:
    profile = deployment_profile()
    stored = directory.policy()
    if profile is None:
        return stored
    if profile == "local":
        if stored.deploymentMode != "single-user" or stored.identityProvider != "local":
            raise RuntimeError("Local profile cannot override a team workspace")
        return stored
    return OrganizationPolicy.model_validate({
        **stored.model_dump(), "deploymentMode": "team",
        "identityProvider": "builtin" if profile == "darkrogue" else "encarta",
        "reviewAccess": os.environ.get("CHIMERA_REVIEW_ACCESS", "no-external-review") if profile == "darkrogue" else "no-external-review", "allowGuestReviewers": False,
    })


def public_origin() -> str:
    origin = os.environ.get("CHIMERA_PUBLIC_ORIGIN", "https://darkrogue.io")
    parsed = urlsplit(origin)
    if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password or parsed.path or parsed.query or parsed.fragment:
        raise RuntimeError("CHIMERA_PUBLIC_ORIGIN must be an HTTPS origin without a path")
    return origin


def cors_origins() -> list[str]:
    if deployment_profile() == "darkrogue":
        return [public_origin()]
    return ["http://localhost:5173", "http://127.0.0.1:5173"]
