import json
from contextvars import copy_context
import os
import threading
import time
from uuid import uuid4
from typing import Protocol, get_args

from .ai_context import course_context, scene_context
from .models import CourseCompletionSettings, EnhancementField, EnhancementJob, EnhancementJobCreate, EnhancementProposalCreate, EnhancementReferenceCitation, SceneUpdate
from .models import EnhancementResourceConflict, EnhancementSceneDraft, EnhancementToolExecution, EnhancementResearchSource
from . import storage
from .learning_intelligence import PythiaProvider, PythiaUnavailableError


class EnhancementProvider(Protocol):
    name: str
    model: str

    def generate(self, payload: dict[str, object]) -> object: ...


class PythiaEnhancementProvider:
    name = "Pythia Engine"
    model = "engine-managed"

    def __init__(self) -> None:
        self.engine = PythiaProvider()

    def generate(self, payload: dict[str, object]) -> object:
        try:
            health = self.engine.health()
            capabilities = self.engine.capabilities()
        except PythiaUnavailableError as error:
            raise RuntimeError(f"Intelligence Engine is unavailable: {error}") from error
        if health.get("status") != "ok":
            raise RuntimeError("Intelligence Engine is unavailable")
        capability_entries = capabilities.get("capabilities", capabilities)
        if not isinstance(capability_entries, dict) or "storyboard.enhance" not in capability_entries:
            raise RuntimeError("Intelligence Engine does not support storyboard enhancement")

        project_id = str(payload["projectId"])
        scenes = payload["scenes"]
        references = payload["references"]
        if not isinstance(scenes, list) or not isinstance(references, list):
            raise RuntimeError("Enhancement input is invalid")
        inputs = [{
            "scene_id": scene["id"],
            "source_ref": f"chimera://{project_id}/scenes/{scene['id']}",
            "scene_content": {
                "title": scene["title"],
                "body_text": "\n".join(scene["learnerText"]),
                "action_description": scene["actionDescription"],
                "narration": scene["narration"],
            },
        } for scene in scenes]
        task_id = f"chimera-enhancement-{uuid4().hex}"
        try:
            submitted = self.engine.submit_task({
                "schema_version": "1.0",
                "task_id": task_id,
                "capability": "storyboard.enhance",
                "consumer": "chimera",
                "project_id": project_id,
                "inputs": inputs,
                "constraints": {},
                "context": {
                    "goal": payload["goal"],
                    "source_revision": payload["sourceRevision"],
                    "references": [{
                        "resource_id": resource["id"],
                        "title": resource["title"],
                        "version": resource["version"],
                        "passages": [{"locator": passage["locator"], "text": passage["text"]} for passage in resource["passages"]],
                    } for resource in references],
                },
            })
        except (PythiaUnavailableError, KeyError, TypeError) as error:
            raise RuntimeError(f"Intelligence Engine could not accept the enhancement task: {error}") from error
        if submitted.get("task_id") != task_id or submitted.get("status") != "submitted":
            raise RuntimeError("Intelligence Engine did not accept the enhancement task")

        deadline = time.monotonic() + 120
        while time.monotonic() < deadline:
            try:
                task = self.engine.task_status(task_id)
            except PythiaUnavailableError as error:
                raise RuntimeError(f"Intelligence Engine task status is unavailable: {error}") from error
            if task.get("status") == "awaiting_review":
                artifact_id = task.get("artifact_id")
                if not isinstance(artifact_id, str) or not artifact_id:
                    raise RuntimeError("Intelligence Engine completed without an artifact")
                try:
                    envelope = self.engine.artifact(artifact_id)
                except PythiaUnavailableError as error:
                    raise RuntimeError(f"Intelligence Engine artifact is unavailable: {error}") from error
                result = envelope.get("payload")
                expected_scene_ids = [scene["id"] for scene in scenes]
                if (
                    not isinstance(envelope.get("artifact"), dict)
                    or envelope["artifact"].get("type") != "storyboard-enhancement"
                    or envelope.get("status") != "draft"
                    or not isinstance(envelope.get("validation"), dict)
                    or envelope["validation"].get("state") != "passed"
                    or not isinstance(result, dict)
                    or result.get("project_id") != project_id
                    or result.get("source_revision") != payload["sourceRevision"]
                    or result.get("source_scene_ids") != expected_scene_ids
                ):
                    raise RuntimeError("Intelligence Engine returned an invalid enhancement artifact")
                return {"proposals": result.get("proposals"), "resourceConflicts": result.get("resource_conflicts", [])}
            if task.get("status") in {"failed", "cancelled"}:
                raise RuntimeError(str(task.get("error") or f"Intelligence Engine task {task['status']}"))
            time.sleep(0.25)
        raise RuntimeError("Intelligence Engine task did not finish within 120 seconds")


class LocalPythiaEnhancementProvider:
    name = "Pythia local live drafting"
    model = "configured-text-model"

    def generate(self, payload: dict[str, object]) -> object:
        from . import pythia_talk as talk
        if not talk.CAPACITY.acquire(blocking=False):
            raise RuntimeError("Two Pythia operations are already active. Retry explicitly when one finishes.")
        try:
            return talk.local_mcp(enhancement_request=payload)
        finally:
            talk.CAPACITY.release()


def _provider() -> EnhancementProvider:
    from .platform import get_actor_context
    if get_actor_context().deploymentMode == "single-user":
        return LocalPythiaEnhancementProvider()
    return PythiaEnhancementProvider()


def _load_job_context(job: EnhancementJob) -> tuple[dict[str, object], dict[tuple[str, str, str], str]]:
    project = storage.read_project(job.projectId)
    if project.storyboard.revision != job.sourceRevision:
        raise ValueError(
            f"Storyboard changed after submission from revision {job.sourceRevision} "
            f"to {project.storyboard.revision}. Submit a new enhancement run."
        )
    scene_map = {scene.id: scene for scene in project.storyboard.scenes}
    if set(job.sceneIds) - set(scene_map):
        raise ValueError("A selected scene no longer exists. Submit a new enhancement job.")
    resources = {resource.id: resource for resource in storage.list_reference_resources(job.projectId)}
    selected_resources = []
    locator_text: dict[tuple[str, str, str], str] = {}
    for resource_id in job.resourceIds:
        resource = resources.get(resource_id)
        if resource is None:
            raise ValueError("A selected reference resource no longer exists")
        version_number = job.resourceVersions.get(resource_id)
        version = next((item for item in resource.versions if item.version == version_number), None)
        if version is None:
            raise ValueError("A selected reference version is no longer available")
        if version.extractionStatus != "complete" or not version.passages:
            raise ValueError("A selected reference has no complete readable text. Remove it or upload a readable source.")
        selected_resources.append({
            "id": resource.id,
            "title": resource.title,
            "classification": resource.classification,
            "authoritative": resource.authoritative,
            "version": version.version,
            "passages": [passage.model_dump(mode="json") for passage in version.passages],
        })
        locator_text.update({(resource.id, version.version, passage.locator): passage.text for passage in version.passages})
    selected_scenes = [scene_context(scene_map[scene_id]) for scene_id in job.sceneIds]
    global_fields = {"sceneOrder", "storyboardTitle", "completionSettings"}
    allowed_fields = [field for field in get_args(EnhancementField) if job.scope == "whole-course" or field not in global_fields]
    scene_schema = SceneUpdate.model_json_schema()
    payload: dict[str, object] = {
        "projectId": job.projectId,
        "goal": job.goal,
        "sourceRevision": job.sourceRevision,
        "course": course_context(project),
        "scenes": selected_scenes,
        "references": selected_resources,
        "allowedFields": allowed_fields,
        "fieldValueSchemas": {
            "$defs": scene_schema.get("$defs", {}),
            "sceneFields": {field: schema for field, schema in scene_schema["properties"].items() if field in allowed_fields},
            "additionalScenes": {"type": "array", "minItems": 1, "maxItems": 40, "items": EnhancementSceneDraft.model_json_schema()},
            "globalFields": {
                "sceneOrder": {"type": "array", "items": {"type": "string", "enum": job.sceneIds}, "minItems": len(job.sceneIds), "maxItems": len(job.sceneIds), "uniqueItems": True},
                "storyboardTitle": {"type": "string", "minLength": 1, "maxLength": 120},
                "completionSettings": CourseCompletionSettings.model_json_schema(),
            } if job.scope == "whole-course" else {},
        },
        "outputSchema": {
            "proposals": [{
                "changes": [{"targetSceneId": "scene-id", "field": "supported proposal field", "proposedValue": "field value"}],
                "rationale": "why this helps",
                "referenceCitations": [{"resourceId": "resource-id", "version": "version", "locator": "page/slide/paragraph locator", "excerpt": "exact source excerpt"}],
            }],
            "resourceConflicts": [{
                "explanation": "How the supplied source passages disagree",
                "citations": [{"resourceId": "resource-id", "version": "version", "locator": "page/slide/paragraph locator", "excerpt": "exact source excerpt"}],
            }],
        },
    }
    if job.useTools:
        payload.update({"useTools": True, "allowWebResearch": job.allowWebResearch})
    return payload, locator_text


def preview_enhancement_submission(project_id: str, data: EnhancementJobCreate) -> dict[str, object]:
    project = storage.read_project(project_id)
    scene_ids = [scene.id for scene in project.storyboard.scenes] if data.scope == "whole-course" else data.sceneIds
    resources = {resource.id: resource for resource in storage.list_reference_resources(project_id)}
    selected_resources = [resources[resource_id] for resource_id in data.resourceIds if resource_id in resources]
    timestamp = storage.now_iso()
    preview_job = EnhancementJob(
        id="enhancement-preview",
        projectId=project_id,
        sourceRevision=project.storyboard.revision,
        scope=data.scope,
        sceneIds=scene_ids,
        goal=data.goal,
        resourceIds=data.resourceIds,
        resourceVersions={resource.id: resource.currentVersion for resource in selected_resources},
        useTools=data.useTools,
        allowWebResearch=data.allowWebResearch,
        createdAt=timestamp,
        updatedAt=timestamp,
    )
    payload, _ = _load_job_context(preview_job)
    serialized_payload = json.dumps(payload, ensure_ascii=False)
    estimated_tokens = max(1, len(serialized_payload) // 4)
    tool_catalog = []
    web_research = False
    try:
        if isinstance(_provider(), LocalPythiaEnhancementProvider):
            from . import pythia_talk as talk
            capabilities = talk.local_mcp()
            engine_configured = capabilities.get("storyboard_enhancements") is True
            tool_catalog = capabilities.get("authoring_tools", [])
            web_research = capabilities.get("web_research") is True
            if data.useTools:
                engine_configured = engine_configured and capabilities.get("authoring_orchestration") is True
            if data.allowWebResearch:
                engine_configured = engine_configured and web_research
        else:
            if data.useTools:
                raise ValueError("Shared Engine connections do not execute authoring tools")
            engine = PythiaProvider()
            capabilities = engine.capabilities().get("capabilities", {})
            engine_configured = engine.health().get("status") == "ok" and isinstance(capabilities, (dict, list)) and "storyboard.enhance" in capabilities
    except (PythiaUnavailableError, ValueError, RuntimeError):
        engine_configured = False
    return {
        "sourceRevision": project.storyboard.revision,
        "sceneCount": len(scene_ids),
        "resourceCount": len(selected_resources),
        "estimatedInputTokens": estimated_tokens,
        "estimatedCostUsd": None,
        "engineConfigured": engine_configured,
        "payload": payload,
        "tools": tool_catalog,
        "webResearchAvailable": web_research,
        "maxProviderRequests": 7 if data.useTools else 1,
    }


def _validate_provider_proposals(
    job: EnhancementJob,
    output: object,
    provider: EnhancementProvider,
    locator_text: dict[tuple[str, str, str], str],
) -> tuple[list[EnhancementProposalCreate], bool, list[EnhancementResourceConflict]]:
    if isinstance(output, dict):
        raw_proposals = output.get("proposals")
        raw_conflicts = output.get("resourceConflicts", [])
    else:
        raw_proposals = output
        raw_conflicts = []
    if not isinstance(raw_proposals, list) or not isinstance(raw_conflicts, list):
        raise ValueError("Provider response must contain proposal and resource-conflict arrays")
    if len(raw_proposals) > 100 or len(raw_conflicts) > 50:
        raise ValueError("Provider returned too many proposals")
    valid_scene_ids = set(job.sceneIds)
    proposals: list[EnhancementProposalCreate] = []
    conflicting_fields: set[tuple[str | None, str]] = set()
    suggested_values: dict[tuple[str | None, str], str] = {}
    additional_scene_count = 0
    for item in raw_proposals:
        if not isinstance(item, dict):
            raise ValueError("Each generated proposal must be an object")
        raw_changes = item.get("changes")
        if not isinstance(raw_changes, list) or not raw_changes:
            raise ValueError("Each generated proposal must contain at least one change")
        normalized_changes = []
        for raw_change in raw_changes:
            if not isinstance(raw_change, dict):
                raise ValueError("Each proposed change must be an object")
            target_scene_id = raw_change.get("targetSceneId")
            if target_scene_id is not None and target_scene_id not in valid_scene_ids:
                raise ValueError("Provider referenced a scene outside the submitted selection")
            if target_scene_id is None and raw_change.get("field") not in {"sceneOrder", "storyboardTitle", "completionSettings"}:
                raise ValueError("Provider returned a global change for a scene-only field")
            if target_scene_id is None and job.scope != "whole-course":
                raise ValueError("Selected-scene runs cannot propose whole-course changes")
            if raw_change.get("field") == "additionalScenes":
                values = raw_change.get("proposedValue")
                if not isinstance(values, list) or not 1 <= len(values) <= 40:
                    raise ValueError("Expansion must contain 1-40 new scenes per anchor")
                for value in values:
                    EnhancementSceneDraft.model_validate(value)
                additional_scene_count += len(values)
                if additional_scene_count > 100:
                    raise ValueError("Expand at most 100 scenes per run. Select fewer anchor scenes.")
            normalized_changes.append({
                "targetSceneId": target_scene_id,
                "field": raw_change.get("field"),
                "proposedValue": raw_change.get("proposedValue"),
            })
            if any(change["targetSceneId"] == target_scene_id and change["field"] == raw_change.get("field") for change in normalized_changes[:-1]):
                raise ValueError("A proposal cannot change the same field more than once")
            key = (target_scene_id, str(raw_change.get("field")))
            value = json.dumps(raw_change.get("proposedValue"), sort_keys=True, ensure_ascii=False)
            prior_value = suggested_values.get(key)
            if prior_value is not None and prior_value != value:
                conflicting_fields.add(key)
            suggested_values[key] = value
        citations: list[EnhancementReferenceCitation] = []
        raw_citations = item.get("referenceCitations", [])
        if not isinstance(raw_citations, list):
            raise ValueError("Reference citations must be an array")
        for raw_citation in raw_citations:
            citation = EnhancementReferenceCitation.model_validate(raw_citation)
            source = locator_text.get((citation.resourceId, citation.version or "", citation.locator or ""))
            if source is None:
                raise ValueError("Provider cited a resource version or locator that was not submitted")
            if not citation.excerpt or citation.excerpt not in source:
                raise ValueError("Provider citation excerpt must match the cited source passage")
            citations.append(citation)
        proposals.append(EnhancementProposalCreate(
            changes=normalized_changes,
            rationale=str(item.get("rationale", "")),
            origin="ai",
            provider=provider.name,
            model=provider.model,
            affectedIds=list({change["targetSceneId"] for change in normalized_changes if change["targetSceneId"]}),
            dependencyGroupId=item.get("dependencyGroupId"),
            referenceCitations=citations,
            jobId=job.id,
        ))
        if any(change.field == "additionalScenes" for change in proposals[-1].changes) and any(
            change.field == "sceneOrder" for change in proposals[-1].changes
        ):
            raise ValueError("Expansion and reordering must be reviewed separately")
    conflicts: list[EnhancementResourceConflict] = []
    for raw_conflict in raw_conflicts:
        if not isinstance(raw_conflict, dict):
            raise ValueError("Each resource conflict must be an object")
        citations = [EnhancementReferenceCitation.model_validate(item) for item in raw_conflict.get("citations", [])]
        if len(citations) < 2:
            raise ValueError("Each resource conflict must cite at least two passages")
        for citation in citations:
            source = locator_text.get((citation.resourceId, citation.version or "", citation.locator or ""))
            if source is None or not citation.excerpt or citation.excerpt not in source:
                raise ValueError("Resource conflict citations must match submitted source passages")
        conflicts.append(EnhancementResourceConflict(explanation=str(raw_conflict.get("explanation", "")), citations=citations))
    return proposals, bool(conflicting_fields), conflicts


_registry_lock = threading.Lock()
_active_threads: dict[str, threading.Thread] = {}
_provider_factory = _provider


def start_enhancement_job(project_id: str, job_id: str) -> None:
    with _registry_lock:
        current = _active_threads.get(job_id)
        if current and current.is_alive():
            return
        thread = threading.Thread(target=copy_context().run, args=(_run_job, project_id, job_id), name=job_id, daemon=True)
        _active_threads[job_id] = thread
        thread.start()


def recover_enhancement_jobs() -> None:
    for project in storage.list_projects():
        for job in storage.list_enhancement_jobs(project.id):
            if job.status in {"queued", "running"}:
                if job.useTools:
                    storage.update_enhancement_job(
                        project.id, job.id, status="failed", progress=100,
                        message="Interrupted authoring tool run was not replayed",
                        error="The server restarted before this tool run completed. It may have incurred charges. Inspect retained results and retry explicitly; no automatic replay.",
                    )
                    continue
                if job.cancelRequested:
                    storage.update_enhancement_job(project.id, job.id, status="cancelled", progress=100, message="Cancelled before server restart")
                    continue
                if job.status == "running":
                    job = storage.update_enhancement_job(project.id, job.id, status="queued", message="Resuming after server restart", progress=0)
                start_enhancement_job(project.id, job.id)


def _run_job(project_id: str, job_id: str) -> None:
    try:
        with storage.storyboard_transaction():
            job = storage.read_enhancement_job(project_id, job_id)
            if job.status != "queued":
                return
            if job.cancelRequested:
                storage.update_enhancement_job(project_id, job_id, status="cancelled", message="Cancelled before processing", progress=100)
                return
            job = storage.update_enhancement_job(project_id, job_id, status="running", message="Preparing selected content", progress=5)
        if job.cancelRequested:
            return
        provider = _provider() if _provider_factory is _provider else _provider_factory()
        payload, locator_text = _load_job_context(job)
        serialized_payload = json.dumps(payload, ensure_ascii=False)
        token_estimate = max(1, len(serialized_payload) // 4)
        cost_rate = os.environ.get("CHIMERA_AI_INPUT_USD_PER_MILLION")
        cost_estimate = float(cost_rate) * token_estimate / 1_000_000 if cost_rate else None
        job = storage.update_enhancement_job(
            project_id,
            job_id,
            progress=20,
            message=("Pythia is planning and executing permitted authoring tools (up to 3 calls); execution records appear when the run returns"
                     if job.useTools else "Submitting selected content to the configured provider"),
            provider=provider.name,
            model=provider.model,
            estimatedInputTokens=token_estimate,
            estimatedCostUsd=cost_estimate,
        )
        raw_output = provider.generate(payload)
        job = storage.read_enhancement_job(project_id, job_id)
        if job.cancelRequested:
            storage.update_enhancement_job(project_id, job_id, status="cancelled", progress=100, message="Cancelled; provider output was discarded")
            return
        if job.useTools:
            if not isinstance(raw_output, dict):
                raise ValueError("Pythia returned no orchestration execution record")
            executions = [EnhancementToolExecution.model_validate(item) for item in raw_output.get("toolExecutions", [])]
            sources = [EnhancementResearchSource.model_validate(item) for item in raw_output.get("researchSources", [])]
            allowed_tools = {"research.synthesize", "learning.design-brief", "storyboard.analyze",
                             "assessment.blueprint", "standards.select", "evaluation.plan"}
            if job.allowWebResearch:
                allowed_tools.add("research_web")
            if (len(executions) > 3 or len(sources) > 36
                    or [item.sequence for item in executions] != list(range(1, len(executions) + 1))
                    or any(item.tool not in allowed_tools for item in executions)
                    or len({source.id for source in sources}) != len(sources)):
                raise ValueError("Pythia returned invalid or unpermitted tool execution records")
            if sources and not any(item.tool == "research_web" and item.status == "completed" for item in executions):
                raise ValueError("Research evidence has no completed web-search execution")
            storage.update_enhancement_job(project_id, job_id, toolExecutions=executions, researchSources=sources)
            orchestration_error = raw_output.get("orchestrationError")
            if orchestration_error:
                if not isinstance(orchestration_error, str):
                    raise ValueError("Pythia returned an invalid orchestration error")
                raise ValueError(orchestration_error[:2000])
            if not executions or any(item.status != "completed" for item in executions):
                raise ValueError("Pythia tool orchestration did not complete. Inspect the retained execution results; nothing was applied. Retry explicitly.")
            if job.allowWebResearch and (not sources or executions[0].tool != "research_web"):
                raise ValueError("Selected public web research requires a completed search with cited sources before specialist drafting. Nothing was applied; no automatic retry.")
            for source in sources:
                locator_text.update({(source.id, source.version, passage.locator): passage.text for passage in source.passages})
        storage.update_enhancement_job(project_id, job_id, progress=75, message="Validating structured proposals and source citations")
        proposals, has_conflicts, resource_conflicts = _validate_provider_proposals(job, raw_output, provider, locator_text)
        if not proposals:
            storage.update_enhancement_job(project_id, job_id, resourceConflicts=resource_conflicts)
            raise ValueError(
                "Pythia returned no actionable suggestions. No changes were made. "
                "Review the goal and selected readable references, then submit a new run. "
                "The legacy Engine only fills missing action descriptions; it cannot expand scenes or run @research."
            )
        stored_proposals = []
        with storage.storyboard_transaction():
            job = storage.read_enhancement_job(project_id, job_id)
            if job.cancelRequested:
                storage.update_enhancement_job(project_id, job_id, status="cancelled", progress=100, message="Cancelled before proposals were saved")
                return
            current_revision = storage.read_project(project_id).storyboard.revision
            if current_revision != job.sourceRevision:
                raise ValueError(
                    f"Storyboard changed during enhancement from revision {job.sourceRevision} "
                    f"to {current_revision}. No proposals were saved; submit a new run."
                )
            project = storage.read_project(project_id)
            for proposal in proposals:
                for change in proposal.changes:
                    storage._snapshot_proposal_change(project, change)
            for proposal_index, proposal_data in enumerate(proposals):
                proposal_data = proposal_data.model_copy(update={"jobId": f"{job.id}:{proposal_index}"})
                stored_proposals.append(storage.create_enhancement_proposal(project_id, proposal_data))
            completed = storage.update_enhancement_job(
                project_id,
                job_id,
                status="completed",
                progress=100,
                message=f"Created {len(stored_proposals)} pending proposal(s)",
                proposalIds=[proposal.id for proposal in stored_proposals],
                resourceConflicts=resource_conflicts,
                error=None,
            )
        if has_conflicts:
            storage.update_enhancement_job(project_id, job_id, message=completed.message + ". Conflicting suggestions are kept separate for author review.")
    except Exception as error:
        try:
            current = storage.read_enhancement_job(project_id, job_id)
            if current.status not in {"cancelled", "completed"}:
                storage.update_enhancement_job(project_id, job_id, status="failed", progress=100, message="Enhancement failed", error=str(error)[:2000])
        except Exception:
            pass
    finally:
        with _registry_lock:
            _active_threads.pop(job_id, None)


def cancel_enhancement_job(project_id: str, job_id: str) -> EnhancementJob:
    job = storage.read_enhancement_job(project_id, job_id)
    if job.status in {"completed", "failed", "cancelled"}:
        raise ValueError("Only queued or running jobs can be cancelled")
    if job.status == "queued":
        return storage.update_enhancement_job(project_id, job_id, status="cancelled", cancelRequested=True, progress=100, message="Cancelled before processing")
    return storage.update_enhancement_job(project_id, job_id, cancelRequested=True, message="Cancellation requested")


def retry_enhancement_job(project_id: str, job_id: str) -> EnhancementJob:
    previous = storage.read_enhancement_job(project_id, job_id)
    if previous.status not in {"failed", "cancelled"}:
        raise ValueError("Only failed or cancelled jobs can be retried")
    request = {
        "scope": previous.scope,
        "sceneIds": previous.sceneIds if previous.scope == "selected-scenes" else [],
        "goal": previous.goal,
        "resourceIds": previous.resourceIds,
        "useTools": previous.useTools,
        "allowWebResearch": previous.allowWebResearch,
    }
    new_job = storage.create_enhancement_job(
        project_id,
        EnhancementJobCreate.model_validate(request),
        previous.resourceVersions,
    )
    new_job = storage.update_enhancement_job(project_id, new_job.id, retryOf=previous.id)
    start_enhancement_job(project_id, new_job.id)
    return new_job
