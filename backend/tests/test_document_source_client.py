import copy
from dataclasses import replace
import hashlib
import json
import os
from pathlib import Path
import unittest
from unittest.mock import Mock

import httpx

from backend.app.conversation_boundary import AuthoringBinding, SourceIdentity
from backend.app.conversation_client import ConversationClientError
from backend.app.document_source_client import (
    DOCX, PDF, DocumentSourceCandidateClient, PublicDocumentSourceCandidate,
)


@unittest.skipUnless(os.environ.get('CHIMERA_CONVERSATION_CONTRACTS_ROOT'),
                     'Explicit unreleased document candidate path required')
class DocumentSourceClientTests(unittest.TestCase):
    def setUp(self):
        self.root = Path(os.environ['CHIMERA_CONVERSATION_CONTRACTS_ROOT'])
        self.workers = {'synthetic-document-worker-v1'}
        self.contract = PublicDocumentSourceCandidate(self.root, allowed_workers=lambda: self.workers)
        self.calls = []
        self.issuer = Mock(return_value='synthetic-document-proof')
        self.action = Mock(return_value=True)
        self.current = Mock()
        self.policy = Mock(return_value='policy-1')
        self.set_case(PDF)

    def set_case(self, media_type):
        kind = 'pdf' if media_type == PDF else 'docx'
        vector = json.loads((self.root / f'examples/{kind}-document.vector.json').read_text())
        source_record = copy.deepcopy(vector['trusted_record'])
        sibling = self.root.parent / 'manteion/manteion'
        suffix = 'pdf' if media_type == PDF else 'docx'
        self.raw = (sibling / f'public/fixtures/conversation-preview/historical-handoff-briefing.{suffix}').read_bytes()
        scope = {**source_record['scope'], 'consumer_id': 'chimera'}
        source_id = 'synthetic-' + kind
        self.metadata = dict(schema_version='1.0', scope=scope, source_id=source_id, version='1',
            content_sha256=hashlib.sha256(self.raw).hexdigest(), byte_size=len(self.raw), media_type=media_type)
        source_record.update(scope=copy.deepcopy(scope), source_id=source_id, version='1',
            content_sha256=self.metadata['content_sha256'], byte_size=len(self.raw), media_type=media_type)
        self.manifest = source_record
        self.binding = AuthoringBinding(scope['tenant_id'], scope['actor_id'], scope['session_id'],
            'project', 'scene', 'revision-1', (SourceIdentity(source_id, '1', self.metadata['content_sha256']),))
        self.current.return_value = self.binding

    def client(self, handler=None):
        def default(request):
            self.calls.append(request)
            return httpx.Response(201 if request.method == 'PUT' else 200, json=self.manifest)
        return DocumentSourceCandidateClient(base_url='https://synthetic.invalid',
            service_bearer='synthetic-document-service', contract=self.contract,
            binding=self.binding, authorize=lambda *_: True, authorize_action=self.action,
            current_binding=self.current, current_policy_revision=self.policy,
            issue_access=self.issuer, transport=httpx.MockTransport(handler or default))

    def test_pdf_and_docx_put_get_bind_exact_bytes_and_document_receipt(self):
        for media_type in (PDF, DOCX):
            with self.subTest(media_type=media_type):
                self.set_case(media_type)
                self.calls.clear()
                self.issuer.reset_mock()
                client = self.client()
                self.assertEqual(client.ingest(self.metadata, self.raw), self.manifest)
                self.assertEqual(client.read_manifest(self.metadata, self.raw), self.manifest)
                put, get = self.calls
                self.assertEqual(put.method, 'PUT')
                self.assertEqual(put.content, self.raw)
                self.assertEqual(put.headers['Content-Type'], media_type)
                self.assertEqual(put.headers['Content-Length'], str(len(self.raw)))
                self.assertEqual(put.headers['X-Pythia-Content-SHA256'], self.metadata['content_sha256'])
                self.assertEqual(get.method, 'GET')
                self.assertEqual(get.content, b'')
                self.assertEqual(self.issuer.call_args_list[0].args[4],
                    self.contract.source.semantics.metadata_digest(self.metadata))
                self.assertIsNone(self.issuer.call_args_list[1].args[4])
                record = self.contract.trusted_record(self.metadata, self.manifest, self.raw)
                self.assertEqual(record['worker_provenance_id'], 'synthetic-document-worker-v1')
                self.assertNotEqual(record['content_sha256'], record['extraction_sha256'])

    def test_modified_source_scope_hash_document_or_worker_is_rejected(self):
        for field, value in (('source_id', 'foreign'), ('version', '2'),
                             ('content_sha256', '0' * 64), ('byte_size', 1),
                             ('media_type', DOCX)):
            changed = copy.deepcopy(self.manifest)
            changed[field] = value
            with self.subTest(field=field), self.assertRaises(ConversationClientError):
                self.contract.receipt(self.metadata, changed, self.raw)
        changed = copy.deepcopy(self.manifest)
        changed['document']['text'] += ' forged'
        with self.assertRaises(ConversationClientError):
            self.contract.receipt(self.metadata, changed, self.raw)
        self.workers.clear()
        with self.assertRaises(ConversationClientError):
            self.contract.receipt(self.metadata, self.manifest, self.raw)

    def test_invalid_original_metadata_and_action_fail_before_credentials(self):
        for raw in (b'', b'wrong', b'x' * 262145):
            with self.subTest(size=len(raw)), self.assertRaises(ConversationClientError):
                self.client().ingest(self.metadata, raw)
        invalid = copy.deepcopy(self.metadata)
        invalid['media_type'] = 'text/plain'
        with self.assertRaises(ConversationClientError):
            self.client().ingest(invalid, self.raw)
        self.action.return_value = False
        with self.assertRaises(PermissionError):
            self.client().ingest(self.metadata, self.raw)
        self.issuer.assert_not_called()
        self.assertEqual(self.calls, [])

    def test_current_scene_policy_and_worker_rechecked_after_http(self):
        self.current.side_effect = [self.binding, replace(self.binding, scene_revision='revision-2')]
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
            handler = Mock(return_value=httpx.Response(status, text='private-document-body'))
            with self.subTest(status=status), self.assertRaises(ConversationClientError) as error:
                self.client(handler).ingest(self.metadata, self.raw)
            self.assertEqual(handler.call_count, 1)
            self.assertNotIn('private-document-body', str(error.exception))


if __name__ == '__main__':
    unittest.main()