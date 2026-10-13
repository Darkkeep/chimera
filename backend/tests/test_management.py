import json
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from fastapi import HTTPException
from pydantic import ValidationError
from fastapi.testclient import TestClient

from backend.app import main, storage
from backend.app.models import ExtractedAsset, ProjectCreate, ProductionStageUpdate, SceneCreate
from backend.app.platform import LocalSingleUserPolicy


class ManagementTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        root = Path(self.temporary.name)
        for target, name, value in ((storage, "ROOT", root), (storage, "PROJECTS", root / "projects"), (main, "ROOT", root)):
            patcher = patch.object(target, name, value)
            patcher.start()
            self.addCleanup(patcher.stop)

    def test_stage_persists_without_changing_storyboard_revision(self) -> None:
        project = storage.create_project(ProjectCreate(title="Stage test"))
        self.assertEqual(project.productionStage, "draft")
        updated = main.patch_project_production_stage(project.id, ProductionStageUpdate(productionStage="in-review"))
        self.assertEqual(storage.read_project(project.id).productionStage, "in-review")
        self.assertEqual(updated.storyboard.revision, project.storyboard.revision)
        storage.create_scene(project.id, SceneCreate(title="New scene"))
        self.assertEqual(storage.read_project(project.id).productionStage, "in-review")
        self.assertEqual(storage.list_projects()[0].productionStage, "in-review")

    def test_legacy_stage_is_not_inferred_from_readiness(self) -> None:
        project = storage.create_project(ProjectCreate(title="Legacy"))
        metadata_path = storage.project_path(project.id) / "project.json"
        metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
        del metadata["productionStage"]
        metadata_path.write_text(json.dumps(metadata), encoding="utf-8")
        self.assertEqual(storage.read_project(project.id).productionStage, "not-set")

    def test_health_groups_blockers_and_keeps_readiness_separate(self) -> None:
        project = storage.create_project(ProjectCreate(title="Empty"))
        with patch.object(main, "get_authorization_policy", return_value=LocalSingleUserPolicy()):
            health = main.get_project_health()[0]
        self.assertEqual(health["productionStage"], "draft")
        self.assertFalse(health["productionPassed"])
        self.assertEqual(health["blockerCounts"], {"no-scenes": 1})
        self.assertEqual(health["publicationBlockers"], 1)
        self.assertEqual(health["blockers"][0]["code"], "no-scenes")
        self.assertTrue(health["canEdit"])

    def test_multiple_blocker_types_reconcile_with_the_total(self) -> None:
        project = storage.create_project(ProjectCreate(title="Media blockers"))
        project = storage.create_scene(project.id, SceneCreate(title="Media scene"))
        project.storyboard.assets.append(ExtractedAsset(id="missing-image", kind="image", filename="missing.png", contentType="image/png", sizeBytes=1, sha256="0" * 64, path="assets/missing.png"))
        storage.write_storyboard(storage.project_path(project.id), project.storyboard)
        with patch.object(main, "get_authorization_policy", return_value=LocalSingleUserPolicy()):
            health = main.get_project_health()[0]
        self.assertEqual(health["blockerCounts"], {"missing-asset-file": 1})
        self.assertEqual(health["publicationBlockers"], sum(health["blockerCounts"].values()))
        self.assertEqual(len(health["blockers"]), 1)

    def test_invalid_stage_and_missing_project(self) -> None:
        with self.assertRaises(ValidationError):
            ProductionStageUpdate.model_validate({"productionStage": "ready"})
        with self.assertRaises(HTTPException) as raised:
            main.patch_project_production_stage("missing", ProductionStageUpdate(productionStage="draft"))
        self.assertEqual(raised.exception.status_code, 404)

    def test_project_trash_hides_and_restores_project_with_all_files(self) -> None:
        project = storage.create_project(ProjectCreate(title="Recoverable project"))
        project = storage.create_scene(project.id, SceneCreate(title="Keep this scene"))
        asset_path = storage.project_path(project.id) / "assets" / "keep.bin"
        asset_path.write_bytes(b"project-owned data")

        result = main.trash_project(project.id)

        self.assertEqual(result["projectId"], project.id)
        self.assertEqual(result["title"], "Recoverable project")
        self.assertFalse(storage.project_path(project.id).exists())
        self.assertEqual(storage.list_projects(), [])
        with self.assertRaises(FileNotFoundError):
            storage.read_project(project.id)
        trashed, = storage.list_trashed_projects()
        self.assertEqual(trashed.id, project.id)
        self.assertEqual(trashed.sceneCount, 1)
        self.assertTrue(trashed.expiresAt > trashed.trashedAt)

        restored = main.restore_project(project.id)

        self.assertEqual(restored.storyboard.scenes[0].title, "Keep this scene")
        self.assertEqual((storage.project_path(project.id) / "assets" / "keep.bin").read_bytes(), b"project-owned data")
        self.assertEqual([item.id for item in storage.list_projects()], [project.id])
        self.assertEqual(storage.list_trashed_projects(), [])

    def test_trash_blocks_active_generation_jobs_and_expired_projects_are_purged(self) -> None:
        project = storage.create_project(ProjectCreate(title="Protected project"))
        active_job = SimpleNamespace(status="running")
        with patch.object(storage, "list_enhancement_jobs", return_value=[active_job]), patch.object(storage, "list_media_generation_jobs", return_value=[]):
            with self.assertRaises(RuntimeError):
                storage.trash_project(project.id)
        self.assertTrue(storage.project_path(project.id).is_dir())

        storage.trash_project(project.id)
        metadata_path = storage.project_trash_path() / project.id / "trash.json"
        metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
        metadata["expiresAt"] = (datetime.now(timezone.utc) - timedelta(seconds=1)).isoformat()
        metadata_path.write_text(json.dumps(metadata), encoding="utf-8")
        self.assertEqual(storage.list_trashed_projects(), [])
        self.assertFalse((storage.project_trash_path() / project.id).exists())

    def test_only_project_owner_can_trash_or_restore_without_admin_capability(self) -> None:
        project = storage.create_project(ProjectCreate(title="Owned project"))
        foreign_actor = SimpleNamespace(actorId="another-user")

        class OwnerPolicy:
            def allows(self, context, action, project_id=None):
                return action == "project.delete" and context.actorId == "another-user"

        with patch.object(main, "get_actor_context", return_value=foreign_actor), patch.object(main, "get_authorization_policy", return_value=OwnerPolicy()):
            with self.assertRaises(HTTPException) as denied:
                main.trash_project(project.id)
        self.assertEqual(denied.exception.status_code, 403)
        self.assertTrue(storage.project_path(project.id).is_dir())

        main.trash_project(project.id)
        with patch.object(main, "get_actor_context", return_value=foreign_actor), patch.object(main, "get_authorization_policy", return_value=OwnerPolicy()):
            with self.assertRaises(HTTPException) as denied_restore:
                main.restore_project(project.id)
        self.assertEqual(denied_restore.exception.status_code, 403)

    def test_project_trash_api_does_not_recreate_active_directory_and_restores(self) -> None:
        project = storage.create_project(ProjectCreate(title="API trash project"))
        storage.create_scene(project.id, SceneCreate(title="Keep me"))
        client = TestClient(main.app)

        trashed = client.post(f"/api/projects/{project.id}/trash")
        self.assertEqual(trashed.status_code, 200, trashed.text)
        self.assertFalse(storage.project_path(project.id).exists())
        self.assertEqual(client.get("/api/projects").json(), [])
        self.assertEqual(client.get("/api/trash/projects").json()[0]["id"], project.id)

        restored = client.post(f"/api/projects/{project.id}/restore")
        self.assertEqual(restored.status_code, 200, restored.text)
        self.assertTrue(storage.project_path(project.id).is_dir())
        self.assertEqual(storage.read_project(project.id).storyboard.scenes[0].title, "Keep me")

    def test_failed_restore_move_keeps_project_listed_and_recoverable(self) -> None:
        project = storage.create_project(ProjectCreate(title="Restore failure"))
        storage.trash_project(project.id)
        source = storage.project_trash_path() / project.id / "project"
        destination = storage.project_path(project.id)
        path_type = type(source)
        replace = path_type.replace

        def fail_project_move(path, target):
            if path == source and Path(target) == destination:
                raise OSError("simulated cross-device or permission failure")
            return replace(path, target)

        with patch.object(path_type, "replace", fail_project_move):
            with self.assertRaises(OSError):
                storage.restore_trashed_project(project.id)

        self.assertFalse(destination.exists())
        self.assertEqual([item.id for item in storage.list_trashed_projects()], [project.id])
        self.assertEqual(storage.restore_trashed_project(project.id).title, "Restore failure")


if __name__ == "__main__":
    unittest.main()