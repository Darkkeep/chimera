import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

from fastapi.testclient import TestClient

from backend.app import main, storage
from backend.app.learning_intelligence import PythiaProvider
from backend.app.pythia_connection import configured_engine_url, local_engine_url, save_engine_url


class PythiaConnectionTests(unittest.TestCase):
    def setUp(self):
        self.root = Path(self.enterContext(tempfile.TemporaryDirectory()))
        self.enterContext(patch.dict(os.environ, {}, clear=True))
        self.enterContext(patch.object(storage, "ROOT", self.root))
        self.enterContext(patch.object(main, "ROOT", self.root))

    def test_persisted_local_preference_and_environment_override(self):
        save_engine_url(self.root, "http://127.0.0.1:8010/")
        self.assertEqual(PythiaProvider().base_url, "http://127.0.0.1:8010")
        with patch.dict(os.environ, {"CHIMERA_PYTHIA_BASE_URL": "https://managed.example"}):
            self.assertEqual(configured_engine_url(self.root), "https://managed.example")
            with self.assertRaises(ValueError):
                save_engine_url(self.root, "http://localhost:8001")

    def test_local_preference_rejects_remote_addresses_paths_and_credentials(self):
        for url in ("http://example.com:8001", "http://127.0.0.1:8001/tasks", "http://user:secret@localhost:8001", "http://localhost", "http://[broken", "http://localhost:99999", "http://localhost:8001?token=secret"):
            with self.subTest(url=url), self.assertRaises(ValueError):
                local_engine_url(url)

    def test_connection_is_saved_only_after_engine_identification_and_origin_check(self):
        provider = Mock()
        provider.health.return_value = {"status": "ok"}
        provider.capabilities.return_value = {"capabilities": {}}
        with patch.object(main, "PythiaProvider", return_value=provider), TestClient(main.app) as client:
            url = "/api/intelligence-engine/local-connection"
            body = {"baseUrl": "http://127.0.0.1:8010"}
            self.assertEqual(client.put(url, json=body).status_code, 403)
            response = client.put(url, json=body, headers={"Origin": "http://127.0.0.1:5173"})
            self.assertEqual(response.status_code, 422, response.text)
            self.assertFalse((self.root / "pythia-connection.json").exists())
            provider.health.return_value["contract_version"] = "1.1.0"
            response = client.put(url, json=body, headers={"Origin": "http://127.0.0.1:5173"})
            self.assertEqual(response.status_code, 200, response.text)
            self.assertEqual(configured_engine_url(self.root), body["baseUrl"])
            provider.submit_task.assert_not_called()


if __name__ == "__main__":
    unittest.main()
