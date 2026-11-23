"""Immutable human review decisions for an exact authored storyboard revision.

This is deliberately distinct from Pythia advisory review and scene-comment resolution.
Release qualification is opt-in for legacy exports until a governed rollout is approved.
"""
import hashlib
import json
import uuid
from pathlib import Path
from typing import Literal
from pydantic import BaseModel, Field

from . import storage
from .platform import ActorContext


class ReviewDecisionRequest(BaseModel):
    decision: Literal["approve", "request-changes"]
    expectedRevision: int = Field(ge=1)
    note: str = Field(min_length=1, max_length=2000)


def storyboard_digest(storyboard):
    return hashlib.sha256(
        json.dumps(storyboard.model_dump(mode="json"), sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    ).hexdigest()


def receipt_path(project_id: str) -> Path:
    return storage.project_path(project_id) / "review" / "decisions.json"


def _load_receipts(project_id: str):
    path = receipt_path(project_id)
    if not path.exists():
        return []
    receipts = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(receipts, list):
        raise ValueError("Invalid review decision history")
    return receipts


def review_status(project_id: str):
    with storage.storyboard_transaction():
        project = storage.read_project(project_id)
        digest = storyboard_digest(project.storyboard)
        receipts = _load_receipts(project_id)
        latest = receipts[-1] if receipts else None
        valid = bool(latest and latest["decision"] == "approve"
                     and latest["revision"] == project.storyboard.revision
                     and latest["storyboardSha256"] == digest)
        comments = storage.list_review_comments(project_id)
        unresolved = sum(not c.resolved and not c.sceneDeleted for c in comments)
        return {
            "projectId": project_id, "revision": project.storyboard.revision,
            "storyboardSha256": digest, "approved": valid,
            "state": "approved" if valid else
                     "changed-since-review" if latest and latest["decision"] == "approve" else
                     "changes-requested" if latest and latest["decision"] == "request-changes" else "not-reviewed",
            "lastDecision": latest, "unresolvedComments": unresolved,
        }


def record_decision(project_id: str, actor: ActorContext, data: ReviewDecisionRequest):
    with storage.storyboard_transaction():
        project = storage.read_project(project_id)
        if project.storyboard.revision != data.expectedRevision:
            raise storage.StoryboardRevisionConflict(data.expectedRevision, project.storyboard.revision)
        if actor.deploymentMode == "team" and actor.actorId == project.ownerId:
            raise ValueError("A course owner cannot independently approve their own work")
        if data.decision == "approve" and storage.list_review_comments(project_id):
            unresolved = [c for c in storage.list_review_comments(project_id) if not c.resolved and not c.sceneDeleted]
            if unresolved:
                raise ValueError("Resolve open review comments before approving this revision")
        entry = {
            "id": "review-" + uuid.uuid4().hex[:16],
            "projectId": project_id, "revision": project.storyboard.revision,
            "storyboardSha256": storyboard_digest(project.storyboard),
            "decision": data.decision, "note": data.note.strip(),
            "actorId": actor.actorId, "actorDisplayName": actor.actorDisplayName,
            "installationId": actor.installationId, "createdAt": storage.now_iso(),
        }
        if not entry["note"]:
            raise ValueError("An explanation is required for a review decision")
        history = _load_receipts(project_id)
        history.append(entry)
        path = receipt_path(project_id)
        path.parent.mkdir(parents=True, exist_ok=True)
        temporary = path.parent / ("." + uuid.uuid4().hex + ".tmp")
        temporary.write_text(json.dumps(history, indent=2), encoding="utf-8")
        temporary.replace(path)
        storage.append_platform_event(project_id, "review.approved" if data.decision == "approve" else "review.changes_requested",
                                      {"reviewId": entry["id"], "revision": entry["revision"]}, actor)
        return review_status(project_id)


def require_approved(project_id: str, project=None):
    status = review_status(project_id)
    if not status["approved"]:
        raise ValueError("This storyboard revision has no current human approval. Obtain review approval before exporting an approved release.")
    if project is not None and (project.storyboard.revision != status["revision"] or
                               storyboard_digest(project.storyboard) != status["storyboardSha256"]):
        raise ValueError("Storyboard changed during release qualification. Export again after review.")
    return status
