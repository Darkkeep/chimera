import io
import json
import mimetypes
import tempfile
from pathlib import Path
from typing import Annotated, Literal

from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image, UnidentifiedImageError
from pptx import Presentation

from .ingest import extract_presentation
from .auth import resolve_actor_context
from .backup import build_project_archive, restore_project_archive
from .enhancement_jobs import cancel_enhancement_job, preview_enhancement_submission, recover_enhancement_jobs, retry_enhancement_job, start_enhancement_job
from .identity import IdentitySnapshot, LocalIdentityDirectory, OrganizationPolicy, ProjectMembership, ProjectMembershipCreate, RoleBasedAuthorizationPolicy
from .media_generation import cancel_media_generation_job, recover_media_generation_jobs, regenerate_candidate, retry_media_generation_job, start_media_generation_job
from .models import AssetAttributionUpdate, CourseCompletionSettings, EnhancementJob, EnhancementJobCreate, EnhancementProposal, EnhancementProposalCreate, EnhancementProposalDecision, EnhancementProposalResult, ExportSettings, GeneratedAssetCandidate, MediaGenerationJob, MediaGenerationJobCreate, ProjectCreate, ProjectDetail, ProjectSummary, ReferenceResource, ReviewComment, ReviewCommentCreate, ReviewCommentDecision, ReviewReplyCreate, SceneCreate, SceneOrder, SceneUpdate, Storyboard, TemplateRecord, TemplateUpdate, ValidationReport
from .platform import ActorContext, AuditEventPage, AuthorizationPolicy, LOCAL_ACTOR, read_audit_events, action_context, get_actor_context, DurableEventSink, PlatformEvent, get_correlation_id
from .references import SUPPORTED_REFERENCE_EXTENSIONS, extract_reference_passages
from .render import render_slides
from .qti import assessment_item_xml, assessment_test_package
from .scorm import persist_scorm_12_build, persist_scorm_build, read_scorm_report
from .storage import ROOT, EnhancementProposalConflict, StoryboardRevisionConflict, add_project_asset, add_review_reply, approve_generated_candidate, create_enhancement_job, create_enhancement_proposal, create_media_generation_job, create_project, create_review_comment, create_scene, create_template, decide_enhancement_proposal, decide_review_comment, delete_scene, list_enhancement_jobs, list_enhancement_proposals, list_generated_candidates, list_media_generation_jobs, list_projects, list_reference_resources, list_review_comments, list_templates, project_path, read_enhancement_job, read_generated_candidate, read_media_generation_job, read_project, persist_imported_assets, persist_slide_previews, reorder_scenes, replace_storyboard, replace_template_source, save_reference_resource, slugify, storyboard_transaction, update_from_import, update_project_asset_attribution, update_project_completion_settings, update_project_export_settings, update_generated_candidate, update_media_generation_job, update_scene, update_template
from .validation import validate_project
from .word_export import DOCX_MEDIA_TYPE, build_storyboard_docx


ROUTE_ACTIONS = {
    "health": "identity.view", "get_identity_context": "identity.view",
    "get_identity_policy": "identity.view", "get_installation_config": "identity.view",
    "patch_identity_policy": "admin.policy.manage", "get_project_members": "project.membership.manage",
    "post_project_member": "project.membership.manage", "get_project_health": "project.list",
    "get_my_work": "project.list", "get_audit_events": "admin.audit.view",
    "get_projects": "project.list", "get_templates": "template.view",
    "post_template": "template.manage", "patch_template": "template.manage",
    "put_template_source": "template.manage", "post_project": "project.create",
    "get_project": "project.view", "get_project_validation": "project.view",
    "get_project_readiness": "project.metadata.view", "patch_project_asset_attribution": "media.manage",
    "patch_project_completion_settings": "project.settings.update", "patch_project_export_settings": "project.settings.update",
    "get_enhancement_proposals": "project.view", "get_review_comments": "project.view",
    "post_review_comment": "review.comment.create", "post_review_reply": "review.reply.create",
    "post_review_comment_decision": "review.comment.resolve", "post_enhancement_proposal": "enhancement.proposal.create",
    "post_enhancement_proposal_decision": "enhancement.proposal.decide", "get_reference_resources": "project.view",
    "post_reference_resource": "reference.create", "get_enhancement_jobs": "project.view",
    "get_media_generation_jobs": "project.view", "post_media_generation_job": "media.job.create",
    "get_media_generation_job": "project.view", "post_media_generation_job_cancel": "media.job.manage",
    "post_media_generation_job_retry": "media.job.manage", "get_generated_candidates": "project.view",
    "post_generated_candidate_approval": "enhancement.proposal.decide", "post_generated_candidate_rejection": "media.candidate.manage",
    "post_generated_candidate_regeneration": "media.job.create", "get_generated_candidate_asset": "project.view",
    "post_enhancement_job_preview": "enhancement.job.create", "post_enhancement_job": "enhancement.job.create",
    "get_enhancement_job": "project.view", "post_enhancement_job_cancel": "enhancement.job.manage",
    "post_enhancement_job_retry": "enhancement.job.manage", "export_qti_assessment_item": "project.export",
    "export_qti_assessment_test": "project.export", "export_scorm_2004": "project.export",
    "export_scorm_12": "project.export", "get_scorm_report": "project.export",
    "export_storyboard": "project.export", "export_project_backup": "project.export",
    "import_project_backup": "project.restore", "export_storyboard_docx": "project.export",
    "import_storyboard": "project.import", "post_project_asset": "media.manage",
    "get_project_asset": "project.view", "get_slide_render": "project.view",
    "post_scene": "scene.manage", "patch_scene": "scene.manage", "delete_project_scene": "scene.manage",
    "put_scene_order": "scene.manage", "upload_source": "project.import",
}


def get_authorization_policy() -> RoleBasedAuthorizationPolicy:
    return RoleBasedAuthorizationPolicy(LocalIdentityDirectory(ROOT))


def _request_action(request: Request) -> str:
    return ROUTE_ACTIONS.get(getattr(request.scope.get("route"), "name", ""), "unknown")


async def _require_request_access(
    request: Request,
    context: Annotated[ActorContext, Depends(resolve_actor_context)],
    policy: Annotated[AuthorizationPolicy, Depends(get_authorization_policy)],
) -> None:
    action = _request_action(request)
    project_id = request.path_params.get("project_id")
    if action == "admin.audit.view":
        project_id = request.query_params.get("project_id")
    _require_action(policy, context, action, project_id)
    with action_context(context):
        yield
        if request.method != "GET" or action == "project.export":
            root = project_path(project_id) if project_id else ROOT
            event_class = "security" if action in {"project.export", "project.restore", "project.membership.manage", "admin.policy.manage", "enhancement.proposal.decide", "review.comment.resolve"} else "operational"
            DurableEventSink(root).record(PlatformEvent(
                eventName="api.action_completed", installationId=context.installationId,
                actorId=context.actorId, actorDisplayName=context.actorDisplayName,
                correlationId=get_correlation_id(), projectId=project_id,
                deploymentMode=context.deploymentMode, eventClass=event_class,
                metadata={"action": action, "method": request.method},
            ))


app = FastAPI(title="Chimera API", version="0.1.0", dependencies=[Depends(_require_request_access)])
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
MAX_TEMPLATE_BYTES = 50 * 1024 * 1024
MAX_MEDIA_BYTES = 100 * 1024 * 1024
MAX_REFERENCE_BYTES = 25 * 1024 * 1024
MAX_BACKUP_BYTES = 500 * 1024 * 1024
IMAGE_UPLOAD_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".webp"}
AUDIO_UPLOAD_EXTENSIONS = {".mp3", ".m4a", ".aac", ".wav", ".ogg"}


@app.on_event("startup")
def resume_enhancement_jobs() -> None:
    recover_enhancement_jobs()
    recover_media_generation_jobs()


def _expected_revision(if_match: str | None) -> int | None:
    if if_match is None:
        return None
    value = if_match.strip()
    if value.startswith('W/'):
        value = value[2:]
    try:
        revision = int(value.strip('"'))
    except ValueError as error:
        raise HTTPException(status_code=400, detail="If-Match must contain a storyboard revision ETag") from error
    if revision < 1:
        raise HTTPException(status_code=400, detail="If-Match must contain a positive storyboard revision")
    return revision


def _revision_conflict(error: StoryboardRevisionConflict) -> HTTPException:
    return HTTPException(
        status_code=412,
        detail=f"{error} Reload the project before saving again.",
        headers={"ETag": f'"{error.actual_revision}"'},
    )


def _require_action(policy: AuthorizationPolicy, context: ActorContext, action: str, project_id: str | None = None) -> None:
    if not policy.allows(context, action, project_id):
        raise HTTPException(status_code=403, detail=f"The current actor is not allowed to perform {action}.")


def _check_expected_revision(expected_revision: int | None, actual_revision: int) -> None:
    if expected_revision is not None and expected_revision != actual_revision:
        raise _revision_conflict(StoryboardRevisionConflict(expected_revision, actual_revision))


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/identity/context", response_model=IdentitySnapshot)
def get_identity_context() -> IdentitySnapshot:
    snapshot = LocalIdentityDirectory(ROOT).snapshot()
    actor = get_actor_context()
    if actor.deploymentMode == "single-user":
        return snapshot
    user = next(item for item in [snapshot.user, *snapshot.users] if item.id == actor.actorId)
    return snapshot.model_copy(update={"actor": actor, "user": user, "users": [],
        "memberships": [item for item in snapshot.memberships if item.userId == actor.actorId],
        "projectMemberships": [item for item in snapshot.projectMemberships if item.userId == actor.actorId]})


@app.get("/api/identity/policy", response_model=OrganizationPolicy)
def get_identity_policy() -> OrganizationPolicy:
    return LocalIdentityDirectory(ROOT).policy()


@app.get("/api/installation/config", response_model=OrganizationPolicy)
def get_installation_config() -> OrganizationPolicy:
    return LocalIdentityDirectory(ROOT).policy()


@app.patch("/api/identity/policy", response_model=OrganizationPolicy)
def patch_identity_policy(
    policy_data: OrganizationPolicy,
    context: Annotated[ActorContext | None, Depends(resolve_actor_context)] = None,
    policy: Annotated[AuthorizationPolicy | None, Depends(get_authorization_policy)] = None,
) -> OrganizationPolicy:
    actor = context or LOCAL_ACTOR
    _require_action(policy or get_authorization_policy(), actor, "admin.policy.manage")
    return LocalIdentityDirectory(ROOT).update_policy(policy_data)


@app.get("/api/projects/{project_id}/members", response_model=list[ProjectMembership])
def get_project_members(project_id: str) -> list[ProjectMembership]:
    try:
        read_project(project_id)
        return LocalIdentityDirectory(ROOT).project_memberships(project_id)
    except FileNotFoundError as error:
        raise HTTPException(status_code=404, detail="Project not found") from error


@app.post("/api/projects/{project_id}/members", response_model=ProjectMembership, status_code=201)
def post_project_member(
    project_id: str,
    data: ProjectMembershipCreate,
    context: Annotated[ActorContext | None, Depends(resolve_actor_context)] = None,
    policy: Annotated[AuthorizationPolicy | None, Depends(get_authorization_policy)] = None,
) -> ProjectMembership:
    actor = context or LOCAL_ACTOR
    _require_action(policy or get_authorization_policy(), actor, "project.membership.manage", project_id)
    try:
        read_project(project_id)
        return LocalIdentityDirectory(ROOT).add_project_membership(ProjectMembership(projectId=project_id, **data.model_dump()))
    except FileNotFoundError as error:
        raise HTTPException(status_code=404, detail="Project not found") from error
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error


@app.get("/api/management/project-health")
def get_project_health() -> list[dict[str, object]]:
    health: list[dict[str, object]] = []
    for summary in list_projects():
        if not get_authorization_policy().allows(get_actor_context(), "project.metadata.view", summary.id):
            continue
        project = read_project(summary.id)
        authoring = validate_project(project, target="authoring")
        production = validate_project(project, target="production")
        comments = list_review_comments(summary.id)
        proposals = list_enhancement_proposals(summary.id)
        health.append({
            "projectId": summary.id,
            "title": summary.title,
            "revision": project.storyboard.revision,
            "sceneCount": summary.sceneCount,
            "pendingProposals": sum(proposal.status == "pending" for proposal in proposals),
            "unresolvedComments": sum(not comment.resolved for comment in comments),
            "publicationBlockers": sum(issue.severity == "error" for issue in production.issues),
            "authoringWarnings": sum(issue.severity == "warning" for issue in authoring.issues),
            "updatedAt": summary.updatedAt,
        })
    return health


@app.get("/api/management/my-work")
def get_my_work() -> dict[str, object]:
    actor = get_actor_context()
    projects = get_project_health()
    return {
        "actorId": actor.actorId,
        "projects": projects,
        "pendingApprovals": sum(item["pendingProposals"] for item in projects),
        "unresolvedComments": sum(item["unresolvedComments"] for item in projects),
        "publicationBlockers": sum(item["publicationBlockers"] for item in projects),
    }


@app.get("/api/management/audit", response_model=AuditEventPage)
def get_audit_events(project_id: str | None = None, offset: int = 0, limit: int = 100) -> AuditEventPage:
    if offset < 0 or limit < 1 or limit > 500:
        raise HTTPException(status_code=422, detail="Offset must be non-negative and limit must be between 1 and 500")
    return read_audit_events(ROOT, project_id, offset, limit, installation_id=get_actor_context().installationId)


@app.get("/api/projects", response_model=list[ProjectSummary])
def get_projects() -> list[ProjectSummary]:
    return [project for project in list_projects() if get_authorization_policy().allows(get_actor_context(), "project.metadata.view", project.id)]


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
def post_project(
    data: ProjectCreate,
    context: Annotated[ActorContext | None, Depends(resolve_actor_context)] = None,
    policy: Annotated[AuthorizationPolicy | None, Depends(get_authorization_policy)] = None,
) -> ProjectDetail:
    actor = context or LOCAL_ACTOR
    _require_action(policy or get_authorization_policy(), actor, "project.create")
    return create_project(data, actor)


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


@app.get("/api/projects/{project_id}/readiness")
def get_project_readiness(project_id: str) -> dict[str, object]:
    try:
        project = read_project(project_id)
        authoring = validate_project(project, target="authoring")
        production = validate_project(project, target="production")
        comments = list_review_comments(project_id)
        proposals = list_enhancement_proposals(project_id)
    except FileNotFoundError as error:
        raise HTTPException(status_code=404, detail="Project not found") from error
    return {
        "revision": project.storyboard.revision,
        "pendingProposals": sum(proposal.status == "pending" for proposal in proposals),
        "unresolvedComments": sum(not comment.resolved for comment in comments),
        "outdatedComments": sum(comment.outdated or comment.sceneDeleted for comment in comments),
        "missingMedia": sum(issue.code in {"missing-asset-file", "invalid-asset-reference"} for issue in authoring.issues),
        "authoringWarnings": sum(issue.severity == "warning" for issue in authoring.issues),
        "publicationBlockers": sum(issue.severity == "error" for issue in production.issues),
        "authoringPassed": authoring.passed,
        "productionPassed": production.passed,
    }


@app.patch("/api/projects/{project_id}/assets/{asset_id}/attribution", response_model=ProjectDetail)
def patch_project_asset_attribution(project_id: str, asset_id: str, data: AssetAttributionUpdate, if_match: Annotated[str | None, Header()] = None) -> ProjectDetail:
    try:
        return update_project_asset_attribution(project_id, asset_id, data, _expected_revision(if_match))
    except StoryboardRevisionConflict as error:
        raise _revision_conflict(error) from error
    except FileNotFoundError as error:
        raise HTTPException(status_code=404, detail="Project not found") from error
    except KeyError as error:
        raise HTTPException(status_code=404, detail="Asset not found") from error


@app.patch("/api/projects/{project_id}/completion-settings", response_model=ProjectDetail)
def patch_project_completion_settings(project_id: str, settings: CourseCompletionSettings, if_match: Annotated[str | None, Header()] = None) -> ProjectDetail:
    try:
        return update_project_completion_settings(project_id, settings, _expected_revision(if_match))
    except StoryboardRevisionConflict as error:
        raise _revision_conflict(error) from error
    except FileNotFoundError as error:
        raise HTTPException(status_code=404, detail="Project not found") from error


@app.patch("/api/projects/{project_id}/export-settings", response_model=ProjectDetail)
def patch_project_export_settings(project_id: str, settings: ExportSettings, if_match: Annotated[str | None, Header()] = None) -> ProjectDetail:
    try:
        return update_project_export_settings(project_id, settings, _expected_revision(if_match))
    except StoryboardRevisionConflict as error:
        raise _revision_conflict(error) from error
    except FileNotFoundError as error:
        raise HTTPException(status_code=404, detail="Project not found") from error


@app.get("/api/projects/{project_id}/enhancement-proposals", response_model=list[EnhancementProposal])
def get_enhancement_proposals(project_id: str) -> list[EnhancementProposal]:
    try:
        return list_enhancement_proposals(project_id)
    except FileNotFoundError as error:
        raise HTTPException(status_code=404, detail="Project not found") from error


@app.get("/api/projects/{project_id}/review-comments", response_model=list[ReviewComment])
def get_review_comments(project_id: str) -> list[ReviewComment]:
    try:
        return list_review_comments(project_id)
    except FileNotFoundError as error:
        raise HTTPException(status_code=404, detail="Project not found") from error


@app.post("/api/projects/{project_id}/review-comments", response_model=ReviewComment, status_code=201)
def post_review_comment(
    project_id: str,
    data: ReviewCommentCreate,
    context: Annotated[ActorContext | None, Depends(resolve_actor_context)] = None,
    policy: Annotated[AuthorizationPolicy | None, Depends(get_authorization_policy)] = None,
) -> ReviewComment:
    actor = context or LOCAL_ACTOR
    _require_action(policy or get_authorization_policy(), actor, "review.comment.create", project_id)
    try:
        return create_review_comment(project_id, data, actor)
    except FileNotFoundError as error:
        raise HTTPException(status_code=404, detail="Project not found") from error
    except KeyError as error:
        raise HTTPException(status_code=404, detail="Scene not found") from error
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error


@app.post("/api/projects/{project_id}/review-comments/{comment_id}/replies", response_model=ReviewComment)
def post_review_reply(
    project_id: str,
    comment_id: str,
    data: ReviewReplyCreate,
    context: Annotated[ActorContext | None, Depends(resolve_actor_context)] = None,
    policy: Annotated[AuthorizationPolicy | None, Depends(get_authorization_policy)] = None,
) -> ReviewComment:
    actor = context or LOCAL_ACTOR
    _require_action(policy or get_authorization_policy(), actor, "review.reply.create", project_id)
    try:
        return add_review_reply(project_id, comment_id, data, actor)
    except FileNotFoundError as error:
        raise HTTPException(status_code=404, detail="Project not found") from error
    except KeyError as error:
        raise HTTPException(status_code=404, detail="Review comment not found") from error


@app.post("/api/projects/{project_id}/review-comments/{comment_id}/decision", response_model=ReviewComment)
def post_review_comment_decision(
    project_id: str,
    comment_id: str,
    data: ReviewCommentDecision,
    context: Annotated[ActorContext | None, Depends(resolve_actor_context)] = None,
    policy: Annotated[AuthorizationPolicy | None, Depends(get_authorization_policy)] = None,
) -> ReviewComment:
    actor = context or LOCAL_ACTOR
    _require_action(policy or get_authorization_policy(), actor, "review.comment.resolve", project_id)
    try:
        return decide_review_comment(project_id, comment_id, data, actor)
    except FileNotFoundError as error:
        raise HTTPException(status_code=404, detail="Project not found") from error
    except KeyError as error:
        raise HTTPException(status_code=404, detail="Review comment not found") from error


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
def post_enhancement_proposal_decision(project_id: str, proposal_id: str, data: EnhancementProposalDecision, if_match: Annotated[str | None, Header()] = None) -> EnhancementProposalResult:
    try:
        if if_match is None:
            raise HTTPException(status_code=428, detail="An If-Match storyboard revision is required")
        proposal, updated_project = decide_enhancement_proposal(
            project_id,
            proposal_id,
            data.decision,
            _expected_revision(if_match),
            data.changes,
        )
        return EnhancementProposalResult(proposal=proposal, project=updated_project)
    except StoryboardRevisionConflict as error:
        raise _revision_conflict(error) from error
    except FileNotFoundError as error:
        raise HTTPException(status_code=404, detail="Project not found") from error
    except KeyError as error:
        raise HTTPException(status_code=404, detail="Proposal not found") from error
    except EnhancementProposalConflict as error:
        raise HTTPException(status_code=409, detail=str(error)) from error
    except ValueError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error


@app.get("/api/projects/{project_id}/reference-resources", response_model=list[ReferenceResource])
def get_reference_resources(project_id: str) -> list[ReferenceResource]:
    try:
        return list_reference_resources(project_id)
    except FileNotFoundError as error:
        raise HTTPException(status_code=404, detail="Project not found") from error


@app.post("/api/projects/{project_id}/reference-resources", response_model=ReferenceResource, status_code=201)
async def post_reference_resource(
    project_id: str,
    file: UploadFile = File(...),
    title: str | None = Form(default=None),
    classification: Literal["study-guide", "supporting-document", "policy", "other"] = Form(default="supporting-document"),
    authoritative: bool = Form(default=False),
    scene_ids: str = Form(default="[]"),
    resource_id: str | None = Form(default=None),
) -> ReferenceResource:
    if not file.filename or Path(file.filename).suffix.lower() not in SUPPORTED_REFERENCE_EXTENSIONS:
        raise HTTPException(status_code=400, detail="Reference files must be PDF, DOCX, PPTX, TXT, or Markdown")
    content = await file.read(MAX_REFERENCE_BYTES + 1)
    if len(content) > MAX_REFERENCE_BYTES:
        raise HTTPException(status_code=413, detail="Reference files must be 25 MB or smaller")
    try:
        parsed_scene_ids = json.loads(scene_ids)
        if not isinstance(parsed_scene_ids, list) or any(not isinstance(scene_id, str) for scene_id in parsed_scene_ids):
            raise ValueError("Scene assignments must be a JSON array of scene IDs")
    except (json.JSONDecodeError, ValueError) as error:
        raise HTTPException(status_code=422, detail="Scene assignments must be a JSON array of scene IDs") from error
    passages, extraction_status, extraction_message = extract_reference_passages(file.filename, content)
    try:
        return save_reference_resource(
            project_id,
            Path(file.filename).name,
            (title or Path(file.filename).stem).strip(),
            classification,
            authoritative,
            parsed_scene_ids,
            content,
            file.content_type or mimetypes.guess_type(file.filename)[0] or "application/octet-stream",
            passages,
            extraction_status,
            extraction_message,
            resource_id,
        )
    except FileNotFoundError as error:
        raise HTTPException(status_code=404, detail="Project or reference resource not found") from error
    except KeyError as error:
        raise HTTPException(status_code=404, detail="Reference resource not found") from error
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error


@app.get("/api/projects/{project_id}/enhancement-jobs", response_model=list[EnhancementJob])
def get_enhancement_jobs(project_id: str) -> list[EnhancementJob]:
    try:
        return list_enhancement_jobs(project_id)
    except FileNotFoundError as error:
        raise HTTPException(status_code=404, detail="Project not found") from error


@app.get("/api/projects/{project_id}/media-generation-jobs", response_model=list[MediaGenerationJob])
def get_media_generation_jobs(project_id: str) -> list[MediaGenerationJob]:
    try:
        return list_media_generation_jobs(project_id)
    except FileNotFoundError as error:
        raise HTTPException(status_code=404, detail="Project not found") from error


@app.post("/api/projects/{project_id}/media-generation-jobs", response_model=MediaGenerationJob, status_code=202)
def post_media_generation_job(project_id: str, data: MediaGenerationJobCreate) -> MediaGenerationJob:
    try:
        job = create_media_generation_job(project_id, data)
        start_media_generation_job(project_id, job.id)
        return job
    except FileNotFoundError as error:
        raise HTTPException(status_code=404, detail="Project not found") from error
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error


@app.get("/api/projects/{project_id}/media-generation-jobs/{job_id}", response_model=MediaGenerationJob)
def get_media_generation_job(project_id: str, job_id: str) -> MediaGenerationJob:
    try:
        return read_media_generation_job(project_id, job_id)
    except FileNotFoundError as error:
        raise HTTPException(status_code=404, detail="Media generation job not found") from error


@app.post("/api/projects/{project_id}/media-generation-jobs/{job_id}/cancel", response_model=MediaGenerationJob)
def post_media_generation_job_cancel(project_id: str, job_id: str) -> MediaGenerationJob:
    try:
        return cancel_media_generation_job(project_id, job_id)
    except FileNotFoundError as error:
        raise HTTPException(status_code=404, detail="Media generation job not found") from error
    except ValueError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error


@app.post("/api/projects/{project_id}/media-generation-jobs/{job_id}/retry", response_model=MediaGenerationJob, status_code=202)
def post_media_generation_job_retry(project_id: str, job_id: str) -> MediaGenerationJob:
    try:
        return retry_media_generation_job(project_id, job_id)
    except FileNotFoundError as error:
        raise HTTPException(status_code=404, detail="Media generation job not found") from error
    except ValueError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error


@app.get("/api/projects/{project_id}/generated-candidates", response_model=list[GeneratedAssetCandidate])
def get_generated_candidates(project_id: str) -> list[GeneratedAssetCandidate]:
    try:
        return list_generated_candidates(project_id)
    except FileNotFoundError as error:
        raise HTTPException(status_code=404, detail="Project not found") from error


@app.post("/api/projects/{project_id}/generated-candidates/{candidate_id}/approve", response_model=EnhancementProposalResult)
def post_generated_candidate_approval(project_id: str, candidate_id: str, if_match: Annotated[str | None, Header()] = None) -> EnhancementProposalResult:
    try:
        if if_match is None:
            raise HTTPException(status_code=428, detail="An If-Match storyboard revision is required")
        candidate, proposal, project = approve_generated_candidate(project_id, candidate_id, _expected_revision(if_match) or 0)
        return EnhancementProposalResult(proposal=proposal, project=project)
    except StoryboardRevisionConflict as error:
        raise _revision_conflict(error) from error
    except FileNotFoundError as error:
        raise HTTPException(status_code=404, detail="Generated candidate not found") from error
    except ValueError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error


@app.post("/api/projects/{project_id}/generated-candidates/{candidate_id}/reject", response_model=GeneratedAssetCandidate)
def post_generated_candidate_rejection(project_id: str, candidate_id: str) -> GeneratedAssetCandidate:
    try:
        candidate = read_generated_candidate(project_id, candidate_id)
        if candidate.status != "pending":
            raise ValueError("Only pending generated candidates can be rejected")
        return update_generated_candidate(project_id, candidate_id, status="rejected")
    except FileNotFoundError as error:
        raise HTTPException(status_code=404, detail="Generated candidate not found") from error
    except ValueError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error


@app.post("/api/projects/{project_id}/generated-candidates/{candidate_id}/regenerate", response_model=MediaGenerationJob, status_code=202)
def post_generated_candidate_regeneration(project_id: str, candidate_id: str) -> MediaGenerationJob:
    try:
        return regenerate_candidate(project_id, candidate_id)
    except FileNotFoundError as error:
        raise HTTPException(status_code=404, detail="Generated candidate not found") from error
    except ValueError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error


@app.get("/api/projects/{project_id}/generated-candidates/{candidate_id}/asset")
def get_generated_candidate_asset(project_id: str, candidate_id: str) -> FileResponse:
    try:
        candidate = read_generated_candidate(project_id, candidate_id)
    except FileNotFoundError as error:
        raise HTTPException(status_code=404, detail="Generated candidate not found") from error
    path = (project_path(project_id) / candidate.path).resolve()
    root = (project_path(project_id) / "generated-candidates").resolve()
    if not path.is_relative_to(root) or not path.is_file():
        raise HTTPException(status_code=404, detail="Generated candidate media not found")
    return FileResponse(path, media_type=candidate.contentType)


@app.post("/api/projects/{project_id}/enhancement-jobs/preview")
def post_enhancement_job_preview(project_id: str, data: EnhancementJobCreate) -> dict[str, object]:
    try:
        return preview_enhancement_submission(project_id, data)
    except FileNotFoundError as error:
        raise HTTPException(status_code=404, detail="Project not found") from error
    except (KeyError, ValueError) as error:
        raise HTTPException(status_code=422, detail=str(error)) from error


@app.post("/api/projects/{project_id}/enhancement-jobs", response_model=EnhancementJob, status_code=202)
def post_enhancement_job(project_id: str, data: EnhancementJobCreate) -> EnhancementJob:
    try:
        job = create_enhancement_job(project_id, data)
        start_enhancement_job(project_id, job.id)
        return job
    except FileNotFoundError as error:
        raise HTTPException(status_code=404, detail="Project not found") from error
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error


@app.get("/api/projects/{project_id}/enhancement-jobs/{job_id}", response_model=EnhancementJob)
def get_enhancement_job(project_id: str, job_id: str) -> EnhancementJob:
    try:
        return read_enhancement_job(project_id, job_id)
    except FileNotFoundError as error:
        raise HTTPException(status_code=404, detail="Enhancement job not found") from error


@app.post("/api/projects/{project_id}/enhancement-jobs/{job_id}/cancel", response_model=EnhancementJob)
def post_enhancement_job_cancel(project_id: str, job_id: str) -> EnhancementJob:
    try:
        return cancel_enhancement_job(project_id, job_id)
    except FileNotFoundError as error:
        raise HTTPException(status_code=404, detail="Enhancement job not found") from error
    except ValueError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error


@app.post("/api/projects/{project_id}/enhancement-jobs/{job_id}/retry", response_model=EnhancementJob, status_code=202)
def post_enhancement_job_retry(project_id: str, job_id: str) -> EnhancementJob:
    try:
        return retry_enhancement_job(project_id, job_id)
    except FileNotFoundError as error:
        raise HTTPException(status_code=404, detail="Enhancement job not found") from error
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


@app.get("/api/projects/{project_id}/backup.zip")
def export_project_backup(project_id: str) -> Response:
    try:
        content = build_project_archive(project_id)
        project = read_project(project_id)
    except FileNotFoundError as error:
        raise HTTPException(status_code=404, detail="Project not found") from error
    return Response(
        content=content,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{slugify(project.title)}-backup.zip"'},
    )


@app.post("/api/projects/{project_id}/backup/restore", response_model=ProjectDetail)
async def import_project_backup(project_id: str, file: UploadFile = File(...)) -> ProjectDetail:
    content = await file.read(MAX_BACKUP_BYTES + 1)
    if len(content) > MAX_BACKUP_BYTES:
        raise HTTPException(status_code=413, detail="Project backups must be 500 MB or smaller")
    try:
        return restore_project_archive(project_id, content)
    except FileNotFoundError as error:
        raise HTTPException(status_code=404, detail="Project not found") from error
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error


@app.get("/api/projects/{project_id}/storyboard.docx")
def export_storyboard_docx(project_id: str, include_answer_key: bool = False) -> Response:
    try:
        with storyboard_transaction():
            project = read_project(project_id)
            content = build_storyboard_docx(project, include_answer_key)
    except FileNotFoundError as error:
        raise HTTPException(status_code=404, detail="Project not found") from error
    filename = f"{slugify(project.title)}-storyboard.docx"
    return Response(
        content=content,
        media_type=DOCX_MEDIA_TYPE,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@app.put("/api/projects/{project_id}/storyboard/import", response_model=ProjectDetail)
def import_storyboard(project_id: str, data: Storyboard, if_match: Annotated[str | None, Header()] = None) -> ProjectDetail:
    try:
        return replace_storyboard(project_id, data, _expected_revision(if_match))
    except StoryboardRevisionConflict as error:
        raise _revision_conflict(error) from error
    except FileNotFoundError as error:
        raise HTTPException(status_code=404, detail="Project not found or a referenced template is unavailable") from error
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error


@app.post("/api/projects/{project_id}/assets", response_model=ProjectDetail, status_code=201)
async def post_project_asset(project_id: str, file: UploadFile = File(...), if_match: Annotated[str | None, Header()] = None) -> ProjectDetail:
    try:
        current = read_project(project_id)
    except FileNotFoundError as error:
        raise HTTPException(status_code=404, detail="Project not found") from error
    expected_revision = _expected_revision(if_match)
    _check_expected_revision(expected_revision, current.storyboard.revision)
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
    try:
        return add_project_asset(project_id, Path(file.filename).name, content, kind, expected_revision)
    except StoryboardRevisionConflict as error:
        raise _revision_conflict(error) from error


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
def post_scene(project_id: str, data: SceneCreate, if_match: Annotated[str | None, Header()] = None) -> ProjectDetail:
    try:
        return create_scene(project_id, data, _expected_revision(if_match))
    except StoryboardRevisionConflict as error:
        raise _revision_conflict(error) from error
    except FileNotFoundError as error:
        raise HTTPException(status_code=404, detail="Project not found") from error
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error


@app.patch("/api/projects/{project_id}/scenes/{scene_id}", response_model=ProjectDetail)
def patch_scene(project_id: str, scene_id: str, data: SceneUpdate, if_match: Annotated[str | None, Header()] = None) -> ProjectDetail:
    try:
        return update_scene(project_id, scene_id, data, _expected_revision(if_match))
    except StoryboardRevisionConflict as error:
        raise _revision_conflict(error) from error
    except FileNotFoundError as error:
        raise HTTPException(status_code=404, detail="Project not found") from error
    except KeyError as error:
        raise HTTPException(status_code=404, detail="Scene not found") from error
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error


@app.delete("/api/projects/{project_id}/scenes/{scene_id}", response_model=ProjectDetail)
def delete_project_scene(project_id: str, scene_id: str, if_match: Annotated[str | None, Header()] = None) -> ProjectDetail:
    try:
        return delete_scene(project_id, scene_id, _expected_revision(if_match))
    except StoryboardRevisionConflict as error:
        raise _revision_conflict(error) from error
    except FileNotFoundError as error:
        raise HTTPException(status_code=404, detail="Project not found") from error
    except KeyError as error:
        raise HTTPException(status_code=404, detail="Scene not found") from error


@app.put("/api/projects/{project_id}/scenes/order", response_model=ProjectDetail)
def put_scene_order(project_id: str, data: SceneOrder, if_match: Annotated[str | None, Header()] = None) -> ProjectDetail:
    try:
        return reorder_scenes(project_id, data.sceneIds, _expected_revision(if_match))
    except StoryboardRevisionConflict as error:
        raise _revision_conflict(error) from error
    except FileNotFoundError as error:
        raise HTTPException(status_code=404, detail="Project not found") from error
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error


@app.post("/api/projects/{project_id}/source", response_model=ProjectDetail)
async def upload_source(project_id: str, file: UploadFile = File(...), if_match: Annotated[str | None, Header()] = None) -> ProjectDetail:
    if not file.filename or not file.filename.lower().endswith(".pptx"):
        raise HTTPException(status_code=400, detail="Only .pptx files are supported")
    try:
        current = read_project(project_id)
    except FileNotFoundError as error:
        raise HTTPException(status_code=404, detail="Project not found") from error
    expected_revision = _expected_revision(if_match)
    _check_expected_revision(expected_revision, current.storyboard.revision)

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
        with storyboard_transaction():
            try:
                updated = update_from_import(project_id, scenes, assets, expected_revision or current.storyboard.revision)
            except StoryboardRevisionConflict as error:
                raise _revision_conflict(error) from error
            persist_imported_assets(project_id, staging_root, assets)
            persist_slide_previews(project_id, staging_root, scenes)
            staged.replace(destination)
            return read_project(updated.id)
