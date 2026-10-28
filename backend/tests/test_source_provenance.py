import copy
from dataclasses import replace
import json
import os
from pathlib import Path
import tempfile
import unittest

from backend.app.conversation_boundary import AuthoringBinding, SourceIdentity
from backend.app.conversation_client import ConversationClientError
from backend.app.source_provenance import PublicSourceCandidate, bind_source_transfer


@unittest.skipUnless(os.environ.get("CHIMERA_CONVERSATION_CONTRACTS_ROOT"),
                     "Explicit unreleased source candidate path required")
class SourceProvenanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.root = Path(os.environ["CHIMERA_CONVERSATION_CONTRACTS_ROOT"])
        cls.candidate = PublicSourceCandidate(cls.root)

    def setUp(self):
        self.fixture = json.loads((Path(__file__).parent / "fixtures/conversation-source-consumer-cases.json")
                                  .read_text(encoding="utf-8"))
        self.metadata = self.fixture["source_metadata"]
        self.raw = self.fixture["source_utf8"].encode("utf-8")
        scope = self.metadata["scope"]
        authoring = self.fixture["trusted_authoring_context"]
        self.binding = AuthoringBinding(scope["tenant_id"], scope["actor_id"], scope["session_id"],
            authoring["project_id"], authoring["scene_id"], authoring["scene_revision"],
            (SourceIdentity(self.metadata["source_id"], self.metadata["version"], self.metadata["content_sha256"]),))
        self.manifest = {**copy.deepcopy(self.metadata), "status": "ready", "error_code": None,
                         "snapshot": {**{k: self.metadata[k] for k in ("source_id", "version", "content_sha256", "media_type")},
                                      "extraction_sha256": self.metadata["content_sha256"], "status": "ready",
                                      "coverage": [{"start": 0, "end": len(self.fixture["source_utf8"])}]}}
        self.table = {**{k: self.fixture["csv_anchor"][k] for k in
                        ("source_id", "version", "content_sha256", "parser_revision")},
                      "headers": ["value", "value"], "data_row_count": 2,
                      "coverage": [{"start_row": 1, "end_row": 2}],
                      "rows": [{"data_row_number": 1, "span": {"start": 13, "end": 35}},
                               {"data_row_number": 2, "span": {"start": 35, "end": 46}}]}

    def bind(self, metadata, current=None, action="source:ingest", grant=None, authorize=None):
        bind_source_transfer(metadata, self.binding, current or self.binding,
                             authorize or (lambda *_: True), grant or (lambda *_: True),
                             policy_revision="policy-1", action=action)

    def test_exact_source_receipt_and_design_anchor_pass_without_turn_support(self):
        self.bind(self.candidate.metadata(self.metadata))
        self.assertEqual(self.candidate.receipt(self.metadata, self.manifest, self.raw), self.manifest)
        self.assertEqual(self.candidate.csv_anchor(self.fixture["csv_anchor"], self.table), self.fixture["csv_anchor"])
        self.assertEqual(len(self.fixture["negative_cases"]), 19)
        self.assertEqual(len({case["case_id"] for case in self.fixture["negative_cases"]}), 19)

    def test_all_typed_negative_consumer_cases_are_rejected_at_their_boundary(self):
        for case in self.fixture["negative_cases"]:
            with self.subTest(case=case["case_id"]):
                value = copy.deepcopy(self.metadata if case["payload_type"] == "source-ingestion-metadata"
                                      else self.fixture["csv_anchor"])
                change = case["change"]
                if "path" in change:
                    target = value
                    parts = change["path"].split(".")
                    for part in parts[:-1]:
                        target = target[part]
                    target[parts[-1]] = change["value"]
                layer = case["expected_rejection_layer"]
                if layer == "schema":
                    with self.assertRaises(ConversationClientError):
                        self.candidate._validated(case["payload_type"], value)
                elif layer == "authorization":
                    value = self.candidate.metadata(value)  # valid shape does not grant access
                    grant = lambda _b, _s, action: action == change.get("trusted_grant_action", action)
                    with self.assertRaises((PermissionError, ValueError)):
                        self.bind(value, grant=grant)
                elif layer == "scene-revision":
                    with self.assertRaises(ValueError):
                        self.bind(value, current=replace(self.binding, scene_revision=change["trusted_scene_revision"]))
                elif layer == "source-integrity":
                    raw = change.get("original_bytes_utf8", self.fixture["source_utf8"]).encode("utf-8")
                    with self.assertRaises(ConversationClientError):
                        self.candidate.receipt(value, self.manifest, raw)
                elif layer == "anchor-resolution":
                    # These are valid-shaped anchors; the trusted parser metadata disproves them.
                    self.candidate._validated("csv-source-anchor", value)
                    with self.assertRaises(ConversationClientError):
                        self.candidate.csv_anchor(value, self.table)
                elif layer == "turn-schema":
                    operation = json.loads((self.root / "examples/conversation-operation.valid.json").read_text())
                    request = json.loads((self.root / "examples/conversation-turn-request.valid.json").read_text())
                    operation["result"]["citations"] = [value]
                    with self.assertRaises(ConversationClientError):
                        self.candidate.turn.operation(self.candidate.turn.semantics.canonical_bytes(operation), request)
                else:
                    self.fail("Unexercised rejection layer")

    def test_revoked_grant_and_changed_scope_cannot_attach_receipt(self):
        for changes in ({"actor_id": "foreign"}, {"project_id": "foreign"}, {"scene_id": "foreign"},
                        {"sources": ()}):
            with self.subTest(changes=changes), self.assertRaises(ValueError):
                self.bind(self.metadata, current=replace(self.binding, **changes))
        with self.assertRaises(PermissionError):
            self.bind(self.metadata, authorize=lambda *_: False)
        with self.assertRaises(PermissionError):
            self.bind(self.metadata, grant=lambda *_: "yes")
        with self.assertRaises(ValueError):
            self.bind(self.metadata, action="storyboard:apply")

    def test_receipt_snapshot_and_partial_coverage_cannot_overclaim(self):
        for missing_bytes in (None, self.fixture["source_utf8"], bytearray(self.raw)):
            with self.subTest(missing_bytes=type(missing_bytes).__name__), self.assertRaises(ConversationClientError):
                self.candidate.receipt(self.metadata, self.manifest, missing_bytes)
        for field, value in (("extraction_sha256", "0" * 64), ("version", "foreign"),
                             ("coverage", [{"start": 0, "end": len(self.raw) + 1}]),
                             ("coverage", [{"start": 1, "end": len(self.raw)}])):
            manifest = copy.deepcopy(self.manifest)
            manifest["snapshot"][field] = value
            with self.subTest(field=field, value=value), self.assertRaises(ConversationClientError):
                self.candidate.receipt(self.metadata, manifest, self.raw)
        failed = {**self.manifest, "status": "failed", "snapshot": None, "error_code": "invalid_utf8"}
        self.assertEqual(self.candidate.receipt(self.metadata, failed, self.raw)["status"], "failed")
        failed["snapshot"] = self.manifest["snapshot"]
        with self.assertRaises(ConversationClientError):
            self.candidate.receipt(self.metadata, failed, self.raw)

    def test_public_source_helper_and_schema_drift_fail_before_loading(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for relative in {**self.candidate.turn.CONTENT_PINS, **self.candidate.CONTENT_PINS}:
                path = root / relative
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes((self.root / relative).read_bytes())
            PublicSourceCandidate(root)
            for relative in self.candidate.CONTENT_PINS:
                path = root / relative
                original = path.read_bytes()
                path.write_bytes(original + b"unreviewed")
                with self.subTest(relative=relative), self.assertRaises(ValueError):
                    PublicSourceCandidate(root)
                path.write_bytes(original)


if __name__ == "__main__":
    unittest.main()
