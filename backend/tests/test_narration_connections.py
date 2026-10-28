import base64
import io
import json
import os
import tempfile
import unittest
import urllib.error
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import Mock, patch

from fastapi.testclient import TestClient
from google.auth.exceptions import DefaultCredentialsError
from keyring.errors import PasswordDeleteError
from pydantic import SecretStr, ValidationError

from backend.app import ai_connection, main, media_generation, narration_connections as narration, storage
from backend.app.models import MediaGenerationJobCreate, ProjectCreate, SceneCreate


class NarrationConnectionTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.enterContext(patch.dict(os.environ, {}, clear=True))
        for module in (storage, main):
            self.enterContext(patch.object(module, "ROOT", self.root))
        self.enterContext(patch.object(storage, "PROJECTS", self.root / "projects"))
        self.secrets = {}
        self.backend = Mock()
        self.backend.set_password.side_effect = lambda service, account, secret: self.secrets.__setitem__(account, secret)
        self.backend.get_password.side_effect = lambda service, account: self.secrets.get(account)
        self.backend.delete_password.side_effect = lambda service, account: self.secrets.pop(account, None)
        self.enterContext(patch.object(ai_connection, "_secure_backend", return_value=self.backend))
        self.credentials = Mock()
        self.credentials.before_request.side_effect = lambda request, method, url, headers: headers.update({"authorization": "Bearer google-test-token"})
        self.enterContext(patch.object(narration.google.auth, "default", return_value=(self.credentials, "test-project")))

    def save(self, **overrides):
        values = {
            "expectedRevision": narration.narration_status(self.root)["revision"],
            "name": "Training narration", "provider": "elevenlabs", "credentialSource": "secure-store",
            "apiKey": SecretStr("eleven-secret"), "voice": "voice-1", "model": "eleven_multilingual_v2",
        }
        values.update(overrides)
        narration.save_narration_connection(self.root, narration.NarrationConnectionUpdate(**values))
        return narration.narration_status(self.root)["connections"][-1]

    def job(self, identifier):
        project = storage.create_project(ProjectCreate(title="Narration tests"))
        project = storage.create_scene(project.id, SceneCreate(title="Read this"))
        return storage.create_media_generation_job(project.id, MediaGenerationJobCreate(
            kind="narration", narrationConnectionId=identifier, sceneId=project.storyboard.scenes[0].id,
            purpose="Training", script="Hello.",
        ))

    def response(self, content):
        response = Mock()
        response.read.side_effect = lambda limit: content[:limit]
        response.__enter__ = Mock(return_value=response)
        response.__exit__ = Mock(return_value=False)
        return response

    def test_secret_store_and_status_never_contain_key(self):
        item = self.save()
        status = narration.narration_status(self.root)
        self.assertTrue(item["configured"])
        self.assertNotIn("eleven-secret", json.dumps(status))
        metadata = self.root / "identity" / "narration-connections.json"
        self.assertNotIn("eleven-secret", metadata.read_text())
        connection = narration.resolve_narration_connection(self.root, item["id"])
        self.assertNotIn("eleven-secret", repr(connection))
        previous_revision = connection.revision
        self.save(id=item["id"], apiKey=None, voice="voice-2")
        self.assertEqual(len(self.secrets), 1)
        with self.assertRaisesRegex(ValueError, "changed"):
            narration.resolve_narration_connection(self.root, item["id"], previous_revision)

    def test_environment_rotation_and_disconnect_never_fall_back(self):
        self.save(credentialSource="environment", apiKey=None)
        item = narration.narration_status(self.root)["connections"][0]
        self.assertFalse(item["configured"])
        with patch.dict(os.environ, {"ELEVENLABS_API_KEY": "server-secret"}):
            connection = narration.resolve_narration_connection(self.root, item["id"])
            job = self.job(item["id"])
            with patch.dict(os.environ, {"ELEVENLABS_API_KEY": "rotated-secret"}):
                with self.assertRaisesRegex(ValueError, "changed"):
                    media_generation.NarrationProvider(job)
            narration.disconnect_narration_connection(self.root, item["id"], narration.narration_status(self.root)["revision"])
            with self.assertRaisesRegex(ValueError, "no longer exists"):
                narration.resolve_narration_connection(self.root, item["id"])
            self.assertNotIn("server-secret", repr(connection))

    def test_failed_secret_cleanup_or_metadata_write_preserves_retryable_connection(self):
        item = self.save()
        revision = narration.narration_status(self.root)["revision"]
        with patch.object(self.backend, "delete_password", side_effect=PasswordDeleteError("unavailable")):
            with self.assertRaises(PasswordDeleteError):
                narration.disconnect_narration_connection(self.root, item["id"], revision)
        self.assertEqual(narration.narration_status(self.root)["revision"], revision)
        with patch.object(ai_connection, "_atomic_json", side_effect=OSError("read only")):
            with self.assertRaises(RuntimeError):
                self.save(id=item["id"], apiKey=SecretStr("replacement-only"))
            with self.assertRaises(OSError):
                narration.disconnect_narration_connection(self.root, item["id"], revision)
        self.assertEqual(list(self.secrets.values()), ["eleven-secret"])
        self.assertTrue(narration.narration_status(self.root)["connections"][0]["configured"])
        self.assertEqual(narration.narration_status(self.root)["revision"], revision)

    def test_voice_discovery_can_be_configured_before_voice_selection(self):
        item = self.save(voice="")
        self.assertTrue(item["configured"])
        with self.assertRaisesRegex(ValueError, "voice"):
            self.job(item["id"])
        project = storage.list_projects()[0]
        capability = main.get_media_generation_capability(project.id)
        self.assertEqual(capability["narrationConnections"], [])

    def test_request_budget_applies_and_plaintext_store_fails_closed(self):
        item = self.save()
        connection = narration.resolve_narration_connection(self.root, item["id"])
        usage = self.root / "identity" / "ai-usage.json"
        usage.write_text(json.dumps({"date": datetime.now(timezone.utc).date().isoformat(), "requests": 20}))
        with patch.object(ai_connection, "open_provider_request") as transport:
            with self.assertRaisesRegex(RuntimeError, "daily"):
                narration.synthesize_narration(connection, "Hello", None, None)
            transport.assert_not_called()
        with patch.object(ai_connection, "_secure_backend", side_effect=RuntimeError("unavailable")):
            status = narration.narration_status(self.root)
            self.assertFalse(status["storageAvailable"])
            self.assertFalse(status["connections"][0]["configured"])

    def test_google_adc_missing_is_explicit_and_never_accepts_key(self):
        with patch.object(narration.google.auth, "default", side_effect=DefaultCredentialsError("sensitive path")):
            item = self.save(provider="google-cloud", credentialSource="adc", model="", apiKey=None, voice="en-US-Neural2-A")
            self.assertFalse(item["configured"])
            with self.assertRaisesRegex(RuntimeError, "Application Default Credentials"):
                narration.resolve_narration_connection(self.root, item["id"])
        for values in [
            {"provider": "google-cloud", "credentialSource": "secure-store", "apiKey": "private-key"},
            {"provider": "elevenlabs", "credentialSource": "adc"},
            {"provider": "elevenlabs", "credentialSource": "environment", "apiKey": "private-key"},
            {"provider": "google-cloud", "credentialSource": "adc", "apiKey": "private-key"},
            {"provider": "elevenlabs", "credentialSource": "environment", "voice": "../../bad"},
        ]:
            with self.assertRaises(ValidationError):
                narration.NarrationConnectionUpdate(expectedRevision="unconfigured", name="Bad", model="", **values)

    def test_elevenlabs_requests_use_fixed_endpoint_header_and_mp3(self):
        item = self.save()
        connection = narration.resolve_narration_connection(self.root, item["id"])
        with patch.object(ai_connection, "open_provider_request", return_value=self.response(b"ID3speech")) as transport:
            content, mime, model = narration.synthesize_narration(connection, "Hello", None, None)
        request = transport.call_args.args[1]
        self.assertEqual(request.full_url, "https://api.elevenlabs.io/v1/text-to-speech/voice-1?output_format=mp3_44100_128")
        self.assertEqual(request.get_header("Xi-api-key"), "eleven-secret")
        self.assertEqual(json.loads(request.data), {"text": "Hello", "model_id": "eleven_multilingual_v2"})
        self.assertEqual((content, mime, model), (b"ID3speech", "audio/mpeg", "eleven_multilingual_v2"))

    def test_google_uses_adc_and_decodes_audio_with_quota_project(self):
        item = self.save(provider="google-cloud", credentialSource="adc", model="", apiKey=None, voice="en-US-Neural2-A", projectId="quota-project")
        connection = narration.resolve_narration_connection(self.root, item["id"])
        encoded = json.dumps({"audioContent": base64.b64encode(b"ID3google").decode()}).encode()
        with patch.object(ai_connection, "open_provider_request", return_value=self.response(encoded)) as transport:
            content, mime, _ = narration.synthesize_narration(connection, "Hello", None, None)
        request = transport.call_args.args[1]
        self.assertEqual(request.full_url, "https://texttospeech.googleapis.com/v1/text:synthesize")
        self.assertEqual(request.get_header("Authorization"), "Bearer google-test-token")
        self.assertEqual(json.loads(request.data)["audioConfig"]["audioEncoding"], "MP3")
        self.assertEqual(content, b"ID3google")
        self.assertEqual(mime, "audio/mpeg")
        self.assertEqual(narration.google.auth.default.call_args.kwargs["quota_project_id"], "quota-project")
        with self.assertRaisesRegex(ValueError, "5,000"):
            narration.synthesize_narration(connection, "\u00e9" * 2501, None, None)

    def test_google_discovers_voices_without_openai_and_requires_saved_voice(self):
        item = self.save(provider="google-cloud", credentialSource="adc", model="", apiKey=None, voice="")
        response = self.response(json.dumps({"voices": [{"name": "en-US-Neural2-A", "languageCodes": ["en-US"]}]}).encode())
        with patch.object(ai_connection, "open_provider_request", return_value=response) as transport:
            result = narration.test_narration_connection(self.root, item["id"], narration.narration_status(self.root)["revision"])
        self.assertEqual(transport.call_args.args[1].full_url, "https://texttospeech.googleapis.com/v1/voices?languageCode=en-US")
        self.assertEqual(result["models"], [])
        self.assertEqual(result["voices"][0]["id"], "en-US-Neural2-A")
        self.save(id=item["id"], provider="google-cloud", credentialSource="adc", model="", apiKey=None, voice="en-US-Neural2-A")
        job = self.job(item["id"])
        capability = main.get_media_generation_capability(job.projectId)
        self.assertFalse(capability["imageConfigured"])
        self.assertTrue(capability["providerConfigured"])
        self.assertEqual([connection["id"] for connection in capability["narrationConnections"]], [item["id"]])

    def test_cartesia_discovery_and_synthesis_use_versioned_fixed_api(self):
        item = self.save(provider="cartesia", model="sonic-3.6", voice="voice-cartesia")
        connection = narration.resolve_narration_connection(self.root, item["id"])
        revision = narration.narration_status(self.root)["revision"]
        response = self.response(json.dumps({"data": [{"id": "voice-cartesia", "name": "Course narrator"}], "has_more": True}).encode())
        with patch.object(ai_connection, "open_provider_request", return_value=response) as transport:
            result = narration.test_narration_connection(self.root, item["id"], revision)
        request = transport.call_args.args[1]
        self.assertEqual(request.full_url, "https://api.cartesia.ai/voices?limit=100")
        self.assertEqual(request.get_header("Authorization"), "Bearer eleven-secret")
        self.assertEqual(request.get_header("Cartesia-version"), "2026-08-14")
        self.assertIsNone(request.data)
        self.assertIn("Additional voices", result["message"])
        self.assertEqual(result["voices"][0]["id"], "voice-cartesia")
        with patch.object(ai_connection, "open_provider_request", return_value=self.response(b"ID3cartesia")) as transport:
            content, mime, model = narration.synthesize_narration(connection, "Hello class", None, "fr-FR")
        request = transport.call_args.args[1]
        self.assertEqual(request.full_url, "https://api.cartesia.ai/tts/bytes")
        self.assertEqual(json.loads(request.data), {
            "model_id": "sonic-3.6", "transcript": "Hello class", "voice": {"id": "voice-cartesia"},
            "language": "fr-FR", "output_format": {"container": "mp3", "sample_rate": 44100, "bit_rate": 128000},
        })
        self.assertEqual((content, mime, model), (b"ID3cartesia", "audio/mpeg", "sonic-3.6"))
        job = self.job(item["id"])
        with patch.object(ai_connection, "open_provider_request", return_value=self.response(b"ID3cartesia")):
            media_generation._run_job(job.projectId, job.id)
        finished = storage.read_media_generation_job(job.projectId, job.id)
        self.assertEqual(finished.status, "completed", finished.error)
        self.assertEqual(finished.provider, "cartesia")

    def test_video_tests_are_read_only_and_never_enable_media_generation(self):
        for provider, environment, url, header, response in (
            ("synthesia", "stage", "https://api.synthesia.io/v2/videos?limit=1", "Authorization", {"videos": []}),
            ("shotstack", "stage", "https://api.shotstack.io/edit/stage/templates", "X-api-key", {"success": True, "response": {"templates": []}}),
            ("shotstack", "v1", "https://api.shotstack.io/edit/v1/templates", "X-api-key", {"success": True, "response": {"templates": []}}),
        ):
            with self.subTest(provider=provider, environment=environment):
                item = self.save(provider=provider, model="", voice="", environment=environment)
                connection = narration.resolve_narration_connection(self.root, item["id"])
                with patch.object(ai_connection, "open_provider_request", return_value=self.response(json.dumps(response).encode())) as transport:
                    result = narration.test_narration_connection(self.root, item["id"], narration.narration_status(self.root)["revision"])
                request = transport.call_args.args[1]
                self.assertEqual(request.full_url, url)
                self.assertEqual(request.get_header(header), "eleven-secret")
                self.assertIsNone(request.data)
                self.assertIn("not yet available", result["message"])
                with self.assertRaisesRegex(ValueError, "setup only"):
                    self.job(item["id"])
                with self.assertRaisesRegex(ValueError, "does not enable"):
                    narration.synthesize_narration(connection, "Never sent", "voice", None)
        project = storage.list_projects()[0]
        capability = main.get_media_generation_capability(project.id)
        self.assertEqual(capability["narrationConnections"], [])
        self.assertFalse(capability["providerConfigured"])
        self.assertFalse(media_generation.media_provider_configured())

    def test_new_provider_environment_rotation_and_provider_key_isolation(self):
        for provider, environment, variable in (
            ("cartesia", "stage", "CARTESIA_API_KEY"), ("synthesia", "stage", "SYNTHESIA_API_KEY"),
            ("shotstack", "stage", "SHOTSTACK_SANDBOX_API_KEY"), ("shotstack", "v1", "SHOTSTACK_PRODUCTION_API_KEY"),
        ):
            with self.subTest(provider=provider, environment=environment):
                item = self.save(provider=provider, model="sonic-3.6" if provider == "cartesia" else "", voice="", environment=environment, credentialSource="environment", apiKey=None)
                self.assertFalse(item["configured"])
                with patch.dict(os.environ, {variable: "provider-fixture-only"}):
                    connection = narration.resolve_narration_connection(self.root, item["id"])
                    self.assertEqual(connection.api_key, "provider-fixture-only")
                    with patch.dict(os.environ, {variable: "rotated-fixture-only"}):
                        with self.assertRaisesRegex(ValueError, "changed"):
                            narration.resolve_narration_connection(self.root, item["id"], connection.revision)
        item = self.save()
        with self.assertRaisesRegex(ValueError, "cannot change provider"):
            self.save(id=item["id"], provider="cartesia", model="sonic-3.6", apiKey=None)
        item = self.save(provider="shotstack", model="", voice="")
        with self.assertRaisesRegex(ValueError, "matching Shotstack key"):
            self.save(id=item["id"], provider="shotstack", model="", voice="", environment="v1", apiKey=None)
        self.assertNotIn("provider-fixture-only", json.dumps(narration.narration_status(self.root)))

    def test_invalid_environment_keys_fail_before_header_construction_without_disclosure(self):
        for key in ("fixture-secret\ninvalid", "fixture-\x7f-secret", "fixture-\u00e9-secret", "x" * 513):
            with self.subTest(key_length=len(key)):
                item = self.save(provider="cartesia", model="sonic-3.6", credentialSource="environment", apiKey=None)
                with patch.dict(os.environ, {"CARTESIA_API_KEY": key}), patch.object(ai_connection, "open_provider_request") as transport:
                    self.assertFalse(narration.narration_status(self.root)["connections"][-1]["configured"])
                    with self.assertRaises(RuntimeError) as raised:
                        narration.test_narration_connection(self.root, item["id"], narration.narration_status(self.root)["revision"])
                    self.assertNotIn(key, str(raised.exception))
                    transport.assert_not_called()

    def test_discovery_only_no_generation_and_errors_are_sanitized(self):
        item = self.save()
        responses = [
            self.response(json.dumps({"voices": [{"voice_id": "v1", "name": "Training voice"}], "has_more": True}).encode()),
            self.response(json.dumps([{"model_id": "m1", "name": "Speech model", "can_do_text_to_speech": True}]).encode()),
        ]
        revision = narration.narration_status(self.root)["revision"]
        with patch.object(ai_connection, "open_provider_request", side_effect=responses) as transport:
            result = narration.test_narration_connection(self.root, item["id"], revision)
        self.assertTrue(result["connected"])
        self.assertIn("Additional voices", result["message"])
        self.assertEqual(result["voices"][0]["id"], "v1")
        self.assertTrue(all(call.args[1].data is None for call in transport.call_args_list))
        connection = narration.resolve_narration_connection(self.root, item["id"])
        error = urllib.error.HTTPError("url", 401, "eleven-secret", {}, io.BytesIO(b"eleven-secret"))
        with patch.object(ai_connection, "open_provider_request", side_effect=error):
            with self.assertRaises(RuntimeError) as raised:
                narration.synthesize_narration(connection, "Hello", None, None)
        self.assertNotIn("eleven-secret", str(raised.exception))
        error.close()
        with patch.object(ai_connection, "open_provider_request", return_value=self.response(b'{"voices":[null]}')):
            with self.assertRaisesRegex(RuntimeError, "invalid"):
                narration.test_narration_connection(self.root, item["id"], revision)

    def test_invalid_audio_and_response_limits_fail(self):
        item = self.save()
        connection = narration.resolve_narration_connection(self.root, item["id"])
        for output in (b"", b'{"error":"not audio"}'):
            with patch.object(ai_connection, "open_provider_request", return_value=self.response(output)):
                with self.assertRaisesRegex(RuntimeError, "MP3"):
                    narration.synthesize_narration(connection, "Hello", None, None)
        with patch.object(ai_connection, "open_provider_request", return_value=self.response(b"oversized")):
            with self.assertRaisesRegex(RuntimeError, "size"):
                narration._request(connection, "/v1/models", limit=2)

    def test_api_origin_validation_and_stale_revisions(self):
        with TestClient(main.app) as client:
            status = client.get("/api/narration-connections").json()
            payload = {"expectedRevision": status["revision"], "name": "Narration", "provider": "elevenlabs", "credentialSource": "secure-store", "apiKey": "eleven-secret", "voice": "voice1", "model": "eleven_multilingual_v2"}
            self.assertEqual(client.put("/api/narration-connections", json=payload).status_code, 403)
            headers = {"Origin": "http://127.0.0.1:5173"}
            response = client.put("/api/narration-connections", json=payload, headers=headers)
            self.assertEqual(response.status_code, 200, response.text)
            self.assertNotIn("eleven-secret", response.text)
            identifier = response.json()["connections"][0]["id"]
            revision = response.json()["revision"]
            for action in ("test", "disconnect"):
                blocked = client.post(f"/api/narration-connections/{identifier}/{action}", json={"expectedRevision": revision}, headers={"Origin": "https://untrusted.invalid"})
                self.assertEqual(blocked.status_code, 403)
            self.assertEqual(client.put("/api/narration-connections", json=payload, headers=headers).status_code, 409)
            payload["apiKey"] = "eleven-secret " * 100
            invalid = client.put("/api/narration-connections", json=payload, headers=headers)
            self.assertEqual(invalid.status_code, 422)
            self.assertNotIn("eleven-secret", invalid.text)
            self.assertNotIn("eleven-secret", (self.root / "audit" / "events.jsonl").read_text())

    def test_job_binds_connection_and_candidate_regeneration_keeps_provider(self):
        item = self.save()
        job = self.job(item["id"])
        self.assertEqual(job.voice, "voice-1")
        self.assertEqual(job.language, "en-US")
        with patch.object(ai_connection, "open_provider_request", return_value=self.response(b"ID3speech")):
            media_generation._run_job(job.projectId, job.id)
        finished = storage.read_media_generation_job(job.projectId, job.id)
        self.assertEqual(finished.status, "completed", finished.error)
        candidate = storage.read_generated_candidate(job.projectId, finished.candidateIds[0])
        self.assertEqual(candidate.narrationConnectionId, item["id"])
        with patch.object(media_generation, "start_media_generation_job"):
            regenerated = media_generation.regenerate_candidate(job.projectId, candidate.id)
        self.assertEqual(regenerated.narrationConnectionId, item["id"])
        self.save(id=item["id"], voice="different")
        media_generation._run_job(regenerated.projectId, regenerated.id)
        failed = storage.read_media_generation_job(regenerated.projectId, regenerated.id)
        self.assertEqual(failed.status, "failed")
        self.assertIn("changed", failed.error)


if __name__ == "__main__":
    unittest.main()
