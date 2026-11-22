"""Online DARKROGUE authority. Sessions identify users; they do not freeze permissions.

No positive-permission cache. Failed checks deny, including background actor checks.
Local deployments and the separate founder admission restriction remain unchanged.
"""
import json
import hashlib
import hmac
import os
import re
import urllib.request

from fastapi import HTTPException

from .deployment import darkrogue_origin, deployment_profile


def enabled() -> bool:
    profile = deployment_profile()
    if profile is not None:
        return profile == "darkrogue"
    from .identity import LocalIdentityDirectory
    from .storage import ROOT
    directory = LocalIdentityDirectory(ROOT)
    return directory.path.exists() and directory.policy().identityProvider == "darkrogue"


def fetch_access(subject: str, project_id: str | None = None, *, acknowledge: int | None = None) -> dict:
    secret = os.environ.get("CHIMERA_ACCESS_ADAPTER_KEY")
    if secret is None:
        sso_secret = os.environ.get("CHIMERA_DARKROGUE_SSO_SECRET", "")
        secret = hmac.new(sso_secret.encode(), b"darkrogue:access-adapter:chimera:v1", hashlib.sha256).hexdigest() if len(sso_secret) >= 32 else ""
    if len(secret) < 32:
        raise HTTPException(503, "Shared access authority is not configured")
    if not re.fullmatch(r"[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}", subject):
        raise HTTPException(403, "A verified DARKROGUE identity link is required")
    if project_id is not None and not re.fullmatch(r"[a-zA-Z0-9_-]{1,120}", project_id):
        raise HTTPException(403, "Invalid project scope")
    try:
        origin = darkrogue_origin()
    except RuntimeError as error:
        raise HTTPException(503, "Invalid shared access authority configuration") from error
    payload = {"subject": subject, "scope": "project:" + project_id if project_id else "*"}
    if acknowledge is not None:
        payload.update(action="acknowledge", revision=acknowledge)
    body = json.dumps(payload).encode()
    request = urllib.request.Request(origin + "/api/internal/access", data=body, method="POST",
        headers={"Authorization": "Bearer " + secret, "X-Access-App": "chimera", "Content-Type": "application/json"})

    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, *_args):
            return None

    try:
        with urllib.request.build_opener(NoRedirect()).open(request, timeout=5) as response:
            raw = response.read(32769)
        if len(raw) > 32768:
            raise ValueError("Oversized authority response")
        result = json.loads(raw)
        if acknowledge is not None:
            if result.get("acknowledged") is not True or result.get("revision") != acknowledge:
                raise ValueError("Invalid acknowledgement")
            return result
        if (result.get("schemaVersion") != 1 or result.get("appId") != "chimera"
            or result.get("subject") != subject or result.get("scope") != ("project:" + project_id if project_id else "*")
            or type(result.get("scopeManaged")) is not bool
            or type(result.get("allowed")) is not bool or type(result.get("revision")) is not int
            or result["revision"] < 0 or not isinstance(result.get("capabilities"), list)
            or not all(isinstance(c, str) for c in result["capabilities"])):
            raise ValueError("Invalid authority response")
        return result
    except Exception as error:
        # Never echo tokens, remote response bodies, or credential-bearing request objects.
        raise HTTPException(503, "Current access could not be verified. Try again shortly.") from error


def acknowledge_revision(subject: str, revision: int) -> None:
    try:
        fetch_access(subject, acknowledge=revision)
    except HTTPException:
        pass  # Delivery remains pending. Every access decision still requires an online check.


def account_access(store, user_id: str, project_id: str | None = None) -> dict:
    from .storage import storyboard_transaction
    with storyboard_transaction():
        account = next((dict(a) for a in store._read()["accounts"].values() if a["id"] == user_id), None)
    if not account or account.get("disabled") or account.get("identityProvider") != "darkrogue":
        raise HTTPException(403, "Active linked DARKROGUE account required")
    decision = fetch_access(account.get("externalId", ""), project_id)
    denied = not decision["allowed"] or "app.use" not in decision["capabilities"]
    with storyboard_transaction():
        data = store._read()
        current = next((a for a in data["accounts"].values() if a["id"] == user_id), None)
        if not current or current.get("disabled") or current.get("externalId") != account.get("externalId"):
            raise HTTPException(403, "Account link changed")
        if decision["revision"] < current.get("centralAccessRevision", -1):
            raise HTTPException(503, "Access changed during this request; retry")
        current["centralAccessRevision"] = decision["revision"]
        # Only application-wide results update organization roles. Project results are ceilings.
        if denied and project_id is None:
            data["sessions"] = {key: session for key, session in data["sessions"].items() if session["userId"] != user_id}
            store._write(data)
        elif not denied and project_id is None:
            roles = roles_for_capabilities(decision["capabilities"])
            if current.get("roles") != roles or account.get("centralAccessRevision") != decision["revision"]:
                current["roles"] = roles
                store._write(data)
        elif account.get("centralAccessRevision") != decision["revision"]:
            store._write(data)
    if account.get("centralAccessRevision") != decision["revision"]:
        acknowledge_revision(account["externalId"], decision["revision"])
    if denied:
        raise HTTPException(403, "Your access has been restricted by the owner")
    return decision


def roles_for_capabilities(capabilities: list[str]) -> list[str]:
    roles = ["reviewer"]
    if "author" in capabilities:
        roles.extend(["author", "instructional-designer"])
    if "administration" in capabilities:
        roles.append("administrator")
    return roles


def permits_action(capabilities: list[str], action: str) -> bool:
    if action in {"workspace.view", "identity.self", "identity.view", "review.invitation", "project.view", "project.metadata.view", "project.list"}:
        return "app.use" in capabilities
    if action in {"review.comment.create", "review.reply.create", "review.comment.resolve"}:
        return "review" in capabilities
    if action in {"project.export", "review.share"}:
        return "export" in capabilities
    if action in {"admin.policy.manage", "admin.audit.view", "admin.accounts.manage"} or action == "project.membership.manage":
        return "administration" in capabilities
    from .identity import RoleBasedAuthorizationPolicy
    # Unknown actions never inherit the old administrator fallback.
    return action in RoleBasedAuthorizationPolicy.actionRoles and "author" in capabilities


def require_job_access(actor_id: str | None, project_id: str, action: str) -> None:
    if not enabled():
        return
    if not actor_id:
        raise HTTPException(403, "This queued job has no verified initiating actor")
    from .deployment import installation_policy, public_origin
    from .identity import LocalIdentityDirectory
    from .password_auth import AccountStore, HostedAuthorizationPolicy
    from .platform import ActorContext
    from .storage import ROOT
    policy = HostedAuthorizationPolicy(AccountStore(ROOT), installation_policy(LocalIdentityDirectory(ROOT)))
    actor = ActorContext(actorId=actor_id, installationId=public_origin(), deploymentMode="team",
                         actorDisplayName="Queued job")
    if not policy.allows(actor, action, project_id):
        raise HTTPException(403, "The initiating actor no longer has permission for this job")
