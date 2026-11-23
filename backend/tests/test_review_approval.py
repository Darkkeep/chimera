"""Human review and approved-export qualification against disposable course data."""
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from backend.app import review_approval, storage
from backend.app.models import ProjectCreate, SceneCreate, ReviewCommentCreate
from backend.app.platform import ActorContext


class ReviewApprovalTests(unittest.TestCase):
    def setUp(self):
        self.root = Path(self.enterContext(tempfile.TemporaryDirectory()))
        self.enterContext(patch.object(storage, "ROOT", self.root))
        self.enterContext(patch.object(storage, "PROJECTS", self.root / "projects"))
        self.owner = ActorContext(actorId="author", actorDisplayName="Author",
                                  installationId="fixture", deploymentMode="team")
        self.reviewer = ActorContext(actorId="reviewer", actorDisplayName="Reviewer",
                                     installationId="fixture", deploymentMode="team")
        self.project = storage.create_project(ProjectCreate(title="PBJ"), self.owner)
        self.project = storage.create_scene(
            self.project.id, SceneCreate(title="Spread the jelly"),
            self.project.storyboard.revision)

    def decide(self, decision="approve", note="Reviewed all visible scenes"):
        return review_approval.record_decision(
            self.project.id, self.reviewer,
            review_approval.ReviewDecisionRequest(decision=decision,
                expectedRevision=storage.read_project(self.project.id).storyboard.revision, note=note))

    def test_exact_revision_approval_is_invalidated_by_scene_edit(self):
        with self.assertRaisesRegex(ValueError, "no current human approval"):
            review_approval.require_approved(self.project.id)
        status = self.decide()
        self.assertTrue(status["approved"])
        self.assertEqual(status["lastDecision"]["actorId"], self.reviewer.actorId)
        review_approval.require_approved(self.project.id)
        current = storage.read_project(self.project.id)
        storage.create_scene(self.project.id, SceneCreate(title="New scene"),
                             current.storyboard.revision)
        status = review_approval.review_status(self.project.id)
        self.assertFalse(status["approved"])
        self.assertEqual(status["state"], "changed-since-review")
        with self.assertRaisesRegex(ValueError, "no current human approval"):
            review_approval.require_approved(self.project.id)
        self.assertTrue(self.decide()["approved"])

    def test_owner_cannot_independently_approve(self):
        with self.assertRaisesRegex(ValueError, "owner cannot"):
            review_approval.record_decision(
                self.project.id, self.owner,
                review_approval.ReviewDecisionRequest(
                    decision="approve", note="Owner approval", expectedRevision=self.project.storyboard.revision))
        self.assertFalse(review_approval.review_status(self.project.id)["approved"])

    def test_unresolved_review_comment_blocks_approval(self):
        scene = self.project.storyboard.scenes[0]
        comment = storage.create_review_comment(self.project.id,
            ReviewCommentCreate(sceneId=scene.id, body="Improve text", authorLabel="Reviewer"),
            self.reviewer)
        with self.assertRaisesRegex(ValueError, "Resolve open"):
            self.decide()
        self.assertFalse(review_approval.review_status(self.project.id)["approved"])
        from backend.app.models import ReviewCommentDecision
        storage.decide_review_comment(self.project.id, comment.id,
            ReviewCommentDecision(resolved=True), self.owner)
        self.assertTrue(self.decide()["approved"])

    def test_change_request_preserves_history_and_never_approves(self):
        request = self.decide("request-changes", "Need more clarity")
        self.assertFalse(request["approved"])
        self.assertEqual(request["state"], "changes-requested")
        approved = self.decide("approve", "Checked revision")
        self.assertTrue(approved["approved"])
        self.assertEqual(len(review_approval._load_receipts(self.project.id)), 2)

    def test_release_exports_refuse_unapproved_revision(self):
        from backend.app import main
        from fastapi import HTTPException
        with patch.object(main, "persist_scorm_12_build",
                          return_value=(b"test-scorm-package", {}, "test.zip")) as builder:
            with self.assertRaises(HTTPException) as rejected:
                main.export_scorm_12(self.project.id, approved=True)
            self.assertEqual(rejected.exception.status_code, 409)
            builder.assert_not_called()
            self.decide()
            published = main.export_scorm_12(self.project.id, approved=True)
            self.assertEqual(published.body, b"test-scorm-package")
            builder.assert_called_once()
            current = storage.read_project(self.project.id)
            storage.create_scene(self.project.id, SceneCreate(title="An unreviewed change"),
                                 current.storyboard.revision)
            with self.assertRaises(HTTPException) as stale:
                main.export_scorm_12(self.project.id, approved=True)
            self.assertEqual(stale.exception.status_code, 409)
            builder.assert_called_once()

    def test_draft_export_remains_available_during_migration(self):
        from backend.app import main
        with patch.object(main, "persist_scorm_12_build",
                          return_value=(b"draft-package", {}, "draft.zip")) as builder:
            exported = main.export_scorm_12(self.project.id, approved=False)
            self.assertEqual(exported.body, b"draft-package")
            builder.assert_called_once()

    def test_archiving_and_restoring_cannot_reinstate_approval(self):
        import io
        from zipfile import ZipFile
        from backend.app.backup import build_project_archive, restore_project_archive
        self.decide()
        self.assertTrue(review_approval.review_status(self.project.id)["approved"])
        archive = build_project_archive(self.project.id)
        with ZipFile(io.BytesIO(archive)) as saved:
            self.assertFalse(any(name.startswith("review-ledger/") for name in saved.namelist()))
        restore_project_archive(self.project.id, archive)
        after = review_approval.review_status(self.project.id)
        self.assertFalse(after["approved"])
        self.assertEqual(after["state"], "restored-needs-review")
        self.assertEqual(after["lastDecision"]["actorId"], "chimera-system")
        with self.assertRaisesRegex(ValueError, "no current human approval"):
            review_approval.require_approved(self.project.id)
        self.assertTrue(self.decide()["approved"])

    def test_stale_decision_is_rejected(self):
        data = review_approval.ReviewDecisionRequest(decision="approve",
            expectedRevision=self.project.storyboard.revision - 1, note="Late approval")
        with self.assertRaises(storage.StoryboardRevisionConflict):
            review_approval.record_decision(self.project.id, self.reviewer, data)
        self.assertFalse(review_approval.review_status(self.project.id)["approved"])


if __name__ == "__main__":
    unittest.main()
