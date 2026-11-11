import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

from backend.app import storage
from backend.app.main import app
from backend.app.models import ProjectCreate, SceneCreate

FIXTURE = Path(__file__).with_name("fixtures") / "production-handoff-v1.json"
CONTRACT = Path(__file__).resolve().parents[1] / "app" / "handoff_contract"


class ProductionHandoffGoldenPath(unittest.TestCase):
    def setUp(self):
        root = Path(self.enterContext(tempfile.TemporaryDirectory()))
        self.enterContext(patch.object(storage, "ROOT", root))
        self.enterContext(patch.object(storage, "PROJECTS", root / "projects"))
        self.client = self.enterContext(TestClient(app))
        project = storage.create_project(ProjectCreate(title="Existing course"))
        self.project = storage.create_scene(project.id, SceneCreate(
            title="Original", extractedText=["Keep this scene."],
        ), project.storyboard.revision)
        self.project_path = f"/api/projects/{project.id}"
        self.import_path = f"{self.project_path}/storyboard/import"
        self.headers = {"If-Match": str(self.project.storyboard.revision), "Content-Type": "application/json"}
        self.raw = FIXTURE.read_bytes()
        self.original = (storage.project_path(project.id) / "storyboard.json").read_bytes()

    def upload(self, raw=None):
        return self.client.post(self.import_path, content=self.raw if raw is None else raw, headers=self.headers)

    def decide(self, proposal_id, decision, revision=None):
        headers = self.headers if revision is None else {**self.headers, "If-Match": str(revision)}
        return self.client.post(f"{self.project_path}/enhancement-proposals/{proposal_id}/decision",
                                json={"decision": decision}, headers=headers)

    def assert_storyboard_unchanged(self):
        self.assertEqual((storage.project_path(self.project.id) / "storyboard.json").read_bytes(), self.original)

    def test_export_import_preview_accept_and_replay(self):
        uploaded = self.upload()
        self.assertEqual(uploaded.status_code, 201, uploaded.text)
        proposal = uploaded.json()
        self.assertEqual(proposal["status"], "pending")
        self.assertEqual(proposal["sourceArtifact"], json.loads(self.raw))
        self.assert_storyboard_unchanged()
        listing = self.client.get(f"{self.project_path}/enhancement-proposals").json()
        self.assertEqual([proposal], listing)
        self.assertEqual(self.upload().json()["id"], proposal["id"])

        accepted = self.decide(proposal["id"], "accept")
        self.assertEqual(accepted.status_code, 200, accepted.text)
        result = accepted.json()
        self.assertEqual(result["proposal"]["status"], "accepted")
        storyboard = result["project"]["storyboard"]
        self.assertEqual(storyboard["revision"], self.project.storyboard.revision + 1)
        original, content, question = storyboard["scenes"]
        self.assertEqual(original, self.project.storyboard.scenes[0].model_dump(mode="json"))
        self.assertEqual(content["title"], "Leave by a marked exit")
        self.assertIn("marked exit", content["narration"])
        self.assertEqual(content["imageAssets"], [])
        self.assertIsNone(content["experience"])
        self.assertEqual(question["sceneType"], "question")
        self.assertEqual(question["assessmentItem"]["correctResponse"], "exit")
        self.assertEqual(question["assessmentItem"]["metadata"]["learningObjectiveRefs"], ["identify-exit"])
        self.assertNotEqual(content["id"], "alarm-response")
        self.assertEqual(self.upload().json()["status"], "accepted")
        self.assertEqual(len(storage.list_enhancement_proposals(self.project.id)), 1)

    def test_reject_and_duplicate_identity(self):
        proposal = self.upload().json()
        document = json.loads(self.raw)
        document["storyboard"]["title"] = "Different content"
        self.assertEqual(self.upload(json.dumps(document)).status_code, 409)
        rejected = self.decide(proposal["id"], "reject")
        self.assertEqual(rejected.status_code, 200, rejected.text)
        self.assertEqual(rejected.json()["proposal"]["status"], "rejected")
        self.assert_storyboard_unchanged()
        self.assertEqual(self.upload().json()["status"], "rejected")

    def test_stale_acceptance_does_not_apply(self):
        proposal = self.upload().json()
        changed = storage.create_scene(self.project.id, SceneCreate(title="Human edit"), self.project.storyboard.revision)
        stale = self.decide(proposal["id"], "accept", changed.storyboard.revision)
        self.assertEqual(stale.status_code, 409, stale.text)
        self.assertEqual(storage.read_project(self.project.id).storyboard, changed.storyboard)
        self.assertEqual(self.upload().json()["status"], "stale")

    def test_validation_and_restore_guard(self):
        for field, value in [("version", "2.0"), ("review_state", "accepted"), ("validation_state", "skipped")]:
            raw = json.dumps({**json.loads(self.raw), field: value})
            with self.subTest(field=field):
                self.assertEqual(self.upload(raw).status_code, 422)
        bad_reference = json.loads(self.raw)
        bad_reference["storyboard"]["scenes"][0]["media_ids"] = ["missing"]
        self.assertEqual(self.upload(json.dumps(bad_reference)).status_code, 422)
        duplicate = self.raw.replace(b'"version": "1.0"', b'"version": "2.0", "version": "1.0"')
        self.assertEqual(self.upload(duplicate).status_code, 422)
        self.assertEqual(self.upload(b" " * 1_000_001).status_code, 413)
        self.assertEqual(self.client.post(self.import_path, content=self.raw).status_code, 428)
        legacy = self.project.storyboard.model_dump(mode="json")
        mixed = {**legacy, **json.loads(self.raw)}
        self.assertEqual(self.client.put(self.import_path, json=mixed, headers=self.headers).status_code, 422)
        self.assert_storyboard_unchanged()
        self.assertEqual(storage.list_enhancement_proposals(self.project.id), [])
        restored = self.client.put(self.import_path, json=legacy, headers=self.headers)
        self.assertEqual(restored.status_code, 200, restored.text)

    def test_pythia_checkout_parity_and_real_export(self):
        source = os.environ.get("PYTHIA_HANDOFF_SOURCE")
        if not source:
            self.skipTest("Set PYTHIA_HANDOFF_SOURCE to the companion Pythia checkout")
        source = Path(source).resolve()
        for name in ("production-handoff-v1.schema.json", "production_handoff.py"):
            self.assertEqual((source / "schemas" / name).read_text(encoding="utf-8"),
                             (CONTRACT / name).read_text(encoding="utf-8"))
        pythia_fixture = source / "tests/fixtures" / FIXTURE.name
        self.assertEqual(pythia_fixture.read_text(encoding="utf-8"), FIXTURE.read_text(encoding="utf-8"))
        exported = Path(self.enterContext(tempfile.TemporaryDirectory())) / "handoff.json"
        subprocess.run([sys.executable, "-m", "scripts.export_production_handoff", str(pythia_fixture),
                        str(exported)], cwd=source, check=True)
        response = self.upload(exported.read_bytes())
        self.assertEqual(response.status_code, 201, response.text)
        self.assertEqual(response.json()["sourceArtifact"], json.loads(self.raw))
