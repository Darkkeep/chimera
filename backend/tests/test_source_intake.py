import io
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

from backend.app import main, storage
from backend.app.models import ProjectCreate


class SourceIntakeTests(unittest.TestCase):
    def setUp(self):
        temporary = self.enterContext(tempfile.TemporaryDirectory())
        root = Path(temporary)
        self.enterContext(patch.object(storage, "ROOT", root))
        self.enterContext(patch.object(storage, "PROJECTS", root / "projects"))
        self.project = storage.create_project(ProjectCreate(title="Source intake"))
        self.client = self.enterContext(TestClient(main.app))
        self.url = f"/api/projects/{self.project.id}/reference-resources"

    def upload(self, kind, content="Inspect equipment before use.", url=None):
        data = {"title": "Supplied source", "source_kind": kind}
        if url:
            data["source_url"] = url
        return self.client.post(self.url, data=data, files={"file": ("source.txt", io.BytesIO(content.encode()), "text/plain")})

    def test_text_and_pythia_sources_retain_bytes_and_provenance_after_reload(self):
        for kind in ("text", "pythia"):
            with self.subTest(kind=kind):
                response = self.upload(kind)
                self.assertEqual(response.status_code, 201, response.text)
                resource = response.json()
                version = resource["versions"][-1]
                self.assertEqual(version["sourceKind"], kind)
                self.assertEqual(version["passages"][0]["text"], "Inspect equipment before use.")
                self.assertEqual((storage.project_path(self.project.id) / version["originalPath"]).read_text(), "Inspect equipment before use.")
                self.assertIn(resource, self.client.get(self.url).json())
        self.assertEqual(storage.read_project(self.project.id).storyboard.revision, self.project.storyboard.revision)

    def test_link_only_is_not_grounding_and_supplied_text_is_retained(self):
        with patch("httpx.request", side_effect=AssertionError("Source intake must not fetch links")):
            response = self.upload("web", "", "https://example.com/policy")
            self.assertEqual(response.status_code, 201, response.text)
            version = response.json()["versions"][-1]
            self.assertEqual(version["passages"], [])
            self.assertEqual(version["extractionStatus"], "failed")
            self.assertIn("not fetched", version["extractionMessage"])
            response = self.upload("web", url="https://example.com/policy")
            self.assertEqual(response.status_code, 201)
            version = response.json()["versions"][-1]
            self.assertEqual(version["sourceUrl"], "https://example.com/policy")
            self.assertEqual(version["extractionStatus"], "complete")

    def test_invalid_links_and_unknown_kinds_do_not_persist(self):
        for url in (None, "file:///private", "https://user:secret@example.com", "javascript:alert(1)"):
            self.assertEqual(self.upload("web", url=url).status_code, 422)
        self.assertEqual(self.upload("invented").status_code, 422)
        self.assertEqual(self.client.get(self.url).json(), [])


if __name__ == "__main__":
    unittest.main()
