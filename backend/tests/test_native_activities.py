import copy
import io
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from zipfile import ZipFile

from fastapi.testclient import TestClient
from pydantic import ValidationError

from backend.app import main, storage
from backend.app.backup import build_project_archive, restore_project_archive
from backend.app.experience_models import Experience, ExperienceTreatment
from backend.app.models import AssetAttributionUpdate, ProjectCreate, SceneCreate, SceneUpdate
from backend.app.scorm import _resume_budget_report, build_scorm_12, build_scorm_2004
from backend.app.standalone import build_standalone_course
from backend.tests.test_experience_treatments import EXPERIENCE


ACTIVITIES = [
    {"kind": "branching", "id": "decision", "title": "Handle an incident", "startNodeId": "start",
     "nodes": [
         {"id": "start", "prompt": "What is your first action?", "choices": [
             {"label": "Investigate", "feedback": "Gather evidence.", "nextNodeId": "review"},
             {"label": "Ignore", "feedback": "The incident continues.", "nextNodeId": None}]},
         {"id": "review", "prompt": "What follows investigation?", "choices": [
             {"label": "Report", "feedback": "Share what you found.", "nextNodeId": None},
             {"label": "Wait", "feedback": "Consider the risk of delay.", "nextNodeId": None}]}]},
    {"kind": "hotspots", "id": "diagram", "title": "Explore the system",
     "diagramDescription": "The sensor on the left sends measurements to the controller on the right.",
     "imageAssetId": None,
     "hotspots": [
         {"id": "sensor", "label": "Sensor", "explanation": "Measures the input.", "x": 20, "y": 50},
         {"id": "controller", "label": "Controller", "explanation": "Responds to the measurement.", "x": 80, "y": 50}]},
    {"kind": "sequencing", "id": "order", "title": "Order the response",
     "instruction": "Place the response steps in order.",
     "items": [{"id": "observe", "label": "Observe"}, {"id": "act", "label": "Act"}],
     "feedback": "Observe before acting."},
    {"kind": "guided-practice", "id": "practice", "title": "Practice a response", "steps": [
        {"id": "identify", "prompt": "How do you begin?", "hint": "Start with evidence.", "correctChoiceId": "gather",
         "choices": [
             {"id": "guess", "label": "Guess", "feedback": "Guessing is unreliable."},
             {"id": "gather", "label": "Gather facts", "feedback": "Facts guide the decision."}]},
        {"id": "respond", "prompt": "What comes next?", "hint": "Share your findings.", "correctChoiceId": "report",
         "choices": [
             {"id": "report", "label": "Report findings", "feedback": "Others can now act."},
             {"id": "forget", "label": "Forget it", "feedback": "The risk remains."}]}]},
]


def experience():
    return {**copy.deepcopy(EXPERIENCE), "flow": [], "reveals": [], "activities": copy.deepcopy(ACTIVITIES)}


class NativeActivityTests(unittest.TestCase):
    def test_legacy_and_each_activity_roundtrip_with_provider_schema(self):
        legacy = {key: value for key, value in EXPERIENCE.items() if key != "activities"}
        self.assertEqual(Experience.model_validate(legacy).activities, [])
        legacy_hotspot = copy.deepcopy(ACTIVITIES[1])
        legacy_hotspot.pop("imageAssetId")
        self.assertIsNone(Experience.model_validate({**experience(), "activities": [legacy_hotspot]}).activities[0].imageAssetId)
        for activity in ACTIVITIES:
            with self.subTest(kind=activity["kind"]):
                data = {**experience(), "activities": [activity]}
                self.assertEqual(Experience.model_validate(data).model_dump(), data)
        schema = ExperienceTreatment.model_json_schema()
        self.assertEqual(schema["$defs"]["Experience"]["properties"]["activities"]["items"]["discriminator"]["propertyName"], "kind")

    def test_invalid_branch_graphs_and_duplicate_activity_ids_are_rejected(self):
        for problem in ("cycle", "missing", "unreachable", "duplicate", "bad-start"):
            data = experience()
            branch = data["activities"][0]
            if problem == "cycle":
                branch["nodes"][1]["choices"][0]["nextNodeId"] = "start"
            elif problem == "missing":
                branch["nodes"][0]["choices"][0]["nextNodeId"] = "missing"
            elif problem == "unreachable":
                branch["nodes"][0]["choices"][0]["nextNodeId"] = None
            elif problem == "duplicate":
                branch["nodes"][1]["id"] = "start"
            else:
                branch["startNodeId"] = "unknown"
            with self.subTest(problem=problem), self.assertRaises(ValidationError):
                Experience.model_validate(data)
        data = experience()
        data["activities"].append(copy.deepcopy(data["activities"][0]))
        with self.assertRaises(ValidationError):
            Experience.model_validate(data)

    def test_conditional_branch_variables_are_bounded_and_routes_remain_reachable(self):
        data = experience()
        branch = data["activities"][0]
        branch["variables"] = [{"id": "evidence", "label": "Evidence gathered", "initialValue": False}]
        branch["nodes"][0]["choices"][0]["setVariables"] = [{"variableId": "evidence", "value": True}]
        branch["nodes"][1]["choices"][0]["visibleWhen"] = {"variableId": "evidence", "equals": True}
        branch["nodes"][1]["choices"][1]["visibleWhen"] = {"variableId": "evidence", "equals": False}
        branch["nodes"][1]["choices"].append({
            "label": "Ask for guidance", "feedback": "A second perspective can help.", "nextNodeId": None,
        })
        validated = Experience.model_validate(data)
        self.assertEqual(validated.model_dump(), data)

        invalid_cases = []
        invalid = copy.deepcopy(data)
        invalid["activities"][0]["variables"].append(copy.deepcopy(invalid["activities"][0]["variables"][0]))
        invalid_cases.append(invalid)
        invalid = copy.deepcopy(data)
        invalid["activities"][0]["nodes"][0]["choices"][0]["setVariables"][0]["value"] = "true"
        invalid_cases.append(invalid)
        invalid = copy.deepcopy(data)
        invalid["activities"][0]["nodes"][1]["choices"][0]["visibleWhen"]["variableId"] = "missing"
        invalid_cases.append(invalid)
        invalid = copy.deepcopy(data)
        invalid["activities"][0]["nodes"][0]["choices"][1]["visibleWhen"] = {
            "variableId": "evidence", "equals": True,
        }
        invalid_cases.append(invalid)
        invalid = copy.deepcopy(data)
        invalid["activities"][0]["nodes"][1]["choices"][2]["visibleWhen"] = {
            "variableId": "evidence", "equals": False,
        }
        invalid_cases.append(invalid)
        for invalid in invalid_cases:
            with self.subTest(invalid=invalid["activities"][0]["variables"]), self.assertRaises(ValidationError):
                Experience.model_validate(invalid)

    def test_activity_bounds_unknown_content_and_invalid_answer_rejected(self):
        for problem in ("position", "infinity", "duplicate-point", "duplicate-item", "missing-answer", "duplicate-step", "unknown", "empty", "empty-image"):
            data = experience()
            if problem == "position":
                data["activities"][1]["hotspots"][0]["x"] = 101
            elif problem == "infinity":
                data["activities"][1]["hotspots"][0]["y"] = float("nan")
            elif problem == "duplicate-point":
                data["activities"][1]["hotspots"][1]["id"] = "sensor"
            elif problem == "duplicate-item":
                data["activities"][2]["items"][1]["id"] = "observe"
            elif problem == "missing-answer":
                data["activities"][3]["steps"][0]["correctChoiceId"] = "missing"
            elif problem == "duplicate-step":
                data["activities"][3]["steps"][1]["id"] = "identify"
            elif problem == "unknown":
                data["activities"][0]["script"] = "alert(1)"
            elif problem == "empty-image":
                data["activities"][1]["imageAssetId"] = ""
            else:
                data["activities"][2]["items"] = []
            with self.subTest(problem=problem), self.assertRaises(ValidationError):
                Experience.model_validate(data)

    def test_exact_activity_and_branch_node_limits(self):
        data = experience()
        data["activities"] = [{**copy.deepcopy(ACTIVITIES[2]), "id": f"activity-{i}"} for i in range(8)]
        self.assertEqual(len(Experience.model_validate(data).activities), 8)
        data["activities"].append({**copy.deepcopy(ACTIVITIES[2]), "id": "activity-9"})
        with self.assertRaises(ValidationError):
            Experience.model_validate(data)
        branch = copy.deepcopy(ACTIVITIES[0])
        branch["startNodeId"] = "node-0"
        branch["nodes"] = [{
            "id": f"node-{i}", "prompt": f"Decision {i}", "choices": [
                {"label": "Continue", "feedback": "Consider the next decision.",
                 "nextNodeId": f"node-{i + 1}" if i < 19 else None},
                {"label": "Finish", "feedback": "The route ends here.", "nextNodeId": None}],
        } for i in range(20)]
        data = {**experience(), "activities": [branch]}
        self.assertEqual(len(Experience.model_validate(data).activities[0].nodes), 20)
        branch["nodes"].append({**copy.deepcopy(branch["nodes"][-1]), "id": "node-20"})
        with self.assertRaises(ValidationError):
            Experience.model_validate(data)

    def test_revision_guarded_save_reopen_export_and_resume_budget(self):
        root = Path(self.enterContext(tempfile.TemporaryDirectory()))
        self.enterContext(patch.multiple(storage, ROOT=root, PROJECTS=root / "projects"))
        self.enterContext(patch.object(main, "ROOT", root))
        client = self.enterContext(TestClient(main.app))
        project = storage.create_project(ProjectCreate(title="Native activities"))
        project = storage.create_scene(project.id, SceneCreate(title="Practice"))
        scene = project.storyboard.scenes[0]
        url = f"/api/projects/{project.id}/scenes/{scene.id}"
        headers = {"Origin": "http://127.0.0.1:5173", "If-Match": f'"{project.storyboard.revision}"'}
        self.assertEqual(client.patch(url, json={"experience": experience()}, headers={"Origin": headers["Origin"]}).status_code, 428)
        invalid = experience()
        invalid["activities"][0]["startNodeId"] = "missing"
        self.assertEqual(client.patch(url, json={"experience": invalid}, headers=headers).status_code, 422)
        response = client.patch(url, json={"experience": experience()}, headers=headers)
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(client.patch(url, json={"experience": experience()}, headers=headers).status_code, 412)
        loaded = storage.read_project(project.id)
        self.assertEqual(loaded.storyboard.scenes[0].experience.model_dump(), experience())
        self.assertEqual(client.get(f"/api/projects/{project.id}").json()["storyboard"]["scenes"][0]["experience"], experience())
        estimate = _resume_budget_report(loaded, "SCORM 1.2")
        for builder in (build_scorm_12, build_scorm_2004, build_standalone_course):
            with self.subTest(builder=builder.__name__):
                content, _ = builder(loaded)
                with ZipFile(io.BytesIO(content)) as archive:
                    self.assertEqual(json.loads(archive.read("storyboard.json"))["scenes"][0]["experience"], experience())
                    script = archive.read("player.js").decode()
                    self.assertIn("state.experiences[scene.id] = progress; save()", script)
                    self.assertIn("Text alternative and worked solution", script)
                    self.assertIn('activity.kind === "guided-practice"', script)
        loaded.storyboard.scenes[0].experience = None
        self.assertGreater(estimate["estimatedMaximumBytes"], _resume_budget_report(loaded, "SCORM 1.2")["estimatedMaximumBytes"])

    def test_hotspot_image_is_validated_retained_and_exported(self):
        root = Path(self.enterContext(tempfile.TemporaryDirectory()))
        self.enterContext(patch.multiple(storage, ROOT=root, PROJECTS=root / "projects"))
        self.enterContext(patch.object(main, "ROOT", root))
        client = self.enterContext(TestClient(main.app))
        project = storage.create_project(ProjectCreate(title="Image-backed hotspots"))
        project = storage.create_scene(project.id, SceneCreate(title="Explore"))
        image = storage.add_project_asset(project.id, "system.png", b"\x89PNG\r\n\x1a\nsynthetic image", "image",
            project.storyboard.revision)
        asset = next(asset for asset in image.storyboard.assets if asset.filename == "system.png")
        image = storage.update_project_asset_attribution(project.id, asset.id,
            AssetAttributionUpdate(attributionText="Synthetic image credit", attributionStatus="complete"),
            image.storyboard.revision)
        scene = image.storyboard.scenes[0]
        url = f"/api/projects/{project.id}/scenes/{scene.id}"
        headers = {"Origin": "http://127.0.0.1:5173", "If-Match": f'"{image.storyboard.revision}"'}
        data = experience()
        data["activities"][1]["imageAssetId"] = asset.id

        invalid = copy.deepcopy(data)
        invalid["activities"][1]["imageAssetId"] = "missing-image"
        self.assertEqual(client.patch(url, json={"experience": invalid}, headers=headers).status_code, 422)
        audio_project = storage.add_project_asset(project.id, "sound.wav", b"audio", "audio",
            image.storyboard.revision)
        headers["If-Match"] = f'"{audio_project.storyboard.revision}"'
        invalid["activities"][1]["imageAssetId"] = next(
            item.id for item in audio_project.storyboard.assets if item.filename == "sound.wav"
        )
        self.assertEqual(client.patch(url, json={"experience": invalid}, headers=headers).status_code, 422)

        response = client.patch(url, json={"experience": data}, headers=headers)
        self.assertEqual(response.status_code, 200, response.text)
        loaded = storage.read_project(project.id)
        self.assertEqual(loaded.storyboard.scenes[0].experience.activities[1].imageAssetId, asset.id)
        from backend.app.media import asset_usage, delete_asset
        self.assertEqual(asset_usage(loaded, asset.id)["scenes"][0]["id"], scene.id)
        with self.assertRaisesRegex(ValueError, "Remove this media"):
            delete_asset(project.id, asset.id, loaded.storyboard.revision)

        for builder in (build_scorm_12, build_scorm_2004, build_standalone_course):
            with self.subTest(builder=builder.__name__):
                content, _ = builder(loaded)
                with ZipFile(io.BytesIO(content)) as archive:
                    self.assertIn(asset.path, archive.namelist())
                    published = json.loads(archive.read("storyboard.json"))
                    self.assertEqual(published["scenes"][0]["experience"]["activities"][1]["imageAssetId"], asset.id)
                    script = archive.read("player.js").decode()
                    self.assertIn("globalThis.__CHIMERA_ASSETS", script)

        backup = build_project_archive(project.id)
        current = storage.update_scene(project.id, scene.id, SceneUpdate(experience=None), loaded.storyboard.revision)
        delete_asset(project.id, asset.id, current.storyboard.revision)
        restore_project_archive(project.id, backup)
        restored = storage.read_project(project.id)
        restored_scene = restored.storyboard.scenes[0]
        self.assertEqual(restored_scene.experience.activities[1].imageAssetId, asset.id)
        self.assertTrue((root / "projects" / project.id / asset.path).is_file())
