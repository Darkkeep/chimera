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


def review_comments_digest(comments):
    """Bind approval to the exact discussion state as well as the storyboard."""
    payload = [comment.model_dump(mode="json") for comment in comments]
    return hashlib.sha256(json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")).hexdigest()


def receipt_path(project_id: str) -> Path:
    # Trusted human decisions are server-side evidence, not portable course data.
    # Project archives can be imported; they must not be able to forge approvals.
    digest = hashlib.sha256(project_id.encode("utf-8")).hexdigest()
    return storage.ROOT / "review-ledger" / (digest + ".json")


def _receipt_digest(entry: dict) -> str:
    payload = {key: value for key, value in entry.items() if key != "receiptSha256"}
    return hashlib.sha256(json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")).hexdigest()


def _append_receipt(project_id: str, entry: dict):
    history = _load_receipts(project_id)
    entry = dict(entry)
    entry["previousReceiptSha256"] = (history[-1].get("receiptSha256") or _receipt_digest(history[-1])) if history else None
    entry["receiptSha256"] = _receipt_digest(entry)
    history.append(entry)
    path = receipt_path(project_id)
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    temporary = path.parent / ("." + uuid.uuid4().hex + ".tmp")
    import os
    descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as stream:
            json.dump(history, stream, indent=2)
        temporary.replace(path)
    finally:
        temporary.unlink(missing_ok=True)


def invalidate_after_restore(project_id: str):
    """Restoring course content never carries forward a previous human approval."""
    with storage.storyboard_transaction():
        project = storage.read_project(project_id)
        _append_receipt(project_id, {
            "id": "review-" + uuid.uuid4().hex[:16],
            "projectId": project_id, "revision": project.storyboard.revision,
            "storyboardSha256": storyboard_digest(project.storyboard),
            "decision": "invalidated", "note": "Project content was restored from an archive. Re-review required.",
            "actorId": "chimera-system", "actorDisplayName": "Chimera system",
            "installationId": project.installationId, "createdAt": storage.now_iso(),
        })



def _load_receipts(project_id: str):
    path = receipt_path(project_id)
    if not path.exists():
        return []
    receipts = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(receipts, list):
        raise ValueError("Invalid review decision history")
    previous = None
    sealed = False
    for receipt in receipts:
        if not isinstance(receipt, dict):
            raise ValueError("Invalid review decision history entry")
        if "receiptSha256" not in receipt:
            # Read historic pre-chain receipts, but never trust them as current approvals.
            if sealed:
                raise ValueError("Unsealed entry in review decision history")
            previous = _receipt_digest(receipt)
            continue
        sealed = True
        if receipt.get("previousReceiptSha256") != previous or receipt["receiptSha256"] != _receipt_digest(receipt):
            raise ValueError("Review decision history integrity check failed")
        previous = receipt["receiptSha256"]
    return receipts


def review_status(project_id: str):
    with storage.storyboard_transaction():
        project = storage.read_project(project_id)
        digest = storyboard_digest(project.storyboard)
        receipts = _load_receipts(project_id)
        latest = receipts[-1] if receipts else None
        comments = storage.list_review_comments(project_id)
        unresolved = sum(not c.resolved and not c.sceneDeleted for c in comments)
        comment_digest = review_comments_digest(comments)
        valid = bool(latest and latest["decision"] == "approve"
                     and latest["revision"] == project.storyboard.revision
                     and latest["storyboardSha256"] == digest
                     and bool(latest.get("receiptSha256"))
                     and latest.get("reviewCommentsSha256") == comment_digest
                     and not unresolved)
        return {
            "projectId": project_id, "revision": project.storyboard.revision,
            "storyboardSha256": digest, "approved": valid,
            "state": "approved" if valid else
                     "changed-since-review" if latest and latest["decision"] == "approve" else
                     "changes-requested" if latest and latest["decision"] == "request-changes" else
                     "restored-needs-review" if latest and latest["decision"] == "invalidated" else "not-reviewed",
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
            "reviewCommentsSha256": review_comments_digest(storage.list_review_comments(project_id)),
            "decision": data.decision, "note": data.note.strip(),
            "actorId": actor.actorId, "actorDisplayName": actor.actorDisplayName,
            "installationId": actor.installationId, "createdAt": storage.now_iso(),
        }
        if not entry["note"]:
            raise ValueError("An explanation is required for a review decision")
        _append_receipt(project_id, entry)
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
