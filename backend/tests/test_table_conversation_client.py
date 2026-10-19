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
from backend.app.table_conversation_client import PublicTableConversationContract, TableConversationClient


@unittest.skipUnless(os.environ.get("CHIMERA_CONVERSATION_CONTRACTS_ROOT"),
                     "Explicit unreleased CSV1.1 candidate required")
class TableConversationClientTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.root = Path(os.environ["CHIMERA_CONVERSATION_CONTRACTS_ROOT"])
        cls.contract = PublicTableConversationContract(cls.root)

    def fixture(self, name):
        return json.loads((self.root / "examples" / name).read_text(encoding="utf-8"))

    def setUp(self):
        self.request = self.fixture("conversation-table-turn-request.valid.json")
        self.operation = self.fixture("conversation-table-operation.valid.json")
        self.vector = self.fixture("conversation-table.vector.json")
        self.request["scope"]["consumer_id"] = "chimera"
        record = self.vector["trusted_record"]
        record["scope"]["consumer_id"] = "chimera"
        self.records = {(record["source_id"], record["version"]): record}
        self.workers = set(self.vector["allowed_workers"])
        scope = self.request["scope"]
        self.binding = AuthoringBinding(scope["tenant_id"], scope["actor_id"], scope["session_id"],
            "dispatch-demo", "night-handoff", "scene-3",
            (SourceIdentity(record["source_id"], record["version"], record["content_sha256"]),))
        self.issuer = Mock(return_value="synthetic-table-access")
        self.calls = []
        self.refresh()

    def refresh(self):
        self.request["context_sha256"] = self.contract.canonical.digest(
            self.contract.canonical.normalized_context(self.request["context"]))
        self.operation["scope"] = copy.deepcopy(self.request["scope"])
        self.operation["context_sha256"] = self.request["context_sha256"]
        self.operation["request_sha256"] = self.contract.semantics.request_digest(self.request)

    def client(self, handler=None, **changes):
        def default(request):
            self.calls.append(request)
            return httpx.Response(202 if request.url.path.endswith("/turns") else 200, json=self.operation)
        kwargs = dict(base_url="https://synthetic.invalid", service_bearer="synthetic-table-bearer",
                      contract=self.contract, binding=self.binding, authorize=lambda *_: True,
                      current_binding=lambda: self.binding, current_policy_revision=lambda: "policy-1",
                      issue_access=self.issuer, transport=httpx.MockTransport(handler or default),
                      trusted_csv_records=lambda: self.records, allowed_workers=lambda: self.workers)
        kwargs.update(changes)
        return TableConversationClient(**kwargs)

    def test_exact_csv_projection_uses_existing_public_routes_and_original_hash_grant(self):
        client = self.client()
        self.assertEqual(client.submit(self.request), self.operation)
        self.assertEqual(client.read(self.request, "operation-1"), self.operation)
        self.assertEqual(client.cancel(self.request, "operation-1"), self.operation)
        sent = json.loads(self.calls[0].content)
        rows = sent["context"]["source_snapshots"][0]["rows"]
        self.assertEqual([r["data_row_number"] for r in rows], [2])
        self.assertNotIn("first\ncontinued", self.calls[0].content.decode())
        self.assertEqual(self.issuer.call_args_list[0].args[4], [self.binding.sources[0].sha256])
        with self.assertRaises(ConversationClientError):
            self.contract.original.request(self.request)

    def test_rehashed_client_table_assertions_cannot_replace_server_record(self):
        baseline = copy.deepcopy(self.request)
        cases = [lambda s: s.update(extraction_sha256="a" * 64),
                 lambda s: s.update(worker_provenance_id="another-qualified-worker"),
                 lambda s: s.update(parser_revision="other-parser"),
                 lambda s: s["rows"][0]["cells"].__setitem__(1, "999"),
                 lambda s: s["rows"][0]["span"].update(start=36),
                 lambda s: s.update(headers=["value", "other"],
                                      header_sha256=self.contract.canonical.digest(["value", "other"]))]
        self.workers.add("another-qualified-worker")
        for index, mutate in enumerate(cases):
            self.request = copy.deepcopy(baseline)
            mutate(self.request["context"]["source_snapshots"][0])
            self.refresh()
            with self.subTest(index=index), self.assertRaises(ConversationClientError):
                self.client().submit(self.request)
        self.issuer.assert_not_called()
        self.assertEqual(self.calls, [])

    def test_missing_foreign_or_unqualified_server_record_fails_closed(self):
        record = copy.deepcopy(next(iter(self.records.values())))
        for records, workers in (({}, self.workers),
                                 ({("synthetic-csv", "1"): {**record, "scope": {**record["scope"], "actor_id": "foreign"}}}, self.workers),
                                 (self.records, set())):
            with self.subTest(workers=workers), self.assertRaises(ConversationClientError):
                self.client(trusted_csv_records=lambda: records, allowed_workers=lambda: workers).submit(self.request)

    def test_wrong_coverage_missing_or_duplicate_projection_rows_are_rejected(self):
        baseline = copy.deepcopy(self.request)
        for mutate in (lambda s: s.update(coverage=[{"start_row": 1, "end_row": 1}]),
                       lambda s: s.update(rows=[]),
                       lambda s: s["rows"].append(copy.deepcopy(s["rows"][0])),
                       lambda s: s.update(status="ready")):
            self.request = copy.deepcopy(baseline)
            mutate(self.request["context"]["source_snapshots"][0])
            self.refresh()
            with self.assertRaises(ConversationClientError):
                self.client().submit(self.request)

    def test_rehashed_citation_substitution_cannot_escape_projected_rows(self):
        baseline = copy.deepcopy(self.operation)
        for field, value in (("worker_provenance_id", "other-worker"), ("extraction_sha256", "a" * 64),
                             ("header_sha256", "a" * 64), ("data_row_number", 1), ("column_index", 2),
                             ("span", {"start": 36, "end": 46})):
            self.operation = copy.deepcopy(baseline)
            result = self.operation["result"]
            result["citations"][0][field] = value
            result["answer_sha256"] = self.contract.canonical.digest(
                {k: v for k, v in result.items() if k != "answer_sha256"})
            with self.subTest(field=field), self.assertRaises(ConversationClientError):
                self.client().read(self.request, "operation-1")

    def test_full_extraction_identity_survives_selection_change(self):
        source = self.request["context"]["source_snapshots"][0]
        original_extraction = source["extraction_sha256"]
        record = next(iter(self.records.values()))
        source.update(status="ready", coverage=[{"start_row": 1, "end_row": 2}],
                      rows=copy.deepcopy(record["document"]["rows"]))
        self.refresh()
        self.contract.request(self.request)
        self.contract.trusted_request(self.request, self.records, self.workers)
        self.assertEqual(source["extraction_sha256"], original_extraction)

    def test_authoritative_worker_revocation_and_stale_scene_after_http_hide_result(self):
        def revoke(_):
            self.workers.clear()
            return httpx.Response(202, json=self.operation)
        with self.assertRaises(ConversationClientError):
            self.client(revoke).submit(self.request)
        self.workers = set(self.vector["allowed_workers"])
        current = Mock(side_effect=[self.binding, replace(self.binding, scene_revision="scene-4")])
        with self.assertRaises(ValueError):
            self.client(current_binding=current).submit(self.request)

    def test_header_only_table_has_no_data_rows_or_citations(self):
        record = next(iter(self.records.values()))
        record["document"]["rows"] = []
        record["content_sha256"] = hashlib.sha256(b"value,value\r\n").hexdigest()
        source = self.request["context"]["source_snapshots"][0]
        source.update(content_sha256=record["content_sha256"], status="no_data_rows", coverage=[], rows=[],
                      data_row_count=0, extraction_sha256=self.contract.semantics.extraction_digest(record["document"]))
        self.binding = replace(self.binding, sources=(SourceIdentity(record["source_id"], record["version"], record["content_sha256"]),))
        result = self.operation["result"]
        result.update(kind="clarification", content="The source contains headers and no data records.", citations=[])
        result["answer_sha256"] = self.contract.canonical.digest({k: v for k, v in result.items() if k != "answer_sha256"})
        self.operation["answer_revision"] = None
        self.refresh()
        self.assertEqual(self.client().submit(self.request)["answer_revision"], None)


if __name__ == "__main__":
    unittest.main()
