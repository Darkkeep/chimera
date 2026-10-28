from typing import Literal

from .models import ProjectDetail, ValidationIssue, ValidationReport
from .storage import project_path, read_template


def _layout_review_warnings(scene) -> list[str]:
    """Advisory geometry/flat-background checks, not browser font measurement."""
    layout = scene.visualLayout
    if not layout or not layout.enabled:
        return []
    warnings = []
    texts = [e for e in layout.elements if e.kind == "text" and e.text.strip()]
    if any(e.x < 0 or e.y < 0 or e.x + e.width > layout.width or e.y + e.height > layout.height for e in layout.elements):
        warnings.append("Some visual elements extend outside the canvas.")
    sample = texts[:200]
    if any(a.x < b.x + b.width and a.x + a.width > b.x and a.y < b.y + b.height and a.y + a.height > b.y
           for index, a in enumerate(sample) for b in sample[index + 1:]):
        warnings.append("Text boxes overlap; inspect the Stage for obscured content.")
    if not layout.backgroundAsset:
        def luminance(color):
            values = [int(color[index:index + 2], 16) / 255 for index in (1, 3, 5)]
            values = [value / 12.92 if value <= 0.04045 else ((value + 0.055) / 1.055) ** 2.4 for value in values]
            return sum(value * weight for value, weight in zip(values, (0.2126, 0.7152, 0.0722)))
        background = luminance(layout.backgroundColor)
        if any((max(luminance(e.color), background) + 0.05) / (min(luminance(e.color), background) + 0.05) < (3 if e.fontSize >= 24 or e.bold and e.fontSize >= 18.67 else 4.5) for e in sample):
            warnings.append("Some text has low contrast against the canvas background; check any artwork behind it.")
    if len(texts) > len(sample):
        warnings.append("This dense layout needs manual review beyond the first 200 text elements.")
    return warnings


def validate_project(project: ProjectDetail, target: Literal["authoring", "production"] = "authoring") -> ValidationReport:
    from .media import resolved_project, validate_backgrounds, validate_captions, validate_placements
    issues: list[ValidationIssue] = []
    try:
        validate_backgrounds(project)
    except ValueError as error:
        issues.append(ValidationIssue(severity="error", code="invalid-background-reference", message=str(error)))
    try:
        validate_placements(project)
        project = resolved_project(project)
    except ValueError as error:
        if project.storyboard.courseMedia or any(s.mediaPlacements or s.excludedCourseMedia for s in project.storyboard.scenes):
            issues.append(ValidationIssue(severity="error", code="invalid-media-placement", message=str(error)))
    scenes = project.storyboard.scenes
    assets = project.storyboard.assets
    asset_by_id = {asset.id: asset for asset in assets}

    if not scenes:
        issues.append(ValidationIssue(severity="error", code="no-scenes", message="Add at least one scene to the storyboard."))

    if len({scene.id for scene in scenes}) != len(scenes):
        issues.append(ValidationIssue(severity="error", code="duplicate-scene-id", message="Scene identifiers must be unique."))
    if len(asset_by_id) != len(assets):
        issues.append(ValidationIssue(severity="error", code="duplicate-asset-id", message="Asset identifiers must be unique."))

    project_root = project_path(project.id).resolve()
    assets_root = (project_root / "assets").resolve()
    for scene in scenes:
        if scene.visualLayout and scene.visualLayout.timeline:
            for clip in scene.visualLayout.timeline.clips:
                asset = asset_by_id.get(clip.assetId)
                if not asset or asset.kind != clip.kind:
                    issues.append(ValidationIssue(severity="error", code="invalid-timeline-media", message="Timeline clip references missing or incompatible media.", sceneId=scene.id, sceneTitle=scene.title))
        for warning in _layout_review_warnings(scene):
            issues.append(ValidationIssue(severity="warning", code="visual-layout-review", message=warning, sceneId=scene.id, sceneTitle=scene.title))
        if not scene.title.strip():
            issues.append(ValidationIssue(
                severity="warning",
                code="missing-scene-title",
                message="Add a title for this scene.",
                sceneId=scene.id,
                sceneTitle=scene.title,
            ))

        if scene.layoutMode == "template":
            try:
                if not scene.templateId:
                    raise FileNotFoundError
                read_template(scene.templateId)
            except FileNotFoundError:
                issues.append(ValidationIssue(
                    severity="error",
                    code="unresolved-template",
                    message="Choose an available template for this scene.",
                    sceneId=scene.id,
                    sceneTitle=scene.title,
                ))

        if scene.audioRequired and not scene.audioAssets and not (scene.visualLayout and scene.visualLayout.timeline and any(c.kind == "audio" for c in scene.visualLayout.timeline.clips)):
            issues.append(ValidationIssue(
                severity="warning",
                code="required-audio-missing",
                message="Attach at least one audio file or turn off required audio for this scene.",
                sceneId=scene.id,
                sceneTitle=scene.title,
            ))

        if scene.sceneType == "question" and scene.assessmentItem is None:
            issues.append(ValidationIssue(
                severity="warning",
                code="missing-assessment-item",
                message="Add a question to this assessment scene.",
                sceneId=scene.id,
                sceneTitle=scene.title,
            ))

        remediation_id = scene.assessmentSettings.remediationSceneId if scene.assessmentSettings else None
        if remediation_id and remediation_id not in {candidate.id for candidate in scenes}:
            issues.append(ValidationIssue(
                severity="error",
                code="invalid-remediation-scene",
                message="Choose an available scene for assessment remediation.",
                sceneId=scene.id,
                sceneTitle=scene.title,
            ))
        elif remediation_id == scene.id:
            issues.append(ValidationIssue(
                severity="error",
                code="invalid-remediation-scene",
                message="An assessment cannot remediate to its own scene.",
                sceneId=scene.id,
                sceneTitle=scene.title,
            ))

        invalid_assets: list[str] = []
        for asset_id in scene.imageAssets:
            asset = asset_by_id.get(asset_id)
            if asset is None or asset.kind != "image":
                invalid_assets.append(asset_id)
        for asset_id in scene.audioAssets:
            asset = asset_by_id.get(asset_id)
            if asset is None or asset.kind != "audio":
                invalid_assets.append(asset_id)
        for asset_id in scene.videoAssets:
            asset = asset_by_id.get(asset_id)
            if asset is None or asset.kind != "video":
                invalid_assets.append(asset_id)
        if invalid_assets:
            issues.append(ValidationIssue(
                severity="error",
                code="invalid-asset-reference",
                message=f"Remove or reattach unavailable media ({', '.join(invalid_assets)}).",
                sceneId=scene.id,
                sceneTitle=scene.title,
            ))

        for asset_id in scene.imageAssets:
            asset = asset_by_id.get(asset_id)
            if asset is not None and asset.kind == "image" and asset_id not in scene.decorativeImages and not scene.imageAltText.get(asset_id, "").strip():
                issues.append(ValidationIssue(
                    severity="warning",
                    code="missing-image-alt-text",
                    message=f"Add a description for {asset.filename}, or mark it decorative.",
                    sceneId=scene.id,
                    sceneTitle=scene.title,
                ))

    for asset in assets:
        try:
            validate_captions(asset.captionsVtt)
        except ValueError as error:
            issues.append(ValidationIssue(severity="error", code="invalid-captions", message=f"{asset.filename}: {error}"))
        if target == "production" and asset.kind == "video" and (not asset.captionsVtt.strip() or not asset.transcript.strip()):
            issues.append(ValidationIssue(severity="error", code="video-accessibility", message=f"Add timed captions and a transcript for {asset.filename} before publishing."))
        asset_path = (project_root / asset.path).resolve()
        if not asset_path.is_relative_to(assets_root) or not asset_path.is_file():
            issues.append(ValidationIssue(
                severity="error",
                code="missing-asset-file",
                message=f"Restore or remove the missing asset: {asset.filename}.",
            ))
        if target == "production" and (asset.attributionStatus != "complete" or not asset.attributionText.strip()):
            is_image = asset.kind == "image"
            issues.append(ValidationIssue(
                severity="warning" if is_image else "error",
                code="missing-media-attribution",
                message=f"Attribution Pending for {asset.filename}. Complete and verify the credit before release." if is_image else f"Complete attribution for {asset.filename} before production release.",
                sceneTitle=asset.filename,
            ))

    return ValidationReport(
        projectId=project.id,
        passed=not any(issue.severity == "error" for issue in issues),
        issues=issues,
    )
