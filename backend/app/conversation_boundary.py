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


def validate_candidate_authoring_scope(
    request: dict,
    binding: AuthoringBinding,
    authorize: Authorize,
    *,
    policy_revision: str,
) -> None:
    """Bind a schema/semantics-qualified public 1.2.0 candidate to local state.

    This checks authoring scope only. Schema, canonical digests, citations and
    operation lifecycle must also pass public contract validation before use.
    Project/scene revisions stay in trusted local session state; this candidate
    has no project/scene wire fields. It supports text snapshots and no exports.
    """
    authorize_binding(binding, authorize)
    _identifier(policy_revision)
    expected_scope = dict(tenant_id=binding.tenant_id, consumer_id=binding.consumer,
                          actor_id=binding.actor_id, session_id=binding.session_id,
                          policy_revision=policy_revision)
    if request.get("scope") != expected_scope:
        raise ValueError("Candidate request does not match authorized authoring scope")
    context = request.get("context")
    if not isinstance(context, dict) or not isinstance(context.get("source_snapshots"), list):
        raise ValueError("Candidate source snapshots are unavailable")
    sources = context["source_snapshots"]
    identities = []
    for source in sources:
        if not isinstance(source, dict) or source.get("media_type") != "text/plain":
            raise ValueError("Candidate supports qualified text snapshots only")
        identities.append(SourceIdentity(source.get("source_id"), source.get("version"),
                                         source.get("content_sha256")))
    if len({s.source_id for s in identities}) != len(identities):
        raise ValueError("Candidate source IDs must be unique for the authoring binding")
    if set(identities) != set(binding.sources):
        raise ValueError("Candidate sources differ from authorized authoring sources")
    if request.get("requested_outputs") != []:
        raise ValueError("Candidate does not support generated authoring files")
