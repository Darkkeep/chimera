import base64
import hashlib
import hmac
import json
import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import patch
from uuid import uuid4

from fastapi.testclient import TestClient

from backend.app import darkrogue_auth, main, storage
from backend.app.darkrogue_auth import HandoffError, verify_handoff
from backend.app.password_auth import AccountStore, COOKIE

SECRET = "a-test-shared-secret-of-sufficient-length"
CHIMERA_ORIGIN = "https://chimera.darkrogue.io"
DARKROGUE_ORIGIN = "https://darkrogue.io"


def b64url(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode().rstrip("=")


def mint(secret: str = SECRET, **overrides) -> str:
    now = time.time()
    claims = {"iss": DARKROGUE_ORIGIN, "aud": CHIMERA_ORIGIN, "sub": "supabase-user-1",
              "name": "Dark Keep", "email": "darkkeep@gmail.com", "role": "ADMIN",
              "iat": now, "exp": now + 60, "jti": uuid4().hex}
    claims.update(overrides)
    claims = {key: value for key, value in claims.items() if value is not None}
    header = b64url(json.dumps({"alg": "HS256", "typ": "JWT"}).encode())
    payload = b64url(json.dumps(claims).encode())
    signature = b64url(hmac.new(secret.encode(), f"{header}.{payload}".encode(), hashlib.sha256).digest())
    return f"{header}.{payload}.{signature}"


class HandoffVerificationTests(unittest.TestCase):
    def setUp(self):
        self.enterContext(patch.dict("os.environ", {
            "CHIMERA_DEPLOYMENT_PROFILE": "darkrogue", "CHIMERA_PUBLIC_ORIGIN": CHIMERA_ORIGIN,
            "CHIMERA_DARKROGUE_SSO_SECRET": SECRET}))

    def test_valid_token_returns_bounded_claims(self):
        claims = verify_handoff(mint())
        self.assertEqual(claims["email"], "darkkeep@gmail.com")
        self.assertEqual(claims["role"], "ADMIN")
        self.assertEqual(claims["sub"], "supabase-user-1")

    def test_signature_issuer_audience_and_role_are_enforced(self):
        for token in (mint("a-different-secret-of-sufficient-length"),
                      mint(iss="https://evil.example"), mint(aud="https://evil.example"),
                      mint(role="SUPERUSER"), mint(role=None), mint(email=None), mint(jti=None),
                      "not-a-token", "a.b", mint() + "x"):
            with self.assertRaises(HandoffError):
                verify_handoff(token)

    def test_expired_future_and_overlong_lifetimes_are_rejected(self):
        now = time.time()
        for overrides in ({"exp": now - 1}, {"iat": now + 120}, {"iat": now, "exp": now + 16 * 60}):
            with self.assertRaises(HandoffError):
                verify_handoff(mint(**overrides))

    def test_unconfigured_secret_fails_closed(self):
        with patch.dict("os.environ", {"CHIMERA_DARKROGUE_SSO_SECRET": ""}):
            with self.assertRaisesRegex(HandoffError, "not configured"):
                verify_handoff(mint())


class DarkrogueSignInTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        for target in (storage, main):
            self.enterContext(patch.object(target, "ROOT", self.root))
        self.enterContext(patch.object(storage, "PROJECTS", self.root / "projects"))
        self.enterContext(patch.dict("os.environ", {
            "CHIMERA_DEPLOYMENT_PROFILE": "darkrogue", "CHIMERA_PUBLIC_ORIGIN": CHIMERA_ORIGIN,
            "CHIMERA_DARKROGUE_SSO_SECRET": SECRET}))
        self.store = AccountStore(self.root)
        self.client = TestClient(main.app, base_url=CHIMERA_ORIGIN)
        self.addCleanup(self.client.close)
        self.origin = {"Origin": CHIMERA_ORIGIN}

    def sign_in(self, token=None, **kwargs):
        return self.client.post("/api/auth/darkrogue", json={"token": token or mint(**kwargs)}, headers=self.origin)

    def test_config_reports_darkrogue_sign_in_urls_without_password_login(self):
        config = self.client.get("/api/auth/config").json()
        self.assertEqual(config["identityProvider"], "darkrogue")
        self.assertFalse(config["passwordLoginAvailable"])
        self.assertEqual(config["darkrogue"]["sessionUrl"], DARKROGUE_ORIGIN + "/api/chimera/session")
        self.assertIn("/sign-in?returnTo=https%3A%2F%2Fchimera.darkrogue.io%2F", config["darkrogue"]["signInUrl"])

    def test_admin_sign_in_provisions_account_with_mapped_roles_and_session(self):
        response = self.sign_in()
        self.assertEqual(response.status_code, 200)
        for flag in ("HttpOnly", "Secure", "SameSite=strict", "Path=/"):
            self.assertIn(flag, response.headers["set-cookie"])
        identity = self.client.get("/api/identity/context").json()
        self.assertEqual(identity["actor"]["actorDisplayName"], "Dark Keep")
        self.assertEqual(identity["policy"]["identityProvider"], "darkrogue")
        self.assertEqual({item["role"] for item in identity["memberships"]},
                         {"administrator", "author", "instructional-designer"})
        self.assertEqual(self.client.post("/api/projects", json={"title": "Hosted"}, headers=self.origin).status_code, 201)

    def test_handoff_token_is_one_time(self):
        token = mint()
        self.assertEqual(self.sign_in(token).status_code, 200)
        replay = self.sign_in(token)
        self.assertEqual(replay.status_code, 401)
        self.assertIn("already used", replay.json()["detail"])

    def test_signing_in_again_revokes_the_presented_session(self):
        self.assertEqual(self.sign_in().status_code, 200)
        previous = self.client.cookies.get(COOKIE)
        self.assertEqual(self.sign_in().status_code, 200)
        self.assertNotEqual(self.client.cookies.get(COOKIE), previous)
        self.assertEqual(self.client.get("/api/projects", headers={"Cookie": f"{COOKIE}={previous}"}).status_code, 401)

    def test_learner_maps_to_reviewer_without_project_creation(self):
        self.assertEqual(self.sign_in(sub="supabase-user-2", email="learner@example.com", name="Learner", role="LEARNER").status_code, 200)
        identity = self.client.get("/api/identity/context").json()
        self.assertEqual({item["role"] for item in identity["memberships"]}, {"reviewer"})
        self.assertEqual(self.client.post("/api/projects", json={"title": "Denied"}, headers=self.origin).status_code, 403)

    def test_roles_refresh_from_darkrogue_on_each_sign_in(self):
        self.sign_in()
        self.sign_in(role="LEARNER")
        identity = self.client.get("/api/identity/context").json()
        self.assertEqual({item["role"] for item in identity["memberships"]}, {"reviewer"})

    def test_existing_password_account_is_adopted_by_matching_email(self):
        password = "long test passphrase for hosted account"
        user_id = self.store.provision("darkkeep@gmail.com", password, "Darkkeep", ["administrator"])
        self.assertEqual(self.sign_in().status_code, 200)
        identity = self.client.get("/api/identity/context").json()
        self.assertEqual(identity["actor"]["actorId"], user_id)
        accounts = self.store._read()["accounts"]
        self.assertEqual(accounts["darkkeep@gmail.com"]["externalId"], "supabase-user-1")

    def test_mismatched_external_identity_and_disabled_accounts_are_rejected(self):
        self.assertEqual(self.sign_in().status_code, 200)
        conflicting = self.sign_in(sub="a-different-supabase-user")
        self.assertEqual(conflicting.status_code, 403)
        self.assertEqual(self.sign_in(sub="supabase-user-2", email="learner@example.com", name="Learner", role="LEARNER").status_code, 200)
        self.store.change_account("learner@example.com", disabled=True)
        denied = self.sign_in(sub="supabase-user-2", email="learner@example.com", name="Learner", role="LEARNER")
        self.assertEqual(denied.status_code, 403)
        self.assertEqual(self.client.get("/api/projects").status_code, 401)

    def test_password_login_and_reset_are_disabled_under_darkrogue(self):
        login = self.client.post("/api/auth/login", json={"email": "darkkeep@gmail.com", "password": "irrelevant-passphrase"}, headers=self.origin)
        self.assertEqual(login.status_code, 404)
        reset = self.client.post("/api/auth/reset-password", json={"token": "t" * 24, "password": "irrelevant-passphrase"}, headers=self.origin)
        self.assertEqual(reset.status_code, 404)

    def test_sso_only_account_has_no_usable_password(self):
        self.assertEqual(self.sign_in().status_code, 200)
        account = self.store._read()["accounts"]["darkkeep@gmail.com"]
        self.assertNotIn("passwordHash", account)
        with patch.dict("os.environ", {"CHIMERA_DEPLOYMENT_PROFILE": "networked"}):
            login = self.client.post("/api/auth/login", json={"email": "darkkeep@gmail.com", "password": ""}, headers=self.origin)
            self.assertNotEqual(login.status_code, 200)

    def test_origin_is_required_and_bad_tokens_do_not_create_accounts(self):
        no_origin = self.client.post("/api/auth/darkrogue", json={"token": mint()})
        self.assertEqual(no_origin.status_code, 403)
        bad = self.sign_in(mint("a-different-secret-of-sufficient-length"))
        self.assertEqual(bad.status_code, 401)
        self.assertEqual(self.store._read()["accounts"], {})

    def test_logout_revokes_darkrogue_session(self):
        self.assertEqual(self.sign_in().status_code, 200)
        token = self.client.cookies.get(COOKIE)
        self.assertEqual(self.client.post("/api/auth/logout", headers=self.origin).status_code, 200)
        self.assertEqual(self.client.get("/api/projects", headers={"Cookie": f"{COOKIE}={token}"}).status_code, 401)

    def test_networked_profile_rejects_darkrogue_endpoint(self):
        with patch.dict("os.environ", {"CHIMERA_DEPLOYMENT_PROFILE": "networked"}):
            self.assertEqual(self.sign_in().status_code, 404)


if __name__ == "__main__":
    unittest.main()
