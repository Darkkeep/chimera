import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

from fastapi import HTTPException

from backend.app import main, storage
from backend.app.media_generation import _provider, media_provider_configured


class MediaCapabilityTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.enterContext(patch.object(storage, "ROOT", Path(self.temporary.name)))

    def test_configuration_matches_provider_requirements(self) -> None:
        configured = {"CHIMERA_AI_BASE_URL": "https://example.test/v1", "CHIMERA_AI_API_KEY": "test-only-secret", "CHIMERA_AI_MODEL": "test-model"}
        with patch.dict(os.environ, configured, clear=True):
            self.assertTrue(media_provider_configured())
            self.assertEqual(_provider().image_model, "test-model")
        for missing in configured:
            with patch.dict(os.environ, {key: value for key, value in configured.items() if key != missing}, clear=True):
                self.assertFalse(media_provider_configured())
                with self.assertRaises(RuntimeError):
                    _provider()

    def test_capability_exposes_only_configuration_and_permission_flags(self) -> None:
        policy = Mock()
        policy.allows.return_value = False
        image_status = {"configured": True, "provider": "openai", "audioModel": "gpt-4o-mini-tts"}
        with patch.object(main, "read_project"), patch.object(main, "get_authorization_policy", return_value=policy), patch.object(main, "connection_status", return_value=image_status), patch.object(main, "narration_status", return_value={"connections": []}):
            result = main.get_media_generation_capability("project")
        self.assertEqual(result, {
            "providerConfigured": True, "imageConfigured": True, "canGenerate": False,
            "narrationConnections": [{
                "id": "legacy-openai", "name": "Existing AI connection", "provider": "openai",
                "voice": "alloy", "language": "en-US", "model": "gpt-4o-mini-tts",
            }],
        })
        self.assertEqual(policy.allows.call_args.args[1:], ("media.job.create", "project"))

    def test_missing_project_returns_not_found(self) -> None:
        with patch.object(main, "read_project", side_effect=FileNotFoundError):
            with self.assertRaises(HTTPException) as raised:
                main.get_media_generation_capability("missing")
        self.assertEqual(raised.exception.status_code, 404)
