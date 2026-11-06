import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

from backend.app import enhancement_jobs, pythia_talk, storage
from backend.app.models import EnhancementJobCreate, EnhancementProposalChangeCreate, ProjectCreate, SceneCreate, SceneUpdate


class EnhancementExpansionTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        root = Path(self.temp.name)
        for name, value in (("ROOT", root), ("PROJECTS", root / "projects")):
            patcher = patch.object(storage, name, value)
            patcher.start()
            self.addCleanup(patcher.stop)
        self.project = storage.create_project(ProjectCreate(title="Fair competition"))
        self.project = storage.create_scene(self.project.id, SceneCreate(
            title="Competition", extractedText=["Performance", "Results"], actionDescription="Already authored.",
        ), self.project.storyboard.revision)
        self.project = storage.prepare_authored_project(self.project.id, self.project.storyboard.revision)
        self.anchor = self.project.storyboard.scenes[0]

    def output(self, target=None):
        return {"proposals": [{"changes": [{
            "targetSceneId": target or self.anchor.id, "field": "additionalScenes", "proposedValue": [
                {"title": "Performance matters", "extractedText": ["Demonstrate the relevant skill."]},
                {"title": "Understanding results", "extractedText": ["Compare the outcome with the criteria."]},
            ],
        }], "rationale": "Develop each original topic; external research is still needed.", "referenceCitations": []}],
            "resourceConflicts": []}

    def run_job(self, output, scope="selected-scenes", **options):
        job = storage.create_enhancement_job(self.project.id, EnhancementJobCreate(
            scope=scope, sceneIds=[self.anchor.id] if scope == "selected-scenes" else [],
            goal="Expand each line into a scene", resourceIds=[],
            **options,
        ))
        provider = Mock(name="live fixture")
        provider.name, provider.model = "fixture", "fixture-model"
        provider.generate.return_value = output
        with patch.object(enhancement_jobs, "_provider_factory", return_value=provider):
            enhancement_jobs._run_job(self.project.id, job.id)
        return storage.read_enhancement_job(self.project.id, job.id), provider

    def test_selected_expansion_is_reviewable_preserves_anchor_and_can_be_reversed(self):
        job, provider = self.run_job(self.output())
        self.assertEqual(job.status, "completed", job.error)
        self.assertEqual(len(job.proposalIds), 1)
        self.assertIn("additionalScenes", provider.generate.call_args.args[0]["allowedFields"])
        self.assertEqual(storage.read_project(self.project.id).storyboard.scenes, self.project.storyboard.scenes)
        _, accepted = storage.decide_enhancement_proposal(self.project.id, job.proposalIds[0], "accept", self.project.storyboard.revision)
        self.assertEqual(len(accepted.storyboard.scenes), 3)
        self.assertEqual(accepted.storyboard.scenes[0], self.anchor)
        self.assertEqual([scene.title for scene in accepted.storyboard.scenes[1:]], ["Performance matters", "Understanding results"])
        self.assertIsNotNone(accepted.storyboard.scenes[1].visualLayout)
        reloaded = storage.prepare_authored_project(self.project.id, accepted.storyboard.revision)
        self.assertEqual(reloaded.storyboard, accepted.storyboard)
        _, reversed_project = storage.decide_enhancement_proposal(self.project.id, job.proposalIds[0], "reverse", accepted.storyboard.revision)
        self.assertEqual(reversed_project.storyboard.scenes, [self.anchor])

    def test_whole_course_uses_same_live_proposal_contract(self):
        self.project = storage.create_scene(self.project.id, SceneCreate(
            title="Equal opportunity", extractedText=["Access", "Participation"],
        ), self.project.storyboard.revision)
        second_anchor = self.project.storyboard.scenes[1]
        output = self.output()
        second_change = self.output(second_anchor.id)["proposals"][0]["changes"][0]
        second_change["proposedValue"] = [{"title": "Access to compete", "extractedText": ["Remove irrelevant barriers."]}]
        output["proposals"][0]["changes"].append(second_change)
        job, provider = self.run_job(output, "whole-course")
        self.assertEqual(job.status, "completed", job.error)
        self.assertEqual(len(provider.generate.call_args.args[0]["scenes"]), 2)
        _, accepted = storage.decide_enhancement_proposal(self.project.id, job.proposalIds[0], "accept", self.project.storyboard.revision)
        self.assertEqual([scene.title for scene in accepted.storyboard.scenes], [
            "Competition", "Performance matters", "Understanding results", "Equal opportunity", "Access to compete",
        ])
        self.assertEqual(accepted.storyboard.scenes[3], second_anchor)

    def test_empty_output_is_explicit_failure_not_success(self):
        job, _ = self.run_job({"proposals": [], "resourceConflicts": []})
        self.assertEqual(job.status, "failed")
        self.assertIn("no actionable suggestions", job.error)
        self.assertEqual(storage.list_enhancement_proposals(self.project.id), [])

    def test_invalid_or_out_of_selection_output_leaves_no_proposals(self):
        duplicate = self.output()["proposals"][0]
        duplicate["changes"] *= 2
        for output in (self.output("invented"), {"proposals": [*self.output()["proposals"], {
            "changes": [{"targetSceneId": self.anchor.id, "field": "title", "proposedValue": self.anchor.title}],
            "rationale": "No-op", "referenceCitations": [],
        }]}, {"proposals": [*self.output()["proposals"], duplicate]}):
            job, _ = self.run_job(output)
            self.assertEqual(job.status, "failed")
            self.assertEqual(storage.list_enhancement_proposals(self.project.id), [])

    def test_new_scene_identity_or_assets_cannot_be_injected(self):
        for field in ("id", "imageAssets"):
            output = self.output()
            output["proposals"][0]["changes"][0]["proposedValue"][0][field] = "invented"
            job, _ = self.run_job(output)
            self.assertEqual(job.status, "failed")

    def test_changed_new_scene_cannot_be_silently_removed_by_undo(self):
        job, _ = self.run_job(self.output())
        _, accepted = storage.decide_enhancement_proposal(self.project.id, job.proposalIds[0], "accept", self.project.storyboard.revision)
        changed = storage.update_scene(self.project.id, accepted.storyboard.scenes[1].id, SceneUpdate(notes="Human edit"), accepted.storyboard.revision)
        with self.assertRaises(storage.EnhancementProposalConflict):
            storage.decide_enhancement_proposal(self.project.id, job.proposalIds[0], "reverse", changed.storyboard.revision)
        self.assertEqual(len(storage.read_project(self.project.id).storyboard.scenes), 3)

    def test_local_provider_forwards_complete_goal_to_live_tool_without_engine_fallback(self):
        payload = {"goal": "Expand each scene", "scenes": [{"id": self.anchor.id}]}
        with patch.object(pythia_talk, "local_mcp", return_value=self.output()) as live:
            result = enhancement_jobs.LocalPythiaEnhancementProvider().generate(payload)
        live.assert_called_once_with(enhancement_request=payload)
        self.assertEqual(result, self.output())

    def test_preview_discovers_live_capability_without_a_generation_request(self):
        request = EnhancementJobCreate(scope="selected-scenes", sceneIds=[self.anchor.id], goal="Expand the scene")
        with patch.object(pythia_talk, "local_mcp", return_value={"storyboard_enhancements": True}) as live:
            preview = enhancement_jobs.preview_enhancement_submission(self.project.id, request)
        live.assert_called_once_with()
        self.assertTrue(preview["engineConfigured"])
        self.assertEqual(preview["sceneCount"], 1)
        self.assertEqual(preview["payload"]["goal"], request.goal)
        self.assertEqual(storage.list_enhancement_jobs(self.project.id), [])

    def test_preview_requires_requested_orchestration_and_web_capabilities_without_generating(self):
        request = EnhancementJobCreate(scope="whole-course", goal="Develop course", useTools=True, allowWebResearch=True)
        capabilities = {"storyboard_enhancements": True, "authoring_orchestration": True, "web_research": True,
                        "authoring_tools": [{"name": "research.synthesize", "description": "Research Specialist"}]}
        with patch.object(pythia_talk, "local_mcp", return_value=capabilities) as live:
            preview = enhancement_jobs.preview_enhancement_submission(self.project.id, request)
        live.assert_called_once_with()
        self.assertTrue(preview["engineConfigured"])
        self.assertEqual(preview["maxProviderRequests"], 7)
        self.assertEqual(preview["tools"], capabilities["authoring_tools"])
        capabilities["web_research"] = False
        with patch.object(pythia_talk, "local_mcp", return_value=capabilities):
            preview = enhancement_jobs.preview_enhancement_submission(self.project.id, request)
        self.assertFalse(preview["engineConfigured"])
        self.assertEqual(storage.list_enhancement_jobs(self.project.id), [])

    def test_expansion_bounds_are_enforced_at_40_per_anchor(self):
        output = self.output()
        draft = output["proposals"][0]["changes"][0]["proposedValue"][0]
        output["proposals"][0]["changes"][0]["proposedValue"] = [draft] * 40
        job, _ = self.run_job(output)
        self.assertEqual(job.status, "completed", job.error)
        output["proposals"][0]["changes"][0]["proposedValue"].append(draft)
        failed, _ = self.run_job(output)
        self.assertEqual(failed.status, "failed")
        self.assertIn("1-40", failed.error)
        self.assertEqual(failed.proposalIds, [])

    def test_expansion_bounds_are_enforced_at_100_per_run(self):
        for title in ("Second anchor", "Third anchor"):
            self.project = storage.create_scene(self.project.id, SceneCreate(title=title), self.project.storyboard.revision)
        output = self.output()
        changes = []
        for scene, count in zip(self.project.storyboard.scenes, (40, 40, 20)):
            change = self.output(scene.id)["proposals"][0]["changes"][0]
            change["proposedValue"] = [change["proposedValue"][0]] * count
            changes.append(change)
        output["proposals"][0]["changes"] = changes
        job, _ = self.run_job(output, "whole-course")
        self.assertEqual(job.status, "completed", job.error)
        changes[-1]["proposedValue"].append(changes[-1]["proposedValue"][0])
        failed, _ = self.run_job(output, "whole-course")
        self.assertEqual(failed.status, "failed")
        self.assertIn("at most 100", failed.error)
        self.assertEqual(failed.proposalIds, [])

    def test_expansion_values_cannot_replace_server_assigned_scene_identity(self):
        job, _ = self.run_job(self.output())
        with self.assertRaisesRegex(ValueError, "reviewed as a unit"):
            storage.decide_enhancement_proposal(self.project.id, job.proposalIds[0], "accept", self.project.storyboard.revision, [
                EnhancementProposalChangeCreate(targetSceneId=self.anchor.id, field="additionalScenes", proposedValue=[]),
            ])

    def tool_output(self):
        source = {"id": "web-0123456789abcdef", "title": "Public evidence", "url": "https://example.org/evidence",
                  "version": "2026-11-04T20:00:00Z", "passages": [{"locator": "provider-synthesis", "text": "Public evidence summary."}],
                  "evidenceKind": "web-search-synthesis"}
        output = self.output()
        output.update({"toolExecutions": [{"sequence": 1, "tool": "research_web", "instruction": "Public fair-play criteria",
                                          "startedAt": "2026-11-04T20:00:00Z", "status": "completed",
                                          "result": {"sources": [source]}}],
                       "researchSources": [source], "orchestrationError": None})
        output["proposals"][0]["referenceCitations"] = [{
            "resourceId": source["id"], "version": source["version"], "locator": "provider-synthesis", "excerpt": "Public evidence summary.",
        }]
        return output

    def test_tool_receipts_and_web_evidence_persist_without_mutating_course(self):
        job, provider = self.run_job(self.tool_output(), useTools=True, allowWebResearch=True)
        self.assertEqual(job.status, "completed", job.error)
        self.assertEqual(job.researchSources[0].url, "https://example.org/evidence")
        self.assertEqual(job.toolExecutions[0].status, "completed")
        self.assertTrue(provider.generate.call_args.args[0]["allowWebResearch"])
        self.assertEqual(storage.read_project(self.project.id).storyboard, self.project.storyboard)
        proposal = storage.list_enhancement_proposals(self.project.id)[0]
        self.assertEqual(proposal.referenceCitations[0].resourceId, "web-0123456789abcdef")

    def test_web_without_permission_and_invented_citations_are_rejected(self):
        output = self.tool_output()
        job, _ = self.run_job(output, useTools=True)
        self.assertEqual(job.status, "failed")
        output["proposals"][0]["referenceCitations"][0]["excerpt"] = "Invented evidence"
        job, _ = self.run_job(output, useTools=True, allowWebResearch=True)
        self.assertEqual(job.status, "failed")
        self.assertEqual(storage.list_enhancement_proposals(self.project.id), [])
        self.assertEqual(len(job.researchSources), 1)

    def test_selected_web_research_rejects_missing_uncited_or_late_search(self):
        for scenario in ("missing", "uncited", "late"):
            output = self.tool_output()
            specialist = {"sequence": 1, "tool": "research.synthesize", "instruction": "Synthesize supplied sources",
                          "startedAt": "2026-11-04T20:00:00Z", "status": "completed", "result": {"draft": {}}}
            if scenario == "missing":
                output["toolExecutions"] = [specialist]
                output["researchSources"] = []
            elif scenario == "uncited":
                output["researchSources"] = []
            else:
                output["toolExecutions"][0]["sequence"] = 2
                output["toolExecutions"].insert(0, specialist)
            job, _ = self.run_job(output, useTools=True, allowWebResearch=True)
            self.assertEqual(job.status, "failed")
            self.assertIn("requires a completed search with cited sources", job.error)
            self.assertEqual(job.proposalIds, [])
            self.assertTrue(job.toolExecutions)
        self.assertEqual(storage.list_enhancement_proposals(self.project.id), [])
        self.assertEqual(storage.read_project(self.project.id).storyboard, self.project.storyboard)

    def test_failed_orchestration_retains_receipts_but_no_proposals(self):
        output = self.tool_output()
        output["orchestrationError"] = "Final drafting failed"
        job, _ = self.run_job(output, useTools=True, allowWebResearch=True)
        self.assertEqual(job.status, "failed")
        self.assertEqual(job.error, "Final drafting failed")
        self.assertEqual(job.toolExecutions[0].status, "completed")
        self.assertEqual(storage.list_enhancement_proposals(self.project.id), [])

    def test_restart_never_replays_potentially_billable_tool_run(self):
        job = storage.create_enhancement_job(self.project.id, EnhancementJobCreate(
            scope="whole-course", goal="Develop course", useTools=True,
        ))
        with patch.object(enhancement_jobs, "start_enhancement_job") as start:
            enhancement_jobs.recover_enhancement_jobs()
        start.assert_not_called()
        recovered = storage.read_enhancement_job(self.project.id, job.id)
        self.assertEqual(recovered.status, "failed")
        self.assertIn("no automatic replay", recovered.error)


if __name__ == "__main__":
    unittest.main()
