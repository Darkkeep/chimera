import io
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from zipfile import ZipFile

from fastapi import HTTPException
from PIL import Image
from pydantic import ValidationError

from backend.app import backup, main, storage
from backend.app.media import asset_usage, delete_asset, effective_background_asset, resolved_project
from backend.app.models import ProjectBackgroundUpdate, ProjectCreate, SceneCreate, SceneLayout, SceneUpdate
from backend.app.scorm import build_scorm_12, build_scorm_2004
from backend.app.standalone import build_standalone_course
from backend.app.validation import validate_project


class BackgroundTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        root = Path(self.temporary.name)
        self.enterContext(patch.object(storage, "ROOT", root))
        self.enterContext(patch.object(storage, "PROJECTS", root / "projects"))
        self.project = storage.create_project(ProjectCreate(title="Background course"))
        self.images = []
        for name, color in [("default.png", "red"), ("override.png", "blue")]:
            image = io.BytesIO()
            Image.new("RGB", (12, 8), color).save(image, "PNG")
            self.project = storage.add_project_asset(self.project.id, name, image.getvalue(), "image")
            self.images.append(self.project.storyboard.assets[-1].id)
        for title in ["Inherits", "Own image", "No image"]:
            self.project = storage.create_scene(self.project.id, SceneCreate(title=title))
        self.id = self.project.id

    def save_default(self, image):
        self.project = storage.update_project_background(self.id, image, self.project.storyboard.revision)
        return self.project

    def configure(self):
        self.save_default(self.images[0])
        for scene, mode, image in [
            (self.project.storyboard.scenes[1], "image", self.images[1]),
            (self.project.storyboard.scenes[2], "none", None),
        ]:
            self.project = storage.update_scene(self.id, scene.id, SceneUpdate(
                visualLayout=SceneLayout(enabled=True, backgroundMode=mode, backgroundAsset=image),
            ), self.project.storyboard.revision)

    def test_inheritance_and_overrides_are_derived_not_baked_into_source(self):
        self.configure()
        original = self.project.model_dump()
        resolved = resolved_project(self.project)
        self.assertEqual([scene.backgroundAsset for scene in resolved.storyboard.scenes], [self.images[0], self.images[1], None])
        self.assertEqual(resolved.model_dump(), resolved_project(resolved).model_dump())
        self.assertEqual(self.project.model_dump(), original)
        self.assertIsNone(self.project.storyboard.scenes[0].visualLayout)
        self.assertEqual(self.project.storyboard.scenes[2].visualLayout.backgroundMode, "none")
        self.save_default(self.images[1])
        self.assertEqual([effective_background_asset(self.project, scene) for scene in self.project.storyboard.scenes],
            [self.images[1], self.images[1], None])
        self.save_default(None)
        self.assertEqual([effective_background_asset(self.project, scene) for scene in self.project.storyboard.scenes],
            [None, self.images[1], None])

    def test_legacy_scene_backgrounds_remain_local_overrides(self):
        self.save_default(self.images[0])
        for changes in [
            SceneUpdate(backgroundAsset=self.images[1]),
            SceneUpdate(visualLayout=SceneLayout(backgroundAsset=self.images[1])),
        ]:
            self.project = storage.update_scene(self.id, self.project.storyboard.scenes[0].id, changes)
            self.assertEqual(effective_background_asset(self.project, self.project.storyboard.scenes[0]), self.images[1])
        self.project = storage.update_scene(self.id, self.project.storyboard.scenes[0].id,
            SceneUpdate(visualLayout=SceneLayout(backgroundMode="inherit")))
        self.assertIsNone(self.project.storyboard.scenes[0].backgroundAsset)
        self.assertEqual(effective_background_asset(self.project, self.project.storyboard.scenes[0]), self.images[0])

    def test_revision_invalid_assets_and_model_invariants(self):
        revision = self.project.storyboard.revision
        self.save_default(self.images[0])
        with self.assertRaises(storage.StoryboardRevisionConflict):
            storage.update_project_background(self.id, self.images[1], revision)
        self.project = storage.add_project_asset(self.id, "track.wav", b"audio", "audio")
        for image in ["missing", self.project.storyboard.assets[-1].id, ""]:
            with self.assertRaises(ValueError):
                storage.update_project_background(self.id, image)
            with self.assertRaises(HTTPException) as raised:
                main.patch_project_background(self.id, ProjectBackgroundUpdate(backgroundAsset=image))
            self.assertEqual(raised.exception.status_code, 400)
        for mode, image in [("image", None), ("inherit", self.images[0]), ("none", self.images[0])]:
            with self.assertRaises(ValidationError):
                SceneLayout(backgroundMode=mode, backgroundAsset=image)
        self.assertEqual(main.ROUTE_ACTIONS["patch_project_background"], "project.settings.update")

    def test_backgrounds_are_validated_on_import_and_used_media_cannot_be_deleted(self):
        self.configure()
        usage = asset_usage(self.project, self.images[0])
        self.assertTrue(usage["courseWide"])
        self.assertEqual([scene["title"] for scene in usage["scenes"]], ["Inherits"])
        with self.assertRaises(ValueError):
            delete_asset(self.id, self.images[0], self.project.storyboard.revision)
        invalid = self.project.storyboard.model_copy(update={"backgroundAsset": "missing"})
        with self.assertRaises(ValueError):
            storage.replace_storyboard(self.id, invalid)
        report = validate_project(self.project.model_copy(update={"storyboard": invalid}))
        self.assertFalse(report.passed)
        self.assertIn("invalid-background-reference", [issue.code for issue in report.issues])
        restored = storage.replace_storyboard(self.id, self.project.storyboard)
        self.assertEqual(restored.storyboard.backgroundAsset, self.images[0])
        self.assertEqual(restored.storyboard.scenes[2].visualLayout.backgroundMode, "none")

    def test_packages_include_resolved_backgrounds_without_losing_scene_opt_out(self):
        self.configure()
        for build in [build_scorm_12, build_scorm_2004, build_standalone_course]:
            with self.subTest(build=build.__name__):
                package, _ = build(self.project)
                with ZipFile(io.BytesIO(package)) as archive:
                    storyboard = json.loads(archive.read("storyboard.json"))
                    self.assertEqual([scene["backgroundAsset"] for scene in storyboard["scenes"]], [self.images[0], self.images[1], None])
                    self.assertEqual(storyboard["scenes"][0]["visualLayout"]["backgroundAsset"], self.images[0])
                    self.assertTrue(storyboard["scenes"][0]["visualLayout"]["enabled"])
                    self.assertEqual(storyboard["scenes"][2]["visualLayout"]["backgroundMode"], "none")
                    for asset in self.project.storyboard.assets:
                        self.assertIn(asset.path, archive.namelist())

    def test_backup_restores_project_default_and_scene_modes(self):
        self.configure()
        content = backup.build_project_archive(self.id)
        self.save_default(None)
        restored = backup.restore_project_archive(self.id, content)
        self.assertEqual(restored.storyboard.backgroundAsset, self.images[0])
        self.assertEqual(restored.storyboard.scenes[2].visualLayout.backgroundMode, "none")


if __name__ == "__main__":
    unittest.main()
