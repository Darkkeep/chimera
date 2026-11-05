import copy
import tempfile
import time
import unittest
from pathlib import Path
from threading import Event
from unittest.mock import patch

from fastapi.testclient import TestClient

from backend.app import main, pythia_talk as talk, storage, video_treatments as video
from backend.app.models import ProjectCreate, SceneCreate, SceneUpdate
from backend.app.platform import LOCAL_ACTOR


TREATMENT = {
    "title": "Inspect before opening", "purpose": "Recognize the inspection step",
    "rationale": "Separate the check from the action.",
    "shots": [{"text": "Inspect the valve.", "durationSeconds": 6, "transition": "fade"},
              {"text": "Only then open it.", "durationSeconds": 6, "transition": "none"}],
    "productionNeeds": ["Optional spoken narration - not implemented."],
}


class VideoTreatmentTests(unittest.TestCase):
    def setUp(self):
        self.root = Path(self.enterContext(tempfile.TemporaryDirectory()))
        self.enterContext(patch.multiple(storage, ROOT=self.root, PROJECTS=self.root / "projects"))
        self.enterContext(patch.object(main, "ROOT", self.root))
        self.enterContext(patch.object(talk, "checkout", return_value=self.root))
        self.project = storage.create_project(ProjectCreate(title="Valve course"))
        self.project = storage.create_scene(self.project.id, SceneCreate(
            title="Valve", extractedText=["Inspect before opening."], narration="Check for damage.",
            actionDescription="Emphasize the inspection.", notes="Avoid jargon."))
        self.scene = self.project.storyboard.scenes[0]
        self.client = self.enterContext(TestClient(main.app))
        self.url = f"/api/projects/{self.project.id}/scenes/{self.scene.id}/video-treatment"
        self.headers = {"Origin": "http://127.0.0.1:5173"}
        self.data = {"requestId": "request-video-one", "sourceRevision": self.project.storyboard.revision,
                     "direction": "Show why the inspection comes first.", "durationSeconds": 12, "includeDesignBrief": True}
        path = talk.state_path(self.project.id, LOCAL_ACTOR)
        talk.write_state(path, {"sessionId": "fixture", "turns": [], "planning": {
            "stage": "designing", "brief": "New operators; safe valve inspection.", "turnId": "fixture-turn"}})
        self.data["contextFingerprint"] = self.client.get(self.url).json()["context"]["fingerprint"]

    def finished(self):
        deadline = time.monotonic() + 5
        while time.monotonic() < deadline:
            response = self.client.get(self.url)
            self.assertEqual(response.status_code, 200, response.text)
            state = response.json()
            if state["operation"] and state["operation"]["status"] != "running":
                return state
            time.sleep(.01)
        self.fail("Video design worker did not settle")

    def submit(self, **overrides):
        return self.client.post(self.url, json={**self.data, **overrides}, headers=self.headers)

    def test_context_proposal_edit_refinement_reload_and_no_render_or_scene_mutation(self):
        before = storage.read_project(self.project.id).model_dump()
        with patch.object(talk, "local_mcp", return_value=copy.deepcopy(TREATMENT)) as provider, patch.object(main, "start_media_generation_job") as render:
            initial = self.client.get(self.url).json()
            provider.assert_not_called()
            self.assertEqual(initial["context"]["scene"]["narration"], "Check for damage.")
            self.assertEqual(self.submit().status_code, 202)
            state = self.finished()
            self.assertEqual(state["draft"]["treatment"], TREATMENT)
            request = provider.call_args.kwargs["video_request"]
            self.assertEqual(request["scene"]["extractedText"], ["Inspect before opening."])
            self.assertEqual(request["scene"]["notes"], "Avoid jargon.")
            self.assertEqual(request["scene"]["actionDescription"], "Emphasize the inspection.")
            self.assertEqual(request["designBrief"], "New operators; safe valve inspection.")
            self.assertNotIn("history", request)
            reviewed = {"sourceRevision": self.project.storyboard.revision, "treatment": copy.deepcopy(TREATMENT)}
            reviewed["treatment"]["shots"][0]["text"] = "Look for damage before opening."
            response = self.client.put(self.url, json=reviewed, headers=self.headers)
            self.assertEqual(response.status_code, 200, response.text)
            self.assertEqual(self.client.get(self.url).json()["draft"]["treatment"], reviewed["treatment"])
            self.assertEqual(self.submit(requestId="request-video-two", direction="Keep my first shot; refine the second.",
                                         currentTreatment=reviewed["treatment"], includeDesignBrief=False).status_code, 202)
            self.finished()
            request = provider.call_args.kwargs["video_request"]
            self.assertEqual(request["currentTreatment"], reviewed["treatment"])
            self.assertEqual(request["designBrief"], "")
            render.assert_not_called()
        self.assertEqual(storage.list_media_generation_jobs(self.project.id), [])
        self.assertEqual(storage.read_project(self.project.id).model_dump(), before)
        other = LOCAL_ACTOR.model_copy(update={"actorId": "another-operator"})
        self.assertIsNone(video.get(self.project.id, self.scene.id, other)["draft"])
        self.assertEqual(video.get(self.project.id, self.scene.id, other)["context"]["designBrief"], "")

    def test_failed_or_invalid_reply_preserves_previous_draft_and_redacts_provider_error(self):
        with patch.object(talk, "local_mcp", return_value=TREATMENT):
            self.submit()
            draft = self.finished()["draft"]
        for index, result in enumerate(({"title": "missing shots"}, {**TREATMENT, "shots": TREATMENT["shots"][:1]})):
            with patch.object(talk, "local_mcp", return_value=result):
                self.submit(requestId=f"request-invalid-{index}")
                state = self.finished()
                self.assertEqual(state["operation"]["status"], "failed")
                self.assertEqual(state["draft"], draft)
        with patch.object(talk, "local_mcp", side_effect=RuntimeError("SECRET provider body")):
            self.submit(requestId="request-provider-error")
            state = self.finished()
            self.assertNotIn("SECRET", state["operation"]["error"])
            self.assertEqual(state["draft"], draft)

    def test_idempotency_running_conflict_and_restart_recovery(self):
        release = Event()
        def produce(**_):
            release.wait(5)
            return TREATMENT
        with patch.object(talk, "local_mcp", side_effect=produce) as provider:
            try:
                self.assertEqual(self.submit().status_code, 202)
                self.assertEqual(self.submit().status_code, 202)
                self.assertEqual(self.submit(direction="Different request").status_code, 409)
                self.assertEqual(self.submit(requestId="request-second").status_code, 409)
            finally:
                release.set()
            self.finished()
            self.assertEqual(self.submit().status_code, 202)
            self.assertEqual(provider.call_count, 1)
        path = video._path(self.project.id, self.scene.id, LOCAL_ACTOR)
        state = video._read(path)
        state["operation"].update(status="running", runId="old-server")
        talk.write_state(path, state)
        with patch.object(talk, "local_mcp") as provider:
            recovered = self.client.get(self.url).json()
            provider.assert_not_called()
        self.assertEqual(recovered["operation"]["status"], "failed")
        self.assertIn("restarted", recovered["operation"]["error"])

    def test_stale_context_and_brief_changes_reject_saves_and_generation(self):
        with patch.object(talk, "local_mcp", return_value=TREATMENT):
            self.submit()
            self.finished()
        path = talk.state_path(self.project.id, LOCAL_ACTOR)
        state = talk.read_state(path)
        state["planning"]["brief"] = "Changed agreed brief."
        talk.write_state(path, state)
        reviewed = {"sourceRevision": self.project.storyboard.revision, "treatment": TREATMENT}
        response = self.client.put(self.url, json=reviewed, headers=self.headers)
        self.assertEqual(response.status_code, 409, response.text)
        self.assertIn("brief changed", response.json()["detail"])
        with patch.object(talk, "local_mcp") as provider:
            self.assertEqual(self.submit(requestId="request-new-brief").status_code, 409)
            provider.assert_not_called()
        storage.update_scene(self.project.id, self.scene.id, SceneUpdate(title="Revised scene"))
        self.assertEqual(self.submit(requestId="request-new").status_code, 409)
        self.assertEqual(self.client.put(self.url, json=reviewed, headers=self.headers).status_code, 409)

    def test_scene_change_during_generation_does_not_save_a_stale_draft(self):
        def produce(**_):
            storage.update_scene(self.project.id, self.scene.id, SceneUpdate(title="Changed"))
            return TREATMENT
        with patch.object(talk, "local_mcp", side_effect=produce):
            self.submit()
            state = self.finished()
        self.assertEqual(state["operation"]["status"], "failed")
        self.assertIsNone(state["draft"])

    def test_validation_origin_and_unknown_scene(self):
        self.assertEqual(self.submit(durationSeconds=31).status_code, 422)
        self.assertEqual(self.submit(direction=" ").status_code, 422)
        response = self.client.post(self.url, json=self.data, headers={"Origin": "https://foreign.example"})
        self.assertEqual(response.status_code, 403)
        response = self.client.get(self.url.replace(self.scene.id, "missing-scene"))
        self.assertEqual(response.status_code, 404)


if __name__ == "__main__":
    unittest.main()
