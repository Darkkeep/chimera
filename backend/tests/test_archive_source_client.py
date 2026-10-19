"""Schema-bound ZIP lineage source client tests."""
import copy
import hashlib
import json
import os
from pathlib import Path
import unittest
from unittest.mock import Mock

import httpx

from backend.app.archive_source_client import ArchiveSourceInspectionClient, PublicArchiveSourceCandidate
from backend.app.conversation_boundary import AuthoringBinding, SourceIdentity
from backend.app.conversation_client import ConversationClientError


@unittest.skipUnless(os.environ.get('CHIMERA_CONVERSATION_CONTRACTS_ROOT'),
                     'Explicit unreleased archive inspection candidate path required')
class ArchiveSourceClientTests(unittest.TestCase):
    def setUp(self):
        self.root = Path(os.environ['CHIMERA_CONVERSATION_CONTRACTS_ROOT'])
        vector = json.loads((self.root / 'examples/archive-inspection.vector.json').read_text())
        self.workers = set(vector['allowed_workers'])
        self.contract = PublicArchiveSourceCandidate(self.root, allowed_workers=lambda: self.workers)
        self.calls = []
        self.issuer = Mock(return_value='synthetic-archive-proof')
        self.action = Mock(return_value=True)
        self.current = Mock()
        self.policy = Mock(return_value='policy-1')
        self.raw = b'synthetic bounded archive bytes'
        self.set_case()

    def set_case(self):
        vector = json.loads((self.root / 'examples/archive-inspection.vector.json').read_text())
        scope = {'tenant_id': 'synthetic-tenant', 'consumer_id': 'chimera',
            'actor_id': 'synthetic-actor', 'session_id': 'synthetic-session',
            'policy_revision': 'policy-1'}
        source_id = 'synthetic-archive'
        content_hash = hashlib.sha256(self.raw).hexdigest()
        inspection = copy.deepcopy(vector['trusted_record']['inspection'])
        inspection['archive_sha256'] = content_hash
        for member in inspection['members']:
            member['archive_sha256'] = content_hash
            member['inspection_sha256'] = self.contract.semantics.member_digest(member)
        metadata = {'schema_version': '1.0', 'scope': scope, 'source_id': source_id,
            'version': '1', 'content_sha256': content_hash,
            'byte_size': len(self.raw), 'media_type': 'application/zip'}
        self.metadata = metadata
        self.manifest = {'schema_version': '1.0', 'scope': scope, 'source_id': source_id,
            'version': '1', 'content_sha256': content_hash, 'byte_size': len(self.raw),
            'worker_provenance_id': vector['trusted_record']['worker_provenance_id'],
            'inspection_sha256': self.contract.semantics.inspection_digest(inspection, 'archive'),
            'media_type': 'application/zip', 'inspection': inspection}
        self.binding = AuthoringBinding(scope['tenant_id'], scope['actor_id'], scope['session_id'],
            'project', 'scene', 'revision-1', (SourceIdentity(source_id, '1', content_hash),))
        self.current.return_value = self.binding

    def client(self, handler=None):
        def default(request):
            self.calls.append(request)
            return httpx.Response(201 if request.method == 'PUT' else 200, json=self.manifest)
        return ArchiveSourceInspectionClient(base_url='https://synthetic.invalid',
            service_bearer='synthetic-archive-service', contract=self.contract,
            binding=self.binding, authorize=lambda *_: True, authorize_action=self.action,
            current_binding=self.current, current_policy_revision=self.policy,
            issue_access=self.issuer, transport=httpx.MockTransport(handler or default))

    def test_put_get_bind_exact_zip_metadata_and_lineage_only_manifest(self):
        client = self.client()
        self.assertEqual(client.ingest(self.metadata, self.raw), self.manifest)
        self.assertEqual(client.read_manifest(self.metadata, self.raw), self.manifest)
        put, get = self.calls
        self.assertEqual(put.method, 'PUT')
        self.assertEqual(put.content, self.raw)
        self.assertEqual(put.headers['Content-Type'], 'application/zip')
        self.assertEqual(put.headers['Content-Length'], str(len(self.raw)))
        self.assertEqual(put.headers['X-Pythia-Content-SHA256'], self.metadata['content_sha256'])
        self.assertEqual(get.method, 'GET')
        self.assertEqual(get.content, b'')
        self.assertEqual(self.issuer.call_args_list[0].args[4],
            self.contract.source.semantics.metadata_digest(self.metadata))
        self.assertIsNone(self.issuer.call_args_list[1].args[4])
        record = self.contract.trusted_record(self.metadata, self.manifest, self.raw)
        self.assertEqual(record['inspection']['status'], 'lineage_only')
        self.assertNotIn('text', record)

    def test_scope_hash_member_worker_or_path_substitution_is_rejected(self):
        cases = []
        for field, value in (('source_id', 'foreign'), ('version', '2'),
                             ('content_sha256', '0' * 64), ('byte_size', 1),
                             ('media_type', 'video/mp4')):
            changed = copy.deepcopy(self.manifest)
            changed[field] = value
            cases.append(changed)
        member = copy.deepcopy(self.manifest)
        member['inspection']['members'][0]['member_path'] = '../escape.txt'
        member['inspection']['members'][0]['raw_member_path'] = '../escape.txt'
        member['inspection']['members'][0]['inspection_sha256'] = self.contract.semantics.member_digest(
            member['inspection']['members'][0])
        cases.append(member)
        self.workers.clear()
        cases.append(copy.deepcopy(self.manifest))
        for manifest in cases:
            with self.subTest(member=manifest['inspection']['members'][0]['member_path']), \
                    self.assertRaises(ConversationClientError):
                self.contract.receipt(self.metadata, manifest, self.raw)

    def test_invalid_bytes_and_policy_denial_fail_before_credentials(self):
        for raw in (b'', b'wrong', b'x' * 262145):
            with self.subTest(size=len(raw)), self.assertRaises(ConversationClientError):
                self.client().ingest(self.metadata, raw)
        self.action.return_value = False
        with self.assertRaises(PermissionError):
            self.client().ingest(self.metadata, self.raw)
        self.issuer.assert_not_called()
        self.assertEqual(self.calls, [])

    def test_transport_errors_are_redacted_and_not_retried(self):
        for status in (302, 403, 409, 503):
            handler = Mock(return_value=httpx.Response(status, text='private-archive-payload'))
            with self.subTest(status=status), self.assertRaises(ConversationClientError) as error:
                self.client(handler).ingest(self.metadata, self.raw)
            self.assertEqual(handler.call_count, 1)
            self.assertNotIn('private-archive-payload', str(error.exception))


if __name__ == '__main__':
    unittest.main()
