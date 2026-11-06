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
from backend.app.models import ProjectCreate, SceneCreate, SceneUpdate
from backend.app.scorm import build_scorm_12, build_scorm_2004, _resume_budget_report
from backend.app.standalone import build_standalone_course
from backend.app.word_export import build_storyboard_docx, build_sme_storyboard_docx
from backend.tests.test_experience_treatments import EXPERIENCE


def external_link(**overrides):
    return {"kind": "external-link", "id": "external", "title": "Synthetic external practice",
            "url": "https://practice.example.invalid/activity", "instruction": "Consider the example and return here.",
            "privacyNotice": "Synthetic service; do not enter personal information.",
            "offlineAlternative": "Read this local example: identify the goal, compare two actions and explain your choice.",
            "authorReviewed": True, **overrides}


def experience(activity):
    return {**copy.deepcopy(EXPERIENCE), "flow": [], "reveals": [], "activities": [activity]}


class ExternalLinkTests(unittest.TestCase):
    def test_strict_schema_and_bounded_urls(self):
        data = experience(external_link())
        self.assertEqual(Experience.model_validate(data).model_dump(), data)
        self.assertIn("ExternalLinkActivity", ExperienceTreatment.model_json_schema()["$defs"])
        for url in ("https://example.invalid", "https://sub.example.invalid/a-b_c~d.txt/", "https://example.invalid/Case123"):
            Experience.model_validate(experience(external_link(url=url)))
        for url in ("http://example.invalid", "javascript:alert(1)", "data:text/html,x", "//example.invalid", "https://localhost",
                    "https://127.0.0.1/", "https://[::1]/", "https://2130706433/", "https://host.local/", "https://host.internal/",
                    "https://user:pass@example.invalid/", "https://example.invalid:443/", "https://example.invalid/?id=learner",
                    "https://example.invalid/#token", "https://example.invalid/%0a", "https://example.invalid/a b",
                    "https://example.invalid\\evil", "https://EXAMPLE.invalid/", "https://exämple.invalid/", "https://-bad.invalid/",
                    "https://example..invalid/", "https://example.invalid/\nx", "https://" + "a" * 64 + ".invalid/", "https://example.invalid/" + "a" * 2000):
            with self.subTest(url=url), self.assertRaises(ValidationError):
                Experience.model_validate(experience(external_link(url=url)))
        for field, value in (("privacyNotice", " "), ("instruction", "x" * 2001), ("offlineAlternative", ""),
                             ("authorReviewed", "true"), ("score", 100), ("iframe", True)):
            with self.subTest(field=field), self.assertRaises(ValidationError):
                Experience.model_validate(experience(external_link(**{field: value})))

    def test_review_revision_exclusivity_exports_backup_and_word(self):
        root = Path(self.enterContext(tempfile.TemporaryDirectory()))
        self.enterContext(patch.multiple(storage, ROOT=root, PROJECTS=root / "projects"))
        self.enterContext(patch.object(main, "ROOT", root))
        client = self.enterContext(TestClient(main.app))
        project = storage.create_project(ProjectCreate(title="Synthetic connected delivery"))
        project = storage.create_scene(project.id, SceneCreate(title="External practice"))
        scene_id = project.storyboard.scenes[0].id
        url = f"/api/projects/{project.id}/scenes/{scene_id}"
        headers = {"Origin": "http://127.0.0.1:5173", "If-Match": f'"{project.storyboard.revision}"'}
        data = experience(external_link())
        self.assertEqual(client.patch(url, json={"experience": data}, headers={"Origin": headers["Origin"]}).status_code, 428)
        for payload in ({"experience": experience(external_link(authorReviewed=False))},
                        {"experience": data, "visualLayout": {"timeline": {}}},
                        {"experience": experience(external_link(url="http://example.invalid"))}):
            self.assertEqual(client.patch(url, json=payload, headers=headers).status_code, 422)
        before = _resume_budget_report(project, "SCORM 1.2")["estimatedMaximumBytes"]
        response = client.patch(url, json={"experience": data}, headers=headers)
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(client.patch(url, json={"experience": data}, headers=headers).status_code, 412)
        project = storage.read_project(project.id)
        self.assertEqual(project.storyboard.scenes[0].experience.model_dump(), data)
        self.assertEqual(_resume_budget_report(project, "SCORM 1.2")["estimatedMaximumBytes"], before)
        for builder in (build_scorm_12, build_scorm_2004, build_standalone_course):
            with self.subTest(builder=builder.__name__):
                package, _ = builder(project)
                with ZipFile(io.BytesIO(package)) as archive:
                    self.assertEqual(json.loads(archive.read("storyboard.json"))["scenes"][0]["experience"], data)
        # Exercise both real Word renderers without any external request.
        for builder in (build_storyboard_docx, build_sme_storyboard_docx):
            with self.subTest(builder=builder.__name__), ZipFile(io.BytesIO(builder(project))) as archive:
                self.assertTrue(any(name.startswith("word/media/") for name in archive.namelist()))
        backup = build_project_archive(project.id)
        storage.update_scene(project.id, scene_id, SceneUpdate(experience=None), project.storyboard.revision)
        restore_project_archive(project.id, backup)
        self.assertEqual(storage.read_project(project.id).storyboard.scenes[0].experience.model_dump(), data)
