import hashlib
import io
import json
import tempfile
import unittest
from contextlib import ExitStack
from pathlib import Path
from unittest.mock import patch
from xml.etree import ElementTree as ET
from zipfile import ZipFile

from fastapi.testclient import TestClient
from pydantic import ValidationError

from backend.app import backup, main, storage
from backend.app.models import AssessmentGroupWrite, EnhancementProposalChange, EnhancementProposalChangeCreate, EnhancementProposalCreate, GeneratedSceneDraft, ProjectCreate, Scene, SceneCreate, SceneUpdate, Storyboard


class AssessmentGroupTests(unittest.TestCase):
    def setUp(self):
        self.stack = ExitStack()
        self.addCleanup(self.stack.close)
        self.root = Path(self.stack.enter_context(tempfile.TemporaryDirectory()))
        self.stack.enter_context(patch.multiple(storage, ROOT=self.root, PROJECTS=self.root / "projects"))
        self.stack.enter_context(patch.object(main, "ROOT", self.root))
        self.client = self.stack.enter_context(TestClient(main.app))
        self.project = storage.create_project(ProjectCreate(title="Groups"))
        for title, scene_type in [("First", "question"), ("Second", "question"), ("Outside", "question"), ("Content", "content")]:
            self.project = storage.create_scene(self.project.id, SceneCreate(title=title, sceneType=scene_type))
        self.question_ids = [scene.id for scene in self.project.storyboard.scenes[:3]]
        self.content_id = self.project.storyboard.scenes[3].id
        self.base = f"/api/projects/{self.project.id}"

    def revision(self):
        return storage.read_project(self.project.id).storyboard.revision

    def mutate(self, method, suffix="/assessments", body=None, revision=None):
        headers = {"If-Match": f'"{self.revision() if revision is None else revision}"'}
        return self.client.request(method, self.base + suffix, json=body, headers=headers)

    def create_group(self, members=None, title="Assessment"):
        response = self.mutate("POST", body={"title": title, "questionSceneIds": members or []})
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()["storyboard"]["assessments"][-1]

    def test_crud_order_revisions_and_empty_drafts(self):
        self.assertEqual(self.client.get(self.base).json()["storyboard"]["assessments"], [])
        original = storage.read_project(self.project.id).storyboard.completionSettings
        before = self.revision()
        group = self.create_group(self.question_ids[:2][::-1])
        self.assertEqual(self.revision(), before + 1)
        self.assertEqual(group["questionSceneIds"], self.question_ids[:2][::-1])
        draft = self.create_group(title="Draft")
        self.assertEqual(self.client.get(self.base + "/assessments").json(), [group, draft])
        response = self.mutate("PATCH", "/assessments/" + group["id"], {"title": "Edited", "questionSceneIds": []})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["storyboard"]["assessments"][0], {"id": group["id"], "title": "Edited", "questionSceneIds": []})
        response = self.mutate("DELETE", "/assessments/" + group["id"])
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["storyboard"]["assessments"], [draft])
        self.assertEqual(storage.read_project(self.project.id).storyboard.completionSettings, original)
        self.assertEqual(response.json()["sceneCount"], 4)

    def test_mutations_require_revision_and_reject_stale(self):
        group = self.create_group()
        for method, suffix, body in [("POST", "/assessments", {"title": "New", "questionSceneIds": []}), ("PATCH", "/assessments/" + group["id"], {"title": "Edit", "questionSceneIds": []}), ("DELETE", "/assessments/" + group["id"], None)]:
            with self.subTest(method=method):
                before = self.revision()
                self.assertEqual(self.client.request(method, self.base + suffix, json=body).status_code, 428)
                response = self.mutate(method, suffix, body, revision=before - 1)
                self.assertEqual(response.status_code, 412, response.text)
                self.assertEqual(response.headers["etag"], f'"{before}"')
                self.assertEqual(self.revision(), before)

    def test_invalid_members_titles_and_full_patch_fields(self):
        group = self.create_group()
        invalid = [{"title": "", "questionSceneIds": []}, {"title": "x" * 121, "questionSceneIds": []}, {"title": "A", "questionSceneIds": ["missing"]}, {"title": "A", "questionSceneIds": [self.content_id]}, {"title": "A", "questionSceneIds": [self.question_ids[0]] * 2}, {"title": "A", "questionSceneIds": [str(index) for index in range(501)]}, {"title": "A"}, {"questionSceneIds": []}]
        for body in invalid:
            with self.subTest(body=body):
                before = self.revision()
                self.assertEqual(self.mutate("POST", body=body).status_code, 422)
                self.assertEqual(self.mutate("PATCH", "/assessments/" + group["id"], body).status_code, 422)
                self.assertEqual(self.revision(), before)
        self.assertEqual(self.mutate("DELETE", "/assessments/missing").status_code, 404)

    def test_scene_type_guard_and_atomic_deletion_cleanup(self):
        group = self.create_group(self.question_ids[:2])
        draft = self.create_group([self.question_ids[0]])
        before = self.revision()
        response = self.mutate("PATCH", "/scenes/" + self.question_ids[0], {"sceneType": "content"})
        self.assertEqual(response.status_code, 422, response.text)
        self.assertEqual(self.revision(), before)
        response = self.mutate("DELETE", "/scenes/" + self.question_ids[0])
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(self.revision(), before + 1)
        self.assertEqual(response.json()["storyboard"]["assessments"], [{**group, "questionSceneIds": [self.question_ids[1]]}, {**draft, "questionSceneIds": []}])
        self.mutate("PATCH", "/assessments/" + group["id"], {"title": group["title"], "questionSceneIds": []})
        self.assertEqual(self.mutate("PATCH", "/scenes/" + self.question_ids[1], {"sceneType": "content"}).status_code, 200)

    def test_import_validates_memberships_and_unique_group_ids(self):
        group = self.create_group(self.question_ids[:2])
        board = storage.read_project(self.project.id).storyboard.model_dump()
        board["scenes"][0]["sceneType"] = "assessment"
        response = self.mutate("PUT", "/storyboard/import", board)
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["storyboard"]["scenes"][0]["sceneType"], "question")
        for groups in [[group, group], [{**group, "questionSceneIds": ["missing"]}], [{**group, "questionSceneIds": [self.content_id]}]]:
            before = self.revision()
            response = self.mutate("PUT", "/storyboard/import", {**board, "assessments": groups})
            self.assertEqual(response.status_code, 422, response.text)
            self.assertEqual(self.revision(), before)
        with self.assertRaises(ValidationError):
            storage.update_from_import(self.project.id, [], [], self.revision())

    def test_backup_restore_preserves_groups_and_rejects_invalid_members(self):
        group = self.create_group(self.question_ids[:2])
        archive_content = backup.build_project_archive(self.project.id)
        self.mutate("DELETE", "/assessments/" + group["id"])
        restored = backup.restore_project_archive(self.project.id, archive_content)
        self.assertEqual(restored.storyboard.assessments[0].model_dump(), group)
        output = io.BytesIO()
        with ZipFile(io.BytesIO(archive_content)) as source:
            files = {name: source.read(name) for name in source.namelist()}
        board = json.loads(files["storyboard.json"])
        board["assessments"][0]["questionSceneIds"] = ["missing"]
        files["storyboard.json"] = json.dumps(board).encode()
        manifest = json.loads(files["manifest.json"])
        for entry in manifest["files"]:
            if entry["path"] == "storyboard.json":
                entry.update(sizeBytes=len(files["storyboard.json"]), sha256=hashlib.sha256(files["storyboard.json"]).hexdigest())
        files["manifest.json"] = json.dumps(manifest).encode()
        with ZipFile(output, "w") as target:
            for name, content in files.items():
                target.writestr(name, content)
        with self.assertRaises(ValidationError):
            backup.restore_project_archive(self.project.id, output.getvalue())
        self.assertEqual(storage.read_project(self.project.id).storyboard.assessments[0].model_dump(), group)

    def test_group_qti_contains_only_authored_members_in_group_order(self):
        group = self.create_group(self.question_ids[:2][::-1])
        url = self.base + "/assessments/" + group["id"] + "/assessment.qti.zip"
        self.assertEqual(self.client.get(url).status_code, 422)
        for index, scene_id in enumerate(self.question_ids):
            storage.update_scene(self.project.id, scene_id, SceneUpdate(assessmentItem={"type": "true-false", "identifier": f"Q{index}", "prompt": "Ready?", "correctResponse": "true"}))
        response = self.client.get(url)
        self.assertEqual(response.status_code, 200, response.text if response.status_code != 200 else "")
        with ZipFile(io.BytesIO(response.content)) as archive:
            self.assertEqual(set(archive.namelist()), {"imsmanifest.xml", "assessmentTest.xml", "items/Q0.xml", "items/Q1.xml"})
            test = ET.fromstring(archive.read("assessmentTest.xml"))
            self.assertEqual(test.attrib["title"], group["title"])
            self.assertEqual([node.attrib["identifier"] for node in test.iter() if node.tag.endswith("assessmentItemRef")], ["Q1", "Q0"])
        self.assertEqual(self.client.get(self.base + "/assessments/missing/assessment.qti.zip").status_code, 404)

    def test_permissions_are_enforced(self):
        group = self.create_group()
        class DenyPolicy:
            def allows(self, context, action, project_id=None):
                return False
        main.app.dependency_overrides[main.get_authorization_policy] = lambda: DenyPolicy()
        self.addCleanup(main.app.dependency_overrides.pop, main.get_authorization_policy)
        self.assertEqual(self.client.get(self.base + "/assessments").status_code, 403)
        self.assertEqual(self.mutate("POST", body={"title": "A", "questionSceneIds": []}).status_code, 403)
        self.assertEqual(self.mutate("PATCH", "/assessments/" + group["id"], {"title": "A", "questionSceneIds": []}).status_code, 403)
        self.assertEqual(self.mutate("DELETE", "/assessments/" + group["id"]).status_code, 403)
        self.assertEqual(self.client.get(self.base + "/assessments/" + group["id"] + "/assessment.qti.zip").status_code, 403)

    def test_legacy_scene_types_normalize_on_input_read_and_schema(self):
        item = {"type": "true-false", "identifier": "Q", "prompt": "Ready?", "correctResponse": "true"}
        models = [Scene(id="q", title="Q", sceneType="assessment"), SceneCreate(sceneType="assessment"), SceneUpdate(sceneType="assessment"), GeneratedSceneDraft(title="Q", sceneType="assessment", assessmentItem=item)]
        for model in models:
            self.assertEqual(model.model_dump()["sceneType"], "question")
            self.assertNotIn("assessment", str(model.model_json_schema()["properties"]["sceneType"]))
        for model in [EnhancementProposalChangeCreate(field="sceneType", proposedValue="assessment"), EnhancementProposalChange(field="sceneType", proposedValue="assessment", beforeValue="assessment"), EnhancementProposalCreate(field="sceneType", targetSceneId="q", proposedValue="assessment", rationale="Rename")]:
            self.assertEqual(model.proposedValue, "question")
        path = storage.project_path(self.project.id) / "storyboard.json"
        board = json.loads(path.read_text())
        board["scenes"][0]["sceneType"] = "assessment"
        path.write_text(json.dumps(board))
        self.assertEqual(self.client.get(self.base).json()["storyboard"]["scenes"][0]["sceneType"], "question")
        self.assertEqual(Storyboard(projectId="old", title="Old").assessments, [])
        self.assertEqual(AssessmentGroupWrite(title="Draft", questionSceneIds=[]).questionSceneIds, [])
