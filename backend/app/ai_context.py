from .models import ProjectDetail, Scene


def course_context(project: ProjectDetail) -> dict[str, object]:
    return {
        "title": project.title,
        "description": project.storyboard.description,
        "sourceRevision": project.storyboard.revision,
        "completionSettings": project.storyboard.completionSettings.model_dump(mode="json"),
        "sceneSequence": [
            {"id": scene.id, "title": scene.title, "sceneType": scene.sceneType, "required": scene.required}
            for scene in project.storyboard.scenes
        ],
    }


def scene_context(scene: Scene) -> dict[str, object]:
    context = scene.model_dump(mode="json", include={
        "id", "title", "sceneType", "actionDescription", "narration", "notes", "required",
        "audioRequired", "layoutMode", "templateId", "assessmentItem", "assessmentSettings",
        "imageAssets", "imageAltText", "decorativeImages", "audioAssets", "backgroundAsset",
    })
    context["learnerText"] = scene.extractedText
    if scene.visualLayout:
        layout = scene.visualLayout.model_dump(mode="json")
        layout["elements"] = [
            element.model_dump(mode="json", exclude={"shapeSvg"})
            for element in scene.visualLayout.elements[:24]
        ]
        context["visualLayout"] = layout
        context["omittedLayoutElements"] = max(0, len(scene.visualLayout.elements) - 24)
    else:
        context["visualLayout"] = None
    return context