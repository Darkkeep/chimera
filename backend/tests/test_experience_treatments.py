import copy
import io
import json
import tempfile
import time
import unittest
from pathlib import Path
from threading import Event
from unittest.mock import patch
from zipfile import ZipFile

from fastapi.testclient import TestClient
from pydantic import ValidationError

from backend.app import experience_treatments as design, main, pythia_talk as talk, storage
from backend.app.experience_models import Experience, ExperienceTreatment
from backend.app.models import ProjectCreate, ReferenceResource, Scene, SceneCreate, SceneUpdate
from backend.app.platform import LOCAL_ACTOR


EXPERIENCE = {
    "version": 1, "heading": "Sporting merit", "introduction": "Results should reflect performance.",
    "flow": [{"label": "Performance", "description": "Skill and effort in competition."},
             {"label": "Results", "description": "Outcomes should follow performance."}],
    "reveals": [{"label": "Fair Play", "explanation": "Compete within the agreed rules."},
                {"label": "Equal Opportunity", "explanation": "A fair chance to compete."}],
    "conclusion": "Sporting merit is a principle, not a guarantee of every result.", "motion": True,
    "background": "#100818", "foreground": "#E8E5EA", "accent": "#FF32AA", "accentText": "#100818",
    "diagramAccent": "#8542E8",
    "activities": [],
}
TREATMENT = {"learningIntent": "Explain how performance should relate to results.",
             "rationale": "A flow and two learner-controlled explanations; no narration.",
             "experience": EXPERIENCE, "productionNeeds": []}


class ExperienceTests(unittest.TestCase):
    def setUp(self):
        root = Path(self.enterContext(tempfile.TemporaryDirectory()))
        self.enterContext(patch.multiple(storage, ROOT=root, PROJECTS=root / "projects"))
        self.enterContext(patch.object(main, "ROOT", root))
        self.enterContext(patch.object(talk, "checkout", return_value=root))
        self.project = storage.create_project(ProjectCreate(title="Experience fixture"))
        self.project = storage.create_scene(self.project.id, SceneCreate(
            title="Fair competition", extractedText=["Sporting merit should reward performance."],
            actionDescription="Show Performance to Results with clickable explanations.",
            notes="Use plain language.", narration="Context only, no audio approval."))
        self.scene = self.project.storyboard.scenes[0]
        self.client = self.enterContext(TestClient(main.app))
        self.url = f"/api/projects/{self.project.id}/scenes/{self.scene.id}/experience-treatment"
        self.headers = {"Origin": "http://127.0.0.1:5173"}
        talk.write_state(talk.state_path(self.project.id, LOCAL_ACTOR), {
            "sessionId": "fixture", "turns": [], "planning": {
                "stage": "designing", "brief": "Mobile readers; no narration; accessible diagrams.", "turnId": "fixture"}})
        self.data = {"requestId": "experience-request-one", "direction": "Main DARKROGUE plum, violet and pink; no audio.",
                     "contextFingerprint": self.client.get(self.url).json()["context"]["fingerprint"]}

    def submit(self, **overrides):
        response = self.client.post(self.url, json={**self.data, **overrides}, headers=self.headers)
        self.assertEqual(response.status_code, 202, response.text)
        return response.json()

    def finished(self):
        deadline = time.monotonic() + 5
        while time.monotonic() < deadline:
            response = self.client.get(self.url)
            self.assertEqual(response.status_code, 200, response.text)
            value = response.json()
            if value["operation"] and value["operation"]["status"] != "running":
                return value
            time.sleep(.01)
        self.fail("Experience worker did not settle")

    def proposal(self, treatment=None):
        with patch.object(talk, "local_mcp", return_value=copy.deepcopy(treatment or TREATMENT)):
            self.submit()
            value = self.finished()
            self.assertEqual(value["operation"]["status"], "completed", value)
            return value["draft"]

    def review(self, draft, treatment=None, apply=False, revision=None):
        headers = {**self.headers, "If-Match": f'"{revision or self.project.storyboard.revision}"'}
        return self.client.request("POST" if apply else "PUT", self.url + ("/apply" if apply else ""),
                                   headers=headers, json={"draftId": draft["id"], "treatment": treatment or draft["treatment"]})

    def test_strict_native_contract_contrast_bounds_and_legacy_roundtrip(self):
        self.assertIsNone(self.scene.experience)
        self.assertEqual(Experience.model_validate(EXPERIENCE).model_dump(), EXPERIENCE)
        for update in ({"foreground": "#8542E8", "background": "#E8E5EA"},
                       {"accentText": "#FF32AA"}, {"accent": "red;url(x)"}, {"flow": [], "reveals": []},
                       {"flow": [EXPERIENCE["flow"][0]]}, {"heading": "  "}, {"reveals": [{"label": "X", "explanation": " "}]},
                       {"flow": EXPERIENCE["flow"] * 3}, {"script": "alert(1)"}):
            with self.subTest(update=update), self.assertRaises(ValidationError):
                Experience.model_validate({**EXPERIENCE, **update})
        with self.assertRaises(ValidationError):
            ExperienceTreatment.model_validate({**TREATMENT, "video": "unsupported"})

    def test_private_context_generation_refinement_save_and_explicit_apply(self):
        before = storage.read_project(self.project.id).model_dump()
        with patch.object(talk, "local_mcp", return_value=TREATMENT) as provider, patch.object(main, "start_media_generation_job") as render:
            self.assertIsNone(self.client.get(self.url).json()["draft"])
            provider.assert_not_called()
            self.submit()
            draft = self.finished()["draft"]
            payload = provider.call_args.kwargs["experience_request"]
            self.assertEqual(payload["scene"]["notes"], self.scene.notes)
            self.assertEqual(payload["scene"]["narration"], self.scene.narration)
            self.assertIn("Mobile", payload["designBrief"])
            self.assertEqual(payload["sources"], [])
            self.assertEqual(payload["direction"], self.data["direction"])
            self.assertNotIn("history", payload)
            self.assertEqual(storage.read_project(self.project.id).model_dump(), before)
            edited = copy.deepcopy(TREATMENT)
            edited["experience"]["reveals"][0]["explanation"] = "Fair play uses the agreed rules."
            response = self.review(draft, edited)
            self.assertEqual(response.status_code, 200, response.text)
            self.assertEqual(self.client.get(self.url).json()["draft"]["treatment"], edited)
            self.submit(requestId="experience-refinement", currentTreatment=edited, includeDesignBrief=False)
            draft = self.finished()["draft"]
            self.assertEqual(provider.call_args.kwargs["experience_request"]["currentTreatment"], edited)
            self.assertEqual(provider.call_args.kwargs["experience_request"]["designBrief"], "")
            applied = self.review(draft, edited, apply=True)
            self.assertEqual(applied.status_code, 200, applied.text)
            scene = applied.json()["project"]["storyboard"]["scenes"][0]
            self.assertEqual(scene["experience"], edited["experience"])
            for key, value in before["storyboard"]["scenes"][0].items():
                if key != "experience":
                    self.assertEqual(scene[key], value, key)
            first_revision = applied.json()["project"]["storyboard"]["revision"]
            self.assertEqual(applied.json()["context"]["revision"], first_revision)
            repeated = self.review(draft, edited, apply=True)
            self.assertEqual(repeated.status_code, 200, repeated.text)
            self.assertEqual(repeated.json()["project"]["storyboard"]["revision"], first_revision)
            render.assert_not_called()
        other = LOCAL_ACTOR.model_copy(update={"actorId": "another-author"})
        self.assertIsNone(design.get(self.project.id, self.scene.id, other)["draft"])
        self.assertEqual(storage.list_media_generation_jobs(self.project.id), [])

    def test_before_after_proposal_review_apply_and_revision_guard(self):
        from backend.tests.test_before_after import comparison
        images = []
        for index in range(2):
            self.project = storage.add_project_asset(self.project.id, f"state-{index}.png",
                b"\x89PNG\r\n\x1a\nsynthetic" + bytes([index]), "image", self.project.storyboard.revision)
            images.append(next(asset.id for asset in self.project.storyboard.assets if asset.filename == f"state-{index}.png"))
        self.data["contextFingerprint"] = self.client.get(self.url).json()["context"]["fingerprint"]
        treatment = copy.deepcopy(TREATMENT)
        treatment["experience"]["activities"] = [comparison(*images)]
        draft = self.proposal(treatment)
        reviewed = copy.deepcopy(draft["treatment"])
        reviewed["experience"]["activities"][0]["explanation"] = "Review the changed state and its consequences."
        self.assertEqual(self.review(draft, reviewed).status_code, 200)
        self.assertEqual(self.review(draft, reviewed, apply=True, revision=999).status_code, 412)
        applied = self.review(draft, reviewed, apply=True)
        self.assertEqual(applied.status_code, 200, applied.text)
        self.assertEqual(applied.json()["project"]["storyboard"]["scenes"][0]["experience"], reviewed["experience"])

    def test_conditional_branch_proposal_review_apply_and_revision_guard(self):
        treatment = copy.deepcopy(TREATMENT)
        treatment["experience"]["activities"] = [{
            "kind": "branching", "id": "decision", "title": "Handle an incident", "startNodeId": "start",
            "variables": [{"id": "evidence", "label": "Evidence gathered", "initialValue": False}],
            "nodes": [
                {"id": "start", "prompt": "What is your first action?", "choices": [
                    {"label": "Investigate", "feedback": "Gather evidence.", "nextNodeId": "review",
                     "setVariables": [{"variableId": "evidence", "value": True}]},
                    {"label": "Ignore", "feedback": "The incident continues.", "nextNodeId": None}]},
                {"id": "review", "prompt": "What follows investigation?", "choices": [
                    {"label": "Report", "feedback": "Share what you found.", "nextNodeId": None,
                     "visibleWhen": {"variableId": "evidence", "equals": True}},
                    {"label": "Ask for guidance", "feedback": "A second perspective can help.", "nextNodeId": None}]}],
        }]
        draft = self.proposal(treatment)
        self.assertEqual(draft["treatment"]["experience"]["activities"][0]["variables"][0]["id"], "evidence")
        reviewed = copy.deepcopy(draft["treatment"])
        reviewed["experience"]["activities"][0]["nodes"][0]["choices"][1]["setVariables"] = [
            {"variableId": "evidence", "value": False},
        ]
        response = self.review(draft, reviewed)
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(self.review(draft, reviewed, apply=True, revision=999).status_code, 412)
        applied = self.review(draft, reviewed, apply=True)
        self.assertEqual(applied.status_code, 200, applied.text)
        self.assertEqual(
            applied.json()["project"]["storyboard"]["scenes"][0]["experience"]["activities"][0]["variables"][0]["initialValue"],
            False,
        )
    def test_invalid_or_failed_design_preserves_previous_draft_and_sanitizes_errors(self):
        draft = self.proposal()
        for result in ({}, {**TREATMENT, "experience": {**EXPERIENCE, "foreground": "#100818"}}):
            with patch.object(talk, "local_mcp", return_value=result):
                self.submit(requestId="invalid-" + str(len(json.dumps(result))))
                value = self.finished()
                self.assertEqual(value["operation"]["status"], "failed")
                self.assertEqual(value["draft"], draft)
        with patch.object(talk, "local_mcp", side_effect=RuntimeError("SECRET provider error")):
            self.submit(requestId="provider-failure")
            value = self.finished()
            self.assertNotIn("SECRET", value["operation"]["error"])
            self.assertEqual(value["draft"], draft)

    def test_request_idempotency_capacity_conflicts_and_restart(self):
        release = Event()
        def produce(**_):
            release.wait(5)
            return TREATMENT
        with patch.object(talk, "local_mcp", side_effect=produce) as provider:
            try:
                self.submit()
                self.submit()
                conflict = self.client.post(self.url, headers=self.headers, json={**self.data, "direction": "Changed"})
                self.assertEqual(conflict.status_code, 409)
                self.assertEqual(self.client.post(self.url, headers=self.headers, json={**self.data, "requestId": "different-request"}).status_code, 409)
            finally:
                release.set()
            self.finished()
            provider.assert_called_once()
        path = design._path(self.project.id, self.scene.id, LOCAL_ACTOR)
        state = json.loads(path.read_text())
        state["operation"].update(status="running", runId="old-process")
        talk.write_state(path, state)
        self.assertEqual(self.client.get(self.url).json()["operation"]["status"], "failed")
        with patch.object(talk.CAPACITY, "acquire", return_value=False):
            response = self.client.post(self.url, headers=self.headers, json={**self.data, "requestId": "capacity-request"})
            self.assertEqual(response.status_code, 429)

    def test_scene_and_brief_drift_missing_revision_required_dependencies(self):
        treatment = copy.deepcopy(TREATMENT)
        treatment["productionNeeds"] = [{"description": "License optional music.", "requiredBeforeApply": True}]
        draft = self.proposal(treatment)
        self.assertEqual(self.review(draft, apply=True).status_code, 409)
        self.assertEqual(self.client.post(self.url + "/apply", headers=self.headers,
                                         json={"draftId": draft["id"], "treatment": treatment}).status_code, 428)
        self.assertEqual(self.review(draft, apply=True, revision=999).status_code, 409)
        treatment["productionNeeds"][0]["requiredBeforeApply"] = False
        stale = storage.update_scene(self.project.id, self.scene.id, SceneUpdate(notes="Changed after proposal"))
        self.assertEqual(self.review(draft, treatment, apply=True, revision=stale.storyboard.revision).status_code, 409)
        self.assertIsNone(storage.read_project(self.project.id).storyboard.scenes[0].experience)
        self.data["contextFingerprint"] = self.client.get(self.url).json()["context"]["fingerprint"]
        self.data["requestId"] = "fresh-design-request"
        draft = self.proposal()
        path = talk.state_path(self.project.id, LOCAL_ACTOR)
        state = talk.read_state(path)
        state["planning"]["brief"] = "A changed brief."
        talk.write_state(path, state)
        self.assertEqual(self.review(draft).status_code, 409)

    def test_selected_sources_provenance_and_source_drift(self):
        reference = ReferenceResource(id="reference-brand", title="Brand", currentVersion="1", versions=[{
            "version": "1", "filename": "brand.txt", "contentType": "text/plain", "sizeBytes": 12,
            "sha256": "a" * 64, "originalPath": "private-path", "createdAt": "2026-01-01",
            "passages": [{"locator": "Palette", "text": "Use plum and violet."}]}])
        with patch.object(storage, "list_reference_resources", return_value=[reference]):
            ctx = self.client.get(self.url, params={"source_ids": reference.id}).json()["context"]
            self.assertEqual(ctx["selectedSources"][0]["passages"][0]["text"], "Use plum and violet.")
            with patch.object(talk, "local_mcp", return_value=TREATMENT) as provider:
                self.submit(sourceIds=[reference.id], contextFingerprint=ctx["fingerprint"])
                draft = self.finished()["draft"]
                sent = provider.call_args.kwargs["experience_request"]["sources"]
                self.assertNotIn("originalPath", json.dumps(sent))
                self.assertEqual(draft["provenance"]["sources"][0]["sha256"], "a" * 64)
            reference.versions[0].sha256 = "b" * 64
            self.assertEqual(self.review(draft, apply=True).status_code, 409)
            reference.versions[0].extractionStatus = "partial"
            self.assertEqual(self.client.get(self.url, params={"source_ids": reference.id}).status_code, 422)
            self.assertEqual(self.client.get(self.url, params={"source_ids": "missing"}).status_code, 409)

    def test_change_during_design_or_revoked_access_does_not_replace_draft(self):
        release = Event()
        def produce(**_):
            release.wait(5)
            return TREATMENT
        with patch.object(talk, "local_mcp", side_effect=produce):
            try:
                self.submit()
                storage.update_scene(self.project.id, self.scene.id, SceneUpdate(notes="Changed while designing."))
            finally:
                release.set()
            value = self.finished()
            self.assertEqual(value["operation"]["status"], "failed")
            self.assertIsNone(value["draft"])

    def test_same_native_contract_exported_and_print_reveals_expanded(self):
        from backend.app.scorm import build_scorm_2004
        from backend.app.standalone import build_standalone_course
        project = storage.update_scene(self.project.id, self.scene.id, SceneUpdate(experience=EXPERIENCE))
        for builder in (build_scorm_2004, build_standalone_course):
            content, _ = builder(project)
            with ZipFile(io.BytesIO(content)) as archive:
                storyboard = json.loads(archive.read("storyboard.json"))
                self.assertEqual(storyboard["scenes"][0]["experience"], EXPERIENCE)
                script = archive.read("player.js").decode()
                self.assertIn("function mountExperience", script)
                self.assertIn('node.open = true', script)
                self.assertIn('text("summary", reveal.label', script)
                self.assertIn(".experience-flow", archive.read("index.html").decode())

    def test_cannot_silently_hide_existing_assessment_or_timeline(self):
        for extra in ({"visualLayout": {"timeline": {}}},):
            with self.assertRaises(ValidationError):
                Scene.model_validate({**self.scene.model_dump(), "experience": EXPERIENCE, **extra})
        storage.update_scene(self.project.id, self.scene.id, SceneUpdate(visualLayout={"timeline": {}}))
        self.data["contextFingerprint"] = self.client.get(self.url).json()["context"]["fingerprint"]
        response = self.client.post(self.url, headers=self.headers, json=self.data)
        self.assertEqual(response.status_code, 409)

    def test_applied_native_content_is_video_context_and_canvas_can_be_restored(self):
        from backend.app import video_treatments
        original = storage.read_project(self.project.id).storyboard.scenes[0].model_dump()
        project = storage.update_scene(self.project.id, self.scene.id, SceneUpdate(experience=EXPERIENCE))
        value = video_treatments.get(self.project.id, self.scene.id, LOCAL_ACTOR)
        self.assertEqual(value["context"]["scene"]["experience"], EXPERIENCE)
        restored = storage.update_scene(self.project.id, self.scene.id, SceneUpdate(experience=None),
                                        expected_revision=project.storyboard.revision)
        self.assertEqual(restored.storyboard.scenes[0].model_dump(), original)

    def test_origin_unknown_scene_and_foreign_draft_rejected(self):
        self.assertEqual(self.client.post(self.url, headers={"Origin": "https://example.com"}, json=self.data).status_code, 403)
        self.assertEqual(self.client.get(self.url.replace(self.scene.id, "missing")).status_code, 404)
        response = self.client.put(self.url, headers=self.headers, json={"draftId": "f" * 32, "treatment": TREATMENT})
        self.assertEqual(response.status_code, 409)

    def test_external_link_proposals_require_human_review_and_preserve_revision_guards(self):
        from backend.tests.test_external_links import experience, external_link
        treatment = {**copy.deepcopy(TREATMENT), "experience": experience(external_link())}
        draft = self.proposal(treatment)
        self.assertFalse(draft["treatment"]["experience"]["activities"][0]["authorReviewed"])
        self.assertEqual(self.review(draft).status_code, 200)
        self.assertEqual(self.review(draft, apply=True).status_code, 409)
        treatment = copy.deepcopy(draft["treatment"])
        treatment["experience"]["activities"][0]["authorReviewed"] = True
        self.assertEqual(self.review(draft, treatment, apply=True, revision=999).status_code, 412)
        response = self.review(draft, treatment, apply=True)
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(storage.read_project(self.project.id).storyboard.scenes[0].experience.model_dump(), treatment["experience"])


if __name__ == "__main__":
    unittest.main()
