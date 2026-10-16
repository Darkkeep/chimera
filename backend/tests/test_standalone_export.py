import io
import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from zipfile import ZipFile

from fastapi.testclient import TestClient

from backend.app import main, storage
from backend.app.models import ProjectCreate, SceneCreate
from backend.app.standalone import build_standalone_course
from backend.app.scorm import build_scorm_2004


class StandaloneExportTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.enterContext(patch.dict(os.environ, {}, clear=True))
        self.enterContext(patch.object(storage, "ROOT", Path(temporary.name)))
        self.enterContext(patch.object(storage, "PROJECTS", Path(temporary.name) / "projects"))
        self.enterContext(patch.object(main, "ROOT", Path(temporary.name)))

    def test_download_route_and_error_responses(self):
        project = storage.create_project(ProjectCreate(title="Download locally"))
        with TestClient(main.app) as client:
            self.assertEqual(client.get("/api/projects/missing/standalone.zip").status_code, 404)
            self.assertEqual(client.get(f"/api/projects/{project.id}/standalone.zip").status_code, 422)
            storage.create_scene(project.id, SceneCreate(title="Welcome", extractedText=["Local content"]))
            response = client.get(f"/api/projects/{project.id}/standalone.zip")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers["content-type"], "application/zip")
        self.assertIn("download-locally-standalone.zip", response.headers["content-disposition"])
        self.assertEqual(main.ROUTE_ACTIONS["export_standalone"], "project.export")
        with ZipFile(io.BytesIO(response.content)) as package:
            self.assertIn("course-data.js", package.namelist())

    def test_local_course_loads_published_data_without_fetch_or_manifest(self):
        project = storage.create_project(ProjectCreate(title="Local course"))
        project = storage.create_scene(project.id, SceneCreate(title="Introduction", extractedText=["Welcome."], notes="Private notes", actionDescription="Private production instructions"))
        content, filename = build_standalone_course(project)
        self.assertEqual(filename, "local-course-standalone.zip")
        with ZipFile(io.BytesIO(content)) as package:
            self.assertNotIn("imsmanifest.xml", package.namelist())
            html = package.read("index.html").decode()
            self.assertLess(html.index('src="course-data.js"'), html.index('src="player.js"'))
            data = package.read("course-data.js").decode()
            storyboard = json.loads(data.removeprefix("window.__CHIMERA_STORYBOARD = ").removesuffix(";\n"))
            self.assertEqual(storyboard["scenes"][0]["extractedText"], ["Welcome."])
            self.assertNotIn("notes", storyboard["scenes"][0])
            self.assertNotIn("actionDescription", storyboard["scenes"][0])
            self.assertIn("localCourse || await", package.read("player.js").decode())
            self.assertIn("open index.html", package.read("README.txt").decode())

    def test_empty_course_is_blocked_by_publication_validation(self):
        project = storage.create_project(ProjectCreate(title="Empty course"))
        with self.assertRaises(ValueError):
            build_standalone_course(project)

    def test_stale_revision_is_not_exported(self):
        project = storage.create_project(ProjectCreate(title="Revision check"))
        project = storage.create_scene(project.id, SceneCreate(title="Original"))
        storage.create_scene(project.id, SceneCreate(title="Newer scene"))
        with self.assertRaisesRegex(ValueError, "Storyboard changed"):
            build_standalone_course(project)

    def test_standalone_and_scorm_share_presentation_for_native_scenes_without_layouts(self):
        project = storage.create_project(ProjectCreate(title="Native presentation"))
        project = storage.create_scene(project.id, SceneCreate(title="Welcome", extractedText=["Course introduction."]))
        standalone, _ = build_standalone_course(project)
        scorm, _ = build_scorm_2004(project)
        with ZipFile(io.BytesIO(standalone)) as local_package, ZipFile(io.BytesIO(scorm)) as scorm_package:
            self.assertEqual(local_package.read("player.js"), scorm_package.read("player.js"))
            self.assertEqual(local_package.read("storyboard.json"), scorm_package.read("storyboard.json"))
            local_html = local_package.read("index.html").replace(b'<script src="course-data.js"></script>', b'')
            self.assertEqual(local_html, scorm_package.read("index.html"))
            self.assertIn(b'.native-slide', local_html)