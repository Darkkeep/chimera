import os
from typing import Protocol

from fastapi import HTTPException, Request

from .identity import IdentityDirectory, LocalIdentityDirectory
from .platform import ActorContext


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
        return self.directory.snapshot().actor


def get_identity_provider() -> IdentityProvider:
    from .storage import ROOT

    directory = LocalIdentityDirectory(ROOT)
    if directory.policy().identityProvider == "encarta":
        return EncartaIdentityProvider(directory)
    return LocalIdentityProvider(directory)


def resolve_actor_context(request: Request) -> ActorContext:
    try:
        return get_identity_provider().resolve(request)
    except RuntimeError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error