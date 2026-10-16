import os
import tempfile
import time
import unittest
from contextlib import ExitStack
from pathlib import Path
from unittest.mock import Mock, patch

import httpx
from fastapi import HTTPException
from fastapi.testclient import TestClient
from starlette.requests import Request

from backend.app import main, storage
from backend.app.learning_intelligence import PythiaProvider, PythiaUnavailableError, validate_storyboard_analysis, validate_storyboard_transformation
from backend.app.models import ProjectCreate, PythiaAnalysisProposalCreate, SceneCreate


def transformation_envelope(project_id: str, scene_ids: list[str]) -> dict[str, object]:
    source_refs = [f"chimera://{project_id}/scenes/{scene_id}" for scene_id in scene_ids]
    return {
        "schema_version": "1.0",
        "artifact": {"type": "storyboard-transformation", "id": "artifact-transform-1", "version": 1},
        "producer": {"skill": "storyboard-transformer", "version": "1.0"},
        "sources": source_refs,
        "status": "draft",
        "validation": {"state": "passed", "validators": ["schema"]},
        "payload": {
            "project_id": project_id,
            "source_scene_ids": scene_ids,
            "source_refs": source_refs,
            "rationale": "Restructure the selected content into clear steps.",
            "proposed_scenes": [{
                "proposal_scene_id": "proposed-scene-1",
                "source_scene_ids": [scene_ids[0]],
                "purpose": "State the immediate action.",
                "title": "Take the immediate action",
                "learner_content": ["Use the nearest marked exit."],
                "interaction_recommendation": "Ask the learner to select an exit.",
                "production_notes": "Emphasize the assembly location.",
                "media_requirements": [],
                "assessment_opportunities": [],
                "rationale": "Keep the first action prominent.",
            }, {
                "proposal_scene_id": "proposed-scene-2",
                "source_scene_ids": [scene_ids[-1]],
                "purpose": "Explain the follow-up action.",
                "title": "Continue to the assembly point",
                "learner_content": ["Leave personal items behind."],
                "interaction_recommendation": "Ask the learner what to do after exiting.",
                "production_notes": "Name the local assembly point.",
                "media_requirements": ["A site-specific assembly point map."],
                "assessment_opportunities": ["Identify the correct follow-up action."],
                "rationale": "Separate follow-up guidance from evacuation steps.",
            }],
        },
    }


class LearningIntelligenceTests(unittest.TestCase):
    def test_provider_defaults_to_local_engine_api(self):
        with patch.dict("os.environ", {}, clear=True):
            provider = PythiaProvider()

        self.assertEqual(provider.base_url, "http://localhost:8000")

    def test_provider_rejects_unsafe_base_urls(self):
        for base_url in (
            "ftp://pythia.example",
            "https://user:secret@pythia.example",
            "https://pythia.example?token=secret",
            "https://pythia.example#fragment",
        ):
            with self.subTest(base_url=base_url), self.assertRaises(ValueError):
                PythiaProvider(base_url)

    def test_submit_task_sends_contract_to_engine_api(self):
        response = Mock()
        response.json.return_value = {"task_id": "chimera-test", "status": "submitted"}
        with patch("backend.app.learning_intelligence.httpx.request", return_value=response) as request:
            result = PythiaProvider("http://localhost:8000/").submit_task({"task_id": "chimera-test"})

        self.assertEqual(result["status"], "submitted")
        request.assert_called_once_with(
            "POST", "http://localhost:8000/tasks", json={"task_id": "chimera-test"}, timeout=10.0,
        )

    def test_http_errors_preserve_status_for_route_translation(self):
        response = Mock()
        response.status_code = 409
        response.text = "duplicate task ID"
        response.raise_for_status.side_effect = httpx.HTTPStatusError("conflict", request=Mock(), response=response)
        with patch("backend.app.learning_intelligence.httpx.request", return_value=response):
            with self.assertRaises(PythiaUnavailableError) as raised:
                PythiaProvider().health()

        self.assertEqual(raised.exception.status_code, 409)

    def test_storyboard_analysis_envelope_must_match_scene_and_schema(self):
        envelope = {
            "artifact": {"type": "storyboard-analysis"},
            "status": "draft",
            "validation": {"state": "passed"},
            "producer": {"skill": "storyboard-producer"},
            "payload": {
                "project_id": "course-123",
                "scene_id": "scene_a81f73",
                "source_refs": [],
                "findings": [],
                "recommendations": [],
                "uncertainties": [],
                "review_questions": [],
            },
        }

        self.assertIs(validate_storyboard_analysis(envelope, "course-123", "scene_a81f73"), envelope)
        with self.assertRaisesRegex(ValueError, "does not match"):
            validate_storyboard_analysis(envelope, "other-course", "scene_a81f73")

    def test_storyboard_analysis_rejects_unstructured_findings(self):
        envelope = {
            "artifact": {"type": "storyboard-analysis"},
            "status": "draft",
            "validation": {"state": "passed"},
            "producer": {"skill": "storyboard-producer"},
            "payload": {
                "project_id": "course-123",
                "scene_id": "scene_a81f73",
                "source_refs": [],
                "findings": ["Identifier-only result"],
                "recommendations": [],
                "uncertainties": [],
                "review_questions": [],
            },
        }

        with self.assertRaisesRegex(ValueError, "findings must contain objects"):
            validate_storyboard_analysis(envelope, "course-123", "scene_a81f73")

    def test_storyboard_transformation_requires_a_valid_selected_scene_proposal(self):
        source_ref = "chimera://course-123/scenes/scene_a81f73"
        envelope = {
            "schema_version": "1.0",
            "artifact": {"type": "storyboard-transformation", "id": "artifact-1", "version": 1},
            "producer": {"skill": "storyboard-transformer", "version": "1.0"},
            "sources": [source_ref],
            "status": "draft",
            "validation": {"state": "passed", "validators": ["schema"]},
            "payload": {
                "project_id": "course-123",
                "source_scene_ids": ["scene_a81f73"],
                "source_refs": [source_ref],
                "rationale": "Split the instruction into a sequence.",
                "proposed_scenes": [{
                    "proposal_scene_id": "proposed-scene-1",
                    "source_scene_ids": ["scene_a81f73"],
                    "purpose": "Explain the immediate response.",
                    "title": "Leave immediately",
                    "learner_content": ["Use the nearest marked exit."],
                    "interaction_recommendation": "Ask the learner to identify an exit.",
                    "production_notes": "Emphasize the assembly location.",
                    "media_requirements": [],
                    "assessment_opportunities": [],
                    "rationale": "Keep the immediate action prominent.",
                }],
            },
        }

        self.assertIs(validate_storyboard_transformation(envelope, "course-123", ["scene_a81f73"]), envelope)
        with self.assertRaisesRegex(ValueError, "selected scenes"):
            validate_storyboard_transformation(envelope, "course-123", ["other-scene"])
        invalid_sources = {**envelope, "payload": {**envelope["payload"], "source_refs": ["chimera://other/scenes/other"]}}
        with self.assertRaisesRegex(ValueError, "source_refs"):
            validate_storyboard_transformation(invalid_sources, "course-123", ["scene_a81f73"])


class PythiaRouteTests(unittest.TestCase):
    def setUp(self):
        self.stack = ExitStack()
        self.addCleanup(self.stack.close)
        self.root = Path(self.stack.enter_context(tempfile.TemporaryDirectory()))
        self.stack.enter_context(patch.multiple(storage, ROOT=self.root, PROJECTS=self.root / "projects"))
        self.stack.enter_context(patch.object(main, "ROOT", self.root))
        self.project = storage.create_project(ProjectCreate(title="Pythia fixture"))
        self.project = storage.create_scene(self.project.id, SceneCreate(
            title="Stable scene",
            extractedText=["First screen text", "Second screen text"],
            actionDescription="Choose the nearest exit.",
            notes="Emphasize the local assembly point.",
        ))
        self.scene = self.project.storyboard.scenes[0]

    def test_hosted_pythia_proposal_routes_require_review_permissions(self):
        def request_for(path):
            return Request({
                "type": "http",
                "method": "POST",
                "path": path,
                "headers": [],
                "query_string": b"",
                "scheme": "http",
                "server": ("testserver", 80),
            })

        self.assertEqual(
            main._hosted_request_action(request_for(f"/api/projects/{self.project.id}/pythia-analysis-proposals")),
            "enhancement.proposal.create",
        )
        self.assertEqual(
            main._hosted_request_action(request_for(f"/api/projects/{self.project.id}/pythia-analysis-proposals/proposal-1/decision")),
            "enhancement.proposal.decide",
        )

    def test_submit_uses_only_the_scene_scoped_task_contract(self):
        provider = Mock()
        provider.health.return_value = {"status": "ok", "version": "1.0"}
        provider.capabilities.return_value = {"capabilities": [{"id": "storyboard.analyze", "provider": "synthetic"}]}
        provider.submit_task.side_effect = lambda request: {"task_id": request["task_id"], "status": "submitted"}
        with patch.object(main, "PythiaProvider", return_value=provider):
            task = main.submit_pythia_analysis(self.project.id, self.scene.id)

        request = provider.submit_task.call_args.args[0]
        self.assertEqual(task["status"], "submitted")
        self.assertEqual(task["source_revision"], self.project.storyboard.revision)
        self.assertEqual(request["schema_version"], "1.0")
        self.assertEqual(request["capability"], "storyboard.analyze")
        self.assertEqual(request["consumer"], "chimera")
        self.assertEqual(request["project_id"], self.project.id)
        self.assertEqual(request["inputs"], [{
            "scene_id": self.scene.id,
            "source_ref": f"chimera://{self.project.id}/scenes/{self.scene.id}",
            "scene_content": {
                "title": "Stable scene",
                "body_text": "First screen text\nSecond screen text\nChoose the nearest exit.",
                "speaker_notes": "Emphasize the local assembly point.",
                "objective_ids": [],
            },
        }])
        self.assertEqual(request["constraints"], {})
        self.assertEqual(request["context"], {})

    def test_transform_submit_preserves_selected_scene_order_and_content(self):
        self.project = storage.create_scene(self.project.id, SceneCreate(
            title="Second scene",
            extractedText=["Keep the route clear."],
            notes="Connect this instruction to the alarm.",
        ))
        second_scene = self.project.storyboard.scenes[-1]
        provider = Mock()
        provider.health.return_value = {"status": "ok", "version": "1.0"}
        provider.capabilities.return_value = {"capabilities": [{"id": "storyboard.transform"}]}
        provider.submit_task.side_effect = lambda request: {"task_id": request["task_id"], "status": "submitted"}
        with patch.object(main, "PythiaProvider", return_value=provider):
            status = main.get_pythia_status(self.project.id)
            task = main.submit_pythia_transform(self.project.id, main.PythiaTransformRequest(
                sceneIds=[second_scene.id, self.scene.id],
                constraints={"audience": "new staff"},
            ))

        request = provider.submit_task.call_args.args[0]
        self.assertTrue(status["supportsStoryboardTransform"])
        self.assertEqual(task["source_revision"], self.project.storyboard.revision)
        self.assertEqual(task["source_scene_ids"], [self.scene.id, second_scene.id])
        self.assertEqual(request["capability"], "storyboard.transform")
        self.assertEqual([item["scene_id"] for item in request["inputs"]], [self.scene.id, second_scene.id])
        self.assertEqual(request["inputs"][1]["scene_content"]["body_text"], "Keep the route clear.")
        self.assertEqual(request["inputs"][1]["scene_content"]["speaker_notes"], "Connect this instruction to the alarm.")
        self.assertEqual(request["constraints"], {"audience": "new staff"})

    def test_transform_submit_refuses_unadvertised_capability(self):
        provider = Mock()
        provider.health.return_value = {"status": "ok"}
        provider.capabilities.return_value = {"capabilities": [{"id": "storyboard.analyze"}]}
        with patch.object(main, "PythiaProvider", return_value=provider):
            with self.assertRaises(HTTPException) as raised:
                main.submit_pythia_transform(self.project.id, main.PythiaTransformRequest(sceneIds=[self.scene.id]))

        self.assertEqual(raised.exception.status_code, 422)
        provider.submit_task.assert_not_called()

    def test_transform_proposal_accept_replaces_only_selected_scenes_and_writes_history(self):
        self.project = storage.create_scene(self.project.id, SceneCreate(title="Unselected scene"))
        unselected = self.project.storyboard.scenes[-1]
        self.project = storage.create_scene(self.project.id, SceneCreate(title="Second selected scene"))
        second_selected = self.project.storyboard.scenes[-1]
        source_scene_ids = [self.scene.id, second_selected.id]
        source_revision = self.project.storyboard.revision
        provider = Mock()
        provider.task_status.return_value = {
            "task_id": "task-transform-1",
            "project_id": self.project.id,
            "consumer": "chimera",
            "status": "awaiting_review",
            "artifact_id": "artifact-transform-1",
        }
        artifact = transformation_envelope(self.project.id, source_scene_ids)
        edited_scenes = artifact["payload"]["proposed_scenes"]
        edited_scenes[0]["title"] = "Edited immediate action"
        provider.artifact.return_value = artifact
        with patch.object(main, "PythiaProvider", return_value=provider), TestClient(main.app) as client:
            created = client.post(
                f"/api/projects/{self.project.id}/pythia-transform-proposals",
                json={
                    "taskId": "task-transform-1",
                    "artifactId": "artifact-transform-1",
                    "sourceSceneIds": source_scene_ids,
                    "sourceRevision": source_revision,
                },
            )
            listed = client.get(f"/api/projects/{self.project.id}/pythia-transform-proposals")
            readiness = client.get(f"/api/projects/{self.project.id}/readiness")
            before_accept = storage.read_project(self.project.id)
            accepted = client.post(
                f"/api/projects/{self.project.id}/pythia-transform-proposals/{created.json()['id']}/decision",
                headers={"If-Match": f'"{source_revision}"'},
                json={"decision": "accept", "proposedScenes": edited_scenes},
            )

        self.assertEqual(created.status_code, 201, created.text)
        self.assertEqual(listed.status_code, 200, listed.text)
        self.assertEqual(listed.json()[0]["status"], "pending")
        self.assertEqual(readiness.json()["pendingProposals"], 1)
        self.assertEqual(before_accept.storyboard.revision, source_revision)
        self.assertEqual(accepted.status_code, 200, accepted.text)
        self.assertEqual(accepted.json()["proposal"]["status"], "accepted")
        project = storage.read_project(self.project.id)
        self.assertEqual(project.storyboard.revision, source_revision + 1)
        self.assertEqual(
            [scene.title for scene in project.storyboard.scenes],
            ["Edited immediate action", "Continue to the assembly point", unselected.title],
        )
        self.assertEqual(accepted.json()["proposal"]["decisionHistory"][0]["acceptedScenes"][0]["title"], "Edited immediate action")
        self.assertTrue(list((storage.project_path(self.project.id) / "history").glob("storyboard-*.json")))

    def test_transform_proposal_reject_leaves_storyboard_unchanged(self):
        source_scene_ids = [self.scene.id]
        source_revision = self.project.storyboard.revision
        provider = Mock()
        provider.task_status.return_value = {
            "task_id": "task-transform-1",
            "project_id": self.project.id,
            "consumer": "chimera",
            "status": "awaiting_review",
            "artifact_id": "artifact-transform-1",
        }
        provider.artifact.return_value = transformation_envelope(self.project.id, source_scene_ids)
        with patch.object(main, "PythiaProvider", return_value=provider), TestClient(main.app) as client:
            created = client.post(
                f"/api/projects/{self.project.id}/pythia-transform-proposals",
                json={
                    "taskId": "task-transform-1",
                    "artifactId": "artifact-transform-1",
                    "sourceSceneIds": source_scene_ids,
                    "sourceRevision": source_revision,
                },
            )
            rejected = client.post(
                f"/api/projects/{self.project.id}/pythia-transform-proposals/{created.json()['id']}/decision",
                headers={"If-Match": f'"{source_revision}"'},
                json={"decision": "reject"},
            )

        self.assertEqual(rejected.status_code, 200, rejected.text)
        self.assertEqual(rejected.json()["proposal"]["status"], "rejected")
        self.assertEqual(storage.read_project(self.project.id).storyboard.revision, source_revision)
        self.assertEqual(storage.read_project(self.project.id).storyboard.scenes[0].title, self.scene.title)

    def test_transform_proposal_cannot_be_accepted_after_source_revision_changes(self):
        source_scene_ids = [self.scene.id]
        source_revision = self.project.storyboard.revision
        provider = Mock()
        provider.task_status.return_value = {
            "task_id": "task-transform-1",
            "project_id": self.project.id,
            "consumer": "chimera",
            "status": "awaiting_review",
            "artifact_id": "artifact-transform-1",
        }
        provider.artifact.return_value = transformation_envelope(self.project.id, source_scene_ids)
        with patch.object(main, "PythiaProvider", return_value=provider), TestClient(main.app) as client:
            created = client.post(
                f"/api/projects/{self.project.id}/pythia-transform-proposals",
                json={
                    "taskId": "task-transform-1",
                    "artifactId": "artifact-transform-1",
                    "sourceSceneIds": source_scene_ids,
                    "sourceRevision": source_revision,
                },
            )
            self.project = storage.create_scene(self.project.id, SceneCreate(title="Author's newer scene"))
            current_revision = self.project.storyboard.revision
            accepted = client.post(
                f"/api/projects/{self.project.id}/pythia-transform-proposals/{created.json()['id']}/decision",
                headers={"If-Match": f'"{current_revision}"'},
                json={"decision": "accept"},
            )

        self.assertEqual(accepted.status_code, 409, accepted.text)
        self.assertEqual(storage.list_pythia_transform_proposals(self.project.id)[0].status, "stale")
        self.assertEqual(storage.read_project(self.project.id).storyboard.revision, current_revision)
        self.assertEqual(storage.read_project(self.project.id).storyboard.scenes[0].title, self.scene.title)

    def test_submit_refuses_unadvertised_capability(self):
        provider = Mock()
        provider.health.return_value = {"status": "ok"}
        provider.capabilities.return_value = {"capabilities": [{"id": "other.capability"}]}
        with patch.object(main, "PythiaProvider", return_value=provider):
            with self.assertRaises(HTTPException) as raised:
                main.submit_pythia_analysis(self.project.id, self.scene.id)

        self.assertEqual(raised.exception.status_code, 422)
        provider.submit_task.assert_not_called()

    def test_resubmission_uses_a_new_task_id(self):
        provider = Mock()
        provider.health.return_value = {"status": "ok"}
        provider.capabilities.return_value = {"capabilities": [{"id": "storyboard.analyze"}]}
        provider.submit_task.side_effect = lambda request: {"task_id": request["task_id"], "status": "submitted"}
        with patch.object(main, "PythiaProvider", return_value=provider):
            first = main.submit_pythia_analysis(self.project.id, self.scene.id)
            second = main.submit_pythia_analysis(self.project.id, self.scene.id)

        self.assertNotEqual(first["task_id"], second["task_id"])

    def test_invalid_pythia_configuration_returns_recoverable_unavailable(self):
        with patch.dict("os.environ", {"CHIMERA_PYTHIA_BASE_URL": "ftp://invalid.example"}):
            with self.assertRaises(HTTPException) as raised:
                main.get_pythia_status(self.project.id)

        self.assertEqual(raised.exception.status_code, 503)

    def test_task_status_cannot_cross_project_boundaries(self):
        provider = Mock()
        provider.task_status.return_value = {"project_id": "other-project", "consumer": "chimera"}
        with patch.object(main, "PythiaProvider", return_value=provider):
            with self.assertRaises(HTTPException) as raised:
                main.get_pythia_task(self.project.id, "foreign-task")

        self.assertEqual(raised.exception.status_code, 404)

    def test_pythia_analysis_proposal_is_persisted_and_review_does_not_mutate_storyboard(self):
        source_ref = f"chimera://{self.project.id}/scenes/{self.scene.id}"
        provider = Mock()
        provider.task_status.return_value = {
            "task_id": "task-analysis-1",
            "project_id": self.project.id,
            "consumer": "chimera",
            "status": "awaiting_review",
            "artifact_id": "artifact-analysis-1",
        }
        provider.artifact.return_value = {
            "artifact": {"type": "storyboard-analysis"},
            "status": "draft",
            "validation": {"state": "passed"},
            "producer": {"skill": "storyboard-producer"},
            "payload": {
                "project_id": self.project.id,
                "scene_id": self.scene.id,
                "source_refs": [source_ref],
                "findings": [{
                    "id": "finding-1",
                    "category": "content_clarity",
                    "statement": "The evacuation action is clear.",
                    "evidence_refs": [source_ref],
                    "uncertainty": "The assembly location is not named.",
                }],
                "recommendations": [{
                    "id": "recommendation-1",
                    "statement": "Name the assembly location.",
                    "finding_refs": ["finding-1"],
                }],
                "uncertainties": [],
                "review_questions": [],
            },
        }
        source_revision = self.project.storyboard.revision
        with patch.object(main, "PythiaProvider", return_value=provider), TestClient(main.app) as client:
            created = client.post(
                f"/api/projects/{self.project.id}/pythia-analysis-proposals",
                json={
                    "taskId": "task-analysis-1",
                    "artifactId": "artifact-analysis-1",
                    "sceneId": self.scene.id,
                    "sourceRevision": source_revision,
                },
            )
            listed = client.get(f"/api/projects/{self.project.id}/pythia-analysis-proposals")
            readiness = client.get(f"/api/projects/{self.project.id}/readiness")
            repeated = client.post(
                f"/api/projects/{self.project.id}/pythia-analysis-proposals",
                json={
                    "taskId": "task-analysis-1",
                    "artifactId": "artifact-analysis-1",
                    "sceneId": self.scene.id,
                    "sourceRevision": source_revision,
                },
            )
            proposal_id = created.json()["id"]
            accepted = client.post(
                f"/api/projects/{self.project.id}/pythia-analysis-proposals/{proposal_id}/decision",
                json={"decision": "accept"},
            )

        self.assertEqual(created.status_code, 201, created.text)
        self.assertEqual(listed.status_code, 200, listed.text)
        self.assertEqual(len(listed.json()), 1)
        self.assertEqual(readiness.json()["pendingProposals"], 1)
        self.assertEqual(repeated.json()["id"], proposal_id)
        self.assertEqual(accepted.json()["status"], "accepted")
        self.assertEqual(accepted.json()["artifact"]["payload"]["findings"][0]["id"], "finding-1")
        self.assertEqual(accepted.json()["decisionHistory"][0]["storyboardRevision"], source_revision)
        self.assertEqual(storage.read_project(self.project.id).storyboard.revision, source_revision)

    def test_pythia_proposal_requires_task_artifact_match(self):
        provider = Mock()
        provider.task_status.return_value = {
            "task_id": "task-analysis-1",
            "project_id": self.project.id,
            "consumer": "chimera",
            "status": "awaiting_review",
            "artifact_id": "actual-artifact",
        }
        with patch.object(main, "PythiaProvider", return_value=provider), TestClient(main.app) as client:
            response = client.post(
                f"/api/projects/{self.project.id}/pythia-analysis-proposals",
                json={
                    "taskId": "task-analysis-1",
                    "artifactId": "different-artifact",
                    "sceneId": self.scene.id,
                    "sourceRevision": self.project.storyboard.revision,
                },
            )

        self.assertEqual(response.status_code, 409, response.text)
        provider.artifact.assert_not_called()

    def test_valid_artifact_is_returned_without_storyboard_mutation(self):
        provider = Mock()
        provider.artifact.return_value = {
            "artifact": {"type": "storyboard-analysis"},
            "status": "draft",
            "validation": {"state": "passed"},
            "producer": {"skill": "storyboard-producer"},
            "payload": {
                "project_id": self.project.id,
                "scene_id": self.scene.id,
                "source_refs": [f"chimera://{self.project.id}/scenes/{self.scene.id}"],
                "findings": [{
                    "id": "evacuation-route",
                    "category": "content_clarity",
                    "statement": "The scene identifies the required evacuation action.",
                    "evidence_refs": [f"chimera://{self.project.id}/scenes/{self.scene.id}"],
                    "uncertainty": "The destination is not named.",
                }],
                "recommendations": [{
                    "id": "name-assembly-point",
                    "statement": "Name the designated assembly point.",
                    "finding_refs": ["evacuation-route"],
                }],
                "uncertainties": [],
                "review_questions": [],
            },
        }
        with patch.object(main, "PythiaProvider", return_value=provider):
            result = main.get_pythia_artifact(self.project.id, self.scene.id, "fixture.artifact")

        self.assertEqual(result["payload"]["scene_id"], self.scene.id)
        self.assertEqual(storage.read_project(self.project.id).storyboard.revision, self.project.storyboard.revision)

    def test_http_round_trip_discovers_submits_polls_and_retrieves_draft(self):
        provider = Mock()
        provider.health.return_value = {"status": "ok", "version": "1.0"}
        provider.capabilities.return_value = {"capabilities": [{"id": "storyboard.analyze", "provider": "synthetic"}]}
        provider.submit_task.side_effect = lambda request: {
            "task_id": request["task_id"], "project_id": self.project.id, "consumer": "chimera", "status": "submitted",
        }
        provider.task_status.side_effect = lambda task_id: {
            "task_id": task_id, "project_id": self.project.id, "consumer": "chimera", "status": "awaiting_review",
            "artifact_id": "fixture.artifact",
        }
        provider.artifact.return_value = {
            "artifact": {"type": "storyboard-analysis"},
            "status": "draft",
            "validation": {"state": "passed"},
            "producer": {"skill": "storyboard-producer"},
            "payload": {
                "project_id": self.project.id,
                "scene_id": self.scene.id,
                "source_refs": [f"chimera://{self.project.id}/scenes/{self.scene.id}"],
                "findings": [{
                    "id": "synthetic-finding",
                    "category": "content_clarity",
                    "statement": "Synthetic fixture finding.",
                    "evidence_refs": [f"chimera://{self.project.id}/scenes/{self.scene.id}"],
                    "uncertainty": "The synthetic fixture has no additional context.",
                }],
                "recommendations": [{
                    "id": "synthetic-recommendation",
                    "statement": "Review the synthetic finding.",
                    "finding_refs": ["synthetic-finding"],
                }],
                "uncertainties": [],
                "review_questions": [],
            },
        }
        with patch.object(main, "PythiaProvider", return_value=provider), TestClient(main.app) as client:
            status = client.get(f"/api/projects/{self.project.id}/pythia-status")
            submitted = client.post(f"/api/projects/{self.project.id}/scenes/{self.scene.id}/pythia-analysis")
            task_id = submitted.json()["task_id"]
            polled = client.get(f"/api/projects/{self.project.id}/pythia-tasks/{task_id}")
            artifact = client.get(
                f"/api/projects/{self.project.id}/scenes/{self.scene.id}/pythia-artifacts/fixture.artifact",
            )

        self.assertEqual(status.status_code, 200, status.text)
        self.assertTrue(status.json()["supportsStoryboardAnalyze"])
        self.assertEqual(submitted.status_code, 202, submitted.text)
        self.assertEqual(submitted.json()["status"], "submitted")
        self.assertEqual(polled.json()["status"], "awaiting_review")
        self.assertEqual(artifact.json()["payload"]["findings"][0]["id"], "synthetic-finding")
        self.assertEqual(artifact.json()["payload"]["recommendations"][0]["finding_refs"], ["synthetic-finding"])
        self.assertEqual(storage.read_project(self.project.id).storyboard.revision, self.project.storyboard.revision)

    @unittest.skipUnless(os.environ.get("CHIMERA_PYTHIA_INTEGRATION") == "1", "set CHIMERA_PYTHIA_INTEGRATION=1 to call local Pythia")
    def test_live_pythia_round_trip_with_fixture_scene_content(self):
        self.project = storage.create_scene(self.project.id, SceneCreate(
            title="Respond to a fire alarm",
            extractedText=["Leave by the nearest marked exit and assemble at the designated area. Do not retrieve personal items."],
            notes="Emphasize the local assembly point and the reason personal items must be left behind.",
        ))
        scene = self.project.storyboard.scenes[-1]
        revision = self.project.storyboard.revision
        base_url = os.environ.get("CHIMERA_PYTHIA_BASE_URL", "http://127.0.0.1:8001")

        with patch.dict("os.environ", {"CHIMERA_PYTHIA_BASE_URL": base_url}):
            task = main.submit_pythia_analysis(self.project.id, scene.id)
            source_revision = task["source_revision"]
            deadline = time.monotonic() + 20
            while task.get("status") in {"submitted", "queued", "running"} and time.monotonic() < deadline:
                time.sleep(0.1)
                task = main.get_pythia_task(self.project.id, task["task_id"])

            self.assertEqual(task.get("status"), "awaiting_review", task)
            self.assertIsInstance(task.get("artifact_id"), str)
            artifact = main.get_pythia_artifact(self.project.id, scene.id, task["artifact_id"])
            proposal = main.post_pythia_analysis_proposal(self.project.id, PythiaAnalysisProposalCreate(
                taskId=task["task_id"],
                artifactId=task["artifact_id"],
                sceneId=scene.id,
                sourceRevision=source_revision,
            ))
            decided = main.post_pythia_analysis_proposal_decision(
                self.project.id,
                proposal.id,
                main.PythiaAnalysisProposalDecision(decision="accept"),
            )

        self.assertEqual(artifact["payload"]["project_id"], self.project.id)
        self.assertEqual(artifact["payload"]["scene_id"], scene.id)
        self.assertEqual(proposal.status, "pending")
        self.assertEqual(decided.status, "accepted")
        self.assertTrue(artifact["payload"]["findings"])
        self.assertTrue(all(
            isinstance(item, dict) and isinstance(item.get("id"), str)
            and isinstance(item.get("statement"), str) and item.get("evidence_refs")
            for item in artifact["payload"]["findings"]
        ))
        self.assertTrue(all(isinstance(item, dict) for item in artifact["payload"]["recommendations"]))
        self.assertEqual(storage.read_project(self.project.id).storyboard.revision, revision)

    @unittest.skipUnless(os.environ.get("CHIMERA_PYTHIA_TRANSFORM_INTEGRATION") == "1", "set CHIMERA_PYTHIA_TRANSFORM_INTEGRATION=1 to call local Pythia")
    def test_live_pythia_transform_round_trip_persists_and_accepts_proposal(self):
        self.project = storage.create_scene(self.project.id, SceneCreate(
            title="Respond to a fire alarm",
            extractedText=["Leave by the nearest marked exit."],
            notes="Emphasize the local assembly point.",
        ))
        self.project = storage.create_scene(self.project.id, SceneCreate(
            title="Support others safely",
            extractedText=["Report missing colleagues only after reaching the assembly area."],
            notes="Do not re-enter the building.",
        ))
        source_scenes = self.project.storyboard.scenes[-2:]
        source_scene_ids = [scene.id for scene in source_scenes]
        base_url = os.environ.get("CHIMERA_PYTHIA_BASE_URL", "http://127.0.0.1:8002")

        with patch.dict("os.environ", {"CHIMERA_PYTHIA_BASE_URL": base_url}):
            submitted = main.submit_pythia_transform(
                self.project.id,
                main.PythiaTransformRequest(sceneIds=source_scene_ids),
            )
            source_revision = submitted["source_revision"]
            task = submitted
            deadline = time.monotonic() + 20
            while task.get("status") in {"submitted", "queued", "running"} and time.monotonic() < deadline:
                time.sleep(0.1)
                task = main.get_pythia_task(self.project.id, submitted["task_id"])

            self.assertEqual(task.get("status"), "awaiting_review", task)
            proposal = main.post_pythia_transform_proposal(self.project.id, main.PythiaTransformProposalCreate(
                taskId=task["task_id"],
                artifactId=task["artifact_id"],
                sourceSceneIds=source_scene_ids,
                sourceRevision=source_revision,
            ))
            result = main.post_pythia_transform_proposal_decision(
                self.project.id,
                proposal.id,
                main.PythiaTransformProposalDecision(decision="accept"),
                if_match=f'"{source_revision}"',
            )

        self.assertEqual(proposal.status, "pending")
        self.assertEqual(proposal.artifact["artifact"]["type"], "storyboard-transformation")
        self.assertTrue(proposal.artifact["payload"]["proposed_scenes"])
        self.assertEqual(result.proposal.status, "accepted")
        self.assertEqual(result.project.storyboard.revision, source_revision + 1)
        self.assertEqual(len(result.project.storyboard.scenes), 3)
        self.assertEqual(result.project.storyboard.scenes[0].title, self.scene.title)
        self.assertEqual(len(result.project.storyboard.scenes[1:]), len(proposal.artifact["payload"]["proposed_scenes"]))


if __name__ == "__main__":
    unittest.main()