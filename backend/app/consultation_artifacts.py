"""Private, restart-safe snapshots of completed Pythia consultation outputs.

This is a consumer-side JSON export, not an assertion that the engine made a file.
No model, media, external request or automatic storyboard mutation occurs here.
"""
import base64
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
    key = hashlib.sha256(f"{session_id}\0{record_type}\0{source_id}\0{status}\0{hashlib.sha256(raw).hexdigest()}".encode()).hexdigest()
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
        extension = {"text/markdown": ".md", "image/svg+xml": ".svg", "image/gif": ".gif"}.get(descriptor["mimeType"], ".json")
        data = (root / (artifact_id + extension)).read_bytes()
        if hashlib.sha256(data).hexdigest() != descriptor["sha256"]:
            raise ValueError("Saved artifact checksum failed")
        return descriptor, data


def retain_current_before_reset(project_id, actor):
    # Called under the same transaction before replacing a conversation session.
    _reconcile(project_id, actor)



def export_answer_markdown(project_id, actor, turn_id):
    """Export one completed private consultation answer; no new model request."""
    with storage.storyboard_transaction():
        state = pythia_talk.read_state(pythia_talk.state_path(project_id, actor))
        turn = next((item for item in state.get("turns", [])
                     if item.get("id") == turn_id and item.get("status") == "completed"), None)
        if turn is None or not isinstance(turn.get("result"), dict):
            raise KeyError("Completed answer not found")
        result = turn["result"]
        title = "Pythia consultation answer"
        body = result.get("content", "").strip()
        if not body:
            raise ValueError("Answer has no exportable text")
        if result.get("rationale"):
            body += "\n\n## Rationale\n\n" + result["rationale"]
        if result.get("limits"):
            body += "\n\n## Limits\n\n" + "\n".join("- " + str(value) for value in result["limits"])
        session_id = state["sessionId"]
    if pythia_talk.pythia_hosted.active():
        # Chimera may export its own retained hosted advice, without claiming
        # that the hosted Pythia engine supports remote file generation.
        safe_title = title.strip().replace("\r", " ").replace("\n", " ")
        stem = re.sub(r"[^a-z0-9]+", "-", safe_title.lower()).strip("-")[:64] or "consultation"
        data = f"# {safe_title}\n\n{body.rstrip()}\n".encode("utf-8")
        export = {"filename": stem + ".md", "mime_type": "text/markdown",
                  "size_bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()}
        origin = "Chimera Markdown export of hosted Pythia answer"
    else:
        export = pythia_talk.local_mcp(export_request={"title": title, "content": body})
        if not isinstance(export, dict) or export.get("format") != "pythia-text-export-v1":
            raise ValueError("Unsupported Pythia export response")
        if export.get("mime_type") != "text/markdown":
            raise ValueError("Unsupported Pythia export type")
        try:
            data = base64.b64decode(export["data_base64"], validate=True)
        except (KeyError, ValueError):
            raise ValueError("Invalid Pythia export bytes") from None
        origin = "Pythia Markdown export via local MCP"
    if len(data) > MAX_RECORD_BYTES or len(data) == 0:
        raise ValueError("Export exceeds file allowance")
    digest = hashlib.sha256(data).hexdigest()
    if export.get("size_bytes") != len(data) or export.get("sha256") != digest:
        raise ValueError("Pythia export integrity check failed")
    key = hashlib.sha256(f"{session_id}\0markdown\0{turn_id}\0{digest}".encode()).hexdigest()
    descriptor = {"id": key, "sessionId": session_id, "sourceId": turn_id,
                  "turnId": turn_id, "type": "markdown", "title": "Consultation answer",
                  "filename": "pythia-consultation-" + key[:12] + ".md",
                  "mimeType": "text/markdown", "byteSize": len(data),
                  "sha256": digest, "status": "ready", "origin": origin}
    with storage.storyboard_transaction():
        index, root = _reconcile(project_id, actor)
        if key not in index:
            _atomic_write(root / (key + ".md"), data)
            index[key] = descriptor
            _atomic_write(root / "index.json", json.dumps(index, ensure_ascii=False, sort_keys=True).encode("utf-8"))
        return descriptor


def _inspect_native_asset(media_type, data):
    """Validate native bytes without transforming the original or executing SVG."""
    if not 0 < len(data) <= 8 * 1024 * 1024:
        raise ValueError("Native file outside byte allowance")
    if media_type == "image/svg+xml":
        import xml.etree.ElementTree as ET
        if re.search(rb"<!\s*(?:DOCTYPE|ENTITY)|<\?", data, flags=re.I):
            raise ValueError("Unsafe XML constructs")
        try:
            root = ET.fromstring(data)
        except ET.ParseError as error:
            raise ValueError("Invalid SVG") from error
        if root.tag != "{http://www.w3.org/2000/svg}svg":
            raise ValueError("Not an SVG document")
        return {"type": "vector", "animated": False, "previewSafe": False, "suffix": ".svg"}
    if media_type == "image/gif":
        from io import BytesIO
        from PIL import Image, UnidentifiedImageError
        try:
            with Image.open(BytesIO(data)) as image:
                if image.format != "GIF" or not 0 < image.width <= 4096 or not 0 < image.height <= 4096:
                    raise ValueError("GIF dimensions invalid")
                frames = image.n_frames
                if frames < 1 or frames > 240 or frames * image.width * image.height > 100_000_000:
                    raise ValueError("GIF workload allowance exceeded")
                # Bound decoding of each frame without ever changing the source bytes.
                duration = 0
                for frame in range(frames):
                    image.seek(frame)
                    duration += image.info.get("duration", 0)
                return {"type": "animated-gif" if frames > 1 else "gif",
                        "animated": frames > 1, "frameCount": frames,
                        "durationMs": duration, "previewSafe": True, "suffix": ".gif"}
        except (OSError, UnidentifiedImageError, EOFError) as error:
            raise ValueError("Invalid GIF stream") from error
    raise ValueError("Unsupported source format")


def import_native_from_pythia(project_id, actor, native_id, provider=None):
    """Import a Pythia registered original into a private Chimera project shelf.

    No generation or automatic canonical authoring changes occur.
    """
    if not isinstance(native_id, str) or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_-]{7,119}", native_id):
        raise ValueError("Invalid native source ID")
    from .learning_intelligence import PythiaProvider
    provider = provider or PythiaProvider()
    data, media_type, source_digest, source_id, source_project_id = provider.native_file(native_id)
    if (source_project_id != project_id or not isinstance(data, bytes) or not re.fullmatch(r"[a-f0-9]{64}", source_digest)
            or hashlib.sha256(data).hexdigest() != source_digest
            or not isinstance(source_id, str)
            or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_-]{7,119}", source_id)):
        raise ValueError("Pythia native source integrity or provenance mismatch")
    inspected = _inspect_native_asset(media_type, data)
    with storage.storyboard_transaction():
        index, root = _reconcile(project_id, actor)
        state_path, _ = _paths(project_id, actor)
        session_id = pythia_talk.read_state(state_path)["sessionId"]
        key = hashlib.sha256(f"{session_id}\0native\0{native_id}\0{source_digest}".encode()).hexdigest()
        descriptor = {"id": key, "sessionId": session_id, "sourceId": source_id,
                      "turnId": None, "type": inspected["type"],
                      "title": "Pythia native " + ("SVG vector" if media_type == "image/svg+xml" else "GIF image"),
                      "filename": "pythia-native-" + key[:12] + inspected["suffix"],
                      "mimeType": media_type, "byteSize": len(data),
                      "sha256": source_digest, "status": "ready",
                      "origin": "Pythia registered source " + native_id,
                      "animated": inspected["animated"], "previewSafe": inspected["previewSafe"]}
        if media_type == "image/gif":
            descriptor["frameCount"] = inspected["frameCount"]
            descriptor["durationMs"] = inspected["durationMs"]
        target = root / (key + inspected["suffix"])
        if key in index:
            if not target.is_file() or hashlib.sha256(target.read_bytes()).hexdigest() != source_digest:
                raise ValueError("Retained source bytes failed integrity verification")
            return index[key]
        _atomic_write(target, data)
        index[key] = descriptor
        _atomic_write(root / "index.json", json.dumps(index, ensure_ascii=False, sort_keys=True).encode("utf-8"))
        return descriptor
