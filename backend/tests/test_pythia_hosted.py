import base64
import json
import os
import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import patch

import httpx
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.serialization import Encoding, NoEncryption, PrivateFormat
from fastapi.testclient import TestClient

from backend.app import main, pythia_hosted as hosted, pythia_talk as talk, storage
from backend.app.models import ProjectCreate
from backend.app.platform import LOCAL_ACTOR


KEY = Ed25519PrivateKey.generate()
PEM = KEY.private_bytes(Encoding.PEM, PrivateFormat.PKCS8, NoEncryption()).decode()
HOSTED_ENV = {
    "CHIMERA_PYTHIA_BASE_URL": "http://127.0.0.1:8001",
    "CHIMERA_PYTHIA_SERVICE_TOKEN": "s" * 40,
    "CHIMERA_PYTHIA_SIGNING_KEY": PEM,
    "CHIMERA_PYTHIA_KEY_ID": "chimera-key-1",
    "CHIMERA_PYTHIA_TENANT_ID": "darkrogue",
    "CHIMERA_PYTHIA_CALLBACK_TOKEN": "c" * 40,
}
ADVICE = {"kind": "answer", "content": "Hosted advisory answer.", "rationale": "Fictional test.",
          "limits": [], "citations": [], "producer_id": "live-hosted-chimera-text-v1",
          "stopping_boundary": "advisory-only"}


def decode_part(part):
    return json.loads(base64.urlsafe_b64decode(part + "=" * (-len(part) % 4)))


class CanonicalSemanticsTests(unittest.TestCase):
    def test_canonical_bytes_sorts_keys_and_restricts_types(self):
        self.assertEqual(hosted.canonical_bytes({"b": 1, "a": True, "c": None}), b'{"a":true,"b":1,"c":null}')
        self.assertEqual(hosted.canonical_bytes(["x", {"k": "\u00fc"}]), '["x",{"k":"ü"}]'.encode("utf-8"))
        for invalid in (1.5, {"n": float("nan")}, {1: "numeric key"}, 2 ** 54):
            with self.subTest(invalid=invalid), self.assertRaises(ValueError):
                hosted.canonical_bytes(invalid)

    def test_request_digest_is_domain_separated(self):
        request = {"context": {"messages": [], "source_snapshots": []}, "message": "Q"}
        self.assertNotEqual(hosted.request_digest(request), hosted.digest(request))
        self.assertEqual(len(hosted.request_digest(request)), 64)


class ConfigurationTests(unittest.TestCase):
    def test_complete_configuration_is_required_and_fails_closed(self):
        with patch.dict(os.environ, {}, clear=True):
            self.assertFalse(hosted.active())
            with self.assertRaisesRegex(hosted.HostedError, "CHIMERA_PYTHIA_SERVICE_TOKEN"):
                hosted.configuration()
        with patch.dict(os.environ, {**HOSTED_ENV, "CHIMERA_PYTHIA_BASE_URL": ""}, clear=True):
            self.assertTrue(hosted.active())
            with self.assertRaisesRegex(hosted.HostedError, "CHIMERA_PYTHIA_BASE_URL"):
                hosted.configuration()

    def test_rejects_weak_or_shared_tokens_bad_origins_and_non_ed25519_keys(self):
        for changed, pattern in (({"CHIMERA_PYTHIA_SERVICE_TOKEN": "short"}, "32 characters"),
                                 ({"CHIMERA_PYTHIA_CALLBACK_TOKEN": "s" * 40}, "Distinct"),
                                 ({"CHIMERA_PYTHIA_BASE_URL": "http://pythia.example.test"}, "HTTPS"),
                                 ({"CHIMERA_PYTHIA_BASE_URL": "https://example.test/path"}, "HTTPS"),
                                 ({"CHIMERA_PYTHIA_SIGNING_KEY": "not a key"}, "Ed25519"),
                                 ({"CHIMERA_PYTHIA_TENANT_ID": "bad tenant!"}, "identifiers")):
            with self.subTest(changed=changed), patch.dict(os.environ, {**HOSTED_ENV, **changed}, clear=True):
                with self.assertRaisesRegex(hosted.HostedError, pattern):
                    hosted.configuration()

    def test_accepts_exact_https_origin(self):
        with patch.dict(os.environ, {**HOSTED_ENV, "CHIMERA_PYTHIA_BASE_URL": "https://pythia.darkrogue.io/"}, clear=True):
            self.assertEqual(hosted.configuration().base_url, "https://pythia.darkrogue.io")


class ConsultTransportTests(unittest.TestCase):
    def setUp(self):
        self.enterContext(patch.dict(os.environ, HOSTED_ENV, clear=True))
        self.enterContext(patch.object(hosted, "POLL_SECONDS", 0.01))
        self.config = hosted.configuration()
        self.scope = {"tenant_id": "darkrogue", "consumer_id": "chimera", "actor_id": "user-1",
                      "session_id": "session-1", "policy_revision": hosted.policy_revision({"author"})}
        self.requests = []
        self.status_sequence = ["completed"]

    def transport(self, handler):
        real = httpx.Client
        return patch.object(hosted.httpx, "Client",
                            side_effect=lambda **kw: real(transport=httpx.MockTransport(handler), **kw))

    def operation(self, body, status, operation_id="op-1", result=None):
        return {"schema_version": "1.0", "operation_id": operation_id, "scope": body["scope"],
                "message_id": body["message_id"], "request_sha256": hosted.request_digest(body),
                "context_sha256": body["context_sha256"],
                "context_revision": body["expected_context_revision"] + 1, "status": status,
                "answer_revision": 1 if status == "completed" else None, "result": result,
                "error_code": None}

    def engine(self, request):
        self.requests.append(request)
        if request.method == "POST" and request.url.path == "/conversation/turns":
            self.submitted = json.loads(request.content)
            return httpx.Response(202, json=self.operation(self.submitted, "accepted"))
        if request.url.path.endswith("/cancel"):
            return httpx.Response(200, json=self.operation(self.submitted, "cancelled", "op-1"))
        status = self.status_sequence.pop(0)
        result = dict(ADVICE) if status == "completed" else None
        return httpx.Response(200, json=self.operation(self.submitted, status, "op-1", result))

    def consult(self, **overrides):
        values = {"message_id": "m-current", "idempotency_key": "k" * 32, "revision": 0,
                  "messages": [], "question": "Fictional question?", **overrides}
        return hosted.consult(self.config, self.scope, **values)

    def test_submit_poll_and_exact_thread_continuation(self):
        with self.transport(self.engine):
            outcome = self.consult()
        self.assertEqual(outcome["advice"], ADVICE)
        self.assertIsNone(outcome["error"])
        self.assertEqual(outcome["revision"], 1)
        self.assertEqual(outcome["appended"], [
            {"message_id": "m-current", "role": "user", "content": "Fictional question?"},
            {"message_id": "op-1", "role": "assistant", "content": ADVICE["content"]}])
        body = self.submitted
        self.assertEqual(body["schema_version"], "1.0")
        self.assertEqual(body["requested_outputs"], [])
        self.assertEqual(body["context"], {"messages": [], "source_snapshots": []})
        self.assertEqual(body["context_sha256"], hosted.digest(body["context"]))
        submit = self.requests[0]
        self.assertEqual(submit.headers["Authorization"], "Bearer " + "s" * 40)
        header, claims, signature = submit.headers["X-Pythia-Conversation-Access"].split(".")
        KEY.public_key().verify(base64.urlsafe_b64decode(signature + "=" * (-len(signature) % 4)),
                                f"{header}.{claims}".encode("ascii"))
        self.assertEqual(decode_part(header), {"alg": "EdDSA", "kid": "chimera-key-1", "typ": "JWT"})
        claims = decode_part(claims)
        self.assertEqual(set(claims), {"iss", "aud", "sub", "iat", "exp", "jti", "scope", "action",
                                       "request_sha256", "operation_id", "source_sha256"})
        self.assertEqual((claims["iss"], claims["aud"], claims["sub"], claims["action"]),
                         ("chimera", "pythia-conversation", "user-1", "turn:submit"))
        self.assertEqual(claims["scope"], self.scope)
        self.assertEqual(claims["request_sha256"], hosted.request_digest(body))
        self.assertIsNone(claims["operation_id"])
        self.assertLessEqual(claims["exp"] - claims["iat"], 300)
        read = decode_part(self.requests[-1].headers["X-Pythia-Conversation-Access"].split(".")[1])
        self.assertEqual((read["action"], read["operation_id"], read["request_sha256"]),
                         ("operation:read", "op-1", None))

    def test_failed_turn_still_advances_the_durable_thread(self):
        self.status_sequence = ["running", "failed"]
        with self.transport(self.engine):
            outcome = self.consult()
        self.assertIsNone(outcome["advice"])
        self.assertIn("Retry explicitly", outcome["error"])
        self.assertEqual(outcome["revision"], 1)
        self.assertEqual([m["role"] for m in outcome["appended"]], ["user"])

    def test_timeout_cancels_before_giving_up(self):
        with self.transport(self.engine):
            outcome = self.consult(deadline_seconds=0)
        self.assertIsNone(outcome["advice"])
        self.assertIn("cancelled", outcome["error"])
        self.assertEqual(outcome["revision"], 1)

    def test_pre_acceptance_failures_raise_without_thread_changes(self):
        for status_code, expected in ((409, 409), (429, 429), (403, 403), (500, 503)):
            with self.subTest(status_code=status_code):
                with self.transport(lambda request: httpx.Response(status_code, json={"error": {}})):
                    with self.assertRaises(hosted.HostedError) as raised:
                        self.consult()
                self.assertEqual(raised.exception.status, expected)

    def test_mismatched_engine_responses_are_rejected(self):
        def tampered(request):
            body = json.loads(request.content)
            operation = self.operation(body, "accepted")
            operation["request_sha256"] = "0" * 64
            return httpx.Response(202, json=operation)
        with self.transport(tampered):
            with self.assertRaisesRegex(hosted.HostedError, "does not match"):
                self.consult()


class TurnAccessTests(unittest.TestCase):
    def claims(self, **scope_overrides):
        scope = {"tenant_id": "darkrogue", "consumer_id": "chimera", "actor_id": "user-1",
                 "session_id": "session-1", "policy_revision": hosted.policy_revision({"author"}),
                 **scope_overrides}
        return {"iss": "chimera", "scope": scope, "action": "turn:submit"}

    def test_entitled_active_account_with_current_policy_is_allowed(self):
        with patch.dict(os.environ, HOSTED_ENV, clear=True), \
                patch.object(hosted, "account_roles", return_value={"author"}):
            self.assertTrue(hosted.turn_access_allowed(self.claims()))

    def test_denies_unknown_disabled_unentitled_or_stale_scopes(self):
        cases = (
            ({"author"}, self.claims(tenant_id="other-tenant")),
            ({"author"}, self.claims(consumer_id="manteion")),
            ({"author"}, self.claims(policy_revision=hosted.policy_revision({"administrator"}))),
            (None, self.claims()),
            ({"reviewer"}, self.claims()),
            ({"author"}, "not an object"),
            ({"author"}, {"scope": {"tenant_id": "darkrogue"}}),
        )
        for roles, claims in cases:
            with self.subTest(roles=roles, claims=claims), \
                    patch.dict(os.environ, HOSTED_ENV, clear=True), \
                    patch.object(hosted, "account_roles", return_value=roles):
                self.assertFalse(hosted.turn_access_allowed(claims))

    def test_unconfigured_installation_denies(self):
        with patch.dict(os.environ, {}, clear=True):
            self.assertFalse(hosted.turn_access_allowed(self.claims()))


class TurnAccessEndpointTests(unittest.TestCase):
    def setUp(self):
        self.root = Path(self.enterContext(tempfile.TemporaryDirectory()))
        self.enterContext(patch.multiple(storage, ROOT=self.root, PROJECTS=self.root / "projects"))
        self.enterContext(patch.object(main, "ROOT", self.root))
        self.client = self.enterContext(TestClient(main.app))
        self.url = "/api/internal/pythia/turn-access"
        self.body = {"iss": "chimera", "scope": {"tenant_id": "darkrogue", "consumer_id": "chimera",
                     "actor_id": "user-1", "session_id": "session-1",
                     "policy_revision": hosted.policy_revision({"author"})}}

    def test_requires_configuration_bearer_and_json(self):
        with patch.dict(os.environ, {}, clear=True):
            self.assertEqual(self.client.post(self.url, json=self.body).status_code, 503)
        with patch.dict(os.environ, HOSTED_ENV, clear=True):
            self.assertEqual(self.client.post(self.url, json=self.body).status_code, 401)
            headers = {"Authorization": "Bearer " + "c" * 40}
            self.assertEqual(self.client.post(self.url, content=b"x", headers={
                **headers, "Content-Type": "text/plain"}).status_code, 415)
            self.assertEqual(self.client.post(self.url, content=b'{"a":1,"a":2}', headers={
                **headers, "Content-Type": "application/json"}).status_code, 400)
            wrong = {"Authorization": "Bearer " + "w" * 40}
            self.assertEqual(self.client.post(self.url, json=self.body, headers=wrong).status_code, 401)

    def test_allows_and_denies_from_current_account_state(self):
        headers = {"Authorization": "Bearer " + "c" * 40}
        with patch.dict(os.environ, HOSTED_ENV, clear=True):
            with patch.object(hosted, "account_roles", return_value={"author"}):
                allowed = self.client.post(self.url, json=self.body, headers=headers)
                self.assertEqual((allowed.status_code, allowed.json()), (200, {"allowed": True}))
                self.assertEqual(allowed.headers["Cache-Control"], "no-store")
            with patch.object(hosted, "account_roles", return_value=None):
                denied = self.client.post(self.url, json=self.body, headers=headers)
                self.assertEqual((denied.status_code, denied.json()), (200, {"allowed": False}))


class HostedTalkFlowTests(unittest.TestCase):
    def setUp(self):
        self.root = Path(self.enterContext(tempfile.TemporaryDirectory()))
        self.enterContext(patch.multiple(storage, ROOT=self.root, PROJECTS=self.root / "projects"))
        self.enterContext(patch.object(main, "ROOT", self.root))
        self.enterContext(patch.dict(os.environ, HOSTED_ENV, clear=True))
        self.enterContext(patch.object(hosted, "account_roles", return_value={"author"}))
        self.project = storage.create_project(ProjectCreate(title="Hosted course"))

    def settle(self):
        deadline = time.monotonic() + 5
        while time.monotonic() < deadline:
            state = talk.get_conversation(self.project.id, LOCAL_ACTOR)
            if state["turns"] and state["turns"][-1]["status"] != "running":
                return state
            time.sleep(.01)
        self.fail("Hosted consultation did not settle")

    def send(self, message, request_id):
        session = talk.get_conversation(self.project.id, LOCAL_ACTOR)["sessionId"]
        data = talk.TalkRequest(message=message, requestId=request_id, sessionId=session)
        return talk.submit(self.project.id, LOCAL_ACTOR, data, lambda: None)

    def test_submit_consults_hosted_engine_and_continues_exact_thread(self):
        def outcome(config, scope, *, message_id, idempotency_key, revision, messages, question, **_):
            self.consulted = {"scope": scope, "revision": revision, "messages": list(messages),
                              "question": question, "idempotency_key": idempotency_key}
            return {"advice": dict(ADVICE), "error": None, "revision": revision + 1,
                    "appended": [{"message_id": message_id, "role": "user", "content": question},
                                 {"message_id": "op-1", "role": "assistant", "content": ADVICE["content"]}]}
        with patch.object(hosted, "consult", side_effect=outcome):
            self.send("First hosted question", "request-first")
            state = self.settle()
            self.assertEqual(state["turns"][0]["result"], ADVICE)
            self.assertNotIn("hosted", state["turns"][0])
            self.assertEqual(self.consulted["revision"], 0)
            self.assertEqual(self.consulted["messages"], [])
            self.assertEqual(self.consulted["scope"]["consumer_id"], "chimera")
            self.assertEqual(self.consulted["scope"]["actor_id"], LOCAL_ACTOR.actorId)
            self.assertEqual(self.consulted["scope"]["policy_revision"], hosted.policy_revision({"author"}))
            self.send("Second hosted question", "request-second")
            self.settle()
            self.assertEqual(self.consulted["revision"], 1)
            self.assertEqual([m["role"] for m in self.consulted["messages"]], ["user", "assistant"])
            self.assertTrue(self.consulted["messages"][0]["content"].endswith("First hosted question"))

    def test_failed_outcome_is_excluded_from_advice_but_advances_the_wire_thread(self):
        def failing(config, scope, *, message_id, revision, question, **_):
            return {"advice": None, "error": "Pythia could not complete this consultation. Retry explicitly.",
                    "revision": revision + 1,
                    "appended": [{"message_id": message_id, "role": "user", "content": question}]}
        with patch.object(hosted, "consult", side_effect=failing):
            self.send("Failing question", "request-first")
            state = self.settle()
        self.assertEqual(state["turns"][0]["status"], "failed")
        def succeeding(config, scope, *, message_id, revision, messages, question, **_):
            self.followup = {"revision": revision, "messages": list(messages)}
            return {"advice": dict(ADVICE), "error": None, "revision": revision + 1,
                    "appended": [{"message_id": message_id, "role": "user", "content": question},
                                 {"message_id": "op-2", "role": "assistant", "content": ADVICE["content"]}]}
        with patch.object(hosted, "consult", side_effect=succeeding):
            self.send("Follow-up question", "request-second")
            self.settle()
        self.assertEqual(self.followup["revision"], 1)
        self.assertEqual([m["role"] for m in self.followup["messages"]], ["user"])

    def test_pre_acceptance_errors_do_not_advance_the_thread(self):
        with patch.object(hosted, "consult", side_effect=hosted.HostedError("Engine unavailable", 503)):
            self.send("Unreachable question", "request-first")
            state = self.settle()
        self.assertEqual(state["turns"][0]["status"], "failed")
        with patch.object(hosted, "consult") as consult:
            consult.return_value = {"advice": dict(ADVICE), "error": None, "revision": 1,
                                    "appended": [{"message_id": "m", "role": "user", "content": "Q"}]}
            self.send("Retry question", "request-second")
            self.settle()
            self.assertEqual(consult.call_args.kwargs["revision"], 0)

    def test_reset_starts_a_fresh_hosted_session_and_thread(self):
        def outcome(config, scope, *, message_id, revision, question, **_):
            self.scope = scope
            return {"advice": dict(ADVICE), "error": None, "revision": revision + 1,
                    "appended": [{"message_id": message_id, "role": "user", "content": question},
                                 {"message_id": "op-1", "role": "assistant", "content": ADVICE["content"]}]}
        with patch.object(hosted, "consult", side_effect=outcome):
            self.send("Before reset", "request-first")
            self.settle()
            first_session = self.scope["session_id"]
            talk.reset_conversation(self.project.id, LOCAL_ACTOR)
            self.send("After reset", "request-second")
            self.settle()
        self.assertNotEqual(self.scope["session_id"], first_session)
        state = json.loads(talk.state_path(self.project.id, LOCAL_ACTOR).read_text(encoding="utf-8"))
        self.assertEqual(state["hostedThread"]["revision"], 1)

    def test_hosted_context_allowance_is_enforced(self):
        path = talk.state_path(self.project.id, LOCAL_ACTOR)
        state = json.loads(path.read_text(encoding="utf-8")) if path.exists() else None
        session = talk.get_conversation(self.project.id, LOCAL_ACTOR)["sessionId"]
        talk.write_state(path, {"sessionId": session, "turns": [],
            "hostedThread": {"revision": 1, "messages": [
                {"message_id": "m-big", "role": "user", "content": "x" * hosted.HOSTED_CONTEXT_CHARS}]}})
        data = talk.TalkRequest(message="One more question", requestId="request-big", sessionId=session)
        with self.assertRaisesRegex(talk.TalkError, "24,000"):
            talk.submit(self.project.id, LOCAL_ACTOR, data, lambda: None)

    def test_unentitled_account_cannot_submit(self):
        with patch.object(hosted, "account_roles", return_value={"reviewer"}):
            with self.assertRaisesRegex(talk.TalkError, "instructional-designer"):
                self.send("Not allowed", "request-first")

    def test_capabilities_and_desktop_only_actions(self):
        capability_payload = {"capabilities": {"text": True}}
        def engine(request):
            self.assertEqual(request.headers["Authorization"], "Bearer " + "s" * 40)
            return httpx.Response(200, json=capability_payload)
        real = httpx.Client
        with patch.object(hosted.httpx, "Client",
                          side_effect=lambda **kw: real(transport=httpx.MockTransport(engine), **kw)):
            capabilities = talk.local_mcp()
        self.assertEqual(capabilities["mode"], "hosted-text")
        self.assertTrue(capabilities["consultation"])
        self.assertFalse(capabilities["approval_authority"])
        with self.assertRaisesRegex(talk.TalkError, "desktop"):
            talk.local_mcp(video_request={"scene": {}})

    def test_status_reports_hosted_configuration(self):
        state = talk.get_conversation(self.project.id, LOCAL_ACTOR)
        self.assertTrue(state["configured"])
        self.assertIn("hosted Pythia engine", state["message"])
        with patch.dict(os.environ, {"CHIMERA_PYTHIA_SIGNING_KEY": ""}):
            broken = talk.get_conversation(self.project.id, LOCAL_ACTOR)
        self.assertFalse(broken["configured"])
        self.assertIn("CHIMERA_PYTHIA_SIGNING_KEY", broken["message"])


class TeamDeploymentAccessTests(unittest.TestCase):
    def setUp(self):
        self.root = Path(self.enterContext(tempfile.TemporaryDirectory()))
        self.enterContext(patch.multiple(storage, ROOT=self.root, PROJECTS=self.root / "projects"))
        self.enterContext(patch.object(main, "ROOT", self.root))
        self.project = storage.create_project(ProjectCreate(title="Team course"))

    def test_team_deployment_requires_a_hosted_engine(self):
        policy = main.installation_policy(main.LocalIdentityDirectory(self.root))
        team = policy.model_copy(update={"deploymentMode": "team"})
        actor = LOCAL_ACTOR.model_copy(update={"deploymentMode": "team"})
        with patch.object(main, "installation_policy", return_value=team):
            with patch.dict(os.environ, {}, clear=True):
                with self.assertRaises(main.HTTPException) as denied:
                    main._local_pythia_access(self.project.id, actor)
                self.assertEqual(denied.exception.status_code, 403)
            with patch.dict(os.environ, HOSTED_ENV, clear=True), \
                    patch.object(main, "_require_action") as require:
                main._local_pythia_access(self.project.id, actor)
                self.assertEqual(require.call_count, 2)


if __name__ == "__main__":
    unittest.main()
