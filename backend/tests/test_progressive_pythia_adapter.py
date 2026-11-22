"""Milestone 2 contract tests: verified Pythia AuthoringPlan -> existing proposal.

Fixtures follow Darkkeep/Pythia service/chimera_authoring.py and
tests/evals/test_chimera_authoring.py. No provider calls.
"""
import copy
from pathlib import Path
from threading import Event
import tempfile
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient
from pydantic import ValidationError

from backend.app import main, progressive_authoring as progressive, storage
from backend.app.progressive_pythia_adapter import PYTHIA_AUTHORING_FIXTURE, adapt_scene
from backend.app.models import ProjectCreate, SceneCreate, SceneUpdate
from backend.app.platform import LOCAL_ACTOR


class PythiaAdapterTests(unittest.TestCase):
    def test_actual_pythia_add_scenes_contract_maps_all_supported_fields(self):
        payload, provenance = adapt_scene(PYTHIA_AUTHORING_FIXTURE)
        self.assertEqual(payload["title"], "Inspect before use")
        self.assertEqual(payload["narration"], "Look for signs of damage before continuing.")
        self.assertEqual(payload["actionDescription"], "Invite the learner to name a defect.")
        self.assertEqual(payload["notes"], "Synthetic fixture: no source citations.")
        self.assertEqual(payload["layoutMode"], "native")
        self.assertEqual(payload["sceneType"], "content")
        self.assertEqual(provenance.producer, "pythia-authoring-fixture-v1")
        self.assertEqual(provenance.sourceIds, [])
        self.assertEqual(provenance.locators, [])
        self.assertTrue(provenance.rationale)

    def test_rejects_incompatible_modes_unknown_fields_unsupported_types_and_forged_sources(self):
        invalid = [
            {"mode": "update-scene"},
            {"stopping_boundary": "applied"},
            {"producer_id": "unknown"},
            {"extra": "not in verified Pythia schema"},
            {"changes": [{"field": "title", "value": "Overwrite"}]},
            {"scenes": [{**PYTHIA_AUTHORING_FIXTURE["scenes"][0], "sceneType": "title"}]},
            {"scenes": [{**PYTHIA_AUTHORING_FIXTURE["scenes"][0], "source_refs": ["invented"]}]},
            {"scenes": [{**PYTHIA_AUTHORING_FIXTURE["scenes"][0], "extractedText": []}]},
            {"scenes": [{**PYTHIA_AUTHORING_FIXTURE["scenes"][0], "extractedText": [" "]}]},
            {"scenes": [{**PYTHIA_AUTHORING_FIXTURE["scenes"][0], "extractedText": ["x" * 2001]}]},
        ]
        for change in invalid:
            with self.subTest(change=change):
                candidate = copy.deepcopy(PYTHIA_AUTHORING_FIXTURE)
                candidate.update(change)
                with self.assertRaises((ValidationError, ValueError)):
                    adapt_scene(candidate)
        with self.assertRaises(ValueError):
            adapt_scene(PYTHIA_AUTHORING_FIXTURE, 5)

    def test_fixture_runs_through_existing_event_accept_edit_and_next_scene_contract(self):
        root = Path(self.enterContext(tempfile.TemporaryDirectory()))
        self.enterContext(patch.object(storage, "ROOT", root))
        self.enterContext(patch.object(storage, "PROJECTS", root / "projects"))
        self.enterContext(patch.object(main, "ROOT", root))
        project = storage.create_project(ProjectCreate(title="Pythia fixture rehearsal"))
        project = storage.create_scene(project.id, SceneCreate(title="Original source"), project.storyboard.revision)
        actor = LOCAL_ACTOR.actorId
        job = progressive.submit(project.id, project.storyboard.revision, actor)
        paused, release = Event(), Event()

        def wait():
            paused.set()
            release.wait(5)

        thread = progressive.start(project.id, job["jobId"], actor, lambda: None, wait,
                                   producer="pythia-authoring-fixture-v1")
        try:
            self.assertTrue(paused.wait(5))
            page = progressive.page(project.id, job["jobId"], actor)
            first = [event for event in page["events"] if event["type"] == "component.ready"]
            self.assertEqual(len(first), 1)
            self.assertEqual(first[0]["provenance"]["producer"], "pythia-authoring-fixture-v1")
            self.assertEqual(len(storage.read_project(project.id).storyboard.scenes), 1)
            accepted = progressive.decide(project.id, job["jobId"], "scene-1", actor,
                                          "accept", project.storyboard.revision)
            updated = storage.update_scene(project.id, accepted.storyboard.scenes[-1].id,
                                           SceneUpdate(title="Author edits while Pythia fixture continues"),
                                           accepted.storyboard.revision)
        finally:
            release.set()
            thread.join(5)
        self.assertFalse(thread.is_alive())
        page = progressive.page(project.id, job["jobId"], actor)
        self.assertEqual(page["status"], "completed")
        proposed = [event for event in page["events"] if event["type"] == "component.ready"]
        self.assertEqual(len(proposed), 2)
        self.assertEqual(proposed[1]["provenance"]["producer"], "pythia-authoring-fixture-v1")
        self.assertEqual(storage.read_project(project.id).storyboard.scenes[-1].title,
                         "Author edits while Pythia fixture continues")
        with self.assertRaises(storage.StoryboardRevisionConflict):
            progressive.decide(project.id, job["jobId"], "scene-2", actor,
                               "accept", accepted.storyboard.revision)
        final = progressive.decide(project.id, job["jobId"], "scene-2", actor,
                                   "accept", updated.storyboard.revision)
        self.assertEqual(len(final.storyboard.scenes), 3)
        self.assertEqual(final.storyboard.scenes[-2].title, "Author edits while Pythia fixture continues")
        before = progressive.page(project.id, job["jobId"], actor)["events"]
        self.assertEqual(before, progressive.page(project.id, job["jobId"], actor)["events"])

    def test_fixture_endpoint_is_demo_only_and_rejects_unknown_producers(self):
        with patch.dict("os.environ", {"CHIMERA_PROGRESSIVE_DEMO": "true"}):
            client = TestClient(main.app)
            result = client.post("/api/projects/not-a-project/progressive-jobs?producer=not-valid",
                                 headers={"If-Match": '"1"'})
            self.assertEqual(result.status_code, 422)


if __name__ == "__main__":
    unittest.main()
