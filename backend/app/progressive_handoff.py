"""Offline production-handoff v1 ingestion into the existing progressive review log.

This is a completed saved artifact, never a live generation stream. The complete
original document and its source references remain in the durable job record.
"""
import hashlib
import json

from fastapi import HTTPException

from . import progressive_authoring as progressive, storage
from .handoff_contract.production_handoff import decode

PRODUCER = "pythia-production-handoff-v1"


def prepare(raw):
    document = decode(raw)
    digest = hashlib.sha256(json.dumps(document, sort_keys=True, ensure_ascii=False).encode()).hexdigest()
    sources = {item["id"]: item for item in document["provenance"]["sources"]}
    drafts, unsupported = [], []
    for index, scene in enumerate(document["storyboard"]["scenes"]):
        scene_id = scene["id"]
        if scene["kind"] != "content":
            unsupported.append(f"Scene {scene_id}: {scene['kind']} scene withheld; only content scenes are supported.")
            continue
        for field, label in (("media_ids", "media references (no assets fetched)"),
                             ("interactions", "interaction instructions"),
                             ("objective_ids", "objective links")):
            if scene[field]:
                unsupported.append(f"Scene {scene_id}: {label} retained in the source record, not implemented in the editable scene.")
        payload = progressive.DraftScene(
            title=scene["title"], extractedText=scene["screen_text"],
            narration=scene["narration"]["script"], notes=scene["production_notes"],
            actionDescription=scene["action_description"],
        ).model_dump()
        provenance = progressive.Provenance(
            producer=PRODUCER, sourceIds=scene["source_ids"],
            locators=[sources[key]["locator"] for key in scene["source_ids"]],
            handoffId=document["handoff_id"], artifactId=document["provenance"]["artifact_id"],
            sourceProjectId=document["provenance"]["project_id"], sourceSceneId=scene_id,
            artifactSha256=digest,
        )
        drafts.append((scene_id, payload, index, provenance))
    if not drafts:
        raise ValueError("No supported content scenes in this handoff. Question, title and summary scenes are unsupported.")
    if len(drafts) > 20:
        raise ValueError("Progressive import supports at most 20 content scenes per handoff")
    report = {"handoffId": document["handoff_id"], "artifactSha256": digest,
              "supportedScenes": len(drafts), "totalScenes": len(document["storyboard"]["scenes"]),
              "unsupported": unsupported,
              "notice": "Saved artifact validated locally. No Pythia call, source verification or media download. Objectives, media and interaction metadata remain in the source record. All proposals require your approval."}
    return document, drafts, report


def ingest(project_id, raw, revision, actor_id):
    document, drafts, report = prepare(raw)
    with storage.storyboard_transaction():
        for path in progressive._directory(project_id).glob("*.json"):
            existing = json.loads(path.read_text(encoding="utf-8"))
            if existing["actorId"] == actor_id and existing.get("sourceArtifact", {}).get("handoff_id") == document["handoff_id"]:
                if existing["sourceArtifact"] != document:
                    raise HTTPException(409, "This handoff ID already identifies different content; export a new handoff ID")
                return progressive.page(project_id, existing["jobId"], actor_id)
        job = progressive.submit(project_id, revision, actor_id)
        job["sourceArtifact"] = document
        job["importReport"] = report
        progressive._write(job)
        for scene_id, payload, order, provenance in drafts:
            progressive.emit_scene(project_id, job["jobId"], actor_id, scene_id, payload, order,
                                   lambda: None, provenance=provenance)
        progressive.finish(project_id, job["jobId"], actor_id, "completed", lambda: None)
        return progressive.page(project_id, job["jobId"], actor_id)
