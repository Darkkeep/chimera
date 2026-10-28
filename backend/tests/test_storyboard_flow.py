import base64
from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy
from threading import Event
import hashlib
import io
import json
import os
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path
from xml.etree import ElementTree as ET
from zipfile import ZIP_DEFLATED, ZipFile

from fastapi import HTTPException, UploadFile
from PIL import Image
from docx import Document
from pydantic import ValidationError
from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.opc.constants import RELATIONSHIP_TYPE as RT
from pptx.util import Inches
from unittest.mock import patch

from backend.app import backup, enhancement_jobs, main, media_generation, references, storage, word_export
from backend.app.models import AssessmentChoice, AssessmentPair, AssessmentSettings, AssetAttributionUpdate, CourseCompletionSettings, DragDropAssessment, EnhancementJobCreate, EnhancementProposalCreate, EnhancementProposalResult, ExportSettings, MatchingAssessment, MediaGenerationJobCreate, MultipleResponseAssessment, OrderingAssessment, ProjectCreate, ReviewCommentCreate, ReviewCommentDecision, ReviewReplyCreate, Scene, SceneCreate, SceneElement, SceneLayout, SceneOrder, SceneUpdate, ShortAnswerAssessment, SingleChoiceAssessment, Storyboard, TemplateUpdate, TrueFalseAssessment
from backend.app.render import render_slides
from backend.app.scorm import _compatibility_checks

def make_presentation() -> bytes:
    presentation = Presentation()
    slide = presentation.slides.add_slide(presentation.slide_layouts[6])
    title = slide.shapes.add_textbox(Inches(1), Inches(1), Inches(5), Inches(1))
    title_frame = title.text_frame
    assert title_frame is not None
    title_frame.text = "Inspection basics"
    body = slide.shapes.add_textbox(Inches(1), Inches(2), Inches(5), Inches(1))
    body_frame = body.text_frame
    assert body_frame is not None
    body_frame.text = "Check the equipment before use"
    image = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p0cAAAAASUVORK5CYII=")
    slide.shapes.add_picture(io.BytesIO(image), Inches(1), Inches(3))
    notes_frame = slide.notes_slide.notes_text_frame
    assert notes_frame is not None
    notes_frame.text = "Explain the inspection sequence"
    result = io.BytesIO()
    presentation.save(result)

    presentation_ns = "http://schemas.openxmlformats.org/presentationml/2006/main"
    relationships_ns = "http://schemas.openxmlformats.org/package/2006/relationships"
    content_types_ns = "http://schemas.openxmlformats.org/package/2006/content-types"
    ET.register_namespace("p", presentation_ns)
    ET.register_namespace("rel", relationships_ns)
    ET.register_namespace("ct", content_types_ns)
    packaged = io.BytesIO()
    with ZipFile(io.BytesIO(result.getvalue())) as source, ZipFile(packaged, "w", ZIP_DEFLATED) as target:
        for entry in source.infolist():
            content = source.read(entry.filename)
            if entry.filename == "ppt/slides/_rels/slide1.xml.rels":
                root = ET.fromstring(content)
                ET.SubElement(root, f"{{{relationships_ns}}}Relationship", {"Id": "rIdAudioTest", "Type": RT.AUDIO, "Target": "../media/audio1.mp3"})
                content = ET.tostring(root, encoding="utf-8", xml_declaration=True)
            elif entry.filename == "[Content_Types].xml":
                root = ET.fromstring(content)
                ET.SubElement(root, f"{{{content_types_ns}}}Default", {"Extension": "mp3", "ContentType": "audio/mpeg"})
                content = ET.tostring(root, encoding="utf-8", xml_declaration=True)
            elif entry.filename == "ppt/slides/slide1.xml":
                root = ET.fromstring(content)
                timing = ET.SubElement(root, f"{{{presentation_ns}}}timing")
                timing_list = ET.SubElement(timing, f"{{{presentation_ns}}}tnLst")
                parallel = ET.SubElement(timing_list, f"{{{presentation_ns}}}par")
                ET.SubElement(parallel, f"{{{presentation_ns}}}cTn", {"id": "1", "dur": "indefinite", "nodeType": "tmRoot"})
                transition = ET.Element(f"{{{presentation_ns}}}transition", {"spd": "med"})
                ET.SubElement(transition, f"{{{presentation_ns}}}fade")
                root.insert(len(root) - 1, transition)
                content = ET.tostring(root, encoding="utf-8", xml_declaration=True)
            target.writestr(entry, content)
        target.writestr("ppt/media/audio1.mp3", b"embedded-audio-fixture")
    return packaged.getvalue()


class StoryboardFlowTests(unittest.IsolatedAsyncioTestCase):
    def test_project_metadata_write_waits_for_project_reader_lock(self) -> None:
        project = storage.create_project(ProjectCreate(title="Metadata lock"))
        write_started = Event()
        write_finished = Event()

        def write_metadata():
            write_started.set()
            storage.write_project_metadata(storage.project_path(project.id), {"title": "Metadata saved"})
            write_finished.set()

        with ThreadPoolExecutor(max_workers=1) as executor:
            with storage._storyboard_write_lock:
                pending = executor.submit(write_metadata)
                self.assertTrue(write_started.wait(timeout=2))
                self.assertFalse(write_finished.wait(timeout=0.05))
            pending.result(timeout=2)
        self.assertEqual(storage.read_project(project.id).title, "Metadata saved")

    def test_project_read_waits_for_storyboard_write_transaction(self) -> None:
        project = storage.create_project(ProjectCreate(title="Concurrent read"))
        read_started = Event()
        read_finished = Event()

        def read():
            read_started.set()
            result = storage.read_project(project.id)
            read_finished.set()
            return result

        with ThreadPoolExecutor(max_workers=1) as executor:
            with storage.storyboard_transaction():
                pending = executor.submit(read)
                self.assertTrue(read_started.wait(timeout=2))
                self.assertFalse(read_finished.wait(timeout=0.05))
                storage.create_scene(project.id, SceneCreate(title="Saved while read waits"), expected_revision=project.storyboard.revision)
            self.assertEqual(pending.result(timeout=2).storyboard.scenes[0].title, "Saved while read waits")

    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.original_root = storage.ROOT
        self.original_projects = storage.PROJECTS
        storage.ROOT = Path(self.temp_dir.name)
        storage.PROJECTS = storage.ROOT / "projects"

    def tearDown(self) -> None:
        storage.ROOT = self.original_root
        storage.PROJECTS = self.original_projects
        self.temp_dir.cleanup()

    def test_cors_allows_localhost_and_loopback_frontend_origins(self) -> None:
        cors = next(middleware for middleware in main.app.user_middleware if middleware.cls.__name__ == "CORSMiddleware")
        self.assertEqual(
            set(cors.kwargs["allow_origins"]),
            {"http://localhost:5173", "http://127.0.0.1:5173"},
        )

    def test_storyboard_revision_increments_and_defaults_for_legacy_files(self) -> None:
        project = storage.create_project(ProjectCreate(title="Revision course"))
        initial_revision = project.storyboard.revision

        project = storage.create_scene(project.id, SceneCreate(title="First scene"))
        self.assertEqual(project.storyboard.revision, initial_revision + 1)
        scene = project.storyboard.scenes[0]
        project = storage.update_scene(project.id, scene.id, SceneUpdate(title="Updated scene"))
        self.assertEqual(project.storyboard.revision, initial_revision + 2)

        storyboard_path = storage.project_path(project.id) / "storyboard.json"
        legacy_storyboard = json.loads(storyboard_path.read_text(encoding="utf-8"))
        legacy_storyboard.pop("revision")
        storyboard_path.write_text(json.dumps(legacy_storyboard), encoding="utf-8")
        migrated = storage.read_project(project.id)
        self.assertEqual(migrated.storyboard.revision, 1)

        saved = storage.update_project_completion_settings(
            project.id,
            migrated.storyboard.completionSettings,
        )
        self.assertEqual(saved.storyboard.revision, 2)

    def test_stale_storyboard_write_does_not_change_storyboard_or_history(self) -> None:
        project = storage.create_project(ProjectCreate(title="Concurrent edit course"))
        stale_revision = project.storyboard.revision
        updated = storage.create_scene(project.id, SceneCreate(title="Saved by another editor"))
        path = storage.project_path(project.id)
        history_before = sorted((path / "history").glob("storyboard-*.json"))

        with self.assertRaises(storage.StoryboardRevisionConflict):
            storage.write_storyboard(path, project.storyboard, expected_revision=stale_revision)

        current = storage.read_project(project.id)
        self.assertEqual(current.storyboard.revision, updated.storyboard.revision)
        self.assertEqual(current.storyboard.scenes[0].title, "Saved by another editor")
        self.assertEqual(sorted((path / "history").glob("storyboard-*.json")), history_before)

    def test_stale_if_match_returns_precondition_failed(self) -> None:
        project = storage.create_project(ProjectCreate(title="Stale request course"))
        stale_etag = f'"{project.storyboard.revision}"'
        current = main.post_scene(project.id, SceneCreate(title="New scene"), if_match=stale_etag)

        with self.assertRaises(HTTPException) as raised:
            main.patch_project_completion_settings(
                project.id,
                current.storyboard.completionSettings,
                if_match=stale_etag,
            )

        self.assertEqual(raised.exception.status_code, 412)
        self.assertEqual(raised.exception.headers["ETag"], f'"{current.storyboard.revision}"')

    def test_project_mutation_routes_expose_if_match_header(self) -> None:
        operation = main.app.openapi()["paths"]["/api/projects/{project_id}/scenes/{scene_id}"]["patch"]
        headers = [parameter["name"] for parameter in operation.get("parameters", []) if parameter["in"] == "header"]
        self.assertIn("if-match", headers)

    async def test_stale_media_upload_is_rejected_before_persisting_file(self) -> None:
        project = storage.create_project(ProjectCreate(title="Stale media course"))
        stale_etag = f'"{project.storyboard.revision}"'
        current = storage.create_scene(project.id, SceneCreate(title="Newer scene"))
        assets_before = list((storage.project_path(project.id) / "assets").rglob("*"))

        with self.assertRaises(HTTPException) as raised:
            await main.post_project_asset(
                project.id,
                UploadFile(filename="unused.png", file=io.BytesIO(b"stale upload")),
                if_match=stale_etag,
            )

        self.assertEqual(raised.exception.status_code, 412)
        self.assertEqual(list((storage.project_path(project.id) / "assets").rglob("*")), assets_before)
        self.assertEqual(storage.read_project(project.id).storyboard.revision, current.storyboard.revision)

    async def test_import_separates_text_and_failed_replacement_preserves_deck(self) -> None:
        project = storage.create_project(ProjectCreate(title="Inspection course"))
        with patch("backend.app.main.render_slides", return_value=({}, "Slide preview unavailable: LibreOffice was not found.")):
            uploaded = await main.upload_source(
                project.id,
                UploadFile(filename="inspection.pptx", file=io.BytesIO(make_presentation())),
            )

        scene = uploaded.storyboard.scenes[0]
        self.assertEqual(scene.title, "Inspection basics")
        self.assertEqual(scene.extractedText, ["Check the equipment before use"])
        self.assertEqual(scene.notes, "Explain the inspection sequence")
        self.assertEqual(len(scene.imageAssets), 1)
        self.assertEqual(len(scene.audioAssets), 1)
        self.assertIsNone(scene.previewImage)
        self.assertIn("LibreOffice was not found", scene.renderWarning or "")
        self.assertIn("timing", scene.sourceAnimationXml or "")
        self.assertIn("transition", scene.sourceTransitionXml or "")
        self.assertEqual({asset.kind for asset in uploaded.storyboard.assets}, {"image", "audio"})
        for asset in uploaded.storyboard.assets:
            asset_path = storage.project_path(project.id) / asset.path
            self.assertTrue(asset_path.is_file())
            self.assertEqual(asset_path.stat().st_size, asset.sizeBytes)
        deck_path = storage.project_path(project.id) / "original" / "source-deck.pptx"
        original_bytes = deck_path.read_bytes()

        with self.assertRaises(HTTPException) as raised:
            await main.upload_source(
                project.id,
                UploadFile(filename="broken.pptx", file=io.BytesIO(b"not a presentation")),
            )

        self.assertEqual(raised.exception.status_code, 422)
        self.assertEqual(deck_path.read_bytes(), original_bytes)
        self.assertEqual(storage.read_project(project.id).storyboard.scenes[0].title, "Inspection basics")

    async def test_representative_storyboard_exports_same_learner_content_to_both_scorm_profiles(self) -> None:
        project = storage.create_project(ProjectCreate(title="Representative export course"))
        def render_fixture(_source: Path, staging_root: Path) -> tuple[dict[int, str], None]:
            preview_path = staging_root / "renders" / "slide-1.png"
            preview_path.parent.mkdir(parents=True, exist_ok=True)
            preview_path.write_bytes(b"representative-slide-preview")
            return {1: "renders/slide-1.png"}, None

        with patch("backend.app.main.render_slides", side_effect=render_fixture):
            project = await main.upload_source(
                project.id,
                UploadFile(filename="inspection.pptx", file=io.BytesIO(make_presentation())),
            )

        imported_scene = project.storyboard.scenes[0]
        image_id = imported_scene.imageAssets[0]
        project = storage.update_scene(
            project.id,
            imported_scene.id,
            SceneUpdate(
                actionDescription="Author-only direction for the inspection image.",
                imageAltText={image_id: "Technician checks the inspection equipment."},
            ),
        )
        native_scene = storage.create_scene(
            project.id,
            SceneCreate(title="Knowledge check", sceneType="assessment", required=False),
        ).storyboard.scenes[-1]
        assessment = SingleChoiceAssessment(
            identifier="ITEM_INSPECTION",
            prompt="What should be checked before use?",
            choices=[
                AssessmentChoice(identifier="EQUIPMENT", text="The equipment"),
                AssessmentChoice(identifier="ROOM", text="The room temperature"),
            ],
            correctResponse="EQUIPMENT",
        )
        project = storage.update_scene(
            project.id,
            native_scene.id,
            SceneUpdate(assessmentItem=assessment),
        )
        for asset in project.storyboard.assets:
            storage.update_project_asset_attribution(
                project.id,
                asset.id,
                AssetAttributionUpdate(attributionText="Chimera test fixture", attributionStatus="complete"),
            )

        exports = [main.export_scorm_2004(project.id), main.export_scorm_12(project.id)]
        snapshots = []
        for response in exports:
            with ZipFile(io.BytesIO(response.body)) as package:
                snapshot = json.loads(package.read("storyboard.json"))
                snapshots.append(snapshot)
                self.assertEqual(len(snapshot["scenes"]), 2)
                self.assertEqual(snapshot["scenes"][0]["extractedText"], ["Check the equipment before use"])
                self.assertNotIn("actionDescription", snapshot["scenes"][0])
                self.assertNotIn("notes", snapshot["scenes"][0])
                self.assertFalse(snapshot["scenes"][1]["required"])
                self.assertEqual(snapshot["scenes"][1]["assessmentItem"]["identifier"], "ITEM_INSPECTION")
                self.assertIsNone(snapshot["scenes"][0]["previewImage"])
                self.assertNotIn("renders/slide-1.png", package.namelist())
                self.assertTrue(any(name.endswith(".png") for name in package.namelist()))
                self.assertTrue(any(name.endswith(".mp3") for name in package.namelist()))
                player = package.read("player.js").decode("utf-8")
                self.assertIn("scene.previewImage", player)
                self.assertIn("Read slide text", player)

        self.assertEqual(snapshots[0], snapshots[1])

    @unittest.skipUnless(shutil.which("node"), "Node.js is required for generated runtime behavior tests")
    def test_optional_only_course_completion_matches_preview_in_both_scorm_profiles(self) -> None:
        project = storage.create_project(ProjectCreate(title="Optional-only course"))
        storage.create_scene(project.id, SceneCreate(title="Optional scene", required=False))
        harness = r'''const vm = require("node:vm");
const calls = [];
const api = {
  Initialize: () => "true", GetValue: () => "",
  SetValue: (key, value) => { calls.push([key, value]); return "true"; },
  Commit: () => "true", Terminate: () => "true",
  LMSInitialize: () => "true", LMSGetValue: () => "",
  LMSSetValue: (key, value) => { calls.push([key, value]); return "true"; },
  LMSCommit: () => "true", LMSFinish: () => "true"
};
const window = { API_1484_11: api, API: api, addEventListener: () => {} };
const nodes = new Map();
const document = {
  querySelector(selector) {
    if (selector === "#assessment-form" || selector === "[data-return-assessment]") return null;
    if (!nodes.has(selector)) nodes.set(selector, { textContent: "", innerHTML: "", disabled: false, addEventListener: () => {}, appendChild: () => {} });
    return nodes.get(selector);
  },
  createElement: () => ({ addEventListener: () => {}, appendChild: () => {}, setAttribute: () => {}, style: {}, remove: () => {} })
};
const fetch = async () => ({ json: async () => JSON.parse(process.env.CHIMERA_STORYBOARD) });
vm.runInNewContext(process.env.CHIMERA_PLAYER, { window, document, fetch, ResizeObserver: class { observe() {} disconnect() {} } });
setTimeout(() => console.log(JSON.stringify(calls)), 0);'''

        responses = [main.export_scorm_2004(project.id), main.export_scorm_12(project.id)]
        for response in responses:
            with ZipFile(io.BytesIO(response.body)) as package:
                environment = os.environ.copy()
                environment["CHIMERA_PLAYER"] = package.read("player.js").decode("utf-8")
                environment["CHIMERA_STORYBOARD"] = package.read("storyboard.json").decode("utf-8")
                result = subprocess.run(
                    [shutil.which("node") or "node", "-e", harness],
                    check=True,
                    capture_output=True,
                    text=True,
                    env=environment,
                )
            writes = json.loads(result.stdout.strip().splitlines()[-1])
            status_values = {key: value for key, value in writes if key in {"cmi.completion_status", "cmi.success_status", "cmi.core.lesson_status"}}
            if "cmi.completion_status" in status_values:
                self.assertEqual(status_values["cmi.completion_status"], "completed")
                self.assertEqual(status_values["cmi.success_status"], "passed")
            else:
                self.assertEqual(status_values["cmi.core.lesson_status"], "passed")

    def test_renderer_falls_back_when_libreoffice_is_missing(self) -> None:
        with patch("backend.app.render.find_libreoffice", return_value=None):
            previews, warning = render_slides(Path("deck.pptx"), Path(self.temp_dir.name))

        self.assertEqual(previews, {})
        self.assertIn("LibreOffice was not found", warning or "")

    def test_renderer_rasterizes_pdf_pages_to_png(self) -> None:
        import pymupdf

        source = Path(self.temp_dir.name) / "deck.pptx"
        output_root = Path(self.temp_dir.name) / "output"

        def write_mock_pdf(command: list[str], **_: object) -> object:
            output_dir = Path(command[6])
            document = pymupdf.open()
            document.new_page(width=100, height=80)
            document.save(output_dir / "deck.pdf")
            document.close()
            return type("Completed", (), {"returncode": 0, "stdout": "", "stderr": ""})()

        with patch("backend.app.render.find_libreoffice", return_value="soffice"), patch(
            "backend.app.render.subprocess.run", side_effect=write_mock_pdf
        ):
            previews, warning = render_slides(source, output_root)

        self.assertIsNone(warning)
        self.assertEqual(previews, {1: "renders/slide-001.png"})
        self.assertTrue((output_root / previews[1]).is_file())

    def test_reimport_replaces_existing_slide_preview(self) -> None:
        project = storage.create_project(ProjectCreate(title="Preview course"))
        scene = Scene(id="scene-001", sourceSlide=1, title="Slide one", previewImage="renders/slide-001.png")
        preview_image = scene.previewImage
        assert preview_image is not None
        destination = storage.project_path(project.id) / preview_image

        for index, content in enumerate((b"old preview", b"updated preview")):
            staging_root = Path(self.temp_dir.name) / f"staging-{index}"
            staged_preview = staging_root / preview_image
            staged_preview.parent.mkdir(parents=True, exist_ok=True)
            staged_preview.write_bytes(content)
            storage.persist_slide_previews(project.id, staging_root, [scene])

        self.assertEqual(destination.read_bytes(), b"updated preview")

    def test_blank_scene_is_appended_to_project(self) -> None:
        project = storage.create_project(ProjectCreate(title="Blank course"))

        updated = storage.create_scene(project.id, SceneCreate(title="Welcome"))

        self.assertEqual(len(updated.storyboard.scenes), 1)
        self.assertEqual(updated.storyboard.scenes[0].title, "Welcome")
        self.assertEqual(updated.storyboard.scenes[0].layoutMode, "native")
        self.assertEqual(updated.storyboard.scenes[0].extractedText, [])

    def test_scene_audio_required_setting_persists_and_validation_checks_attachment(self) -> None:
        project = storage.create_project(ProjectCreate(title="Required audio course"))
        project = storage.create_scene(project.id, SceneCreate(title="Narration", audioRequired=True))
        scene = project.storyboard.scenes[0]

        self.assertTrue(scene.audioRequired)
        exported = json.loads(main.export_storyboard(project.id).body)
        self.assertTrue(exported["scenes"][0]["audioRequired"])
        self.assertIn("required-audio-missing", {issue.code for issue in main.get_project_validation(project.id).issues})

        updated = storage.update_scene(project.id, scene.id, SceneUpdate(audioRequired=False))
        self.assertFalse(updated.storyboard.scenes[0].audioRequired)
        self.assertNotIn("required-audio-missing", {issue.code for issue in main.get_project_validation(project.id).issues})

    def test_qti_21_single_choice_export_and_assessment_validation(self) -> None:
        project = storage.create_project(ProjectCreate(title="QTI item course"))
        project = storage.create_scene(project.id, SceneCreate(title="Knowledge check", sceneType="assessment"))
        scene = project.storyboard.scenes[0]

        self.assertIn("missing-assessment-item", {issue.code for issue in main.get_project_validation(project.id).issues})
        question = SingleChoiceAssessment(
            identifier="ITEM_CHECK_1",
            prompt="Which action should happen first?",
            choices=[
                {"identifier": "CHOICE_A", "text": "Inspect the equipment"},
                {"identifier": "CHOICE_B", "text": "Start the equipment"},
            ],
            correctResponse="CHOICE_A",
            correctFeedback="Correct. Inspect before use.",
            incorrectFeedback="Review the inspection sequence.",
        )
        project = main.patch_scene(project.id, scene.id, SceneUpdate(assessmentItem=question))
        self.assertEqual(project.storyboard.scenes[0].assessmentItem, question)
        self.assertNotIn("missing-assessment-item", {issue.code for issue in main.get_project_validation(project.id).issues})

        response = main.export_qti_assessment_item(project.id, scene.id)
        root = ET.fromstring(response.body)
        namespace = "{http://www.imsglobal.org/xsd/imsqti_v2p1}"
        self.assertEqual(root.tag, f"{namespace}assessmentItem")
        self.assertEqual(root.attrib["identifier"], "ITEM_CHECK_1")
        self.assertEqual(root.find(f"{namespace}responseDeclaration/{namespace}correctResponse/{namespace}value").text, "CHOICE_A")
        self.assertEqual(len(root.findall(f".//{namespace}choiceInteraction/{namespace}simpleChoice")), 2)
        self.assertIsNotNone(root.find(f"{namespace}responseProcessing/{namespace}responseCondition"))
        self.assertEqual(len(root.findall(f"{namespace}modalFeedback")), 2)
        self.assertEqual(root.find(f"{namespace}modalFeedback[@identifier='correct']").text, "Correct. Inspect before use.")
        self.assertEqual(response.media_type, "application/xml")

        configured = main.patch_scene(
            project.id,
            scene.id,
            SceneUpdate(assessmentSettings=AssessmentSettings(maxAttempts=3, passingScore=80)),
        )
        self.assertEqual(configured.storyboard.scenes[0].assessmentSettings.maxAttempts, 3)
        self.assertEqual(configured.storyboard.scenes[0].assessmentSettings.passingScore, 80)
        qti_body = main.export_qti_assessment_item(project.id, scene.id).body
        self.assertNotIn(b"maxAttempts", qti_body)
        self.assertNotIn(b"passingScore", qti_body)

    def test_assessment_settings_reject_out_of_range_values(self) -> None:
        with self.assertRaises(ValidationError):
            AssessmentSettings(maxAttempts=0, passingScore=80)
        with self.assertRaises(ValidationError):
            AssessmentSettings(maxAttempts=11, passingScore=80)
        with self.assertRaises(ValidationError):
            AssessmentSettings(maxAttempts=2, passingScore=0)
        with self.assertRaises(ValidationError):
            AssessmentSettings(maxAttempts=2, passingScore=101)

    def test_course_completion_settings_round_trip(self) -> None:
        project = storage.create_project(ProjectCreate(title="Completion policy"))
        self.assertEqual(project.storyboard.completionSettings, CourseCompletionSettings())
        settings = CourseCompletionSettings(passingScore=75, includeOptionalAssessments=True)
        updated = main.patch_project_completion_settings(project.id, settings)
        self.assertEqual(updated.storyboard.completionSettings, settings)
        exported = json.loads(main.export_storyboard(project.id).body)
        self.assertEqual(exported["completionSettings"]["passingScore"], 75)
        imported = main.import_storyboard(project.id, Storyboard.model_validate(exported))
        self.assertEqual(imported.storyboard.completionSettings, settings)
        with self.assertRaises(ValidationError):
            CourseCompletionSettings(passingScore=101)

    def test_assessment_weight_and_remediation_target_validation(self) -> None:
        project = storage.create_project(ProjectCreate(title="Remediation"))
        project = storage.create_scene(project.id, SceneCreate(title="Knowledge check", sceneType="assessment"))
        project = storage.create_scene(project.id, SceneCreate(title="Review lesson"))
        question_scene, remediation_scene = project.storyboard.scenes
        updated = main.patch_scene(
            project.id,
            question_scene.id,
            SceneUpdate(assessmentSettings=AssessmentSettings(scoreWeight=2.5, remediationSceneId=remediation_scene.id)),
        )
        settings = updated.storyboard.scenes[0].assessmentSettings
        self.assertEqual(settings.scoreWeight, 2.5)
        self.assertEqual(settings.remediationSceneId, remediation_scene.id)
        with self.assertRaises(HTTPException) as raised:
            main.patch_scene(
                project.id,
                question_scene.id,
                SceneUpdate(assessmentSettings=AssessmentSettings(remediationSceneId=question_scene.id)),
            )
        self.assertEqual(raised.exception.status_code, 422)
        with self.assertRaises(ValidationError):
            AssessmentSettings(scoreWeight=0)

    def test_enhancement_proposals_require_approval_and_reject_stale_changes(self) -> None:
        project = storage.create_project(ProjectCreate(title="Proposal approval"))
        project = storage.create_scene(project.id, SceneCreate(title="Scene one", actionDescription="Current direction"))
        scene = project.storyboard.scenes[0]
        proposal = main.post_enhancement_proposal(project.id, EnhancementProposalCreate(
            targetSceneId=scene.id,
            proposedValue="Point to the diagram, then highlight the inspection step.",
            rationale="Clarifies the visual action for learners.",
            origin="ai",
            provider="test-provider",
            model="test-model",
        ))
        self.assertEqual(proposal.status, "pending")
        self.assertEqual(storage.read_project(project.id).storyboard.scenes[0].actionDescription, "Current direction")
        exported = json.loads(main.export_storyboard(project.id).body)
        self.assertNotIn("enhancementProposals", exported)

        rejected = main.post_enhancement_proposal_decision(
            project.id,
            proposal.id,
            main.EnhancementProposalDecision(decision="reject"),
            if_match=f'"{project.storyboard.revision}"',
        )
        self.assertEqual(rejected.proposal.status, "rejected")
        self.assertIsNone(rejected.project)
        self.assertEqual(storage.read_project(project.id).storyboard.scenes[0].actionDescription, "Current direction")

        accepted_proposal = main.post_enhancement_proposal(project.id, EnhancementProposalCreate(
            targetSceneId=scene.id,
            proposedValue="Show the diagram before highlighting the inspection step.",
            rationale="Provides a clearer sequence.",
        ))
        accepted = main.post_enhancement_proposal_decision(
            project.id,
            accepted_proposal.id,
            main.EnhancementProposalDecision(decision="accept"),
            if_match=f'"{storage.read_project(project.id).storyboard.revision}"',
        )
        self.assertEqual(accepted.proposal.status, "accepted")
        self.assertEqual(accepted.project.storyboard.scenes[0].actionDescription, accepted_proposal.proposedValue)
        self.assertTrue(list((storage.project_path(project.id) / "history").glob("storyboard-*.json")))

        stale_proposal = main.post_enhancement_proposal(project.id, EnhancementProposalCreate(
            targetSceneId=scene.id,
            proposedValue="A stale alternative action description.",
            rationale="Test conflict handling.",
        ))
        main.patch_scene(project.id, scene.id, SceneUpdate(actionDescription="Author edited this after the proposal."))
        with self.assertRaises(HTTPException) as raised:
            main.post_enhancement_proposal_decision(
                project.id,
                stale_proposal.id,
                main.EnhancementProposalDecision(decision="accept"),
                if_match=f'"{storage.read_project(project.id).storyboard.revision}"',
            )
        self.assertEqual(raised.exception.status_code, 409)
        self.assertEqual(storage.list_enhancement_proposals(project.id)[-1].status, "stale")
        self.assertEqual(storage.read_project(project.id).storyboard.scenes[0].actionDescription, "Author edited this after the proposal.")

    def test_enhancement_proposal_acceptance_is_atomic_and_revision_bound(self) -> None:
        project = storage.create_project(ProjectCreate(title="Atomic proposal"))
        project = storage.create_scene(project.id, SceneCreate(title="Scene one", actionDescription="Current direction"))
        scene = project.storyboard.scenes[0]
        proposal = main.post_enhancement_proposal(project.id, EnhancementProposalCreate(
            changes=[
                {"targetSceneId": scene.id, "field": "actionDescription", "proposedValue": "Updated direction"},
                {"targetSceneId": scene.id, "field": "narration", "proposedValue": "Narrate the updated direction."},
            ],
            rationale="Align the narration and production direction.",
            referenceCitations=[{"resourceId": "guide-1", "version": "2", "locator": "p. 4"}],
        ))
        self.assertEqual(proposal.sourceRevision, project.storyboard.revision)
        self.assertEqual(proposal.affectedIds, [scene.id])
        self.assertEqual(len(proposal.changes), 2)
        overlapping = main.post_enhancement_proposal(project.id, EnhancementProposalCreate(
            targetSceneId=scene.id,
            proposedValue="An alternative direction.",
            rationale="A competing alternative.",
        ))

        with self.assertRaises(HTTPException) as missing_header:
            main.post_enhancement_proposal_decision(
                project.id,
                proposal.id,
                main.EnhancementProposalDecision(decision="accept"),
            )
        self.assertEqual(missing_header.exception.status_code, 428)

        accepted = main.post_enhancement_proposal_decision(
            project.id,
            proposal.id,
            main.EnhancementProposalDecision(decision="accept", changes=[
                {"targetSceneId": scene.id, "field": "actionDescription", "proposedValue": "Author-edited direction"},
                {"targetSceneId": scene.id, "field": "narration", "proposedValue": "Author-edited narration."},
            ]),
            if_match=f'"{project.storyboard.revision}"',
        )
        self.assertEqual(accepted.proposal.status, "accepted")
        self.assertEqual(accepted.project.storyboard.revision, project.storyboard.revision + 1)
        updated_scene = accepted.project.storyboard.scenes[0]
        self.assertEqual(updated_scene.actionDescription, "Author-edited direction")
        self.assertEqual(updated_scene.narration, "Author-edited narration.")
        self.assertEqual(accepted.proposal.changes[0].proposedValue, "Author-edited direction")
        self.assertEqual(accepted.proposal.decisionHistory[-1].expectedRevision, project.storyboard.revision)
        self.assertEqual(storage.list_enhancement_proposals(project.id)[-1].id, overlapping.id)
        self.assertEqual(storage.list_enhancement_proposals(project.id)[-1].status, "superseded")

        stale = main.post_enhancement_proposal(project.id, EnhancementProposalCreate(
            targetSceneId=scene.id,
            proposedValue="A different direction",
            rationale="Check the expected revision.",
        ))
        stale_revision = storage.read_project(project.id).storyboard.revision
        storage.update_scene(project.id, scene.id, SceneUpdate(notes="An intervening author edit."))
        with self.assertRaises(HTTPException) as revision_mismatch:
            main.post_enhancement_proposal_decision(
                project.id,
                stale.id,
                main.EnhancementProposalDecision(decision="accept"),
                if_match=f'"{stale_revision}"',
            )
        self.assertEqual(revision_mismatch.exception.status_code, 412)
        self.assertEqual(storage.list_enhancement_proposals(project.id)[-1].status, "pending")

    def test_enhancement_proposal_reversal_preserves_later_edits(self) -> None:
        project = storage.create_project(ProjectCreate(title="Proposal reversal"))
        project = storage.create_scene(project.id, SceneCreate(title="Scene one", actionDescription="Original"))
        scene = project.storyboard.scenes[0]
        proposal = main.post_enhancement_proposal(project.id, EnhancementProposalCreate(
            targetSceneId=scene.id,
            proposedValue="Accepted value",
            rationale="Test reversible acceptance.",
        ))
        accepted = main.post_enhancement_proposal_decision(
            project.id,
            proposal.id,
            main.EnhancementProposalDecision(decision="accept"),
            if_match=f'"{project.storyboard.revision}"',
        )
        reversed_result = main.post_enhancement_proposal_decision(
            project.id,
            proposal.id,
            main.EnhancementProposalDecision(decision="reverse"),
            if_match=f'"{accepted.project.storyboard.revision}"',
        )
        self.assertEqual(reversed_result.proposal.status, "reversed")
        self.assertEqual(reversed_result.project.storyboard.scenes[0].actionDescription, "Original")
        self.assertEqual(reversed_result.proposal.decisionHistory[-1].decision, "reverse")

        next_proposal = main.post_enhancement_proposal(project.id, EnhancementProposalCreate(
            targetSceneId=scene.id,
            proposedValue="Another accepted value",
            rationale="Check reversal conflict handling.",
        ))
        current = storage.read_project(project.id)
        next_accepted = main.post_enhancement_proposal_decision(
            project.id,
            next_proposal.id,
            main.EnhancementProposalDecision(decision="accept"),
            if_match=f'"{current.storyboard.revision}"',
        )
        edited = storage.update_scene(project.id, scene.id, SceneUpdate(actionDescription="Later author edit"))
        with self.assertRaises(HTTPException) as conflict:
            main.post_enhancement_proposal_decision(
                project.id,
                next_proposal.id,
                main.EnhancementProposalDecision(decision="reverse"),
                if_match=f'"{edited.storyboard.revision}"',
            )
        self.assertEqual(conflict.exception.status_code, 409)
        self.assertEqual(storage.read_project(project.id).storyboard.scenes[0].actionDescription, "Later author edit")
        self.assertEqual(storage.list_enhancement_proposals(project.id)[-1].status, "accepted")

    def test_enhancement_proposal_concurrent_decisions_apply_once(self) -> None:
        project = storage.create_project(ProjectCreate(title="Concurrent proposal"))
        project = storage.create_scene(project.id, SceneCreate(title="Scene one", actionDescription="Original"))
        scene = project.storyboard.scenes[0]
        proposal = main.post_enhancement_proposal(project.id, EnhancementProposalCreate(
            targetSceneId=scene.id,
            proposedValue="Accepted once",
            rationale="Check concurrent approval.",
        ))

        def accept_proposal() -> EnhancementProposalResult | HTTPException:
            try:
                return main.post_enhancement_proposal_decision(
                    project.id,
                    proposal.id,
                    main.EnhancementProposalDecision(decision="accept"),
                    if_match=f'"{project.storyboard.revision}"',
                )
            except HTTPException as error:
                return error

        with ThreadPoolExecutor(max_workers=2) as executor:
            results = list(executor.map(lambda _: accept_proposal(), range(2)))
        self.assertEqual(sum(isinstance(result, main.EnhancementProposalResult) for result in results), 1)
        self.assertEqual(storage.read_project(project.id).storyboard.revision, project.storyboard.revision + 1)
        self.assertEqual(storage.read_project(project.id).storyboard.scenes[0].actionDescription, "Accepted once")

    def test_enhancement_proposal_commit_failure_rolls_back_storyboard(self) -> None:
        project = storage.create_project(ProjectCreate(title="Proposal commit rollback"))
        project = storage.create_scene(project.id, SceneCreate(title="Scene one", actionDescription="Original"))
        scene = project.storyboard.scenes[0]
        proposal = main.post_enhancement_proposal(project.id, EnhancementProposalCreate(
            targetSceneId=scene.id,
            proposedValue="Should roll back",
            rationale="Exercise the second-file failure path.",
        ))

        with patch.object(storage, "_write_enhancement_proposals", side_effect=OSError("proposal disk failure")):
            with self.assertRaises(OSError):
                storage.decide_enhancement_proposal(
                    project.id,
                    proposal.id,
                    "accept",
                    project.storyboard.revision,
                )

        restored = storage.read_project(project.id)
        self.assertEqual(restored.storyboard.revision, project.storyboard.revision)
        self.assertEqual(restored.storyboard.scenes[0].actionDescription, "Original")
        self.assertEqual(storage.list_enhancement_proposals(project.id)[0].status, "pending")

    def test_enhancement_job_generates_grounded_pending_proposal_without_mutating_storyboard(self) -> None:
        project = storage.create_project(ProjectCreate(title="Grounded enhancement"))
        project = storage.create_scene(project.id, SceneCreate(title="Inspection", actionDescription="Original action"))
        scene = project.storyboard.scenes[0]
        content = b"Always inspect the pressure gauge before opening the valve.\nDo not inspect the pressure gauge before opening the valve."
        passages, status, message = references.extract_reference_passages("guide.txt", content)
        self.assertEqual(status, "complete")
        self.assertIsNone(message)
        resource = storage.save_reference_resource(
            project.id, "guide.txt", "Safety guide", "study-guide", True, [scene.id], content,
            "text/plain", passages, status, message,
        )
        first_version = resource.currentVersion
        data = EnhancementJobCreate(scope="selected-scenes", sceneIds=[scene.id], goal="Improve the action description.", resourceIds=[resource.id])
        preview = enhancement_jobs.preview_enhancement_submission(project.id, data)
        self.assertEqual(preview["resourceCount"], 1)
        self.assertEqual(preview["payload"]["references"][0]["version"], first_version)
        job = storage.create_enhancement_job(project.id, data)
        self.assertEqual(job.resourceVersions[resource.id], first_version)

        updated_resource = storage.save_reference_resource(
            project.id, "guide.txt", "Safety guide", "study-guide", True, [scene.id], content + b" Updated.",
            "text/plain", passages + [references.ReferencePassage(locator="line:3", text="Updated.")], status, message,
            resource_id=resource.id,
        )
        self.assertEqual(updated_resource.currentVersion, "2")

        class FakeProvider:
            name = "fake"
            model = "fake-test"

            def generate(self, payload: dict[str, object]) -> dict[str, object]:
                return {"proposals": [{
                    "changes": [{"targetSceneId": scene.id, "field": "actionDescription", "proposedValue": "Inspect the gauge before opening the valve."}],
                    "rationale": "Makes the required order explicit.",
                    "referenceCitations": [{
                        "resourceId": resource.id,
                        "version": "1",
                        "locator": "line:1",
                        "excerpt": "Always inspect the pressure gauge before opening the valve.",
                    }],
                }], "resourceConflicts": [{
                    "explanation": "The same guide gives opposite instructions about inspection order.",
                    "citations": [
                        {"resourceId": resource.id, "version": "1", "locator": "line:1", "excerpt": "Always inspect the pressure gauge before opening the valve."},
                        {"resourceId": resource.id, "version": "1", "locator": "line:2", "excerpt": "Do not inspect the pressure gauge before opening the valve."},
                    ],
                }]}

        with patch.object(enhancement_jobs, "_provider_factory", return_value=FakeProvider()):
            enhancement_jobs._run_job(project.id, job.id)

        finished_job = storage.read_enhancement_job(project.id, job.id)
        self.assertEqual(finished_job.status, "completed")
        self.assertEqual(len(finished_job.proposalIds), 1)
        proposal = storage.list_enhancement_proposals(project.id)[0]
        self.assertEqual(proposal.status, "pending")
        self.assertEqual(proposal.referenceCitations[0].version, "1")
        self.assertEqual(proposal.referenceCitations[0].locator, "line:1")
        self.assertEqual(len(finished_job.resourceConflicts), 1)
        self.assertEqual(len(finished_job.resourceConflicts[0].citations), 2)
        self.assertEqual(storage.read_project(project.id).storyboard.scenes[0].actionDescription, "Original action")

    def test_enhancement_job_rejects_unverified_citations_and_allows_retry(self) -> None:
        project = storage.create_project(ProjectCreate(title="Invalid grounding"))
        project = storage.create_scene(project.id, SceneCreate(title="Inspection", actionDescription="Original"))
        scene = project.storyboard.scenes[0]
        passages, status, message = references.extract_reference_passages("guide.txt", b"Use approved equipment.")
        resource = storage.save_reference_resource(project.id, "guide.txt", "Guide", "supporting-document", False, [], b"Use approved equipment.", "text/plain", passages, status, message)
        job = storage.create_enhancement_job(project.id, EnhancementJobCreate(scope="selected-scenes", sceneIds=[scene.id], goal="Improve", resourceIds=[resource.id]))

        class InvalidCitationProvider:
            name = "fake"
            model = "bad-citation"

            def generate(self, payload: dict[str, object]) -> list[dict[str, object]]:
                return [{
                    "changes": [{"targetSceneId": scene.id, "field": "actionDescription", "proposedValue": "A suggestion."}],
                    "rationale": "A factual claim.",
                    "referenceCitations": [{"resourceId": resource.id, "version": "1", "locator": "page:99", "excerpt": "Not submitted."}],
                }]

        with patch.object(enhancement_jobs, "_provider_factory", return_value=InvalidCitationProvider()):
            enhancement_jobs._run_job(project.id, job.id)
        failed = storage.read_enhancement_job(project.id, job.id)
        self.assertEqual(failed.status, "failed")
        self.assertIn("locator", failed.error)
        self.assertEqual(storage.list_enhancement_proposals(project.id), [])
        self.assertEqual(storage.read_project(project.id).storyboard.scenes[0].actionDescription, "Original")

        updated_passages, updated_status, updated_message = references.extract_reference_passages("guide.txt", b"A replacement reference.")
        storage.save_reference_resource(project.id, "guide.txt", "Guide", "supporting-document", False, [], b"A replacement reference.", "text/plain", updated_passages, updated_status, updated_message, resource_id=resource.id)
        cancelled = storage.create_enhancement_job(project.id, EnhancementJobCreate(scope="selected-scenes", sceneIds=[scene.id], goal="Retry safely."))
        cancelled = storage.update_enhancement_job(project.id, cancelled.id, resourceIds=[resource.id], resourceVersions={resource.id: "1"})
        cancelled = enhancement_jobs.cancel_enhancement_job(project.id, cancelled.id)
        self.assertEqual(cancelled.status, "cancelled")
        with patch.object(enhancement_jobs, "start_enhancement_job") as start_job:
            retried = enhancement_jobs.retry_enhancement_job(project.id, cancelled.id)
        self.assertEqual(retried.status, "queued")
        self.assertEqual(retried.retryOf, cancelled.id)
        self.assertEqual(retried.resourceVersions[resource.id], "1")
        start_job.assert_called_once_with(project.id, retried.id)
        self.assertEqual(storage.read_project(project.id).storyboard.scenes[0].actionDescription, "Original")

    def test_enhancement_job_discards_output_if_storyboard_changes_during_provider_call(self) -> None:
        project = storage.create_project(ProjectCreate(title="Stale enhancement run"))
        project = storage.create_scene(project.id, SceneCreate(title="Inspection", actionDescription="Original"))
        scene = project.storyboard.scenes[0]
        job = storage.create_enhancement_job(project.id, EnhancementJobCreate(
            scope="selected-scenes", sceneIds=[scene.id], goal="Improve clarity.",
        ))

        class EditingProvider:
            name = "fake"
            model = "revision-race"

            def generate(self, payload: dict[str, object]) -> list[dict[str, object]]:
                storage.update_scene(project.id, scene.id, SceneUpdate(actionDescription="Author edit during provider call"))
                return [{
                    "changes": [{"targetSceneId": scene.id, "field": "actionDescription", "proposedValue": "Stale suggestion"}],
                    "rationale": "Should be discarded after the revision changes.",
                }]

        with patch.object(enhancement_jobs, "_provider_factory", return_value=EditingProvider()):
            enhancement_jobs._run_job(project.id, job.id)
        failed = storage.read_enhancement_job(project.id, job.id)
        self.assertEqual(failed.status, "failed")
        self.assertIn("No proposals were saved", failed.error)
        self.assertEqual(storage.list_enhancement_proposals(project.id), [])
        self.assertEqual(storage.read_project(project.id).storyboard.scenes[0].actionDescription, "Author edit during provider call")

    def test_media_generation_stores_candidate_before_explicit_placement_approval(self) -> None:
        project = storage.create_project(ProjectCreate(title="Generated media"))
        project = storage.create_scene(project.id, SceneCreate(title="Inspection"))
        scene = project.storyboard.scenes[0]
        job = storage.create_media_generation_job(project.id, MediaGenerationJobCreate(
            kind="image", sceneId=scene.id, purpose="Show the inspection", prompt="A clear inspection diagram", altText="Inspection diagram",
        ))

        class FakeMediaProvider:
            name = "fake-media"
            image_model = "image-test"
            audio_model = "audio-test"

            def generate_image(self, _job):
                return b"generated-image", "image/png", self.image_model

            def generate_narration(self, _job):
                return b"generated-audio", "audio/mpeg", self.audio_model

        with patch.object(media_generation, "_provider_factory", return_value=FakeMediaProvider()):
            media_generation._run_job(project.id, job.id)

        finished = storage.read_media_generation_job(project.id, job.id)
        self.assertEqual(finished.status, "completed")
        candidate = storage.list_generated_candidates(project.id)[0]
        self.assertEqual(candidate.status, "pending")
        unchanged = storage.read_project(project.id)
        self.assertEqual(unchanged.storyboard.revision, project.storyboard.revision)
        self.assertEqual(unchanged.storyboard.scenes[0].imageAssets, [])

        approved = main.post_generated_candidate_approval(project.id, candidate.id, if_match=f'"{unchanged.storyboard.revision}"')
        self.assertEqual(approved.proposal.status, "pending")
        self.assertEqual(storage.read_generated_candidate(project.id, candidate.id).status, "approved")
        after_asset_approval = storage.read_project(project.id)
        self.assertEqual(after_asset_approval.storyboard.scenes[0].imageAssets, [])
        self.assertEqual(len(after_asset_approval.storyboard.assets), 1)

    def test_review_threads_survive_replies_resolution_reorder_and_scene_deletion(self) -> None:
        project = storage.create_project(ProjectCreate(title="Playback review"))
        project = storage.create_scene(project.id, SceneCreate(title="First scene"))
        first_scene = project.storyboard.scenes[0]
        project = storage.create_scene(project.id, SceneCreate(title="Second scene"))
        second_scene = project.storyboard.scenes[1]
        comment = main.post_review_comment(project.id, ReviewCommentCreate(sceneId=first_scene.id, authorLabel="Reviewer", body="The opening needs a clearer example."))
        reply = main.post_review_reply(project.id, comment.id, ReviewReplyCreate(authorLabel="Author", body="I will revise this in the next pass."))
        self.assertEqual(len(reply.replies), 1)
        resolved = main.post_review_comment_decision(project.id, comment.id, ReviewCommentDecision(resolved=True))
        self.assertTrue(resolved.resolved)
        reopened = main.post_review_comment_decision(project.id, comment.id, ReviewCommentDecision(resolved=False))
        self.assertFalse(reopened.resolved)

        reordered = storage.reorder_scenes(project.id, [second_scene.id, first_scene.id])
        after_reorder = main.get_review_comments(project.id)[0]
        self.assertEqual(after_reorder.sceneId, first_scene.id)
        self.assertTrue(after_reorder.outdated)
        self.assertFalse(after_reorder.sceneDeleted)
        self.assertEqual(reordered.storyboard.scenes[0].id, second_scene.id)

        storage.delete_scene(project.id, first_scene.id)
        after_delete = main.get_review_comments(project.id)[0]
        self.assertTrue(after_delete.sceneDeleted)
        self.assertEqual(after_delete.sceneTitle, "First scene")
        self.assertEqual(after_delete.replies[0].body, "I will revise this in the next pass.")

    def test_project_backup_round_trip_and_invalid_restore_are_safe(self) -> None:
        project = storage.create_project(ProjectCreate(title="Portable course"))
        project = storage.create_scene(project.id, SceneCreate(title="Original scene"))
        storage.add_project_asset(project.id, "diagram.png", b"image-bytes", "image")
        archive = backup.build_project_archive(project.id)
        with ZipFile(io.BytesIO(archive)) as packaged:
            manifest = json.loads(packaged.read("manifest.json"))
            self.assertEqual(manifest["schema"], "chimera-project-1")
            self.assertIn("storyboard.json", {item["path"] for item in manifest["files"]})
            self.assertIn("assets/images/image-" + hashlib.sha256(b"image-bytes").hexdigest() + ".png", {item["path"] for item in manifest["files"]})

        storage.update_scene(project.id, project.storyboard.scenes[0].id, SceneUpdate(title="Changed after backup"))
        restored = backup.restore_project_archive(project.id, archive)
        self.assertEqual(restored.storyboard.scenes[0].title, "Original scene")
        self.assertEqual(len(restored.storyboard.assets), 1)
        current = storage.read_project(project.id)
        with self.assertRaises(ValueError):
            backup.restore_project_archive(project.id, b"not a zip archive")
        self.assertEqual(storage.read_project(project.id).storyboard.scenes[0].title, current.storyboard.scenes[0].title)

    def test_assessment_question_types_validate_and_legacy_items_migrate(self) -> None:
        choices = [AssessmentChoice(identifier="A", text="First"), AssessmentChoice(identifier="B", text="Second")]
        questions = [
            SingleChoiceAssessment(identifier="Q_SINGLE", prompt="Choose one", choices=choices, correctResponse="A"),
            MultipleResponseAssessment(identifier="Q_MULTI", prompt="Choose all", choices=choices, correctResponses=["A", "B"]),
            TrueFalseAssessment(identifier="Q_TF", prompt="True or false", correctResponse="true"),
            OrderingAssessment(identifier="Q_ORDER", prompt="Order these", choices=choices, correctOrder=["B", "A"]),
            DragDropAssessment(
                identifier="Q_DRAG",
                prompt="Place each label",
                draggables=choices,
                targets=[AssessmentChoice(identifier="T1", text="Target one")],
                correctMatches=[AssessmentPair(sourceIdentifier="A", targetIdentifier="T1")],
            ),
            MatchingAssessment(
                identifier="Q_MATCH",
                prompt="Match these",
                leftItems=choices,
                rightItems=[{"identifier": "C", "text": "Third"}, {"identifier": "D", "text": "Fourth"}],
                correctMatches=[
                    AssessmentPair(sourceIdentifier="A", targetIdentifier="D"),
                    AssessmentPair(sourceIdentifier="B", targetIdentifier="C"),
                ],
            ),
            ShortAnswerAssessment(identifier="Q_SHORT", prompt="Enter the term", acceptedAnswers=["Answer"]),
        ]
        for question in questions:
            scene = Scene.model_validate({"id": question.identifier, "title": "Assessment", "assessmentItem": question.model_dump()})
            self.assertEqual(scene.assessmentItem.type, question.type)

        legacy = Scene.model_validate({
            "id": "legacy-assessment",
            "title": "Legacy question",
            "assessmentItem": {
                "identifier": "ITEM_LEGACY",
                "prompt": "Legacy prompt",
                "choices": [{"identifier": "A", "text": "Yes"}, {"identifier": "B", "text": "No"}],
                "correctResponse": "A",
            },
        })
        self.assertEqual(legacy.assessmentItem.type, "single-choice")
        self.assertEqual(SceneUpdate(assessmentItem={
            "identifier": "ITEM_UPDATE",
            "prompt": "Legacy update",
            "choices": [{"identifier": "A", "text": "Yes"}, {"identifier": "B", "text": "No"}],
            "correctResponse": "A",
        }).assessmentItem.type, "single-choice")
        with self.assertRaises(ValidationError):
            MultipleResponseAssessment(identifier="Q_BAD", prompt="Choose all", choices=choices, correctResponses=["MISSING"])

    def test_qti_21_exports_each_assessment_interaction(self) -> None:
        project = storage.create_project(ProjectCreate(title="Question types"))
        question_data = [
            ("Single", SingleChoiceAssessment(identifier="ITEM_SINGLE", prompt="Pick one", choices=[{"identifier": "A", "text": "One"}, {"identifier": "B", "text": "Two"}], correctResponse="A"), "choiceInteraction", "single", "identifier"),
            ("Multiple", MultipleResponseAssessment(identifier="ITEM_MULTI", prompt="Pick many", choices=[{"identifier": "A", "text": "One"}, {"identifier": "B", "text": "Two"}], correctResponses=["A", "B"]), "choiceInteraction", "multiple", "identifier"),
            ("True false", TrueFalseAssessment(identifier="ITEM_TF", prompt="Is it true?", correctResponse="true"), "choiceInteraction", "single", "identifier"),
            ("Ordering", OrderingAssessment(identifier="ITEM_ORDER", prompt="Arrange these", choices=[{"identifier": "A", "text": "One"}, {"identifier": "B", "text": "Two"}], correctOrder=["B", "A"]), "orderInteraction", "ordered", "identifier"),
            ("Drag drop", DragDropAssessment(identifier="ITEM_DRAG", prompt="Place these", draggables=[{"identifier": "D1", "text": "Drag one"}, {"identifier": "D2", "text": "Drag two"}], targets=[{"identifier": "T1", "text": "Target one"}], correctMatches=[{"sourceIdentifier": "D1", "targetIdentifier": "T1"}]), "associateInteraction", "multiple", "directedPair"),
            ("Matching", MatchingAssessment(identifier="ITEM_MATCH", prompt="Match these", leftItems=[{"identifier": "L1", "text": "Left one"}, {"identifier": "L2", "text": "Left two"}], rightItems=[{"identifier": "R1", "text": "Right one"}, {"identifier": "R2", "text": "Right two"}], correctMatches=[{"sourceIdentifier": "L1", "targetIdentifier": "R2"}, {"sourceIdentifier": "L2", "targetIdentifier": "R1"}]), "matchInteraction", "multiple", "directedPair"),
            ("Fill-in-the-blank", ShortAnswerAssessment(identifier="ITEM_SHORT", prompt="Name the item", acceptedAnswers=["Answer", "response"]), "textEntryInteraction", "single", "string"),
        ]
        expected_package_paths = {"imsmanifest.xml", "assessmentTest.xml"}
        namespace = "{http://www.imsglobal.org/xsd/imsqti_v2p1}"
        for title, question, interaction_name, cardinality, base_type in question_data:
            project = storage.create_scene(project.id, SceneCreate(title=title, sceneType="assessment"))
            scene = project.storyboard.scenes[-1]
            project = main.patch_scene(project.id, scene.id, SceneUpdate(assessmentItem=question))
            response = main.export_qti_assessment_item(project.id, scene.id)
            root = ET.fromstring(response.body)
            interaction = root.find(f".//{namespace}{interaction_name}")
            self.assertIsNotNone(interaction, question.type)
            response_declaration = root.find(f"{namespace}responseDeclaration[@identifier='RESPONSE']")
            self.assertEqual(response_declaration.attrib["cardinality"], cardinality)
            self.assertEqual(response_declaration.attrib["baseType"], base_type)
            expected_package_paths.add(f"items/{question.identifier}.xml")
            if question.type == "short-answer":
                self.assertEqual(len(root.findall(f".//{namespace}responseIf/{namespace}or/{namespace}stringMatch")), 2)
                self.assertIsNone(root.find(f"{namespace}itemBody/{namespace}textEntryInteraction"))
                self.assertIsNotNone(root.find(f"{namespace}itemBody/{namespace}p/{namespace}textEntryInteraction"))
                self.assertEqual(root.find(f"{namespace}itemBody/{namespace}p/{namespace}span").text, question.prompt)
                self.assertEqual([value.text for value in response_declaration.findall(f"{namespace}correctResponse/{namespace}value")], ["Answer"])
                self.assertEqual([value.text for value in root.findall(f".//{namespace}stringMatch/{namespace}baseValue")], question.acceptedAnswers)

        package_response = main.export_qti_assessment_test(project.id)
        with ZipFile(io.BytesIO(package_response.body)) as package:
            self.assertEqual(set(package.namelist()), expected_package_paths)

    def test_qti_21_assessment_test_package_aggregates_items(self) -> None:
        project = storage.create_project(ProjectCreate(title="Safety assessment"))
        project = storage.create_scene(project.id, SceneCreate(title="First question", sceneType="assessment"))
        project = storage.create_scene(project.id, SceneCreate(title="Second question", sceneType="assessment"))
        first_scene, second_scene = project.storyboard.scenes
        project = main.patch_scene(project.id, first_scene.id, SceneUpdate(assessmentItem=SingleChoiceAssessment(
            identifier="ITEM_FIRST",
            prompt="First prompt?",
            choices=[{"identifier": "A", "text": "Yes"}, {"identifier": "B", "text": "No"}],
            correctResponse="A",
        )))
        project = main.patch_scene(project.id, second_scene.id, SceneUpdate(assessmentItem=SingleChoiceAssessment(
            identifier="ITEM_SECOND",
            prompt="Second prompt?",
            choices=[{"identifier": "A", "text": "Yes"}, {"identifier": "B", "text": "No"}],
            correctResponse="B",
        )))

        response = main.export_qti_assessment_test(project.id)
        with ZipFile(io.BytesIO(response.body)) as package:
            self.assertEqual(set(package.namelist()), {
                "imsmanifest.xml",
                "assessmentTest.xml",
                "items/ITEM_FIRST.xml",
                "items/ITEM_SECOND.xml",
            })
            namespace = "{http://www.imsglobal.org/xsd/imsqti_v2p1}"
            test = ET.fromstring(package.read("assessmentTest.xml"))
            self.assertEqual(test.tag, f"{namespace}assessmentTest")
            score_outcome = test.find(f"{namespace}outcomeDeclaration[@identifier='SCORE']")
            self.assertIsNotNone(score_outcome)
            self.assertEqual(score_outcome.attrib["normalMaximum"], "2")
            references = test.findall(f".//{namespace}assessmentItemRef")
            self.assertEqual([ref.attrib["href"] for ref in references], [
                "items/ITEM_FIRST.xml",
                "items/ITEM_SECOND.xml",
            ])
            self.assertIsNotNone(test.find(
                f"{namespace}outcomeProcessing/{namespace}setOutcomeValue/{namespace}sum/{namespace}testVariables"
            ))
            manifest_namespace = "{http://www.imsglobal.org/xsd/imscp_v1p1}"
            manifest = ET.fromstring(package.read("imsmanifest.xml"))
            self.assertEqual(len(manifest.findall(f".//{manifest_namespace}resource[@type='imsqti_item_xmlv2p1']")), 2)
            self.assertEqual(len(manifest.findall(f".//{manifest_namespace}dependency")), 2)
        self.assertEqual(response.media_type, "application/zip")
        self.assertIn("safety-assessment-assessment.qti.zip", response.headers["content-disposition"])
        self.assertEqual(main.export_qti_assessment_item(project.id, first_scene.id).media_type, "application/xml")

    def test_scorm_2004_export_contains_manifest_player_and_build_report(self) -> None:
        project = storage.create_project(ProjectCreate(title="SCORM course"))
        project = storage.create_scene(project.id, SceneCreate(
            title="Welcome",
            extractedText=["Learner-facing content"],
            actionDescription="Author-only production direction",
            notes="Author-only speaker notes",
        ))

        response = main.export_scorm_2004(project.id)

        self.assertEqual(response.media_type, "application/zip")
        with ZipFile(io.BytesIO(response.body)) as package:
            self.assertEqual(package.namelist()[:3], ["imsmanifest.xml", "index.html", "player.js"])
            self.assertIn("storyboard.json", package.namelist())
            exported_storyboard = json.loads(package.read("storyboard.json"))
            exported_scene = exported_storyboard["scenes"][0]
            self.assertEqual(exported_scene["extractedText"], ["Learner-facing content"])
            self.assertNotIn("actionDescription", exported_scene)
            self.assertNotIn("notes", exported_scene)
            manifest = ET.fromstring(package.read("imsmanifest.xml"))
            namespace = "{http://www.imsproject.org/xsd/imscp_rootv1p1p2}"
            resource = manifest.find(f".//{namespace}resource")
            self.assertIsNotNone(resource)
            assert resource is not None
            self.assertEqual(resource.attrib["href"], "index.html")
            self.assertEqual(resource.attrib["{http://www.adlnet.org/xsd/adlcp_v1p3}scormType"], "sco")
            player = package.read("player.js").decode("utf-8")
            self.assertIn("assessmentCorrect", player)
            self.assertIn("completedAudio", player)
            self.assertIn("cmi.success_status", player)
            self.assertNotIn("scene.actionDescription", player)
            self.assertNotIn("scene.notes", player)
            self.assertIn("runtime-status", package.read("index.html").decode("utf-8"))
            self.assertIn("Media could not be loaded", player)
        saved_scene = storage.read_project(project.id).storyboard.scenes[0]
        self.assertEqual(saved_scene.id, project.storyboard.scenes[0].id)
        self.assertEqual(saved_scene.actionDescription, "Author-only production direction")
        self.assertEqual(saved_scene.notes, "Author-only speaker notes")
        report = json.loads((storage.project_path(project.id) / "reports" / "build-scorm2004.json").read_text(encoding="utf-8"))
        self.assertEqual(report["exportProfile"], "SCORM 2004 4th Edition")
        self.assertEqual(report["sourceRevision"], exported_storyboard["revision"])
        self.assertEqual(report["buildStatus"], "passed")
        self.assertEqual(report["packageWarningThresholdMB"], 200)
        self.assertGreater(report["uncompressedSizeBytes"], report["packageSizeBytes"])
        self.assertTrue(all(check["passed"] for check in report["compatibilityChecks"]))
        self.assertEqual(
            {check["name"] for check in report["compatibilityChecks"]},
            {
                "manifest-at-root",
                "manifest-parseable",
                "exactly-one-sco",
                "required-player-files",
                "manifest-references-packaged",
                "no-external-manifest-references",
                "runtime-profile-token",
            },
        )

        updated = main.patch_project_export_settings(project.id, ExportSettings(packageWarningThresholdMB=1))
        self.assertEqual(updated.storyboard.exportSettings.packageWarningThresholdMB, 1)
        rebuilt = main.export_scorm_2004(project.id)
        rebuilt_report = json.loads((storage.project_path(project.id) / "reports" / "build-scorm2004.json").read_text(encoding="utf-8"))
        self.assertEqual(rebuilt_report["packageWarningThresholdMB"], 1)
        self.assertEqual(rebuilt.media_type, "application/zip")
        report_response = main.get_scorm_report(project.id, "scorm2004")
        self.assertEqual(report_response.status_code, 200)
        self.assertEqual(json.loads(report_response.body)["packageWarningThresholdMB"], 1)
        self.assertIn("runtime-status", __import__("backend.app.scorm", fromlist=["PLAYER_HTML"]).PLAYER_HTML)

    def test_scorm_2004_export_rejects_invalid_production_project(self) -> None:
        project = storage.create_project(ProjectCreate(title="Empty SCORM course"))

        with self.assertRaises(HTTPException) as raised:
            main.export_scorm_2004(project.id)

        self.assertEqual(raised.exception.status_code, 422)

    def test_docx_export_is_editable_and_answer_key_is_explicit(self) -> None:
        project = storage.create_project(ProjectCreate(title="Editable storyboard"))
        project = storage.create_scene(project.id, SceneCreate(
            title="Inspection: café",
            extractedText=["Learner text with Unicode: naïve façade.\x00 Safe continuation."],
            actionDescription="Production direction for the author.",
            notes="Speaker notes for the author.",
        ))
        scene = project.storyboard.scenes[0]
        image_buffer = io.BytesIO()
        Image.new("RGB", (12, 8), color=(25, 100, 180)).save(image_buffer, format="PNG")
        project = storage.add_project_asset(project.id, "inspection.png", image_buffer.getvalue(), "image")
        image = project.storyboard.assets[0]
        project = storage.add_project_asset(project.id, "narration.mp3", b"audio-reference", "audio")
        for asset in project.storyboard.assets:
            project = storage.update_project_asset_attribution(
                project.id,
                asset.id,
                AssetAttributionUpdate(attributionText="Test fixture credit", attributionStatus="complete"),
            )
        project = storage.update_scene(
            project.id,
            scene.id,
            SceneUpdate(
                imageAssets=[image.id],
                imageAltText={image.id: "Inspection equipment in use."},
                audioAssets=[project.storyboard.assets[-1].id],
                assessmentItem=SingleChoiceAssessment(
                    identifier="ITEM_CHECK",
                    prompt="What is inspected?",
                    choices=[
                        AssessmentChoice(identifier="EQUIPMENT", text="The equipment"),
                        AssessmentChoice(identifier="WEATHER", text="The weather"),
                    ],
                    correctResponse="EQUIPMENT",
                    correctFeedback="Correct: inspect the equipment.",
                ),
            ),
        )

        response = main.export_storyboard_docx(project.id)
        self.assertEqual(response.media_type, "application/vnd.openxmlformats-officedocument.wordprocessingml.document")
        self.assertIn("editable-storyboard-storyboard.docx", response.headers["content-disposition"])
        document = Document(io.BytesIO(response.body))
        paragraphs = [paragraph.text for paragraph in document.paragraphs]
        all_text = "\n".join(paragraphs + [cell.text for table in document.tables for row in table.rows for cell in row.cells])
        self.assertTrue(any("revision" in text.lower() and str(project.storyboard.revision) in text for text in paragraphs))
        self.assertIn("Inspection: café", all_text)
        self.assertIn("Learner text with Unicode: naïve façade. Safe continuation.", all_text)
        self.assertIn("Production direction for the author.", all_text)
        self.assertIn("Speaker notes for the author.", all_text)
        self.assertIn("Inspection equipment in use.", all_text)
        self.assertIn("Test fixture credit", all_text)
        self.assertIn("narration.mp3", all_text)
        self.assertIn("What is inspected?", all_text)
        self.assertIn("The equipment", all_text)
        self.assertNotIn("Answer key", all_text)
        self.assertTrue(any("Scene ID" in cell.text for table in document.tables for row in table.rows for cell in row.cells))
        media_table = next(table for table in document.tables if len(table.columns) == 5 and table.rows[0].cells[1].text == "Preview")
        available_width = document.sections[0].page_width - document.sections[0].left_margin - document.sections[0].right_margin
        self.assertEqual(sum(column.width for column in media_table.columns), available_width)
        image_row = next(row for row in media_table.rows[1:] if "inspection.png" in row.cells[2].text)
        self.assertTrue(image_row.cells[1]._tc.xpath(".//w:drawing"))
        extent = image_row.cells[1]._tc.xpath(".//wp:extent")[0]
        self.assertLessEqual(int(extent.get("cx")), Inches(0.55))
        self.assertLessEqual(int(extent.get("cy")), Inches(0.42))
        with ZipFile(io.BytesIO(response.body)) as package:
            self.assertTrue(any(name.startswith("word/media/") for name in package.namelist()))

        answer_key_response = main.export_storyboard_docx(project.id, include_answer_key=True)
        answer_key_document = Document(io.BytesIO(answer_key_response.body))
        answer_key_text = "\n".join(paragraph.text for paragraph in answer_key_document.paragraphs)
        self.assertIn("Answer key", answer_key_text)
        self.assertIn("The equipment", answer_key_text)
        saved_text = storage.read_project(project.id).storyboard.scenes[0].extractedText[0]
        self.assertIn("\x00", saved_text)

        sme_response = main.export_sme_storyboard_docx(project.id)
        self.assertIn("editable-storyboard-sme-master.docx", sme_response.headers["content-disposition"])
        sme_document = Document(io.BytesIO(sme_response.body))
        self.assertGreater(sme_document.sections[0].page_width, sme_document.sections[0].page_height)
        sme_text = "\n".join(paragraph.text for paragraph in sme_document.paragraphs)
        sme_text += "\n" + "\n".join(cell.text for table in sme_document.tables for row in table.rows for cell in row.cells)
        self.assertIn("SME Master - Editable storyboard", sme_text)
        self.assertIn("WHAT THE LEARNER SEES", sme_text)
        self.assertIn("WHAT THEY HEAR", sme_text)
        self.assertIn("Inspection: café", sme_text)
        self.assertIn("Learner text with Unicode: naïve façade. Safe continuation.", sme_text)
        self.assertNotIn("Answer key", sme_text)
        title_run = sme_document.tables[0].cell(0, 0).paragraphs[0].runs[0]
        self.assertEqual(title_run.font.name, "Bitstream Charter")
        self.assertEqual(str(title_run.font.color.rgb), "17283D")
        label_run = sme_document.tables[3].cell(0, 0).paragraphs[0].runs[0]
        self.assertEqual(str(label_run.font.color.rgb), "365B83")
        visual_cell = sme_document.tables[3].cell(0, 0).tables[0].cell(0, 0)
        self.assertEqual(visual_cell._tc.xpath("./w:tcPr/w:shd/@w:fill"), ["FFFFFF"])
        self.assertEqual(visual_cell._tc.xpath("./w:tcPr/w:tcBorders/w:top/@w:color"), ["CCD4DD"])
        sme_drawings = sme_document._element.body.xpath(".//w:drawing")
        self.assertEqual(len(sme_drawings), 2)
        self.assertEqual(len(visual_cell._tc.xpath(".//w:drawing")), 1)
        self.assertLessEqual(sme_document.inline_shapes[-1].width, Inches(0.55))
        self.assertLessEqual(sme_document.inline_shapes[-1].height, Inches(0.42))

        background_path = Path(self.temp_dir.name) / "master-background.png"
        Image.new("RGB", (48, 30), color=(255, 255, 255)).save(background_path)
        with patch("backend.app.word_export._extract_master_artwork", return_value=background_path):
            full_response = main.export_full_storyboard_docx(project.id)
        self.assertIn("editable-storyboard-full-storyboard.docx", full_response.headers["content-disposition"])
        full_document = Document(io.BytesIO(full_response.body))
        landscape_sections = [section for section in full_document.sections if section.page_width > section.page_height]
        self.assertEqual(len(landscape_sections), 1)
        landscape_section = landscape_sections[0]
        self.assertTrue(landscape_section.header._element.xpath(".//wp:anchor[@behindDoc='1']"))
        self.assertFalse(full_document.sections[-1].header.is_linked_to_previous)
        self.assertFalse(full_document.sections[-1].header._element.xpath(".//wp:anchor[@behindDoc='1']"))
        self.assertGreater(full_document.sections[-1].page_height, full_document.sections[-1].page_width)
        full_text = "\n".join(paragraph.text for paragraph in full_document.paragraphs)
        full_text += "\n" + "\n".join(cell.text for table in full_document.tables for row in table.rows for cell in row.cells)
        self.assertIn("Multimedia Instructional Storyboard Template", full_text)
        self.assertIn("Structured handoff field contract", full_text)
        self.assertIn("SME Master - Editable storyboard", full_text)
        self.assertIn("Detailed Chimera scene records", full_text)
        self.assertIn("Inspection: café", full_text)

        with patch("backend.app.word_export._extract_master_artwork", side_effect=word_export.TemplateArtworkError("Master art render failed")):
            with self.assertRaises(HTTPException) as unavailable:
                main.export_sme_storyboard_docx(project.id)
        self.assertEqual(unavailable.exception.status_code, 503)

        with self.assertRaises(HTTPException) as missing:
            main.export_storyboard_docx("missing-project")
        self.assertEqual(missing.exception.status_code, 404)

    def test_sme_master_artwork_is_extracted_and_used_as_page_background(self) -> None:
        presentation = Presentation(str(word_export.SME_TEMPLATE_PATH))
        source_slide = presentation.slides[1]
        artwork_shape = next(shape for shape in source_slide.shapes if not getattr(shape, "text", "").strip())
        master = presentation.slide_masters[0]
        master.shapes._spTree.insert_element_before(deepcopy(artwork_shape._element), "p:extLst")

        with tempfile.TemporaryDirectory() as temporary:
            temporary_path = Path(temporary)
            template_path = temporary_path / "master-template.pptx"
            presentation.save(template_path)
            render_root = temporary_path / "rendered"

            def render_master_only(source: Path, output_root: Path):
                sanitized = Presentation(str(source))
                self.assertTrue(all(not slide.shapes for slide in sanitized.slides))
                self.assertEqual(len(sanitized.slide_masters[0].shapes), 1)
                image_path = output_root / "renders" / "slide-002.png"
                image_path.parent.mkdir(parents=True)
                Image.new("RGB", (48, 30), color=(255, 255, 255)).save(image_path)
                return {2: "renders/slide-002.png"}, None

            with patch("backend.app.word_export.render_slides", side_effect=render_master_only):
                artwork = word_export._extract_master_artwork(template_path, 1, render_root)

            self.assertIsNotNone(artwork)
            document = Document()
            word_export._set_section_artwork(document.sections[0], artwork)
            output = io.BytesIO()
            document.save(output)
            reopened = Document(io.BytesIO(output.getvalue()))
            self.assertTrue(reopened.sections[0].header._element.xpath(".//wp:anchor[@behindDoc='1']"))
            with ZipFile(io.BytesIO(output.getvalue())) as package:
                self.assertIn("word/media/image1.png", package.namelist())

    def test_scorm_build_aborts_if_storyboard_changes_during_package_assembly(self) -> None:
        project = storage.create_project(ProjectCreate(title="Changing SCORM course"))
        project = storage.create_scene(project.id, SceneCreate(title="Welcome"))
        scene = project.storyboard.scenes[0]
        from backend.app import scorm

        serialize_storyboard = scorm._published_storyboard_json

        def serialize_then_edit(snapshot) -> bytes:
            content = serialize_storyboard(snapshot)
            storage.update_scene(snapshot.id, scene.id, SceneUpdate(title="Changed during build"))
            return content

        with patch("backend.app.scorm._published_storyboard_json", side_effect=serialize_then_edit):
            with self.assertRaises(HTTPException) as raised:
                main.export_scorm_2004(project.id)

        self.assertEqual(raised.exception.status_code, 422)
        self.assertFalse((storage.project_path(project.id) / "reports" / "build-scorm2004.json").exists())

    def test_scorm_12_export_uses_legacy_runtime_and_manifest(self) -> None:
        project = storage.create_project(ProjectCreate(title="Compatibility course"))
        storage.create_scene(project.id, SceneCreate(
            title="Welcome",
            extractedText=["Learner-facing content"],
            actionDescription="Author-only production direction",
            notes="Author-only speaker notes",
        ))

        response = main.export_scorm_12(project.id)

        self.assertEqual(response.media_type, "application/zip")
        self.assertIn("compatibility-course-scorm12.zip", response.headers["content-disposition"])
        with ZipFile(io.BytesIO(response.body)) as package:
            manifest = ET.fromstring(package.read("imsmanifest.xml"))
            namespace = "{http://www.imsproject.org/xsd/imscp_rootv1p1p2}"
            resource = manifest.find(f".//{namespace}resource")
            self.assertIsNotNone(resource)
            assert resource is not None
            self.assertEqual(resource.attrib["{http://www.adlnet.org/xsd/adlcp_rootv1p2}scormtype"], "sco")
            exported_storyboard = json.loads(package.read("storyboard.json"))
            exported_scene = exported_storyboard["scenes"][0]
            self.assertEqual(exported_scene["extractedText"], ["Learner-facing content"])
            self.assertNotIn("actionDescription", exported_scene)
            self.assertNotIn("notes", exported_scene)
            player = package.read("player.js").decode("utf-8")
            self.assertIn("view.API", player)
            self.assertIn("LMSInitialize", player)
            self.assertIn("LMSSetValue", player)
            self.assertIn('SetValue: "LMSSetValue"', player)
            self.assertIn("cmi.core.lesson_status", player)
            self.assertIn("cmi.core.lesson_location", player)
            self.assertNotIn("cmi.success_status", player)
            self.assertNotIn("scene.actionDescription", player)
            self.assertNotIn("scene.notes", player)
        report = json.loads((storage.project_path(project.id) / "reports" / "build-scorm12.json").read_text(encoding="utf-8"))
        self.assertEqual(report["exportProfile"], "SCORM 1.2")
        self.assertEqual(report["sourceRevision"], exported_storyboard["revision"])
        self.assertTrue(all(check["passed"] for check in report["compatibilityChecks"]))

    def test_scorm_qualification_detects_missing_manifest_target(self) -> None:
        project = storage.create_project(ProjectCreate(title="Qualification course"))
        storage.create_scene(project.id, SceneCreate(title="Welcome"))
        response = main.export_scorm_2004(project.id)
        corrupted = io.BytesIO()
        manifest_namespace = "{http://www.imsproject.org/xsd/imscp_rootv1p1p2}"
        with ZipFile(io.BytesIO(response.body)) as source, ZipFile(corrupted, "w", ZIP_DEFLATED) as target:
            for entry in source.infolist():
                content = source.read(entry.filename)
                if entry.filename == "imsmanifest.xml":
                    manifest = ET.fromstring(content)
                    resource = manifest.find(f".//{manifest_namespace}resource")
                    assert resource is not None
                    ET.SubElement(resource, f"{manifest_namespace}file", {"href": "missing.bin"})
                    content = ET.tostring(manifest, encoding="utf-8", xml_declaration=True)
                target.writestr(entry, content)

        checks = _compatibility_checks(corrupted.getvalue(), "SCORM 2004 4th Edition")
        self.assertFalse(next(check["passed"] for check in checks if check["name"] == "manifest-references-packaged"))

    @unittest.skipUnless(shutil.which("node"), "Node.js is required for generated runtime syntax validation")
    def test_scorm_generated_runtimes_pass_node_syntax_check(self) -> None:
        project = storage.create_project(ProjectCreate(title="Runtime syntax course"))
        storage.create_scene(project.id, SceneCreate(title="Welcome"))
        for response in (main.export_scorm_2004(project.id), main.export_scorm_12(project.id)):
            with ZipFile(io.BytesIO(response.body)) as package:
                runtime = package.read("player.js").decode("utf-8")
            result = subprocess.run(
                [shutil.which("node") or "node", "--check"],
                input=runtime,
                text=True,
                capture_output=True,
                check=False,
            )
            self.assertEqual(result.returncode, 0, result.stderr)

    def test_qti_21_assessment_test_requires_multiple_items(self) -> None:
        project = storage.create_project(ProjectCreate(title="One question"))
        with self.assertRaises(HTTPException) as error:
            main.export_qti_assessment_test(project.id)
        self.assertEqual(error.exception.status_code, 422)

    def test_storyboard_json_export_and_import_preserve_identity_and_history(self) -> None:
        project = storage.create_project(ProjectCreate(title="Transfer course"))
        project = storage.create_scene(project.id, SceneCreate(title="Before import"))

        exported = main.export_storyboard(project.id)
        exported_data = json.loads(exported.body)
        self.assertEqual(exported.status_code, 200)
        self.assertEqual(exported.headers["content-disposition"], 'attachment; filename="transfer-course-storyboard.json"')
        self.assertEqual(exported_data["projectId"], project.id)
        self.assertEqual(exported_data["scenes"][0]["title"], "Before import")

        replacement = Storyboard(
            schemaVersion="1.0",
            projectId="another-project",
            title="Imported title is not the project name",
            scenes=[Scene(id="imported-scene", title="Restored scene")],
        )
        imported = main.import_storyboard(project.id, replacement)

        self.assertEqual(imported.id, project.id)
        self.assertEqual(imported.title, "Transfer course")
        self.assertEqual(imported.storyboard.projectId, project.id)
        self.assertEqual([scene.title for scene in imported.storyboard.scenes], ["Restored scene"])
        snapshots = list((storage.project_path(project.id) / "history").glob("storyboard-*.json"))
        self.assertTrue(snapshots)
        matching = [json.loads(snapshot.read_text(encoding="utf-8")) for snapshot in snapshots]
        matching = [snapshot for snapshot in matching if snapshot["revision"] == project.storyboard.revision]
        self.assertEqual(len(matching), 1)
        previous = matching[0]
        self.assertEqual(previous["scenes"][0]["title"], "Before import")

    def test_storyboard_import_rejects_missing_assets_without_changing_project(self) -> None:
        project = storage.create_project(ProjectCreate(title="Missing import asset"))
        project = storage.create_scene(project.id, SceneCreate(title="Image scene"))
        project = storage.add_project_asset(project.id, "diagram.png", b"image fixture", "image")
        scene = project.storyboard.scenes[0]
        asset = project.storyboard.assets[0]
        project = storage.update_scene(project.id, scene.id, SceneUpdate(imageAssets=[asset.id]))
        (storage.project_path(project.id) / asset.path).unlink()

        with self.assertRaises(HTTPException) as raised:
            main.import_storyboard(project.id, project.storyboard)

        self.assertEqual(raised.exception.status_code, 422)
        current = storage.read_project(project.id)
        self.assertEqual(current.storyboard.scenes[0].id, scene.id)
        self.assertEqual(current.storyboard.scenes[0].imageAssets, [asset.id])

    def test_validation_reports_empty_storyboard_and_legacy_scene_issues(self) -> None:
        project = storage.create_project(ProjectCreate(title="Validation course"))

        empty_report = main.get_project_validation(project.id)
        self.assertFalse(empty_report.passed)
        self.assertEqual([issue.code for issue in empty_report.issues], ["no-scenes"])

        project = storage.create_scene(project.id, SceneCreate(title="Valid scene"))
        storyboard_path = storage.project_path(project.id) / "storyboard.json"
        storyboard_data = json.loads(storyboard_path.read_text(encoding="utf-8"))
        storyboard_data["scenes"][0].update({
            "title": " ",
            "layoutMode": "template",
            "templateId": "missing-template",
            "imageAssets": ["missing-image"],
        })
        storyboard_path.write_text(json.dumps(storyboard_data), encoding="utf-8")

        report = main.get_project_validation(project.id)
        self.assertFalse(report.passed)
        self.assertEqual(
            {issue.code for issue in report.issues},
            {"missing-scene-title", "unresolved-template", "invalid-asset-reference"},
        )
        self.assertTrue(all(issue.sceneId == project.storyboard.scenes[0].id for issue in report.issues))

    def test_validation_reports_missing_asset_file(self) -> None:
        project = storage.create_project(ProjectCreate(title="Missing asset course"))
        project = storage.create_scene(project.id, SceneCreate(title="Media scene"))
        project = storage.add_project_asset(project.id, "diagram.png", b"image fixture", "image")
        scene = project.storyboard.scenes[0]
        asset = project.storyboard.assets[0]
        asset_path = storage.project_path(project.id) / asset.path
        asset_path.unlink()
        storage.update_scene(project.id, scene.id, SceneUpdate(imageAssets=[asset.id]))

        report = main.get_project_validation(project.id)

        self.assertFalse(report.passed)
        self.assertEqual(
            {issue.code for issue in report.issues},
            {"missing-image-alt-text", "missing-asset-file"},
        )

    def test_image_accessibility_metadata_satisfies_validation(self) -> None:
        project = storage.create_project(ProjectCreate(title="Accessible images"))
        project = storage.create_scene(project.id, SceneCreate(title="Diagram"))
        project = storage.add_project_asset(project.id, "equipment.png", b"image fixture", "image")
        scene = project.storyboard.scenes[0]
        asset = project.storyboard.assets[0]
        project = storage.update_scene(project.id, scene.id, SceneUpdate(imageAssets=[asset.id]))

        missing_alt_report = main.get_project_validation(project.id)
        self.assertEqual([issue.code for issue in missing_alt_report.issues], ["missing-image-alt-text"])

        project = storage.update_scene(
            project.id,
            scene.id,
            SceneUpdate(imageAltText={asset.id: "A technician checking a pressure gauge."}),
        )
        self.assertNotIn("missing-image-alt-text", {issue.code for issue in main.get_project_validation(project.id).issues})

        with self.assertRaises(ValueError):
            storage.update_scene(project.id, scene.id, SceneUpdate(imageAltText={"unattached-image": "Description"}))

        project = storage.update_scene(
            project.id,
            scene.id,
            SceneUpdate(imageAltText={}, decorativeImages=[asset.id]),
        )
        self.assertNotIn("missing-image-alt-text", {issue.code for issue in main.get_project_validation(project.id).issues})

        project = storage.update_scene(project.id, scene.id, SceneUpdate(imageAssets=[]))
        self.assertEqual(project.storyboard.scenes[0].imageAltText, {})
        self.assertEqual(project.storyboard.scenes[0].decorativeImages, [])

    def test_scene_patch_persists_fields_and_archives_previous_storyboard(self) -> None:
        project = storage.create_project(ProjectCreate(title="Editable course"))
        project = storage.create_scene(project.id, SceneCreate(title="Before edit"))
        scene = project.storyboard.scenes[0]

        updated = main.patch_scene(
            project.id,
            scene.id,
            SceneUpdate(
                title="Introduction",
                extractedText=["Welcome to the course", "Review the objectives"],
                layoutMode="hybrid",
                required=False,
                notes="Introduce the material",
                actionDescription="Point to the inspection diagram as it appears.",
            ),
        )

        edited_scene = updated.storyboard.scenes[0]
        self.assertEqual(edited_scene.title, "Introduction")
        self.assertEqual(edited_scene.extractedText, ["Welcome to the course", "Review the objectives"])
        self.assertEqual(edited_scene.layoutMode, "hybrid")
        self.assertFalse(edited_scene.required)
        self.assertEqual(edited_scene.notes, "Introduce the material")
        self.assertEqual(edited_scene.actionDescription, "Point to the inspection diagram as it appears.")
        exported = json.loads(main.export_storyboard(project.id).body)
        self.assertEqual(exported["scenes"][0]["actionDescription"], "Point to the inspection diagram as it appears.")
        snapshots = sorted((storage.project_path(project.id) / "history").glob("storyboard-*.json"))
        previous_storyboard = json.loads(snapshots[-1].read_text(encoding="utf-8"))
        self.assertEqual(previous_storyboard["scenes"][0]["title"], "Before edit")

    def test_scene_type_layout_and_order_are_persisted(self) -> None:
        project = storage.create_project(ProjectCreate(title="Sequenced course"))
        project = storage.create_scene(project.id, SceneCreate(title="First", sceneType="title", layoutMode="fidelity"))
        project = storage.create_scene(project.id, SceneCreate(title="Second", sceneType="assessment", layoutMode="hybrid"))
        first, second = project.storyboard.scenes

        reordered = main.put_scene_order(project.id, SceneOrder(sceneIds=[second.id, first.id]))

        self.assertEqual([scene.id for scene in reordered.storyboard.scenes], [second.id, first.id])
        self.assertEqual(reordered.storyboard.scenes[0].sceneType, "question")
        self.assertEqual(reordered.storyboard.scenes[0].layoutMode, "hybrid")
        snapshots = list((storage.project_path(project.id) / "history").glob("storyboard-*.json"))
        self.assertTrue(snapshots)
        with self.assertRaises(ValueError):
            storage.reorder_scenes(project.id, [second.id, second.id])

    def test_scene_layout_mode_switches_prepare_the_selected_rendering(self) -> None:
        project = storage.create_project(ProjectCreate(title="Scene rendering modes"))
        project = storage.create_scene(project.id, SceneCreate(title="Scene title", extractedText=["Learner content"], layoutMode="fidelity"))
        scene = project.storyboard.scenes[0]
        source_deck = Presentation()
        source_slide = source_deck.slides.add_slide(source_deck.slide_layouts[6])
        source_slide.slide_layout.slide_master.background.fill.solid()
        source_slide.slide_layout.slide_master.background.fill.fore_color.rgb = RGBColor(18, 52, 86)
        source_slide.shapes.add_textbox(Inches(1), Inches(1), Inches(8), Inches(1)).text = "Source title"
        source_slide.shapes.add_textbox(Inches(1), Inches(2), Inches(8), Inches(1)).text = "Source body"
        source_path = storage.project_path(project.id) / "original" / "source-deck.pptx"
        source_path.parent.mkdir(parents=True, exist_ok=True)
        source_deck.save(source_path)
        source_scene = scene.model_copy(update={"sourceSlide": 1})
        project = storage.update_from_import(project.id, [source_scene], [])

        hybrid = main.patch_scene(project.id, scene.id, SceneUpdate(layoutMode="hybrid"), if_match=str(project.storyboard.revision))
        hybrid_scene = hybrid.storyboard.scenes[0]
        self.assertTrue(hybrid_scene.visualLayout.enabled)
        self.assertEqual(hybrid_scene.visualLayout.backgroundColor, "#123456")

        fidelity = main.patch_scene(project.id, scene.id, SceneUpdate(layoutMode="fidelity"), if_match=str(hybrid.storyboard.revision))
        self.assertFalse(fidelity.storyboard.scenes[0].visualLayout.enabled)

        native = main.patch_scene(project.id, scene.id, SceneUpdate(layoutMode="native"), if_match=str(fidelity.storyboard.revision))
        native_scene = native.storyboard.scenes[0]
        self.assertTrue(native_scene.visualLayout.enabled)
        self.assertEqual(native_scene.visualLayout.backgroundColor, "#ffffff")
        self.assertEqual([element.text for element in native_scene.visualLayout.elements], ["Scene title", "Learner content"])

        template_deck = Presentation()
        template_slide = template_deck.slides.add_slide(template_deck.slide_layouts[6])
        template_slide.slide_layout.slide_master.background.fill.solid()
        template_slide.slide_layout.slide_master.background.fill.fore_color.rgb = RGBColor(12, 34, 56)
        template_slide.shapes.add_textbox(Inches(1), Inches(1), Inches(8), Inches(1)).text = "Template placeholder"
        template_content = io.BytesIO()
        template_deck.save(template_content)
        template = storage.create_template("Blue template", "A test template", "blue.pptx", template_content.getvalue())
        templated = main.patch_scene(
            project.id,
            scene.id,
            SceneUpdate(layoutMode="template", templateId=template.id),
            if_match=str(native.storyboard.revision),
        )
        templated_scene = templated.storyboard.scenes[0]
        self.assertTrue(templated_scene.visualLayout.enabled)
        self.assertEqual(templated_scene.visualLayout.backgroundColor, "#0C2238")
        template_text = [element.text for element in templated_scene.visualLayout.elements if element.kind == "text"]
        self.assertIn("Scene title", template_text)
        self.assertIn("Learner content", template_text)
        self.assertNotIn("Template placeholder", template_text)

        restored_hybrid = main.patch_scene(
            project.id,
            scene.id,
            SceneUpdate(layoutMode="hybrid", templateId=None),
            if_match=str(templated.storyboard.revision),
        )
        restored_scene = restored_hybrid.storyboard.scenes[0]
        self.assertTrue(restored_scene.visualLayout.enabled)
        self.assertEqual(restored_scene.visualLayout.backgroundColor, "#123456")
        self.assertNotIn("Template placeholder", [element.text for element in restored_scene.visualLayout.elements if element.kind == "text"])

    def test_scene_delete_archives_revision_and_clears_remediation_target(self) -> None:
        project = storage.create_project(ProjectCreate(title="Delete scene course"))
        project = storage.create_scene(project.id, SceneCreate(title="Remediation lesson"))
        remediation_scene, = project.storyboard.scenes
        project = storage.create_scene(project.id, SceneCreate(title="Assessment"))
        assessment_scene = project.storyboard.scenes[1]
        project = storage.update_scene(
            project.id,
            assessment_scene.id,
            SceneUpdate(assessmentSettings=AssessmentSettings(remediationSceneId=remediation_scene.id)),
        )
        starting_revision = project.storyboard.revision
        history_before = len(list((storage.project_path(project.id) / "history").glob("storyboard-*.json")))

        deleted = main.delete_project_scene(project.id, remediation_scene.id, if_match=f'"{starting_revision}"')

        self.assertEqual([scene.id for scene in deleted.storyboard.scenes], [assessment_scene.id])
        self.assertIsNone(deleted.storyboard.scenes[0].assessmentSettings.remediationSceneId)
        self.assertEqual(deleted.storyboard.revision, starting_revision + 1)
        history = sorted((storage.project_path(project.id) / "history").glob("storyboard-*.json"))
        self.assertEqual(len(history), history_before + 1)
        previous = json.loads(history[-1].read_text(encoding="utf-8"))
        self.assertEqual(len(previous["scenes"]), 2)

        with self.assertRaises(HTTPException) as missing:
            main.delete_project_scene(project.id, remediation_scene.id, if_match=f'"{deleted.storyboard.revision}"')
        self.assertEqual(missing.exception.status_code, 404)

        with self.assertRaises(HTTPException) as stale:
            main.delete_project_scene(project.id, assessment_scene.id, if_match=f'"{starting_revision}"')
        self.assertEqual(stale.exception.status_code, 412)

        final_delete = main.delete_project_scene(
            project.id,
            assessment_scene.id,
            if_match=f'"{deleted.storyboard.revision}"',
        )
        self.assertEqual(final_delete.storyboard.scenes, [])
        self.assertEqual(final_delete.sceneCount, 0)

        delete_operation = main.app.openapi()["paths"]["/api/projects/{project_id}/scenes/{scene_id}"]["delete"]
        headers = [parameter["name"] for parameter in delete_operation.get("parameters", []) if parameter["in"] == "header"]
        self.assertIn("if-match", headers)

    async def test_template_upload_and_metadata_edit(self) -> None:
        template = await main.post_template(
            UploadFile(filename="Welcome layout.pptx", file=io.BytesIO(make_presentation())),
            title=None,
            description="Opening scene layout",
        )
        self.assertEqual(template.title, "Welcome layout")
        self.assertEqual(template.description, "Opening scene layout")
        self.assertEqual(storage.list_templates(), [template])
        self.assertTrue((storage.template_path(template.id) / "template.pptx").is_file())
        project = storage.create_project(ProjectCreate(title="Template course"))
        project = storage.create_scene(project.id, SceneCreate(title="Welcome", layoutMode="template", templateId=template.id))
        self.assertEqual(project.storyboard.scenes[0].templateId, template.id)
        updated_project = storage.update_scene(project.id, project.storyboard.scenes[0].id, SceneUpdate(layoutMode="native", templateId=None))
        self.assertIsNone(updated_project.storyboard.scenes[0].templateId)

        updated = main.patch_template(template.id, TemplateUpdate(title="Course opener", description="Updated layout notes"))
        self.assertEqual(updated.title, "Course opener")
        self.assertEqual(updated.description, "Updated layout notes")
        replacement_bytes = make_presentation()
        replaced = await main.put_template_source(
            template.id,
            UploadFile(filename="welcome-revised.pptx", file=io.BytesIO(replacement_bytes)),
        )
        self.assertEqual(replaced.filename, "welcome-revised.pptx")
        self.assertEqual(replaced.sizeBytes, len(replacement_bytes))
        self.assertEqual((storage.template_path(template.id) / "template.pptx").read_bytes(), replacement_bytes)

    async def test_project_media_upload_attach_and_serve(self) -> None:
        project = storage.create_project(ProjectCreate(title="Media course"))
        project = storage.create_scene(project.id, SceneCreate(title="Introduction"))
        scene = project.storyboard.scenes[0]
        image_buffer = io.BytesIO()
        Image.new("RGB", (3, 2), color=(30, 120, 80)).save(image_buffer, format="PNG")

        uploaded = await main.post_project_asset(
            project.id,
            UploadFile(filename="diagram.png", file=io.BytesIO(image_buffer.getvalue())),
        )
        asset = uploaded.storyboard.assets[0]
        self.assertEqual(asset.kind, "image")
        self.assertTrue((storage.project_path(project.id) / asset.path).is_file())

        updated = main.patch_scene(project.id, scene.id, SceneUpdate(imageAssets=[asset.id]))
        self.assertEqual(updated.storyboard.scenes[0].imageAssets, [asset.id])
        response = main.get_project_asset(project.id, asset.id)
        self.assertEqual(Path(response.path).read_bytes(), image_buffer.getvalue())

        audio_bytes = b"ID3\x04\x00\x00\x00\x00\x00\x00audio-fixture"
        uploaded = await main.post_project_asset(
            project.id,
            UploadFile(filename="voiceover.mp3", file=io.BytesIO(audio_bytes)),
        )
        audio_asset = next(asset for asset in uploaded.storyboard.assets if asset.kind == "audio")
        updated = main.patch_scene(project.id, scene.id, SceneUpdate(audioAssets=[audio_asset.id]))
        self.assertEqual(updated.storyboard.scenes[0].audioAssets, [audio_asset.id])
        audio_response = main.get_project_asset(project.id, audio_asset.id)
        self.assertEqual(Path(audio_response.path).read_bytes(), audio_bytes)

        with self.assertRaises(HTTPException) as raised:
            await main.post_project_asset(project.id, UploadFile(filename="script.exe", file=io.BytesIO(b"no")))
        self.assertEqual(raised.exception.status_code, 400)

    async def test_image_attribution_pending_warns_but_allows_production_export(self) -> None:
        project = storage.create_project(ProjectCreate(title="Attribution gate"))
        project = storage.create_scene(project.id, SceneCreate(title="Image credits"))
        image_buffer = io.BytesIO()
        Image.new("RGB", (2, 2), color=(40, 80, 120)).save(image_buffer, format="PNG")
        project = await main.post_project_asset(
            project.id,
            UploadFile(filename="source-image.png", file=io.BytesIO(image_buffer.getvalue())),
        )
        asset = project.storyboard.assets[0]
        self.assertEqual(asset.attributionStatus, "draft")
        self.assertEqual(asset.attributionText, "")
        project = main.patch_scene(project.id, project.storyboard.scenes[0].id, SceneUpdate(imageAssets=[asset.id]))
        self.assertTrue(main.get_project_validation(project.id, target="authoring").passed)

        word_response = main.export_storyboard_docx(project.id)
        word_document = Document(io.BytesIO(word_response.body))
        self.assertTrue(any("Attribution Pending" in cell.text for table in word_document.tables for row in table.rows for cell in row.cells))

        production_report = main.get_project_validation(project.id, target="production")
        attribution_issue = next(issue for issue in production_report.issues if issue.code == "missing-media-attribution")
        self.assertEqual(attribution_issue.severity, "warning")
        self.assertIn("Attribution Pending", attribution_issue.message)
        self.assertTrue(production_report.passed)
        for export in (main.export_scorm_2004(project.id), main.export_scorm_12(project.id)):
            self.assertEqual(export.status_code, 200)
        for profile in ("scorm2004", "scorm12"):
            report = json.loads((storage.project_path(project.id) / "reports" / f"build-{profile}.json").read_text(encoding="utf-8"))
            self.assertEqual(report["buildStatus"], "passed-with-warnings")
            self.assertTrue(any("Attribution Pending" in warning for warning in report["warnings"]))

        draft_with_credit = main.patch_project_asset_attribution(
            project.id,
            asset.id,
            AssetAttributionUpdate(
                attributionText="Created by Chimera Studio; source: internal; license: permission granted.",
                attributionStatus="draft",
            ),
        )
        self.assertEqual(draft_with_credit.storyboard.assets[0].attributionStatus, "draft")
        self.assertTrue(main.get_project_validation(project.id, target="production").passed)

        updated = main.patch_project_asset_attribution(
            project.id,
            asset.id,
            AssetAttributionUpdate(
                attributionText="Created by Chimera Studio; source: internal; license: permission granted.",
                attributionStatus="complete",
            ),
        )
        saved_asset = updated.storyboard.assets[0]
        self.assertEqual(saved_asset.attributionStatus, "complete")
        self.assertIn("license", saved_asset.attributionText)
        exported = json.loads(main.export_storyboard(project.id).body)
        self.assertEqual(exported["assets"][0]["attributionStatus"], "complete")
        self.assertEqual(exported["assets"][0]["attributionText"], saved_asset.attributionText)
        self.assertTrue(main.get_project_validation(project.id, target="production").passed)

    async def test_incomplete_audio_attribution_still_blocks_production(self) -> None:
        project = storage.create_project(ProjectCreate(title="Audio attribution gate"))
        project = await main.post_project_asset(
            project.id,
            UploadFile(filename="voice.mp3", file=io.BytesIO(b"ID3\x04\x00\x00\x00\x00\x00\x00voice")),
        )
        report = main.get_project_validation(project.id, target="production")
        attribution_issue = next(issue for issue in report.issues if issue.code == "missing-media-attribution")
        self.assertEqual(attribution_issue.severity, "error")
        self.assertFalse(report.passed)


if __name__ == "__main__":
    unittest.main()
