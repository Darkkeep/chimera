import io
from pathlib import Path

from docx import Document
from docx.document import Document as DocumentType
from docx.shared import Inches
from PIL import Image, UnidentifiedImageError

from .models import AssessmentItem, ProjectDetail, Scene
from .storage import project_path


DOCX_MEDIA_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"


def _clean_xml_value(value: object) -> object:
    if isinstance(value, str):
        return "".join(
            character
            for character in value
            if character in "\t\n\r" or 0x20 <= ord(character) <= 0xD7FF or 0xE000 <= ord(character) <= 0xFFFD or 0x10000 <= ord(character) <= 0x10FFFF
        )
    if isinstance(value, list):
        return [_clean_xml_value(item) for item in value]
    if isinstance(value, dict):
        return {_clean_xml_value(key): _clean_xml_value(item) for key, item in value.items()}
    return value


def _asset_path(project: ProjectDetail, relative_path: str, folder: str) -> Path | None:
    project_root = project_path(project.id).resolve()
    allowed_root = (project_root / folder).resolve()
    candidate = (project_root / relative_path).resolve()
    if candidate.is_relative_to(allowed_root) and candidate.is_file():
        return candidate
    return None


def _add_image(document: DocumentType, path: Path, label: str) -> bool:
    try:
        with Image.open(path) as source:
            image_buffer = io.BytesIO()
            source.convert("RGB").save(image_buffer, format="PNG")
        image_buffer.seek(0)
        document.add_paragraph(label, style="Caption")
        document.add_picture(image_buffer, width=Inches(5.8))
        return True
    except (OSError, UnidentifiedImageError, ValueError):
        return False


def _assessment_choices(item: AssessmentItem) -> list[tuple[str, str]]:
    if item.type in {"single-choice", "multiple-response", "ordering"}:
        return [(choice.identifier, choice.text) for choice in item.choices]
    if item.type == "true-false":
        return [("true", "True"), ("false", "False")]
    if item.type == "drag-drop":
        return [(choice.identifier, f"Item: {choice.text}") for choice in item.draggables] + [
            (choice.identifier, f"Target: {choice.text}") for choice in item.targets
        ]
    if item.type == "matching":
        return [(choice.identifier, f"Left: {choice.text}") for choice in item.leftItems] + [
            (choice.identifier, f"Right: {choice.text}") for choice in item.rightItems
        ]
    return []


def _answer_key(item: AssessmentItem) -> str:
    choices = dict(_assessment_choices(item))
    if item.type in {"single-choice", "true-false"}:
        return choices.get(item.correctResponse, item.correctResponse)
    if item.type == "multiple-response":
        return "; ".join(choices.get(identifier, identifier) for identifier in item.correctResponses)
    if item.type == "ordering":
        return " -> ".join(choices.get(identifier, identifier) for identifier in item.correctOrder)
    if item.type in {"drag-drop", "matching"}:
        return "; ".join(
            f"{choices.get(pair.sourceIdentifier, pair.sourceIdentifier)} -> {choices.get(pair.targetIdentifier, pair.targetIdentifier)}"
            for pair in item.correctMatches
        )
    if item.type == "short-answer":
        return "; ".join(item.acceptedAnswers)
    return ""


def _add_assessment(document: DocumentType, scene: Scene, include_answer_key: bool) -> None:
    item = scene.assessmentItem
    if item is None:
        return
    document.add_heading("Assessment specification", level=2)
    document.add_paragraph(f"Interaction: {item.type.replace('-', ' ').title()}")
    document.add_paragraph(f"Identifier: {item.identifier}")
    document.add_paragraph(f"Prompt: {item.prompt}")
    choices = _assessment_choices(item)
    if choices:
        table = document.add_table(rows=1, cols=2)
        table.style = "Light Shading Accent 1"
        table.rows[0].cells[0].text = "Identifier"
        table.rows[0].cells[1].text = "Response / interaction element"
        for identifier, text in choices:
            cells = table.add_row().cells
            cells[0].text = identifier
            cells[1].text = text
    elif item.type == "short-answer":
        document.add_paragraph("Accepted response: learner enters a short text answer.")

    if item.type == "ordering":
        document.add_paragraph("Expected interaction: order the listed elements.")
    elif item.type in {"drag-drop", "matching"}:
        document.add_paragraph("Expected interaction: match each source element with a target.")
    elif item.type == "multiple-response":
        document.add_paragraph("Expected interaction: select every applicable response.")
    elif item.type in {"single-choice", "true-false"}:
        document.add_paragraph("Expected interaction: select one response.")

    document.add_paragraph(f"Correct feedback: {item.correctFeedback}")
    document.add_paragraph(f"Incorrect feedback: {item.incorrectFeedback}")
    if scene.assessmentSettings:
        settings = scene.assessmentSettings
        document.add_paragraph(
            f"Scoring: {settings.maxAttempts} attempts; {settings.passingScore}% question threshold; "
            f"weight {settings.scoreWeight:g}."
        )
    if include_answer_key:
        paragraph = document.add_paragraph()
        paragraph.add_run("Answer key (authoring material): ").bold = True
        paragraph.add_run(_answer_key(item))


def _add_scene(document: DocumentType, project: ProjectDetail, scene: Scene, index: int, include_answer_key: bool) -> None:
    document.add_page_break()
    document.add_heading(f"Scene {index}: {scene.title or 'Untitled scene'}", level=1)
    metadata = document.add_table(rows=0, cols=2)
    metadata.style = "Light Shading Accent 1"
    metadata_rows = [
        ("Scene ID", scene.id),
        ("Type", scene.sceneType),
        ("Required", "Yes" if scene.required else "No (optional)"),
        ("Layout", scene.layoutMode),
    ]
    if scene.sourceSlide is not None:
        metadata_rows.append(("Source slide", str(scene.sourceSlide)))
    if scene.templateId:
        metadata_rows.append(("Template ID", scene.templateId))
    for label, value in metadata_rows:
        cells = metadata.add_row().cells
        cells[0].text = label
        cells[1].text = value

    document.add_heading("Learner-facing content", level=2)
    if scene.extractedText:
        for text in scene.extractedText:
            document.add_paragraph(text)
    else:
        document.add_paragraph("No learner-facing text recorded.")

    if scene.previewImage:
        preview = _asset_path(project, scene.previewImage, "renders")
        if preview is None or not _add_image(document, preview, "Imported slide preview"):
            document.add_paragraph(f"Slide preview reference: {scene.previewImage}")

    assets_by_id = {asset.id: asset for asset in project.storyboard.assets}
    attached_images = [assets_by_id[asset_id] for asset_id in scene.imageAssets if asset_id in assets_by_id]
    attached_audio = [assets_by_id[asset_id] for asset_id in scene.audioAssets if asset_id in assets_by_id]
    if attached_images or attached_audio:
        document.add_heading("Media", level=2)
        media_table = document.add_table(rows=1, cols=4)
        media_table.style = "Light Shading Accent 1"
        media_table.rows[0].cells[0].text = "Role"
        media_table.rows[0].cells[1].text = "File / reference"
        media_table.rows[0].cells[2].text = "Accessibility / attribution"
        media_table.rows[0].cells[3].text = "Credit"
        for asset in attached_images:
            cells = media_table.add_row().cells
            cells[0].text = "Image"
            cells[1].text = f"{asset.filename} ({asset.id})"
            alt_text = scene.imageAltText.get(asset.id, "")
            cells[2].text = "Decorative image" if asset.id in scene.decorativeImages else alt_text or "Alternative text not recorded"
            cells[3].text = f"{asset.attributionText} ({asset.attributionStatus})" if asset.attributionText else asset.attributionStatus
            image_path = _asset_path(project, asset.path, "assets")
            if image_path is not None:
                _add_image(document, image_path, f"Image: {asset.filename}")
        for asset in attached_audio:
            cells = media_table.add_row().cells
            cells[0].text = "Audio"
            cells[1].text = f"{asset.filename} ({asset.id})"
            cells[2].text = "Required for completion" if scene.audioRequired else "Optional playback"
            cells[3].text = f"{asset.attributionText} ({asset.attributionStatus})" if asset.attributionText else asset.attributionStatus

    if scene.actionDescription:
        document.add_heading("Production directions (authoring material)", level=2)
        document.add_paragraph(scene.actionDescription)
    if scene.notes:
        document.add_heading("Speaker notes (authoring material)", level=2)
        document.add_paragraph(scene.notes)
    _add_assessment(document, scene, include_answer_key)


def build_storyboard_docx(project: ProjectDetail, include_answer_key: bool = False) -> bytes:
    project = ProjectDetail.model_validate(_clean_xml_value(project.model_dump(mode="python")))
    document = Document()
    document.core_properties.title = f"{project.title} - Storyboard"
    document.core_properties.subject = f"Editable Chimera storyboard revision {project.storyboard.revision}"
    document.add_heading(project.title, level=0)
    document.add_paragraph(f"Storyboard revision: {project.storyboard.revision}")
    document.add_paragraph(f"Scenes: {len(project.storyboard.scenes)}")
    if project.storyboard.description:
        document.add_paragraph(project.storyboard.description)
    if include_answer_key:
        notice = document.add_paragraph()
        notice.add_run("Contains answer keys for authoring use only.").bold = True
    for index, scene in enumerate(project.storyboard.scenes, start=1):
        _add_scene(document, project, scene, index, include_answer_key)

    output = io.BytesIO()
    document.save(output)
    return output.getvalue()