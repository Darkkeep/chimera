import hashlib
import json
import tempfile
import unittest
from contextlib import ExitStack
from pathlib import Path
from unittest.mock import patch
from xml.etree import ElementTree as ET

from fastapi.testclient import TestClient

from backend.app import main, storage
from backend.app.models import ProjectCreate, SceneCreate
from backend.app.qti import assessment_item_xml


class QuestionImportApiTests(unittest.TestCase):
    def setUp(self):
        self.stack = ExitStack()
        self.addCleanup(self.stack.close)
        root = Path(self.stack.enter_context(tempfile.TemporaryDirectory()))
        self.stack.enter_context(patch.multiple(storage, ROOT=root, PROJECTS=root / "projects"))
        self.stack.enter_context(patch.object(main, "ROOT", root))
        self.client = self.stack.enter_context(TestClient(main.app))
        self.project = storage.create_project(ProjectCreate(title="Imported assessment"))
        self.base = f"/api/projects/{self.project.id}"
        self.metadata = {
            "title": "Safety knowledge check", "description": "Verify safe operation.",
            "tags": ["safety", "equipment"], "author": "Training team", "source": "Local policy",
            "language": "en-US", "difficulty": "medium", "learningObjectiveRefs": ["OBJ-1", "OBJ-2"],
        }

    def revision(self):
        return storage.read_project(self.project.id).storyboard.revision

    def item_xml(self, identifier="SAFETY"):
        from backend.app.models import Scene
        scene = Scene(id="source", title="Safety", assessmentItem={
            "identifier": identifier, "type": "true-false", "prompt": "Inspect before use?",
            "correctResponse": "true", "metadata": self.metadata,
        })
        return assessment_item_xml(scene)

    def preview(self, content=None, filename="question.xml"):
        return self.client.post(self.base + "/question-import/preview", files={"file": (filename, content or self.item_xml())})

    def commit(self, review, content=None, selected=None, **fields):
        return self.client.post(self.base + "/question-import",
                                files={"file": ("question.xml", content or self.item_xml())},
                                data={"selected": json.dumps([0] if selected is None else selected), "digest": review["digest"], "confirm_warnings": "true", **fields},
                                headers={"If-Match": f'"{review["revision"]}"'})

    def test_review_is_read_only_and_commit_preserves_metadata(self):
        before = self.revision()
        response = self.preview()
        self.assertEqual(response.status_code, 200, response.text)
        review = response.json()
        self.assertEqual(review["digest"], hashlib.sha256(self.item_xml()).hexdigest())
        self.assertEqual(review["questions"][0]["item"]["metadata"], self.metadata)
        self.assertEqual(review["questions"][0]["errors"], [])
        self.assertEqual(self.revision(), before)
        self.assertEqual(storage.read_project(self.project.id).storyboard.scenes, [])
        result = self.commit(review)
        self.assertEqual(result.status_code, 200, result.text)
        imported = result.json()["storyboard"]["scenes"][0]
        self.assertEqual(imported["assessmentItem"]["metadata"], self.metadata)
        self.assertEqual(imported["sceneType"], "question")
        self.assertEqual(self.revision(), before + 1)

    def test_duplicates_and_repeated_commit_never_overwrite(self):
        review = self.preview().json()
        self.assertEqual(self.commit(review).status_code, 200)
        self.assertEqual(self.commit(review).status_code, 412)
        response = self.preview()
        self.assertIn("already exists", " ".join(response.json()["questions"][0]["errors"]))
        before = self.revision()
        self.assertEqual(self.commit(response.json()).status_code, 422)
        self.assertEqual(self.revision(), before)
        self.assertEqual(len(storage.read_project(self.project.id).storyboard.scenes), 1)

    def test_changed_upload_and_invalid_selection_are_atomic(self):
        review = self.preview().json()
        self.assertEqual(self.commit(review, self.item_xml("CHANGED")).status_code, 422)
        for selected in [[], [99], [0, 0], ["0"], [True], [-1], {}]:
            with self.subTest(selected=selected):
                self.assertEqual(self.commit(review, selected=selected).status_code, 422)
                self.assertEqual(self.revision(), review["revision"])
        response = self.client.post(self.base + "/question-import", files={"file": ("question.xml", self.item_xml())}, data={"selected": "[0]", "digest": review["digest"]})
        self.assertEqual(response.status_code, 428)

    def test_commit_to_group_in_one_revision(self):
        response = self.client.post(self.base + "/assessments", json={"title": "Assessment only", "questionSceneIds": []}, headers={"If-Match": f'"{self.revision()}"'})
        group_id = response.json()["storyboard"]["assessments"][0]["id"]
        review = self.preview().json()
        self.assertEqual(self.commit(review, assessment_id="missing").status_code, 404)
        result = self.commit(review, assessment_id=group_id)
        self.assertEqual(result.status_code, 200, result.text)
        board = result.json()["storyboard"]
        self.assertEqual(board["revision"], review["revision"] + 1)
        self.assertEqual(board["assessments"][0]["questionSceneIds"], [board["scenes"][0]["id"]])

    def test_stale_review_requires_review_again(self):
        review = self.preview().json()
        storage.create_scene(self.project.id, SceneCreate(title="Another author"))
        self.assertEqual(self.commit(review).status_code, 412)
        self.assertEqual(len(storage.read_project(self.project.id).storyboard.scenes), 1)

    def test_selected_warnings_require_acknowledgment(self):
        content = self.client.get(self.base + "/question-import/template.csv").content
        review = self.preview(content, "template.csv").json()
        self.assertTrue(review["questions"][0]["warnings"])
        fields = {"selected": "[0]", "digest": review["digest"]}
        headers = {"If-Match": f'"{review["revision"]}"'}
        rejected = self.client.post(self.base + "/question-import", files={"file": ("template.csv", content)}, data=fields, headers=headers)
        self.assertEqual(rejected.status_code, 422, rejected.text)
        self.assertEqual(self.revision(), review["revision"])
        self.assertEqual(storage.read_project(self.project.id).storyboard.scenes, [])
        accepted = self.client.post(self.base + "/question-import", files={"file": ("template.csv", content)}, data={**fields, "confirm_warnings": "true"}, headers=headers)
        self.assertEqual(accepted.status_code, 200, accepted.text)
        self.assertEqual(len(accepted.json()["storyboard"]["scenes"]), 1)

    def test_metadata_edit_cannot_reuse_another_question_identifier(self):
        self.assertEqual(self.commit(self.preview().json()).status_code, 200)
        other = self.item_xml("SECOND")
        self.assertEqual(self.commit(self.preview(other).json(), other).status_code, 200)
        project = storage.read_project(self.project.id)
        scene = project.storyboard.scenes[1]
        item = scene.assessmentItem.model_dump()
        item["identifier"] = "SAFETY"
        before = self.revision()
        response = self.client.patch(self.base + f"/scenes/{scene.id}", json={"assessmentItem": item}, headers={"If-Match": f'"{before}"'})
        self.assertEqual(response.status_code, 422, response.text)
        self.assertEqual(self.revision(), before)
        self.assertEqual(storage.read_project(self.project.id).storyboard.scenes[1].assessmentItem.identifier, "SECOND")

    def test_templates_and_export_roundtrip(self):
        from backend.app.question_import import parse_questions
        for format in ["csv", "xlsx"]:
            with self.subTest(format=format):
                response = self.client.get(self.base + f"/question-import/template.{format}")
                self.assertEqual(response.status_code, 200, response.text)
                rows = parse_questions(f"template.{format}", response.content)
                self.assertEqual(len(rows), 7)
                self.assertTrue(all(not row["errors"] for row in rows), rows)
        review = self.preview().json()
        self.commit(review)
        for format in ["csv", "xlsx"]:
            response = self.client.get(self.base + f"/questions.{format}")
            self.assertEqual(response.status_code, 200, response.text)
            rows = parse_questions(f"questions.{format}", response.content)
            self.assertEqual(rows[0]["item"]["metadata"], self.metadata)
        self.assertEqual(self.client.get(self.base + "/questions.xlsx?assessment_id=missing").status_code, 404)

    def test_metadata_edit_persists_exports_and_rejects_bad_fields(self):
        self.commit(self.preview().json())
        project = storage.read_project(self.project.id)
        scene = project.storyboard.scenes[0]
        item = scene.assessmentItem.model_dump()
        item["metadata"] = {**self.metadata, "title": "Edited question", "tags": ["revised"]}
        response = self.client.patch(self.base + f"/scenes/{scene.id}", json={"assessmentItem": item}, headers={"If-Match": f'"{self.revision()}"'})
        self.assertEqual(response.status_code, 200, response.text)
        exported = self.client.get(self.base + f"/scenes/{scene.id}/assessment.qti.xml")
        self.assertEqual(exported.status_code, 200)
        self.assertEqual(ET.fromstring(exported.content).get("title"), "Edited question")
        for metadata in [{**self.metadata, "language": "not a tag"}, {**self.metadata, "tags": ["same", "same"]}, {**self.metadata, "surprise": True}]:
            before = self.revision()
            invalid = self.client.patch(self.base + f"/scenes/{scene.id}", json={"assessmentItem": {**item, "metadata": metadata}}, headers={"If-Match": f'"{before}"'})
            self.assertEqual(invalid.status_code, 422, invalid.text)
            self.assertEqual(self.revision(), before)

    def test_invalid_archive_and_oversize_upload(self):
        invalid = self.preview(b"not a zip", "test.zip")
        self.assertEqual(invalid.status_code, 200, invalid.text)
        self.assertTrue(invalid.json()["questions"][0]["errors"])
        self.assertIsNone(invalid.json()["questions"][0]["item"])
        response = self.preview(b"x" * (10 * 1024 * 1024 + 1), "large.csv")
        self.assertEqual(response.status_code, 413)
        self.assertEqual(storage.read_project(self.project.id).storyboard.scenes, [])


if __name__ == "__main__":
    unittest.main()
