import copy
import json
from pathlib import Path
import unittest

from fastapi import HTTPException
from fastapi.testclient import TestClient

from backend.app import main, progressive_authoring as progressive, progressive_handoff as handoff, storage
from backend.tests import test_progressive_authoring as progressive_tests
from backend.app.models import SceneUpdate


class ProgressiveHandoffTests(unittest.TestCase):
    setUp = progressive_tests.ProgressiveAuthoringTests.setUp

    def document(self):
        return json.loads((Path(__file__).parent / "fixtures/production-handoff-v1.json").read_text())

    def ingest(self, document=None, revision=None):
        return handoff.ingest(self.project.id, json.dumps(document or self.document()).encode(),
                              revision or self.project.storyboard.revision, self.actor)

    def test_saved_artifact_provenance_gaps_accept_edit_and_retry(self):
        before = storage.read_project(self.project.id)
        page = self.ingest()
        self.assertEqual(page["status"], "completed")
        self.assertEqual(storage.read_project(self.project.id), before)
        report = page["importReport"]
        self.assertEqual(report["supportedScenes"], 1)
        self.assertEqual(report["totalScenes"], 2)
        self.assertEqual(len(report["unsupported"]), 4)
        ready = [e for e in page["events"] if e["type"] == "component.ready"]
        self.assertEqual(len(ready), 1)
        provenance = ready[0]["provenance"]
        self.assertEqual(provenance["sourceIds"], ["site-guide"])
        self.assertEqual(provenance["sourceSceneId"], "alarm-response")
        self.assertEqual(provenance["locators"], ["Section 2, alarm response"])
        self.assertEqual(provenance["artifactSha256"], report["artifactSha256"])
        job = progressive._read(self.project.id, page["jobId"], self.actor)
        self.assertEqual(job["sourceArtifact"], self.document())
        accepted = progressive.decide(self.project.id, page["jobId"], "alarm-response", self.actor,
                                      "accept", before.storyboard.revision)
        self.assertEqual(len(accepted.storyboard.scenes), 2)
        self.assertTrue(accepted.storyboard.scenes[-1].visualLayout.elements)
        self.assertEqual(self.ingest()["jobId"], page["jobId"])
        changed = self.document()
        changed["storyboard"]["title"] = "Different artifact"
        with self.assertRaises(HTTPException) as issue:
            self.ingest(changed)
        self.assertEqual(issue.exception.status_code, 409)
        with self.assertRaises(HTTPException):
            progressive.page(self.project.id, page["jobId"], "another-author")

    def test_invalid_artifacts_never_create_a_job(self):
        directory = progressive._directory(self.project.id)
        before = list(directory.glob("*.json"))
        for mutate in [lambda d: d.update(version="2.0"),
                       lambda d: d["storyboard"]["scenes"][0].update(source_ids=["invented"]),
                       lambda d: d["storyboard"].update(scenes=[d["storyboard"]["scenes"][1]]),
                       lambda d: d["storyboard"]["scenes"].append(copy.deepcopy(d["storyboard"]["scenes"][0]))]:
            document = self.document()
            mutate(document)
            with self.assertRaises(ValueError):
                self.ingest(document)
        self.assertEqual(list(directory.glob("*.json")), before)

    def test_accepting_then_editing_one_imported_scene_preserves_next_proposal(self):
        document = self.document()
        second = copy.deepcopy(document["storyboard"]["scenes"][0])
        second["id"] = "second-content"
        second["interactions"] = []
        document["storyboard"]["scenes"] = [document["storyboard"]["scenes"][0], second]
        page = self.ingest(document)
        first = progressive.decide(self.project.id, page["jobId"], "alarm-response", self.actor,
                                   "accept", self.project.storyboard.revision)
        edited = storage.update_scene(self.project.id, first.storyboard.scenes[-1].id,
                                      SceneUpdate(title="Owner revised the imported scene"), first.storyboard.revision)
        with self.assertRaises(storage.StoryboardRevisionConflict):
            progressive.decide(self.project.id, page["jobId"], "second-content", self.actor,
                               "accept", first.storyboard.revision)
        final = progressive.decide(self.project.id, page["jobId"], "second-content", self.actor,
                                   "accept", edited.storyboard.revision)
        self.assertEqual(final.storyboard.scenes[-2].title, "Owner revised the imported scene")
        self.assertEqual(len(final.storyboard.scenes), 3)

    def test_route_size_revision_and_feature_gate(self):
        with TestClient(main.app) as client:
            url = f"/api/projects/{self.project.id}/progressive-jobs/import"
            raw = json.dumps(self.document())
            self.assertEqual(client.post(url, content=raw).status_code, 428)
            self.assertEqual(client.post(url, content=raw, headers={"If-Match": "999"}).status_code, 412)
            headers = {"If-Match": str(self.project.storyboard.revision)}
            self.assertEqual(client.post(url, content=b"x" * 1_000_001, headers=headers).status_code, 413)
            self.assertEqual(client.post(url, content=b'{"version":1,"version":2}', headers=headers).status_code, 422)
            response = client.post(url, content=raw, headers=headers)
            self.assertEqual(response.status_code, 201, response.text)
            from unittest.mock import patch
            import os
            with patch.dict(os.environ, {"CHIMERA_PROGRESSIVE_DEMO": "false"}):
                self.assertEqual(client.post(url, content=raw, headers=headers).status_code, 404)
