"""Founder-controlled Chimera admission, independent of DARKROGUE authentication.

Fail closed: missing admission records do not grant access. The explicitly configured
founder email is admitted only when the authenticated Chimera account is an administrator.
"""
import json
import os
import secrets
from pathlib import Path

from .password_auth import AccountStore, normalize_email
from .storage import storyboard_transaction


class AdmissionStore:
    def __init__(self, root: Path):
        self.root = root
        self.path = root / "identity" / "admission.json"

    def _read(self) -> dict:
        if not self.path.exists():
            return {"approved": []}
        return json.loads(self.path.read_text(encoding="utf-8"))

    def _write(self, state: dict) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        pending = self.path.with_name(".admission-" + secrets.token_hex(8) + ".tmp")
        try:
            pending.write_text(json.dumps(state, indent=2), encoding="utf-8")
            pending.chmod(0o600)
            pending.replace(self.path)
        finally:
            pending.unlink(missing_ok=True)

    def admitted(self, actor_id: str) -> bool:
        accounts = AccountStore(self.root).accounts()
        account = next((a for a in accounts if a["id"] == actor_id and not a["disabled"]), None)
        if not account:
            return False
        email = normalize_email(account["email"])
        founder = os.environ.get("CHIMERA_FOUNDER_EMAIL", "").strip()
        if founder:
            try:
                if email == normalize_email(founder) and "administrator" in account["roles"]:
                    return True
            except ValueError:
                pass
        with storyboard_transaction():
            approved = self._read().get("approved", [])
        return email in approved

    def set_approved(self, email: str, approved: bool) -> None:
        email = normalize_email(email)
        with storyboard_transaction():
            state = self._read()
            allowed = set(state.get("approved", []))
            if approved:
                allowed.add(email)
            else:
                allowed.discard(email)
            state["approved"] = sorted(allowed)
            self._write(state)

    def list_approved(self) -> list[str]:
        with storyboard_transaction():
            return list(self._read().get("approved", []))
