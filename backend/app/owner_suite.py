"""Narrow DARKROGUE delegation for hosted Chimera project grants."""

import base64
import hashlib
import hmac
import os
import re
import time
from datetime import datetime, timezone
from typing import Literal
from uuid import UUID

from fastapi import HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field, ValidationError

from .deployment import public_origin
from .password_auth import AccountStore
from .platform import ActorContext, AuthorizationPolicy, DurableEventSink, PlatformEvent
from .storage import list_projects, read_project, storyboard_transaction


class OwnerAssertion(BaseModel):
    model_config = ConfigDict(extra="forbid")
    issuer: str
    audience: str
    actor: UUID
    action: Literal["list", "grant"]
    issuedAt: int = Field(strict=True)
    expiresAt: int = Field(strict=True)
    requestId: UUID | None = None
    project: str | None = Field(default=None, pattern=r"^[a-zA-Z0-9_-]{1,120}$")
    target: UUID | None = None
    role: Literal["reviewer", "author"] | None = None


def verify_assertion(request: Request, now: int | None = None) -> OwnerAssertion:
    key = os.environ.get("CHIMERA_OWNER_SUITE_SECRET", "")
    if len(key) < 32:
        raise HTTPException(404, "Owner Suite integration is disabled")
    authorization = request.headers.get("authorization", "")
    invalid = HTTPException(401, "Invalid Owner Suite assertion")
    if len(authorization) > 2048 or not authorization.startswith("Bearer "):
        raise invalid
    try:
        payload, signature = authorization.removeprefix("Bearer ").split(".")
        if not re.fullmatch(r"[A-Za-z0-9_-]+", payload) or not re.fullmatch(r"[A-Za-z0-9_-]+", signature):
            raise invalid
        expected = hmac.new(key.encode(), payload.encode("ascii"), hashlib.sha256).digest()
        presented = base64.urlsafe_b64decode(signature + "=" * (-len(signature) % 4))
        if not hmac.compare_digest(expected, presented):
            raise invalid
        assertion = OwnerAssertion.model_validate_json(base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4)))
    except (ValueError, UnicodeError, ValidationError) as error:
        raise invalid from error
    current = int(time.time()) if now is None else now
    grant_fields = (assertion.requestId, assertion.project, assertion.target, assertion.role)
    if (assertion.issuer != os.environ.get("CHIMERA_OWNER_SUITE_ISSUER", "https://darkrogue.io")
        or assertion.audience != public_origin() or assertion.issuedAt > current + 5
        or not current < assertion.expiresAt <= assertion.issuedAt + 60
        or (assertion.action == "grant" and not all(grant_fields))
        or (assertion.action == "list" and any(grant_fields))):
        raise invalid
    return assertion


def _linked_accounts(data: dict) -> dict:
    linked = {}
    ambiguous = set()
    for account in data["accounts"].values():
        external = account.get("externalId")
        if account.get("identityProvider") != "darkrogue" or not external:
            continue
        if external in linked:
            ambiguous.add(external)
        linked[external] = account
    return {external: account for external, account in linked.items() if external not in ambiguous and not account.get("disabled")}


def run_owner_action(assertion: OwnerAssertion, store: AccountStore, policy: AuthorizationPolicy) -> dict:
    with storyboard_transaction():
        data = store._read()
        accounts = _linked_accounts(data)
        operator = accounts.get(str(assertion.actor))
        if not operator:
            raise HTTPException(403, "Owner must have an active linked Chimera account")
        actor = ActorContext(actorId=operator["id"], actorDisplayName=operator["displayName"],
                             installationId=public_origin(), deploymentMode="team")
        if assertion.action == "list":
            if not policy.allows(actor, "project.membership.manage"):
                raise HTTPException(403, "Project membership permission required")
            projects = [{"id": project.id, "title": project.title} for project in list_projects()
                        if policy.allows(actor, "project.membership.manage", project.id)]
            return {"projects": projects, "linkedAccounts": sorted(accounts)}

        project_id = assertion.project
        if not policy.allows(actor, "project.membership.manage", project_id):
            raise HTTPException(403, "Project membership permission required")
        request_id = str(assertion.requestId)
        target_external_id = str(assertion.target)
        operation = {"actorId": actor.actorId, "targetExternalId": target_external_id, "projectId": project_id, "role": assertion.role}
        receipts = data.setdefault("ownerSuiteGrants", {})
        receipt = receipts.get(request_id)
        if receipt:
            if any(receipt.get(key) != value for key, value in operation.items()):
                raise HTTPException(409, "Request ID was used for a different operation")
            return {"outcome": receipt["outcome"]}
        target = accounts.get(target_external_id)
        if not target:
            raise HTTPException(422, "Target must have an active linked Chimera account")
        try:
            read_project(project_id)
        except FileNotFoundError as error:
            raise HTTPException(404, "Project not found") from error
        memberships = data["members"].setdefault(project_id, {})
        current_role = memberships.get(target["id"])
        if current_role is None:
            memberships[target["id"]] = assertion.role
            outcome = "granted"
        else:
            outcome = "unchanged" if current_role == assertion.role else "role_conflict"
        receipts[request_id] = {**operation, "targetId": target["id"], "outcome": outcome, "occurredAt": datetime.now(timezone.utc).isoformat()}
        store._write(data)

    # The receipt and membership are committed together. Mirror the result to the existing audit view.
    try:
        DurableEventSink(store.path.parent.parent).record(PlatformEvent(
            eventName="project.owner_suite_membership", eventClass="security", installationId=actor.installationId,
            actorId=actor.actorId, projectId=project_id, deploymentMode="team", correlationId=request_id,
            metadata={"targetUserId": target["id"], "role": assertion.role, "outcome": outcome},
        ))
    except OSError:
        # The source-of-truth audit receipt remains in the account store.
        pass
    return {"outcome": outcome}
