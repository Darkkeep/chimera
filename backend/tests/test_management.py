import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi import HTTPException
from pydantic import ValidationError

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
        self.assertEqual(health["blockerCounts"], {"missing-asset-file": 1, "missing-media-attribution": 1})
        self.assertEqual(health["publicationBlockers"], sum(health["blockerCounts"].values()))
        self.assertEqual(len(health["blockers"]), 2)

    def test_invalid_stage_and_missing_project(self) -> None:
        with self.assertRaises(ValidationError):
            ProductionStageUpdate.model_validate({"productionStage": "ready"})
        with self.assertRaises(HTTPException) as raised:
            main.patch_project_production_stage("missing", ProductionStageUpdate(productionStage="draft"))
        self.assertEqual(raised.exception.status_code, 404)


if __name__ == "__main__":
    unittest.main()