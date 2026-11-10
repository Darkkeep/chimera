import base64
import hashlib
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

from fastapi.testclient import TestClient

from backend.app import main, consultation_artifacts, storage
from backend.app.models import ProjectCreate

ANIMATED_GIF = base64.b64decode(
    "R0lGODlhAgACAIEAAAAAAAAAAAAAAAAAACH/C05FVFNDQVBFMi4wAwEAAAAh+QQACwAAACwAAAAAAgACAAAIBgABCAQQEAAh+QQBFwABACwAAAAAAgACAIH///8AAAAAAAAAAAAIBgABCAQQEAA7"
)
VECTOR = b'<svg xmlns="http://www.w3.org/2000/svg"><circle cx="2" cy="2" r="2"/></svg>'


class NativeArtifactTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        root = Path(self.temp.name)
        self.enterContext(patch.object(storage, "ROOT", root))
        self.enterContext(patch.object(main, "ROOT", root))
        self.enterContext(patch.object(storage, "PROJECTS", root / "projects"))
        self.client = TestClient(main.app)
        self.addCleanup(self.client.close)
        self.project = storage.create_project(ProjectCreate(title="Native assets"))
        self.root = f"/api/projects/{self.project.id}/consultation-artifacts"
        self.headers = {"Origin": "http://127.0.0.1:5173"}
        self.source_id = "native-file-012345"

    def fake(self, raw, mime, project=None):
        provider = Mock()
        provider.native_file.return_value = (
            raw, mime, hashlib.sha256(raw).hexdigest(),
            "pythia-operation-012345", project or self.project.id)
        return provider

    def test_gif_original_keeps_animation_after_import_and_download(self):
        provider = self.fake(ANIMATED_GIF, "image/gif")
        with patch("backend.app.learning_intelligence.PythiaProvider", return_value=provider):
            response = self.client.post(self.root + "/native/" + self.source_id, headers=self.headers)
        self.assertEqual(200, response.status_code, response.text)
        descriptor = response.json()
        self.assertTrue(descriptor["animated"])
        self.assertEqual(2, descriptor["frameCount"])
        self.assertEqual("image/gif", descriptor["mimeType"])
        file = self.client.get(self.root + "/" + descriptor["id"] + "/download")
        self.assertEqual(200, file.status_code, file.text)
        self.assertEqual(ANIMATED_GIF, file.content)
        self.assertIn("attachment", file.headers["content-disposition"])
        self.assertEqual("nosniff", file.headers["x-content-type-options"])
        self.assertEqual("sandbox", file.headers["content-security-policy"])
        self.assertEqual(200, self.client.post(
            f"/api/projects/{self.project.id}/pythia-conversation/reset", headers=self.headers).status_code)
        self.assertEqual(ANIMATED_GIF,
                         self.client.get(self.root + "/" + descriptor["id"] + "/download").content)
        self.assertEqual(1, len(self.client.get(self.root).json()["artifacts"]))
        provider.native_file.assert_called_once_with(self.source_id)

    def test_svg_is_preserved_and_forced_attachment(self):
        provider = self.fake(VECTOR, "image/svg+xml")
        with patch("backend.app.learning_intelligence.PythiaProvider", return_value=provider):
            response = self.client.post(self.root + "/native/" + self.source_id, headers=self.headers)
        self.assertEqual(200, response.status_code, response.text)
        descriptor = response.json()
        self.assertEqual("vector", descriptor["type"])
        self.assertFalse(descriptor["previewSafe"])
        file = self.client.get(self.root + "/" + descriptor["id"] + "/download")
        self.assertEqual(VECTOR, file.content)
        self.assertEqual("application/octet-stream", file.headers["content-type"])
        self.assertIn(".svg", file.headers["content-disposition"])

    def test_source_cannot_be_imported_into_unrelated_project(self):
        provider = self.fake(VECTOR, "image/svg+xml", "different-project")
        with patch("backend.app.learning_intelligence.PythiaProvider", return_value=provider):
            response = self.client.post(self.root + "/native/" + self.source_id, headers=self.headers)
        self.assertEqual(422, response.status_code)
        self.assertEqual([], self.client.get(self.root).json()["artifacts"])

    def test_mime_and_hash_mismatch_are_rejected(self):
        provider = self.fake(ANIMATED_GIF, "image/svg+xml")
        with patch("backend.app.learning_intelligence.PythiaProvider", return_value=provider):
            response = self.client.post(self.root + "/native/" + self.source_id, headers=self.headers)
        self.assertEqual(422, response.status_code)
        provider = self.fake(ANIMATED_GIF, "image/gif")
        values = list(provider.native_file.return_value)
        values[2] = "0" * 64
        provider.native_file.return_value = tuple(values)
        with patch("backend.app.learning_intelligence.PythiaProvider", return_value=provider):
            response = self.client.post(self.root + "/native/" + self.source_id, headers=self.headers)
        self.assertEqual(422, response.status_code)
        self.assertEqual([], self.client.get(self.root).json()["artifacts"])


if __name__ == "__main__":
    unittest.main()
