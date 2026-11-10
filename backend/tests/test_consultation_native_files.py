import base64
import hashlib
import io
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch
from zipfile import ZipFile

from fastapi.testclient import TestClient

from backend.app import main, consultation_artifacts, storage, scorm
from backend.app.models import ProjectCreate, SceneCreate, SceneUpdate

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

    def test_animated_gif_promotes_losslessly_with_revision_guard(self):
        provider = self.fake(ANIMATED_GIF, "image/gif")
        with patch("backend.app.learning_intelligence.PythiaProvider", return_value=provider):
            descriptor = self.client.post(self.root + "/native/" + self.source_id,
                                          headers=self.headers).json()
        endpoint = self.root + "/" + descriptor["id"] + "/promote"
        self.assertEqual(428, self.client.post(endpoint, headers=self.headers).status_code)
        self.assertEqual(412, self.client.post(endpoint, headers={**self.headers, "If-Match": "999"}).status_code)
        project = storage.read_project(self.project.id)
        response = self.client.post(endpoint, headers={**self.headers, "If-Match": str(project.storyboard.revision)})
        self.assertEqual(200, response.status_code, response.text)
        asset = response.json()["storyboard"]["assets"][-1]
        self.assertEqual("image", asset["kind"])
        self.assertEqual("image/gif", asset["contentType"])
        self.assertEqual(hashlib.sha256(ANIMATED_GIF).hexdigest(), asset["sha256"])
        self.assertEqual(ANIMATED_GIF, (storage.project_path(self.project.id) / asset["path"]).read_bytes())
        self.assertEqual(ANIMATED_GIF, self.client.get(
            self.root + "/" + descriptor["id"] + "/download").content)

    def test_svg_promotion_rejects_active_document_but_keeps_original(self):
        unsafe = b'<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'
        provider = self.fake(unsafe, "image/svg+xml")
        with patch("backend.app.learning_intelligence.PythiaProvider", return_value=provider):
            descriptor = self.client.post(self.root + "/native/" + self.source_id,
                                          headers=self.headers).json()
        project = storage.read_project(self.project.id)
        result = self.client.post(self.root + "/" + descriptor["id"] + "/promote",
                                  headers={**self.headers, "If-Match": str(project.storyboard.revision)})
        self.assertEqual(422, result.status_code, result.text)
        self.assertEqual([], storage.read_project(self.project.id).storyboard.assets)
        self.assertEqual(unsafe, self.client.get(self.root + "/" + descriptor["id"] + "/download").content)

    def test_safe_svg_promotes_losslessly_as_vector_image(self):
        provider = self.fake(VECTOR, "image/svg+xml")
        with patch("backend.app.learning_intelligence.PythiaProvider", return_value=provider):
            descriptor = self.client.post(self.root + "/native/" + self.source_id,
                                          headers=self.headers).json()
        project = storage.read_project(self.project.id)
        result = self.client.post(self.root + "/" + descriptor["id"] + "/promote",
                                  headers={**self.headers, "If-Match": str(project.storyboard.revision)})
        self.assertEqual(200, result.status_code, result.text)
        asset = result.json()["storyboard"]["assets"][-1]
        self.assertEqual("image/svg+xml", asset["contentType"])
        self.assertEqual(VECTOR, (storage.project_path(self.project.id) / asset["path"]).read_bytes())

    def test_native_gif_and_svg_keep_original_bytes_in_scorm_package(self):
        for source_id, raw, mime in (("native-gif-source-01", ANIMATED_GIF, "image/gif"),
                                     ("native-svg-source-01", VECTOR, "image/svg+xml")):
            provider = self.fake(raw, mime)
            with patch("backend.app.learning_intelligence.PythiaProvider", return_value=provider):
                result = self.client.post(self.root + "/native/" + source_id,
                                          headers=self.headers)
            self.assertEqual(200, result.status_code, result.text)
            revision = storage.read_project(self.project.id).storyboard.revision
            applied = self.client.post(self.root + "/" + result.json()["id"] + "/promote",
                                       headers={**self.headers, "If-Match": str(revision)})
            self.assertEqual(200, applied.status_code, applied.text)
        project = storage.read_project(self.project.id)
        asset_ids = [asset.id for asset in project.storyboard.assets]
        for idx, asset_id in enumerate(asset_ids):
            project = storage.create_scene(self.project.id, SceneCreate(title=f"Source fidelity {idx + 1}"))
            project = storage.update_scene(
                self.project.id, project.storyboard.scenes[-1].id,
                SceneUpdate(backgroundAsset=asset_id), project.storyboard.revision)
        project = storage.read_project(self.project.id)
        package, _ = scorm.build_scorm_2004(project)
        with ZipFile(io.BytesIO(package)) as archive:
            assets = project.storyboard.assets
            self.assertEqual(2, len(assets))
            self.assertEqual(ANIMATED_GIF, archive.read(assets[0].path))
            self.assertEqual(VECTOR, archive.read(assets[1].path))

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
