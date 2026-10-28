"""Prepare old projects for one authored composition, without rewriting sources."""
import tempfile
from contextlib import contextmanager
from pathlib import Path

from .models import ProjectDetail, Scene, SceneElement, SceneLayout


def native_layout(scene: Scene) -> SceneLayout:
    lines = [text for text in [scene.title, *scene.extractedText] if text.strip()]
    return SceneLayout(enabled=True, backgroundMode="inherit", height=min(10000, max(720, 170 + len(lines) * 96)), elements=[
        SceneElement(id=f"native-text-{index}", kind="text", source="manual", text=text,
            x=72, y=80 + index * 96, width=1136, height=80, fontSize=40 if index == 0 else 28, fontFamily="Aptos")
        for index, text in enumerate(lines)
    ])


def preserve_scene_text(layout: SceneLayout, scene: Scene, original: Scene) -> None:
    text = [scene.title, *scene.extractedText]
    if text == [original.title, *original.extractedText]:
        return
    elements = [element for element in layout.elements if element.kind == "text" and element.source == "slide"]
    if len(elements) == len(text):
        for element, value in zip(elements, text):
            element.text = value
    else:
        layout.elements = [element for element in layout.elements if element not in elements]
        layout.elements.append(SceneElement(id="preserved-text", kind="text", x=40, y=40,
            width=layout.width - 80, height=max(40, layout.height - 80), text="\n".join(text)))
        layout.warnings.append("Existing text edits were preserved in a combined text box. Check their placement.")


def apply_template_text(layout: SceneLayout, scene: Scene) -> None:
    slots = [element for element in layout.elements if element.kind == "text" and element.source == "slide"]
    text = [scene.title, *scene.extractedText]
    for index, element in enumerate(slots):
        if index < len(text):
            element.text = text[index]
        else:
            layout.elements.remove(element)
    for index, value in enumerate(text[len(slots):], start=len(slots)):
        layout.elements.append(SceneElement(id=f"template-text-{index}", kind="text", source="manual",
            text=value, x=64, y=64 + index * 96, width=layout.width - 128, height=80,
            fontSize=38 if index == 0 else 26, fontFamily="Aptos"))


def preserve_background_override(layout: SceneLayout, scene: Scene) -> None:
    previous = scene.visualLayout
    if previous and previous.backgroundMode in {"image", "none"}:
        layout.backgroundMode = previous.backgroundMode
        layout.backgroundAsset = previous.backgroundAsset
    elif scene.backgroundAsset:
        layout.backgroundAsset = scene.backgroundAsset
        layout.backgroundMode = "image"


@contextmanager
def prepared_project(project: ProjectDetail, root: Path):
    """Yield a candidate and staged assets. Caller owns the revision-checked commit."""
    missing = [scene for scene in project.storyboard.scenes if scene.visualLayout is None]
    if not missing:
        yield project, root, []
        return
    from .ingest import extract_presentation
    with tempfile.TemporaryDirectory(prefix=".authoring-", dir=root) as directory:
        staging = Path(directory)
        originals, assets = [], []
        imported = [scene for scene in missing if (scene.sourceSlide is not None or scene.previewImage) and not scene.templateId]
        if imported:
            source = root / "original" / "source-deck.pptx"
            if not source.is_file():
                raise ValueError("The retained PowerPoint source is unavailable. Existing slides are preserved; restore the source to prepare their editable layouts.")
            originals, assets = extract_presentation(source, staging)
        by_slide = {scene.sourceSlide: scene for scene in originals}
        templates = {}
        replacements, needed = {}, set()
        for scene in missing:
            if scene.templateId:
                from .storage import read_template, template_path
                if scene.templateId not in templates:
                    record = read_template(scene.templateId)
                    template_scenes, template_assets = extract_presentation(template_path(record.id) / "template.pptx", staging)
                    if not template_scenes or template_scenes[0].visualLayout is None:
                        raise ValueError("The retained template has no usable slide. Existing scenes are preserved.")
                    templates[scene.templateId] = template_scenes[0].visualLayout
                    assets.extend(template_assets)
                layout = templates[scene.templateId].model_copy(deep=True)
                apply_template_text(layout, scene)
            elif scene.sourceSlide is not None or scene.previewImage:
                original = by_slide.get(scene.sourceSlide)
                if original is None or original.visualLayout is None:
                    raise ValueError(f"Source layout is unavailable for scene '{scene.title}'. No scene changes were saved.")
                layout = original.visualLayout.model_copy(deep=True)
                preserve_scene_text(layout, scene, original)
            else:
                layout = native_layout(scene)
            # A pre-existing explicit scene image remains an exception.
            preserve_background_override(layout, scene)
            layout.enabled = True
            needed.update(element.assetId for element in layout.elements if element.assetId)
            needed.update(value for value in [layout.backgroundAsset, layout.sourceBackgroundAsset] if value)
            replacements[scene.id] = scene.model_copy(update={"visualLayout": layout})
        imported_assets = [asset for asset in assets if asset.id in needed]
        merged = {asset.id: asset for asset in imported_assets}
        merged.update({asset.id: asset for asset in project.storyboard.assets})
        storyboard = project.storyboard.model_copy(update={
            "scenes": [replacements.get(scene.id, scene) for scene in project.storyboard.scenes],
            "assets": list(merged.values()),
        })
        yield project.model_copy(update={"storyboard": storyboard}), staging, imported_assets
