from typing import Literal

from .models import ProjectDetail, ValidationIssue, ValidationReport
from .storage import project_path, read_template


def validate_project(project: ProjectDetail, target: Literal["authoring", "production"] = "authoring") -> ValidationReport:
    issues: list[ValidationIssue] = []
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

        if scene.audioRequired and not scene.audioAssets:
            issues.append(ValidationIssue(
                severity="warning",
                code="required-audio-missing",
                message="Attach at least one audio file or turn off required audio for this scene.",
                sceneId=scene.id,
                sceneTitle=scene.title,
            ))

        if scene.sceneType == "assessment" and scene.assessmentItem is None:
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