import base64
import io
import json
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path
from xml.etree import ElementTree as ET
from zipfile import ZIP_DEFLATED, ZipFile

from fastapi import HTTPException, UploadFile
from PIL import Image
from pydantic import ValidationError
from pptx import Presentation
from pptx.opc.constants import RELATIONSHIP_TYPE as RT
from pptx.util import Inches
from unittest.mock import patch

from backend.app import main, storage
from backend.app.models import AssessmentChoice, AssessmentPair, AssessmentSettings, AssetAttributionUpdate, CourseCompletionSettings, DragDropAssessment, EnhancementProposalCreate, ExportSettings, MatchingAssessment, MultipleResponseAssessment, OrderingAssessment, ProjectCreate, Scene, SceneCreate, SceneOrder, SceneUpdate, ShortAnswerAssessment, SingleChoiceAssessment, Storyboard, TemplateUpdate, TrueFalseAssessment
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
            )
        self.assertEqual(raised.exception.status_code, 409)
        self.assertEqual(storage.list_enhancement_proposals(project.id)[-1].status, "stale")
        self.assertEqual(storage.read_project(project.id).storyboard.scenes[0].actionDescription, "Author edited this after the proposal.")

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
            ("Short answer", ShortAnswerAssessment(identifier="ITEM_SHORT", prompt="Name the item", acceptedAnswers=["Answer", "response"]), "textEntryInteraction", "single", "string"),
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
                self.assertEqual(len(root.findall(f".//{namespace}responseIf/{namespace}or/{namespace}match")), 2)

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
        storage.create_scene(project.id, SceneCreate(title="Welcome"))

        response = main.export_scorm_2004(project.id)

        self.assertEqual(response.media_type, "application/zip")
        with ZipFile(io.BytesIO(response.body)) as package:
            self.assertEqual(package.namelist()[:3], ["imsmanifest.xml", "index.html", "player.js"])
            self.assertIn("storyboard.json", package.namelist())
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
            self.assertIn("runtime-status", package.read("index.html").decode("utf-8"))
            self.assertIn("Media could not be loaded", player)
        report = json.loads((storage.project_path(project.id) / "reports" / "build-scorm2004.json").read_text(encoding="utf-8"))
        self.assertEqual(report["exportProfile"], "SCORM 2004 4th Edition")
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

    def test_scorm_12_export_uses_legacy_runtime_and_manifest(self) -> None:
        project = storage.create_project(ProjectCreate(title="Compatibility course"))
        storage.create_scene(project.id, SceneCreate(title="Welcome"))

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
            player = package.read("player.js").decode("utf-8")
            self.assertIn("window.API || null", player)
            self.assertIn("LMSInitialize", player)
            self.assertIn("LMSSetValue", player)
            self.assertIn('SetValue: "LMSSetValue"', player)
            self.assertIn("cmi.core.lesson_status", player)
            self.assertIn("cmi.core.lesson_location", player)
            self.assertNotIn("cmi.success_status", player)
        report = json.loads((storage.project_path(project.id) / "reports" / "build-scorm12.json").read_text(encoding="utf-8"))
        self.assertEqual(report["exportProfile"], "SCORM 1.2")
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
        previous = json.loads(snapshots[-1].read_text(encoding="utf-8"))
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
        self.assertEqual(reordered.storyboard.scenes[0].sceneType, "assessment")
        self.assertEqual(reordered.storyboard.scenes[0].layoutMode, "hybrid")
        snapshots = list((storage.project_path(project.id) / "history").glob("storyboard-*.json"))
        self.assertTrue(snapshots)
        with self.assertRaises(ValueError):
            storage.reorder_scenes(project.id, [second.id, second.id])

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

    async def test_media_attribution_draft_is_allowed_but_blocks_production(self) -> None:
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
        self.assertTrue(main.get_project_validation(project.id, target="authoring").passed)

        production_report = main.get_project_validation(project.id, target="production")
        self.assertFalse(production_report.passed)
        self.assertIn("missing-media-attribution", {issue.code for issue in production_report.issues})

        draft_with_credit = main.patch_project_asset_attribution(
            project.id,
            asset.id,
            AssetAttributionUpdate(
                attributionText="Created by Chimera Studio; source: internal; license: permission granted.",
                attributionStatus="draft",
            ),
        )
        self.assertEqual(draft_with_credit.storyboard.assets[0].attributionStatus, "draft")
        self.assertFalse(main.get_project_validation(project.id, target="production").passed)

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


if __name__ == "__main__":
    unittest.main()