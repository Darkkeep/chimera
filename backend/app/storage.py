import hashlib
import json
import mimetypes
import os
import shutil
import re
import uuid
import time
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from threading import RLock, local
from typing import Iterator, Literal
from .models import AssessmentGroup, AssessmentGroupWrite, ProductionStageUpdate
from .ai_connection import connection_status
from .narration_connections import SPEECH_PROVIDERS, resolve_narration_connection
from .models import AssetAttributionUpdate, CourseCompletionSettings, EnhancementJob, EnhancementJobCreate, EnhancementProposal, EnhancementProposalChange, EnhancementProposalChangeCreate, EnhancementProposalCreate, EnhancementProposalDecisionRecord, ExportSettings, ExtractedAsset, GeneratedAssetCandidate, MediaGenerationJob, MediaGenerationJobCreate, ProjectCreate, ProjectDetail, ProjectSummary, PythiaAnalysisProposal, PythiaAnalysisProposalCreate, PythiaAnalysisProposalDecisionRecord, PythiaCourseFindingDecision, PythiaCourseFindingDecisionRecord, PythiaCourseFindingReview, PythiaCourseReview, PythiaCourseReviewCreate, PythiaTransformProposal, PythiaTransformProposalCreate, PythiaTransformProposalDecisionRecord, ReferencePassage, ReferenceResource, ReferenceResourceVersion, ReviewComment, ReviewCommentCreate, ReviewCommentDecision, ReviewCommentReply, ReviewReplyCreate, Scene, SceneCreate, SceneOrder, SceneUpdate, Storyboard, TemplateRecord, TemplateUpdate, TrashedProject
ROOT = Path(os.environ.get("CHIMERA_WORKSPACE", Path(__file__).resolve().parents[2] / "workspace"))
from .platform import DurableEventSink, LOCAL_ACTOR, ActorContext, PlatformEvent, get_actor_context, get_correlation_id
PROJECTS = ROOT / "projects"
_storyboard_write_lock = RLock()
_storyboard_transaction_state = local()
PROJECT_TRASH_RETENTION_DAYS = 30


def project_trash_path() -> Path:
    return PROJECTS / ".trash"


class StoryboardRevisionConflict(Exception):
    def __init__(self, expected_revision: int, actual_revision: int):
        super().__init__(f"Storyboard changed since revision {expected_revision}; current revision is {actual_revision}.")
        self.expected_revision = expected_revision
        self.actual_revision = actual_revision


@contextmanager
def storyboard_transaction() -> Iterator[None]:
    with _storyboard_write_lock:
        depth = getattr(_storyboard_transaction_state, "depth", 0)
        if depth:
            _storyboard_transaction_state.depth = depth + 1
            try:
                yield
            finally:
                _storyboard_transaction_state.depth -= 1
            return

        ROOT.mkdir(parents=True, exist_ok=True)
        lock_path = ROOT / ".storyboard-write.lock"
        with lock_path.open("a+b") as lock_file:
            if os.fstat(lock_file.fileno()).st_size == 0:
                lock_file.write(b"0")
                lock_file.flush()
            lock_file.seek(0)
            if os.name == "nt":
                import msvcrt

                msvcrt.locking(lock_file.fileno(), msvcrt.LK_LOCK, 1)
            else:
                import fcntl

                fcntl.flock(lock_file.fileno(), fcntl.LOCK_EX)
            _storyboard_transaction_state.depth = 1
            try:
                yield
            finally:
                _storyboard_transaction_state.depth = 0
                if os.name == "nt":
                    lock_file.seek(0)
                    msvcrt.locking(lock_file.fileno(), msvcrt.LK_UNLCK, 1)
                else:
                    fcntl.flock(lock_file.fileno(), fcntl.LOCK_UN)


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return slug or "project"


def project_path(project_id: str) -> Path:
    return PROJECTS / project_id


def templates_path() -> Path:
    return ROOT / "templates"


def template_path(template_id: str) -> Path:
    if not re.fullmatch(r"[a-f0-9]{32}", template_id):
        raise FileNotFoundError(template_id)
    return templates_path() / template_id


def read_template(template_id: str) -> TemplateRecord:
    path = template_path(template_id)
    metadata_path = path / "template.json"
    source_path = path / "template.pptx"
    if not metadata_path.is_file() or not source_path.is_file():
        raise FileNotFoundError(template_id)
    return TemplateRecord.model_validate(json.loads(metadata_path.read_text(encoding="utf-8")))


def list_templates() -> list[TemplateRecord]:
    root = templates_path()
    if not root.exists():
        return []
    templates = []
    for path in sorted(root.iterdir()):
        if path.is_dir():
            try:
                templates.append(read_template(path.name))
            except (FileNotFoundError, ValueError):
                continue
    return templates


def create_template(title: str, description: str, filename: str, content: bytes) -> TemplateRecord:
    template_id = uuid.uuid4().hex
    path = template_path(template_id)
    path.mkdir(parents=True, exist_ok=False)
    source_path = path / "template.pptx"
    temp_source = path / ".template.pptx.tmp"
    temp_source.write_bytes(content)
    temp_source.replace(source_path)
    record = TemplateRecord(
        id=template_id,
        title=title,
        description=description,
        filename=filename,
        sizeBytes=len(content),
        updatedAt=now_iso(),
    )
    temp_metadata = path / ".template.json.tmp"
    temp_metadata.write_text(record.model_dump_json(indent=2), encoding="utf-8")
    temp_metadata.replace(path / "template.json")
    return record


def update_template(template_id: str, data: TemplateUpdate) -> TemplateRecord:
    current = read_template(template_id)
    updates = data.model_dump(exclude_unset=True, exclude_none=True)
    record = current.model_copy(update={**updates, "updatedAt": now_iso()})
    path = template_path(template_id)
    temp_metadata = path / ".template.json.tmp"
    temp_metadata.write_text(record.model_dump_json(indent=2), encoding="utf-8")
    temp_metadata.replace(path / "template.json")
    return record


def replace_template_source(template_id: str, filename: str, content: bytes) -> TemplateRecord:
    current = read_template(template_id)
    path = template_path(template_id)
    temp_source = path / f".template-{uuid.uuid4().hex}.tmp"
    temp_source.write_bytes(content)
    temp_source.replace(path / "template.pptx")
    record = current.model_copy(update={"filename": filename, "sizeBytes": len(content), "updatedAt": now_iso()})
    temp_metadata = path / ".template.json.tmp"
    temp_metadata.write_text(record.model_dump_json(indent=2), encoding="utf-8")
    temp_metadata.replace(path / "template.json")
    return record


def validate_scene_template(layout_mode: str, template_id: str | None) -> None:
    if layout_mode == "template" and not template_id:
        raise ValueError("Choose a template for scenes using the template layout")
    if template_id:
        try:
            read_template(template_id)
        except FileNotFoundError as error:
            raise ValueError("Selected template was not found") from error


def ensure_project_dirs(path: Path) -> None:
    for name in ("original", "assets", "renders", "build", "output", "reports", "history", "audit"):
        (path / name).mkdir(parents=True, exist_ok=True)


def append_platform_event(project_id: str, event_name: str, metadata: dict[str, str | int | float | bool | None] | None = None, context: ActorContext | None = None) -> None:
    context = context or get_actor_context()
    event = PlatformEvent(
        eventName=event_name,
        installationId=context.installationId,
        actorId=context.actorId,
        actorDisplayName=context.actorDisplayName,
        correlationId=get_correlation_id(),
        projectId=project_id,
        deploymentMode=context.deploymentMode,
        eventClass="security",
        metadata=metadata or {},
    )
    DurableEventSink(project_path(project_id)).record(event)


def read_project(project_id: str) -> ProjectDetail:
    # Windows readers must close their handles before an atomic replacement.
    with _storyboard_write_lock:
        path = project_path(project_id)
        project_file = path / "project.json"
        storyboard_file = path / "storyboard.json"
        if not project_file.exists() or not storyboard_file.exists():
            raise FileNotFoundError(project_id)
        metadata = json.loads(project_file.read_text(encoding="utf-8"))
        if metadata.get("trashedAt"):
            raise FileNotFoundError(project_id)
        storyboard = Storyboard.model_validate(json.loads(storyboard_file.read_text(encoding="utf-8")))
        return ProjectDetail(
            **metadata,
            sceneCount=len(storyboard.scenes),
            hasSourceDeck=any((path / "original").iterdir()),
            storyboard=storyboard,
        )


def replace_project_file(source: Path, destination: Path) -> None:
    # Windows readers and scanners can briefly deny an otherwise atomic rename.
    # Keep the existing file intact and retry only Windows access/sharing errors.
    for attempt in range(6):
        try:
            source.replace(destination)
            return
        except PermissionError as error:
            if getattr(error, "winerror", None) not in {5, 32, 33} or attempt == 5:
                raise
            time.sleep(0.02 * (attempt + 1))


def write_project_metadata(path: Path, metadata: dict[str, str | int | None]) -> None:
    with _storyboard_write_lock:
        project_file = path / "project.json"
        existing = json.loads(project_file.read_text(encoding="utf-8")) if project_file.is_file() else {}
        persisted = {
            **existing,
            **metadata,
            "installationId": existing.get("installationId", metadata.get("installationId", get_actor_context().installationId)),
            "ownerId": existing.get("ownerId", metadata.get("ownerId", get_actor_context().actorId)),
        }
        temporary = path / f".project-{uuid.uuid4().hex}.json.tmp"
        temporary.write_text(json.dumps(persisted, indent=2), encoding="utf-8")
        replace_project_file(temporary, project_file)


def write_storyboard(path: Path, storyboard: Storyboard, expected_revision: int | None = None) -> None:
    with storyboard_transaction():
        storyboard = Storyboard.model_validate(storyboard.model_dump())
        storyboard_file = path / "storyboard.json"
        revision = 1
        if storyboard_file.exists():
            previous = Storyboard.model_validate(json.loads(storyboard_file.read_text(encoding="utf-8")))
            expected = storyboard.revision if expected_revision is None else expected_revision
            if expected != previous.revision:
                raise StoryboardRevisionConflict(expected, previous.revision)
            revision = previous.revision + 1
            timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
            snapshot = path / "history" / f"storyboard-{timestamp}.json"
            snapshot.write_bytes(storyboard_file.read_bytes())
        temp_file = path / f".storyboard-{uuid.uuid4().hex}.tmp"
        persisted = storyboard.model_copy(update={"revision": revision})
        temp_file.write_text(persisted.model_dump_json(indent=2), encoding="utf-8")
        replace_project_file(temp_file, storyboard_file)


def create_project(data: ProjectCreate, context: ActorContext | None = None) -> ProjectDetail:
    with storyboard_transaction():
        return _create_project(data, context)


def validate_project_parent(project_id: str, parent_project_id: str | None, installation_id: str) -> None:
    if parent_project_id is None:
        return
    if parent_project_id == project_id:
        raise RuntimeError("A project cannot be its own parent.")
    try:
        if Path(parent_project_id).name != parent_project_id or parent_project_id in {".", ".."}:
            raise FileNotFoundError(parent_project_id)
        parent = read_project(parent_project_id)
    except FileNotFoundError as error:
        raise RuntimeError("Parent is unavailable or trashed. Choose standalone or another active parent.") from error
    if parent.installationId != installation_id:
        raise RuntimeError("Parent and child must belong to the same installation.")
    if parent.parentProjectId is not None:
        raise RuntimeError("Only root projects can be parents; cycles and more than two levels are not allowed.")
    if any(item.parentProjectId == project_id for item in list_projects()):
        raise RuntimeError("Detach or move active subprojects before making this project a child.")


def update_project_relationship(project_id: str, parent_project_id: str | None, sibling_order: int, metadata_revision: int) -> ProjectDetail:
    with storyboard_transaction():
        project = read_project(project_id)
        if metadata_revision != project.metadataRevision:
            raise ProjectMetadataConflict(f"Project relationship changed; refresh and retry with metadataRevision {project.metadataRevision}.")
        if not 0 <= sibling_order <= 2147483647:
            raise ValueError("Display order must be between 0 and 2147483647.")
        validate_project_parent(project_id, parent_project_id, project.installationId)
        write_project_metadata(project_path(project_id), {
            "parentProjectId": parent_project_id,
            "siblingOrder": sibling_order,
            "metadataRevision": project.metadataRevision + 1,
            "updatedAt": now_iso(),
        })
        append_platform_event(project_id, "project.relationship_changed", {
            "previousParentProjectId": project.parentProjectId,
            "parentProjectId": parent_project_id,
            "previousSiblingOrder": project.siblingOrder,
            "siblingOrder": sibling_order,
            "metadataRevision": project.metadataRevision + 1,
        })
        return read_project(project_id)


class ProjectMetadataConflict(RuntimeError):
    pass


def _create_project(data: ProjectCreate, context: ActorContext | None = None) -> ProjectDetail:
    context = context or get_actor_context()
    PROJECTS.mkdir(parents=True, exist_ok=True)
    project_id = f"{slugify(data.title)}-{uuid.uuid4().hex[:8]}"
    validate_project_parent(project_id, data.parentProjectId, context.installationId)
    path = project_path(project_id)
    ensure_project_dirs(path)
    timestamp = now_iso()
    metadata = {
        "id": project_id,
        "title": data.title,
        "updatedAt": timestamp,
        "installationId": context.installationId,
        "ownerId": context.actorId,
        "productionStage": "draft",
        "metadataRevision": 1,
        "parentProjectId": data.parentProjectId,
        "siblingOrder": 0,
    }
    write_project_metadata(path, metadata)
    storyboard = Storyboard(projectId=project_id, title=data.title)
    write_storyboard(path, storyboard)
    append_platform_event(project_id, "project.created", {"title": data.title}, context)
    if data.parentProjectId is not None:
        append_platform_event(project_id, "project.relationship_changed", {
            "previousParentProjectId": None, "parentProjectId": data.parentProjectId,
            "siblingOrder": 0, "metadataRevision": 1,
        }, context)
    return read_project(project_id)


def update_project_production_stage(project_id: str, data: ProductionStageUpdate) -> ProjectDetail:
    with storyboard_transaction():
        project = read_project(project_id)
        write_project_metadata(project_path(project_id), {
            "productionStage": data.productionStage,
            "updatedAt": now_iso(),
        })
        append_platform_event(project_id, "project.production_stage_changed", {
            "previousStage": project.productionStage,
            "productionStage": data.productionStage,
        })
        return read_project(project_id)


def list_projects() -> list[ProjectSummary]:
    if not PROJECTS.exists():
        return []
    projects = []
    for path in sorted(PROJECTS.iterdir()):
        if path.is_dir() and not path.name.startswith("."):
            try:
                project = read_project(path.name)
                projects.append(ProjectSummary(**project.model_dump(exclude={"storyboard"})))
            except (FileNotFoundError, ValueError):
                continue
    return sorted(projects, key=lambda item: (item.siblingOrder, item.id))


def _read_trash_metadata(path: Path) -> tuple[dict[str, object], Storyboard]:
    project_root = path / "project"
    metadata = json.loads((project_root / "project.json").read_text(encoding="utf-8"))
    lifecycle = json.loads((path / "trash.json").read_text(encoding="utf-8"))
    storyboard = Storyboard.model_validate_json((project_root / "storyboard.json").read_text(encoding="utf-8"))
    if not lifecycle.get("trashedAt") or not lifecycle.get("expiresAt"):
        raise FileNotFoundError(path.name)
    return {**metadata, "trashedAt": lifecycle["trashedAt"], "trashExpiresAt": lifecycle["expiresAt"]}, storyboard


def _purge_expired_projects(now: datetime | None = None) -> int:
    trash_root = project_trash_path()
    if not trash_root.is_dir():
        return 0
    current = now or datetime.now(timezone.utc)
    purged = 0
    for path in trash_root.iterdir():
        if not path.is_dir():
            continue
        try:
            metadata, _ = _read_trash_metadata(path)
            if datetime.fromisoformat(str(metadata["trashExpiresAt"])) <= current:
                shutil.rmtree(path)
                purged += 1
        except (OSError, ValueError, KeyError):
            continue
    return purged


def list_trashed_projects(now: datetime | None = None) -> list[TrashedProject]:
    with storyboard_transaction():
        _purge_expired_projects(now)
        trash_root = project_trash_path()
        if not trash_root.is_dir():
            return []
        projects = []
        for path in sorted(trash_root.iterdir()):
            if not path.is_dir():
                continue
            try:
                metadata, storyboard = _read_trash_metadata(path)
                projects.append(TrashedProject.model_validate({
                    **metadata,
                    "sceneCount": len(storyboard.scenes),
                    "hasSourceDeck": any((path / "project" / "original").iterdir()),
                    "expiresAt": metadata["trashExpiresAt"],
                }))
            except (OSError, ValueError, KeyError):
                continue
        return projects


def trash_project(project_id: str) -> TrashedProject:
    if Path(project_id).name != project_id or project_id in {".", ".."}:
        raise FileNotFoundError(project_id)
    with storyboard_transaction():
        project = read_project(project_id)
        if any(item.parentProjectId == project_id for item in list_projects()):
            raise RuntimeError("Detach or move active subprojects before moving this project to trash.")
        active_jobs = [
            job for job in [*list_enhancement_jobs(project_id), *list_media_generation_jobs(project_id)]
            if job.status in {"queued", "running"}
        ]
        if active_jobs:
            raise RuntimeError("Wait for queued or running generation jobs to finish before moving this project to trash.")
        source = project_path(project_id)
        destination = project_trash_path() / project_id
        if destination.exists():
            raise FileExistsError(project_id)
        timestamp = datetime.now(timezone.utc)
        expires = timestamp + timedelta(days=PROJECT_TRASH_RETENTION_DAYS)
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.mkdir(parents=True, exist_ok=False)
        project_destination = destination / "project"
        try:
            source.replace(project_destination)
            manifest = {
                "trashedAt": timestamp.isoformat(),
                "expiresAt": expires.isoformat(),
            }
            temporary = destination / f".trash-{uuid.uuid4().hex}.tmp"
            temporary.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
            temporary.replace(destination / "trash.json")
        except OSError:
            if project_destination.exists() and not source.exists():
                project_destination.replace(source)
            shutil.rmtree(destination, ignore_errors=True)
            raise
        return next(item for item in list_trashed_projects(now=timestamp) if item.id == project_id)


def restore_trashed_project(project_id: str, now: datetime | None = None, *, parent_project_id: str | None = None, explicit_parent: bool = False) -> ProjectDetail:
    if Path(project_id).name != project_id or project_id in {".", ".."}:
        raise FileNotFoundError(project_id)
    with storyboard_transaction():
        _purge_expired_projects(now)
        source = project_trash_path() / project_id
        if not source.is_dir():
            raise FileNotFoundError(project_id)
        metadata, _ = _read_trash_metadata(source)
        summary = ProjectSummary.model_validate({
            **metadata, "sceneCount": 0, "hasSourceDeck": False,
        })
        if datetime.fromisoformat(str(metadata["trashExpiresAt"])) <= (now or datetime.now(timezone.utc)):
            shutil.rmtree(source)
            raise FileNotFoundError(project_id)
        destination = project_path(project_id)
        if destination.exists():
            raise FileExistsError(project_id)
        previous_parent = summary.parentProjectId
        selected_parent = parent_project_id if explicit_parent else previous_parent
        validate_project_parent(project_id, selected_parent, summary.installationId)
        write_project_metadata(source / "project", {
            "parentProjectId": selected_parent,
            "metadataRevision": summary.metadataRevision + 1,
            "updatedAt": now_iso(),
        })
        (source / "project").replace(destination)
        shutil.rmtree(source, ignore_errors=True)
        append_platform_event(project_id, "project.relationship_restored", {
            "previousParentProjectId": previous_parent,
            "parentProjectId": selected_parent,
            "metadataRevision": read_project(project_id).metadataRevision,
        })
        return read_project(project_id)


def persist_imported_assets(project_id: str, staging_root: Path, assets: list[ExtractedAsset]) -> None:
    project_root = project_path(project_id)
    for asset in assets:
        source = staging_root / asset.path
        destination = project_root / asset.path
        destination.parent.mkdir(parents=True, exist_ok=True)
        if not destination.exists():
            source.replace(destination)


def persist_slide_previews(project_id: str, staging_root: Path, scenes: list[Scene]) -> None:
    project_root = project_path(project_id)
    for scene in scenes:
        if not scene.previewImage:
            continue
        source = staging_root / scene.previewImage
        destination = project_root / scene.previewImage
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(source.read_bytes())


def update_from_import(project_id: str, scenes: list[Scene], assets: list[ExtractedAsset], expected_revision: int | None = None) -> ProjectDetail:
    path = project_path(project_id)
    current = read_project(project_id)
    storyboard = current.storyboard.model_copy(update={"scenes": scenes, "assets": assets})
    write_storyboard(path, storyboard, expected_revision or current.storyboard.revision)
    metadata = {"id": project_id, "title": current.title, "updatedAt": now_iso()}
    write_project_metadata(path, metadata)
    return read_project(project_id)


def replace_storyboard(project_id: str, imported: Storyboard, expected_revision: int | None = None) -> ProjectDetail:
    path = project_path(project_id)
    current = read_project(project_id)
    if imported.schemaVersion != "1.0":
        raise ValueError(f"Unsupported storyboard schema version: {imported.schemaVersion}")

    asset_by_id = {asset.id: asset for asset in imported.assets}
    if len(asset_by_id) != len(imported.assets):
        raise ValueError("Storyboard contains duplicate asset identifiers")
    project_root = path.resolve()
    assets_root = (project_root / "assets").resolve()
    for asset in imported.assets:
        asset_path = (project_root / asset.path).resolve()
        if not asset_path.is_relative_to(assets_root) or not asset_path.is_file():
            raise ValueError(f"Required asset is not available in this project: {asset.filename}")

    scene_ids = [scene.id for scene in imported.scenes]
    if len(set(scene_ids)) != len(scene_ids):
        raise ValueError("Storyboard contains duplicate scene identifiers")

    normalized_scenes: list[Scene] = []
    for scene in imported.scenes:
        validate_scene_template(scene.layoutMode, scene.templateId)
        for asset_id in scene.imageAssets:
            asset = asset_by_id.get(asset_id)
            if asset is None or asset.kind != "image":
                raise ValueError(f"Scene '{scene.title}' references an unavailable image asset: {asset_id}")
        for asset_id in scene.audioAssets:
            asset = asset_by_id.get(asset_id)
            if asset is None or asset.kind != "audio":
                raise ValueError(f"Scene '{scene.title}' references an unavailable audio asset: {asset_id}")
        if scene.backgroundAsset:
            background = asset_by_id.get(scene.backgroundAsset)
            if background is None or background.kind != "image":
                raise ValueError(f"Scene '{scene.title}' references an unavailable background image")

        validate_visual_assets(scene, asset_by_id)
        image_ids = set(scene.imageAssets)
        if set(scene.imageAltText) - image_ids or set(scene.decorativeImages) - image_ids:
            raise ValueError(f"Image accessibility metadata in '{scene.title}' references an unattached image")
        if set(scene.imageAltText) & set(scene.decorativeImages):
            raise ValueError(f"An image in '{scene.title}' cannot have alt text and be marked decorative")

        if scene.previewImage:
            renders_root = (project_root / "renders").resolve()
            preview_path = (project_root / scene.previewImage).resolve()
            if not preview_path.is_relative_to(renders_root) or not preview_path.is_file():
                scene = scene.model_copy(update={
                    "previewImage": None,
                    "renderWarning": scene.renderWarning or "Slide preview is not available in this project.",
                })
        normalized_scenes.append(scene)

    validate_remediation_targets(normalized_scenes)

    storyboard = imported.model_copy(update={
        "projectId": project_id,
        "title": current.title,
        "scenes": normalized_scenes,
    })
    from .media import validate_placements, validate_captions
    validate_placements(current.model_copy(update={"storyboard": storyboard}))
    for asset in storyboard.assets:
        validate_captions(asset.captionsVtt)
    write_storyboard(path, storyboard, expected_revision or current.storyboard.revision)
    metadata = {"id": project_id, "title": current.title, "updatedAt": now_iso()}
    write_project_metadata(path, metadata)
    return read_project(project_id)


def create_scene(project_id: str, data: SceneCreate, expected_revision: int | None = None) -> ProjectDetail:
    path = project_path(project_id)
    current = read_project(project_id)
    validate_scene_template(data.layoutMode, data.templateId)
    scene = Scene(
        id=f"scene-{uuid.uuid4().hex[:8]}",
        title=data.title,
        sceneType=data.sceneType,
        extractedText=data.extractedText,
        actionDescription=data.actionDescription,
        layoutMode=data.layoutMode,
        templateId=data.templateId,
        required=data.required,
        audioRequired=data.audioRequired,
        narration=data.narration,
        notes=data.notes,
        assessmentItem=data.assessmentItem,
        assessmentSettings=data.assessmentSettings,
    )
    storyboard = current.storyboard.model_copy(update={"scenes": [*current.storyboard.scenes, scene]})
    write_storyboard(path, storyboard, expected_revision or current.storyboard.revision)
    metadata = {"id": project_id, "title": current.title, "updatedAt": now_iso()}
    write_project_metadata(path, metadata)
    return read_project(project_id)


def create_scenes(project_id: str, scenes: list[SceneCreate], expected_revision: int) -> ProjectDetail:
    path = project_path(project_id)
    current = read_project(project_id)
    created_scenes = []
    for data in scenes:
        validate_scene_template(data.layoutMode, data.templateId)
        created_scenes.append(Scene(
            id=f"scene-{uuid.uuid4().hex[:8]}",
            title=data.title,
            sceneType=data.sceneType,
            extractedText=data.extractedText,
            actionDescription=data.actionDescription,
            layoutMode=data.layoutMode,
            templateId=data.templateId,
            required=data.required,
            audioRequired=data.audioRequired,
            narration=data.narration,
            notes=data.notes,
            assessmentItem=data.assessmentItem,
            assessmentSettings=data.assessmentSettings,
        ))
    storyboard = current.storyboard.model_copy(update={"scenes": [*current.storyboard.scenes, *created_scenes]})
    write_storyboard(path, storyboard, expected_revision)
    metadata = {"id": project_id, "title": current.title, "updatedAt": now_iso()}
    write_project_metadata(path, metadata)
    return read_project(project_id)


def validate_visual_assets(scene: Scene, assets: dict[str, ExtractedAsset]) -> None:
    references = {scene.backgroundAsset} if scene.backgroundAsset else set()
    if scene.visualLayout:
        references.update(element.assetId for element in scene.visualLayout.elements if element.kind == "image")
        if scene.visualLayout.backgroundAsset:
            references.add(scene.visualLayout.backgroundAsset)
        if scene.visualLayout.sourceBackgroundAsset:
            references.add(scene.visualLayout.sourceBackgroundAsset)
    if scene.visualLayout and scene.visualLayout.timeline:
        for clip in scene.visualLayout.timeline.clips:
            if clip.assetId not in assets or assets[clip.assetId].kind != clip.kind:
                raise ValueError("Timeline clips must reference matching media assets in this project")
    if any(reference not in assets or assets[reference].kind != "image" for reference in references):
        raise ValueError("Visual scene elements must reference image assets in this project")


def update_scene(project_id: str, scene_id: str, data: SceneUpdate, expected_revision: int | None = None) -> ProjectDetail:
    path = project_path(project_id)
    current = read_project(project_id)
    updates = data.model_dump(exclude_unset=True)
    if data.assessmentItem is not None:
        updates["assessmentItem"] = data.assessmentItem.model_dump()
    if not updates:
        return current
    scenes = list(current.storyboard.scenes)
    for index, scene in enumerate(scenes):
        if scene.id == scene_id:
            updated_scene = Scene.model_validate({**scene.model_dump(), **updates})
            if "backgroundAsset" in updates and "visualLayout" not in updates and updated_scene.visualLayout:
                updated_scene = updated_scene.model_copy(update={"visualLayout": updated_scene.visualLayout.model_copy(update={
                    "backgroundAsset": data.backgroundAsset, "backgroundMode": "image" if data.backgroundAsset else "none",
                })})
            if updated_scene.assessmentItem and (scene.assessmentItem is None or updated_scene.assessmentItem.identifier != scene.assessmentItem.identifier):
                if any(candidate.id != scene_id and candidate.assessmentItem and candidate.assessmentItem.identifier == updated_scene.assessmentItem.identifier for candidate in scenes):
                    raise ValueError("This stable question identifier already exists in this project")
            if "visualLayout" not in updates and updated_scene.visualLayout and any(field in updates for field in ["extractedText", "title", "imageAssets"]):
                from .models import SceneElement
                layout = updated_scene.visualLayout.model_copy(deep=True)
                text_elements = [element for element in layout.elements if element.kind == "text" and (layout.enabled or element.source == "slide")]
                title_element = next((element for element in text_elements if element.text == scene.title), None)
                if title_element:
                    if "title" in updates and updated_scene.title != scene.title:
                        title_element.text = updated_scene.title
                    text_elements = [element for element in text_elements if element.id != title_element.id]
                if "extractedText" in updates and updated_scene.extractedText != scene.extractedText:
                    texts = list(updated_scene.extractedText)
                    for element, text in zip(text_elements, texts):
                        element.text = text
                    if len(texts) < len(text_elements):
                        removed_ids = {element.id for element in text_elements[len(texts):]}
                        layout.elements = [element for element in layout.elements if element.id not in removed_ids]
                    for index, text in enumerate(texts[len(text_elements):], start=len(text_elements)):
                        layout.elements.append(SceneElement(id=f"text-{uuid.uuid4().hex[:8]}", kind="text", source="manual" if layout.enabled else "slide", text=text, x=40, y=min(layout.height - 100, 40 + index * 100), width=max(20, layout.width - 80), height=100))
                if "imageAssets" in updates:
                    detached = set(scene.imageAssets) - set(updated_scene.imageAssets)
                    layout.elements = [element for element in layout.elements if element.kind != "image" or element.assetId not in detached]
                updated_scene = updated_scene.model_copy(update={"visualLayout": layout})
            if "visualLayout" in updates and updated_scene.visualLayout:
                updated_scene = updated_scene.model_copy(update={"backgroundAsset": updated_scene.visualLayout.backgroundAsset})
            validate_visual_assets(updated_scene, {asset.id: asset for asset in current.storyboard.assets})
            if "visualLayout" in updates and updated_scene.visualLayout and updated_scene.visualLayout.enabled:
                visual_image_ids = [element.assetId for element in updated_scene.visualLayout.elements if element.kind == "image"]
                visual_text = [element.text for element in updated_scene.visualLayout.elements if element.kind == "text" and element.text.strip()]
                if visual_text and visual_text[0] == updated_scene.title:
                    visual_text = visual_text[1:]
                updated_scene = updated_scene.model_copy(update={
                    "extractedText": visual_text,
                    "imageAssets": list(dict.fromkeys([*updated_scene.imageAssets, *visual_image_ids])),
                    "backgroundAsset": updated_scene.visualLayout.backgroundAsset,
                })
            validate_scene_template(updated_scene.layoutMode, updated_scene.templateId)
            attached_image_ids = set(updated_scene.imageAssets)
            if "imageAltText" in updates and set(updated_scene.imageAltText) - attached_image_ids:
                raise ValueError("Image alt text must refer to attached images")
            if "decorativeImages" in updates and set(updated_scene.decorativeImages) - attached_image_ids:
                raise ValueError("Decorative image markers must refer to attached images")
            updated_scene = updated_scene.model_copy(update={
                "imageAltText": {asset_id: text for asset_id, text in updated_scene.imageAltText.items() if asset_id in attached_image_ids},
                "decorativeImages": [asset_id for asset_id in updated_scene.decorativeImages if asset_id in attached_image_ids],
            })
            known_asset_ids = {asset.id for asset in current.storyboard.assets}
            referenced_asset_ids = set(updated_scene.imageAssets + updated_scene.audioAssets + updated_scene.videoAssets)
            if not referenced_asset_ids.issubset(known_asset_ids):
                raise ValueError("Scene references an asset that is not in this project")
            if any(asset.kind != "image" for asset in current.storyboard.assets if asset.id in updated_scene.imageAssets):
                raise ValueError("Image scene references must point to image assets")
            if any(asset.kind != "audio" for asset in current.storyboard.assets if asset.id in updated_scene.audioAssets):
                raise ValueError("Audio scene references must point to audio assets")
            if any(asset.kind != "video" for asset in current.storyboard.assets if asset.id in updated_scene.videoAssets):
                raise ValueError("Video scene references must point to video assets")
            if set(updated_scene.imageAltText) - attached_image_ids or set(updated_scene.decorativeImages) - attached_image_ids:
                raise ValueError("Image accessibility metadata must refer to attached images")
            if set(updated_scene.imageAltText) & set(updated_scene.decorativeImages):
                raise ValueError("An image cannot have alt text and be marked decorative")
            scenes[index] = updated_scene
            break
    else:
        raise KeyError(scene_id)
    validate_remediation_targets(scenes)
    storyboard = current.storyboard.model_copy(update={"scenes": scenes})
    from .media import validate_placements
    validate_placements(current.model_copy(update={"storyboard": storyboard}))
    write_storyboard(path, storyboard, expected_revision or current.storyboard.revision)
    metadata = {"id": project_id, "title": current.title, "updatedAt": now_iso()}
    write_project_metadata(path, metadata)
    return read_project(project_id)


def delete_scene(project_id: str, scene_id: str, expected_revision: int | None = None) -> ProjectDetail:
    path = project_path(project_id)
    current = read_project(project_id)
    if not any(scene.id == scene_id for scene in current.storyboard.scenes):
        raise KeyError(scene_id)

    scenes = [scene for scene in current.storyboard.scenes if scene.id != scene_id]
    for index, scene in enumerate(scenes):
        settings = scene.assessmentSettings
        if settings and settings.remediationSceneId == scene_id:
            scenes[index] = scene.model_copy(update={
                "assessmentSettings": settings.model_copy(update={"remediationSceneId": None}),
            })

    assessments = [group.model_copy(update={"questionSceneIds": [member for member in group.questionSceneIds if member != scene_id]}) for group in current.storyboard.assessments]
    storyboard = current.storyboard.model_copy(update={"scenes": scenes, "assessments": assessments})
    write_storyboard(path, storyboard, expected_revision if expected_revision is not None else current.storyboard.revision)
    metadata = {"id": project_id, "title": current.title, "updatedAt": now_iso()}
    write_project_metadata(path, metadata)
    return read_project(project_id)


def save_assessment_group(project_id: str, data: AssessmentGroupWrite | None, expected_revision: int, assessment_id: str | None = None) -> ProjectDetail:
    with storyboard_transaction():
        current = read_project(project_id)
        if expected_revision != current.storyboard.revision:
            raise StoryboardRevisionConflict(expected_revision, current.storyboard.revision)
        groups = list(current.storyboard.assessments)
        if assessment_id is None:
            if data is None:
                raise ValueError("Assessment fields are required")
            groups.append(AssessmentGroup(id=f"assessment-{uuid.uuid4().hex[:8]}", **data.model_dump()))
        else:
            for index, group in enumerate(groups):
                if group.id == assessment_id:
                    if data is None:
                        groups.pop(index)
                    else:
                        groups[index] = AssessmentGroup(id=assessment_id, **data.model_dump())
                    break
            else:
                raise KeyError(assessment_id)
        path = project_path(project_id)
        write_storyboard(path, current.storyboard.model_copy(update={"assessments": groups}), expected_revision)
        write_project_metadata(path, {"updatedAt": now_iso()})
        return read_project(project_id)


def validate_remediation_targets(scenes: list[Scene]) -> None:
    scene_ids = {scene.id for scene in scenes}
    for scene in scenes:
        remediation_id = scene.assessmentSettings.remediationSceneId if scene.assessmentSettings else None
        if remediation_id and (remediation_id not in scene_ids or remediation_id == scene.id):
            raise ValueError("Assessment remediation must point to a different scene in this storyboard")


def update_project_completion_settings(project_id: str, settings: CourseCompletionSettings, expected_revision: int | None = None) -> ProjectDetail:
    path = project_path(project_id)
    current = read_project(project_id)
    storyboard = current.storyboard.model_copy(update={"completionSettings": settings})
    write_storyboard(path, storyboard, expected_revision or current.storyboard.revision)
    metadata = {"id": project_id, "title": current.title, "updatedAt": now_iso()}
    write_project_metadata(path, metadata)
    return read_project(project_id)


def update_project_export_settings(project_id: str, settings: ExportSettings, expected_revision: int | None = None) -> ProjectDetail:
    path = project_path(project_id)
    current = read_project(project_id)
    write_storyboard(path, current.storyboard.model_copy(update={"exportSettings": settings}), expected_revision or current.storyboard.revision)
    metadata = {"id": project_id, "title": current.title, "updatedAt": now_iso()}
    write_project_metadata(path, metadata)
    return read_project(project_id)


def prepare_authored_project(project_id: str, expected_revision: int | None = None) -> ProjectDetail:
    from .authoring import prepared_project
    from .media import validate_backgrounds
    current = read_project(project_id)
    expected = expected_revision or current.storyboard.revision
    if expected != current.storyboard.revision:
        raise StoryboardRevisionConflict(expected, current.storyboard.revision)
    with prepared_project(current, project_path(project_id)) as (candidate, staging, assets):
        if candidate.storyboard == current.storyboard:
            return current
        validate_backgrounds(candidate)
        with storyboard_transaction():
            actual = read_project(project_id).storyboard.revision
            if actual != expected:
                raise StoryboardRevisionConflict(expected, actual)
            persist_imported_assets(project_id, staging, assets)
            write_storyboard(project_path(project_id), candidate.storyboard, expected)
        write_project_metadata(project_path(project_id), {"id": project_id, "title": current.title, "updatedAt": now_iso()})
    return read_project(project_id)


def update_project_background(project_id: str, background_asset: str | None, expected_revision: int | None = None) -> ProjectDetail:
    from .authoring import prepared_project
    from .media import validate_backgrounds
    path = project_path(project_id)
    current = read_project(project_id)
    expected = expected_revision or current.storyboard.revision
    if expected != current.storyboard.revision:
        raise StoryboardRevisionConflict(expected, current.storyboard.revision)
    candidate = current.model_copy(update={"storyboard": current.storyboard.model_copy(update={"backgroundAsset": background_asset})})
    validate_backgrounds(candidate)
    # One project-level transaction prepares legacy slides and changes the default.
    with prepared_project(candidate, path) as (candidate, staging, assets):
        validate_backgrounds(candidate)
        with storyboard_transaction():
            actual = read_project(project_id).storyboard.revision
            if actual != expected:
                raise StoryboardRevisionConflict(expected, actual)
            persist_imported_assets(project_id, staging, assets)
            write_storyboard(path, candidate.storyboard, expected)
    write_project_metadata(path, {"id": project_id, "title": current.title, "updatedAt": now_iso()})
    return read_project(project_id)


class EnhancementProposalConflict(ValueError):
    pass


def _enhancement_proposals_path(project_id: str) -> Path:
    return project_path(project_id) / "proposals" / "enhancements.json"


def _pythia_analysis_proposals_path(project_id: str) -> Path:
    return project_path(project_id) / "proposals" / "pythia-analyses.json"


def list_pythia_analysis_proposals(project_id: str) -> list[PythiaAnalysisProposal]:
    read_project(project_id)
    path = _pythia_analysis_proposals_path(project_id)
    if not path.is_file():
        return []
    return [PythiaAnalysisProposal.model_validate(item) for item in json.loads(path.read_text(encoding="utf-8"))]


def create_pythia_analysis_proposal(
    project_id: str,
    data: PythiaAnalysisProposalCreate,
    artifact: dict[str, object],
) -> PythiaAnalysisProposal:
    with storyboard_transaction():
        project = read_project(project_id)
        if data.sourceRevision > project.storyboard.revision:
            raise ValueError("The proposal source revision is newer than the storyboard")
        if not any(scene.id == data.sceneId for scene in project.storyboard.scenes):
            raise KeyError(data.sceneId)
        proposals = list_pythia_analysis_proposals(project_id)
        existing = next((proposal for proposal in proposals if proposal.taskId == data.taskId), None)
        if existing:
            if existing.artifactId != data.artifactId or existing.sceneId != data.sceneId:
                raise ValueError("The task already has a different Pythia analysis proposal")
            return existing
        proposal = PythiaAnalysisProposal(
            id=f"pythia-proposal-{uuid.uuid4().hex[:12]}",
            taskId=data.taskId,
            artifactId=data.artifactId,
            sceneId=data.sceneId,
            sourceRevision=data.sourceRevision,
            artifact=artifact,
            createdAt=now_iso(),
        )
        proposals.append(proposal)
        path = _pythia_analysis_proposals_path(project_id)
        path.parent.mkdir(parents=True, exist_ok=True)
        temp_path = path.with_name(f".{path.name}.{uuid.uuid4().hex}.tmp")
        temp_path.write_text(json.dumps([item.model_dump(mode="json") for item in proposals], indent=2), encoding="utf-8")
        temp_path.replace(path)
        return proposal


def decide_pythia_analysis_proposal(
    project_id: str,
    proposal_id: str,
    decision: Literal["accept", "reject"],
) -> PythiaAnalysisProposal:
    with storyboard_transaction():
        project = read_project(project_id)
        proposals = list_pythia_analysis_proposals(project_id)
        for index, proposal in enumerate(proposals):
            if proposal.id != proposal_id:
                continue
            if proposal.status != "pending":
                raise ValueError("Only pending Pythia analysis proposals can be decided")
            now = now_iso()
            actor = get_actor_context()
            record = PythiaAnalysisProposalDecisionRecord(
                decision=decision,
                decidedAt=now,
                storyboardRevision=project.storyboard.revision,
                actorId=actor.actorId,
                actorDisplayName=actor.actorDisplayName,
                installationId=actor.installationId,
                correlationId=get_correlation_id(),
            )
            decided = proposal.model_copy(update={
                "status": "accepted" if decision == "accept" else "rejected",
                "decidedAt": now,
                "decisionHistory": [*proposal.decisionHistory, record],
            })
            proposals[index] = decided
            path = _pythia_analysis_proposals_path(project_id)
            temp_path = path.with_name(f".{path.name}.{uuid.uuid4().hex}.tmp")
            temp_path.write_text(json.dumps([item.model_dump(mode="json") for item in proposals], indent=2), encoding="utf-8")
            temp_path.replace(path)
            return decided
        raise KeyError(proposal_id)


def _pythia_transform_proposals_path(project_id: str) -> Path:
    return project_path(project_id) / "proposals" / "pythia-transforms.json"


def _write_pythia_transform_proposals(project_id: str, proposals: list[PythiaTransformProposal]) -> None:
    path = _pythia_transform_proposals_path(project_id)
    path.parent.mkdir(parents=True, exist_ok=True)
    temp_path = path.with_name(f".{path.name}.{uuid.uuid4().hex}.tmp")
    temp_path.write_text(json.dumps([proposal.model_dump(mode="json") for proposal in proposals], indent=2), encoding="utf-8")
    temp_path.replace(path)


def list_pythia_transform_proposals(project_id: str) -> list[PythiaTransformProposal]:
    read_project(project_id)
    path = _pythia_transform_proposals_path(project_id)
    if not path.is_file():
        return []
    return [PythiaTransformProposal.model_validate(item) for item in json.loads(path.read_text(encoding="utf-8"))]


def create_pythia_transform_proposal(
    project_id: str,
    data: PythiaTransformProposalCreate,
    artifact: dict[str, object],
) -> PythiaTransformProposal:
    with storyboard_transaction():
        project = read_project(project_id)
        if data.sourceRevision > project.storyboard.revision:
            raise ValueError("The proposal source revision is newer than the storyboard")
        current_scene_ids = {scene.id for scene in project.storyboard.scenes}
        if not set(data.sourceSceneIds).issubset(current_scene_ids):
            raise KeyError("A selected scene no longer exists")
        proposals = list_pythia_transform_proposals(project_id)
        existing = next((proposal for proposal in proposals if proposal.taskId == data.taskId), None)
        if existing:
            if existing.artifactId != data.artifactId or existing.sourceSceneIds != data.sourceSceneIds:
                raise ValueError("The task already has a different Pythia transformation proposal")
            return existing
        proposal = PythiaTransformProposal(
            id=f"pythia-transform-{uuid.uuid4().hex[:12]}",
            taskId=data.taskId,
            artifactId=data.artifactId,
            sourceSceneIds=data.sourceSceneIds,
            sourceRevision=data.sourceRevision,
            artifact=artifact,
            createdAt=now_iso(),
        )
        _write_pythia_transform_proposals(project_id, [*proposals, proposal])
        return proposal


def decide_pythia_transform_proposal(
    project_id: str,
    proposal_id: str,
    decision: Literal["accept", "reject"],
    expected_revision: int,
    proposed_scenes: list[dict[str, object]] | None = None,
) -> tuple[PythiaTransformProposal, ProjectDetail | None]:
    with storyboard_transaction():
        project = read_project(project_id)
        proposals = list_pythia_transform_proposals(project_id)
        for index, proposal in enumerate(proposals):
            if proposal.id != proposal_id:
                continue
            if proposal.status != "pending":
                raise ValueError("Only pending Pythia transformation proposals can be decided")
            if expected_revision != project.storyboard.revision:
                raise StoryboardRevisionConflict(expected_revision, project.storyboard.revision)
            if decision == "accept" and proposal.sourceRevision != project.storyboard.revision:
                now = now_iso()
                proposals[index] = proposal.model_copy(update={"status": "stale", "decidedAt": now})
                _write_pythia_transform_proposals(project_id, proposals)
                raise EnhancementProposalConflict("This transformation is stale because the storyboard changed")

            now = now_iso()
            updated_project: ProjectDetail | None = None
            accepted_scenes: list[dict[str, object]] = []
            project_root = project_path(project_id)
            storyboard_file = project_root / "storyboard.json"
            metadata_file = project_root / "project.json"
            proposals_file = _pythia_transform_proposals_path(project_id)
            storyboard_snapshot = storyboard_file.read_bytes() if decision == "accept" else None
            metadata_snapshot = metadata_file.read_bytes() if decision == "accept" else None
            proposals_snapshot = proposals_file.read_bytes() if decision == "accept" and proposals_file.exists() else None

            if decision == "accept":
                scenes_to_apply = proposed_scenes or proposal.artifact["payload"]["proposed_scenes"]
                current_scenes = list(project.storyboard.scenes)
                selected_ids = set(proposal.sourceSceneIds)
                selected_indices = [scene_index for scene_index, scene in enumerate(current_scenes) if scene.id in selected_ids]
                if len(selected_indices) != len(selected_ids):
                    raise EnhancementProposalConflict("A selected source scene no longer exists")
                insert_index = min(selected_indices)
                added_scenes = [Scene(
                    id=f"scene-{uuid.uuid4().hex[:8]}",
                    title=scene_data["title"],
                    sceneType="content",
                    extractedText=scene_data["learner_content"],
                    actionDescription=f"Purpose: {scene_data['purpose']}\nInteraction: {scene_data['interaction_recommendation']}",
                    notes=scene_data["production_notes"],
                    layoutMode="native",
                ) for scene_data in scenes_to_apply]
                replacement_scenes = [
                    *current_scenes[:insert_index],
                    *added_scenes,
                    *(scene for scene in current_scenes[insert_index:] if scene.id not in selected_ids),
                ]
                try:
                    updated_project = replace_storyboard(
                        project_id,
                        project.storyboard.model_copy(update={"scenes": replacement_scenes}),
                        expected_revision,
                    )
                    accepted_scenes = [scene_data for scene_data in scenes_to_apply]
                    record = PythiaTransformProposalDecisionRecord(
                        decision=decision,
                        decidedAt=now,
                        expectedRevision=expected_revision,
                        actorId=get_actor_context().actorId,
                        actorDisplayName=get_actor_context().actorDisplayName,
                        installationId=get_actor_context().installationId,
                        correlationId=get_correlation_id(),
                        acceptedScenes=accepted_scenes,
                    )
                    decided = proposal.model_copy(update={
                        "status": "accepted",
                        "decidedAt": now,
                        "decisionHistory": [*proposal.decisionHistory, record],
                    })
                    proposals[index] = decided
                    _write_pythia_transform_proposals(project_id, proposals)
                except Exception:
                    _restore_file_snapshot(storyboard_file, storyboard_snapshot)
                    _restore_file_snapshot(metadata_file, metadata_snapshot)
                    _restore_file_snapshot(proposals_file, proposals_snapshot)
                    raise
            else:
                record = PythiaTransformProposalDecisionRecord(
                    decision=decision,
                    decidedAt=now,
                    expectedRevision=expected_revision,
                    actorId=get_actor_context().actorId,
                    actorDisplayName=get_actor_context().actorDisplayName,
                    installationId=get_actor_context().installationId,
                    correlationId=get_correlation_id(),
                )
                decided = proposal.model_copy(update={
                    "status": "rejected",
                    "decidedAt": now,
                    "decisionHistory": [*proposal.decisionHistory, record],
                })
                proposals[index] = decided
                _write_pythia_transform_proposals(project_id, proposals)
            return decided, updated_project
        raise KeyError(proposal_id)


def _reference_resources_path(project_id: str) -> Path:
    return project_path(project_id) / "references" / "resources.json"


def _enhancement_jobs_path(project_id: str) -> Path:
    return project_path(project_id) / "enhancement-jobs"


def _media_generation_jobs_path(project_id: str) -> Path:
    return project_path(project_id) / "media-generation-jobs"


def _generated_candidates_path(project_id: str) -> Path:
    return project_path(project_id) / "generated-candidates"


def _review_comments_path(project_id: str) -> Path:
    return project_path(project_id) / "review" / "comments.json"


def _pythia_course_reviews_path(project_id: str) -> Path:
    return project_path(project_id) / "review" / "pythia-course-reviews.json"


def _write_pythia_course_reviews(project_id: str, reviews: list[PythiaCourseReview]) -> None:
    path = _pythia_course_reviews_path(project_id)
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f".{path.name}.{uuid.uuid4().hex}.tmp")
    temporary.write_text(json.dumps([review.model_dump(mode="json") for review in reviews], indent=2), encoding="utf-8")
    temporary.replace(path)


def list_pythia_course_reviews(project_id: str) -> list[PythiaCourseReview]:
    read_project(project_id)
    path = _pythia_course_reviews_path(project_id)
    if not path.is_file():
        return []
    return [PythiaCourseReview.model_validate(item) for item in json.loads(path.read_text(encoding="utf-8"))]


def create_pythia_course_review(
    project_id: str,
    data: PythiaCourseReviewCreate,
    artifact: dict[str, object],
) -> PythiaCourseReview:
    with storyboard_transaction():
        project = read_project(project_id)
        if data.sourceRevision > project.storyboard.revision:
            raise ValueError("Course review source revision is newer than the project")
        reviews = list_pythia_course_reviews(project_id)
        existing = next((review for review in reviews if review.taskId == data.taskId), None)
        if existing:
            if existing.artifactId != data.artifactId:
                raise ValueError("The Pythia task already has a different course review")
            return existing
        now = now_iso()
        payload = artifact["payload"]
        review = PythiaCourseReview(
            id=f"course-review-{uuid.uuid4().hex[:12]}",
            taskId=data.taskId,
            artifactId=data.artifactId,
            sourceRevision=data.sourceRevision,
            artifact=artifact,
            findings=[PythiaCourseFindingReview(findingId=finding["finding_id"]) for finding in payload["findings"]],
            createdAt=now,
            updatedAt=now,
        )
        _write_pythia_course_reviews(project_id, [*reviews, review])
        return review


def decide_pythia_course_finding(
    project_id: str,
    review_id: str,
    finding_id: str,
    data: PythiaCourseFindingDecision,
) -> PythiaCourseReview:
    with storyboard_transaction():
        reviews = list_pythia_course_reviews(project_id)
        for review_index, review in enumerate(reviews):
            if review.id != review_id:
                continue
            finding_index = next((index for index, finding in enumerate(review.findings) if finding.findingId == finding_id), None)
            if finding_index is None:
                raise KeyError(finding_id)
            finding = review.findings[finding_index]
            now = now_iso()
            actor = get_actor_context()
            decision = PythiaCourseFindingDecisionRecord(
                previousStatus=finding.status,
                status=data.status,
                resolutionNote=data.resolutionNote,
                decidedAt=now,
                actorId=actor.actorId,
                actorDisplayName=actor.actorDisplayName,
                installationId=actor.installationId,
                correlationId=get_correlation_id(),
            )
            findings = list(review.findings)
            findings[finding_index] = finding.model_copy(update={
                "status": data.status,
                "resolutionNote": data.resolutionNote,
                "decisionHistory": [*finding.decisionHistory, decision],
            })
            updated = review.model_copy(update={"findings": findings, "updatedAt": now})
            reviews[review_index] = updated
            _write_pythia_course_reviews(project_id, reviews)
            return updated
        raise KeyError(review_id)


def list_reference_resources(project_id: str) -> list[ReferenceResource]:
    read_project(project_id)
    path = _reference_resources_path(project_id)
    if not path.is_file():
        return []
    return [ReferenceResource.model_validate(item) for item in json.loads(path.read_text(encoding="utf-8"))]


def _write_review_comments(project_id: str, comments: list[ReviewComment]) -> None:
    path = _review_comments_path(project_id)
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f".{path.name}.{uuid.uuid4().hex}.tmp")
    temporary.write_text(json.dumps([comment.model_dump(mode="json") for comment in comments], indent=2), encoding="utf-8")
    temporary.replace(path)


def list_review_comments(project_id: str) -> list[ReviewComment]:
    project = read_project(project_id)
    path = _review_comments_path(project_id)
    if not path.is_file():
        return []
    scene_map = {scene.id: scene for scene in project.storyboard.scenes}
    comments = []
    for item in json.loads(path.read_text(encoding="utf-8")):
        comment = ReviewComment.model_validate(item)
        scene = scene_map.get(comment.sceneId)
        comments.append(comment.model_copy(update={
            "outdated": scene is not None and comment.revision != project.storyboard.revision,
            "sceneDeleted": scene is None,
        }))
    return sorted(comments, key=lambda comment: comment.createdAt)


def create_review_comment(project_id: str, data: ReviewCommentCreate, context: ActorContext | None = None) -> ReviewComment:
    context = context or get_actor_context()
    if context.deploymentMode == "team":
        data = data.model_copy(update={"authorLabel": context.actorDisplayName})
    with storyboard_transaction():
        project = read_project(project_id)
        scene = next((scene for scene in project.storyboard.scenes if scene.id == data.sceneId), None)
        if scene is None:
            raise KeyError(data.sceneId)
        if data.assetId and data.assetId not in {asset.id for asset in project.storyboard.assets}:
            raise ValueError("Review comment asset anchor is not available in this project")
        comments = list_review_comments(project_id)
        now = now_iso()
        comment = ReviewComment(
            id=f"comment-{uuid.uuid4().hex[:12]}",
            projectId=project_id,
            sceneId=scene.id,
            sceneTitle=scene.title,
            revision=project.storyboard.revision,
            actorId=context.actorId,
            **data.model_dump(exclude={"sceneId"}),
            createdAt=now,
            updatedAt=now,
        )
        comments.append(comment)
        _write_review_comments(project_id, comments)
        append_platform_event(project_id, "review.comment_created", {"commentId": comment.id, "sceneId": scene.id}, context)
        return comment


def add_review_reply(project_id: str, comment_id: str, data: ReviewReplyCreate, context: ActorContext | None = None) -> ReviewComment:
    context = context or get_actor_context()
    if context.deploymentMode == "team":
        data = data.model_copy(update={"authorLabel": context.actorDisplayName})
    with storyboard_transaction():
        comments = list_review_comments(project_id)
        for index, comment in enumerate(comments):
            if comment.id != comment_id:
                continue
            reply = ReviewCommentReply(id=f"reply-{uuid.uuid4().hex[:12]}", actorId=context.actorId, **data.model_dump(), createdAt=now_iso())
            updated = comment.model_copy(update={"replies": [*comment.replies, reply], "updatedAt": now_iso()})
            comments[index] = updated
            _write_review_comments(project_id, comments)
            append_platform_event(project_id, "review.reply_created", {"commentId": comment.id, "replyId": reply.id}, context)
            return updated
        raise KeyError(comment_id)


def decide_review_comment(project_id: str, comment_id: str, data: ReviewCommentDecision, context: ActorContext | None = None) -> ReviewComment:
    context = context or get_actor_context()
    with storyboard_transaction():
        comments = list_review_comments(project_id)
        for index, comment in enumerate(comments):
            if comment.id != comment_id:
                continue
            updated = comment.model_copy(update={"resolved": data.resolved, "resolvedAt": now_iso() if data.resolved else None, "updatedAt": now_iso()})
            comments[index] = updated
            _write_review_comments(project_id, comments)
            append_platform_event(project_id, "review.comment_resolved" if data.resolved else "review.comment_reopened", {"commentId": comment.id}, context)
            return updated
        raise KeyError(comment_id)


def save_reference_resource(
    project_id: str,
    filename: str,
    title: str,
    classification: Literal["study-guide", "supporting-document", "policy", "other"],
    authoritative: bool,
    scene_ids: list[str],
    content: bytes,
    content_type: str,
    passages: list[ReferencePassage],
    extraction_status: Literal["complete", "partial", "failed"],
    extraction_message: str | None,
    resource_id: str | None = None,
) -> ReferenceResource:
    with storyboard_transaction():
        project = read_project(project_id)
        if set(scene_ids) - {scene.id for scene in project.storyboard.scenes}:
            raise ValueError("Reference scene assignments must point to scenes in this project")
        resources = list_reference_resources(project_id)
        resource = next((item for item in resources if item.id == resource_id), None) if resource_id else None
        if resource_id and resource is None:
            raise KeyError(resource_id)
        resource_id = resource.id if resource else f"reference-{uuid.uuid4().hex[:12]}"
        version_number = len(resource.versions) + 1 if resource else 1
        version = str(version_number)
        digest = hashlib.sha256(content).hexdigest()
        safe_name = Path(filename).name
        relative_path = Path("references") / resource_id / version / safe_name
        destination = project_path(project_id) / relative_path
        destination.parent.mkdir(parents=True, exist_ok=True)
        temporary = destination.with_name(f".{destination.name}.{uuid.uuid4().hex}.tmp")
        temporary.write_bytes(content)
        temporary.replace(destination)
        version_record = ReferenceResourceVersion(
            version=version,
            filename=safe_name,
            contentType=content_type,
            sizeBytes=len(content),
            sha256=digest,
            originalPath=relative_path.as_posix(),
            passages=passages,
            extractionStatus=extraction_status,
            extractionMessage=extraction_message,
            createdAt=now_iso(),
        )
        if resource:
            updated = resource.model_copy(update={
                "title": title,
                "classification": classification,
                "authoritative": authoritative,
                "sceneIds": scene_ids,
                "currentVersion": version,
                "versions": [*resource.versions, version_record],
            })
            resources = [updated if item.id == resource.id else item for item in resources]
        else:
            updated = ReferenceResource(
                id=resource_id,
                title=title,
                classification=classification,
                authoritative=authoritative,
                sceneIds=scene_ids,
                currentVersion=version,
                versions=[version_record],
            )
            resources.append(updated)
        path = _reference_resources_path(project_id)
        path.parent.mkdir(parents=True, exist_ok=True)
        temporary_index = path.with_name(f".{path.name}.{uuid.uuid4().hex}.tmp")
        temporary_index.write_text(json.dumps([item.model_dump(mode="json") for item in resources], indent=2), encoding="utf-8")
        temporary_index.replace(path)
        return updated


def create_enhancement_job(
    project_id: str,
    data: EnhancementJobCreate,
    resource_versions: dict[str, str] | None = None,
) -> EnhancementJob:
    with storyboard_transaction():
        project = read_project(project_id)
        scenes = project.storyboard.scenes
        scene_ids = [scene.id for scene in scenes] if data.scope == "whole-course" else data.sceneIds
        if set(scene_ids) - {scene.id for scene in scenes}:
            raise ValueError("Enhancement jobs can only target scenes in this project")
        if data.commentId and data.commentId not in {comment.id for comment in list_review_comments(project_id)}:
            raise ValueError("Enhancement job comment does not exist")
        resources = {resource.id: resource for resource in list_reference_resources(project_id)}
        if set(data.resourceIds) - set(resources):
            raise ValueError("One or more selected reference resources do not exist")
        selected_resources = [resources[resource_id] for resource_id in data.resourceIds]
        for resource in selected_resources:
            selected_version = (resource_versions or {}).get(resource.id, resource.currentVersion)
            version = next((item for item in resource.versions if item.version == selected_version), None)
            if version is None:
                raise ValueError(f"Selected version for reference '{resource.title}' is unavailable")
            if version.extractionStatus != "complete":
                raise ValueError(f"Reference '{resource.title}' has no complete text extraction")
        timestamp = now_iso()
        job = EnhancementJob(
            id=f"enhancement-{uuid.uuid4().hex[:12]}",
            projectId=project_id,
            sourceRevision=project.storyboard.revision,
            scope=data.scope,
            sceneIds=scene_ids,
            goal=data.goal,
            resourceIds=data.resourceIds,
            resourceVersions={resource.id: (resource_versions or {}).get(resource.id, resource.currentVersion) for resource in selected_resources},
            commentId=data.commentId,
            createdAt=timestamp,
            updatedAt=timestamp,
        )
        write_enhancement_job(job)
        return job


def write_enhancement_job(job: EnhancementJob) -> None:
    directory = _enhancement_jobs_path(job.projectId)
    directory.mkdir(parents=True, exist_ok=True)
    path = directory / f"{job.id}.json"
    temporary = path.with_name(f".{path.name}.{uuid.uuid4().hex}.tmp")
    temporary.write_text(job.model_dump_json(indent=2), encoding="utf-8")
    temporary.replace(path)


def read_enhancement_job(project_id: str, job_id: str) -> EnhancementJob:
    read_project(project_id)
    if not re.fullmatch(r"enhancement-[a-f0-9]{12}", job_id):
        raise FileNotFoundError(job_id)
    path = _enhancement_jobs_path(project_id) / f"{job_id}.json"
    if not path.is_file():
        raise FileNotFoundError(job_id)
    return EnhancementJob.model_validate_json(path.read_text(encoding="utf-8"))


def list_enhancement_jobs(project_id: str) -> list[EnhancementJob]:
    read_project(project_id)
    directory = _enhancement_jobs_path(project_id)
    if not directory.is_dir():
        return []
    jobs = [EnhancementJob.model_validate_json(path.read_text(encoding="utf-8")) for path in directory.glob("enhancement-*.json")]
    return sorted(jobs, key=lambda job: job.createdAt, reverse=True)


def update_enhancement_job(project_id: str, job_id: str, **updates: object) -> EnhancementJob:
    with storyboard_transaction():
        job = read_enhancement_job(project_id, job_id)
        updated = job.model_copy(update={**updates, "updatedAt": now_iso()})
        write_enhancement_job(updated)
        return updated


def create_media_generation_job(project_id: str, data: MediaGenerationJobCreate) -> MediaGenerationJob:
    with storyboard_transaction():
        project = read_project(project_id)
        if not any(scene.id == data.sceneId for scene in project.storyboard.scenes):
            raise ValueError("Media generation must target a scene in this project")
        connection_revision = connection_status(ROOT)["revision"]
        values = data.model_dump()
        if data.narrationConnectionId and data.kind != "narration":
            raise ValueError("Narration connections cannot generate images.")
        if data.kind == "narration" and data.narrationConnectionId not in {None, "legacy-openai"}:
            connection = resolve_narration_connection(ROOT, data.narrationConnectionId)
            if connection.settings["provider"] not in SPEECH_PROVIDERS:
                raise ValueError("This connection supports setup only; video generation is not yet available.")
            connection_revision = connection.revision
            values["voice"] = data.voice or connection.settings["voice"]
            values["language"] = data.language or connection.settings["language"]
            if not values["voice"]:
                raise ValueError("Save or select a voice for this narration connection before generating.")
            if connection.settings["provider"] == "google-cloud" and len(data.script.encode("utf-8")) > 5000:
                raise ValueError("Google Cloud narration is limited to 5,000 UTF-8 bytes per request.")
        timestamp = now_iso()
        job = MediaGenerationJob(
            id=f"media-generation-{uuid.uuid4().hex[:12]}",
            projectId=project_id,
            sourceRevision=project.storyboard.revision,
            aiConnectionRevision=connection_revision,
            **values,
            createdAt=timestamp,
            updatedAt=timestamp,
        )
        write_media_generation_job(job)
        return job


def write_media_generation_job(job: MediaGenerationJob) -> None:
    directory = _media_generation_jobs_path(job.projectId)
    directory.mkdir(parents=True, exist_ok=True)
    path = directory / f"{job.id}.json"
    temporary = path.with_name(f".{path.name}.{uuid.uuid4().hex}.tmp")
    temporary.write_text(job.model_dump_json(indent=2), encoding="utf-8")
    temporary.replace(path)


def read_media_generation_job(project_id: str, job_id: str) -> MediaGenerationJob:
    read_project(project_id)
    if not re.fullmatch(r"media-generation-[a-f0-9]{12}", job_id):
        raise FileNotFoundError(job_id)
    path = _media_generation_jobs_path(project_id) / f"{job_id}.json"
    if not path.is_file():
        raise FileNotFoundError(job_id)
    return MediaGenerationJob.model_validate_json(path.read_text(encoding="utf-8"))


def list_media_generation_jobs(project_id: str) -> list[MediaGenerationJob]:
    read_project(project_id)
    directory = _media_generation_jobs_path(project_id)
    if not directory.is_dir():
        return []
    jobs = [MediaGenerationJob.model_validate_json(path.read_text(encoding="utf-8")) for path in directory.glob("media-generation-*.json")]
    return sorted(jobs, key=lambda job: job.createdAt, reverse=True)


def update_media_generation_job(project_id: str, job_id: str, **updates: object) -> MediaGenerationJob:
    with storyboard_transaction():
        job = read_media_generation_job(project_id, job_id)
        updated = job.model_copy(update={**updates, "updatedAt": now_iso()})
        write_media_generation_job(updated)
        return updated


def write_generated_candidate(candidate: GeneratedAssetCandidate, content: bytes) -> None:
    directory = _generated_candidates_path(candidate.projectId)
    directory.mkdir(parents=True, exist_ok=True)
    destination = project_path(candidate.projectId) / candidate.path
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = destination.with_name(f".{destination.name}.{uuid.uuid4().hex}.tmp")
    temporary.write_bytes(content)
    temporary.replace(destination)
    index = directory / f"{candidate.id}.json"
    temporary_index = index.with_name(f".{index.name}.{uuid.uuid4().hex}.tmp")
    temporary_index.write_text(candidate.model_dump_json(indent=2), encoding="utf-8")
    temporary_index.replace(index)


def read_generated_candidate(project_id: str, candidate_id: str) -> GeneratedAssetCandidate:
    read_project(project_id)
    if not re.fullmatch(r"candidate-[a-f0-9]{12}", candidate_id):
        raise FileNotFoundError(candidate_id)
    path = _generated_candidates_path(project_id) / f"{candidate_id}.json"
    if not path.is_file():
        raise FileNotFoundError(candidate_id)
    return GeneratedAssetCandidate.model_validate_json(path.read_text(encoding="utf-8"))


def list_generated_candidates(project_id: str) -> list[GeneratedAssetCandidate]:
    read_project(project_id)
    directory = _generated_candidates_path(project_id)
    if not directory.is_dir():
        return []
    candidates = [GeneratedAssetCandidate.model_validate_json(path.read_text(encoding="utf-8")) for path in directory.glob("candidate-*.json")]
    return sorted(candidates, key=lambda candidate: candidate.createdAt, reverse=True)


def update_generated_candidate(project_id: str, candidate_id: str, **updates: object) -> GeneratedAssetCandidate:
    with storyboard_transaction():
        candidate = read_generated_candidate(project_id, candidate_id)
        updated = candidate.model_copy(update=updates)
        path = _generated_candidates_path(project_id) / f"{candidate.id}.json"
        temporary = path.with_name(f".{path.name}.{uuid.uuid4().hex}.tmp")
        temporary.write_text(updated.model_dump_json(indent=2), encoding="utf-8")
        temporary.replace(path)
        return updated


def approve_generated_candidate(project_id: str, candidate_id: str, expected_revision: int) -> tuple[GeneratedAssetCandidate, EnhancementProposal, ProjectDetail]:
    with storyboard_transaction():
        project = read_project(project_id)
        if project.storyboard.revision != expected_revision:
            raise StoryboardRevisionConflict(expected_revision, project.storyboard.revision)
        candidate = read_generated_candidate(project_id, candidate_id)
        if candidate.status != "pending":
            raise ValueError("Only pending generated candidates can be approved")
        candidate_path = project_path(project_id) / candidate.path
        if not candidate_path.is_file():
            raise ValueError("Generated candidate media is unavailable")
        promoted = add_project_asset(project_id, candidate.filename, candidate_path.read_bytes(), candidate.kind, expected_revision)
        scene = next(scene for scene in promoted.storyboard.scenes if scene.id == candidate.sceneId)
        asset_field = "imageAssets" if candidate.kind == "image" else "audioAssets"
        proposed_assets = [*getattr(scene, asset_field), next(asset.id for asset in promoted.storyboard.assets if asset.sha256 == candidate.sha256)]
        changes: list[EnhancementProposalChangeCreate] = [EnhancementProposalChangeCreate(targetSceneId=scene.id, field=asset_field, proposedValue=proposed_assets)]
        if candidate.kind == "image" and candidate.altText:
            changes.append(EnhancementProposalChangeCreate(targetSceneId=scene.id, field="imageAltText", proposedValue={**scene.imageAltText, proposed_assets[-1]: candidate.altText}))
        proposal = create_enhancement_proposal(project_id, EnhancementProposalCreate(
            changes=changes,
            rationale=f"Place generated {candidate.kind} candidate in '{scene.title}'.",
            origin="ai",
            provider=candidate.provider,
            model=candidate.model,
            affectedIds=[scene.id, proposed_assets[-1]],
        ))
        updated_candidate = update_generated_candidate(project_id, candidate_id, status="approved", approvedAssetId=proposed_assets[-1])
        return updated_candidate, proposal, read_project(project_id)


def _write_enhancement_proposals(project_id: str, proposals: list[EnhancementProposal]) -> None:
    path = _enhancement_proposals_path(project_id)
    path.parent.mkdir(parents=True, exist_ok=True)
    temp_path = path.with_name(f".{path.name}.{uuid.uuid4().hex}.tmp")
    temp_path.write_text(json.dumps([proposal.model_dump(mode="json") for proposal in proposals], indent=2), encoding="utf-8")
    temp_path.replace(path)


def _restore_file_snapshot(path: Path, content: bytes | None) -> None:
    if content is None:
        path.unlink(missing_ok=True)
        return
    temp_path = path.with_name(f".{path.name}.{uuid.uuid4().hex}.rollback")
    temp_path.write_bytes(content)
    temp_path.replace(path)


def list_enhancement_proposals(project_id: str) -> list[EnhancementProposal]:
    read_project(project_id)
    path = _enhancement_proposals_path(project_id)
    if not path.is_file():
        return []
    return [EnhancementProposal.model_validate(item) for item in json.loads(path.read_text(encoding="utf-8"))]


def _proposal_value(value: object) -> object:
    return value.model_dump(mode="json") if hasattr(value, "model_dump") else value


def _snapshot_proposal_change(project: ProjectDetail, change: EnhancementProposalChangeCreate) -> EnhancementProposalChange:
    if change.field == "sceneOrder":
        if change.targetSceneId is not None:
            raise ValueError("Scene order changes cannot target an individual scene")
        before_value = [scene.id for scene in project.storyboard.scenes]
    elif change.field == "storyboardTitle":
        if change.targetSceneId is not None:
            raise ValueError("Storyboard title changes cannot target an individual scene")
        before_value = project.storyboard.title
    elif change.field == "completionSettings":
        if change.targetSceneId is not None:
            raise ValueError("Completion settings changes cannot target an individual scene")
        before_value = project.storyboard.completionSettings.model_dump(mode="json")
    else:
        if change.targetSceneId is None:
            raise ValueError(f"{change.field} changes require a target scene")
        scene = next((item for item in project.storyboard.scenes if item.id == change.targetSceneId), None)
        if scene is None:
            raise KeyError(change.targetSceneId)
        before_value = _proposal_value(getattr(scene, change.field))
    proposed_value = _proposal_value(change.proposedValue)
    if before_value == proposed_value:
        raise ValueError("The proposed value is already present")
    return EnhancementProposalChange(
        targetSceneId=change.targetSceneId,
        field=change.field,
        beforeValue=before_value,
        proposedValue=proposed_value,
    )


def create_enhancement_proposal(project_id: str, data: EnhancementProposalCreate) -> EnhancementProposal:
    with storyboard_transaction():
        if data.jobId:
            existing = next((item for item in list_enhancement_proposals(project_id) if item.jobId == data.jobId), None)
            if existing:
                return existing
        project = read_project(project_id)
        if data.sourceRevision is not None and data.sourceRevision != project.storyboard.revision:
            raise EnhancementProposalConflict("The storyboard changed while the Pythia assessment was being generated")
        requested_changes = data.changes or [EnhancementProposalChangeCreate(
            targetSceneId=data.targetSceneId,
            field=data.field,
            proposedValue=data.proposedValue,
        )]
        change_keys = [(change.targetSceneId, change.field) for change in requested_changes]
        if len(set(change_keys)) != len(change_keys):
            raise ValueError("A proposal cannot change the same field more than once")
        changes = [_snapshot_proposal_change(project, change) for change in requested_changes]
        first_change = changes[0]
        affected_ids = list(dict.fromkeys([*data.affectedIds, *(change.targetSceneId for change in changes if change.targetSceneId)]))
        if any(change.field == "sceneOrder" for change in changes):
            affected_ids = list(dict.fromkeys([*affected_ids, *(scene.id for scene in project.storyboard.scenes)]))
        proposal = EnhancementProposal(
            id=f"proposal-{uuid.uuid4().hex[:12]}",
            targetSceneId=first_change.targetSceneId,
            field=first_change.field,
            beforeValue=first_change.beforeValue,
            proposedValue=first_change.proposedValue,
            changes=changes,
            sourceRevision=project.storyboard.revision,
            affectedIds=affected_ids,
            dependencyGroupId=data.dependencyGroupId,
            referenceCitations=data.referenceCitations,
            rationale=data.rationale,
            origin=data.origin,
            provider=data.provider,
            model=data.model,
            sourceTaskId=data.sourceTaskId,
            sourceArtifactId=data.sourceArtifactId,
            sourceCapability=data.sourceCapability,
            sourceArtifact=data.sourceArtifact,
            createdAt=now_iso(),
        )
        proposals = list_enhancement_proposals(project_id)
        proposals.append(proposal)
        _write_enhancement_proposals(project_id, proposals)
        return proposal


def _proposal_changes(proposal: EnhancementProposal) -> list[EnhancementProposalChange]:
    if proposal.changes:
        return proposal.changes
    return [EnhancementProposalChange(
        targetSceneId=proposal.targetSceneId,
        field=proposal.field,
        beforeValue=proposal.beforeValue,
        proposedValue=proposal.proposedValue,
    )]


def _apply_proposal_changes(project: ProjectDetail, changes: list[EnhancementProposalChange], expected_revision: int) -> ProjectDetail:
    scenes = list(project.storyboard.scenes)
    storyboard = project.storyboard
    for change in changes:
        if change.field == "sceneOrder":
            proposed_ids = change.proposedValue
            current_ids = [scene.id for scene in scenes]
            if current_ids != change.beforeValue:
                raise EnhancementProposalConflict("The storyboard scene order has changed since this suggestion")
            if (
                not isinstance(proposed_ids, list)
                or any(not isinstance(scene_id, str) for scene_id in proposed_ids)
                or len(proposed_ids) != len(current_ids)
                or set(proposed_ids) != set(current_ids)
            ):
                raise EnhancementProposalConflict("The proposed scene order no longer matches this storyboard")
            scene_by_id = {scene.id: scene for scene in scenes}
            scenes = [scene_by_id[scene_id] for scene_id in proposed_ids]
            continue
        if change.field == "storyboardTitle":
            if storyboard.title != change.beforeValue:
                raise EnhancementProposalConflict("The storyboard title has changed since this suggestion")
            storyboard = storyboard.model_copy(update={"title": change.proposedValue})
            continue
        if change.field == "completionSettings":
            if storyboard.completionSettings.model_dump(mode="json") != change.beforeValue:
                raise EnhancementProposalConflict("Completion settings have changed since this suggestion")
            settings = CourseCompletionSettings.model_validate(change.proposedValue)
            storyboard = storyboard.model_copy(update={"completionSettings": settings})
            continue
        if change.targetSceneId is None:
            raise EnhancementProposalConflict("The proposal is missing a target scene")
        index = next((index for index, scene in enumerate(scenes) if scene.id == change.targetSceneId), None)
        if index is None:
            raise EnhancementProposalConflict("A target scene in this proposal no longer exists")
        current_value = _proposal_value(getattr(scenes[index], change.field))
        if current_value != change.beforeValue:
            raise EnhancementProposalConflict("A target field in this suggestion has changed")
        update = SceneUpdate.model_validate({change.field: change.proposedValue})
        updates = update.model_dump(exclude_unset=True)
        updated_scene = Scene.model_validate({**scenes[index].model_dump(), **updates})
        validate_scene_template(updated_scene.layoutMode, updated_scene.templateId)
        scenes[index] = updated_scene

    known_assets = {asset.id: asset for asset in storyboard.assets}
    for scene in scenes:
        references = set(scene.imageAssets + scene.audioAssets)
        if not references.issubset(known_assets):
            raise EnhancementProposalConflict("The proposal references media that is not in this project")
        image_ids = set(scene.imageAssets)
        if set(scene.imageAltText) - image_ids or set(scene.decorativeImages) - image_ids:
            raise EnhancementProposalConflict("Image accessibility data must reference attached images")
        if set(scene.imageAltText) & set(scene.decorativeImages):
            raise EnhancementProposalConflict("An image cannot have alt text and be marked decorative")
        if any(known_assets[asset_id].kind != "image" for asset_id in scene.imageAssets):
            raise EnhancementProposalConflict("An image placement proposal references a non-image asset")
        if any(known_assets[asset_id].kind != "audio" for asset_id in scene.audioAssets):
            raise EnhancementProposalConflict("An audio placement proposal references a non-audio asset")
    validate_remediation_targets(scenes)
    path = project_path(project.id)
    write_storyboard(path, storyboard.model_copy(update={"scenes": scenes}), expected_revision)
    metadata = {"id": project.id, "title": project.title, "updatedAt": now_iso()}
    write_project_metadata(path, metadata)
    return read_project(project.id)


def decide_enhancement_proposal(
    project_id: str,
    proposal_id: str,
    decision: Literal["accept", "reject", "reverse"],
    expected_revision: int,
    edited_changes: list[EnhancementProposalChangeCreate] | None = None,
) -> tuple[EnhancementProposal, ProjectDetail | None]:
    with storyboard_transaction():
        project = read_project(project_id)
        if project.storyboard.revision != expected_revision:
            raise StoryboardRevisionConflict(expected_revision, project.storyboard.revision)
        proposals = list_enhancement_proposals(project_id)
        for index, proposal in enumerate(proposals):
            if proposal.id != proposal_id:
                continue
            now = now_iso()
            updated_project: ProjectDetail | None = None
            applied_changes: list[EnhancementProposalChange] = []
            original_changes: list[EnhancementProposalChange] = []
            project_root = project_path(project_id)
            storyboard_file = project_root / "storyboard.json"
            metadata_file = project_root / "project.json"
            proposals_file = _enhancement_proposals_path(project_id)
            storyboard_snapshot = storyboard_file.read_bytes() if decision in ("accept", "reverse") else None
            metadata_snapshot = metadata_file.read_bytes() if decision in ("accept", "reverse") else None
            proposals_snapshot = proposals_file.read_bytes() if decision in ("accept", "reverse") and proposals_file.exists() else None
            if decision == "reverse":
                if proposal.status != "accepted":
                    raise ValueError("Only accepted enhancement proposals can be reversed")
                accepted_entry = next(
                    (entry for entry in reversed(proposal.decisionHistory) if entry.decision == "accept"),
                    None,
                )
                original_changes = accepted_entry.appliedChanges if accepted_entry else _proposal_changes(proposal)
                applied_changes = [change.model_copy(update={
                    "beforeValue": _proposal_value(change.proposedValue),
                    "proposedValue": _proposal_value(change.beforeValue),
                }) for change in original_changes]
                updated_project = _apply_proposal_changes(project, applied_changes, expected_revision)
            elif proposal.status != "pending":
                raise ValueError("Only pending enhancement proposals can be decided")
            elif decision == "accept":
                changes = _proposal_changes(proposal)
                original_changes = changes
                if proposal.sourceRevision != project.storyboard.revision:
                    proposals[index] = proposal.model_copy(update={"status": "stale", "decidedAt": now})
                    _write_enhancement_proposals(project_id, proposals)
                    raise EnhancementProposalConflict("This suggestion is stale because the storyboard revision changed")
                if edited_changes is not None:
                    if len(edited_changes) != len(changes) or any(
                        (edit.targetSceneId, edit.field) != (original.targetSceneId, original.field)
                        for edit, original in zip(edited_changes, changes)
                    ):
                        raise ValueError("Edits may change proposed values but cannot change proposal targets")
                    changes = [original.model_copy(update={"proposedValue": _proposal_value(edit.proposedValue)}) for original, edit in zip(changes, edited_changes)]
                try:
                    updated_project = _apply_proposal_changes(project, changes, expected_revision)
                except EnhancementProposalConflict:
                    proposals[index] = proposal.model_copy(update={"status": "stale", "decidedAt": now})
                    _write_enhancement_proposals(project_id, proposals)
                    raise
                applied_changes = changes
            else:
                original_changes = _proposal_changes(proposal)

            audit_entry = EnhancementProposalDecisionRecord(
                decision=decision,
                decidedAt=now,
                expectedRevision=expected_revision,
                actorId=get_actor_context().actorId,
                actorDisplayName=get_actor_context().actorDisplayName,
                installationId=get_actor_context().installationId,
                correlationId=get_correlation_id(),
                originalChanges=original_changes,
                appliedChanges=applied_changes,
            )
            status = "accepted" if decision == "accept" else "reversed" if decision == "reverse" else "rejected"
            proposal_updates: dict[str, object] = {
                "status": status,
                "decidedAt": now,
                "decisionHistory": [*proposal.decisionHistory, audit_entry],
            }
            if decision == "accept" and applied_changes:
                proposal_updates.update({
                    "changes": applied_changes,
                    "targetSceneId": applied_changes[0].targetSceneId,
                    "field": applied_changes[0].field,
                    "beforeValue": applied_changes[0].beforeValue,
                    "proposedValue": applied_changes[0].proposedValue,
                })
            proposals[index] = proposal.model_copy(update={
                **proposal_updates,
            })
            if decision == "accept":
                accepted_keys = {(change.targetSceneId, change.field) for change in applied_changes}
                for other_index, other in enumerate(proposals):
                    if other_index == index or other.status != "pending":
                        continue
                    if accepted_keys & {(change.targetSceneId, change.field) for change in _proposal_changes(other)}:
                        superseded_audit = EnhancementProposalDecisionRecord(
                            decision="superseded",
                            decidedAt=now,
                            expectedRevision=expected_revision,
                            actorId=get_actor_context().actorId,
                            actorDisplayName=get_actor_context().actorDisplayName,
                            installationId=get_actor_context().installationId,
                            correlationId=get_correlation_id(),
                        )
                        proposals[other_index] = other.model_copy(update={
                            "status": "superseded",
                            "decidedAt": now,
                            "decisionHistory": [*other.decisionHistory, superseded_audit],
                        })
            try:
                _write_enhancement_proposals(project_id, proposals)
            except Exception:
                if decision in ("accept", "reverse"):
                    _restore_file_snapshot(storyboard_file, storyboard_snapshot)
                    _restore_file_snapshot(metadata_file, metadata_snapshot)
                    _restore_file_snapshot(proposals_file, proposals_snapshot)
                raise
            return proposals[index], updated_project
        raise KeyError(proposal_id)


def add_project_asset(project_id: str, filename: str, content: bytes, kind: Literal["image", "audio", "video"], expected_revision: int | None = None, *, source_metadata: dict | None = None) -> ProjectDetail:
    path = project_path(project_id)
    current = read_project(project_id)
    digest = hashlib.sha256(content).hexdigest()
    extension = Path(filename).suffix.lower()
    content_type = mimetypes.guess_type(filename)[0] or ("application/octet-stream")
    asset_id = f"{kind}-{digest}"
    safe_filename = f"{asset_id}{extension}"
    relative_path = Path("assets") / {"image": "images", "audio": "audio", "video": "video"}[kind] / safe_filename
    destination = path / relative_path
    destination.parent.mkdir(parents=True, exist_ok=True)
    created_destination = False
    if not destination.exists():
        temp_file = destination.with_name(f".{safe_filename}.{uuid.uuid4().hex}.tmp")
        temp_file.write_bytes(content)
        temp_file.replace(destination)
        created_destination = True
    asset = ExtractedAsset(
        id=asset_id,
        kind=kind,
        filename=Path(filename).name,
        contentType=content_type,
        sizeBytes=len(content),
        sha256=digest,
        path=relative_path.as_posix(),
    )
    existing = next((item for item in current.storyboard.assets if item.id == asset.id), None)
    if existing:
        if expected_revision is not None and expected_revision != current.storyboard.revision:
            raise StoryboardRevisionConflict(expected_revision, current.storyboard.revision)
        return current
    if source_metadata:
        asset = ExtractedAsset.model_validate({**asset.model_dump(), **source_metadata})
    assets = list(current.storyboard.assets)
    assets.append(asset)
    storyboard = current.storyboard.model_copy(update={"assets": assets})
    try:
        write_storyboard(path, storyboard, expected_revision or current.storyboard.revision)
    except StoryboardRevisionConflict:
        if created_destination:
            destination.unlink(missing_ok=True)
        raise
    metadata = {"id": project_id, "title": current.title, "updatedAt": now_iso()}
    write_project_metadata(path, metadata)
    return read_project(project_id)


def update_project_asset_attribution(project_id: str, asset_id: str, data: AssetAttributionUpdate, expected_revision: int | None = None) -> ProjectDetail:
    path = project_path(project_id)
    current = read_project(project_id)
    assets = list(current.storyboard.assets)
    for index, asset in enumerate(assets):
        if asset.id == asset_id:
            assets[index] = asset.model_copy(update=data.model_dump())
            storyboard = current.storyboard.model_copy(update={"assets": assets})
            write_storyboard(path, storyboard, expected_revision or current.storyboard.revision)
            metadata = {"id": project_id, "title": current.title, "updatedAt": now_iso()}
            write_project_metadata(path, metadata)
            return read_project(project_id)
    raise KeyError(asset_id)


def reorder_scenes(project_id: str, scene_ids: list[str], expected_revision: int | None = None) -> ProjectDetail:
    path = project_path(project_id)
    current = read_project(project_id)
    existing_ids = [scene.id for scene in current.storyboard.scenes]
    if len(scene_ids) != len(existing_ids) or set(scene_ids) != set(existing_ids):
        raise ValueError("Scene order must contain every project scene exactly once")
    if scene_ids == existing_ids:
        return current
    scenes_by_id = {scene.id: scene for scene in current.storyboard.scenes}
    storyboard = current.storyboard.model_copy(update={"scenes": [scenes_by_id[scene_id] for scene_id in scene_ids]})
    write_storyboard(path, storyboard, expected_revision or current.storyboard.revision)
    metadata = {"id": project_id, "title": current.title, "updatedAt": now_iso()}
    write_project_metadata(path, metadata)
    return read_project(project_id)
