import unittest

from pydantic import ValidationError

from backend.app.models import GeneratedSceneDraft, SceneContentDraft
from backend.app import content_generation, enhancement_jobs, storage
from backend.app.models import EnhancementJob, ProjectDetail, Scene, Storyboard
from unittest.mock import patch


class SceneDraftContractTests(unittest.TestCase):
    def test_scene_revision_preserves_omitted_optional_fields_and_assessment(self):
        scene = Scene(id="scene-1", title="Safety checklist", sceneType="assessment", required=False,
                      narration="Existing narration", notes="Local policy note",
                      assessmentItem={"type": "true-false", "identifier": "check", "prompt": "Inspect first.", "correctResponse": "true"},
                      assessmentSettings={"maxAttempts": 3, "scoreWeight": 2})
        project = ProjectDetail(id="course-1", title="Operators", sceneCount=1, updatedAt="now", hasSourceDeck=False,
                                storyboard=Storyboard(projectId="course-1", title="Operators", scenes=[scene]))
        output = self.draft(["Safety checklist", "Inspect equipment before operation."])
        with patch.object(content_generation, "_generate_json", return_value=output), patch.object(storage, "list_reference_resources", return_value=[]):
            draft = content_generation.generate_scene_draft(project, scene, "Improve the wording")
        self.assertFalse(draft.required)
        self.assertEqual(draft.notes, scene.notes)
        self.assertEqual(draft.narration, scene.narration)
        self.assertEqual(draft.assessmentItem, scene.assessmentItem)
        self.assertEqual(draft.assessmentSettings, scene.assessmentSettings)

    def test_unknown_draft_fields_are_rejected_instead_of_silently_lost(self):
        with self.assertRaises(ValidationError):
            GeneratedSceneDraft.model_validate({"title": "Lesson", "unsupportedInteraction": "invented capability"})

    def test_assessment_drafts_require_real_questions_and_valid_answer_keys(self):
        with self.assertRaises(ValidationError):
            GeneratedSceneDraft(title="Knowledge check", sceneType="assessment")
        with self.assertRaises(ValidationError):
            GeneratedSceneDraft(title="Knowledge check", sceneType="assessment", assessmentItem={
                "type": "single-choice", "identifier": "check", "prompt": "Select the safe action.",
                "choices": [{"identifier": "safe", "text": "Inspect"}, {"identifier": "unsafe", "text": "Skip"}],
                "correctResponse": "missing",
            })

    def test_enhancement_context_lists_applicable_fields_and_value_schemas(self):
        scene = Scene(id="scene-1", title="Lesson", notes="Preserve local wording", required=False)
        project = ProjectDetail(id="course-1", title="Operators", sceneCount=1, updatedAt="now", hasSourceDeck=False,
                                storyboard=Storyboard(projectId="course-1", title="Operators", scenes=[scene]))
        for scope in ("selected-scenes", "whole-course"):
            job = EnhancementJob(id="job-1", projectId=project.id, sourceRevision=1, scope=scope,
                                 sceneIds=[scene.id], resourceIds=[], goal="Clarify wording", createdAt="now", updatedAt="now")
            with self.subTest(scope=scope), patch.object(storage, "read_project", return_value=project), patch.object(storage, "list_reference_resources", return_value=[]):
                payload, _ = enhancement_jobs._load_job_context(job)
            self.assertEqual(payload["course"]["sceneSequence"][0]["id"], scene.id)
            self.assertEqual(payload["scenes"][0]["notes"], "Preserve local wording")
            self.assertFalse(payload["scenes"][0]["required"])
            self.assertIn("assessmentItem", payload["fieldValueSchemas"]["sceneFields"])
            self.assertEqual("sceneOrder" in payload["allowedFields"], scope == "whole-course")
            self.assertEqual(bool(payload["fieldValueSchemas"]["globalFields"]), scope == "whole-course")

    def draft(self, texts):
        return {
            "title": "Safety checklist",
            "extractedText": ["Inspect equipment before operation."],
            "visualLayout": {
                "enabled": True,
                "width": 1280,
                "height": 720,
                "backgroundColor": "#17324d",
                "elements": [
                    {"id": f"text-{index}", "kind": "text", "x": 64, "y": 64 + index * 180,
                     "width": 1100, "height": 150, "text": text}
                    for index, text in enumerate(texts)
                ],
            },
        }

    def test_layout_realizes_title_and_each_paragraph(self):
        draft = SceneContentDraft.model_validate(self.draft(["Safety checklist", "Inspect equipment before operation."]))
        self.assertEqual(len(draft.visualLayout.elements), 2)

    def test_generated_layout_cannot_invent_a_background_asset(self):
        draft = self.draft(["Safety checklist", "Inspect equipment before operation."])
        draft["visualLayout"]["backgroundAsset"] = "invented-asset"
        with self.assertRaises(ValidationError):
            SceneContentDraft.model_validate(draft)

    def test_empty_missing_duplicate_or_different_layout_text_is_rejected(self):
        for texts in ([], ["Safety checklist"], ["Safety checklist", "Unrelated content"],
                      ["Safety checklist", "Inspect equipment before operation.", "Inspect equipment before operation."],
                      ["Inspect equipment before operation.", "Safety checklist"]):
            with self.subTest(texts=texts), self.assertRaises(ValidationError):
                SceneContentDraft.model_validate(self.draft(texts))