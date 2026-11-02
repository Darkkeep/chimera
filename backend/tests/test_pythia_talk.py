import copy
import json
import os
import tempfile
import time
import unittest
from pathlib import Path
from threading import Event
from unittest.mock import Mock, patch

from fastapi.testclient import TestClient

from backend.app import main, pythia_talk as talk, storage
from backend.app.models import ProjectCreate, ReferencePassage, SceneCreate, SceneUpdate
from backend.app.platform import LOCAL_ACTOR
from backend.app.ai_connection import Connection


ADVICE = {"kind": "answer", "content": "Investigate the queue before choosing training.", "rationale": "The cause is not yet established.",
          "limits": ["Fictional example."], "citations": [], "producer_id": "live-test-provider", "stopping_boundary": "advisory-only"}


class SavedConnectionBridgeTests(unittest.TestCase):
    def setUp(self):
        self.root = Path(self.enterContext(tempfile.TemporaryDirectory()))
        self.enterContext(patch.object(storage, "ROOT", self.root))
        self.enterContext(patch.object(talk, "checkout", return_value=self.root))
        self.connection = Connection(self.root, "test", "openai", "https://api.openai.com/v1", "gpt-4.1-mini", "gpt-image-1", "tts-1", "private-test-key", 1, 1)
        self.enterContext(patch.object(talk, "resolve_connection", return_value=self.connection))

    def test_saved_credential_is_piped_without_arguments_or_disk_persistence(self):
        process = Mock(returncode=0)
        process.communicate.return_value = (json.dumps({"ok": True, "result": ADVICE}).encode(), b"")
        with patch.object(talk.subprocess, "Popen", return_value=process) as start:
            self.assertEqual(talk.local_mcp("Fictional question"), ADVICE)
        self.assertNotIn(self.connection.api_key, str(start.call_args))
        payload = json.loads(process.communicate.call_args.args[0])
        self.assertEqual(payload["provider"]["PYTHIA_ANALYSIS_API_KEY"], self.connection.api_key)
        self.assertEqual(payload["provider"]["PYTHIA_ANALYSIS_API_URL"], "https://api.openai.com/v1/chat/completions")
        for path in self.root.rglob("*"):
            if path.is_file():
                self.assertNotIn(self.connection.api_key, path.read_text())
        with patch.object(talk, "_run_local_mcp") as bridge, self.assertRaisesRegex(RuntimeError, "daily AI request limit"):
            talk.local_mcp("Another question")
        bridge.assert_not_called()

    def test_discovery_does_not_consume_generation_budget(self):
        with patch.object(talk, "_run_local_mcp", return_value={"consultation": True}):
            talk.local_mcp()
        self.assertFalse((self.root / "identity/ai-usage.json").exists())

    def test_missing_credential_is_actionable_and_does_not_launch(self):
        with patch.object(talk, "resolve_connection", return_value=None), patch.object(talk, "_run_local_mcp") as bridge:
            with self.assertRaisesRegex(talk.TalkError, "Settings > AI connection"):
                talk.local_mcp()
        bridge.assert_not_called()

    def test_existing_plugin_takes_precedence_over_saved_connection(self):
        config = self.root / "plugins/pythia/mcp.json"
        config.parent.mkdir(parents=True)
        config.write_text("{}")
        with patch.object(talk, "resolve_connection") as saved, patch.object(talk, "_run_local_mcp", return_value=ADVICE) as bridge:
            talk.local_mcp("Fictional question")
        saved.assert_not_called()
        self.assertNotIn("provider", bridge.call_args.args[1])

    def test_installation_runtime_preference_and_environment_override(self):
        runtime = self.root / "runtime"
        for relative in (".venv/Scripts/python.exe", "scripts/pythia_chatgpt.py"):
            target = runtime / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            target.touch()
        (self.root / "pythia-runtime.json").write_text(json.dumps({"root": str(runtime)}))
        with patch.dict(os.environ, {}, clear=True):
            self.assertEqual(REAL_CHECKOUT(), runtime.resolve())
        (self.root / "pythia-runtime.json").write_text("invalid json")
        with patch.dict(os.environ, {"CHIMERA_PYTHIA_ROOT": str(runtime)}):
            self.assertEqual(REAL_CHECKOUT(), runtime.resolve())


REAL_CHECKOUT = talk.checkout


class PythiaTalkTests(unittest.TestCase):
    def setUp(self):
        self.root = Path(self.enterContext(tempfile.TemporaryDirectory()))
        self.enterContext(patch.multiple(storage, ROOT=self.root, PROJECTS=self.root / "projects"))
        self.enterContext(patch.object(main, "ROOT", self.root))
        self.enterContext(patch.object(talk, "checkout", return_value=Path("trusted-test-checkout")))
        self.project = storage.create_project(ProjectCreate(title="Private course title"))
        self.project = storage.create_scene(self.project.id, SceneCreate(title="Private scene", extractedText=["Inspect before use."]))
        self.client = self.enterContext(TestClient(main.app))
        self.url = f"/api/projects/{self.project.id}/pythia-conversation"
        self.headers = {"Origin": "http://127.0.0.1:5173"}

    def send(self, message="Should we start with training?", request_id="request-first", **extra):
        session = self.client.get(self.url).json()["sessionId"]
        return self.client.post(self.url, json={"message": message, "requestId": request_id, "sessionId": session, **extra}, headers=self.headers)

    def finished(self):
        deadline = time.monotonic() + 5
        while time.monotonic() < deadline:
            data = self.client.get(self.url).json()
            if data["turns"] and data["turns"][-1]["status"] != "running":
                return data
            time.sleep(.01)
        self.fail("Pythia worker did not settle")

    def test_direct_consultation_followup_reload_and_actor_isolation(self):
        before = storage.read_project(self.project.id).storyboard.model_dump()
        with patch.object(talk, "local_mcp", return_value=copy.deepcopy(ADVICE)) as provider:
            self.assertEqual(self.send().status_code, 202)
            first = self.finished()
            self.assertEqual(first["turns"][0]["result"], ADVICE)
            question, history = provider.call_args.args
            self.assertEqual(question, "Should we start with training?")
            self.assertEqual(history, [])
            self.assertNotIn("Private", question)
            self.assertEqual(self.send("Correction: they already know the process.", "request-second").status_code, 202)
            final = self.finished()
            self.assertEqual([item["role"] for item in provider.call_args.args[1]], ["user", "assistant"])
            self.assertEqual(self.client.get(self.url).json()["turns"], final["turns"])
            self.assertNotIn("wireQuestion", final["turns"][0])
            other = LOCAL_ACTOR.model_copy(update={"actorId": "another-local-actor"})
            self.assertEqual(talk.get_conversation(self.project.id, other)["turns"], [])
        self.assertEqual(storage.read_project(self.project.id).storyboard.model_dump(), before)

    def test_failed_turn_is_redacted_and_excluded_from_followup(self):
        with patch.object(talk, "local_mcp", side_effect=RuntimeError("SECRET provider response")):
            self.assertEqual(self.send().status_code, 202)
            state = self.finished()
            self.assertEqual(state["turns"][0]["status"], "failed")
            self.assertNotIn("SECRET", state["turns"][0]["error"])
        with patch.object(talk, "local_mcp", return_value=copy.deepcopy(ADVICE)) as provider:
            self.send("A new question", "request-next")
            self.finished()
            self.assertEqual(provider.call_args.args[1], [])

    def test_author_direction_is_sent_and_saved_for_followups(self):
        with patch.object(talk, "local_mcp", return_value=copy.deepcopy(ADVICE)) as provider:
            self.send(direction="Use plain language and keep it practical.")
            state = self.finished()
            self.assertIn("Author direction", provider.call_args.args[0])
            self.assertIn("Use plain language", provider.call_args.args[0])
            self.assertEqual(state["authorDirection"], "Use plain language and keep it practical.")
            self.assertEqual(state["turns"][0]["direction"], state["authorDirection"])

    def test_idempotent_replay_does_not_make_another_provider_call(self):
        with patch.object(talk, "local_mcp", return_value=copy.deepcopy(ADVICE)) as provider:
            self.send()
            self.finished()
            self.assertEqual(self.send().status_code, 202)
            self.assertEqual(provider.call_count, 1)
            self.assertEqual(self.send("Changed question").status_code, 409)

    def test_scene_and_sources_are_shared_only_when_selected(self):
        resource = storage.save_reference_resource(self.project.id, "notes.txt", "Source notes", "supporting-document", False, [], b"Evidence text.", "text/plain",
            [ReferencePassage(locator="line:1", text="Evidence text.")], "complete", None)
        with patch.object(talk, "local_mcp", return_value=copy.deepcopy(ADVICE)) as provider:
            self.send(sceneId=self.project.storyboard.scenes[0].id, sourceIds=[resource.id])
            self.finished()
            self.assertIn("Private scene", provider.call_args.args[0])
            self.assertIn("Evidence text.", provider.call_args.args[0])
            self.assertIn("unverified evidence", provider.call_args.args[0])

    def test_scene_change_during_consultation_does_not_return_stale_advice(self):
        started, release = Event(), Event()
        def producer(*_):
            started.set()
            release.wait(3)
            return copy.deepcopy(ADVICE)
        with patch.object(talk, "local_mcp", side_effect=producer):
            self.send(sceneId=self.project.storyboard.scenes[0].id)
            self.assertTrue(started.wait(2))
            storage.update_scene(self.project.id, self.project.storyboard.scenes[0].id, SceneUpdate(title="Changed"), self.project.storyboard.revision)
            release.set()
            state = self.finished()
            self.assertEqual(state["turns"][0]["status"], "failed")
            self.assertIsNone(state["turns"][0]["result"])
            self.assertIn("changed", state["turns"][0]["error"])

    def test_origin_and_shared_deployment_rejected_before_provider_call(self):
        with patch.object(talk, "local_mcp") as provider:
            response = self.client.post(self.url, json={"message": "Question", "requestId": "request-first", "sessionId": "session"})
            self.assertEqual(response.status_code, 403)
            selected = main.installation_policy(main.LocalIdentityDirectory(self.root))
            with patch.object(main, "installation_policy", return_value=selected.model_copy(update={"deploymentMode": "team"})):
                self.assertEqual(self.client.get(self.url).status_code, 403)
            provider.assert_not_called()

    def test_restart_marks_uncertain_turn_interrupted_and_reset_clears_private_history(self):
        path = talk.state_path(self.project.id, LOCAL_ACTOR)
        talk.write_state(path, {"sessionId": "old-session", "turns": [{"id": "old-turn", "question": "Question", "status": "running", "runId": "old-process", "result": None}]})
        state = self.client.get(self.url).json()
        self.assertEqual(state["turns"][0]["status"], "interrupted")
        reset = self.client.post(self.url + "/reset", headers=self.headers)
        self.assertEqual(reset.status_code, 200)
        self.assertEqual(reset.json()["turns"], [])
        self.assertNotEqual(reset.json()["sessionId"], "old-session")

    def test_context_limit_fails_before_provider_call_without_truncation(self):
        path = talk.state_path(self.project.id, LOCAL_ACTOR)
        talk.write_state(path, {"sessionId": "session", "turns": [{"id": "old-turn", "question": "Old", "wireQuestion": "x" * talk.MAX_CONTEXT_CHARS,
            "status": "completed", "result": {**ADVICE, "content": "y" * 9000}}]})
        with patch.object(talk, "local_mcp") as provider:
            response = self.send()
            self.assertEqual(response.status_code, 422)
            self.assertIn("no history was silently dropped", response.json()["detail"])
            provider.assert_not_called()

    def test_outline_scene_count_is_available_without_exposing_private_context(self):
        path = talk.state_path(self.project.id, LOCAL_ACTOR)
        talk.write_state(path, {"sessionId": "session", "turns": [{"id": "outline-turn", "question": "Expand it.", "wireQuestion": "private selected source", "status": "completed",
            "result": {**ADVICE, "content": "1. Introduction\n   - Detail\n2. Practice"}}]})
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["turns"][0]["outlineItemCount"], 2)
        self.assertNotIn("private selected source", response.text)

    def test_multiple_book_sources_and_followup_retain_all_unique_text(self):
        from backend.app.references import extract_reference_passages
        ids, books = [], []
        for index in range(3):
            text = f"BOOK-{index}-START " + ("Fictional source text. " * 12000) + f" BOOK-{index}-END"
            passages, status, error = extract_reference_passages("book.txt", text.encode())
            self.assertEqual(status, "complete", error)
            self.assertEqual("".join(p.text for p in passages), text)
            resource = storage.save_reference_resource(self.project.id, f"book-{index}.txt", f"Book {index}", "supporting-document", False, [], text.encode(), "text/plain", passages, status, error)
            ids.append(resource.id)
            books.append(text)
        with patch.object(talk, "local_mcp", return_value=copy.deepcopy(ADVICE)) as provider:
            self.assertEqual(self.send(sourceIds=ids).status_code, 202)
            self.finished()
            question = provider.call_args.args[0]
            self.assertGreater(len(question), 700000)
            for index in range(3):
                self.assertIn(f"BOOK-{index}-END", question)
            self.assertEqual(self.send("Compare the three books.", "request-followup", sourceIds=ids).status_code, 202)
            self.finished()
            question, history = provider.call_args.args
            combined = "\n".join([*(m["content"] for m in history), question])
            for index in range(3):
                self.assertEqual(combined.count(f"BOOK-{index}-END"), 1)



if __name__ == "__main__":
    unittest.main()
