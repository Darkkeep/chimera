import base64
import hashlib
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock, patch

from fastapi.testclient import TestClient

from backend.app import main, pythia_native_retrieval as native, storage
from backend.app.models import ProjectCreate


PNG = b"\x89PNG\r\n\x1a\nverified-source-image"
MP3 = b"ID3verified-source-audio"


class NativeSourceRecoveryTests(unittest.TestCase):
    def setUp(self):
        self.project_id = "project-one"
        self.candidate_id = "candidate-012345abcdef"
        self.job_id = "media-generation-012345abcdef"
        self.job = SimpleNamespace(id=self.job_id, projectId=self.project_id, candidateIds=[self.candidate_id],
                                   status="completed", provider="Pythia", kind="image")
        self.candidate = self.make_candidate("image", PNG)
        self.provider = Mock()
        self.enterContext(patch.object(storage, "read_generated_candidate", return_value=self.candidate))
        self.enterContext(patch.object(storage, "read_media_generation_job", return_value=self.job))

    def make_candidate(self, kind, raw):
        return SimpleNamespace(id=self.candidate_id, projectId=self.project_id, jobId=self.job_id,
                               provider="Pythia", kind=kind, contentType="image/png" if kind == "image" else "audio/mpeg",
                               sizeBytes=len(raw), sha256=hashlib.sha256(raw).hexdigest())

    def response(self, kind, raw):
        return {"format": "pythia-image-result-v1" if kind == "image" else "pythia-media-result-v1",
                "request_id": self.job_id, "media_type": "image/png" if kind == "image" else "audio/mpeg",
                "sha256": hashlib.sha256(raw).hexdigest(),
                "image_base64" if kind == "image" else "data_base64": base64.b64encode(raw).decode()}

    def test_recovers_original_image_without_regeneration(self):
        self.provider.retrieve_native_output.return_value = self.response("image", PNG)
        candidate, content = native.recover_candidate(self.project_id, self.candidate_id, self.provider)
        self.assertIs(candidate, self.candidate)
        self.assertEqual(PNG, content)
        self.provider.retrieve_native_output.assert_called_once_with("image", self.job_id)

    def test_recovers_original_audio(self):
        self.job.kind = "narration"
        self.candidate = self.make_candidate("audio", MP3)
        with patch.object(storage, "read_generated_candidate", return_value=self.candidate):
            self.provider.retrieve_native_output.return_value = self.response("narration", MP3)
            _, content = native.recover_candidate(self.project_id, self.candidate_id, self.provider)
        self.assertEqual(MP3, content)

    def test_rejects_cross_project_and_incomplete_job_before_provider_call(self):
        for changed in ({"projectId": "other"}, {"provider": "other"}, {"candidateIds": []}, {"status": "running"}):
            before = {key: getattr(self.job, key) for key in changed}
            try:
                for key, value in changed.items():
                    setattr(self.job, key, value)
                with self.assertRaises(native.SourceConflict):
                    native.recover_candidate(self.project_id, self.candidate_id, self.provider)
            finally:
                for key, value in before.items():
                    setattr(self.job, key, value)
        self.provider.retrieve_native_output.assert_not_called()

    def test_rejects_mismatched_bytes_and_receipt(self):
        valid = self.response("image", PNG)
        for bad in ({**valid, "sha256": "0" * 64},
                    {**valid, "image_base64": base64.b64encode(PNG + b"tamper").decode()},
                    {**valid, "request_id": "wrong-id"},
                    {**valid, "image_base64": "../../secret"}):
            self.provider.retrieve_native_output.return_value = bad
            with self.assertRaises(native.SourceConflict):
                native.recover_candidate(self.project_id, self.candidate_id, self.provider)


class NativeRecoveryRouteTests(unittest.TestCase):
    def test_route_returns_real_bytes_only_for_authorized_project(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            with patch.object(storage, "ROOT", root), patch.object(storage, "PROJECTS", root / "projects"), \
                 patch.object(main, "ROOT", root):
                project = storage.create_project(ProjectCreate(title="Media source recovery"))
                client = TestClient(main.app)
                candidate = SimpleNamespace(kind="image", contentType="image/png",
                                            id="candidate-012345abcdef")
                with patch.object(native, "recover_candidate", return_value=(candidate, PNG)):
                    path = f"/api/projects/{project.id}/generated-candidates/candidate-012345abcdef/pythia-original"
                    response = client.get(path)
                    self.assertEqual(200, response.status_code, response.text)
                    self.assertEqual(PNG, response.content)
                    self.assertEqual("image/png", response.headers["content-type"])
                    self.assertIn("attachment", response.headers["content-disposition"])
                with patch.object(native, "recover_candidate", side_effect=FileNotFoundError()):
                    self.assertEqual(404, client.get(path).status_code)
                client.close()


if __name__ == "__main__":
    unittest.main()
