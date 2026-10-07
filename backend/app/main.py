import io
import json
import mimetypes
import tempfile
from pathlib import Path
from typing import Annotated, Literal

from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.exceptions import RequestValidationError
from fastapi.exception_handlers import request_validation_exception_handler
from starlette.concurrency import run_in_threadpool
from PIL import Image, UnidentifiedImageError
from pptx import Presentation

from .ingest import extract_presentation
from .auth import resolve_actor_context
from .backup import build_project_archive, restore_project_archive
from .enhancement_jobs import cancel_enhancement_job, preview_enhancement_submission, recover_enhancement_jobs, retry_enhancement_job, start_enhancement_job
from .identity import IdentitySnapshot, LocalIdentityDirectory, OrganizationPolicy, ProjectMembership, ProjectMembershipCreate, RoleBasedAuthorizationPolicy
from .media_generation import cancel_media_generation_job, recover_media_generation_jobs, regenerate_candidate, retry_media_generation_job, start_media_generation_job
from .models import AssetAttributionUpdate, CourseCompletionSettings, EnhancementJob, EnhancementJobCreate, EnhancementProposal, EnhancementProposalCreate, EnhancementProposalDecision, EnhancementProposalResult, ExportSettings, GeneratedAssetCandidate, MediaGenerationJob, MediaGenerationJobCreate, ProjectCreate, ProjectDetail, ProjectSummary, ReferenceResource, ReviewComment, ReviewCommentCreate, ReviewCommentDecision, ReviewReplyCreate, SceneCreate, SceneOrder, SceneUpdate, Storyboard, TemplateRecord, TemplateUpdate, ValidationReport
from .platform import ActorContext, AuditEventPage, AuthorizationPolicy, DurableEventSink, PlatformEvent, LOCAL_ACTOR, REQUEST_ACTOR, get_actor_context, read_audit_events
from .references import SUPPORTED_REFERENCE_EXTENSIONS, extract_reference_passages
from .render import render_slides
from .qti import assessment_item_xml, assessment_test_package
from .scorm import persist_scorm_12_build, persist_scorm_build, read_scorm_report
from .storage import ROOT, EnhancementProposalConflict, StoryboardRevisionConflict, add_project_asset, add_review_reply, approve_generated_candidate, create_enhancement_job, create_enhancement_proposal, create_media_generation_job, create_project, create_review_comment, create_scene, create_template, decide_enhancement_proposal, decide_review_comment, delete_scene, list_enhancement_jobs, list_enhancement_proposals, list_generated_candidates, list_media_generation_jobs, list_projects, list_reference_resources, list_review_comments, list_templates, project_path, read_enhancement_job, read_generated_candidate, read_media_generation_job, read_project, persist_imported_assets, persist_slide_previews, reorder_scenes, replace_storyboard, replace_template_source, save_reference_resource, slugify, storyboard_transaction, update_from_import, update_project_asset_attribution, update_project_completion_settings, update_project_export_settings, update_generated_candidate, update_media_generation_job, update_scene, update_template
from .validation import validate_project
from .models import ProductionStageUpdate
from .storage import update_project_production_stage
from .media_generation import media_provider_configured
from .ai_connection import ConnectionRevision, ConnectionUpdate, connection_status, disconnect_connection, save_connection, test_connection
from .word_export import DOCX_MEDIA_TYPE, build_storyboard_docx
from .deployment import cors_origins, installation_policy, public_origin
from .password_auth import AccountStore, COOKIE, HostedAuthorizationPolicy, LoginRequest, ResetPasswordRequest, ReviewInvitationRequest, SESSION_SECONDS, require_origin


def get_authorization_policy() -> AuthorizationPolicy:
    directory = LocalIdentityDirectory(ROOT)
    if installation_policy(directory).identityProvider == "builtin":
        return HostedAuthorizationPolicy(AccountStore(ROOT), installation_policy(directory))
    return RoleBasedAuthorizationPolicy(directory)


def _request_action(request: Request) -> str:
    path = request.url.path
    if path.startswith("/api/ai-connection"):
        return "identity.self" if request.method == "GET" else "admin.policy.manage"
    if path.startswith("/api/identity/") and request.method == "GET" or path == "/api/installation/config":
        return "identity.self"
    if path.startswith("/api/accounts"):
        return "admin.accounts.manage"
    if path.startswith("/api/reviews"):
        return "review.invitation"
    if path.endswith("/review-comments") and request.method == "POST":
        return "review.comment.create"
    if "/review-links" in path:
        return "review.share"
    if "/enhancement-proposals/" in path and path.endswith("/decision"):
        return "enhancement.proposal.decide"
    if "/generated-candidates/" in path and path.endswith("/approve"):
        return "enhancement.proposal.decide"
    if path.endswith("/members") or "/members/" in path:
        return "project.membership.manage"
    if request.method == "GET" and (path.endswith((".zip", ".docx", ".xml", "/storyboard/export")) or "/scorm-report/" in path):
        return "project.export"
    if request.method == "GET" and path in {"/api/projects", "/api/templates", "/api/management/project-health", "/api/management/my-work"}:
        return "workspace.view"
    if request.url.path.endswith("/management/audit"):
        return "admin.audit.view"
    if request.method == "GET":
        return "project.view"
    path = request.url.path
    if path == "/api/projects":
        return "project.create"
    if path.endswith("/identity/policy"):
        return "admin.policy.manage"
    if path.endswith("/management/audit"):
        return "admin.audit.view"
    if path.endswith("/members"):
        return "project.membership.manage"
    if "/review-comments/" in path:
        if path.endswith("/replies"):
            return "review.reply.create"
        if path.endswith("/decision"):
            return "review.comment.resolve"
        return "review.comment.create"
    if "/enhancement-proposals/" in path and path.endswith("/decision"):
        return "enhancement.proposal.decide"
    if path.endswith("/enhancement-proposals"):
        return "enhancement.proposal.create"
    if "/reference-resources" in path:
        return "reference.create"
    if "/media-generation-jobs/" in path:
        return "media.job.manage"
    if path.endswith("/media-generation-jobs"):
        return "media.job.create"
    if "/generated-candidates/" in path:
        return "media.candidate.manage"
    if "/enhancement-jobs/" in path:
        return "enhancement.job.manage"
    if path.endswith("/enhancement-jobs"):
        return "enhancement.job.create"
    if path.endswith("/backup/restore"):
        return "project.restore"
    if path.endswith("/storyboard/import"):
        return "project.import"
    if "/assets" in path:
        return "media.manage"
    if "/completion-settings" in path or "/export-settings" in path or path.endswith("/production-stage"):
        return "project.settings.update"
    if "/scenes" in path:
        return "scene.manage"
    if path.endswith("/source"):
        return "project.import"
    if path.startswith("/api/templates"):
        return "template.manage"
    return "project.mutate"


def _require_request_access(
    request: Request,
    policy: Annotated[AuthorizationPolicy, Depends(get_authorization_policy)],
) -> None:
    if request.url.path in {"/api/health", "/api/auth/config", "/api/auth/login", "/api/auth/logout", "/api/auth/reset-password"}:
        return
    context = resolve_actor_context(request)
    action = _request_action(request)
    project_id = request.path_params.get("project_id")
    _require_action(policy, context, action, project_id)


app = FastAPI(title="Chimera API", version="0.1.0", dependencies=[Depends(_require_request_access)])


@app.exception_handler(RequestValidationError)
async def validation_error(request: Request, error: RequestValidationError):
    if request.url.path.startswith("/api/ai-connection"):
        return JSONResponse({"detail": "Provide an approved provider, supported models, a valid key, and valid request limits."}, status_code=422, headers={"Cache-Control": "no-store"})
    if request.url.path in {"/api/auth/login", "/api/auth/reset-password"}:
        return JSONResponse({"detail": "Provide an email and a password of at most 1024 characters"}, status_code=422, headers={"Cache-Control": "no-store"})
    return await request_validation_exception_handler(request, error)


@app.middleware("http")
async def private_response_headers(request: Request, call_next):
    token = None
    actor = None
    public = {"/api/health", "/api/auth/config", "/api/auth/login", "/api/auth/logout", "/api/auth/reset-password"}
    if request.url.path.startswith("/api/") and request.url.path not in public and request.method != "OPTIONS":
        try:
            actor = await run_in_threadpool(resolve_actor_context, request)
        except HTTPException as error:
            return JSONResponse({"detail": error.detail}, status_code=error.status_code, headers={"Cache-Control": "no-store"})
        request.state.actor = actor
        token = REQUEST_ACTOR.set(actor)
    try:
        response = await call_next(request)
    finally:
        if token is not None:
            REQUEST_ACTOR.reset(token)
    if request.url.path.startswith("/api/"):
        response.headers["Cache-Control"] = "no-store"
    if actor and actor.deploymentMode == "team" and response.status_code < 400 and (request.method not in {"GET", "HEAD", "OPTIONS"} or _request_action(request) == "project.export"):
        project_id = request.path_params.get("project_id")
        event = PlatformEvent(eventName="request."+_request_action(request), eventClass="security", actorId=actor.actorId,
            installationId=actor.installationId, deploymentMode="team", projectId=project_id, metadata={"method": request.method})
        with storyboard_transaction():
            DurableEventSink(project_path(project_id) if project_id else ROOT).record(event)
    return response


app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins(),
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
    selected = installation_policy(LocalIdentityDirectory(ROOT))
    context = ActorContext(actorId="system-service", actorDisplayName="Chimera service", installationId=public_origin(), deploymentMode="team") if selected.deploymentMode == "team" else LOCAL_ACTOR
    token = REQUEST_ACTOR.set(context)
    try:
        recover_enhancement_jobs()
        recover_media_generation_jobs()
    finally:
        REQUEST_ACTOR.reset(token)


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


def _password_store() -> AccountStore:
    if installation_policy(LocalIdentityDirectory(ROOT)).identityProvider != "builtin":
        raise HTTPException(404, "Password sign-in is not enabled")
    return AccountStore(ROOT)


@app.get("/api/auth/config")
def auth_config() -> dict[str, str | bool]:
    selected = installation_policy(LocalIdentityDirectory(ROOT))
    return {"deploymentMode": selected.deploymentMode, "identityProvider": selected.identityProvider,
        "passwordLoginAvailable": selected.identityProvider == "builtin"}


@app.post("/api/auth/login")
def login(data: LoginRequest, request: Request) -> JSONResponse:
    store = _password_store()
    require_origin(request)
    token = store.login(data.email, data.password.get_secret_value(), request.client.host if request.client else "unknown", request.cookies.get(COOKIE))
    response = JSONResponse({"authenticated": True}, headers={"Cache-Control": "no-store"})
    response.set_cookie(COOKIE, token, max_age=SESSION_SECONDS, httponly=True, secure=True, samesite="strict", path="/")
    return response


@app.post("/api/auth/logout")
def logout(request: Request) -> JSONResponse:
    store = _password_store()
    require_origin(request)
    store.logout(request.cookies.get(COOKIE))
    response = JSONResponse({"authenticated": False}, headers={"Cache-Control": "no-store"})
    response.delete_cookie(COOKIE, path="/", secure=True, httponly=True, samesite="strict")
    return response


@app.post("/api/auth/reset-password")
def reset_password(data: ResetPasswordRequest, request: Request) -> dict[str, bool]:
    store = _password_store()
    require_origin(request)
    store.reset_password(data.token.get_secret_value(), data.password.get_secret_value())
    return {"reset": True}


@app.get("/api/accounts")
def get_accounts() -> list[dict]:
    return _password_store().accounts()


def _identity_directory():
    local = LocalIdentityDirectory(ROOT)
    return AccountStore(ROOT) if installation_policy(local).identityProvider == "builtin" else local


@app.get("/api/identity/context", response_model=IdentitySnapshot)
def get_identity_context(context: Annotated[ActorContext, Depends(resolve_actor_context)]) -> IdentitySnapshot:
    snapshot = LocalIdentityDirectory(ROOT).snapshot()
    policy = installation_policy(LocalIdentityDirectory(ROOT))
    if policy.identityProvider == "builtin":
        from .identity import Membership, TeamRecord, UserRecord
        return IdentitySnapshot(actor=context, user=UserRecord(id=context.actorId, displayName=context.actorDisplayName),
            teams=[TeamRecord(id=context.installationId, name="Hosted workspace")],
            memberships=[Membership(userId=context.actorId, teamId=context.installationId, role=role) for role in sorted(AccountStore(ROOT).roles_for(context.actorId))], policy=policy)
    return snapshot


@app.get("/api/identity/policy", response_model=OrganizationPolicy)
def get_identity_policy() -> OrganizationPolicy:
    return installation_policy(LocalIdentityDirectory(ROOT))


@app.get("/api/installation/config", response_model=OrganizationPolicy)
def get_installation_config() -> OrganizationPolicy:
    return installation_policy(LocalIdentityDirectory(ROOT))


@app.patch("/api/identity/policy", response_model=OrganizationPolicy)
def patch_identity_policy(
    policy_data: OrganizationPolicy,
    context: Annotated[ActorContext | None, Depends(resolve_actor_context)] = None,
    policy: Annotated[AuthorizationPolicy | None, Depends(get_authorization_policy)] = None,
) -> OrganizationPolicy:
    actor = context or LOCAL_ACTOR
    if installation_policy(LocalIdentityDirectory(ROOT)).identityProvider == "builtin":
        raise HTTPException(409, "Hosted installation choices are operator-managed")
    _require_action(policy or get_authorization_policy(), actor, "admin.policy.manage")
    return LocalIdentityDirectory(ROOT).update_policy(policy_data)


@app.get("/api/projects/{project_id}/members", response_model=list[ProjectMembership])
def get_project_members(project_id: str) -> list[ProjectMembership]:
    try:
        read_project(project_id)
        return _identity_directory().project_memberships(project_id)
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
        return _identity_directory().add_project_membership(ProjectMembership(projectId=project_id, **data.model_dump()))
    except FileNotFoundError as error:
        raise HTTPException(status_code=404, detail="Project not found") from error
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error


@app.delete("/api/projects/{project_id}/members/{user_id}")
def delete_project_member(project_id: str, user_id: str) -> dict[str, bool]:
    _password_store().remove_membership(project_id, user_id)
    return {"removed": True}


@app.get("/api/projects/{project_id}/permissions")
def get_project_permissions(project_id: str) -> dict[str, bool]:
    policy = get_authorization_policy()
    actor = get_actor_context()
    return {name: policy.allows(actor, action, project_id) for name, action in {
        "canEdit": "scene.manage", "canExport": "project.export", "canManageMembers": "project.membership.manage",
        "canShare": "review.share", "canEnhance": "enhancement.job.create", "canApprove": "enhancement.proposal.decide"}.items()}


@app.post("/api/projects/{project_id}/review-links", status_code=201)
def create_review_link(project_id: str, data: ReviewInvitationRequest) -> dict:
    if installation_policy(LocalIdentityDirectory(ROOT)).reviewAccess != "authenticated":
        raise HTTPException(409, "Authenticated external review is not enabled for this installation")
    try:
        project = read_project(project_id)
        return _password_store().issue_review(project_id, data.userId, project.storyboard.revision, data.expiresHours)
    except FileNotFoundError as error:
        raise HTTPException(404, "Project not found") from error
    except ValueError as error:
        raise HTTPException(422, str(error)) from error


@app.delete("/api/projects/{project_id}/review-links/{invite_id}")
def revoke_review_link(project_id: str, invite_id: str) -> dict[str, bool]:
    _password_store().revoke_review(project_id, invite_id)
    return {"revoked": True}


@app.get("/api/projects/{project_id}/review-links")
def get_review_links(project_id: str) -> list[dict]:
    return _password_store().review_links(project_id)


@app.post("/api/reviews/access", response_model=ProjectDetail)
def access_review(request: Request, token: Annotated[str, Header(alias="X-Review-Token")]) -> ProjectDetail:
    if installation_policy(LocalIdentityDirectory(ROOT)).reviewAccess != "authenticated":
        raise HTTPException(404, "External review is not enabled")
    invite = _password_store().review_for_token(token, resolve_actor_context(request).actorId)
    try:
        project = read_project(invite["projectId"])
    except FileNotFoundError as error:
        raise HTTPException(404, "Project not found") from error
    if project.storyboard.revision != invite["revision"]:
        raise HTTPException(409, "The storyboard has changed; request a new review link")
    return project


@app.get("/api/management/project-health")
def get_project_health() -> list[dict[str, object]]:
    health: list[dict[str, object]] = []
    for summary in get_projects():
        project = read_project(summary.id)
        authoring = validate_project(project, target="authoring")
        production = validate_project(project, target="production")
        comments = list_review_comments(summary.id)
        proposals = list_enhancement_proposals(summary.id)
        blockers = [issue for issue in production.issues if issue.severity == "error"]
        blocker_counts: dict[str, int] = {}
        for issue in blockers:
            blocker_counts[issue.code] = blocker_counts.get(issue.code, 0) + 1
        health.append({
            "projectId": summary.id,
            "title": summary.title,
            "revision": project.storyboard.revision,
            "sceneCount": summary.sceneCount,
            "pendingProposals": sum(proposal.status == "pending" for proposal in proposals),
            "unresolvedComments": sum(not comment.resolved for comment in comments),
            "publicationBlockers": sum(issue.severity == "error" for issue in production.issues),
            "authoringWarnings": sum(issue.severity == "warning" for issue in authoring.issues),
            "productionStage": project.productionStage,
            "productionPassed": production.passed,
            "blockerCounts": blocker_counts,
            "blockers": [issue.model_dump() for issue in blockers],
            "canEdit": get_authorization_policy().allows(get_actor_context(), "scene.manage", summary.id),
            "canSetStage": get_authorization_policy().allows(get_actor_context(), "project.settings.update", summary.id),
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
    return read_audit_events(ROOT, project_id, offset, limit)


@app.get("/api/projects", response_model=list[ProjectSummary])
def get_projects() -> list[ProjectSummary]:
    actor = get_actor_context()
    policy = get_authorization_policy()
    return [project for project in list_projects() if policy.allows(actor, "project.view", project.id)]


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
    with storyboard_transaction():
        project = create_project(data, actor)
        if installation_policy(LocalIdentityDirectory(ROOT)).identityProvider == "builtin":
            AccountStore(ROOT).add_project_membership(ProjectMembership(projectId=project.id, userId=actor.actorId, role="instructional-designer"))
    return project


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


@app.patch("/api/projects/{project_id}/production-stage", response_model=ProjectDetail)
def patch_project_production_stage(project_id: str, data: ProductionStageUpdate) -> ProjectDetail:
    try:
        return update_project_production_stage(project_id, data)
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
    if actor.deploymentMode == "team":
        data = data.model_copy(update={"authorLabel": actor.actorDisplayName})
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
    if actor.deploymentMode == "team":
        data = data.model_copy(update={"authorLabel": actor.actorDisplayName})
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


def _require_ai_origin(request: Request) -> None:
    policy = installation_policy(LocalIdentityDirectory(ROOT))
    allowed = {public_origin()} if policy.deploymentMode == "team" else set(cors_origins())
    if request.headers.get("origin") not in allowed:
        raise HTTPException(403, "Request origin is not allowed")


def _record_ai_event(name: str) -> None:
    actor = get_actor_context()
    DurableEventSink(ROOT).record(PlatformEvent(eventName=name, eventClass="security", actorId=actor.actorId, installationId=actor.installationId, deploymentMode=actor.deploymentMode))


@app.get("/api/ai-connection")
def get_ai_connection() -> dict:
    return {**connection_status(ROOT), "canManage": get_authorization_policy().allows(get_actor_context(), "admin.policy.manage")}


@app.put("/api/ai-connection")
def put_ai_connection(request: Request, data: ConnectionUpdate) -> dict:
    _require_ai_origin(request)
    try:
        with storyboard_transaction():
            save_connection(ROOT, data)
            _record_ai_event("ai.connection_saved")
        return get_ai_connection()
    except ValueError as error:
        raise HTTPException(409, str(error)) from error
    except RuntimeError as error:
        raise HTTPException(503, str(error)) from error


@app.post("/api/ai-connection/disconnect")
def post_ai_disconnect(request: Request, data: ConnectionRevision) -> dict:
    _require_ai_origin(request)
    try:
        with storyboard_transaction():
            disconnect_connection(ROOT, data.expectedRevision)
            _record_ai_event("ai.connection_disconnected")
        return get_ai_connection()
    except ValueError as error:
        raise HTTPException(409, str(error)) from error
    except RuntimeError as error:
        raise HTTPException(503, str(error)) from error


@app.post("/api/ai-connection/test")
def post_ai_test(request: Request, data: ConnectionRevision) -> dict:
    _require_ai_origin(request)
    try:
        if connection_status(ROOT)["revision"] != data.expectedRevision:
            raise ValueError("The connection settings changed. Reload before testing.")
        result = test_connection(ROOT)
        _record_ai_event("ai.connection_tested")
        return result
    except ValueError as error:
        raise HTTPException(409, str(error)) from error
    except RuntimeError as error:
        raise HTTPException(503, str(error)) from error


@app.get("/api/projects/{project_id}/media-generation-capability")
def get_media_generation_capability(project_id: str) -> dict[str, bool]:
    try:
        read_project(project_id)
    except FileNotFoundError as error:
        raise HTTPException(status_code=404, detail="Project not found") from error
    return {
        "providerConfigured": media_provider_configured(),
        "canGenerate": get_authorization_policy().allows(get_actor_context(), "media.job.create", project_id),
    }


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


@app.post("/api/projects/{project_id}/scenes/{scene_id}/extract-layout", response_model=ProjectDetail)
def extract_scene_layout(project_id: str, scene_id: str, if_match: Annotated[str | None, Header()] = None) -> ProjectDetail:
    from .storage import write_storyboard

    try:
        current = read_project(project_id)
        expected = _expected_revision(if_match) or current.storyboard.revision
        _check_expected_revision(expected, current.storyboard.revision)
        scene = next((item for item in current.storyboard.scenes if item.id == scene_id), None)
        if scene is None:
            raise HTTPException(status_code=404, detail="Scene not found")
        if scene.visualLayout is not None:
            return current
        source = project_path(project_id) / "original" / "source-deck.pptx"
        if not source.is_file() or scene.sourceSlide is None:
            raise HTTPException(status_code=422, detail="This scene has no retained PowerPoint source")
        with tempfile.TemporaryDirectory(prefix=".layout-", dir=project_path(project_id)) as directory:
            staging = Path(directory)
            extracted, assets = extract_presentation(source, staging)
            source_scene = next((item for item in extracted if item.sourceSlide == scene.sourceSlide), None)
            if source_scene is None or source_scene.visualLayout is None:
                raise HTTPException(status_code=422, detail="Source slide is not available")
            layout = source_scene.visualLayout.model_copy(deep=True)
            slide_text = [element for element in layout.elements if element.kind == "text" and element.source == "slide"]
            current_text = [scene.title, *scene.extractedText]
            if len(slide_text) == len(current_text):
                for element, text in zip(slide_text, current_text):
                    element.text = text
            elif current_text != [source_scene.title, *source_scene.extractedText]:
                layout.elements = [element for element in layout.elements if element.kind != "text" or element.source != "slide"]
                from .models import SceneElement
                layout.elements.append(SceneElement(id="preserved-text", kind="text", x=40, y=40, width=layout.width - 80, height=max(40, layout.height - 80), text="\n".join(current_text)))
                layout.warnings.append("Existing text edits were preserved in a combined text box.")
            updated_scene = scene.model_copy(update={"visualLayout": layout, "backgroundAsset": layout.backgroundAsset, "imageAssets": list(dict.fromkeys([*scene.imageAssets, *source_scene.imageAssets]))})
            needed = {element.assetId for element in layout.elements if element.kind == "image"}
            needed.update(source_scene.imageAssets)
            if layout.backgroundAsset:
                needed.add(layout.backgroundAsset)
            imported_assets = [asset for asset in assets if asset.id in needed]
            merged_assets = {asset.id: asset for asset in imported_assets}
            merged_assets.update({asset.id: asset for asset in current.storyboard.assets})
            storyboard = current.storyboard.model_copy(update={"scenes": [updated_scene if item.id == scene_id else item for item in current.storyboard.scenes], "assets": list(merged_assets.values())})
            with storyboard_transaction():
                _check_expected_revision(expected, read_project(project_id).storyboard.revision)
                persist_imported_assets(project_id, staging, imported_assets)
                write_storyboard(project_path(project_id), storyboard, expected)
            return read_project(project_id)
    except StoryboardRevisionConflict as error:
        raise _revision_conflict(error) from error
    except FileNotFoundError as error:
        raise HTTPException(status_code=404, detail="Project not found") from error
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error


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
