"""Schema-bound media inspection source client tests."""
import copy
import hashlib
import json
import os
from pathlib import Path
import unittest
from unittest.mock import Mock

import httpx

from backend.app.conversation_boundary import AuthoringBinding, SourceIdentity
from backend.app.conversation_client import ConversationClientError
from backend.app.media_source_client import MediaSourceInspectionClient, PublicMediaSourceCandidate


@unittest.skipUnless(os.environ.get('CHIMERA_CONVERSATION_CONTRACTS_ROOT'),
                     'Explicit unreleased inspection candidate path required')
class MediaSourceClientTests(unittest.TestCase):
    def setUp(self):
        self.root = Path(os.environ['CHIMERA_CONVERSATION_CONTRACTS_ROOT'])
        vector = json.loads((self.root / 'examples/media-inspection.vector.json').read_text())
        self.workers = set(vector['allowed_workers'])
        self.contract = PublicMediaSourceCandidate(self.root, allowed_workers=lambda: self.workers)
        self.calls = []
        self.issuer = Mock(return_value='synthetic-media-proof')
        self.action = Mock(return_value=True)
        self.current = Mock()
        self.policy = Mock(return_value='policy-1')
        self.raw = b'synthetic bounded media bytes'
        self.set_case()

    def set_case(self):
        scope = {'tenant_id': 'synthetic-tenant', 'consumer_id': 'chimera',
            'actor_id': 'synthetic-actor', 'session_id': 'synthetic-session',
            'policy_revision': 'policy-1'}
        self.metadata = {'schema_version': '1.0', 'scope': scope,
            'source_id': 'synthetic-media', 'version': '1',
            'content_sha256': hashlib.sha256(self.raw).hexdigest(),
            'byte_size': len(self.raw), 'media_type': 'video/mp4'}
        vector = json.loads((self.root / 'examples/media-inspection.vector.json').read_text())
        trusted = vector['trusted_record']
        self.manifest = {'schema_version': '1.0', 'scope': scope,
            'source_id': self.metadata['source_id'], 'version': self.metadata['version'],
            'content_sha256': self.metadata['content_sha256'], 'byte_size': len(self.raw),
            'worker_provenance_id': trusted['worker_provenance_id'],
            'inspection_sha256': vector['inspection_sha256'], 'media_type': 'video/mp4',
            'inspection': trusted['inspection']}
        self.binding = AuthoringBinding(scope['tenant_id'], scope['actor_id'], scope['session_id'],
            'project', 'scene', 'revision-1',
            (SourceIdentity(self.metadata['source_id'], '1', self.metadata['content_sha256']),))
        self.current.return_value = self.binding

    def client(self, handler=None):
        def default(request):
            self.calls.append(request)
            return httpx.Response(201 if request.method == 'PUT' else 200, json=self.manifest)
        return MediaSourceInspectionClient(base_url='https://synthetic.invalid',
            service_bearer='synthetic-media-service', contract=self.contract,
            binding=self.binding, authorize=lambda *_: True, authorize_action=self.action,
            current_binding=self.current, current_policy_revision=self.policy,
            issue_access=self.issuer, transport=httpx.MockTransport(handler or default))

    def test_put_and_get_bind_exact_bytes_metadata_and_manifest(self):
        client = self.client()
        self.assertEqual(client.ingest(self.metadata, self.raw), self.manifest)
        self.assertEqual(client.read_manifest(self.metadata, self.raw), self.manifest)
        put, get = self.calls
        self.assertEqual(put.method, 'PUT')
        self.assertEqual(put.content, self.raw)
        self.assertEqual(put.headers['Content-Type'], 'video/mp4')
        self.assertEqual(put.headers['Content-Length'], str(len(self.raw)))
        self.assertEqual(put.headers['X-Pythia-Content-SHA256'], self.metadata['content_sha256'])
        self.assertEqual(get.method, 'GET')
        self.assertEqual(get.content, b'')
        self.assertEqual(self.issuer.call_args_list[0].args[4],
            self.contract.source.semantics.metadata_digest(self.metadata))
        self.assertIsNone(self.issuer.call_args_list[1].args[4])
        record = self.contract.trusted_record(self.metadata, self.manifest, self.raw)
        self.assertEqual(record['worker_provenance_id'], 'synthetic-inspection-worker-v1')
        self.assertEqual(record['inspection']['content_status'], 'not_inspected')

    def test_scope_hash_manifest_and_worker_changes_are_rejected(self):
        for field, value in (('source_id', 'foreign'), ('version', '2'),
                             ('content_sha256', '0' * 64), ('byte_size', 1),
                             ('media_type', 'audio/mpeg')):
            changed = copy.deepcopy(self.manifest)
            changed[field] = value
            with self.subTest(field=field), self.assertRaises(ConversationClientError):
                self.contract.receipt(self.metadata, changed, self.raw)
        self.workers.clear()
        with self.assertRaises(ConversationClientError):
            self.contract.receipt(self.metadata, self.manifest, self.raw)

    def test_invalid_bytes_metadata_and_denial_fail_before_credentials(self):
        for raw in (b'', b'wrong', b'x' * 262145):
            with self.subTest(size=len(raw)), self.assertRaises(ConversationClientError):
                self.client().ingest(self.metadata, raw)
        invalid = copy.deepcopy(self.metadata)
        invalid['media_type'] = 'application/zip'
        with self.assertRaises(ConversationClientError):
            self.client().ingest(invalid, self.raw)
        self.action.return_value = False
        with self.assertRaises(PermissionError):
            self.client().ingest(self.metadata, self.raw)
        self.issuer.assert_not_called()
        self.assertEqual(self.calls, [])

    def test_policy_and_worker_are_rechecked_after_http(self):
        self.current.side_effect = [self.binding, AuthoringBinding(
            self.binding.tenant_id, self.binding.actor_id, self.binding.session_id,
            self.binding.project_id, self.binding.scene_id, 'revision-2', self.binding.sources)]
        with self.assertRaises(ValueError):
            self.client().ingest(self.metadata, self.raw)
        self.current.side_effect = None
        self.current.return_value = self.binding

        def revoke_worker(_):
            self.workers.clear()
            return httpx.Response(200, json=self.manifest)

        with self.assertRaises(ConversationClientError):
            self.client(revoke_worker).read_manifest(self.metadata, self.raw)

    def test_transport_errors_are_redacted_and_not_retried(self):
        for status in (302, 403, 409, 503):
            handler = Mock(return_value=httpx.Response(status, text='private-media-payload'))
            with self.subTest(status=status), self.assertRaises(ConversationClientError) as error:
                self.client(handler).ingest(self.metadata, self.raw)
            self.assertEqual(handler.call_count, 1)
            self.assertNotIn('private-media-payload', str(error.exception))


if __name__ == '__main__':
    unittest.main()
