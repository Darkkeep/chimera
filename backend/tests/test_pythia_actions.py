import copy
import tempfile
import time
import unittest
from pathlib import Path
from threading import Event
from unittest.mock import patch

from fastapi.testclient import TestClient

from backend.app import main, pythia_actions as actions, pythia_talk as talk, storage
from backend.app.models import ProjectCreate, SceneCreate, SceneUpdate, SceneLayout, SceneElement
from backend.app.platform import LOCAL_ACTOR


UPDATE = {"mode": "update-scene", "rationale": "Put the practical action first.",
          "changes": [{"field": "title", "value": "Inspect before use"}, {"field": "extractedText", "value": ["Check the guard before operating."]}],
          "scenes": [], "producer_id": "live-chimera-authoring-v1", "stopping_boundary": "draft-only"}
ADD = {"mode": "add-scenes", "rationale": "Separate introduction and next steps.", "changes": [], "scenes": [
    {"title": "New overview", "sceneType": "title", "extractedText": ["Start with the practical problem."]},
    {"title": "Next steps", "sceneType": "summary", "extractedText": ["Use the checklist on the next shift."]}],
    "producer_id": "live-chimera-authoring-v1", "stopping_boundary": "draft-only"}


class PythiaActionTests(unittest.TestCase):
    def setUp(self):
        self.root = Path(self.enterContext(tempfile.TemporaryDirectory()))
        self.enterContext(patch.multiple(storage, ROOT=self.root, PROJECTS=self.root / "projects"))
        self.enterContext(patch.object(main, "ROOT", self.root))
        self.enterContext(patch.object(talk, "checkout", return_value=Path("trusted-test-checkout")))
        self.project = storage.create_project(ProjectCreate(title="Fictional authoring"))
        self.project = storage.create_scene(self.project.id, SceneCreate(title="Original", extractedText=["Original body."], narration="Preserve narration", notes="Preserve notes"))
        self.scene = self.project.storyboard.scenes[0]
        self.project = storage.update_scene(self.project.id, self.scene.id, SceneUpdate(visualLayout=SceneLayout(enabled=True, elements=[
            SceneElement(id="title", kind="text", text="Original", x=40, y=40, width=1000, height=100),
            SceneElement(id="body", kind="text", text="Original body.", x=40, y=180, width=1000, height=150)])), self.project.storyboard.revision)
        self.path = talk.state_path(self.project.id, LOCAL_ACTOR)
        talk.write_state(self.path, {"sessionId": "session-one", "turns": [{"id": "advice-one", "question": "Improve the lesson", "wireQuestion": "Improve the lesson",
            "status": "completed", "result": {"content": "Use practical actions first."}, "binding": {"sceneRevision": None, "sources": {}}}]})
        self.client = self.enterContext(TestClient(main.app))
        self.base = f"/api/projects/{self.project.id}/pythia-conversation"
        self.headers = {"Origin": "http://127.0.0.1:5173"}

    def draft(self, mode="update-scene", request_id="draft-first", **extra):
        body = {"sessionId": "session-one", "requestId": request_id, "turnId": "advice-one", "mode": mode,
            "sceneId": self.scene.id if mode == "update-scene" else None,
            "direction": "Use short imperative sentences and preserve narration.", "expectedRevision": self.project.storyboard.revision, **extra}
        return self.client.post(self.base + "/actions", json=body, headers=self.headers)

    def finished(self):
        deadline = time.monotonic() + 5
        while time.monotonic() < deadline:
            state = self.client.get(self.base).json()
            if state.get("actions") and state["actions"][-1]["status"] != "drafting":
                return state
            time.sleep(.01)
        self.fail("Draft did not settle")

    def decide(self, decision="apply", revision=None):
        return self.client.post(self.base + "/actions/draft-first/decision", json={"sessionId": "session-one", "decision": decision,
            "expectedRevision": revision or self.project.storyboard.revision}, headers=self.headers)

    def test_update_is_previewed_then_applied_once_with_authored_text_sync(self):
        before = storage.read_project(self.project.id).storyboard.model_dump()
        with patch.object(talk, "local_mcp", return_value=copy.deepcopy(UPDATE)) as provider:
            self.assertEqual(self.draft().status_code, 202)
            state = self.finished()
            self.assertEqual(state["actions"][0]["status"], "pending")
            self.assertEqual(state["actions"][0]["before"]["title"], "Original")
            self.assertEqual(storage.read_project(self.project.id).storyboard.model_dump(), before)
            payload = provider.call_args.kwargs["authoring_request"]
            self.assertIn("preserve narration", payload["direction"])
            self.assertEqual(payload["scene"]["title"], "Original")
        response = self.decide()
        self.assertEqual(response.status_code, 200, response.text)
        project = storage.read_project(self.project.id)
        self.assertEqual(project.storyboard.revision, self.project.storyboard.revision + 1)
        scene = project.storyboard.scenes[0]
        self.assertEqual(scene.title, "Inspect before use")
        self.assertEqual(scene.narration, "Preserve narration")
        self.assertEqual(scene.notes, "Preserve notes")
        self.assertEqual([element.text for element in scene.visualLayout.elements], ["Inspect before use", "Check the guard before operating."])
        self.assertEqual(self.decide().status_code, 200)
        self.assertEqual(storage.read_project(self.project.id).storyboard.revision, project.storyboard.revision)

    def test_apply_preserves_authored_timeline_and_shape_appearance(self):
        layout = self.project.storyboard.scenes[0].visualLayout.model_dump()
        layout["timeline"] = {"durationMs": 6000, "printTimeMs": 2000}
        layout["elements"].append(dict(id="timed-shape", kind="shape", nativeShape="ellipse",
            x=100, y=400, width=200, height=100, appearance={"opacity": .4},
            timing={"startMs": 1000, "endMs": 5000}))
        self.project = storage.update_scene(self.project.id, self.scene.id, SceneUpdate(visualLayout=layout))
        before = self.project.storyboard.scenes[0].visualLayout
        with patch.object(talk, "local_mcp", return_value=copy.deepcopy(UPDATE)):
            self.assertEqual(self.draft().status_code, 202)
            self.finished()
        self.assertEqual(self.decide().status_code, 200)
        scene = storage.read_project(self.project.id).storyboard.scenes[0]
        self.assertEqual(scene.title, "Inspect before use")
        self.assertEqual(scene.visualLayout.timeline, before.timeline)
        self.assertEqual(scene.visualLayout.elements[-1], before.elements[-1])

    def test_additions_preserve_existing_scenes_and_are_idempotent(self):
        before = self.project.storyboard.scenes[0].model_dump()
        with patch.object(talk, "local_mcp", return_value=copy.deepcopy(ADD)):
            self.assertEqual(self.draft("add-scenes").status_code, 202)
            self.finished()
        self.assertEqual(self.decide().status_code, 200)
        project = storage.read_project(self.project.id)
        self.assertEqual(project.storyboard.scenes[0].model_dump(), before)
        self.assertEqual([scene.title for scene in project.storyboard.scenes[1:]], ["New overview", "Next steps"])
        self.assertEqual(self.decide().status_code, 200)
        self.assertEqual(len(storage.read_project(self.project.id).storyboard.scenes), 3)
        self.assertTrue(all(scene.visualLayout is None or scene.visualLayout.timeline is None for scene in project.storyboard.scenes[1:]))

    def test_discard_preserves_storyboard(self):
        with patch.object(talk, "local_mcp", return_value=copy.deepcopy(UPDATE)):
            self.draft(); self.finished()
        response = self.decide("discard")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["conversation"]["actions"][0]["status"], "discarded")
        self.assertEqual(storage.read_project(self.project.id).storyboard.revision, self.project.storyboard.revision)
        self.assertEqual(self.decide().status_code, 409)

    def test_changed_revision_rejects_apply_without_overwriting_author_edit(self):
        with patch.object(talk, "local_mcp", return_value=copy.deepcopy(UPDATE)):
            self.draft(); self.finished()
        current = storage.update_scene(self.project.id, self.scene.id, SceneUpdate(title="Author edit"), self.project.storyboard.revision)
        self.assertEqual(self.decide(revision=current.storyboard.revision).status_code, 409)
        self.assertEqual(storage.read_project(self.project.id).storyboard.scenes[0].title, "Author edit")

    def test_foreign_advice_unknown_fields_and_wrong_scope_are_rejected(self):
        with patch.object(talk, "local_mcp") as provider:
            self.assertEqual(self.draft(turnId="foreign-turn").status_code, 404)
            provider.assert_not_called()
        for index, invalid in enumerate(({**UPDATE, "mode": "add-scenes"}, {**UPDATE, "changes": [{"field": "deleteFiles", "value": "*"}]})):
            with patch.object(talk, "local_mcp", return_value=invalid):
                self.draft(request_id=f"invalid-{index}")
                state = self.finished()
                self.assertEqual(state["actions"][-1]["status"], "failed")
        self.assertEqual(storage.read_project(self.project.id).storyboard.revision, self.project.storyboard.revision)

    def test_replay_and_concurrent_requests_do_not_duplicate_drafting(self):
        started, release = Event(), Event()
        def producer(**_):
            started.set(); release.wait(3)
            return copy.deepcopy(UPDATE)
        with patch.object(talk, "local_mcp", side_effect=producer) as provider:
            self.draft()
            self.assertTrue(started.wait(2))
            self.assertEqual(self.draft().status_code, 202)
            self.assertEqual(self.draft(request_id="draft-second").status_code, 409)
            self.assertEqual(self.client.post(self.base + "/reset", headers=self.headers).status_code, 409)
            release.set(); self.finished()
            self.assertEqual(provider.call_count, 1)

    def test_failed_decision_receipt_rolls_back_content_and_history(self):
        with patch.object(talk, "local_mcp", return_value=copy.deepcopy(UPDATE)):
            self.draft(); self.finished()
        original = talk.write_state
        def failing(path, state):
            if any(action["status"] == "applied" for action in state.get("actions", [])):
                raise OSError("Synthetic receipt persistence failure")
            return original(path, state)
        root = storage.project_path(self.project.id)
        snapshots = {name: (root / name).read_bytes() for name in ("storyboard.json", "project.json")}
        history = set((root / "history").glob("*"))
        with patch.object(talk, "write_state", side_effect=failing), self.assertRaises(OSError):
            self.decide()
        self.assertEqual({name: (root / name).read_bytes() for name in snapshots}, snapshots)
        self.assertEqual(set((root / "history").glob("*")), history)
        self.assertEqual(self.client.get(self.base).json()["actions"][0]["status"], "pending")

    def test_scope_changes_and_stale_conversation_are_rejected_before_provider(self):
        with patch.object(talk, "local_mcp") as provider:
            self.assertEqual(self.draft("add-scenes", sceneId=self.scene.id).status_code, 422)
            self.assertEqual(self.draft(sessionId="foreign-session").status_code, 409)
            self.assertEqual(self.draft(expectedRevision=self.project.storyboard.revision + 1).status_code, 409)
            provider.assert_not_called()


if __name__ == "__main__":
    unittest.main()
