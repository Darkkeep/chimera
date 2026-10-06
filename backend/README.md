# Chimera backend

Authentication profiles and built-in hosted sign-in/session APIs are documented in the [deployment guide](../docs/authentication-deployments.md). Set `CHIMERA_DEPLOYMENT_PROFILE=darkrogue` for the password-authentication backend foundation, or `encarta` for the intentionally disabled integration profile. Unimplemented providers never fall back to local identity. Hosted frontend login and project-scoped membership remain follow-up work.

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

The API stores projects under `workspace/projects` by default. Set `CHIMERA_WORKSPACE` to use another location.

Rendered slide previews require LibreOffice. Windows users can extract LibreOffice Portable into `tools/LibreOfficePortable` at the repository root without a system installation; Chimera detects `App/libreoffice/program/soffice.exe` there automatically. Alternatively, set `CHIMERA_LIBREOFFICE_PATH` to the full executable path before starting the backend. Discovery prefers that explicit setting, then the project portable copy, then `PATH` and standard Windows installation folders. An invalid explicit setting disables discovery rather than silently selecting a different installation. See the root README for portable setup. If LibreOffice is unavailable, PPTX import still extracts slide content and reports that previews could not be generated.

Enhancement references accept PDF, DOCX, PPTX, TXT, and Markdown files up to 25 MB. Originals and extracted page/slide/paragraph/line passages are stored as versioned project references, separately from learner media. Scanned PDFs without extractable text are marked as failed and cannot be selected for a grounded enhancement run; OCR is not currently provided.

Enhancement jobs are persisted under each project and resume queued or interrupted work when the API starts. Jobs snapshot the storyboard revision and exact reference versions; a changed storyboard prevents proposal creation. Jobs can be cancelled and retried. They create pending proposals only; only the existing author decision endpoint can apply a proposal.

To enable provider submission, configure these environment variables on the API server, never in frontend settings:

```powershell
$env:CHIMERA_AI_BASE_URL = "https://your-provider.example/v1"
$env:CHIMERA_AI_API_KEY = "your-secret-key"
$env:CHIMERA_AI_MODEL = "your-structured-output-model"
$env:CHIMERA_AI_PROVIDER = "provider-label"
$env:CHIMERA_AI_INPUT_USD_PER_MILLION = "0.50"
```

The adapter uses an OpenAI-compatible chat-completions endpoint with JSON output. Cost is an approximate input-only estimate based on payload length and the optional configured input rate; provider-specific usage and output costs are not yet reported. Without provider settings, authors can inspect the exact submission preview but cannot submit a run. The backend currently executes jobs in daemon worker threads and persists enough state for restart recovery; use one API deployment over the shared workspace and do not expose this unauthenticated development API to untrusted users.

Platform tracking is controlled by `CHIMERA_EVENT_TRACKING_MODE`: `local` (the default) retains classified events in each project's `audit/events.jsonl`, `centralized` also queues events in `audit/event-queue.jsonl` for delivery by the configured tracking adapter, and `disabled` suppresses product events while retaining audit events. Set `CHIMERA_EVENT_TRACKING_URL` for the centralized service endpoint and use the delivery adapter's bounded retry policy. Tracking is not required for authoring, review, or export.

Scene edits are saved to `storyboard.json`; each update archives the previous storyboard under the project's `history` directory.
Scene action descriptions are stored separately from speaker notes and are included in storyboard JSON export.

PowerPoint scene templates are stored under `workspace/templates` (or the configured `CHIMERA_WORKSPACE`) and can be uploaded, renamed/described, or replaced with a revised PPTX in the UI. Scene ordering and template references are saved in each project's storyboard.

Project media uploads support JPG, PNG, GIF, WebP, MP3, M4A, AAC, WAV, and OGG files up to 100 MB. Media files are stored under each project's `assets` directory and scene references are stored in `storyboard.json`.

Each media asset has attribution text and a `draft` or `complete` status. Draft attribution is allowed during authoring. Production readiness is checked with `GET /api/projects/{project_id}/validation?target=production`; it fails until every media asset has non-empty attribution text and `complete` status. SCORM packages can be built for SCORM 2004 and 1.2. Local browser qualification covers both profiles; Blackboard verification is documented for SCORM 2004 only. See `docs/scorm-compatibility-checklist.md` for details.

Project mutation requests from the authoring UI include `If-Match: "<revision>"`, using the storyboard revision returned in each project response. Stale writes return `412 Precondition Failed` and include the current revision in the `ETag` header. The header remains optional for legacy API clients.

Scenes can be deleted with `DELETE /api/projects/{project_id}/scenes/{scene_id}`. Deletion archives the prior storyboard; remediation links targeting the removed scene are cleared in the same revision-checked save.

SCORM package assembly and report persistence serialize with storyboard writes, and a build is rejected if its captured revision changes. The workspace uses a filesystem lock to coordinate processes sharing that workspace; all API workers must use the same reliable local filesystem.

Editable Word storyboard export is available at `GET /api/projects/{project_id}/storyboard.docx`. Add `?include_answer_key=true` only when an authoring copy should contain answer keys; they are excluded by default. The DOCX records the source revision and includes editable scene content, authoring notes, assessment specifications, media references, image previews, accessibility text, and attribution.

The local identity directory is exposed at `GET /api/identity/context`. It materializes the single-user actor, installation, team, and all supported platform roles. Team authentication and membership management can replace this directory without changing storyboard or export records.

Actor resolution is behind the `IdentityProvider` adapter in `backend/app/auth.py`. The active implementation is local-only; no fake login or insecure header-based authentication is enabled. Encarta is scaffolded as an explicit fail-closed Team Mode provider; it requires `CHIMERA_ENCARTA_URL` and a real Encarta token/claims validation implementation before it can authenticate requests. OIDC, SAML, or another enterprise provider can use the same adapter contract.

Local management contracts are available at `GET/PATCH /api/identity/policy`, `GET/POST /api/projects/{project_id}/members`, and `GET /api/management/project-health`. They provide the single-user foundation for organization policy, project membership, and project health; team authentication and centralized administration remain future adapters.

Installation choices are represented by `OrganizationPolicy` and exposed read-only at `GET /api/installation/config`. An installation workflow should collect identity provider, tenancy, user provisioning, tracking mode, analytics identity, review access, administrator content visibility, audit retention, and data residency before enabling team mode. The local default is single-user, local identity, single organization, invitation provisioning, local tracking, no external review, and local data residency. These choices are persisted with the identity directory rather than inferred from individual projects.

The first management read models are `GET /api/management/my-work` and `GET /api/management/audit?offset=0&limit=100`. My Work summarizes local project health, pending approvals, unresolved comments, and publication blockers. Audit access is bounded and policy-controlled; malformed event lines are skipped rather than breaking the management view.
