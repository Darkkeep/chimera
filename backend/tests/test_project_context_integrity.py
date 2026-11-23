"""Cross-project identity and recovery invariants.

Use isolated fixture projects. Never modify the production workspace.
"""
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

from backend.app import main, storage
from backend.app.models import ProjectCreate, SceneCreate


class ProjectContextIntegrityTests(unittest.TestCase):
    def setUp(self):
        self.root = Path(self.enterContext(tempfile.TemporaryDirectory()))
        self.enterContext(patch.object(storage, "ROOT", self.root))
        self.enterContext(patch.object(storage, "PROJECTS", self.root / "projects"))
        self.enterContext(patch.object(main, "ROOT", self.root))
        self.sport = storage.create_project(ProjectCreate(title="Sporting Merit"))
        self.pbj = storage.create_project(ProjectCreate(title="The Big-Top PB&J Show"))

    def test_different_courses_keep_distinct_storyboards_and_references(self):
        sport = storage.create_scene(
            self.sport.id, SceneCreate(title="Sporting Merit scene", extractedText=["Sports context"]),
            self.sport.storyboard.revision)
        pbj = storage.create_scene(
            self.pbj.id, SceneCreate(title="Spread the jelly", extractedText=["PB&J context"]),
            self.pbj.storyboard.revision)
        self.assertNotEqual(sport.id, pbj.id)
        self.assertEqual([scene.title for scene in storage.read_project(sport.id).storyboard.scenes],
                         ["Sporting Merit scene"])
        self.assertEqual([scene.title for scene in storage.read_project(pbj.id).storyboard.scenes],
                         ["Spread the jelly"])

    def test_corrupt_storyboard_identity_blocks_access_and_all_writes(self):
        file = storage.project_path(self.sport.id) / "storyboard.json"
        document = json.loads(file.read_text(encoding="utf-8"))
        document["projectId"] = self.pbj.id
        file.write_text(json.dumps(document), encoding="utf-8")
        original = file.read_bytes()
        with self.assertRaises(storage.ProjectIdentityMismatch):
            storage.read_project(self.sport.id)
        with self.assertRaises(storage.ProjectIdentityMismatch):
            storage.write_storyboard(storage.project_path(self.sport.id),
                                     storage.read_project(self.pbj.id).storyboard)
        self.assertEqual(file.read_bytes(), original)
        with TestClient(main.app) as client:
            response = client.get(f"/api/projects/{self.sport.id}")
            self.assertEqual(response.status_code, 409)
            self.assertIn("stored identity", response.json()["detail"])
            project_list = client.get("/api/projects")
            self.assertEqual(project_list.status_code, 200)
            self.assertIn(self.pbj.id, [item["id"] for item in project_list.json()])
            self.assertNotIn(self.sport.id, [item["id"] for item in project_list.json()])
        self.assertEqual(file.read_bytes(), original)

    def test_corrupt_metadata_identity_blocks_open_without_rewriting(self):
        file = storage.project_path(self.pbj.id) / "project.json"
        data = json.loads(file.read_text(encoding="utf-8"))
        data["id"] = self.sport.id
        file.write_text(json.dumps(data), encoding="utf-8")
        before = file.read_bytes()
        with self.assertRaises(storage.ProjectIdentityMismatch):
            storage.read_project(self.pbj.id)
        self.assertEqual(file.read_bytes(), before)


if __name__ == "__main__":
    unittest.main()
