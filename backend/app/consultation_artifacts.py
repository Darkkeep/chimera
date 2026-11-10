"""Private, restart-safe snapshots of completed Pythia consultation outputs.

This is a consumer-side JSON export, not an assertion that the engine made a file.
No model, media, external request or automatic storyboard mutation occurs here.
"""
import hashlib
import json
import re
from pathlib import Path

from . import pythia_talk, storage

MAX_RECORD_BYTES = 2_000_000
SAFE_ID = re.compile(r"^[a-f0-9]{64}$")


def _paths(project_id, actor):
    private = pythia_talk.state_path(project_id, actor)
    return private, private.parent / "artifacts" / private.stem


def _snapshot(record_type, item, session_id):
    if record_type == "advice":
        content = item.get("result")
        if item.get("status") != "completed" or not isinstance(content, dict):
            return None
        payload = {"kind": "consultation-advice", "sessionId": session_id,
                   "turnId": item["id"], "question": item.get("question", ""),
                   "direction": item.get("direction", ""), "advice": content}
        title = "Consultation answer"
        source_id = item["id"]
        status = "ready"
    else:
        content = item.get("result")
        if item.get("status") not in {"pending", "applied", "discarded"} or not isinstance(content, dict):
            return None
        payload = {"kind": "content-draft", "sessionId": session_id,
                   "actionId": item["id"], "turnId": item.get("turnId"),
                   "reviewStatus": item["status"], "proposal": content}
        title = "Content draft"
        source_id = item["id"]
        status = item["status"]
    raw = json.dumps(payload, ensure_ascii=False, sort_keys=True, indent=2).encode("utf-8")
    if len(raw) > MAX_RECORD_BYTES:
        return None
    # An applied or discarded draft is a distinct immutable record from its pending proposal.
    # The payload digest also prevents silent mutation of a saved version.
    key = hashlib.sha256(f"{session_id}\\0{record_type}\\0{source_id}\\0{status}\\0{hashlib.sha256(raw).hexdigest()}".encode()).hexdigest()
    return key, {"id": key, "sessionId": session_id, "sourceId": source_id,
                 "turnId": payload.get("turnId"), "type": record_type,
                 "title": title, "filename": f"{record_type}-{key[:12]}.json",
                 "mimeType": "application/json", "byteSize": len(raw),
                 "sha256": hashlib.sha256(raw).hexdigest(), "status": status,
                 "origin": "Chimera snapshot of Pythia structured output"}, raw


def _atomic_write(path: Path, content: bytes):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(".tmp")
    try:
        temporary.write_bytes(content)
        temporary.replace(path)
    finally:
        temporary.unlink(missing_ok=True)


def _reconcile(project_id, actor):
    state_path, root = _paths(project_id, actor)
    state = pythia_talk.read_state(state_path)
    index_path = root / "index.json"
    index = json.loads(index_path.read_text(encoding="utf-8")) if index_path.exists() else {}
    session_id = state["sessionId"]
    changed = False
    for category, items in (("advice", state.get("turns", [])), ("draft", state.get("actions", []))):
        for item in items:
            snapshot = _snapshot(category, item, session_id)
            if snapshot is None:
                continue
            key, descriptor, raw = snapshot
            target = root / (key + ".json")
            if index.get(key) != descriptor or not target.exists():
                _atomic_write(target, raw)
                index[key] = descriptor
                changed = True
    if changed:
        _atomic_write(index_path, json.dumps(index, ensure_ascii=False, sort_keys=True).encode("utf-8"))
    return index, root


def list_artifacts(project_id, actor, session_id=None):
    with storage.storyboard_transaction():
        index, _ = _reconcile(project_id, actor)
        return {"artifacts": [item for item in index.values()
                 if session_id is None or item["sessionId"] == session_id]}


def get_artifact(project_id, actor, artifact_id):
    if not SAFE_ID.fullmatch(artifact_id):
        raise KeyError("Artifact not found")
    with storage.storyboard_transaction():
        index, root = _reconcile(project_id, actor)
        if artifact_id not in index:
            raise KeyError("Artifact not found")
        descriptor = index[artifact_id]
        data = (root / (artifact_id + ".json")).read_bytes()
        if hashlib.sha256(data).hexdigest() != descriptor["sha256"]:
            raise ValueError("Saved artifact checksum failed")
        return descriptor, data


def retain_current_before_reset(project_id, actor):
    # Called under the same transaction before replacing a conversation session.
    _reconcile(project_id, actor)
