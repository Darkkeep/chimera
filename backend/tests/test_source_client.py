import copy
from dataclasses import replace
import json
import os
from pathlib import Path
import unittest
from unittest.mock import Mock

import httpx

from backend.app.conversation_boundary import AuthoringBinding, SourceIdentity
from backend.app.conversation_client import ConversationClientError
from backend.app.source_client import SourceCandidateClient
from backend.app.source_provenance import PublicSourceCandidate


@unittest.skipUnless(os.environ.get("CHIMERA_CONVERSATION_CONTRACTS_ROOT"),
                     "Explicit unreleased source candidate path required")
class SourceClientTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.contract = PublicSourceCandidate(Path(os.environ["CHIMERA_CONVERSATION_CONTRACTS_ROOT"]))

    def setUp(self):
        fixture = json.loads((Path(__file__).parent / "fixtures/conversation-source-consumer-cases.json").read_text())
        self.metadata = fixture["source_metadata"]
        self.raw = fixture["source_utf8"].encode("utf-8")
        scope = self.metadata["scope"]
        self.binding = AuthoringBinding(scope["tenant_id"], scope["actor_id"], scope["session_id"],
            "dispatch-demo", "night-handoff", "scene-3",
            (SourceIdentity(self.metadata["source_id"], self.metadata["version"], self.metadata["content_sha256"]),))
        self.manifest = {**copy.deepcopy(self.metadata), "status": "ready", "error_code": None,
            "snapshot": {**{k: self.metadata[k] for k in ("source_id", "version", "content_sha256", "media_type")},
                         "extraction_sha256": self.metadata["content_sha256"], "status": "ready",
                         "coverage": [{"start": 0, "end": len(fixture["source_utf8"])}]}}
        self.issuer = Mock(return_value="synthetic-source-access")
        self.policy = Mock(return_value=True)
        self.grant = Mock(return_value=True)
        self.current = Mock(return_value=self.binding)
        self.calls = []

    def client(self, handler=None, **changes):
        def default(request):
            self.calls.append(request)
            return httpx.Response(201 if request.method == "PUT" else 200, json=self.manifest)
        args = dict(base_url="https://synthetic.invalid", service_bearer="synthetic-source-bearer",
                    contract=self.contract, binding=self.binding, authorize=self.policy,
                    authorize_action=self.grant, current_binding=self.current,
                    current_policy_revision=lambda: "policy-1", issue_access=self.issuer,
                    transport=httpx.MockTransport(handler or default))
        args.update(changes)
        return SourceCandidateClient(**args)

    def test_raw_put_and_manifest_get_bind_exact_bytes_and_specific_grants(self):
        client = self.client()
        self.assertEqual(client.ingest(self.metadata, self.raw), self.manifest)
        self.assertEqual(client.read_manifest(self.metadata, self.raw), self.manifest)
        put, get = self.calls
        self.assertEqual((put.method, get.method), ("PUT", "GET"))
        self.assertEqual(str(put.url), "https://synthetic.invalid/conversation/sources/synthetic-note/versions/1")
        self.assertEqual(put.content, self.raw)
        self.assertEqual(get.content, b"")
        self.assertEqual(put.headers["Content-Length"], "29")
        self.assertEqual(put.headers["Content-Type"], "text/plain")
        self.assertEqual(put.headers["X-Pythia-Content-SHA256"], self.metadata["content_sha256"])
        self.assertNotIn("X-Pythia-Content-SHA256", get.headers)
        for wire in self.calls:
            self.assertEqual(wire.headers["Authorization"], "Bearer synthetic-source-bearer")
            self.assertEqual(wire.headers["X-Pythia-Conversation-Access"], "synthetic-source-access")
        self.assertEqual(self.issuer.call_args_list[0].args, (
            "source:ingest", self.metadata["scope"], "synthetic-note", "1",
            self.contract.semantics.metadata_digest(self.metadata), [self.metadata["content_sha256"]]))
        self.assertEqual(self.issuer.call_args_list[1].args, (
            "source:read", self.metadata["scope"], "synthetic-note", "1", None,
            [self.metadata["content_sha256"]]))
        self.assertEqual(self.current.call_count, 4)

    def test_exact_replay_200_is_accepted_without_client_retry(self):
        handler = Mock(return_value=httpx.Response(200, json=self.manifest))
        self.assertEqual(self.client(handler).ingest(self.metadata, self.raw), self.manifest)
        self.assertEqual(handler.call_count, 1)

    def test_invalid_actual_bytes_never_issue_token_or_call_http(self):
        for raw in (None, b"", b"other bytes", b"\xff", b"a" * 262145):
            with self.subTest(raw_type=type(raw).__name__), self.assertRaises(ConversationClientError):
                self.client().ingest(self.metadata, raw)
        self.issuer.assert_not_called()
        self.assertEqual(self.calls, [])

    def test_current_action_and_scene_are_checked_before_and_after_http(self):
        self.grant.side_effect = lambda _b, _s, action: action == "source:read"
        with self.assertRaises(PermissionError):
            self.client().ingest(self.metadata, self.raw)
        self.issuer.assert_not_called()
        self.grant.side_effect = None
        self.grant.return_value = True
        self.current.side_effect = [self.binding, replace(self.binding, scene_revision="scene-4")]
        with self.assertRaises(ValueError):
            self.client().ingest(self.metadata, self.raw)
        self.current.side_effect = None
        self.current.return_value = self.binding
        def revoke(_):
            self.grant.return_value = False
            return httpx.Response(200, json=self.manifest)
        with self.assertRaises(PermissionError):
            self.client(revoke).read_manifest(self.metadata, self.raw)

    def test_foreign_or_unreadable_snapshot_never_becomes_readable(self):
        baseline = copy.deepcopy(self.manifest)
        for changes in ({"version": "foreign"}, {"scope": {**self.metadata["scope"], "actor_id": "foreign"}},
                        {"status": "failed", "error_code": "invalid_utf8"}):
            manifest = {**copy.deepcopy(baseline), **changes}
            with self.subTest(changes=changes), self.assertRaises(ConversationClientError):
                self.client(lambda _: httpx.Response(200, json=manifest)).read_manifest(self.metadata, self.raw)
        failed = {**baseline, "status": "failed", "snapshot": None, "error_code": "invalid_utf8"}
        self.assertEqual(self.client(lambda _: httpx.Response(200, json=failed))
                         .read_manifest(self.metadata, self.raw)["status"], "failed")

    def test_source_http_failure_is_redacted_and_never_retried(self):
        for status in (202, 301, 401, 403, 404, 409, 503):
            handler = Mock(return_value=httpx.Response(status, text="private-source-content"))
            with self.subTest(status=status), self.assertRaises(ConversationClientError) as error:
                self.client(handler).ingest(self.metadata, self.raw)
            self.assertEqual(error.exception.status_code, status)
            self.assertNotIn("private-source-content", str(error.exception))
            self.assertEqual(handler.call_count, 1)

    def test_strict_manifest_json_and_response_limit_fail_closed(self):
        for raw in (b'NaN', b'{"scope":1,"scope":2}', b'not-json'):
            with self.subTest(raw=raw), self.assertRaises(ConversationClientError):
                self.client(lambda _: httpx.Response(200, content=raw)).read_manifest(self.metadata, self.raw)
        client = self.client()
        client.MAX_RESPONSE_BYTES = 10
        with self.assertRaises(ConversationClientError):
            client.read_manifest(self.metadata, self.raw)


if __name__ == "__main__":
    unittest.main()
