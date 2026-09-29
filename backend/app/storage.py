import json
import hashlib
import mimetypes
import os
import re
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal

from .models import AssetAttributionUpdate, CourseCompletionSettings, EnhancementProposal, EnhancementProposalCreate, ExportSettings, ExtractedAsset, ProjectCreate, ProjectDetail, ProjectSummary, Scene, SceneCreate, SceneUpdate, Storyboard, TemplateRecord, TemplateUpdate


ROOT = Path(os.environ.get("CHIMERA_WORKSPACE", Path(__file__).resolve().parents[2] / "workspace"))
PROJECTS = ROOT / "projects"


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
    for name in ("original", "assets", "renders", "build", "output", "reports", "history"):
        (path / name).mkdir(parents=True, exist_ok=True)


def read_project(project_id: str) -> ProjectDetail:
    path = project_path(project_id)
    project_file = path / "project.json"
    storyboard_file = path / "storyboard.json"
    if not project_file.exists() or not storyboard_file.exists():
        raise FileNotFoundError(project_id)
    metadata = json.loads(project_file.read_text(encoding="utf-8"))
    storyboard = Storyboard.model_validate(json.loads(storyboard_file.read_text(encoding="utf-8")))
    return ProjectDetail(
        **metadata,
        sceneCount=len(storyboard.scenes),
        hasSourceDeck=any((path / "original").iterdir()),
        storyboard=storyboard,
    )


def write_storyboard(path: Path, storyboard: Storyboard) -> None:
    storyboard_file = path / "storyboard.json"
    if storyboard_file.exists():
        timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
        snapshot = path / "history" / f"storyboard-{timestamp}.json"
        snapshot.write_bytes(storyboard_file.read_bytes())
    temp_file = path / f".storyboard-{uuid.uuid4().hex}.tmp"
    temp_file.write_text(storyboard.model_dump_json(indent=2), encoding="utf-8")
    temp_file.replace(storyboard_file)


def create_project(data: ProjectCreate) -> ProjectDetail:
    PROJECTS.mkdir(parents=True, exist_ok=True)
    project_id = f"{slugify(data.title)}-{uuid.uuid4().hex[:8]}"
    path = project_path(project_id)
    ensure_project_dirs(path)
    timestamp = now_iso()
    metadata = {"id": project_id, "title": data.title, "updatedAt": timestamp}
    (path / "project.json").write_text(json.dumps(metadata, indent=2), encoding="utf-8")
    storyboard = Storyboard(projectId=project_id, title=data.title)
    write_storyboard(path, storyboard)
    return read_project(project_id)


def list_projects() -> list[ProjectSummary]:
    if not PROJECTS.exists():
        return []
    projects = []
    for path in sorted(PROJECTS.iterdir()):
        if path.is_dir():
            try:
                project = read_project(path.name)
                projects.append(ProjectSummary(**project.model_dump(exclude={"storyboard"})))
            except (FileNotFoundError, ValueError):
                continue
    return projects


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


def update_from_import(project_id: str, scenes: list[Scene], assets: list[ExtractedAsset]) -> ProjectDetail:
    path = project_path(project_id)
    current = read_project(project_id)
    storyboard = current.storyboard.model_copy(update={"scenes": scenes, "assets": assets})
    write_storyboard(path, storyboard)
    metadata = {"id": project_id, "title": current.title, "updatedAt": now_iso()}
    (path / "project.json").write_text(json.dumps(metadata, indent=2), encoding="utf-8")
    return read_project(project_id)


def replace_storyboard(project_id: str, imported: Storyboard) -> ProjectDetail:
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
    write_storyboard(path, storyboard)
    metadata = {"id": project_id, "title": current.title, "updatedAt": now_iso()}
    (path / "project.json").write_text(json.dumps(metadata, indent=2), encoding="utf-8")
    return read_project(project_id)


def create_scene(project_id: str, data: SceneCreate) -> ProjectDetail:
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
        notes=data.notes,
    )
    storyboard = current.storyboard.model_copy(update={"scenes": [*current.storyboard.scenes, scene]})
    write_storyboard(path, storyboard)
    metadata = {"id": project_id, "title": current.title, "updatedAt": now_iso()}
    (path / "project.json").write_text(json.dumps(metadata, indent=2), encoding="utf-8")
    return read_project(project_id)


def update_scene(project_id: str, scene_id: str, data: SceneUpdate) -> ProjectDetail:
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
            referenced_asset_ids = set(updated_scene.imageAssets + updated_scene.audioAssets)
            if not referenced_asset_ids.issubset(known_asset_ids):
                raise ValueError("Scene references an asset that is not in this project")
            if any(asset.kind != "image" for asset in current.storyboard.assets if asset.id in updated_scene.imageAssets):
                raise ValueError("Image scene references must point to image assets")
            if any(asset.kind != "audio" for asset in current.storyboard.assets if asset.id in updated_scene.audioAssets):
                raise ValueError("Audio scene references must point to audio assets")
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
    write_storyboard(path, storyboard)
    metadata = {"id": project_id, "title": current.title, "updatedAt": now_iso()}
    (path / "project.json").write_text(json.dumps(metadata, indent=2), encoding="utf-8")
    return read_project(project_id)


def validate_remediation_targets(scenes: list[Scene]) -> None:
    scene_ids = {scene.id for scene in scenes}
    for scene in scenes:
        remediation_id = scene.assessmentSettings.remediationSceneId if scene.assessmentSettings else None
        if remediation_id and (remediation_id not in scene_ids or remediation_id == scene.id):
            raise ValueError("Assessment remediation must point to a different scene in this storyboard")


def update_project_completion_settings(project_id: str, settings: CourseCompletionSettings) -> ProjectDetail:
    path = project_path(project_id)
    current = read_project(project_id)
    storyboard = current.storyboard.model_copy(update={"completionSettings": settings})
    write_storyboard(path, storyboard)
    metadata = {"id": project_id, "title": current.title, "updatedAt": now_iso()}
    (path / "project.json").write_text(json.dumps(metadata, indent=2), encoding="utf-8")
    return read_project(project_id)


def update_project_export_settings(project_id: str, settings: ExportSettings) -> ProjectDetail:
    path = project_path(project_id)
    current = read_project(project_id)
    write_storyboard(path, current.storyboard.model_copy(update={"exportSettings": settings}))
    metadata = {"id": project_id, "title": current.title, "updatedAt": now_iso()}
    (path / "project.json").write_text(json.dumps(metadata, indent=2), encoding="utf-8")
    return read_project(project_id)


class EnhancementProposalConflict(ValueError):
    pass


def _enhancement_proposals_path(project_id: str) -> Path:
    return project_path(project_id) / "proposals" / "enhancements.json"


def _write_enhancement_proposals(project_id: str, proposals: list[EnhancementProposal]) -> None:
    path = _enhancement_proposals_path(project_id)
    path.parent.mkdir(parents=True, exist_ok=True)
    temp_path = path.with_name(f".{path.name}.{uuid.uuid4().hex}.tmp")
    temp_path.write_text(json.dumps([proposal.model_dump(mode="json") for proposal in proposals], indent=2), encoding="utf-8")
    temp_path.replace(path)


def list_enhancement_proposals(project_id: str) -> list[EnhancementProposal]:
    read_project(project_id)
    path = _enhancement_proposals_path(project_id)
    if not path.is_file():
        return []
    return [EnhancementProposal.model_validate(item) for item in json.loads(path.read_text(encoding="utf-8"))]


def create_enhancement_proposal(project_id: str, data: EnhancementProposalCreate) -> EnhancementProposal:
    project = read_project(project_id)
    scene = next((item for item in project.storyboard.scenes if item.id == data.targetSceneId), None)
    if scene is None:
        raise KeyError(data.targetSceneId)
    before_value = getattr(scene, data.field)
    if before_value == data.proposedValue:
        raise ValueError("The proposed value is already present on this scene")
    proposal = EnhancementProposal(
        id=f"proposal-{uuid.uuid4().hex[:12]}",
        targetSceneId=scene.id,
        field=data.field,
        beforeValue=before_value,
        proposedValue=data.proposedValue,
        rationale=data.rationale,
        origin=data.origin,
        provider=data.provider,
        model=data.model,
        createdAt=now_iso(),
    )
    proposals = list_enhancement_proposals(project_id)
    proposals.append(proposal)
    _write_enhancement_proposals(project_id, proposals)
    return proposal


def decide_enhancement_proposal(
    project_id: str,
    proposal_id: str,
    decision: Literal["accept", "reject"],
) -> tuple[EnhancementProposal, ProjectDetail | None]:
    project = read_project(project_id)
    proposals = list_enhancement_proposals(project_id)
    for index, proposal in enumerate(proposals):
        if proposal.id != proposal_id:
            continue
        if proposal.status != "pending":
            raise ValueError("Only pending enhancement proposals can be decided")

        updated_project: ProjectDetail | None = None
        status: Literal["accepted", "rejected", "stale"] = "rejected"
        if decision == "accept":
            scene = next((item for item in project.storyboard.scenes if item.id == proposal.targetSceneId), None)
            current_value = getattr(scene, proposal.field, None) if scene else None
            if scene is None or current_value != proposal.beforeValue:
                proposals[index] = proposal.model_copy(update={"status": "stale", "decidedAt": now_iso()})
                _write_enhancement_proposals(project_id, proposals)
                raise EnhancementProposalConflict("This suggestion is stale because the target scene changed")
            updated_project = update_scene(project_id, scene.id, SceneUpdate(**{proposal.field: proposal.proposedValue}))
            status = "accepted"

        decided = proposal.model_copy(update={"status": status, "decidedAt": now_iso()})
        proposals[index] = decided
        _write_enhancement_proposals(project_id, proposals)
        return decided, updated_project
    raise KeyError(proposal_id)


def add_project_asset(project_id: str, filename: str, content: bytes, kind: Literal["image", "audio"]) -> ProjectDetail:
    path = project_path(project_id)
    current = read_project(project_id)
    digest = hashlib.sha256(content).hexdigest()
    extension = Path(filename).suffix.lower()
    content_type = mimetypes.guess_type(filename)[0] or ("application/octet-stream")
    asset_id = f"{kind}-{digest}"
    safe_filename = f"{asset_id}{extension}"
    relative_path = Path("assets") / ("images" if kind == "image" else "audio") / safe_filename
    destination = path / relative_path
    destination.parent.mkdir(parents=True, exist_ok=True)
    if not destination.exists():
        temp_file = destination.with_name(f".{safe_filename}.{uuid.uuid4().hex}.tmp")
        temp_file.write_bytes(content)
        temp_file.replace(destination)
    asset = ExtractedAsset(
        id=asset_id,
        kind=kind,
        filename=Path(filename).name,
        contentType=content_type,
        sizeBytes=len(content),
        sha256=digest,
        path=relative_path.as_posix(),
    )
    assets = [existing for existing in current.storyboard.assets if existing.id != asset.id]
    assets.append(asset)
    storyboard = current.storyboard.model_copy(update={"assets": assets})
    write_storyboard(path, storyboard)
    metadata = {"id": project_id, "title": current.title, "updatedAt": now_iso()}
    (path / "project.json").write_text(json.dumps(metadata, indent=2), encoding="utf-8")
    return read_project(project_id)


def update_project_asset_attribution(project_id: str, asset_id: str, data: AssetAttributionUpdate) -> ProjectDetail:
    path = project_path(project_id)
    current = read_project(project_id)
    assets = list(current.storyboard.assets)
    for index, asset in enumerate(assets):
        if asset.id == asset_id:
            assets[index] = asset.model_copy(update=data.model_dump())
            storyboard = current.storyboard.model_copy(update={"assets": assets})
            write_storyboard(path, storyboard)
            metadata = {"id": project_id, "title": current.title, "updatedAt": now_iso()}
            (path / "project.json").write_text(json.dumps(metadata, indent=2), encoding="utf-8")
            return read_project(project_id)
    raise KeyError(asset_id)


def reorder_scenes(project_id: str, scene_ids: list[str]) -> ProjectDetail:
    path = project_path(project_id)
    current = read_project(project_id)
    existing_ids = [scene.id for scene in current.storyboard.scenes]
    if len(scene_ids) != len(existing_ids) or set(scene_ids) != set(existing_ids):
        raise ValueError("Scene order must contain every project scene exactly once")
    if scene_ids == existing_ids:
        return current
    scenes_by_id = {scene.id: scene for scene in current.storyboard.scenes}
    storyboard = current.storyboard.model_copy(update={"scenes": [scenes_by_id[scene_id] for scene_id in scene_ids]})
    write_storyboard(path, storyboard)
    metadata = {"id": project_id, "title": current.title, "updatedAt": now_iso()}
    (path / "project.json").write_text(json.dumps(metadata, indent=2), encoding="utf-8")
    return read_project(project_id)
