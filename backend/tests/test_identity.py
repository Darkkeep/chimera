import tempfile
import unittest
import json
from pathlib import Path
from pydantic import ValidationError

from backend.app.identity import IdentitySnapshot, LocalIdentityDirectory, Membership, OrganizationPolicy, ProjectMembership, RoleBasedAuthorizationPolicy, TeamRecord, UserRecord
from backend.app.platform import ActorContext, LOCAL_ACTOR


class IdentityTests(unittest.TestCase):
    def test_local_directory_materializes_all_single_user_roles(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            directory = LocalIdentityDirectory(Path(temporary))

            snapshot = directory.snapshot()

            self.assertEqual(snapshot.actor, LOCAL_ACTOR)
            self.assertEqual(snapshot.user.id, LOCAL_ACTOR.actorId)
            self.assertEqual(
                {membership.role for membership in snapshot.memberships},
                {"author", "reviewer", "instructional-designer", "administrator"},
            )
            self.assertTrue((Path(temporary) / "identity" / "directory.json").is_file())

    def test_local_directory_round_trips_without_changing_identity(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            directory = LocalIdentityDirectory(Path(temporary))
            first = directory.snapshot()
            second = directory.snapshot()

            self.assertEqual(first, second)

    def test_team_policy_uses_membership_roles_for_actions(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            directory = LocalIdentityDirectory(root)
            actor = ActorContext(actorId="author-1", actorDisplayName="Author", installationId="org-1", deploymentMode="team")
            snapshot = IdentitySnapshot(
                actor=actor,
                user=UserRecord(id=actor.actorId, displayName=actor.actorDisplayName),
                teams=[TeamRecord(id="team-1", name="Content team")],
                memberships=[Membership(userId=actor.actorId, teamId="team-1", role="author")],
                projectMemberships=[ProjectMembership(projectId="project-1", userId=actor.actorId, role="author")],
                policy=OrganizationPolicy(deploymentMode="team", identityProvider="adapter"),
            )
            project_root = root / "projects" / "project-1"
            project_root.mkdir(parents=True)
            (project_root / "project.json").write_text(json.dumps({"installationId": "org-1"}), encoding="utf-8")
            directory._write(snapshot)
            policy = RoleBasedAuthorizationPolicy(directory)

            self.assertTrue(policy.allows(actor, "project.create"))
            self.assertTrue(policy.allows(actor, "scene.manage", "project-1"))
            reviewer = ActorContext(actorId="reviewer-1", actorDisplayName="Reviewer", installationId="org-1", deploymentMode="team")
            reviewer_snapshot = snapshot.model_copy(update={
                "user": UserRecord(id=reviewer.actorId, displayName=reviewer.actorDisplayName),
                "actor": reviewer,
                "memberships": [Membership(userId=reviewer.actorId, teamId="team-1", role="reviewer")],
                "projectMemberships": [ProjectMembership(projectId="project-1", userId=reviewer.actorId, role="reviewer")],
            })
            directory._write(reviewer_snapshot)
            self.assertTrue(policy.allows(reviewer, "review.comment.create", "project-1"))
            self.assertFalse(policy.allows(reviewer, "project.create"))

    def test_project_membership_round_trips_for_local_user(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            directory = LocalIdentityDirectory(Path(temporary))
            membership = ProjectMembership(projectId="project-1", userId=LOCAL_ACTOR.actorId, role="instructional-designer")

            membership = directory.add_project_membership(membership)

            self.assertEqual(directory.project_memberships("project-1"), [membership])
            self.assertEqual(membership.grantedBy, LOCAL_ACTOR.actorId)
            self.assertIn("instructional-designer", directory.roles_for(LOCAL_ACTOR.actorId, "project-1"))

    def test_organization_policy_round_trips(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            directory = LocalIdentityDirectory(Path(temporary))
            policy = OrganizationPolicy(
                trackingMode="centralized",
                allowGuestReviewers=True,
                adminCanViewProjectContent=False,
                auditRetentionDays=730,
            )

            directory.update_policy(policy)

            self.assertEqual(directory.policy(), policy)

    def test_installation_policy_rejects_incompatible_choices(self) -> None:
        with self.assertRaises(ValidationError):
            OrganizationPolicy(deploymentMode="single-user", identityProvider="oidc")
        with self.assertRaises(ValidationError):
            OrganizationPolicy(reviewAccess="invited-guests", allowGuestReviewers=False)
        with self.assertRaises(ValidationError):
            OrganizationPolicy(trackingMode="disabled", analyticsIdentity="project-and-user")


if __name__ == "__main__":
    unittest.main()
