"""Private scene-aware video design, independent of billable media renders."""
import hashlib
import json
from threading import Thread

from pydantic import BaseModel, ConfigDict, Field

from . import pythia_talk as talk, storage
from .models import ReviewedVideoTreatment, VideoTreatment


class TreatmentRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    requestId: str = Field(pattern=r"^[a-zA-Z0-9][a-zA-Z0-9_-]{7,79}$")
    sourceRevision: int = Field(ge=1, strict=True)
    contextFingerprint: str = Field(pattern=r"^[a-f0-9]{64}$")
    direction: str = Field(min_length=1, max_length=2000)
    durationSeconds: int = Field(ge=4, le=30, strict=True)
    includeDesignBrief: bool = True
    currentTreatment: VideoTreatment | None = None


def _path(project_id, scene_id, actor):
    path = talk.state_path(project_id, actor)
    return path.with_name(path.stem + "-video-" + hashlib.sha256(scene_id.encode()).hexdigest() + ".json")


def _read(path):
    state = json.loads(path.read_text(encoding="utf-8")) if path.is_file() else {"draft": None, "operation": None}
    operation = state["operation"]
    if operation and operation["status"] == "running" and operation["runId"] != talk.RUN_ID:
        operation.update(status="failed", error="Chimera restarted while designing. Nothing was rendered. Retry explicitly.")
        talk.write_state(path, state)
    return state


def _context(project_id, scene_id, actor):
    project = storage.read_project(project_id)
    scene = next((scene for scene in project.storyboard.scenes if scene.id == scene_id), None)
    if scene is None:
        raise talk.TalkError("Scene not found.", 404)
    planning = talk.read_state(talk.state_path(project_id, actor)).get("planning", {})
    context = {"sourceRevision": project.storyboard.revision,
               "scene": scene.model_dump(include={"title", "extractedText", "narration", "actionDescription", "notes"}),
               "designBrief": planning.get("brief", "") if planning.get("stage") == "designing" else ""}
    if scene.experience:
        context["scene"]["experience"] = scene.experience.model_dump()
    context["fingerprint"] = hashlib.sha256(json.dumps(context, sort_keys=True).encode()).hexdigest()
    return context


def _public(state, context):
    operation = state["operation"]
    return {"context": context, "draft": state["draft"],
            "operation": {key: value for key, value in operation.items() if key not in {"fingerprint", "runId"}} if operation else None}


def get(project_id, scene_id, actor):
    with storage.storyboard_transaction():
        return _public(_read(_path(project_id, scene_id, actor)), _context(project_id, scene_id, actor))


def submit(project_id, scene_id, actor, data, authorize):
    talk.checkout()
    authorize()
    if not data.direction.strip():
        raise talk.TalkError("Describe the learning purpose or requested refinement.")
    with storage.storyboard_transaction():
        context = _context(project_id, scene_id, actor)
        path = _path(project_id, scene_id, actor)
        state = _read(path)
        fingerprint = hashlib.sha256(json.dumps(data.model_dump(), sort_keys=True).encode()).hexdigest()
        operation = state["operation"]
        if operation and operation["requestId"] == data.requestId:
            if operation["fingerprint"] != fingerprint:
                raise talk.TalkError("This request ID belongs to a different treatment request.", 409)
            return _public(state, context)
        if operation and operation["status"] == "running":
            raise talk.TalkError("Pythia is already designing this scene's treatment.", 409)
        if data.sourceRevision != context["sourceRevision"] or data.contextFingerprint != context["fingerprint"]:
            raise talk.TalkError("Scene context or agreed brief changed. Refresh before designing.", 409)
        if not talk.CAPACITY.acquire(blocking=False):
            raise talk.TalkError("Two Pythia requests are already active. Try again when one finishes.", 429)
        request = {"scene": context["scene"], "designBrief": context["designBrief"] if data.includeDesignBrief else "",
                   "direction": data.direction, "durationSeconds": data.durationSeconds,
                   "currentTreatment": data.currentTreatment.model_dump() if data.currentTreatment else None}
        state["operation"] = {"requestId": data.requestId, "status": "running", "error": None,
                              "runId": talk.RUN_ID, "fingerprint": fingerprint}
        try:
            talk.write_state(path, state)
            Thread(target=_finish, args=(path, project_id, scene_id, actor, data, request, context, authorize), daemon=True).start()
        except Exception:
            talk.CAPACITY.release()
            state["operation"].update(status="failed", error="The design request could not be started. Retry explicitly.")
            talk.write_state(path, state)
            raise talk.TalkError("The design request could not be started. Retry explicitly.", 503) from None
        return _public(state, context)


def _finish(path, project_id, scene_id, actor, data, request, context, authorize):
    try:
        authorize()
        treatment = VideoTreatment.model_validate(talk.local_mcp(video_request=request))
        if sum(shot.durationSeconds for shot in treatment.shots) != data.durationSeconds:
            raise talk.TalkError("Pythia returned timing that does not match your requested duration. Nothing was rendered.")
        authorize()
        with storage.storyboard_transaction():
            state = _read(path)
            current = _context(project_id, scene_id, actor)
            if current["sourceRevision"] != data.sourceRevision or (data.includeDesignBrief and current["designBrief"] != context["designBrief"]):
                raise talk.TalkError("Scene or design brief changed while designing. Nothing was rendered; design again.")
            state["draft"] = {"sourceRevision": data.sourceRevision, "treatment": treatment.model_dump(),
                              "designBrief": request["designBrief"], "usesDesignBrief": data.includeDesignBrief}
            state["operation"].update(status="completed", error=None)
            talk.write_state(path, state)
    except Exception as error:
        message = str(error) if isinstance(error, talk.TalkError) else "Pythia could not produce a valid video treatment or access changed. Nothing was rendered. Retry explicitly."
        with storage.storyboard_transaction():
            state = _read(path)
            state["operation"].update(status="failed", error=message)
            talk.write_state(path, state)
    finally:
        talk.CAPACITY.release()


def save(project_id, scene_id, actor, data: ReviewedVideoTreatment):
    with storage.storyboard_transaction():
        context = _context(project_id, scene_id, actor)
        path = _path(project_id, scene_id, actor)
        state = _read(path)
        if state["operation"] and state["operation"]["status"] == "running":
            raise talk.TalkError("Wait for Pythia to finish before saving edits.", 409)
        if context["sourceRevision"] != data.sourceRevision:
            raise talk.TalkError("Scene context changed. Review a new treatment before saving.", 409)
        if not state["draft"] or state["draft"]["sourceRevision"] != data.sourceRevision:
            raise talk.TalkError("Design a treatment for the current scene context before saving edits.", 409)
        if state["draft"]["usesDesignBrief"] and state["draft"]["designBrief"] != context["designBrief"]:
            raise talk.TalkError("The agreed brief changed. Refine the treatment before saving or rendering.", 409)
        state["draft"]["treatment"] = data.treatment.model_dump()
        talk.write_state(path, state)
        return _public(state, context)
