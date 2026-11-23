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

    def test_stale_decision_is_rejected(self):
        data = review_approval.ReviewDecisionRequest(decision="approve",
            expectedRevision=self.project.storyboard.revision - 1, note="Late approval")
        with self.assertRaises(storage.StoryboardRevisionConflict):
            review_approval.record_decision(self.project.id, self.reviewer, data)
        self.assertFalse(review_approval.review_status(self.project.id)["approved"])


if __name__ == "__main__":
    unittest.main()
