"""Reuse a completed, authenticated Pythia authoring draft as reviewed Studio scenes.

This does not call the model twice or claim to stream tokens from Pythia.
The Pythia consultation owns model generation; Chimera owns individual decisions.
"""
import hashlib
import json

from fastapi import HTTPException

from . import progressive_authoring as progressive, pythia_talk as talk, storage
from .progressive_pythia_adapter import PythiaAuthoringResult, adapt_scene


def ingest_latest(project_id, actor, revision):
    with storage.storyboard_transaction():
        project = storage.read_project(project_id)
        if project.storyboard.revision != revision:
            raise storage.StoryboardRevisionConflict(revision, project.storyboard.revision)
        state = talk.read_state(talk.state_path(project_id, actor))
        action = next((a for a in reversed(state.get("actions", []))
                       if a.get("status") == "pending" and a.get("mode") == "add-scenes"
                       and a.get("result")), None)
        if action is None:
            raise HTTPException(409, "No completed Pythia scene draft is waiting for review. Finish a Pythia consultation and request a scene draft first.")
        if action["sourceRevision"] != revision:
            raise HTTPException(409, "The Pythia draft uses an earlier course revision. Request a new draft before importing.")
        talk.check_binding(project_id, action["binding"])
        result = PythiaAuthoringResult.model_validate(action["result"])
        unsupported = [s.title for s in result.scenes if s.sceneType != "content"]
        indexes = [i for i, scene in enumerate(result.scenes) if scene.sceneType == "content"]
        if not indexes:
            raise HTTPException(422, "The completed Pythia draft contains no supported content scenes.")
        source_ids = list(action.get("binding", {}).get("sources", {}))
        if len(source_ids) > 20:
            raise HTTPException(422, "This draft references more than 20 sources; review a smaller draft without discarding source identity.")
        fingerprint = hashlib.sha256(json.dumps(action["result"], sort_keys=True, ensure_ascii=False).encode()).hexdigest()
        for path in progressive._directory(project_id).glob("*.json"):
            prior = json.loads(path.read_text(encoding="utf-8"))
            if prior.get("actorId") == actor.actorId and prior.get("pythiaActionId") == action["id"]:
                if prior.get("pythiaDraftSha256") != fingerprint:
                    raise HTTPException(409, "The Pythia draft changed. Refresh your consultation before importing.")
                return progressive.page(project_id, prior["jobId"], actor.actorId)
        job = progressive.submit(project_id, revision, actor.actorId)
        job["pythiaActionId"] = action["id"]
        job["pythiaDraftSha256"] = fingerprint
        job["importReport"] = {
            "handoffId": action["id"], "artifactSha256": fingerprint,
            "supportedScenes": len(indexes), "totalScenes": len(result.scenes),
            "unsupported": [f"Pythia scene '{title}' is not a content scene and was not imported." for title in unsupported],
            "notice": "Completed Pythia authoring draft. This is genuine model-produced content, not a streamed Pythia response. No second model call was made. Original consultation remains available; every Chimera scene requires acceptance.",
        }
        progressive._write(job)
        for order, index in enumerate(indexes):
            payload, base = adapt_scene(action["result"], index)
            provenance = base.model_copy(update={
                "producer": "pythia-authored-draft-v1", "artifactId": action["id"],
                "sourceProjectId": project_id, "sourceSceneId": f"draft-scene-{index + 1}",
                "sourceIds": source_ids,
                "locators": [], "artifactSha256": fingerprint,
            })
            progressive.emit_scene(project_id, job["jobId"], actor.actorId, f"scene-{index + 1}",
                                   payload, order, lambda: None, provenance=provenance)
        progressive.finish(project_id, job["jobId"], actor.actorId, "completed", lambda: None)
        return progressive.page(project_id, job["jobId"], actor.actorId)
