import base64
import hashlib
import os
import json
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock, patch

from backend.app import media_generation, pythia_media
from backend.app.learning_intelligence import PythiaUnavailableError

PNG = b"\x89PNG\r\n\x1a\nsynthetic-image-response"


class PythiaMediaTests(unittest.TestCase):
    def setUp(self):
        self.client = Mock()
        self.client.image_status.return_value = {"configured": True, "revision": "revision-1", "model": "gpt-image-1.5"}
        self.client.generate_image.return_value = {"format": "pythia-image-result-v1", "request_id": "job-12345",
            "model": "gpt-image-1.5", "media_type": "image/png", "image_base64": base64.b64encode(PNG).decode(),
            "sha256": hashlib.sha256(PNG).hexdigest()}
        self.enterContext(patch.object(pythia_media, "PythiaProvider", return_value=self.client))
        self.job = SimpleNamespace(id="job-12345", prompt="Image prompt", width=1024, height=1024)

    def test_image_is_requested_from_pythia_and_bound_to_job(self):
        provider = pythia_media.PythiaImageProvider("pythia-revision-1")
        self.assertEqual(provider.generate_image(self.job), (PNG, "image/png", "gpt-image-1.5"))
        self.client.generate_image.assert_called_once_with({"request_id": "job-12345", "prompt": "Image prompt",
            "width": 1024, "height": 1024, "expected_revision": "revision-1"})
        self.assertEqual(provider.name, "Pythia")

    def test_unavailable_pythia_does_not_fall_back(self):
        self.client.image_status.side_effect = PythiaUnavailableError("unavailable")
        with patch.dict(os.environ, {"CHIMERA_IMAGE_PROVIDER": "pythia"}):
            self.assertFalse(pythia_media.image_status()["configured"])
        with self.assertRaises(PythiaUnavailableError):
            pythia_media.PythiaImageProvider()
        self.client.generate_image.assert_not_called()

    def test_changed_connection_and_corrupt_return_are_rejected(self):
        with self.assertRaises(RuntimeError):
            pythia_media.PythiaImageProvider("pythia-old-revision")
        provider = pythia_media.PythiaImageProvider()
        for field, value in (("request_id", "different-job"), ("sha256", "wrong"), ("model", "wrong-model")):
            original = self.client.generate_image.return_value.copy()
            self.client.generate_image.return_value[field] = value
            with self.assertRaises(RuntimeError):
                provider.generate_image(self.job)
            self.client.generate_image.return_value = original

    def test_running_job_is_not_automatically_reissued_after_restart(self):
        project = SimpleNamespace(id="project")
        running = SimpleNamespace(id="running", status="running", cancelRequested=False)
        queued = SimpleNamespace(id="queued", status="queued", cancelRequested=False)
        with patch.object(media_generation.storage, "list_projects", return_value=[project]), \
             patch.object(media_generation.storage, "list_media_generation_jobs", return_value=[running, queued]), \
             patch.object(media_generation.storage, "update_media_generation_job") as update, \
             patch.object(media_generation, "start_media_generation_job") as start:
            media_generation.recover_media_generation_jobs()
        start.assert_called_once_with("project", "queued")
        self.assertEqual(update.call_args.kwargs["status"], "failed")

    def test_saved_selection_survives_a_normal_endpoint_update(self):
        from backend.app.pythia_connection import save_engine_url
        with tempfile.TemporaryDirectory() as directory, patch.dict(os.environ, {}, clear=True), \
             patch.object(media_generation.storage, "ROOT", Path(directory)):
            path = Path(directory) / "pythia-connection.json"
            path.write_text(json.dumps({"baseUrl": "http://127.0.0.1:8002", "imageProvider": "pythia"}))
            self.assertTrue(pythia_media.enabled())
            save_engine_url(Path(directory), "http://localhost:8002")
            self.assertTrue(pythia_media.enabled())
            self.assertEqual(json.loads(path.read_text())["baseUrl"], "http://localhost:8002")

    def test_image_submission_needs_no_chimera_provider_credential(self):
        from backend.app.models import MediaGenerationJobCreate
        project = SimpleNamespace(storyboard=SimpleNamespace(scenes=[SimpleNamespace(id="scene")], revision=1))
        with patch.dict(os.environ, {"CHIMERA_IMAGE_PROVIDER": "pythia"}), \
             patch.object(media_generation.storage, "read_project", return_value=project), \
             patch.object(pythia_media, "image_status", return_value={"configured": True, "revision": "pythia-revision-1"}), \
             patch.object(media_generation.storage, "connection_status", side_effect=AssertionError("Chimera provider lookup is unnecessary")), \
             patch.object(media_generation.storage, "write_media_generation_job"):
            job = media_generation.storage.create_media_generation_job("project", MediaGenerationJobCreate(
                kind="image", sceneId="scene", purpose="Illustration", prompt="Image prompt"))
        self.assertEqual(job.aiConnectionRevision, "pythia-revision-1")


if __name__ == "__main__":
    unittest.main()
