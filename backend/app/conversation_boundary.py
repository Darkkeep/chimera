"""Internal authoring checks; these types are not a public exchange or auth service.

Callers must supply a trusted current authorization decision and server-loaded
scene/source state. Never construct those dependencies from a returned model answer.
No function here reads private source bytes, persists a scene, or permits an edit.
"""

from dataclasses import dataclass
import re
from typing import Callable


def _identifier(value: str) -> None:
    if not isinstance(value, str) or not value.strip():
        raise ValueError("Binding identifiers must be non-empty strings")


@dataclass(frozen=True)
class SourceIdentity:
    source_id: str
    version: str
    sha256: str

    def __post_init__(self) -> None:
        _identifier(self.source_id)
        _identifier(self.version)
        if not isinstance(self.sha256, str) or not re.fullmatch(r"[0-9a-f]{64}", self.sha256):
            raise ValueError("Source SHA-256 must be 64 lowercase hexadecimal characters")


@dataclass(frozen=True)
class AuthoringBinding:
    tenant_id: str
    actor_id: str
    session_id: str
    project_id: str
    scene_id: str
    scene_revision: str
    sources: tuple[SourceIdentity, ...]
    consumer: str = "chimera"

    def __post_init__(self) -> None:
        for value in (self.tenant_id, self.actor_id, self.session_id, self.project_id,
                      self.scene_id, self.scene_revision):
            _identifier(value)
        if self.consumer != "chimera":
            raise ValueError("Authoring consumer must be chimera")
        if not isinstance(self.sources, tuple) or any(not isinstance(s, SourceIdentity) for s in self.sources):
            raise ValueError("Sources must be immutable source identities")
        if len({s.source_id for s in self.sources}) != len(self.sources):
            raise ValueError("Source IDs must be unique")


# Trusted server-side policy callback: tenant, actor, consumer, resource kind, ID.
Authorize = Callable[[str, str, str, str, str], bool]


def authorize_binding(binding: AuthoringBinding, authorize: Authorize) -> None:
    """Recheck every resource; an ID or returned attestation alone grants nothing."""
    resources = [("session", binding.session_id), ("project", binding.project_id),
                 ("scene", binding.scene_id)]
    resources.extend(("source", source.source_id) for source in binding.sources)
    for kind, resource_id in resources:
        if authorize(binding.tenant_id, binding.actor_id, binding.consumer, kind, resource_id) is not True:
            raise PermissionError("Conversation source or return scope is unavailable")


def validate_advice_return(
    submitted: AuthoringBinding,
    returned: AuthoringBinding,
    current: AuthoringBinding,
    authorize: Authorize,
    *,
    applies_storyboard_edit: bool,
) -> None:
    """Validate local provenance, fresh access and unchanged scene/source state.

    `current` must be freshly loaded from trusted authoring storage. This guard is
    not wired to an HTTP adapter and does not validate a public answer schema.
    """
    if applies_storyboard_edit is not False:
        raise ValueError("Conversation advice cannot apply a storyboard edit")
    # Reauthorize before revealing mismatch details about private authoring state.
    authorize_binding(submitted, authorize)
    if returned != submitted:
        raise ValueError("Returned advice does not match the submitted authoring binding")
    if current != submitted:
        raise ValueError("Authoring scope, scene revision or source identity changed")
