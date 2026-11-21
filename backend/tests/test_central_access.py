import json
import os
import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import patch
from uuid import uuid4

from fastapi import HTTPException
from starlette.requests import Request

from backend.app import central_access, storage
from backend.app.identity import OrganizationPolicy
from backend.app.password_auth import AccountStore, COOKIE, HostedAuthorizationPolicy, PasswordIdentityProvider
from backend.app.platform import ActorContext


class AuthorityResponseTests(unittest.TestCase):
    def test_missing_configuration_and_malformed_or_misbound_decisions_deny(self):
        subject = str(uuid4())
        with patch.dict(os.environ, {"CHIMERA_ACCESS_ADAPTER_KEY": ""}):
            with self.assertRaises(HTTPException) as denied:
                central_access.fetch_access(subject)
            self.assertEqual(denied.exception.status_code, 503)
        valid = {"schemaVersion": 1, "appId": "chimera", "subject": subject, "scope": "*",
                 "allowed": True, "revision": 2, "scopeManaged": False, "capabilities": ["app.use"]}
        with patch.dict(os.environ, {"CHIMERA_ACCESS_ADAPTER_KEY": "x" * 32,
                                     "CHIMERA_DARKROGUE_ORIGIN": "https://authority.example.test"}), \
                patch("urllib.request.build_opener") as transport:
            response = transport.return_value.open.return_value.__enter__.return_value
            response.read.return_value = json.dumps(valid).encode()
            self.assertEqual(central_access.fetch_access(subject), valid)
            for changed in ({"subject": str(uuid4())}, {"scope": "project:other"}, {"revision": True},
                            {"scopeManaged": "false"}, {"appId": "other"}, {"allowed": 1}):
                with self.subTest(changed=changed), self.assertRaises(HTTPException) as denied:
                    response.read.return_value = json.dumps({**valid, **changed}).encode()
                    central_access.fetch_access(subject)
                self.assertEqual(denied.exception.status_code, 503)


class CentralAccessTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.environment = patch.dict(os.environ, {
            "CHIMERA_CENTRAL_ACCESS_ENABLED": "true", "CHIMERA_DEPLOYMENT_PROFILE": "darkrogue",
            "CHIMERA_PUBLIC_ORIGIN": "https://chimera.darkrogue.io",
        })
        self.environment.start()
        self.root_patch = patch.object(storage, "ROOT", self.root)
        self.root_patch.start()
        self.subject = str(uuid4())
        self.store = AccountStore(self.root)
        self.token = self.store.sso_login({"sub": self.subject, "name": "Pilot", "email": "pilot@example.test",
            "jti": str(uuid4()), "exp": time.time() + 90}, ["author", "instructional-designer"])
        self.user = self.store.account_for_token(self.token)
        data = self.store._read()
        data["members"]["course-one"] = {self.user["id"]: "author"}
        self.store._write(data)
        self.actor = ActorContext(actorId=self.user["id"], actorDisplayName="Pilot", installationId="https://chimera.darkrogue.io", deploymentMode="team")
        self.policy = HostedAuthorizationPolicy(self.store, OrganizationPolicy(deploymentMode="team", identityProvider="darkrogue"))
        self.decision = {"allowed": True, "revision": 1, "scopeManaged": False,
                         "capabilities": ["app.use", "review", "author", "export"]}
        def fetch(_subject, _project=None, **kwargs):
            if "acknowledge" in kwargs:
                return {"acknowledged": True, "revision": kwargs["acknowledge"]}
            return dict(self.decision)
        self.fetch = patch.object(central_access, "fetch_access", side_effect=fetch)
        self.fetch.start()

    def tearDown(self):
        self.fetch.stop()
        self.root_patch.stop()
        self.environment.stop()
        self.temp.cleanup()

    def request(self):
        return Request({"type": "http", "method": "GET", "headers": [(b"cookie", f"{COOKIE}={self.token}".encode())]})

    def test_old_session_loses_authoring_and_export_after_demotion(self):
        provider = PasswordIdentityProvider(self.store)
        provider.resolve(self.request())
        self.assertTrue(self.policy.allows(self.actor, "scene.manage", "course-one"))
        self.decision.update(revision=2, capabilities=["app.use", "review"])
        provider.resolve(self.request())
        self.assertFalse(self.policy.allows(self.actor, "scene.manage", "course-one"))
        self.assertFalse(self.policy.allows(self.actor, "project.export", "course-one"))
        self.assertTrue(self.policy.allows(self.actor, "project.view", "course-one"))
        self.assertEqual(self.store.account_for_token(self.token)["roles"], ["reviewer"])

    def test_same_session_gains_authoring_without_invitation(self):
        self.decision.update(capabilities=["app.use", "review"])
        provider = PasswordIdentityProvider(self.store)
        provider.resolve(self.request())
        self.assertFalse(self.policy.allows(self.actor, "scene.manage", "course-one"))
        self.decision.update(revision=2, capabilities=["app.use", "review", "author", "export"])
        provider.resolve(self.request())
        self.assertTrue(self.policy.allows(self.actor, "scene.manage", "course-one"))

    def test_suspension_or_app_removal_denies_existing_cookie_and_job(self):
        self.decision.update(revision=2, allowed=False, capabilities=[])
        with self.assertRaises(HTTPException) as denial:
            PasswordIdentityProvider(self.store).resolve(self.request())
        self.assertEqual(denial.exception.status_code, 403)
        with self.assertRaises(HTTPException):
            central_access.require_job_access(self.user["id"], "course-one", "media.job.create")

    def test_explicit_project_role_can_promote_and_demote_without_changing_local_membership(self):
        self.decision.update(scopeManaged=True, capabilities=["app.use", "review"])
        self.assertFalse(self.policy.allows(self.actor, "scene.manage", "course-one"))
        self.decision.update(revision=2, capabilities=["app.use", "review", "author", "export"])
        self.assertTrue(self.policy.allows(self.actor, "scene.manage", "course-one"))
        self.assertFalse(self.policy.allows(self.actor, "project.membership.manage", "course-one"))

    def test_old_projection_and_unavailable_authority_fail_closed(self):
        self.decision.update(revision=8)
        central_access.account_access(self.store, self.user["id"])
        self.decision.update(revision=7)
        with self.assertRaises(HTTPException):
            central_access.account_access(self.store, self.user["id"])
        with patch.object(central_access, "fetch_access", side_effect=HTTPException(503, "Unavailable")):
            with self.assertRaises(HTTPException):
                self.policy.allows(self.actor, "scene.manage", "course-one")

    def test_local_disable_remains_a_deny_and_unknown_actions_never_gain_admin_fallback(self):
        data = self.store._read()
        data["accounts"]["pilot@example.test"]["disabled"] = True
        self.store._write(data)
        with self.assertRaises(HTTPException):
            central_access.account_access(self.store, self.user["id"])
        self.assertFalse(central_access.permits_action(["app.use", "administration"], "future.unknown"))

    def test_recovered_legacy_job_without_actor_cannot_call_provider(self):
        with self.assertRaises(HTTPException):
            central_access.require_job_access(None, "course-one", "enhancement.job.create")


if __name__ == "__main__":
    unittest.main()
