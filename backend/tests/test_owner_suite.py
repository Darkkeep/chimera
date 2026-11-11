import base64
import hashlib
import hmac
import json
import tempfile
import time
import unittest
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from unittest.mock import MagicMock, patch
from uuid import uuid4

from fastapi import HTTPException
from fastapi.testclient import TestClient

from backend.app import export_analytics, main, storage
from backend.app.models import ProjectCreate
from backend.app.owner_suite import OwnerAssertion, run_owner_action
from backend.app.password_auth import AccountStore
from backend.app.platform import ActorContext

ORIGIN = "https://chimera.darkrogue.io"
SECRET = "owner-suite-fixture-key-with-at-least-32-characters"


def claims(actor, **extra):
    now = int(time.time())
    return {"issuer": "https://darkrogue.io", "audience": ORIGIN, "actor": actor,
            "action": "list", "issuedAt": now, "expiresAt": now + 60, **extra}


def signed(value):
    payload = base64.urlsafe_b64encode(json.dumps(value).encode()).decode().rstrip("=")
    signature = base64.urlsafe_b64encode(hmac.new(SECRET.encode(), payload.encode(), hashlib.sha256).digest()).decode().rstrip("=")
    return {"Authorization": f"Bearer {payload}.{signature}"}


class OwnerSuiteTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        for module in (storage, main):
            self.enterContext(patch.object(module, "ROOT", self.root))
        self.enterContext(patch.object(storage, "PROJECTS", self.root / "projects"))
        self.enterContext(patch.dict("os.environ", {
            "CHIMERA_DEPLOYMENT_PROFILE": "darkrogue", "CHIMERA_PUBLIC_ORIGIN": ORIGIN,
            "CHIMERA_OWNER_SUITE_SECRET": SECRET,
        }))
        self.store = AccountStore(self.root)
        self.actor, self.target = str(uuid4()), str(uuid4())
        self.store.sso_login({"sub": self.actor, "email": "owner@example.test", "name": "Owner", "jti": uuid4().hex, "exp": time.time() + 60}, ["administrator"])
        self.store.sso_login({"sub": self.target, "email": "learner@example.test", "name": "Learner", "jti": uuid4().hex, "exp": time.time() + 60}, ["reviewer"])
        self.project = storage.create_project(ProjectCreate(title="Disposable owner access project"))
        self.client = TestClient(main.app, base_url=ORIGIN)
        self.addCleanup(self.client.close)

    def post(self, value):
        return self.client.post("/api/internal/owner-suite/projects", headers=signed(value))

    def grant(self, **overrides):
        return claims(self.actor, action="grant", requestId=str(uuid4()), project=self.project.id, target=self.target, role="reviewer", **overrides)

    def test_signature_scope_expiry_and_existing_permissions(self):
        self.assertEqual(self.post(claims(self.actor)).status_code, 200)
        self.assertEqual(self.post(claims(self.target)).status_code, 403)
        for value in (claims(self.actor, audience="https://other.example"), claims(self.actor, expiresAt=int(time.time())-1),
                      claims(self.actor, expiresAt=int(time.time())+300), claims(self.actor, action="grant")):
            self.assertEqual(self.post(value).status_code, 401)
        with patch.dict("os.environ", {"CHIMERA_OWNER_SUITE_SECRET": ""}):
            self.assertEqual(self.post(claims(self.actor)).status_code, 404)

    def test_grant_retry_conflict_and_missing_link_are_durable(self):
        grant = self.grant()
        for _ in range(2):
            self.assertEqual(self.post(grant).json(), {"outcome": "granted"})
        changed = {**grant, "requestId": str(uuid4()), "role": "author"}
        self.assertEqual(self.post(changed).json(), {"outcome": "role_conflict"})
        missing = {**grant, "target": str(uuid4()), "requestId": str(uuid4())}
        self.assertEqual(self.post(missing).status_code, 422)
        data = self.store._read()
        self.assertEqual(len(data["ownerSuiteGrants"]), 2)
        receipt = data["ownerSuiteGrants"][grant["requestId"]]
        self.assertEqual(receipt["role"], "reviewer")
        self.assertEqual(data["members"][self.project.id][receipt["targetId"]], "reviewer")

    def test_concurrent_identical_grants_have_one_receipt(self):
        assertion = OwnerAssertion.model_validate(self.grant())
        policy = main.get_authorization_policy()
        with ThreadPoolExecutor(max_workers=4) as pool:
            results = list(pool.map(lambda _: run_owner_action(assertion, self.store, policy), range(8)))
        self.assertEqual(results, [{"outcome": "granted"}] * 8)
        self.assertEqual(len(self.store._read()["ownerSuiteGrants"]), 1)


class ScormAnalyticsTests(unittest.TestCase):
    def test_capture_is_minimal_and_failure_preserves_exports(self):
        actor = ActorContext(actorId="local-account-id", actorDisplayName="Private name", installationId=ORIGIN, deploymentMode="team")
        opener = MagicMock()
        opener.open.return_value.__enter__.return_value.read.return_value = b'{"status":1}'
        with patch.dict("os.environ", {"CHIMERA_POSTHOG_ENABLED": "true", "CHIMERA_POSTHOG_PROJECT_TOKEN": "fictional-token", "CHIMERA_POSTHOG_PSEUDONYM_SECRET": SECRET}), patch.object(export_analytics, "build_opener", return_value=opener):
            export_analytics.capture_scorm_export(actor, "scorm12")
            request = opener.open.call_args.args[0]
            payload = json.loads(request.data)
            self.assertEqual(payload["event"], "chimera_scorm_export_generated")
            self.assertEqual(payload["properties"], {"export_format": "scorm12", "$process_person_profile": False, "$geoip_disable": True})
            self.assertNotIn(actor.actorId, request.data.decode())
            self.assertNotIn(actor.actorDisplayName, request.data.decode())
            opener.open.side_effect = OSError("unavailable")
            export_analytics.capture_scorm_export(actor, "scorm2004")

    def test_exports_schedule_only_after_a_successful_build(self):
        for route, builder, profile in ((main.export_scorm_12, "persist_scorm_12_build", "scorm12"),
                                        (main.export_scorm_2004, "persist_scorm_build", "scorm2004")):
            with patch.object(main, "read_project", return_value=object()), patch.object(main, builder, return_value=(b"package", {}, "export.zip")), patch.object(main, "capture_scorm_export") as capture:
                response = route("fixture-project")
                self.assertEqual(response.body, b"package")
                capture.assert_not_called()
                self.assertEqual(response.background.args[1], profile)
            with patch.object(main, "read_project", return_value=object()), patch.object(main, builder, side_effect=ValueError("invalid export")), patch.object(main, "capture_scorm_export") as capture:
                with self.assertRaises(HTTPException) as failure:
                    route("fixture-project")
                self.assertEqual(failure.exception.status_code, 422)
                capture.assert_not_called()
