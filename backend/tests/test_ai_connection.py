import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

from pydantic import SecretStr, ValidationError
from fastapi.testclient import TestClient

from backend.app import ai_connection, enhancement_jobs, main, media_generation, storage
from backend.app.models import ProjectCreate, SceneCreate, EnhancementJobCreate, MediaGenerationJobCreate


class AIConnectionTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.enterContext(patch.dict(os.environ, {}, clear=True))
        self.enterContext(patch.object(storage, "ROOT", self.root))
        self.enterContext(patch.object(storage, "PROJECTS", self.root / "projects"))
        self.enterContext(patch.object(main, "ROOT", self.root))
        self.secrets = {}
        self.backend = Mock()
        self.backend.set_password.side_effect = lambda service, account, secret: self.secrets.__setitem__(account, secret)
        self.backend.get_password.side_effect = lambda service, account: self.secrets.get(account)
        self.backend.delete_password.side_effect = lambda service, account: self.secrets.pop(account, None)
        self.enterContext(patch.object(ai_connection, "_secure_backend", return_value=self.backend))

    def save(self, **kwargs):
        return ai_connection.save_connection(self.root, ai_connection.ConnectionUpdate(expectedRevision=ai_connection.connection_status(self.root)["revision"], apiKey=SecretStr("test-secret-only"), **kwargs))

    def test_key_never_persists_in_metadata_or_status(self):
        status = self.save()
        self.assertTrue(status["configured"])
        self.assertNotIn("test-secret-only", json.dumps(status))
        self.assertNotIn("test-secret-only", (self.root / "identity" / "ai-connection.json").read_text())
        connection = ai_connection.resolve_connection(self.root)
        self.assertEqual(connection.api_key, "test-secret-only")
        self.assertNotIn("test-secret-only", repr(connection))
        updated = self.save(textModel="gpt-4.1")
        self.assertEqual(len(self.secrets), 1)
        with self.assertRaisesRegex(RuntimeError, "changed"):
            ai_connection.resolve_connection(self.root, status["revision"])
        self.assertNotEqual(status["revision"], updated["revision"])

    def test_disconnect_removes_key_and_blocks_environment_fallback(self):
        status = self.save()
        with patch.dict(os.environ, {"CHIMERA_AI_BASE_URL": "https://example.test", "CHIMERA_AI_API_KEY": "environment-key", "CHIMERA_AI_MODEL": "model"}):
            result = ai_connection.disconnect_connection(self.root, status["revision"])
        self.assertFalse(result["configured"])
        self.assertEqual(self.secrets, {})

    def test_arbitrary_provider_urls_and_models_rejected(self):
        for value in ({"baseUrl": "http://127.0.0.1"}, {"provider": "arbitrary"}, {"textModel": "unknown"}):
            with self.assertRaises(ValidationError):
                ai_connection.ConnectionUpdate.model_validate({"expectedRevision": "unconfigured", **value})

    def test_plaintext_or_missing_credential_store_fails_closed(self):
        with patch.object(ai_connection, "_secure_backend", side_effect=RuntimeError("missing")):
            self.assertFalse(ai_connection.connection_status(self.root)["storageAvailable"])
            with self.assertRaisesRegex(RuntimeError, "secure OS"):
                self.save()
        self.assertFalse((self.root / "identity" / "ai-connection.json").exists())

    def test_daily_request_limit_persists(self):
        self.save(maxRequestsPerDay=1)
        connection = ai_connection.resolve_connection(self.root)
        with ai_connection.request_budget(connection):
            pass
        with self.assertRaisesRegex(RuntimeError, "daily"):
            with ai_connection.request_budget(connection):
                pass

    def test_test_connection_does_not_send_course_content(self):
        self.save()
        response = Mock(status=200)
        response.__enter__ = Mock(return_value=response)
        response.__exit__ = Mock(return_value=False)
        with patch.object(ai_connection, "open_provider_request", return_value=response) as transport:
            self.assertTrue(ai_connection.test_connection(self.root)["connected"])
        request = transport.call_args.args[1]
        self.assertEqual(request.full_url, "https://api.openai.com/v1/models")
        self.assertIsNone(request.data)

    def test_stale_save_does_not_replace_credential(self):
        self.save()
        with self.assertRaisesRegex(ValueError, "changed"):
            ai_connection.save_connection(self.root, ai_connection.ConnectionUpdate(expectedRevision="unconfigured", apiKey=SecretStr("replacement")))
        self.assertEqual(list(self.secrets.values()), ["test-secret-only"])

    def test_api_origin_validation_and_safe_audit_events(self):
        with TestClient(main.app) as client:
            status = client.get("/api/ai-connection").json()
            payload = {"expectedRevision": status["revision"], "apiKey": "test-secret-only"}
            for headers in ({}, {"Origin": "https://untrusted.test"}):
                self.assertEqual(client.put("/api/ai-connection", json=payload, headers=headers).status_code, 403)
            saved = client.put("/api/ai-connection", json=payload, headers={"Origin": "http://127.0.0.1:5173"})
            self.assertEqual(saved.status_code, 200)
            self.assertNotIn("test-secret-only", saved.text)
            audit = (self.root / "audit" / "events.jsonl").read_text()
            self.assertIn("ai.connection_saved", audit)
            self.assertNotIn("test-secret-only", audit)
            self.assertEqual(client.put("/api/ai-connection", json=payload, headers={"Origin": "http://127.0.0.1:5173"}).status_code, 409)

    def test_jobs_bind_connection_revision_and_providers_share_settings(self):
        saved = self.save()
        project = storage.create_project(ProjectCreate(title="Bound connection"))
        project = storage.create_scene(project.id, SceneCreate(title="Scene"))
        scene_id = project.storyboard.scenes[0].id
        enhancement = storage.create_enhancement_job(project.id, EnhancementJobCreate(scope="whole-course", goal="Check content"))
        media = storage.create_media_generation_job(project.id, MediaGenerationJobCreate(kind="image", sceneId=scene_id, purpose="Illustration", prompt="Fixture"))
        self.assertEqual(enhancement.aiConnectionRevision, saved["revision"])
        self.assertEqual(media.aiConnectionRevision, saved["revision"])
        self.assertEqual(enhancement_jobs._provider(saved["revision"]).model, "gpt-4.1-mini")
        self.assertEqual(media_generation._provider(saved["revision"]).image_model, "gpt-image-1")
        self.assertTrue(enhancement_jobs.preview_enhancement_submission(project.id, EnhancementJobCreate(scope="whole-course", goal="Check"))["providerConfigured"])
        self.save(textModel="gpt-4.1")
        for factory in (enhancement_jobs._provider, media_generation._provider):
            with self.assertRaisesRegex(RuntimeError, "changed"):
                factory(saved["revision"])
        for path in (self.root / "projects").rglob("*.json"):
            self.assertNotIn("test-secret-only", path.read_text())

    def test_environment_key_is_not_reused_for_a_different_provider(self):
        with patch.dict(os.environ, {"CHIMERA_AI_BASE_URL": "https://other-provider.test/v1", "CHIMERA_AI_API_KEY": "other-secret", "CHIMERA_AI_MODEL": "other-model"}):
            revision = ai_connection.connection_status(self.root)["revision"]
            with self.assertRaisesRegex(ValueError, "OpenAI API key"):
                ai_connection.save_connection(self.root, ai_connection.ConnectionUpdate(expectedRevision=revision))
        self.assertEqual(self.secrets, {})

    def test_concurrent_requests_and_redirects_are_blocked(self):
        self.save()
        connection = ai_connection.resolve_connection(self.root)
        with ai_connection.request_budget(connection):
            with self.assertRaisesRegex(RuntimeError, "busy"):
                with ai_connection.request_budget(connection):
                    pass
        self.assertIsNone(ai_connection.NoRedirect().redirect_request(None, None, 302, "redirect", {}, "http://127.0.0.1"))