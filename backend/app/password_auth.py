"""Operator-provisioned accounts and opaque, revocable browser sessions."""
import hashlib
import hmac
import json
import secrets
import time
from pathlib import Path

from fastapi import HTTPException, Request
from pydantic import BaseModel, Field, SecretStr

from .deployment import public_origin
from .platform import ActorContext, DurableEventSink, PlatformEvent, get_actor_context

COOKIE = "__Host-chimera-session"
SESSION_SECONDS = 8 * 60 * 60
ROLES = {"author", "reviewer", "instructional-designer", "administrator"}


class LoginRequest(BaseModel):
    email: str = Field(min_length=3, max_length=254)
    password: SecretStr = Field(min_length=1, max_length=1024)


class ResetPasswordRequest(BaseModel):
    token: SecretStr = Field(min_length=20, max_length=256)
    password: SecretStr = Field(min_length=15, max_length=1024)


class ReviewInvitationRequest(BaseModel):
    userId: str = Field(min_length=1, max_length=120)
    expiresHours: int = Field(default=72, ge=1, le=168)


def normalize_email(email: str) -> str:
    email = email.strip().casefold()
    if len(email) > 254 or email.count("@") != 1 or any(c.isspace() for c in email):
        raise ValueError("Enter a valid account email")
    local, domain = email.split("@")
    if not local or not domain or "." not in domain:
        raise ValueError("Enter a valid account email")
    return email


def password_digest(password: str, salt: str) -> str:
    return hashlib.scrypt(password.encode("utf-8"), salt=bytes.fromhex(salt), n=2**17, r=8, p=1, maxmem=256*1024*1024, dklen=32).hex()


def token_digest(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def require_origin(request: Request) -> None:
    if request.headers.get("origin") != public_origin():
        raise HTTPException(403, "Request origin is not allowed")


class AccountStore:
    def __init__(self, root: Path):
        self.path = root / "identity" / "accounts.json"

    def _read(self) -> dict:
        if not self.path.is_file():
            return {"accounts": {}, "sessions": {}, "failures": {}, "members": {}, "resets": {}, "reviews": {}}
        data = json.loads(self.path.read_text(encoding="utf-8"))
        for key in ("members", "resets", "reviews"):
            data.setdefault(key, {})
        return data

    def audit(self, name: str, user_id: str | None = None, project_id: str | None = None) -> None:
        actor = get_actor_context()
        DurableEventSink(self.path.parent.parent).record(PlatformEvent(eventName=name, eventClass="security", installationId=public_origin(),
            actorId=actor.actorId if actor.deploymentMode == "team" else (user_id if name.startswith("auth.") or name == "account.password_reset" else "deployment-operator"), projectId=project_id, deploymentMode="team",
            metadata={"targetUserId": user_id} if user_id else {}))

    def _write(self, data: dict) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        temporary = self.path.with_name(f".accounts-{secrets.token_hex(12)}.tmp")
        try:
            temporary.write_text(json.dumps(data), encoding="utf-8")
            temporary.chmod(0o600)
            # Windows scanners can briefly hold the destination open without
            # delete sharing. Keep the replacement atomic and retry that race.
            for attempt in range(6):
                try:
                    temporary.replace(self.path)
                    break
                except PermissionError:
                    if attempt == 5:
                        raise
                    time.sleep(0.02 * (attempt + 1))
        finally:
            temporary.unlink(missing_ok=True)

    def provision(self, email: str, password: str, display_name: str, roles: list[str]) -> str:
        from .storage import storyboard_transaction
        email = normalize_email(email)
        if not 15 <= len(password) <= 1024:
            raise ValueError("Password must contain 15 to 1024 characters")
        if not display_name.strip() or len(display_name) > 120 or not roles or not set(roles) <= ROLES:
            raise ValueError("Provide a display name and supported roles")
        salt = secrets.token_hex(16)
        digest = password_digest(password, salt)
        with storyboard_transaction():
            data = self._read()
            if email in data["accounts"]:
                raise ValueError("Account already exists")
            user_id = "user-" + secrets.token_hex(16)
            data["accounts"][email] = {"id": user_id, "displayName": display_name.strip(), "salt": salt, "passwordHash": digest, "roles": roles, "disabled": False}
            self._write(data)
            self.audit("account.provisioned", user_id)
        return user_id

    def login(self, email: str, password: str, client: str, old_token: str | None = None) -> str:
        from .storage import storyboard_transaction
        try:
            email = normalize_email(email)
        except ValueError:
            email = email.strip().casefold()
        now = time.time()
        keys = ["email:" + token_digest(email), "client:" + token_digest(client)]
        with storyboard_transaction():
            data = self._read()
            data["sessions"] = {k: v for k, v in data["sessions"].items() if v["expires"] > now}
            data["failures"] = {k: [t for t in ts if t > now-900] for k, ts in data["failures"].items() if any(t > now-900 for t in ts)}
            if any(len(data["failures"].get(k, [])) >= limit for k, limit in zip(keys, (5, 30))):
                raise HTTPException(429, "Too many sign-in attempts; try again later", headers={"Retry-After": "900"})
            account = data["accounts"].get(email)
            salt = account["salt"] if account else "00"*16
            candidate = password_digest(password, salt)
            valid = account and hmac.compare_digest(candidate, account["passwordHash"]) and not account["disabled"]
            if not valid:
                for key in keys:
                    data["failures"].setdefault(key, []).append(now)
                self._write(data)
                raise HTTPException(401, "Email or password is incorrect")
            if old_token:
                data["sessions"].pop(token_digest(old_token), None)
            token = secrets.token_urlsafe(32)
            data["sessions"][token_digest(token)] = {"userId": account["id"], "expires": now+SESSION_SECONDS, "origin": public_origin()}
            data["failures"].pop(keys[0], None)
            self._write(data)
            self.audit("auth.signed_in", account["id"])
            return token

    def account_for_token(self, token: str | None) -> dict:
        from .storage import storyboard_transaction
        with storyboard_transaction():
            data = self._read()
            session = data["sessions"].get(token_digest(token)) if token else None
            if session and session["expires"] > time.time() and session["origin"] == public_origin():
                for account in data["accounts"].values():
                    if account["id"] == session["userId"] and not account["disabled"]:
                        return account
        raise HTTPException(401, "Sign in to continue")

    def logout(self, token: str | None) -> None:
        from .storage import storyboard_transaction
        with storyboard_transaction():
            data = self._read()
            if token:
                session = data["sessions"].pop(token_digest(token), None)
                self._write(data)
                if session:
                    self.audit("auth.signed_out", session["userId"])

    def roles_for(self, user_id: str, project_id: str | None = None) -> set[str]:
        from .storage import storyboard_transaction
        with storyboard_transaction():
            data = self._read()
            for account in data["accounts"].values():
                if account["id"] == user_id and not account["disabled"]:
                    roles = set(account["roles"])
                    if project_id is None:
                        return roles
                    project_role = data["members"].get(project_id, {}).get(user_id)
                    return ({project_role} if project_role else set()) | ({"administrator"} if "administrator" in roles else set())
        return set()

    def accounts(self) -> list[dict]:
        from .storage import storyboard_transaction
        with storyboard_transaction():
            return [{"id": a["id"], "email": email, "displayName": a["displayName"], "roles": a["roles"], "disabled": a["disabled"]} for email, a in self._read()["accounts"].items()]

    def project_memberships(self, project_id: str) -> list:
        from .identity import ProjectMembership
        from .storage import storyboard_transaction
        with storyboard_transaction():
            return [ProjectMembership(projectId=project_id, userId=user, role=role) for user, role in self._read()["members"].get(project_id, {}).items()]

    def add_project_membership(self, membership):
        from .storage import storyboard_transaction
        with storyboard_transaction():
            data = self._read()
            if not any(a["id"] == membership.userId and not a["disabled"] for a in data["accounts"].values()):
                raise ValueError("Membership requires an active account")
            data["members"].setdefault(membership.projectId, {})[membership.userId] = membership.role
            self._write(data)
            self.audit("project.membership_changed", membership.userId, membership.projectId)
        return membership

    def remove_membership(self, project_id: str, user_id: str) -> None:
        from .storage import storyboard_transaction
        with storyboard_transaction():
            data = self._read()
            data["members"].get(project_id, {}).pop(user_id, None)
            self._write(data)
            self.audit("project.membership_removed", user_id, project_id)

    def change_account(self, email: str, *, disabled: bool | None = None, password: str | None = None) -> None:
        from .storage import storyboard_transaction
        if password is not None and not 15 <= len(password) <= 1024:
            raise ValueError("Password must contain 15 to 1024 characters")
        salt = secrets.token_hex(16)
        digest = password_digest(password, salt) if password is not None else None
        with storyboard_transaction():
            data = self._read()
            account = data["accounts"].get(normalize_email(email))
            if not account:
                raise ValueError("Account does not exist")
            if disabled is True and "administrator" in account["roles"] and not account["disabled"]:
                if not any(a["id"] != account["id"] and not a["disabled"] and "administrator" in a["roles"] for a in data["accounts"].values()):
                    raise ValueError("Cannot disable the last active administrator")
            if disabled is not None:
                account["disabled"] = disabled
            if digest:
                account.update(salt=salt, passwordHash=digest)
            data["sessions"] = {k: s for k, s in data["sessions"].items() if s["userId"] != account["id"]}
            data["resets"] = {k: s for k, s in data["resets"].items() if s["userId"] != account["id"]}
            self._write(data)
            self.audit("account.changed", account["id"])

    def issue_reset(self, email: str) -> str:
        from .storage import storyboard_transaction
        with storyboard_transaction():
            data = self._read()
            account = data["accounts"].get(normalize_email(email))
            if not account or account["disabled"]:
                raise ValueError("Account is not active")
            token = secrets.token_urlsafe(32)
            data["resets"] = {k: s for k, s in data["resets"].items() if s["userId"] != account["id"] and s["expires"] > time.time()}
            data["resets"][token_digest(token)] = {"userId": account["id"], "expires": time.time()+900, "origin": public_origin()}
            self._write(data)
            self.audit("account.reset_issued", account["id"])
            return token

    def reset_password(self, token: str, password: str) -> None:
        from .storage import storyboard_transaction
        if not 15 <= len(password) <= 1024:
            raise HTTPException(422, "Password must contain 15 to 1024 characters")
        with storyboard_transaction():
            data = self._read()
            reset = data["resets"].get(token_digest(token))
            if not reset or reset["expires"] <= time.time() or reset["origin"] != public_origin():
                raise HTTPException(400, "Reset link is invalid or expired")
            account = next((a for a in data["accounts"].values() if a["id"] == reset["userId"] and not a["disabled"]), None)
            if not account:
                raise HTTPException(400, "Reset link is invalid or expired")
            salt = secrets.token_hex(16)
            account.update(salt=salt, passwordHash=password_digest(password, salt))
            data["resets"] = {k: s for k, s in data["resets"].items() if s["userId"] != account["id"]}
            data["sessions"] = {k: s for k, s in data["sessions"].items() if s["userId"] != account["id"]}
            self._write(data)
            self.audit("account.password_reset", account["id"])

    def issue_review(self, project_id: str, user_id: str, revision: int, hours: int) -> dict:
        from .storage import storyboard_transaction
        with storyboard_transaction():
            if not self.roles_for(user_id, project_id):
                raise ValueError("Reviewer must already have access to this project")
            data = self._read()
            token = secrets.token_urlsafe(32)
            invite_id = "review-" + secrets.token_hex(16)
            expires = time.time()+hours*3600
            data["reviews"][token_digest(token)] = {"id": invite_id, "projectId": project_id, "userId": user_id, "revision": revision, "expires": expires, "origin": public_origin()}
            self._write(data)
            self.audit("review.link_created", user_id, project_id)
            return {"id": invite_id, "url": public_origin()+"/#review="+token, "expiresAt": expires, "sourceRevision": revision}

    def review_for_token(self, token: str, user_id: str) -> dict:
        from .storage import storyboard_transaction
        with storyboard_transaction():
            invite = self._read()["reviews"].get(token_digest(token))
            if not invite or invite["expires"] <= time.time() or invite["userId"] != user_id or invite["origin"] != public_origin() or not self.roles_for(user_id, invite["projectId"]):
                raise HTTPException(404, "Review link is unavailable or expired")
            return invite

    def revoke_review(self, project_id: str, invite_id: str) -> None:
        from .storage import storyboard_transaction
        with storyboard_transaction():
            data = self._read()
            data["reviews"] = {k: v for k, v in data["reviews"].items() if not (v["projectId"] == project_id and v["id"] == invite_id)}
            self._write(data)
            self.audit("review.link_revoked", project_id=project_id)

    def review_links(self, project_id: str) -> list[dict]:
        from .storage import storyboard_transaction
        with storyboard_transaction():
            return [{"id": v["id"], "userId": v["userId"], "expiresAt": v["expires"], "sourceRevision": v["revision"]} for v in self._read()["reviews"].values() if v["projectId"] == project_id and v["expires"] > time.time()]


class HostedAuthorizationPolicy:
    def __init__(self, store: AccountStore, installation):
        self.directory = store
        self.installation = installation

    def allows(self, context: ActorContext, action: str, project_id: str | None = None) -> bool:
        from .identity import RoleBasedAuthorizationPolicy
        if context.deploymentMode != "team" or context.installationId != public_origin():
            return False
        global_roles = self.directory.roles_for(context.actorId)
        if not global_roles:
            return False
        if action in {"workspace.view", "identity.self", "review.invitation"}:
            return True
        roles = self.directory.roles_for(context.actorId, project_id)
        if project_id and not self.installation.adminCanViewProjectContent and action not in {"project.membership.manage"}:
            roles.discard("administrator")
        required = {"author", "instructional-designer", "administrator"} if action in {"project.export", "review.share"} else RoleBasedAuthorizationPolicy.actionRoles.get(action, {"administrator"})
        return bool(roles & required)


class PasswordIdentityProvider:
    def __init__(self, store: AccountStore):
        self.store = store

    def resolve(self, request: Request) -> ActorContext:
        if request.method not in ("GET", "HEAD", "OPTIONS"):
            require_origin(request)
        account = self.store.account_for_token(request.cookies.get(COOKIE))
        return ActorContext(actorId=account["id"], actorDisplayName=account["displayName"], installationId=public_origin(), deploymentMode="team")
