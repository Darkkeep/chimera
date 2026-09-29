import io
import tempfile
from pathlib import Path
from typing import Literal

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image, UnidentifiedImageError
from pptx import Presentation

from .ingest import extract_presentation
from .models import AssetAttributionUpdate, CourseCompletionSettings, EnhancementProposal, EnhancementProposalCreate, EnhancementProposalDecision, EnhancementProposalResult, ExportSettings, ProjectCreate, ProjectDetail, ProjectSummary, SceneCreate, SceneOrder, SceneUpdate, Storyboard, TemplateRecord, TemplateUpdate, ValidationReport
from .render import render_slides
from .qti import assessment_item_xml, assessment_test_package
from .scorm import persist_scorm_12_build, persist_scorm_build, read_scorm_report
from .storage import EnhancementProposalConflict, add_project_asset, create_enhancement_proposal, create_project, create_scene, create_template, decide_enhancement_proposal, list_enhancement_proposals, list_projects, list_templates, project_path, read_project, persist_imported_assets, persist_slide_previews, reorder_scenes, replace_storyboard, replace_template_source, slugify, update_from_import, update_project_asset_attribution, update_project_completion_settings, update_project_export_settings, update_scene, update_template
from .validation import validate_project


app = FastAPI(title="Chimera API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
MAX_TEMPLATE_BYTES = 50 * 1024 * 1024
MAX_MEDIA_BYTES = 100 * 1024 * 1024
IMAGE_UPLOAD_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".webp"}
AUDIO_UPLOAD_EXTENSIONS = {".mp3", ".m4a", ".aac", ".wav", ".ogg"}


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/projects", response_model=list[ProjectSummary])
def get_projects() -> list[ProjectSummary]:
    return list_projects()


@app.get("/api/templates", response_model=list[TemplateRecord])
def get_templates() -> list[TemplateRecord]:
    return list_templates()


@app.post("/api/templates", response_model=TemplateRecord, status_code=201)
async def post_template(
    file: UploadFile = File(...),
    title: str | None = Form(default=None),
    description: str = Form(default=""),
) -> TemplateRecord:
    if not file.filename or not file.filename.lower().endswith(".pptx"):
        raise HTTPException(status_code=400, detail="Templates must be PowerPoint .pptx files")
    content = await file.read(MAX_TEMPLATE_BYTES + 1)
    if len(content) > MAX_TEMPLATE_BYTES:
        raise HTTPException(status_code=413, detail="Template files must be 50 MB or smaller")
    try:
        Presentation(io.BytesIO(content))
    except Exception as error:
        raise HTTPException(status_code=422, detail="Could not read PowerPoint template") from error
    template_title = (title or Path(file.filename).stem).strip()
    if not template_title or len(template_title) > 120:
        raise HTTPException(status_code=422, detail="Template title must be between 1 and 120 characters")
    if len(description) > 1000:
        raise HTTPException(status_code=422, detail="Template description must be 1000 characters or fewer")
    return create_template(template_title, description, Path(file.filename).name, content)


@app.patch("/api/templates/{template_id}", response_model=TemplateRecord)
def patch_template(template_id: str, data: TemplateUpdate) -> TemplateRecord:
    try:
        return update_template(template_id, data)
    except FileNotFoundError as error:
        raise HTTPException(status_code=404, detail="Template not found") from error


@app.put("/api/templates/{template_id}/source", response_model=TemplateRecord)
async def put_template_source(template_id: str, file: UploadFile = File(...)) -> TemplateRecord:
    if not file.filename or not file.filename.lower().endswith(".pptx"):
        raise HTTPException(status_code=400, detail="Templates must be PowerPoint .pptx files")
    content = await file.read(MAX_TEMPLATE_BYTES + 1)
    if len(content) > MAX_TEMPLATE_BYTES:
        raise HTTPException(status_code=413, detail="Template files must be 50 MB or smaller")
    try:
        Presentation(io.BytesIO(content))
        return replace_template_source(template_id, Path(file.filename).name, content)
    except FileNotFoundError as error:
        raise HTTPException(status_code=404, detail="Template not found") from error
    except Exception as error:
        raise HTTPException(status_code=422, detail="Could not read PowerPoint template") from error


@app.post("/api/projects", response_model=ProjectDetail, status_code=201)
def post_project(data: ProjectCreate) -> ProjectDetail:
    return create_project(data)


@app.get("/api/projects/{project_id}", response_model=ProjectDetail)
def get_project(project_id: str) -> ProjectDetail:
    try:
        return read_project(project_id)
    except FileNotFoundError as error:
        raise HTTPException(status_code=404, detail="Project not found") from error


@app.get("/api/projects/{project_id}/validation", response_model=ValidationReport)
def get_project_validation(project_id: str, target: Literal["authoring", "production"] = "authoring") -> ValidationReport:
    try:
        return validate_project(read_project(project_id), target=target)
    except FileNotFoundError as error:
        raise HTTPException(status_code=404, detail="Project not found") from error


@app.patch("/api/projects/{project_id}/assets/{asset_id}/attribution", response_model=ProjectDetail)
def patch_project_asset_attribution(project_id: str, asset_id: str, data: AssetAttributionUpdate) -> ProjectDetail:
    try:
        return update_project_asset_attribution(project_id, asset_id, data)
    except FileNotFoundError as error:
        raise HTTPException(status_code=404, detail="Project not found") from error
    except KeyError as error:
        raise HTTPException(status_code=404, detail="Asset not found") from error


@app.patch("/api/projects/{project_id}/completion-settings", response_model=ProjectDetail)
def patch_project_completion_settings(project_id: str, settings: CourseCompletionSettings) -> ProjectDetail:
    try:
        return update_project_completion_settings(project_id, settings)
    except FileNotFoundError as error:
        raise HTTPException(status_code=404, detail="Project not found") from error


@app.patch("/api/projects/{project_id}/export-settings", response_model=ProjectDetail)
def patch_project_export_settings(project_id: str, settings: ExportSettings) -> ProjectDetail:
    try:
        return update_project_export_settings(project_id, settings)
    except FileNotFoundError as error:
        raise HTTPException(status_code=404, detail="Project not found") from error


@app.get("/api/projects/{project_id}/enhancement-proposals", response_model=list[EnhancementProposal])
def get_enhancement_proposals(project_id: str) -> list[EnhancementProposal]:
    try:
        return list_enhancement_proposals(project_id)
    except FileNotFoundError as error:
        raise HTTPException(status_code=404, detail="Project not found") from error


@app.post("/api/projects/{project_id}/enhancement-proposals", response_model=EnhancementProposal, status_code=201)
def post_enhancement_proposal(project_id: str, data: EnhancementProposalCreate) -> EnhancementProposal:
    try:
        return create_enhancement_proposal(project_id, data)
    except FileNotFoundError as error:
        raise HTTPException(status_code=404, detail="Project not found") from error
    except KeyError as error:
        raise HTTPException(status_code=404, detail="Scene not found") from error
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error


@app.post("/api/projects/{project_id}/enhancement-proposals/{proposal_id}/decision", response_model=EnhancementProposalResult)
def post_enhancement_proposal_decision(project_id: str, proposal_id: str, data: EnhancementProposalDecision) -> EnhancementProposalResult:
    try:
        proposal, updated_project = decide_enhancement_proposal(project_id, proposal_id, data.decision)
        return EnhancementProposalResult(proposal=proposal, project=updated_project)
    except FileNotFoundError as error:
        raise HTTPException(status_code=404, detail="Project not found") from error
    except KeyError as error:
        raise HTTPException(status_code=404, detail="Proposal not found") from error
    except EnhancementProposalConflict as error:
        raise HTTPException(status_code=409, detail=str(error)) from error
    except ValueError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error


@app.get("/api/projects/{project_id}/scenes/{scene_id}/assessment.qti.xml")
def export_qti_assessment_item(project_id: str, scene_id: str) -> Response:
    try:
        project = read_project(project_id)
    except FileNotFoundError as error:
        raise HTTPException(status_code=404, detail="Project not found") from error
    scene = next((item for item in project.storyboard.scenes if item.id == scene_id), None)
    if scene is None:
        raise HTTPException(status_code=404, detail="Scene not found")
    if scene.assessmentItem is None:
        raise HTTPException(status_code=404, detail="Scene has no assessment item")
    filename = f"{scene.assessmentItem.identifier}.xml"
    return Response(
        content=assessment_item_xml(scene),
        media_type="application/xml",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@app.get("/api/projects/{project_id}/assessment.qti.zip")
def export_qti_assessment_test(project_id: str) -> Response:
    try:
        project = read_project(project_id)
    except FileNotFoundError as error:
        raise HTTPException(status_code=404, detail="Project not found") from error
    try:
        package = assessment_test_package(project.storyboard.scenes, project.title)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    filename = f"{slugify(project.title)}-assessment.qti.zip"
    return Response(
        content=package,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@app.get("/api/projects/{project_id}/scorm-2004.zip")
def export_scorm_2004(project_id: str) -> Response:
    try:
        project = read_project(project_id)
    except FileNotFoundError as error:
        raise HTTPException(status_code=404, detail="Project not found") from error
    try:
        package, _, filename = persist_scorm_build(project)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    return Response(
        content=package,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@app.get("/api/projects/{project_id}/scorm-12.zip")
def export_scorm_12(project_id: str) -> Response:
    try:
        project = read_project(project_id)
    except FileNotFoundError as error:
        raise HTTPException(status_code=404, detail="Project not found") from error
    try:
        package, _, filename = persist_scorm_12_build(project)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    return Response(
        content=package,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@app.get("/api/projects/{project_id}/scorm-report/{profile}")
def get_scorm_report(project_id: str, profile: Literal["scorm2004", "scorm12"]) -> JSONResponse:
    try:
        read_project(project_id)
        report = read_scorm_report(project_id, profile)
    except FileNotFoundError as error:
        raise HTTPException(status_code=404, detail="SCORM build report not found") from error
    return JSONResponse(
        content=report,
        headers={"Content-Disposition": f'attachment; filename="build-{profile}.json"'},
    )


@app.get("/api/projects/{project_id}/storyboard/export")
def export_storyboard(project_id: str) -> JSONResponse:
    try:
        project = read_project(project_id)
    except FileNotFoundError as error:
        raise HTTPException(status_code=404, detail="Project not found") from error
    filename = f"{slugify(project.title)}-storyboard.json"
    return JSONResponse(
        content=project.storyboard.model_dump(mode="json"),
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@app.put("/api/projects/{project_id}/storyboard/import", response_model=ProjectDetail)
def import_storyboard(project_id: str, data: Storyboard) -> ProjectDetail:
    try:
        return replace_storyboard(project_id, data)
    except FileNotFoundError as error:
        raise HTTPException(status_code=404, detail="Project not found or a referenced template is unavailable") from error
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error


@app.post("/api/projects/{project_id}/assets", response_model=ProjectDetail, status_code=201)
async def post_project_asset(project_id: str, file: UploadFile = File(...)) -> ProjectDetail:
    try:
        read_project(project_id)
    except FileNotFoundError as error:
        raise HTTPException(status_code=404, detail="Project not found") from error
    if not file.filename:
        raise HTTPException(status_code=400, detail="Asset filename is required")
    extension = Path(file.filename).suffix.lower()
    if extension in IMAGE_UPLOAD_EXTENSIONS:
        kind = "image"
    elif extension in AUDIO_UPLOAD_EXTENSIONS:
        kind = "audio"
    else:
        raise HTTPException(status_code=400, detail="Upload a JPG, PNG, GIF, WebP, MP3, M4A, AAC, WAV, or OGG file")
    content = await file.read(MAX_MEDIA_BYTES + 1)
    if not content:
        raise HTTPException(status_code=400, detail="Asset file is empty")
    if len(content) > MAX_MEDIA_BYTES:
        raise HTTPException(status_code=413, detail="Media files must be 100 MB or smaller")
    if kind == "image":
        try:
            with Image.open(io.BytesIO(content)) as image:
                image.verify()
        except (UnidentifiedImageError, OSError) as error:
            raise HTTPException(status_code=422, detail="Could not read image file") from error
    return add_project_asset(project_id, Path(file.filename).name, content, kind)


@app.get("/api/projects/{project_id}/assets/{asset_id}")
def get_project_asset(project_id: str, asset_id: str) -> FileResponse:
    try:
        project = read_project(project_id)
    except FileNotFoundError as error:
        raise HTTPException(status_code=404, detail="Project not found") from error
    asset = next((item for item in project.storyboard.assets if item.id == asset_id), None)
    if asset is None:
        raise HTTPException(status_code=404, detail="Asset not found")
    project_root = project_path(project_id).resolve()
    assets_root = (project_root / "assets").resolve()
    asset_path = (project_root / asset.path).resolve()
    if not asset_path.is_relative_to(assets_root) or not asset_path.is_file():
        raise HTTPException(status_code=404, detail="Asset not found")
    return FileResponse(asset_path, media_type=asset.contentType)


@app.get("/api/projects/{project_id}/renders/{filename}")
def get_slide_render(project_id: str, filename: str) -> FileResponse:
    if Path(filename).name != filename or not filename.startswith("slide-") or not filename.endswith(".png"):
        raise HTTPException(status_code=404, detail="Slide preview not found")
    image_path = project_path(project_id) / "renders" / filename
    if not image_path.is_file():
        raise HTTPException(status_code=404, detail="Slide preview not found")
    return FileResponse(image_path, media_type="image/png")


@app.post("/api/projects/{project_id}/scenes", response_model=ProjectDetail, status_code=201)
def post_scene(project_id: str, data: SceneCreate) -> ProjectDetail:
    try:
        return create_scene(project_id, data)
    except FileNotFoundError as error:
        raise HTTPException(status_code=404, detail="Project not found") from error
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error


@app.patch("/api/projects/{project_id}/scenes/{scene_id}", response_model=ProjectDetail)
def patch_scene(project_id: str, scene_id: str, data: SceneUpdate) -> ProjectDetail:
    try:
        return update_scene(project_id, scene_id, data)
    except FileNotFoundError as error:
        raise HTTPException(status_code=404, detail="Project not found") from error
    except KeyError as error:
        raise HTTPException(status_code=404, detail="Scene not found") from error
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error


@app.put("/api/projects/{project_id}/scenes/order", response_model=ProjectDetail)
def put_scene_order(project_id: str, data: SceneOrder) -> ProjectDetail:
    try:
        return reorder_scenes(project_id, data.sceneIds)
    except FileNotFoundError as error:
        raise HTTPException(status_code=404, detail="Project not found") from error
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error


@app.post("/api/projects/{project_id}/source", response_model=ProjectDetail)
async def upload_source(project_id: str, file: UploadFile = File(...)) -> ProjectDetail:
    if not file.filename or not file.filename.lower().endswith(".pptx"):
        raise HTTPException(status_code=400, detail="Only .pptx files are supported")
    try:
        read_project(project_id)
    except FileNotFoundError as error:
        raise HTTPException(status_code=404, detail="Project not found") from error

    project_root = project_path(project_id)
    destination = project_root / "original" / "source-deck.pptx"
    with tempfile.TemporaryDirectory(prefix=".import-", dir=project_root) as staging_dir:
        staging_root = Path(staging_dir)
        staged = staging_root / "source-deck.pptx"
        staged.write_bytes(await file.read())
        try:
            scenes, assets = extract_presentation(staged, staging_root)
        except Exception as error:
            raise HTTPException(status_code=422, detail=f"Could not read presentation: {error}") from error
        previews, render_warning = render_slides(staged, staging_root)
        scenes = [
            scene.model_copy(
                update={
                    "previewImage": previews.get(scene.sourceSlide) if scene.sourceSlide is not None else None,
                    "renderWarning": render_warning if scene.sourceSlide is None or scene.sourceSlide not in previews else None,
                }
            )
            for scene in scenes
        ]
        persist_imported_assets(project_id, staging_root, assets)
        persist_slide_previews(project_id, staging_root, scenes)
        staged.replace(destination)
        return update_from_import(project_id, scenes, assets)
