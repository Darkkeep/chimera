import hashlib
import io
import json
import shutil
import tempfile
import uuid
from pathlib import Path
from zipfile import ZIP_DEFLATED, BadZipFile, ZipFile

from .models import Storyboard
from .storage import now_iso, project_path, read_project, storyboard_transaction, template_path, templates_path

ARCHIVE_SCHEMA = "chimera-project-1"
EXCLUDED_ROOTS = {"build", "output", "reports", "media-generation-jobs", "generated-candidates"}


def _included_files(root: Path) -> list[Path]:
    return sorted(
        path for path in root.rglob("*")
        if path.is_file() and not any(part in EXCLUDED_ROOTS or part.startswith(".") for part in path.relative_to(root).parts)
    )


def build_project_archive(project_id: str) -> bytes:
    project = read_project(project_id)
    root = project_path(project_id)
    files = _included_files(root)
    template_files: list[tuple[str, Path]] = []
    template_ids = {scene.templateId for scene in project.storyboard.scenes if scene.templateId}
    for template_id in template_ids:
        if not template_id:
            continue
        source_root = template_path(template_id)
        if not source_root.is_dir():
            raise ValueError(f"Referenced template is unavailable: {template_id}")
        for source in sorted(source_root.iterdir()):
            if source.is_file():
                template_files.append((f"templates/{template_id}/{source.name}", source))
    manifest_files = []
    for path in files:
        relative = path.relative_to(root).as_posix()
        content = path.read_bytes()
        manifest_files.append({"path": relative, "sizeBytes": len(content), "sha256": hashlib.sha256(content).hexdigest()})
    for relative, path in template_files:
        content = path.read_bytes()
        manifest_files.append({"path": relative, "sizeBytes": len(content), "sha256": hashlib.sha256(content).hexdigest()})
    manifest = {
        "schema": ARCHIVE_SCHEMA,
        "projectId": project_id,
        "sourceRevision": project.storyboard.revision,
        "createdAt": now_iso(),
        "files": manifest_files,
    }
    output = io.BytesIO()
    with ZipFile(output, "w", ZIP_DEFLATED) as archive:
        archive.writestr("manifest.json", json.dumps(manifest, indent=2))
        for path in files:
            archive.write(path, path.relative_to(root).as_posix())
        for relative, path in template_files:
            archive.write(path, relative)
    output.seek(0)
    return output.read()


def restore_project_archive(project_id: str, content: bytes) -> object:
    root = project_path(project_id)
    read_project(project_id)
    current_metadata = json.loads((root / "project.json").read_text(encoding="utf-8"))
    with tempfile.TemporaryDirectory() as temporary_name:
        temporary_root = Path(temporary_name)
        archive_path = temporary_root / "project.zip"
        archive_path.write_bytes(content)
        extracted = temporary_root / "extracted"
        extracted.mkdir()
        try:
            with ZipFile(archive_path) as archive:
                names = archive.namelist()
                if "manifest.json" not in names:
                    raise ValueError("Archive manifest is missing")
                if any(Path(name).is_absolute() or ".." in Path(name).parts for name in names):
                    raise ValueError("Archive contains an unsafe path")
                archive.extractall(extracted)
        except (BadZipFile, OSError) as error:
            raise ValueError("Archive is not a readable ZIP file") from error
        try:
            manifest = json.loads((extracted / "manifest.json").read_text(encoding="utf-8"))
            if manifest.get("schema") != ARCHIVE_SCHEMA or manifest.get("projectId") != project_id:
                raise ValueError("Archive schema or project ID does not match this project")
            listed_files = manifest.get("files")
            if not isinstance(listed_files, list) or len(listed_files) > 10000:
                raise ValueError("Archive manifest has an invalid file list")
            expected_paths = {item["path"] for item in listed_files if isinstance(item, dict) and isinstance(item.get("path"), str)}
            if len(expected_paths) != len(listed_files):
                raise ValueError("Archive manifest contains duplicate or invalid paths")
            for item in listed_files:
                path = extracted / item["path"]
                if not path.is_file() or path.stat().st_size != item.get("sizeBytes") or hashlib.sha256(path.read_bytes()).hexdigest() != item.get("sha256"):
                    raise ValueError(f"Archive integrity check failed for {item['path']}")
            storyboard_path = extracted / "storyboard.json"
            project_path_file = extracted / "project.json"
            if not storyboard_path.is_file() or not project_path_file.is_file():
                raise ValueError("Archive must contain project and storyboard records")
            restored_metadata = json.loads(project_path_file.read_text(encoding="utf-8"))
            for field in ("id", "installationId", "ownerId"):
                if field in current_metadata:
                    restored_metadata[field] = current_metadata[field]
            project_path_file.write_text(json.dumps(restored_metadata, indent=2), encoding="utf-8")
            storyboard = Storyboard.model_validate_json(storyboard_path.read_text(encoding="utf-8"))
            if storyboard.projectId != project_id:
                raise ValueError("Storyboard project ID does not match the archive")
            from .media import validate_placements, validate_captions
            from .models import ProjectDetail
            validate_placements(ProjectDetail(id=project_id, title=storyboard.title, sceneCount=len(storyboard.scenes), updatedAt="restore", hasSourceDeck=False, storyboard=storyboard))
            for asset in storyboard.assets:
                validate_captions(asset.captionsVtt)
            for asset in storyboard.assets:
                asset_path = extracted / asset.path
                if not asset_path.is_file():
                    raise ValueError(f"Archive is missing required asset: {asset.filename}")
            for scene in storyboard.scenes:
                if scene.templateId and not (extracted / "templates" / scene.templateId / "template.json").is_file():
                    raise ValueError(f"Archive is missing required template: {scene.templateId}")
        except (OSError, json.JSONDecodeError, KeyError, TypeError) as error:
            raise ValueError("Archive contains invalid project records") from error
        with storyboard_transaction():
            backup_root = root.parent / f".{project_id}-restore-{uuid.uuid4().hex}"
            shutil.copytree(root, backup_root)
            try:
                for source in _included_files(extracted):
                    if source.relative_to(extracted).parts[0] == "templates":
                        continue
                    if source.relative_to(extracted).parts[0] == "audit":
                        # Imported history is evidence, never authoritative live audit/queue state.
                        if source.name == "events.jsonl":
                            destination = root / "history" / f"imported-audit-{uuid.uuid4().hex}.jsonl"
                            destination.parent.mkdir(parents=True, exist_ok=True)
                            shutil.copy2(source, destination)
                        continue
                    destination = root / source.relative_to(extracted)
                    destination.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copy2(source, destination)
                for source in _included_files(extracted / "templates") if (extracted / "templates").is_dir() else []:
                    destination = templates_path() / source.relative_to(extracted / "templates")
                    destination.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copy2(source, destination)
            except Exception:
                shutil.rmtree(root, ignore_errors=True)
                shutil.copytree(backup_root, root)
                raise
            finally:
                shutil.rmtree(backup_root, ignore_errors=True)
    return read_project(project_id)
