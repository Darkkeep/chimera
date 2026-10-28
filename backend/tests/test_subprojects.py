import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi import HTTPException
from pydantic import ValidationError

from backend.app import backup, main, storage
from backend.app.models import ProjectCreate, ProjectRelationshipUpdate, ProjectRestore, SceneCreate
from backend.app.platform import LocalSingleUserPolicy


class SubprojectTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        root = Path(temporary.name)
        for module, key, value in [(storage, "ROOT", root), (storage, "PROJECTS", root / "projects"), (main, "ROOT", root)]:
            self.enterContext(patch.object(module, key, value))
        self.enterContext(patch.object(main, "get_authorization_policy", return_value=LocalSingleUserPolicy()))
        self.parent = storage.create_project(ProjectCreate(title="Parent"))
        self.other = storage.create_project(ProjectCreate(title="Other"))
        self.child = storage.create_project(ProjectCreate(title="Child", parentProjectId=self.parent.id))

    def relationship(self, parent_id, revision=None, order=0):
        return main.patch_project_relationship(self.child.id, ProjectRelationshipUpdate(
            parentProjectId=parent_id, siblingOrder=order,
            metadataRevision=self.child.metadataRevision if revision is None else revision,
        ))

    def test_attach_move_detach_preserves_content_and_checks_revision(self):
        self.child = storage.create_scene(self.child.id, SceneCreate(title="Child scene"))
        original = self.child.storyboard.model_dump()
        previous = self.child.metadataRevision
        self.child = self.relationship(self.other.id, order=7)
        self.assertEqual(self.child.parentProjectId, self.other.id)
        self.assertEqual(self.child.siblingOrder, 7)
        self.assertEqual(self.child.storyboard.model_dump(), original)
        with self.assertRaises(HTTPException) as raised:
            self.relationship(None, revision=previous)
        self.assertEqual(raised.exception.status_code, 412)
        self.child = self.relationship(None)
        self.assertIsNone(self.child.parentProjectId)
        self.assertEqual(self.child.storyboard.model_dump(), original)
        events = (storage.project_path(self.child.id) / "audit" / "events.jsonl").read_text(encoding="utf-8")
        self.assertIn("project.relationship_changed", events)

    def test_rejects_self_cycles_depth_missing_and_cross_installation(self):
        for parent_id in [self.child.id, "missing", self.parent.id]:
            project = self.child if parent_id != self.parent.id else self.parent
            selected_parent = parent_id if project.id == self.child.id else self.child.id
            with self.subTest(parent=selected_parent), self.assertRaises(RuntimeError):
                storage.update_project_relationship(project.id, selected_parent, 0, project.metadataRevision)
        with self.assertRaises(RuntimeError):
            storage.create_project(ProjectCreate(title="Grandchild", parentProjectId=self.child.id))
        metadata_path = storage.project_path(self.other.id) / "project.json"
        metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
        metadata["installationId"] = "foreign"
        metadata_path.write_text(json.dumps(metadata), encoding="utf-8")
        with self.assertRaises(HTTPException) as raised:
            self.relationship(self.other.id)
        self.assertEqual(raised.exception.status_code, 409)

    def test_parent_trash_blocked_and_restore_requires_explicit_valid_parent(self):
        with self.assertRaises(RuntimeError):
            storage.trash_project(self.parent.id)
        storage.trash_project(self.child.id)
        storage.trash_project(self.parent.id)
        with self.assertRaises(HTTPException) as raised:
            main.restore_project(self.child.id)
        self.assertEqual(raised.exception.status_code, 409)
        restored = main.restore_project(self.child.id, ProjectRestore(parentProjectId=None))
        self.assertIsNone(restored.parentProjectId)
        self.assertGreater(restored.metadataRevision, self.child.metadataRevision)

    def test_archive_restore_preserves_live_relationship_and_revision(self):
        archive = backup.build_project_archive(self.child.id)
        self.child = self.relationship(self.other.id, order=9)
        restored = backup.restore_project_archive(self.child.id, archive)
        self.assertEqual(restored.parentProjectId, self.other.id)
        self.assertEqual(restored.siblingOrder, 9)
        self.assertEqual(restored.metadataRevision, self.child.metadataRevision)

    def test_relationship_requires_child_old_parent_and_new_parent_permissions(self):
        for denied in [self.child.id, self.parent.id, self.other.id]:
            class Policy:
                def allows(self, context, action, project_id=None):
                    return not (action == "project.settings.update" and project_id == denied)
            with self.subTest(denied=denied), patch.object(main, "get_authorization_policy", return_value=Policy()):
                with self.assertRaises(HTTPException) as raised:
                    self.relationship(self.other.id)
                self.assertEqual(raised.exception.status_code, 403)
        self.assertEqual(storage.read_project(self.child.id).parentProjectId, self.parent.id)

    def test_create_and_restore_require_parent_permission(self):
        class Policy:
            def allows(self, context, action, project_id=None):
                return action != "project.settings.update"
        with patch.object(main, "get_authorization_policy", return_value=Policy()):
            with self.assertRaises(HTTPException) as raised:
                main.post_project(ProjectCreate(title="Denied", parentProjectId=self.parent.id))
            self.assertEqual(raised.exception.status_code, 403)
            storage.trash_project(self.child.id)
            with self.assertRaises(HTTPException) as raised:
                main.restore_project(self.child.id)
            self.assertEqual(raised.exception.status_code, 403)

    def test_hidden_children_filtered_and_legacy_projects_default_to_root(self):
        child_id = self.child.id
        class Policy:
            def allows(self, context, action, project_id=None):
                return project_id != child_id
        with patch.object(main, "get_authorization_policy", return_value=Policy()):
            health = main.get_project_health()
            self.assertNotIn(child_id, [project["projectId"] for project in health])
            self.assertNotIn(child_id, [project.id for project in main.get_projects()])
        path = storage.project_path(self.other.id) / "project.json"
        metadata = json.loads(path.read_text(encoding="utf-8"))
        for field in ["parentProjectId", "siblingOrder", "metadataRevision"]:
            metadata.pop(field)
        path.write_text(json.dumps(metadata), encoding="utf-8")
        legacy = storage.read_project(self.other.id)
        self.assertIsNone(legacy.parentProjectId)
        self.assertEqual(legacy.metadataRevision, 1)
        self.assertEqual(legacy.siblingOrder, 0)

    def test_relationship_order_is_a_bounded_integer(self):
        for order in [-1, 2147483648, 1.5, True]:
            with self.subTest(order=order), self.assertRaises(ValidationError):
                ProjectRelationshipUpdate(parentProjectId=None, siblingOrder=order, metadataRevision=1)


if __name__ == "__main__":
    unittest.main()
