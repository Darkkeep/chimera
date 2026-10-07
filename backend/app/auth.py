import os
from typing import Protocol
from datetime import datetime, timezone
from pydantic import BaseModel

from fastapi import HTTPException, Request

from .identity import IdentityDirectory, LocalIdentityDirectory
from .platform import ActorContext
from .deployment import installation_policy


class IdentityProvider(Protocol):
    def resolve(self, request: Request) -> ActorContext:
        ...


class EncartaIdentityProvider:
    """Fail-closed Encarta seam until Encarta's token contract is configured."""

    def __init__(self, directory: IdentityDirectory, endpoint: str | None = None) -> None:
        self.directory = directory
        self.endpoint = endpoint or os.environ.get("CHIMERA_ENCARTA_URL")

    def resolve(self, request: Request) -> ActorContext:
        del request
        if not self.endpoint:
            raise RuntimeError("Encarta identity is selected, but CHIMERA_ENCARTA_URL is not configured")
        raise RuntimeError("Encarta identity validation is not configured for this deployment")


class LocalIdentityProvider:
    def __init__(self, directory: IdentityDirectory) -> None:
        self.directory = directory

    def resolve(self, request: Request) -> ActorContext:
        del request
        snapshot = self.directory.snapshot()
        if snapshot.policy.deploymentMode != "single-user" or snapshot.actor.deploymentMode != "single-user":
            raise RuntimeError("Local identity is available only in single-user deployments")
        if snapshot.user.status != "active" or snapshot.user.id != snapshot.actor.actorId:
            raise RuntimeError("Local actor must be an active installation user")
        return snapshot.actor


class AuthenticatedSession(BaseModel):
    actor: ActorContext
    expiresAt: datetime


class SessionAdapter(Protocol):
    def authenticate(self, request: Request) -> AuthenticatedSession:
        """Validate provider signature, issuer, audience and revocation before returning."""
        ...


_session_adapter: SessionAdapter | None = None


def configure_session_adapter(adapter: SessionAdapter | None) -> None:
    """Installation startup hook; never accepts an adapter from an HTTP request."""
    global _session_adapter
    _session_adapter = adapter


class AdapterIdentityProvider:
    def __init__(self, directory: IdentityDirectory, adapter: SessionAdapter) -> None:
        self.directory, self.adapter = directory, adapter

    def resolve(self, request: Request) -> ActorContext:
        session = self.adapter.authenticate(request)
        snapshot = self.directory.snapshot()
        actor = session.actor
        if session.expiresAt.tzinfo is None or session.expiresAt <= datetime.now(timezone.utc):
            raise HTTPException(status_code=401, detail="Session expired or invalid")
        if snapshot.policy.deploymentMode != "team" or actor.deploymentMode != "team" or actor.installationId != snapshot.actor.installationId:
            raise HTTPException(status_code=403, detail="Session installation does not match deployment")
        user = next((item for item in [snapshot.user, *snapshot.users] if item.id == actor.actorId), None)
        if user is None or user.status != "active":
            raise HTTPException(status_code=403, detail="Installation user is unavailable")
        return actor.model_copy(update={"actorDisplayName": user.displayName})


class UnconfiguredIdentityProvider:
    def __init__(self, name: str) -> None:
        self.name = name

    def resolve(self, request: Request) -> ActorContext:
        raise RuntimeError(f"{self.name} identity validation is not implemented for this deployment")


def get_identity_provider() -> IdentityProvider:
    from .storage import ROOT

    directory = LocalIdentityDirectory(ROOT)
    policy = installation_policy(directory)
    if policy.tenancyMode != "single-organization":
        raise RuntimeError("Only single-organization deployments are implemented")
    if policy.deploymentMode == "team" and (policy.allowGuestReviewers or policy.reviewAccess == "invited-guests"):
        raise RuntimeError("Guest review is not enabled for the team pilot")
    if policy.identityProvider == "encarta":
        return EncartaIdentityProvider(directory)
    if policy.identityProvider == "builtin":
        from .password_auth import AccountStore, PasswordIdentityProvider
        return PasswordIdentityProvider(AccountStore(ROOT))
    if policy.identityProvider == "local" and policy.deploymentMode == "single-user":
        return LocalIdentityProvider(directory)
    if policy.identityProvider == "adapter" and _session_adapter is not None:
        return AdapterIdentityProvider(directory, _session_adapter)
    return UnconfiguredIdentityProvider(policy.identityProvider)


def resolve_actor_context(request: Request) -> ActorContext:
    if getattr(request.state, "actor", None) is not None:
        return request.state.actor
    try:
        return get_identity_provider().resolve(request)
    except RuntimeError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error
