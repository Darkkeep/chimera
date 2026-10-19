import copy
from dataclasses import replace
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import Mock

import httpx

from backend.app.conversation_boundary import AuthoringBinding, SourceIdentity
from backend.app.conversation_client import (
    ConversationCandidateClient, ConversationClientError, PublicConversationContract,
)


@unittest.skipUnless(os.environ.get("CHIMERA_CONVERSATION_CONTRACTS_ROOT"),
                     "Explicit unreleased conversation candidate path required")
class ConversationClientTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.root = Path(os.environ["CHIMERA_CONVERSATION_CONTRACTS_ROOT"])
        cls.contract = PublicConversationContract(cls.root)

    def setUp(self):
        self.request = json.loads((self.root / "examples/conversation-turn-request.valid.json")
                                  .read_text(encoding="utf-8"))
        self.operation = json.loads((self.root / "examples/conversation-operation.valid.json")
                                    .read_text(encoding="utf-8"))
        self.request["scope"]["consumer_id"] = "chimera"
        self.operation["scope"] = copy.deepcopy(self.request["scope"])
        self.operation["request_sha256"] = self.contract.semantics.request_digest(self.request)
        scope = self.request["scope"]
        self.binding = AuthoringBinding(
            scope["tenant_id"], scope["actor_id"], scope["session_id"],
            "dispatch-demo", "night-handoff", "scene-3",
            tuple(SourceIdentity(s["source_id"], s["version"], s["content_sha256"])
                  for s in self.request["context"]["source_snapshots"]))
        self.issuer = Mock(return_value="synthetic-access-jwt")
        self.policy = Mock(return_value=True)
        self.current = Mock(return_value=self.binding)
        self.calls = []

    def make_client(self, handler=None, **changes):
        def default_handler(request):
            self.calls.append(request)
            return httpx.Response(202 if request.url.path.endswith("/turns") else 200,
                                  json=self.operation)
        values = dict(base_url="https://synthetic.invalid", service_bearer="synthetic-service-token",
                      contract=self.contract, binding=self.binding, authorize=self.policy,
                      current_binding=self.current, current_policy_revision=lambda: "policy-1",
                      issue_access=self.issuer,
                      transport=httpx.MockTransport(handler or default_handler))
        values.update(changes)
        return ConversationCandidateClient(**values)

    def test_submit_read_cancel_use_public_routes_and_action_bound_headers(self):
        client = self.make_client()
        for run, action, method, path in (
            (lambda: client.submit(self.request), "turn:submit", "POST", "/conversation/turns"),
            (lambda: client.read(self.request, "operation-1"), "operation:read", "GET",
             "/conversation/operations/operation-1"),
            (lambda: client.cancel(self.request, "operation-1"), "operation:cancel", "POST",
             "/conversation/operations/operation-1/cancel"),
        ):
            with self.subTest(action=action):
                self.assertEqual(run(), self.operation)
                wire = self.calls[-1]
                self.assertEqual((wire.method, wire.url.path), (method, path))
                self.assertEqual(wire.headers["Authorization"], "Bearer synthetic-service-token")
                self.assertEqual(wire.headers["X-Pythia-Conversation-Access"], "synthetic-access-jwt")
                args = self.issuer.call_args.args
                self.assertEqual(args[0], action)
                self.assertEqual(args[1], self.request["scope"])
                self.assertEqual(args[2], self.operation["request_sha256"] if action == "turn:submit" else None)
                self.assertEqual(args[3], None if action == "turn:submit" else "operation-1")
                self.assertEqual(args[4], [self.binding.sources[0].sha256])
                self.assertEqual(wire.content, self.contract.semantics.canonical_bytes(self.request)
                                 if action == "turn:submit" else b"")
                self.assertNotIn(b"synthetic-access-jwt", wire.content)
        self.assertEqual(self.current.call_count, 6)

    def test_all_public_statuses_remain_explicit(self):
        for status in ("accepted", "running", "failed", "cancelled", "interrupted"):
            with self.subTest(status=status):
                self.operation.update(status=status, result=None, answer_revision=None,
                                      error_code="unavailable" if status in {"failed", "interrupted"} else None)
                result = self.make_client().read(self.request, "operation-1")
                self.assertEqual(result["status"], status)
                self.assertIsNone(result["result"])
                self.assertEqual(result['context_revision'], self.request['expected_context_revision'] + 1)
                self.assertIsNone(result['answer_revision'])

    def test_explicit_replay_after_response_loss_preserves_intent_and_reauthorizes(self):
        self.operation.update(status='cancelled', result=None, answer_revision=None, error_code=None)
        wire_bodies = []

        def lose_first_response(request):
            wire_bodies.append(request.content)
            if len(wire_bodies) == 1:
                raise httpx.ReadError('Synthetic response lost after acceptance')
            return httpx.Response(202, json=self.operation)

        original = copy.deepcopy(self.request)
        client = self.make_client(lose_first_response)
        with self.assertRaises(ConversationClientError):
            client.submit(self.request)
        self.assertEqual(len(wire_bodies), 1)
        accepted = client.submit(self.request)
        self.assertEqual(wire_bodies[0], wire_bodies[1])
        self.assertEqual(self.request, original)
        self.assertEqual(accepted['context_revision'], original['expected_context_revision'] + 1)
        self.assertEqual(accepted['status'], 'cancelled')
        self.assertEqual(self.issuer.call_count, 2)
        self.assertGreaterEqual(self.current.call_count, 3)

    def test_explicit_replay_after_uncertainty_cannot_bypass_current_access(self):
        attempts = []

        def lose_response(request):
            attempts.append(request.content)
            raise httpx.ReadError('Synthetic uncertain acceptance')

        client = self.make_client(lose_response)
        with self.assertRaises(ConversationClientError):
            client.submit(self.request)
        self.policy.return_value = False
        with self.assertRaises(PermissionError):
            client.submit(self.request)
        self.assertEqual(len(attempts), 1)
        self.assertEqual(self.issuer.call_count, 1)

    def test_schema_or_semantic_failure_never_returns_advice(self):
        baseline = copy.deepcopy(self.operation)
        for field, value in (("scope", {**baseline["scope"], "tenant_id": "foreign"}),
                             ("context_revision", 9), ("request_sha256", "0" * 64),
                             ("result", {**baseline["result"], "content": "unbound changed answer"}),
                             ("status", "cancelled")):
            self.operation = {**copy.deepcopy(baseline), field: value}
            with self.subTest(field=field), self.assertRaises(ConversationClientError):
                self.make_client().read(self.request, "operation-1")

    def test_foreign_operation_id_is_rejected_even_when_scope_and_hash_match(self):
        self.operation["operation_id"] = "another-operation"
        with self.assertRaises(ConversationClientError):
            self.make_client().read(self.request, "operation-1")

    def test_rehashed_foreign_extraction_and_coverage_fail(self):
        for field, value in (("extraction_sha256", "c" * 64), ("span", {"start": 0, "end": 99})):
            operation = copy.deepcopy(self.operation)
            operation["result"]["citations"][0][field] = value
            operation["result"]["answer_sha256"] = self.contract.semantics.digest(
                {k: v for k, v in operation["result"].items() if k != "answer_sha256"})
            with self.subTest(field=field), self.assertRaises(ConversationClientError):
                self.make_client(lambda _: httpx.Response(200, json=operation)).read(self.request, "operation-1")

    def test_source_backed_correction_retains_exact_identity_and_history(self):
        client = self.make_client()
        first = client.submit(self.request)
        correction = copy.deepcopy(self.request)
        correction.update(message_id='message-2', idempotency_key='synthetic-correction-key', expected_context_revision=1)
        correction['context']['messages'] = [
            {'message_id': self.request['message_id'], 'role': 'user', 'content': self.request['message']},
            {'message_id': first['operation_id'], 'role': 'assistant', 'content': first['result']['content']}]
        correction['context_sha256'] = self.contract.semantics.digest(correction['context'])
        self.operation.update(operation_id='operation-2', message_id='message-2', context_revision=2,
            answer_revision=2, request_sha256=self.contract.semantics.request_digest(correction),
            context_sha256=correction['context_sha256'])
        result = client.submit(correction)
        sent = json.loads(self.calls[-1].content)
        self.assertEqual(sent['context'], correction['context'])
        self.assertEqual(sent['context']['source_snapshots'], self.request['context']['source_snapshots'])
        self.assertEqual(result['result']['citations'], first['result']['citations'])
        self.assertEqual(self.issuer.call_args.args[4], [self.binding.sources[0].sha256])
        changed = copy.deepcopy(correction)
        changed['context']['source_snapshots'] = []
        changed['context_sha256'] = self.contract.semantics.digest(changed['context'])
        attempts = len(self.calls)
        with self.assertRaises(ValueError):
            client.submit(changed)
        self.assertEqual(len(self.calls), attempts)

    def test_http_errors_are_sanitized_and_never_retried(self):
        for status in (200, 301, 401, 403, 404, 409, 503):
            handler = Mock(return_value=httpx.Response(status, text="private source secret",
                                                       headers={"Location": "https://foreign.invalid"}))
            with self.subTest(status=status), self.assertRaises(ConversationClientError) as error:
                self.make_client(handler).submit(self.request)
            self.assertEqual(error.exception.status_code, status)
            self.assertNotIn("private", str(error.exception))
            self.assertEqual(handler.call_count, 1)

    def test_network_error_is_sanitized_with_no_retry(self):
        handler = Mock(side_effect=httpx.ConnectError("synthetic-service-token private details"))
        with self.assertRaises(ConversationClientError) as error:
            self.make_client(handler).submit(self.request)
        self.assertNotIn("synthetic-service-token", str(error.exception))
        self.assertEqual(handler.call_count, 1)

    def test_response_limit_and_unsafe_json_fail_closed(self):
        for raw in (b'{"scope":1,"scope":2}', b'NaN', b'{"x":1.0}', b'not json'):
            with self.subTest(raw=raw), self.assertRaises(ConversationClientError):
                self.make_client(lambda _: httpx.Response(202, content=raw)).submit(self.request)
        client = self.make_client()
        client.MAX_RESPONSE_BYTES = 10
        with self.assertRaises(ConversationClientError):
            client.submit(self.request)

    def test_invalid_or_oversized_request_never_issues_token_or_calls_http(self):
        client = self.make_client()
        self.request["context_sha256"] = "0" * 64
        with self.assertRaises(ConversationClientError):
            client.submit(self.request)
        self.request["context_sha256"] = self.operation["context_sha256"]
        client.MAX_REQUEST_BYTES = 10
        with self.assertRaises(ConversationClientError):
            client.submit(self.request)
        self.issuer.assert_not_called()
        self.assertEqual(self.calls, [])

    def test_revoked_access_and_stale_scene_prevent_http(self):
        self.policy.return_value = False
        with self.assertRaises(PermissionError):
            self.make_client().submit(self.request)
        self.policy.return_value = True
        self.current.return_value = replace(self.binding, scene_revision="scene-4")
        with self.assertRaises(ValueError):
            self.make_client().submit(self.request)
        self.issuer.assert_not_called()
        self.assertEqual(self.calls, [])

    def test_access_scene_and_policy_are_rechecked_after_response(self):
        def revoke(_):
            self.policy.return_value = False
            return httpx.Response(202, json=self.operation)
        with self.assertRaises(PermissionError):
            self.make_client(revoke).submit(self.request)
        self.policy.return_value = True
        self.current.side_effect = [self.binding, replace(self.binding, scene_revision="scene-4")]
        with self.assertRaises(ValueError):
            self.make_client().submit(self.request)
        self.current.side_effect = None
        self.current.return_value = self.binding
        policy_revision = Mock(side_effect=["policy-1", "policy-2"])
        with self.assertRaises(ValueError):
            self.make_client(current_policy_revision=policy_revision).submit(self.request)

    def test_invalid_configuration_credentials_and_path_fail_before_http(self):
        for url in ("", "http://example.com", "https://user:pass@example.com", "https://example.com?secret=1"):
            with self.subTest(url=url), self.assertRaises(ValueError):
                self.make_client(base_url=url)
        for bearer in ("", "secret\r\nheader", "token with spaces"):
            with self.subTest(bearer=bearer), self.assertRaises(ValueError):
                self.make_client(service_bearer=bearer)
        with self.assertRaises(ValueError):
            self.make_client().read(self.request, "../another")
        self.issuer.return_value = "bad\r\ntoken"
        with self.assertRaises(ValueError):
            self.make_client().submit(self.request)
        self.assertEqual(self.calls, [])

    def test_issuer_cannot_mutate_the_validated_request(self):
        def issuer(_action, scope, *_args):
            scope["tenant_id"] = "foreign"
            return "synthetic-access-jwt"
        self.make_client(issue_access=issuer).submit(self.request)
        wire = json.loads(self.calls[0].content)
        self.assertEqual(wire["scope"]["tenant_id"], self.binding.tenant_id)

    def test_candidate_pins_allow_crlf_checkout_and_reject_schema_or_code_drift(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for relative in PublicConversationContract.CONTENT_PINS:
                path = root / relative
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes((self.root / relative).read_bytes().replace(b"\r\n", b"\n").replace(b"\n", b"\r\n"))
            PublicConversationContract(root)
            for relative in PublicConversationContract.CONTENT_PINS:
                path = root / relative
                original = path.read_bytes()
                path.write_bytes(original + b"\n# unreviewed change")
                with self.subTest(relative=relative), self.assertRaises(ValueError):
                    PublicConversationContract(root)
                path.write_bytes(original)


if __name__ == "__main__":
    unittest.main()
