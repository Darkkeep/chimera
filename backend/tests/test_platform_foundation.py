import unittest
import json
import tempfile
from pathlib import Path

from fastapi import HTTPException

from backend.app import storage
from backend.app import main
from backend.app.models import ProjectCreate, ReviewCommentCreate, ReviewCommentDecision, SceneCreate
from backend.app.platform import ActorContext, DurableEventSink, EventDeliveryPolicy, LOCAL_ACTOR, LocalEventSink, LocalSingleUserPolicy, PlatformEvent, read_audit_events


class PlatformFoundationTests(unittest.TestCase):
    def test_project_and_review_actions_persist_local_actor_context(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            original_root = storage.ROOT
            original_projects = storage.PROJECTS
            storage.ROOT = Path(temporary)
            storage.PROJECTS = storage.ROOT / "projects"
            try:
                project = storage.create_project(ProjectCreate(title="Platform course"))
                project = storage.create_scene(project.id, SceneCreate(title="Review scene"))
                scene = project.storyboard.scenes[0]
                comment = storage.create_review_comment(
                    project.id,
                    ReviewCommentCreate(sceneId=scene.id, authorLabel="Local user", body="Check this scene"),
                )
                storage.decide_review_comment(project.id, comment.id, ReviewCommentDecision(resolved=True))

                metadata = json.loads((storage.project_path(project.id) / "project.json").read_text(encoding="utf-8"))
                events = [json.loads(line) for line in (storage.project_path(project.id) / "audit" / "events.jsonl").read_text(encoding="utf-8").splitlines()]

                self.assertEqual(metadata["ownerId"], LOCAL_ACTOR.actorId)
                self.assertEqual(comment.actorId, LOCAL_ACTOR.actorId)
                self.assertEqual([event["eventName"] for event in events], ["project.created", "review.comment_created", "review.comment_resolved"])
                self.assertTrue(all(event["actorId"] == LOCAL_ACTOR.actorId for event in events))
            finally:
                storage.ROOT = original_root
                storage.PROJECTS = original_projects

    def test_local_context_is_stable_and_authorized(self) -> None:
        policy = LocalSingleUserPolicy()

        self.assertEqual(LOCAL_ACTOR.actorId, "local-user")
        self.assertEqual(LOCAL_ACTOR.installationId, "local-installation")
        self.assertTrue(policy.allows(LOCAL_ACTOR, "project.edit", "project-1"))

    def test_local_policy_rejects_team_context_until_team_policy_exists(self) -> None:
        team_actor = ActorContext(
            actorId="team-user",
            actorDisplayName="Team user",
            installationId="team-installation",
            deploymentMode="team",
        )

        with self.assertRaises(HTTPException) as raised:
            main.post_project(ProjectCreate(title="Rejected team request"), team_actor, LocalSingleUserPolicy())

        self.assertEqual(raised.exception.status_code, 403)

    def test_platform_event_carries_migration_context(self) -> None:
        event = PlatformEvent(
            eventName="project.created",
            installationId=LOCAL_ACTOR.installationId,
            actorId=LOCAL_ACTOR.actorId,
            projectId="project-1",
            deploymentMode=LOCAL_ACTOR.deploymentMode,
        )

        self.assertTrue(event.eventId.startswith("event-"))
        self.assertTrue(event.correlationId.startswith("correlation-"))
        self.assertIsNotNone(event.occurredAt.tzinfo)

    def test_local_event_sink_is_replaceable(self) -> None:
        sink = LocalEventSink()
        event = PlatformEvent(
            eventName="project.created",
            installationId=LOCAL_ACTOR.installationId,
            deploymentMode=LOCAL_ACTOR.deploymentMode,
        )

        sink.record(event)

        self.assertEqual(sink.events, [event])

    def test_durable_event_sink_supports_policy_modes_and_retries(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            event = PlatformEvent(
                eventName="project.created",
                installationId=LOCAL_ACTOR.installationId,
                actorId=LOCAL_ACTOR.actorId,
                deploymentMode=LOCAL_ACTOR.deploymentMode,
                eventClass="product",
            )

            disabled = DurableEventSink(root, EventDeliveryPolicy(mode="disabled"))
            disabled.record(event)
            self.assertFalse((root / "audit" / "events.jsonl").exists())

            sink = DurableEventSink(root, EventDeliveryPolicy(mode="centralized", maxAttempts=2, retryBaseSeconds=0))
            sink.record(event)
            queue = root / "audit" / "event-queue.jsonl"
            self.assertTrue(queue.exists())
            self.assertEqual(sink.flush(lambda _: False), 0)
            self.assertTrue(queue.exists())
            self.assertEqual(sink.flush(lambda _: False), 0)
            self.assertFalse(queue.exists())
            self.assertTrue((root / "audit" / "event-dead-letter.jsonl").exists())

            sink.record(event)
            self.assertEqual(sink.flush(lambda event: event.eventId), 1)
            self.assertFalse(queue.exists())

    def test_audit_reader_paginates_and_ignores_malformed_lines(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            sink = DurableEventSink(root / "projects" / "project-1")
            for name in ("project.created", "review.comment_created"):
                sink.record(PlatformEvent(
                    eventName=name,
                    installationId=LOCAL_ACTOR.installationId,
                    actorId=LOCAL_ACTOR.actorId,
                    projectId="project-1",
                    deploymentMode=LOCAL_ACTOR.deploymentMode,
                ))
            audit_path = root / "projects" / "project-1" / "audit" / "events.jsonl"
            audit_path.write_text(audit_path.read_text(encoding="utf-8") + "not-json\n", encoding="utf-8")

            page = read_audit_events(root, offset=1, limit=1)

            self.assertEqual(page.total, 2)
            self.assertEqual(len(page.events), 1)
            self.assertEqual(page.offset, 1)


if __name__ == "__main__":
    unittest.main()
