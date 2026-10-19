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
from backend.app.csv_source_client import PublicCsvSourceCandidate, CsvSourceCandidateClient


@unittest.skipUnless(os.environ.get('CHIMERA_CONVERSATION_CONTRACTS_ROOT'), 'Explicit candidate path required')
class CsvSourceClientTests(unittest.TestCase):
    def setUp(self):
        root = Path(os.environ['CHIMERA_CONVERSATION_CONTRACTS_ROOT'])
        self.workers = {'synthetic-csv-worker-v1'}
        self.contract = PublicCsvSourceCandidate(root, allowed_workers=lambda: self.workers)
        vector = json.loads((root / 'examples/conversation-table.vector.json').read_text())
        record = vector['trusted_record']
        self.raw = vector['raw_utf8'].encode('utf-8')
        self.metadata = dict(schema_version='1.0', scope={**record['scope'], 'consumer_id':'chimera'},
            source_id=record['source_id'], version=record['version'], content_sha256=record['content_sha256'],
            byte_size=len(self.raw), media_type='text/csv')
        doc = record['document']
        self.snapshot = dict(source_id=record['source_id'], version=record['version'],
            content_sha256=record['content_sha256'], extraction_sha256=self.contract.table.semantics.extraction_digest(doc),
            media_type='text/csv', parser_revision=doc['parser_revision'],
            worker_provenance_id=record['worker_provenance_id'], status='ready', headers=doc['headers'],
            header_sha256=self.contract.table.canonical.digest(doc['headers']), data_row_count=len(doc['rows']),
            coverage=[{'start_row':1,'end_row':2}], rows=doc['rows'])
        self.receipt = {**copy.deepcopy(self.metadata), 'status':'ready','snapshot':self.snapshot,'error_code':None}
        scope = self.metadata['scope']
        self.binding = AuthoringBinding(scope['tenant_id'],scope['actor_id'],scope['session_id'],
            'project','scene','revision-1',(SourceIdentity(record['source_id'],record['version'],record['content_sha256']),))
        self.current = Mock(return_value=self.binding)
        self.issuer = Mock(return_value='synthetic-proof')
        self.action = Mock(return_value=True)
        self.policy = Mock(return_value='policy-1')
        self.calls=[]

    def client(self, handler=None):
        def default(request):
            self.calls.append(request)
            return httpx.Response(201 if request.method=='PUT' else 200,json=self.receipt)
        return CsvSourceCandidateClient(base_url='https://synthetic.invalid',service_bearer='synthetic-service',
            contract=self.contract,binding=self.binding,authorize=lambda *a:True,authorize_action=self.action,
            current_binding=self.current,current_policy_revision=self.policy,issue_access=self.issuer,
            transport=httpx.MockTransport(handler or default))

    def test_full_authenticated_receipt_put_get_and_record(self):
        client=self.client()
        self.assertEqual(client.ingest(self.metadata,self.raw),self.receipt)
        self.assertEqual(client.read_manifest(self.metadata,self.raw),self.receipt)
        put,get=self.calls
        self.assertEqual(put.content,self.raw)
        self.assertEqual(put.headers['Content-Type'],'text/csv')
        self.assertEqual(get.content,b'')
        self.assertEqual(self.issuer.call_args_list[1].args[0],'source:read')
        self.assertIsNone(self.issuer.call_args_list[1].args[4])
        record=self.contract.trusted_record(self.metadata,self.receipt,self.raw)
        self.assertEqual(record['document']['duplicate_headers'],['value'])
        self.assertEqual(record['document']['header_span'],{'start':0,'end':13})
        self.assertEqual(record['document']['rows'][0]['cells'][0],'first\ncontinued')

    def test_partial_cannot_establish_full_record(self):
        self.receipt['status']=self.snapshot['status']='partial'
        self.snapshot['rows']=self.snapshot['rows'][1:]
        self.snapshot['coverage']=[{'start_row':2,'end_row':2}]
        with self.assertRaises(ConversationClientError):self.client().ingest(self.metadata,self.raw)

    def test_header_only_record(self):
        self.raw=b'value,value\r\n'
        self.metadata.update(byte_size=len(self.raw),content_sha256=hashlib.sha256(self.raw).hexdigest())
        doc=dict(schema_version='1.0',parser_revision='csv-strict-utf8-v1',headers=['value','value'],
            header_span={'start':0,'end':13},rows=[],duplicate_headers=['value'])
        self.snapshot.update(content_sha256=self.metadata['content_sha256'],status='no_data_rows',
            extraction_sha256=self.contract.table.semantics.extraction_digest(doc),rows=[],coverage=[],data_row_count=0)
        receipt={**self.metadata,'status':'no_data_rows','snapshot':self.snapshot,'error_code':None}
        self.assertEqual(self.contract.trusted_record(self.metadata,receipt,self.raw)['document'],doc)

    def test_modified_receipt_hash_scope_mime_worker_and_projection_rejected(self):
        original=copy.deepcopy(self.receipt)
        mutations=[lambda r:r.update(media_type='text/plain'),lambda r:r['scope'].update(actor_id='other'),
            lambda r:r['snapshot'].update(worker_provenance_id='unqualified'),
            lambda r:r['snapshot']['headers'].__setitem__(0,'changed'),
            lambda r:r['snapshot']['rows'][0]['cells'].__setitem__(0,'changed'),
            lambda r:r['snapshot']['rows'][0]['span'].update(end=99999),
            lambda r:r.update(byte_size=1),lambda r:r['snapshot'].update(extraction_sha256='0'*64)]
        for mutate in mutations:
            with self.subTest(mutate=mutate):
                self.receipt=copy.deepcopy(original);mutate(self.receipt)
                with self.assertRaises(ConversationClientError):self.client().ingest(self.metadata,self.raw)

    def test_bytes_prevent_credentials_and_binding_rechecked(self):
        for raw in [b'',b'wrong',b'\xff',b'x'*262145]:
            with self.assertRaises(ConversationClientError):self.client().ingest(self.metadata,raw)
        self.issuer.assert_not_called()
        self.current.side_effect=[self.binding,replace(self.binding,scene_revision='changed')]
        with self.assertRaises(ValueError):self.client().ingest(self.metadata,self.raw)

    def test_revoked_worker_action_policy_and_post_io_worker(self):
        self.action.return_value=False
        with self.assertRaises(PermissionError):self.client().ingest(self.metadata,self.raw)
        self.action.return_value=True
        self.policy.return_value='changed'
        with self.assertRaises(ValueError):self.client().ingest(self.metadata,self.raw)
        self.policy.return_value='policy-1'
        def revoke(request):
            self.workers.clear()
            return httpx.Response(200,json=self.receipt)
        with self.assertRaises(ConversationClientError):self.client(revoke).read_manifest(self.metadata,self.raw)

    def test_transport_rejection_no_retry(self):
        for status in [302,403,409,503]:
            handler=Mock(return_value=httpx.Response(status,json=self.receipt))
            with self.assertRaises(ConversationClientError):self.client(handler).ingest(self.metadata,self.raw)
            self.assertEqual(handler.call_count,1)
        handler=Mock(return_value=httpx.Response(200,content=b' '*1048577))
        with self.assertRaises(ConversationClientError):self.client(handler).read_manifest(self.metadata,self.raw)


if __name__=='__main__':unittest.main()
