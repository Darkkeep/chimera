import copy
import io
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from zipfile import ZipFile

from fastapi.testclient import TestClient
from PIL import Image
from pydantic import ValidationError

from backend.app import main, storage
from backend.app.backup import build_project_archive, restore_project_archive
from backend.app.experience_models import Experience, ExperienceTreatment
from backend.app.media import asset_usage, delete_asset
from backend.app.models import AssetAttributionUpdate, ProjectCreate, SceneCreate, SceneUpdate
from backend.app.scorm import build_scorm_12, build_scorm_2004, _resume_budget_report
from backend.app.standalone import build_standalone_course
from backend.app.word_export import build_storyboard_docx, build_sme_storyboard_docx
from backend.tests.test_experience_treatments import EXPERIENCE


def comparison(before="before", after="after"):
    return {"kind": "before-after", "id": "comparison", "title": "Inspect the change",
        "instruction": "Inspect both states and explain what changed.",
        "before": {"imageAssetId": before, "label": "Original state", "altText": "A green landscape.", "description": "The original state is green."},
        "after": {"imageAssetId": after, "label": "Revised state", "altText": "An orange portrait.", "description": "The revised state is orange."},
        "explanation": "The state and aspect ratio changed."}


def experience(activity):
    return {**copy.deepcopy(EXPERIENCE), "flow": [], "reveals": [], "activities": [activity]}


class BeforeAfterTests(unittest.TestCase):
    def test_strict_schema_and_provider_contract(self):
        data = experience(comparison())
        self.assertEqual(Experience.model_validate(data).model_dump(), data)
        self.assertIn("BeforeAfterActivity", ExperienceTreatment.model_json_schema()["$defs"])
        invalid = []
        for field, value in (("explanation", " "), ("instruction", "x" * 2001), ("required", True), ("score", 1)):
            invalid.append({**comparison(), field: value})
        invalid.append(comparison("same", "same"))
        for field, value in (("imageAssetId", ""), ("altText", " "), ("altText", "x" * 501), ("label", "x" * 121), ("description", " "), ("url", "https://example.com")):
            invalid.append({**comparison(), "after": {**comparison()["after"], field: value}})
        for activity in invalid:
            with self.subTest(activity=activity), self.assertRaises(ValidationError):
                Experience.model_validate(experience(activity))

    def test_revision_guards_asset_lifecycle_portable_exports_backup_and_word(self):
        root = Path(self.enterContext(tempfile.TemporaryDirectory()))
        self.enterContext(patch.multiple(storage, ROOT=root, PROJECTS=root / "projects"))
        self.enterContext(patch.object(main, "ROOT", root))
        client = self.enterContext(TestClient(main.app))
        project = storage.create_project(ProjectCreate(title="Synthetic comparison"))
        project = storage.create_scene(project.id, SceneCreate(title="Before and after"))
        assets = []
        colors = [(23, 190, 87), (230, 91, 17)]
        for index, size in enumerate(((120, 60), (60, 120))):
            source = io.BytesIO()
            Image.new("RGB", size, colors[index]).save(source, format="PNG")
            project = storage.add_project_asset(project.id, f"comparison-{index}.png", source.getvalue(), "image", project.storyboard.revision)
            asset = next(item for item in project.storyboard.assets if item.filename == f"comparison-{index}.png")
            project = storage.update_project_asset_attribution(project.id, asset.id,
                AssetAttributionUpdate(attributionText=f"Synthetic image {index}", attributionStatus="complete"), project.storyboard.revision)
            assets.append(asset)
        scene_id = project.storyboard.scenes[0].id
        data = experience(comparison(*(asset.id for asset in assets)))
        url = f"/api/projects/{project.id}/scenes/{scene_id}"
        headers = {"Origin": "http://127.0.0.1:5173", "If-Match": f'"{project.storyboard.revision}"'}
        self.assertEqual(client.patch(url, json={"experience": data}, headers={"Origin": headers["Origin"]}).status_code, 428)
        invalid = copy.deepcopy(data)
        invalid["activities"][0]["after"]["imageAssetId"] = "missing"
        self.assertEqual(client.patch(url, json={"experience": invalid}, headers=headers).status_code, 422)
        scene = project.storyboard.scenes[0].model_copy(update={"experience": Experience.model_validate(data)})
        for index in range(2):
            wrong = {asset.id: asset for asset in assets}
            wrong[assets[index].id] = assets[index].model_copy(update={"kind": "audio"})
            with self.assertRaises(ValueError):
                storage.validate_visual_assets(scene, wrong)
        response = client.patch(url, json={"experience": data}, headers=headers)
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(client.patch(url, json={"experience": data}, headers=headers).status_code, 412)
        project = storage.read_project(project.id)
        self.assertEqual(project.storyboard.scenes[0].experience.model_dump(), data)
        for asset in assets:
            self.assertEqual(asset_usage(project, asset.id)["scenes"][0]["id"], scene_id)
            with self.assertRaisesRegex(ValueError, "Remove this media"):
                delete_asset(project.id, asset.id, project.storyboard.revision)
        budget = _resume_budget_report(project, "SCORM 1.2")
        without_comparison = project.model_copy(deep=True)
        without_comparison.storyboard.scenes[0].experience = None
        self.assertGreater(budget["estimatedMaximumBytes"],
            _resume_budget_report(without_comparison, "SCORM 1.2")["estimatedMaximumBytes"])
        for builder in (build_scorm_12, build_scorm_2004, build_standalone_course):
            with self.subTest(builder=builder.__name__):
                package, _ = builder(project)
                with ZipFile(io.BytesIO(package)) as archive:
                    for asset in assets:
                        self.assertIn(asset.path, archive.namelist())
                    self.assertEqual(json.loads(archive.read("storyboard.json"))["scenes"][0]["experience"], data)
        # Both source colors must survive the real Word renderer, including the static After image.
        for builder in (build_storyboard_docx, build_sme_storyboard_docx):
            with self.subTest(builder=builder.__name__), ZipFile(io.BytesIO(builder(project))) as archive:
                rendered = b"".join(Image.open(io.BytesIO(archive.read(name))).convert("RGB").tobytes()
                    for name in archive.namelist() if name.startswith("word/media/"))
                for color in colors:
                    self.assertGreater(rendered.count(bytes(color)), 100)
        backup = build_project_archive(project.id)
        project = storage.update_scene(project.id, scene_id, SceneUpdate(experience=None), project.storyboard.revision)
        for asset in assets:
            project = delete_asset(project.id, asset.id, project.storyboard.revision)
        restore_project_archive(project.id, backup)
        restored = storage.read_project(project.id)
        self.assertEqual(restored.storyboard.scenes[0].experience.model_dump(), data)
        for asset in assets:
            self.assertTrue((root / "projects" / project.id / asset.path).is_file())
