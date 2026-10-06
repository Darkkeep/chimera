import json
import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

from backend.app import main, storage
from backend.app.auth import get_identity_provider
from backend.app.identity import LocalIdentityDirectory, OrganizationPolicy
from backend.app.password_auth import AccountStore, COOKIE, token_digest


class PasswordAuthTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        for target in (storage, main):
            self.enterContext(patch.object(target, "ROOT", self.root))
        self.enterContext(patch.object(storage, "PROJECTS", self.root / "projects"))
        self.enterContext(patch.dict("os.environ", {"CHIMERA_DEPLOYMENT_PROFILE": "darkrogue", "CHIMERA_PUBLIC_ORIGIN": "https://darkrogue.io"}))
        self.store = AccountStore(self.root)
        self.password = "long test passphrase for hosted account"
        self.user_id = self.store.provision("author@example.com", self.password, "Hosted Author", ["administrator", "author"])
        self.client = TestClient(main.app, base_url="https://darkrogue.io")
        self.addCleanup(self.client.close)
        self.origin = {"Origin": "https://darkrogue.io"}

    def login(self, **kwargs):
        return self.client.post("/api/auth/login", json={"email": "AUTHOR@example.com", "password": self.password}, headers=self.origin, **kwargs)

    def test_login_identity_and_logout_revoke_session(self):
        self.assertEqual(self.client.get("/api/projects").status_code, 401)
        response = self.login()
        self.assertEqual(response.status_code, 200)
        cookie = response.headers["set-cookie"]
        for flag in ("HttpOnly", "Secure", "SameSite=strict", "Path=/"):
            self.assertIn(flag, cookie)
        token = self.client.cookies.get(COOKIE)
        data = self.store._read()
        self.assertNotIn(token, json.dumps(data))
        self.assertIn(token_digest(token), data["sessions"])
        identity = self.client.get("/api/identity/context").json()
        self.assertEqual(identity["actor"]["actorId"], self.user_id)
        self.assertEqual(identity["policy"]["identityProvider"], "builtin")
        self.assertEqual(self.client.get("/api/projects").status_code, 200)
        self.assertEqual(self.client.post("/api/auth/logout", headers=self.origin).status_code, 200)
        self.assertEqual(self.client.get("/api/projects", headers={"Cookie": f"{COOKIE}={token}"}).status_code, 401)

    def test_bad_credentials_and_account_lookup_share_error(self):
        a = self.client.post("/api/auth/login", json={"email": "author@example.com", "password": "wrong"}, headers=self.origin)
        b = self.client.post("/api/auth/login", json={"email": "missing@example.com", "password": "wrong"}, headers=self.origin)
        self.assertEqual((a.status_code, a.json()), (b.status_code, b.json()))
        self.assertEqual(a.status_code, 401)
        self.assertNotIn(self.password, self.store.path.read_text())

    def test_login_and_mutation_require_exact_origin(self):
        self.assertEqual(self.client.post("/api/auth/login", json={"email": "author@example.com", "password": self.password}).status_code, 403)
        self.assertEqual(self.login().status_code, 200)
        for origin in ({}, {"Origin": "https://other.darkrogue.io"}):
            self.assertEqual(self.client.post("/api/projects", json={"title": "Forbidden"}, headers=origin).status_code, 403)
        self.assertEqual(self.client.post("/api/projects", json={"title": "Allowed"}, headers=self.origin).status_code, 201)

    def test_rate_limit_and_expiration(self):
        for _ in range(5):
            self.assertEqual(self.client.post("/api/auth/login", json={"email": "author@example.com", "password": "wrong"}, headers=self.origin).status_code, 401)
        self.assertEqual(self.login().status_code, 429)
        with patch("backend.app.password_auth.time.time", return_value=time.time()+901):
            self.assertEqual(self.login().status_code, 200)
        with patch("backend.app.password_auth.time.time", return_value=time.time()+36000):
            self.assertEqual(self.client.get("/api/projects").status_code, 401)

    def test_relogin_rotates_and_revokes_previous_token(self):
        self.login()
        old = self.client.cookies.get(COOKIE)
        self.login()
        new = self.client.cookies.get(COOKIE)
        self.assertNotEqual(old, new)
        self.assertNotIn(token_digest(old), self.store._read()["sessions"])

    def test_disabled_user_cannot_use_existing_session(self):
        self.login()
        data = self.store._read()
        data["accounts"]["author@example.com"]["disabled"] = True
        self.store._write(data)
        self.assertEqual(self.client.get("/api/projects").status_code, 401)

    def test_non_admin_account_cannot_access_projects_yet(self):
        self.store.provision("reviewer@example.com", self.password, "Reviewer", ["reviewer"])
        self.client.post("/api/auth/login", json={"email": "reviewer@example.com", "password": self.password}, headers=self.origin)
        self.assertEqual(self.client.get("/api/projects").status_code, 403)

    def test_hosted_profile_cannot_be_downgraded_from_api(self):
        self.login()
        self.assertEqual(self.client.patch("/api/identity/policy", json=OrganizationPolicy().model_dump(), headers=self.origin).status_code, 409)

    def test_login_validation_never_echoes_password(self):
        secret = "secret-value"*100
        response = self.client.post("/api/auth/login", json={"email": "author@example.com", "password": secret}, headers=self.origin)
        self.assertEqual(response.status_code, 422)
        self.assertNotIn(secret, response.text)
        self.assertEqual(response.headers["cache-control"], "no-store")

    def test_auth_discovery_is_public_and_has_no_credentials(self):
        response = self.client.get("/api/auth/config")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"deploymentMode": "team", "identityProvider": "builtin", "passwordLoginAvailable": True})

    def test_encarta_remains_closed_even_with_endpoint(self):
        with patch.dict("os.environ", {"CHIMERA_DEPLOYMENT_PROFILE": "encarta", "CHIMERA_ENCARTA_URL": "https://encarta.example"}):
            response = self.client.get("/api/projects")
        self.assertEqual(response.status_code, 503)
        self.assertIn("validation", response.json()["detail"])

    def test_unimplemented_providers_do_not_fall_back_to_local(self):
        for name in ("oidc", "saml", "adapter"):
            LocalIdentityDirectory(self.root).update_policy(OrganizationPolicy(deploymentMode="team", identityProvider=name))
            with patch.dict("os.environ", {"CHIMERA_DEPLOYMENT_PROFILE": ""}):
                # Empty is invalid, so remove the setting to use stored policy.
                import os
                del os.environ["CHIMERA_DEPLOYMENT_PROFILE"]
                with self.assertRaisesRegex(RuntimeError, "not implemented"):
                    get_identity_provider().resolve(None)
