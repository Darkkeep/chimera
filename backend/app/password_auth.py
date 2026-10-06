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
from .platform import ActorContext

COOKIE = "__Host-chimera-session"
SESSION_SECONDS = 8 * 60 * 60
ROLES = {"author", "reviewer", "instructional-designer", "administrator"}


class LoginRequest(BaseModel):
    email: str = Field(min_length=3, max_length=254)
    password: SecretStr = Field(min_length=1, max_length=1024)


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
            return {"accounts": {}, "sessions": {}, "failures": {}}
        return json.loads(self.path.read_text(encoding="utf-8"))

    def _write(self, data: dict) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        temporary = self.path.with_name(f".accounts-{secrets.token_hex(12)}.tmp")
        temporary.write_text(json.dumps(data), encoding="utf-8")
        temporary.chmod(0o600)
        temporary.replace(self.path)

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
                data["sessions"].pop(token_digest(token), None)
                self._write(data)

    def roles_for(self, user_id: str, project_id: str | None = None) -> set[str]:
        # Initial hosted access is restricted to operator-created administrators.
        # Project-scoped membership will be added before collaboration is enabled.
        from .storage import storyboard_transaction
        with storyboard_transaction():
            for account in self._read()["accounts"].values():
                if account["id"] == user_id and not account["disabled"]:
                    roles = set(account["roles"])
                    return roles if "administrator" in roles else set()
        return set()


class PasswordIdentityProvider:
    def __init__(self, store: AccountStore):
        self.store = store

    def resolve(self, request: Request) -> ActorContext:
        if request.method not in ("GET", "HEAD", "OPTIONS"):
            require_origin(request)
        account = self.store.account_for_token(request.cookies.get(COOKIE))
        return ActorContext(actorId=account["id"], actorDisplayName=account["displayName"], installationId=public_origin(), deploymentMode="team")
