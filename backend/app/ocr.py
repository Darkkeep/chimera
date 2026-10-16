import hashlib
import os
import re
import time
from pathlib import Path

import pymupdf

from . import storage
from .models import ReferencePassage


def capability() -> dict:
    directory = os.environ.get("CHIMERA_OCR_TESSDATA") or os.environ.get("TESSDATA_PREFIX")
    root = Path(directory) if directory else storage.ROOT.parent / "tools" / "tessdata"
    languages = sorted(p.stem for p in root.glob("*.traineddata")) if root.is_dir() else []
    return {"available": bool(languages), "languages": languages, "maxPages": 20,
            "message": "OCR runs locally; review extracted text before using it." if languages else "Install Tesseract language data and set CHIMERA_OCR_TESSDATA to its directory."}


def extract_pdf(content: bytes, language: str) -> tuple[list[ReferencePassage], str, str]:
    status = capability()
    if not re.fullmatch(r"[a-zA-Z0-9_]+", language) or language not in status["languages"]:
        raise ValueError("Choose an installed OCR language")
    directory = os.environ.get("CHIMERA_OCR_TESSDATA") or os.environ.get("TESSDATA_PREFIX") or str(storage.ROOT.parent / "tools" / "tessdata")
    passages = []
    started = time.monotonic()
    with pymupdf.open(stream=content, filetype="pdf") as document:
        if document.is_encrypted or len(document) > status["maxPages"]:
            raise ValueError("Local OCR accepts unencrypted PDFs with at most 20 pages; split larger documents first")
        for number, page in enumerate(document, start=1):
            if time.monotonic() - started > 60:
                raise ValueError("OCR exceeded its processing budget; split this document and retry")
            if page.rect.width * page.rect.height > 4000000:
                raise ValueError("PDF page dimensions exceed the local OCR rendering budget")
            textpage = page.get_textpage_ocr(language=language, dpi=150, full=True, tessdata=directory)
            text = page.get_text(textpage=textpage).strip()
            if text:
                passages.append(ReferencePassage(locator=f"page:{number}", text=text[:50000]))
    if not passages:
        raise ValueError("OCR found no readable text. The previous reference version is unchanged")
    return passages, "partial", f"Local OCR ({language}); inspect every passage for recognition errors before grounding suggestions."


def run_reference_ocr(project_id: str, resource_id: str, expected_version: str, language: str):
    resources = storage.list_reference_resources(project_id)
    resource = next((r for r in resources if r.id == resource_id), None)
    if resource is None:
        raise FileNotFoundError("Reference not found")
    if resource.currentVersion != expected_version:
        raise ValueError("Reference changed. Reload before running OCR")
    version = next(v for v in resource.versions if v.version == expected_version)
    if Path(version.filename).suffix.lower() != ".pdf":
        raise ValueError("Local OCR currently supports PDF references only")
    root = (storage.project_path(project_id) / "references").resolve()
    source = (storage.project_path(project_id) / version.originalPath).resolve()
    if not source.is_relative_to(root) or not source.is_file():
        raise ValueError("Reference original is unavailable")
    content = source.read_bytes()
    if hashlib.sha256(content).hexdigest() != version.sha256:
        raise ValueError("Reference checksum verification failed; the previous version is unchanged")
    passages, status, message = extract_pdf(content, language)
    with storage.storyboard_transaction():
        current = next(r for r in storage.list_reference_resources(project_id) if r.id == resource_id)
        if current.currentVersion != expected_version:
            raise ValueError("Reference changed during OCR; results were discarded")
        return storage.save_reference_resource(project_id, version.filename, resource.title, resource.classification,
            resource.authoritative, resource.sceneIds, content, version.contentType, passages, status, message, resource_id)


def accept_reference_ocr(project_id: str, resource_id: str, expected_version: str):
    import json
    import uuid
    with storage.storyboard_transaction():
        resources = storage.list_reference_resources(project_id)
        resource = next((r for r in resources if r.id == resource_id), None)
        if resource is None:
            raise FileNotFoundError("Reference not found")
        if resource.currentVersion != expected_version:
            raise ValueError("Reference changed. Inspect the current OCR text first")
        version = next(v for v in resource.versions if v.version == expected_version)
        if version.extractionStatus != "partial" or not (version.extractionMessage or "").startswith("Local OCR"):
            raise ValueError("Only inspected OCR output can be accepted")
        version.extractionStatus = "complete"
        version.extractionMessage = "OCR text accepted by the author for grounding; recognition and source accuracy remain subject to review."
        path = storage._reference_resources_path(project_id)
        temporary = path.with_name(f".{path.name}.{uuid.uuid4().hex}.tmp")
        temporary.write_text(json.dumps([r.model_dump(mode="json") for r in resources], indent=2), encoding="utf-8")
        storage.replace_project_file(temporary, path)
        return resource
