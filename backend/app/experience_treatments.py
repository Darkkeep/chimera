"""Private scene-level proposals with explicit source sharing and apply authority."""
import hashlib
import json
from contextvars import copy_context
from threading import Thread
from uuid import uuid4

from . import pythia_talk as talk, storage
from .experience_models import ExperienceDesignRequest, ExperienceReview, ExperienceTreatment
from .models import SceneUpdate


CAPABILITIES = {
    "native": ["responsive concept flow", "click-reveal explanations", "show all explanations",
               "replayable diagram motion", "reduced motion", "contrast-checked colors"],
    "notExecuted": ["media generation", "music licensing", "video rendering", "scored assessments"],
}


def _path(project_id, scene_id, actor):
    base = talk.state_path(project_id, actor)
    return base.with_name(base.stem + "-experience-" + hashlib.sha256(scene_id.encode()).hexdigest() + ".json")


def _read(path):
    state = json.loads(path.read_text(encoding="utf-8")) if path.is_file() else {"draft": None, "operation": None}
    operation = state["operation"]
    if operation and operation["status"] == "running" and operation["runId"] != talk.RUN_ID:
        operation.update(status="failed", error="Chimera restarted during design. No scene changes were applied. Retry explicitly.")
        talk.write_state(path, state)
    return state


def context(project_id, scene_id, actor, source_ids=()):
    project = storage.read_project(project_id)
    scene = next((scene for scene in project.storyboard.scenes if scene.id == scene_id), None)
    if scene is None:
        raise talk.TalkError("Scene not found.", 404)
    resources = storage.list_reference_resources(project_id)
    selected, catalog = [], []
    if len(set(source_ids)) != len(source_ids) or len(source_ids) > 5:
        raise talk.TalkError("Select up to five distinct reference sources.")
    for resource in resources:
        version = next(version for version in resource.versions if version.version == resource.currentVersion)
        metadata = {"id": resource.id, "title": resource.title, "version": version.version,
                    "sha256": version.sha256, "authoritative": resource.authoritative}
        catalog.append(metadata)
        if resource.id in source_ids:
            if version.extractionStatus != "complete":
                raise talk.TalkError(f"Source '{resource.title}' is not fully extracted. Review it in Sources before sharing.")
            selected.append({**metadata, "passages": [passage.model_dump() for passage in version.passages]})
    if set(source_ids) != {source["id"] for source in selected}:
        raise talk.TalkError("A selected source is no longer available. Reload context.", 409)
    if len(json.dumps(selected)) > 500000:
        raise talk.TalkError("Selected source text exceeds this treatment's 500,000-character allowance. Select fewer sources; no text was dropped.")
    planning = talk.read_state(talk.state_path(project_id, actor)).get("planning", {})
    brief = planning.get("brief", "") if planning.get("stage") == "designing" else ""
    value = {"revision": project.storyboard.revision, "scene": scene.model_dump(),
             "designBrief": brief, "sources": catalog, "selectedSources": selected, "capabilities": CAPABILITIES}
    value["fingerprint"] = hashlib.sha256(json.dumps(value, sort_keys=True).encode()).hexdigest()
    value["assemblyBlocked"] = bool(scene.assessmentItem or scene.visualLayout and scene.visualLayout.timeline)
    return value


def _public(state, ctx):
    operation = state["operation"]
    return {"context": ctx, "draft": state["draft"],
            "operation": {key: value for key, value in operation.items() if key not in {"runId", "fingerprint"}} if operation else None}


def get(project_id, scene_id, actor, source_ids=()):
    with storage.storyboard_transaction():
        return _public(_read(_path(project_id, scene_id, actor)), context(project_id, scene_id, actor, source_ids))


def submit(project_id, scene_id, actor, data: ExperienceDesignRequest, authorize):
    talk.checkout()
    authorize()
    with storage.storyboard_transaction():
        path = _path(project_id, scene_id, actor)
        state = _read(path)
        ctx = context(project_id, scene_id, actor, data.sourceIds)
        digest = hashlib.sha256(json.dumps(data.model_dump(), sort_keys=True).encode()).hexdigest()
        operation = state["operation"]
        if operation and operation["requestId"] == data.requestId:
            if digest != operation["fingerprint"]:
                raise talk.TalkError("That request ID belongs to another design request.", 409)
            return _public(state, ctx)
        if operation and operation["status"] == "running":
            raise talk.TalkError("Pythia is already designing this scene.", 409)
        if ctx["fingerprint"] != data.contextFingerprint:
            raise talk.TalkError("Scene, brief or sources changed. Reload the context before designing.", 409)
        if ctx["assemblyBlocked"]:
            raise talk.TalkError("This first native assembly supports content scenes without existing assessment or timeline components. Those components will not be overwritten.", 409)
        if not talk.CAPACITY.acquire(blocking=False):
            raise talk.TalkError("Two Pythia requests are active. Try again when one finishes.", 429)
        request = {"scene": ctx["scene"], "designBrief": ctx["designBrief"] if data.includeDesignBrief else "",
                   "sources": ctx["selectedSources"], "direction": data.direction,
                   "currentTreatment": data.currentTreatment.model_dump() if data.currentTreatment else None,
                   "capabilities": CAPABILITIES}
        state["operation"] = {"requestId": data.requestId, "status": "running", "error": None,
                              "runId": talk.RUN_ID, "fingerprint": digest}
        try:
            talk.write_state(path, state)
            Thread(target=copy_context().run, args=(_finish, path, project_id, scene_id, actor, data, ctx, request, authorize), daemon=True).start()
        except Exception:
            talk.CAPACITY.release()
            state["operation"].update(status="failed", error="Design could not start. Retry explicitly; nothing was applied.")
            talk.write_state(path, state)
            raise talk.TalkError("Design could not start. Nothing was applied.", 503) from None
        return _public(state, ctx)


def _finish(path, project_id, scene_id, actor, data, ctx, request, authorize):
    try:
        authorize()
        treatment = ExperienceTreatment.model_validate(talk.local_mcp(experience_request=request))
        authorize()
        with storage.storyboard_transaction():
            state = _read(path)
            if context(project_id, scene_id, actor, data.sourceIds)["fingerprint"] != ctx["fingerprint"]:
                raise talk.TalkError("Design context changed while Pythia was working. No changes were applied; request a fresh design.", 409)
            state["draft"] = {"id": uuid4().hex, "status": "pending", "treatment": treatment.model_dump(),
                              "contextFingerprint": ctx["fingerprint"], "sourceRevision": ctx["revision"],
                              "sourceIds": data.sourceIds, "provenance": {
                                  "sceneId": scene_id, "revision": ctx["revision"], "direction": data.direction,
                                  "designBrief": request["designBrief"], "sources": [
                                      {key: value for key, value in source.items() if key != "passages"} for source in ctx["selectedSources"]],
                              }}
            state["operation"].update(status="completed", error=None)
            talk.write_state(path, state)
    except Exception as error:
        message = str(error) if isinstance(error, talk.TalkError) else "Pythia could not produce a valid experience or access changed. Nothing was applied. Retry explicitly."
        with storage.storyboard_transaction():
            state = _read(path)
            state["operation"].update(status="failed", error=message)
            talk.write_state(path, state)
    finally:
        talk.CAPACITY.release()


def review(project_id, scene_id, actor, data: ExperienceReview, *, apply=False, expected_revision=None):
    with storage.storyboard_transaction():
        path = _path(project_id, scene_id, actor)
        state = _read(path)
        draft = state["draft"]
        if not draft or draft["id"] != data.draftId:
            raise talk.TalkError("This draft was replaced. Reload before reviewing.", 409)
        ctx = context(project_id, scene_id, actor, draft["sourceIds"])
        if draft["status"] == "applied":
            if apply and draft["treatment"] == data.treatment.model_dump():
                return {**_public(state, ctx), "project": storage.read_project(project_id).model_dump()}
            raise talk.TalkError("This treatment is already applied. Request a refinement to make further changes.", 409)
        if state["operation"] and state["operation"]["status"] == "running":
            raise talk.TalkError("Wait for the current design request.", 409)
        if ctx["fingerprint"] != draft["contextFingerprint"]:
            raise talk.TalkError("Scene, brief or sources changed. Refine using current context before saving or applying.", 409)
        if apply and any(need.requiredBeforeApply for need in data.treatment.productionNeeds):
            raise talk.TalkError("Resolve required production dependencies before applying the experience.", 409)
        draft["treatment"] = data.treatment.model_dump()
        project = None
        if apply:
            if expected_revision != ctx["revision"]:
                raise talk.TalkError("The storyboard revision changed. Reload before applying.", 412)
            project = storage.update_scene(project_id, scene_id, SceneUpdate(experience=data.treatment.experience), expected_revision=expected_revision)
            draft.update(status="applied", appliedRevision=project.storyboard.revision)
        talk.write_state(path, state)
        current = context(project_id, scene_id, actor, draft["sourceIds"]) if project else ctx
        return {**_public(state, current), "project": project.model_dump() if project else None}
