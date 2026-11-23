"""No-provider regression coverage for genuine Pythia draft -> progressive Studio proposals."""
from pathlib import Path
from unittest.mock import patch
import unittest

from fastapi import HTTPException

from backend.app import progressive_authoring as progressive, progressive_live_drafts as live, pythia_talk as talk, storage
from backend.app.progressive_pythia_adapter import PYTHIA_AUTHORING_FIXTURE
from backend.app.models import SceneUpdate
from backend.app.platform import LOCAL_ACTOR
from backend.tests.test_progressive_authoring import ProgressiveAuthoringTests


class HostedPythiaDraftTransferTests(ProgressiveAuthoringTests):
    def _pending(self):
        return {"id": "completed-pythia-draft-01", "mode": "add-scenes",
                "status": "pending", "sourceRevision": self.project.storyboard.revision,
                "binding": {"sceneRevision": self.project.storyboard.revision, "sources": {}},
                "result": PYTHIA_AUTHORING_FIXTURE}

    def test_completed_real_draft_proposals_without_provider_calls_or_auto_acceptance(self):
        before = storage.read_project(self.project.id)
        action = self._pending()
        state = {"actions": [action]}
        with patch.object(talk, "state_path", return_value=Path("fake-talk-state")), \
             patch.object(talk, "read_state", return_value=state), \
             patch.object(talk, "check_binding"), \
             patch("backend.app.pythia_hosted.author", side_effect=AssertionError("unexpected provider call")):
            page = live.ingest_latest(self.project.id, LOCAL_ACTOR, before.storyboard.revision)
            self.assertEqual(page["status"], "completed")
            self.assertEqual(storage.read_project(self.project.id), before)
            ready = [event for event in page["events"] if event["type"] == "component.ready"]
            self.assertEqual(len(ready), 2)
            self.assertEqual(ready[0]["provenance"]["producer"], "pythia-authored-draft-v1")
            self.assertEqual(page["importReport"]["supportedScenes"], 2)
            self.assertEqual(page["jobId"], live.ingest_latest(self.project.id, LOCAL_ACTOR, before.storyboard.revision)["jobId"])
        accepted = progressive.decide(self.project.id, page["jobId"], "scene-1", self.actor,
                                      "accept", before.storyboard.revision)
        edited = storage.update_scene(self.project.id, accepted.storyboard.scenes[-1].id,
                                      SceneUpdate(title="Owner rewritten first Pythia scene"),
                                      accepted.storyboard.revision)
        final = progressive.decide(self.project.id, page["jobId"], "scene-2", self.actor,
                                   "accept", edited.storyboard.revision)
        self.assertEqual(final.storyboard.scenes[-2].title, "Owner rewritten first Pythia scene")
        self.assertEqual(len(final.storyboard.scenes), len(before.storyboard.scenes) + 2)

    def test_unavailable_or_stale_pythia_draft_cannot_mutate_course(self):
        before = storage.read_project(self.project.id)
        for actions in [[], [{**self._pending(), "status": "drafting"}]]:
            with patch.object(talk, "state_path", return_value=Path("fake-talk-state")), \
                 patch.object(talk, "read_state", return_value={"actions": actions}):
                with self.assertRaises(HTTPException) as issue:
                    live.ingest_latest(self.project.id, LOCAL_ACTOR, before.storyboard.revision)
                self.assertEqual(issue.exception.status_code, 409)
        action = self._pending()
        action["sourceRevision"] = before.storyboard.revision + 1
        with patch.object(talk, "state_path", return_value=Path("fake-talk-state")), \
             patch.object(talk, "read_state", return_value={"actions": [action]}):
            with self.assertRaises(HTTPException):
                live.ingest_latest(self.project.id, LOCAL_ACTOR, before.storyboard.revision)
        self.assertEqual(storage.read_project(self.project.id), before)


if __name__ == "__main__":
    unittest.main()
