import json
import tempfile
import unittest
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from pathlib import Path
from threading import Event

from backend.app.identity import LocalIdentityDirectory, OrganizationPolicy
from backend.app.platform import DurableEventSink, EventDeliveryPolicy, IdempotentEventReceiver, LOCAL_ACTOR, PlatformEvent, read_audit_events


def event(**updates):
    return PlatformEvent(eventName='project.created', installationId=LOCAL_ACTOR.installationId,
        actorId=LOCAL_ACTOR.actorId, actorDisplayName='Original actor', projectId='project-1', deploymentMode='single-user', **updates)


class EventDeliveryTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.sink = DurableEventSink(self.root, EventDeliveryPolicy(mode='centralized', maxAttempts=2, retryBaseSeconds=0))
        self.receiver = IdempotentEventReceiver(self.root / 'receiver')

    def test_retries_require_idempotent_receipts_and_exhaustion_is_recoverable(self):
        original = event()
        self.sink.record(original)
        self.assertEqual(self.sink.flush(lambda _: True), 0)
        self.assertEqual(self.sink.flush(lambda _: False), 0)
        self.assertTrue((self.root / 'audit/event-dead-letter.jsonl').exists())
        self.assertEqual(self.sink.retry_exhausted(), 1)
        self.assertEqual(self.sink.flush(self.receiver.accept), 1)
        self.assertEqual(self.receiver.accept(original), original.eventId)
        self.assertEqual(len(list((self.root / 'receiver').glob('*.json'))), 1)
        with self.assertRaises(ValueError):
            self.receiver.accept(original.model_copy(update={'eventName': 'project.changed'}))

    def test_record_during_network_delivery_is_preserved(self):
        self.sink.record(event())
        entered, release = Event(), Event()
        def sender(item):
            entered.set()
            self.assertTrue(release.wait(5))
            return self.receiver.accept(item)
        with ThreadPoolExecutor(max_workers=2) as pool:
            flush = pool.submit(self.sink.flush, sender)
            self.assertTrue(entered.wait(5))
            added = pool.submit(self.sink.record, event())
            try:
                added.result(timeout=3)
            finally:
                release.set()
            self.assertEqual(flush.result(timeout=5), 1)
        self.assertEqual(self.sink.flush(self.receiver.accept), 1)
        self.assertEqual(len(list((self.root / 'receiver').glob('*.json'))), 2)

    def test_interrupted_inflight_delivery_recovers_and_deduplicates(self):
        original = event()
        self.sink.record(original)
        queue = self.root / 'audit/event-queue.jsonl'
        queue.replace(queue.with_name('event-inflight.jsonl'))
        self.receiver.accept(original)  # Simulate collector acceptance before process interruption.
        self.sink.record(event())
        self.assertEqual(self.sink.flush(self.receiver.accept), 1)
        self.assertEqual(self.sink.flush(self.receiver.accept), 1)
        self.assertEqual(len(list((self.root / 'receiver').glob('*.json'))), 2)

    def test_retry_backoff_defers_delivery_until_due(self):
        self.sink = DurableEventSink(self.root, EventDeliveryPolicy(mode='centralized', retryBaseSeconds=10))
        self.sink.record(event())
        now = datetime.now(timezone.utc)
        self.assertEqual(self.sink.flush(lambda _: False, now), 0)
        self.assertEqual(self.sink.flush(self.receiver.accept, now + timedelta(seconds=9)), 0)
        self.assertEqual(self.sink.flush(self.receiver.accept, now + timedelta(seconds=10)), 1)

    def test_persisted_policy_redacts_product_data_and_keeps_required_audit(self):
        directory = LocalIdentityDirectory(self.root)
        directory.update_policy(OrganizationPolicy(trackingMode='disabled'))
        sink = DurableEventSink(self.root)
        sink.record(event(eventClass='product'))
        sink.record(event(eventClass='security', metadata={'document': 'Secret document', 'learnerAnswer': 'Private answer', 'action': 'project.export'}))
        recorded = [json.loads(line) for line in (self.root / 'audit/events.jsonl').read_text(encoding='utf-8').splitlines()]
        self.assertEqual(len(recorded), 1)
        self.assertEqual(recorded[0]['metadata'], {'action': 'project.export'})
        directory.update_policy(OrganizationPolicy(trackingMode='local'))
        DurableEventSink(self.root).record(event(eventClass='product', metadata={'userId': 'Private user', 'sceneId': 'Private scene', 'action': 'project.create'}))
        anonymous = json.loads((self.root / 'audit/events.jsonl').read_text(encoding='utf-8').splitlines()[-1])
        self.assertIsNone(anonymous['actorId'])
        self.assertIsNone(anonymous['projectId'])
        self.assertIsNone(anonymous['actorDisplayName'])
        self.assertEqual(anonymous['metadata'], {'action': 'project.create'})

    def test_retention_removes_old_audit_without_discarding_pending_delivery(self):
        old = event(occurredAt=datetime.now(timezone.utc) - timedelta(days=400))
        self.sink.record(old)
        self.sink.record(event())
        self.assertEqual(self.sink.enforce_retention(), 0)  # Retention already ran on append.
        self.assertEqual(len((self.root / 'audit/events.jsonl').read_text(encoding='utf-8').splitlines()), 1)
        self.assertEqual(self.sink.flush(self.receiver.accept), 2)

    def test_audit_reader_filters_installation_and_includes_policy_events(self):
        self.sink.record(event())
        self.sink.record(event().model_copy(update={'installationId': 'foreign'}))
        page = read_audit_events(self.root, installation_id=LOCAL_ACTOR.installationId)
        self.assertEqual(page.total, 1)


if __name__ == '__main__':
    unittest.main()
