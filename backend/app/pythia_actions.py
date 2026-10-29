"""Convert completed local Pythia advice into revision-bound author-reviewed edits."""
import hashlib
import json
from threading import Thread
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from . import pythia_talk as talk, storage
from .models import SceneCreate, SceneUpdate


class ContentScene(BaseModel):
    model_config = ConfigDict(extra="forbid")
    title: str = Field(min_length=1, max_length=120)
    sceneType: Literal["content", "title", "summary"] = "content"
    extractedText: list[str] = Field(min_length=1, max_length=12)
    narration: str = Field(default="", max_length=10000)
    actionDescription: str = Field(default="", max_length=5000)
    notes: str = Field(default="", max_length=10000)

    @model_validator(mode="after")
    def paragraphs(self):
        if any(not text.strip() or len(text) > 2000 for text in self.extractedText):
            raise ValueError("Invalid content paragraphs")
        return self


class FieldEdit(BaseModel):
    model_config = ConfigDict(extra="forbid")
    field: Literal["title", "extractedText", "narration", "actionDescription", "notes"]
    value: str | list[str]

    @model_validator(mode="after")
    def value_type(self):
        if self.field == "extractedText":
            if not isinstance(self.value, list) or not 1 <= len(self.value) <= 12 or any(not text.strip() or len(text) > 2000 for text in self.value):
                raise ValueError("Invalid proposed screen text")
        elif not isinstance(self.value, str) or len(self.value) > {"title": 120, "actionDescription": 5000}.get(self.field, 10000) or (self.field == "title" and not self.value.strip()):
            raise ValueError("Invalid proposed field value")
        return self


class DraftResult(BaseModel):
    model_config = ConfigDict(extra="forbid")
    mode: Literal["update-scene", "add-scenes"]
    rationale: str = Field(min_length=1, max_length=2000)
    changes: list[FieldEdit] = Field(max_length=5)
    scenes: list[ContentScene] = Field(max_length=5)
    producer_id: Literal["live-chimera-authoring-v1"]
    stopping_boundary: Literal["draft-only"]

    @model_validator(mode="after")
    def scope(self):
        if self.mode == "update-scene":
            if not self.changes or self.scenes or len({item.field for item in self.changes}) != len(self.changes):
                raise ValueError("Invalid scene update scope")
        elif not self.scenes or self.changes:
            raise ValueError("Invalid new-scene scope")
        return self


class DraftRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    requestId: str = Field(pattern=r"^[a-zA-Z0-9][a-zA-Z0-9_-]{7,79}$")
    sessionId: str = Field(pattern=r"^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$")
    turnId: str = Field(max_length=80)
    mode: Literal["update-scene", "add-scenes"]
    sceneId: str | None = Field(default=None, max_length=120)
    direction: str = Field(min_length=1, max_length=4000)
    expectedRevision: int = Field(ge=1)


class ActionDecision(BaseModel):
    model_config = ConfigDict(extra="forbid")
    sessionId: str = Field(max_length=80)
    decision: Literal["apply", "discard"]
    expectedRevision: int = Field(ge=1)


def submit(project_id, actor, data, authorize):
    talk.checkout()
    authorize()
    with storage.storyboard_transaction():
        path = talk.state_path(project_id, actor)
        state = talk.read_state(path)
        if state["sessionId"] != data.sessionId:
            raise talk.TalkError("The conversation changed. Refresh before drafting.", 409)
        actions = state.setdefault("actions", [])
        digest = hashlib.sha256(json.dumps(data.model_dump(), sort_keys=True).encode()).hexdigest()
        prior = next((action for action in actions if action["id"] == data.requestId), None)
        if prior:
            if prior["fingerprint"] != digest:
                raise talk.TalkError("This request ID belongs to a different draft.", 409)
            return talk.public_state(state)
        if any(t["status"] == "running" for t in state["turns"]) or any(a["status"] in {"drafting", "applying"} for a in actions):
            raise talk.TalkError("Wait for the current Pythia operation to finish.", 409)
        if len(actions) >= 20:
            raise talk.TalkError("This conversation has reached its 20-draft limit. Start a new conversation.")
        project = storage.read_project(project_id)
        if project.storyboard.revision != data.expectedRevision:
            raise talk.TalkError("The storyboard changed. Refresh it before requesting a draft.", 409)
        turn = next((t for t in state["turns"] if t["id"] == data.turnId and t["status"] == "completed"), None)
        if turn is None or not turn.get("result"):
            raise talk.TalkError("Choose a completed Pythia answer from this conversation.", 404)
        if not data.direction.strip():
            raise talk.TalkError("Give Chimera direction for the requested changes.")
        if data.mode == "add-scenes" and data.sceneId is not None:
            raise talk.TalkError("Adding scenes must not include an existing-scene edit target.")
        target = None
        if data.mode == "update-scene":
            target = next((scene for scene in project.storyboard.scenes if scene.id == data.sceneId), None)
            if target is None:
                raise talk.TalkError("Choose a current scene to update.", 404)
        history, sources = [], {}
        for previous in state["turns"]:
            if previous["status"] == "completed":
                history.extend([{"role": "user", "content": previous["wireQuestion"]}, {"role": "assistant", "content": previous["result"]["content"]}])
                for source_id, identity in previous.get("binding", {}).get("sources", {}).items():
                    talk.check_binding(project_id, {"sceneRevision": None, "sources": {source_id: identity}})
                    sources[source_id] = identity
            if previous["id"] == data.turnId:
                break
        scene_data = ({field: getattr(target, field) for field in ("title", "extractedText", "narration", "actionDescription", "notes")} if target else None)
        payload = {"mode": data.mode, "direction": data.direction.strip(), "advice": turn["result"]["content"], "history": history, "scene": scene_data}
        if len(history) > 32 or len(json.dumps(payload, ensure_ascii=False)) > 64000:
            raise talk.TalkError("The authoring context exceeds the local Pythia allowance. Start a smaller conversation; no text was silently omitted.")
        if not talk.CAPACITY.acquire(blocking=False):
            raise talk.TalkError("Two Pythia operations are already active. Try again when one finishes.", 429)
        action = {"id": data.requestId, "turnId": data.turnId, "mode": data.mode, "sceneId": data.sceneId,
            "direction": data.direction.strip(), "sourceRevision": data.expectedRevision,
            "before": scene_data, "binding": {"sceneRevision": data.expectedRevision, "sources": sources},
            "fingerprint": digest, "runId": talk.RUN_ID, "status": "drafting", "result": None, "error": None}
        actions.append(action)
        state["authorDirection"] = data.direction.strip()
        try:
            talk.write_state(path, state)
            Thread(target=finish, args=(path, project_id, state["sessionId"], action, payload, authorize), daemon=True).start()
        except Exception:
            talk.CAPACITY.release()
            raise
        return talk.public_state(state)


def finish(path, project_id, session_id, action, payload, authorize):
    try:
        authorize()
        talk.check_binding(project_id, action["binding"])
        result = DraftResult.model_validate(talk.local_mcp(authoring_request=payload))
        if result.mode != action["mode"]:
            raise talk.TalkError("Pythia returned a different action scope. Nothing was applied.")
        if result.mode == "update-scene":
            changed = [change for change in result.changes if change.value != action["before"][change.field]]
            if not changed:
                raise talk.TalkError("The draft makes no change to the selected scene. Give a more specific direction.")
            result = result.model_copy(update={"changes": changed})
        authorize()
        with storage.storyboard_transaction():
            talk.check_binding(project_id, action["binding"])
            persist(path, session_id, action["id"], status="pending", result=result.model_dump())
    except Exception as error:
        message = str(error) if isinstance(error, talk.TalkError) else "Pythia could not produce a valid content draft. Nothing was applied. Give clearer direction and draft again."
        with storage.storyboard_transaction():
            persist(path, session_id, action["id"], status="failed", error=message)
    finally:
        talk.CAPACITY.release()


def persist(path, session_id, action_id, **updates):
    state = talk.read_state(path)
    if state["sessionId"] != session_id:
        return
    action = next(item for item in state["actions"] if item["id"] == action_id)
    action.update(updates)
    talk.write_state(path, state)


def decide(project_id, actor, action_id, data):
    with storage.storyboard_transaction():
        path = talk.state_path(project_id, actor)
        state = talk.read_state(path)
        if state["sessionId"] != data.sessionId:
            raise talk.TalkError("The conversation changed. Refresh before deciding this draft.", 409)
        action = next((a for a in state.get("actions", []) if a["id"] == action_id), None)
        if action is None:
            raise talk.TalkError("Draft not found in this conversation.", 404)
        if action["status"] == "applied" and data.decision == "apply":
            return {"conversation": talk.public_state(state), "project": storage.read_project(project_id)}
        if action["status"] == "discarded" and data.decision == "discard":
            return {"conversation": talk.public_state(state), "project": None}
        if action["status"] != "pending":
            raise talk.TalkError("Only a pending draft can be applied or discarded.", 409)
        if data.decision == "discard":
            action.update(status="discarded", decidedAt=storage.now_iso(), decidedBy=actor.actorId)
            talk.write_state(path, state)
            return {"conversation": talk.public_state(state), "project": None}
        project = storage.read_project(project_id)
        if data.expectedRevision != project.storyboard.revision or action["sourceRevision"] != project.storyboard.revision:
            raise talk.TalkError("The storyboard changed since this draft. Nothing was applied. Request a new draft against the current revision.", 409)
        talk.check_binding(project_id, action["binding"])
        draft = DraftResult.model_validate(action["result"])
        root = storage.project_path(project_id)
        files = [root / "storyboard.json", root / "project.json"]
        snapshots = {file: file.read_bytes() for file in files}
        history = set((root / "history").glob("storyboard-*.json"))
        try:
            if draft.mode == "update-scene":
                target = next((scene for scene in project.storyboard.scenes if scene.id == action["sceneId"]), None)
                if target is None or any(getattr(target, change.field) != action["before"][change.field] for change in draft.changes):
                    raise talk.TalkError("The target fields changed since this draft. Nothing was applied.", 409)
                updated = storage.update_scene(project_id, target.id, SceneUpdate(**{change.field: change.value for change in draft.changes}), data.expectedRevision)
            else:
                updated = storage.create_scenes(project_id, [SceneCreate(**scene.model_dump()) for scene in draft.scenes], data.expectedRevision)
            action.update(status="applied", appliedRevision=updated.storyboard.revision, decidedAt=storage.now_iso(), decidedBy=actor.actorId)
            talk.write_state(path, state)
        except Exception:
            # One author-reviewed decision is atomic across authored content and
            # its private decision receipt. All paths are this verified project.
            for file, content in snapshots.items():
                file.write_bytes(content)
            for added in set((root / "history").glob("storyboard-*.json")) - history:
                added.unlink()
            raise
        return {"conversation": talk.public_state(state), "project": updated}
