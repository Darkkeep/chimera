"""Project-pinned media, explicit placement, and local reference OCR."""
import hashlib
import json
import re
import uuid
from pathlib import Path

from . import storage
from .models import AssetMetadataUpdate, ExtractedAsset, MediaPlacement, MediaPlacementsUpdate, ProjectDetail, Scene, SceneElement, SceneLayout


def validate_captions(text: str) -> None:
    if not text.strip():
        return
    lines = text.replace("\r\n", "\n").split("\n")
    if lines[0].strip() != "WEBVTT" or (len(lines) > 1 and lines[1].strip()):
        raise ValueError("Captions must start with WEBVTT followed by a blank line")
    timing = re.compile(r"^(?:(\d{2,}):)?(\d{2}):(\d{2})\.(\d{3})$")
    cues = 0
    for line in lines:
        if "-->" not in line:
            continue
        values = line.split("-->")
        if len(values) != 2:
            raise ValueError("Invalid WebVTT cue timing")
        seconds = []
        for value in (values[0].strip(), values[1].strip().split()[0]):
            match = timing.fullmatch(value)
            if not match or int(match[2]) > 59 or int(match[3]) > 59:
                raise ValueError("Use valid WebVTT timestamps, such as 00:00:01.000")
            seconds.append(int(match[1] or 0) * 3600 + int(match[2]) * 60 + int(match[3]) + int(match[4]) / 1000)
        if seconds[1] <= seconds[0]:
            raise ValueError("Caption cues must end after they begin")
        cues += 1
    if not cues:
        raise ValueError("Captions must include at least one timed WebVTT cue")


def effective_placements(project: ProjectDetail, scene: Scene) -> list[MediaPlacement]:
    placements = {item.assetId: item for item in project.storyboard.courseMedia if item.assetId not in scene.excludedCourseMedia}
    for asset_id in [*scene.imageAssets, *scene.audioAssets, *scene.videoAssets]:
        placements[asset_id] = MediaPlacement(assetId=asset_id, order=[*scene.imageAssets, *scene.audioAssets, *scene.videoAssets].index(asset_id),
            altText=scene.imageAltText.get(asset_id, ""), decorative=asset_id in scene.decorativeImages)
    placements.update({item.assetId: item for item in scene.mediaPlacements})
    return sorted(placements.values(), key=lambda item: (item.position != "before", item.order, item.assetId))


def effective_background_asset(project: ProjectDetail, scene: Scene) -> str | None:
    layout = scene.visualLayout
    if layout and layout.backgroundMode == "none":
        return None
    if layout and layout.backgroundMode == "inherit":
        return project.storyboard.backgroundAsset
    return (layout.backgroundAsset if layout else None) or scene.backgroundAsset or project.storyboard.backgroundAsset


def validate_backgrounds(project: ProjectDetail) -> None:
    assets = {asset.id: asset for asset in project.storyboard.assets}
    background = project.storyboard.backgroundAsset
    if background is not None and (background not in assets or assets[background].kind != "image"):
        raise ValueError("Project background must reference an image asset in this project")
    for scene in project.storyboard.scenes:
        storage.validate_visual_assets(scene, assets)


def resolved_project(project: ProjectDetail, published: bool = False) -> ProjectDetail:
    """Resolve precedence once for Word/packages; never save this derived view."""
    assets = {asset.id: asset for asset in project.storyboard.assets}
    used = set()
    scenes = []
    for scene in project.storyboard.scenes:
        background = effective_background_asset(project, scene)
        layout = scene.visualLayout
        if layout:
            layout = layout.model_copy(update={"backgroundAsset": background, "backgroundMode": "image" if background else "none"})
            if background in assets and assets[background].role == "background":
                layout = layout.model_copy(update={"elements": [element for element in layout.elements if element.source != "master"]})
        elif background and (scene.layoutMode == "native" or scene.assessmentItem):
            layout = SceneLayout(enabled=True, backgroundAsset=background, backgroundMode="image", elements=[
                SceneElement(id=f"background-text-{index}", kind="text", x=60, y=40 + index * 110,
                    width=1160, height=100, text=text, fontSize=28 if index else 40)
                for index, text in enumerate([scene.title, *scene.extractedText]) if text
            ])
        if layout and background and scene.layoutMode == "native":
            layout = layout.model_copy(update={"enabled": True})
        placements = effective_placements(project, scene)
        for placement in placements:
            if placement.assetId not in assets:
                raise ValueError("Media placement references an unavailable project asset")
        by_kind = {kind: [p.assetId for p in placements if assets[p.assetId].kind == kind] for kind in ("image", "audio", "video")}
        used.update(p.assetId for p in placements)
        if background:
            used.add(background)
        if layout:
            used.update(e.assetId for e in layout.elements if e.assetId)
        scenes.append(scene.model_copy(update={"imageAssets": by_kind["image"], "audioAssets": by_kind["audio"], "videoAssets": by_kind["video"],
            "visualLayout": layout, "backgroundAsset": background,
            "mediaPlacements": placements, "imageAltText": {p.assetId: p.altText for p in placements if p.altText},
            "decorativeImages": [p.assetId for p in placements if p.decorative]}))
    storyboard = project.storyboard.model_copy(update={"scenes": scenes,
        "backgroundAsset": project.storyboard.backgroundAsset if not published or project.storyboard.backgroundAsset in used else None,
        "assets": [asset for asset in assets.values() if not published or asset.id in used]})
    return project.model_copy(update={"storyboard": storyboard})


def validate_placements(project: ProjectDetail) -> None:
    validate_backgrounds(project)
    assets = {asset.id: asset for asset in project.storyboard.assets}
    scopes = [project.storyboard.courseMedia, *(s.mediaPlacements for s in project.storyboard.scenes)]
    for placements in scopes:
        if len({p.assetId for p in placements}) != len(placements):
            raise ValueError("Each asset can be placed only once per scope")
        if any(p.assetId not in assets for p in placements):
            raise ValueError("Media placements must reference assets in this project")
    course_ids = {p.assetId for p in project.storyboard.courseMedia}
    for scene in project.storyboard.scenes:
        if set(scene.excludedCourseMedia) - course_ids:
            raise ValueError("Scene exclusions must refer to course-wide media")
        for kind, ids in (("image", scene.imageAssets), ("audio", scene.audioAssets), ("video", scene.videoAssets)):
            if any(asset_id not in assets or assets[asset_id].kind != kind for asset_id in ids):
                raise ValueError(f"{kind.title()} scene references must point to {kind} assets in this project")
        if scene.audioRequired and any(p.loop and assets[p.assetId].kind == "audio" for p in effective_placements(project, scene)):
            raise ValueError("Required audio cannot loop; learners must be able to reach its end")
        if any(p.requiredViewing and assets[p.assetId].kind != "video" for p in effective_placements(project, scene)):
            raise ValueError("Required viewing can only be configured for video")
        if any(p.requiredViewing and p.loop for p in effective_placements(project, scene)):
            raise ValueError("Required videos cannot loop")


def write_placements(project_id: str, data: MediaPlacementsUpdate, revision: int, scene_id: str | None = None) -> ProjectDetail:
    with storage.storyboard_transaction():
        project = storage.read_project(project_id)
        storyboard = project.storyboard.model_copy(deep=True)
        if scene_id:
            scene = next((s for s in storyboard.scenes if s.id == scene_id), None)
            if scene is None:
                raise FileNotFoundError("Scene not found")
            scene.mediaPlacements = data.placements
            scene.excludedCourseMedia = data.excludedAssetIds
            by_id = {asset.id: asset for asset in storyboard.assets}
            for kind, field in (("image", "imageAssets"), ("audio", "audioAssets"), ("video", "videoAssets")):
                setattr(scene, field, [p.assetId for p in data.placements if p.assetId in by_id and by_id[p.assetId].kind == kind])
            scene.imageAltText = {p.assetId: p.altText for p in data.placements if p.altText and p.assetId in scene.imageAssets}
            scene.decorativeImages = [p.assetId for p in data.placements if p.decorative and p.assetId in scene.imageAssets]
        else:
            if data.excludedAssetIds:
                raise ValueError("Exclusions belong to a scene, not the course")
            storyboard.courseMedia = data.placements
            course_ids = {p.assetId for p in data.placements}
            for scene in storyboard.scenes:
                scene.excludedCourseMedia = [asset_id for asset_id in scene.excludedCourseMedia if asset_id in course_ids]
        validate_placements(project.model_copy(update={"storyboard": storyboard}))
        storage.write_storyboard(storage.project_path(project_id), storyboard, revision)
        return storage.read_project(project_id)


def update_metadata(project_id: str, asset_id: str, data: AssetMetadataUpdate, revision: int) -> ProjectDetail:
    validate_captions(data.captionsVtt)
    with storage.storyboard_transaction():
        project = storage.read_project(project_id)
        asset = next((a for a in project.storyboard.assets if a.id == asset_id), None)
        if asset is None:
            raise FileNotFoundError("Media not found")
        if asset.kind == "image" and (data.transcript or data.captionsVtt):
            raise ValueError("Transcripts and captions belong to audio or video")
        assets = [a.model_copy(update=data.model_dump()) if a.id == asset_id else a for a in project.storyboard.assets]
        storage.write_storyboard(storage.project_path(project_id), project.storyboard.model_copy(update={"assets": assets}), revision)
        return storage.read_project(project_id)


def asset_usage(project: ProjectDetail, asset_id: str) -> dict:
    return {"courseWide": project.storyboard.backgroundAsset == asset_id or any(p.assetId == asset_id for p in project.storyboard.courseMedia),
            "scenes": [{"id": s.id, "title": s.title} for s in project.storyboard.scenes
                if asset_id in {p.assetId for p in effective_placements(project, s)} or effective_background_asset(project, s) == asset_id or s.backgroundAsset == asset_id
                or s.visualLayout and (s.visualLayout.backgroundAsset == asset_id or any(e.assetId == asset_id for e in s.visualLayout.elements))]}


def delete_asset(project_id: str, asset_id: str, revision: int) -> ProjectDetail:
    with storage.storyboard_transaction():
        project = storage.read_project(project_id)
        asset = next((a for a in project.storyboard.assets if a.id == asset_id), None)
        if asset is None:
            raise FileNotFoundError("Media not found")
        usage = asset_usage(project, asset_id)
        explicit_use = any(asset_id in {*s.imageAssets, *s.audioAssets, *s.videoAssets, *(p.assetId for p in s.mediaPlacements)} for s in project.storyboard.scenes)
        if usage["courseWide"] or usage["scenes"] or explicit_use:
            raise ValueError("Remove this media's scene and course-wide placements before deleting it")
        storage.write_storyboard(storage.project_path(project_id), project.storyboard.model_copy(update={
            "assets": [a for a in project.storyboard.assets if a.id != asset_id]}), revision)
        # Retain immutable bytes for history, old proposals and pinned reviews.
        return storage.read_project(project_id)


def shared_root() -> Path:
    return storage.ROOT / "shared-media"


def shared_record(shared_id: str) -> tuple[Path, dict]:
    if not re.fullmatch(r"shared-[a-f0-9]{32}", shared_id):
        raise FileNotFoundError("Shared media not found")
    path = shared_root() / shared_id
    if not (path / "record.json").is_file():
        raise FileNotFoundError("Shared media not found")
    return path, json.loads((path / "record.json").read_text(encoding="utf-8"))


def list_shared() -> list[dict]:
    with storage.storyboard_transaction():
        return [shared_record(p.parent.name)[1] for p in sorted(shared_root().glob("shared-*/record.json"))]


def publish_shared(project_id: str, asset_id: str) -> dict:
    with storage.storyboard_transaction():
        project = storage.read_project(project_id)
        asset = next((a for a in project.storyboard.assets if a.id == asset_id), None)
        if asset is None:
            raise FileNotFoundError("Media not found")
        content = _asset_bytes(project_id, asset)
        shared_id = f"shared-{uuid.uuid4().hex}"
        path = shared_root() / shared_id
        path.mkdir(parents=True)
        from .platform import get_actor_context
        actor = get_actor_context()
        record = {"id": shared_id, "createdAt": storage.now_iso(), "createdBy": actor.actorId,
                  "installationId": actor.installationId, "sourceRevision": project.storyboard.revision,
                  "asset": asset.model_dump(mode="json")}
        (path / "content").write_bytes(content)
        (path / "record.json").write_text(json.dumps(record, indent=2), encoding="utf-8")
        return record


def _asset_bytes(project_id: str, asset: ExtractedAsset) -> bytes:
    root = (storage.project_path(project_id) / "assets").resolve()
    source = (storage.project_path(project_id) / asset.path).resolve()
    if not source.is_relative_to(root) or not source.is_file():
        raise ValueError("Media file is unavailable")
    content = source.read_bytes()
    if hashlib.sha256(content).hexdigest() != asset.sha256:
        raise ValueError("Media checksum does not match its record")
    return content


def copy_shared(project_id: str, shared_id: str, revision: int) -> ProjectDetail:
    with storage.storyboard_transaction():
        path, record = shared_record(shared_id)
        source = ExtractedAsset.model_validate(record["asset"])
        content = (path / "content").read_bytes()
        if hashlib.sha256(content).hexdigest() != source.sha256:
            raise ValueError("Shared media checksum verification failed")
        project = storage.read_project(project_id)
        if project.storyboard.revision != revision:
            raise storage.StoryboardRevisionConflict(revision, project.storyboard.revision)
        existing = next((a for a in project.storyboard.assets if a.sha256 == source.sha256 and a.kind == source.kind), None)
        if existing:
            return project  # Never replace a project's existing metadata implicitly.
        metadata = source.model_dump(include={"transcript", "captionsVtt", "language", "attributionText", "attributionStatus", "role"})
        metadata["sharedSourceId"] = shared_id
        return storage.add_project_asset(project_id, source.filename, content, source.kind, revision, source_metadata=metadata)
