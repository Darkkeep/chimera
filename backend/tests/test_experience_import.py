import io
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient
from pptx import Presentation
from backend.app import main, storage


class ExperienceImportPreviewTests(unittest.TestCase):
    def setUp(self):
        root = Path(self.enterContext(tempfile.TemporaryDirectory()))
        self.enterContext(patch.object(storage, "ROOT", root))
        self.enterContext(patch.object(storage, "PROJECTS", root / "projects"))
        self.enterContext(patch.object(main, "ROOT", root))
        self.enterContext(patch.dict(os.environ, {"CHIMERA_PROGRESSIVE_DEMO": "true"}))
        self.client = self.enterContext(TestClient(main.app))

    def preview(self, raw, name="handoff.json", progressive=False):
        return self.client.post("/api/experience-import/preview", files={"file": (name, raw)},
                                data={"progressive_mode": str(progressive).lower()})

    def test_pythia_preview_matches_existing_contract_without_creating_projects(self):
        raw = (Path(__file__).parent / "fixtures/production-handoff-v1.json").read_bytes()
        for progressive, count in ((False, 2), (True, 1)):
            response = self.preview(raw, progressive=progressive)
            self.assertEqual(response.status_code, 200, response.text)
            self.assertEqual(len(response.json()["scenes"]), count)
        self.assertEqual(list(storage.PROJECTS.glob("*")), [])

    def test_unknown_invalid_version_and_missing_media_are_errors(self):
        for data in (b"{broken", b"{}", json.dumps({"format":"unknown","schemaVersion":"1.0","projectId":"x","title":"x","scenes":[]}).encode(),
                     json.dumps({"schemaVersion":"9.0","projectId":"x","title":"x","scenes":[]}).encode(),
                     json.dumps({"schemaVersion":"1.0","projectId":"x","title":"x","scenes":[],"backgroundAsset":"missing"}).encode()):
            response = self.preview(data)
            self.assertEqual(response.status_code, 422, response.text)
        self.assertEqual(list(storage.PROJECTS.glob("*")), [])

    def test_native_backup_and_powerpoint_recognition(self):
        response = self.preview(json.dumps({"schemaVersion":"1.0","projectId":"old","title":"Backup","scenes":[]}).encode())
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["kind"], "storyboard")
        deck = Presentation(); deck.slides.add_slide(deck.slide_layouts[0])
        stream = io.BytesIO(); deck.save(stream)
        response = self.preview(stream.getvalue(), "test.pptx")
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(len(response.json()["scenes"]), 1)

    def test_preview_uses_project_creation_permission(self):
        with patch.object(main, "_require_action", side_effect=main.HTTPException(403, "Not permitted")):
            self.assertEqual(self.preview(b"{}").status_code, 403)


if __name__ == "__main__":
    unittest.main()
