import json
import os
from pathlib import Path
import tempfile
from threading import Event
import unittest
from unittest.mock import Mock, patch

from fastapi import HTTPException
from fastapi.testclient import TestClient
from pydantic import ValidationError

from backend.app import main, progressive_authoring as progressive, storage
from backend.app.models import ProjectCreate, SceneCreate, SceneUpdate
from backend.app.platform import LOCAL_ACTOR, action_context


class ProgressiveAuthoringTests(unittest.TestCase):
    def setUp(self):
        self.root = Path(self.enterContext(tempfile.TemporaryDirectory()))
        self.enterContext(patch.object(storage, "ROOT", self.root))
        self.enterContext(patch.object(storage, "PROJECTS", self.root / "projects"))
        self.enterContext(patch.object(main, "ROOT", self.root))
        self.enterContext(patch.dict(os.environ, {"CHIMERA_PROGRESSIVE_DEMO": "true"}))
        self.project = storage.create_project(ProjectCreate(title="Synthetic progressive course"))
        self.project = storage.create_scene(self.project.id, SceneCreate(title="Authored original"), self.project.storyboard.revision)
        self.actor = LOCAL_ACTOR.actorId
        self.job = progressive.submit(self.project.id, self.project.storyboard.revision, self.actor)
        self.job_id = self.job["jobId"]

    def emit(self, component="scene-1", payload=None):
        return progressive.emit_scene(self.project.id, self.job_id, self.actor, component,
            payload or {"title": "Inspect before use", "extractedText": ["Inspect the equipment."]}, 0, lambda: None)

    def page(self, cursor=0):
        return progressive.page(self.project.id, self.job_id, self.actor, cursor)

    def test_complete_scene_arrives_before_job_finishes_without_canonical_write(self):
        before = (storage.project_path(self.project.id) / "storyboard.json").read_bytes()
        first, release = Event(), Event()
        def pause():
            first.set()
            release.wait(5)
        thread = progressive.start(self.project.id, self.job_id, self.actor, lambda: None, pause)
        try:
            self.assertTrue(first.wait(5))
            page = self.page()
            self.assertEqual(page["status"], "running")
            ready = [event for event in page["events"] if event["type"] == "component.ready"]
            self.assertEqual(len(ready), 1)
            progressive.DraftScene.model_validate(ready[0]["payload"])
            self.assertEqual(before, (storage.project_path(self.project.id) / "storyboard.json").read_bytes())
        finally:
            release.set()
            thread.join(5)
        self.assertFalse(thread.is_alive())
        self.assertEqual(self.page()["status"], "completed")
        self.assertEqual(len([e for e in self.page()["events"] if e["type"] == "component.ready"]), 2)

    def test_replay_and_duplicate_delivery_are_durable_and_idempotent(self):
        cursor = self.page()["cursor"]
        self.emit()
        events = self.page(cursor)["events"]
        self.emit()
        self.assertEqual(self.page(cursor)["events"], events)
        self.assertEqual(self.page()["events"][1:], events)
        self.assertEqual(self.page(self.page()["cursor"])["events"], [])
        with self.assertRaises(HTTPException):
            self.page(999)
        with self.assertRaises(ValueError):
            self.emit(payload={"title": "Overwritten draft", "extractedText": ["Different"]})

    def test_cancel_stops_future_delivery_and_prevents_acceptance(self):
        first, release = Event(), Event()
        def pause():
            first.set()
            release.wait(5)
        thread = progressive.start(self.project.id, self.job_id, self.actor, lambda: None, pause)
        try:
            self.assertTrue(first.wait(5))
            progressive.finish(self.project.id, self.job_id, self.actor, "cancelled", lambda: None)
        finally:
            release.set()
            thread.join(5)
        self.assertFalse(thread.is_alive())
        cursor = self.page()["cursor"]
        self.assertFalse(self.emit("scene-2"))
        self.assertEqual(self.page()["cursor"], cursor)
        with self.assertRaises(HTTPException):
            progressive.decide(self.project.id, self.job_id, "scene-1", self.actor, "accept", self.project.storyboard.revision)
        self.assertEqual(len(storage.read_project(self.project.id).storyboard.scenes), 1)

    def test_author_edit_conflicts_even_if_caller_supplies_the_new_revision(self):
        self.emit()
        updated = storage.update_scene(self.project.id, self.project.storyboard.scenes[0].id,
            SceneUpdate(title="Human revision survives"), self.project.storyboard.revision)
        with self.assertRaises(storage.StoryboardRevisionConflict):
            progressive.decide(self.project.id, self.job_id, "scene-1", self.actor, "accept", updated.storyboard.revision)
        self.assertEqual(storage.read_project(self.project.id).storyboard.scenes[0].title, "Human revision survives")
        self.assertEqual(self.page()["events"][-1]["status"], "proposed")

    def test_accept_once_then_continue_generation_and_reject(self):
        self.emit()
        updated = progressive.decide(self.project.id, self.job_id, "scene-1", self.actor, "accept", self.project.storyboard.revision)
        again = progressive.decide(self.project.id, self.job_id, "scene-1", self.actor, "accept", self.project.storyboard.revision)
        self.assertEqual(updated.storyboard.revision, again.storyboard.revision)
        self.assertEqual(len(again.storyboard.scenes), 2)
        self.assertTrue(again.storyboard.scenes[-1].visualLayout.enabled)
        self.emit("scene-2")
        progressive.decide(self.project.id, self.job_id, "scene-2", self.actor, "reject", updated.storyboard.revision)
        self.assertEqual(len(storage.read_project(self.project.id).storyboard.scenes), 2)

    def test_accept_recovers_after_event_document_write_failure_without_duplicate_scene(self):
        self.emit()
        with patch.object(progressive, "_write", side_effect=OSError("synthetic disk interruption")):
            with self.assertRaises(OSError):
                progressive.decide(self.project.id, self.job_id, "scene-1", self.actor, "accept", self.project.storyboard.revision)
        current = storage.read_project(self.project.id)
        recovered = progressive.decide(self.project.id, self.job_id, "scene-1", self.actor, "accept", current.storyboard.revision)
        self.assertEqual(len(recovered.storyboard.scenes), 2)
        self.assertEqual(current.storyboard.revision, recovered.storyboard.revision)

    def test_invalid_component_is_withheld_and_other_components_can_continue(self):
        self.emit(payload={"title": "Incomplete", "extractedText": []})
        self.assertEqual(self.page()["events"][-1]["type"], "component.failed")
        self.emit("scene-2")
        self.assertEqual(self.page()["status"], "running")
        with self.assertRaises(ValidationError):
            progressive.ComponentEvent.model_validate({**self.page()["events"][-1], "eventId": "forged"})

    def test_other_authors_and_revoked_producer_permissions_are_denied(self):
        with self.assertRaises(HTTPException):
            progressive.page(self.project.id, self.job_id, "another-author")
        def deny():
            raise HTTPException(403, "Revoked")
        with self.assertRaises(HTTPException):
            progressive.emit_scene(self.project.id, self.job_id, self.actor, "scene-1",
                {"title": "Denied", "extractedText": ["No delivery"]}, 0, deny)
        self.assertEqual(len(self.page()["events"]), 1)

    def test_api_requires_revision_and_uses_permission_inventory(self):
        client = TestClient(main.app)
        base = f"/api/projects/{self.project.id}/progressive-jobs"
        self.assertEqual(client.post(base).status_code, 428)
        self.emit()
        replay = client.get(f"{base}/{self.job_id}/events")
        self.assertEqual(replay.status_code, 200)
        self.assertEqual(replay.headers["cache-control"], "no-store")
        denied = Mock()
        denied.allows.return_value = False
        main.app.dependency_overrides[main.get_authorization_policy] = lambda: denied
        try:
            self.assertEqual(client.get(f"{base}/{self.job_id}/events").status_code, 403)
        finally:
            main.app.dependency_overrides.clear()
        response = client.post(f"{base}/{self.job_id}/components/scene-1/decision",
            headers={"If-Match": f'"{self.project.storyboard.revision}"'}, json={"decision": "accept"})
        self.assertEqual(response.status_code, 200, response.text)

    def test_api_rejects_stale_acceptance_and_cursor_without_changing_author_work(self):
        self.emit()
        changed = storage.update_scene(self.project.id, self.project.storyboard.scenes[0].id,
            SceneUpdate(title="Changed by author"), self.project.storyboard.revision)
        client = TestClient(main.app)
        base = f"/api/projects/{self.project.id}/progressive-jobs/{self.job_id}"
        self.assertEqual(client.get(base + "/events?after=999").status_code, 409)
        response = client.post(base + "/components/scene-1/decision",
            headers={"If-Match": f'"{changed.storyboard.revision}"'}, json={"decision": "accept"})
        self.assertEqual(response.status_code, 412)
        self.assertEqual(len(storage.read_project(self.project.id).storyboard.scenes), 1)

    def test_demo_is_opt_in_and_not_available_to_team_installations(self):
        with patch.dict(os.environ, {"CHIMERA_PROGRESSIVE_DEMO": "false"}), self.assertRaises(HTTPException):
            progressive.require_demo()
        with action_context(LOCAL_ACTOR.model_copy(update={"deploymentMode": "team"})), self.assertRaises(HTTPException):
            progressive.require_demo()

    def test_restart_retains_replay_and_marks_unfinished_job_failed_without_regeneration(self):
        self.emit()
        with patch.object(progressive, "RUN_ID", "restarted-process"):
            progressive.recover()
        self.assertEqual(self.page()["status"], "failed")
        self.assertEqual(len([e for e in self.page()["events"] if e["type"] == "component.ready"]), 1)
        self.assertEqual(len(storage.read_project(self.project.id).storyboard.scenes), 1)


if __name__ == "__main__":
    unittest.main()
