# Chimera backend

Authentication profiles, hosted sign-in/recovery, project membership, and authenticated review links are documented in the [deployment guide](../docs/authentication-deployments.md). Set `CHIMERA_DEPLOYMENT_PROFILE=networked` for password authentication, or `encarta` for the intentionally disabled integration profile. Unimplemented providers never fall back to local identity. The hosted frontend and local HTTPS qualification are implemented; real Linux/Nginx server qualification awaits the deferred connection details.

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

The API stores projects under `workspace/projects` by default. Set `CHIMERA_WORKSPACE` to use another location.

### Pythia Sprint 1 integration

The Chimera repository pins [`Darkkeep/pythia-contracts`](https://github.com/Darkkeep/pythia-contracts) `v1.0.0` as the `vendor/pythia-contracts` Git submodule. Contract tests require this checkout and validate generated requests and returned drafts against its schemas. Initialize it with `git submodule update --init --recursive` after cloning. The Pythia Engine API base URL is configured on the Chimera backend with `CHIMERA_PYTHIA_BASE_URL` and defaults to `http://localhost:8000`. The adapter exposes health/capability discovery, task submission, polling/cancellation, and validated draft artifact retrieval. Its browser entry point never receives the Pythia URL or credential. If Pythia client authentication is enabled, configure `CHIMERA_PYTHIA_API_KEY` in the Chimera backend environment; the adapter sends it as a Bearer credential and in the legacy `X-Pythia-API-Key` header. Never place this secret in frontend source or browser storage. Run the contract tests with `python -m pytest backend/tests/test_learning_intelligence.py` from the repository root.

Chimera's local API also uses port 8000. To run both services on one workstation, start Pythia on port 8001 and set `$env:CHIMERA_PYTHIA_BASE_URL = "http://localhost:8001"` in the Chimera backend environment before startup. See the [Sprint 1 handoff](../docs/pythia-sprint-1-handoff.md) for the task and artifact contracts.

Rendered slide previews require LibreOffice. Windows users can extract LibreOffice Portable into `tools/LibreOfficePortable` at the repository root without a system installation; Chimera detects `App/libreoffice/program/soffice.exe` there automatically. Alternatively, set `CHIMERA_LIBREOFFICE_PATH` to the full executable path before starting the backend. Discovery prefers that explicit setting, then the project portable copy, then `PATH` and standard Windows installation folders. An invalid explicit setting disables discovery rather than silently selecting a different installation. See the root README for portable setup. If LibreOffice is unavailable, PPTX import still extracts slide content and reports that previews could not be generated.

Enhancement references accept PDF, DOCX, PPTX, TXT, and Markdown files up to 25 MB. Originals and extracted page/slide/paragraph/line passages are stored as versioned project references, separately from learner media. Scanned PDFs without extractable text are marked as failed and cannot be selected for a grounded enhancement run; OCR is not currently provided.

Enhancement jobs are persisted under each project and resume queued or interrupted work when the API starts. Jobs snapshot the storyboard revision and exact reference versions; a changed storyboard prevents proposal creation. Jobs can be cancelled and retried. They create pending proposals only; only the existing author decision endpoint can apply a proposal.

**Settings > Media generation connection** is only for the temporary production image/audio adapters. It is not used for text reasoning. Enhancement and other learning-intelligence work is submitted to Pythia. Configure `CHIMERA_PYTHIA_BASE_URL` on the backend and, when Engine authentication is enabled, set the matching `CHIMERA_PYTHIA_API_KEY` server-side. The browser never receives this credential. See [AI connection](../docs/ai-connection.md) for the media adapter's OS credential-store and deployment restrictions.

For the temporary media adapters only, configure these environment variables on the API server. Do not put credentials in frontend source or browser storage:

```powershell
$env:CHIMERA_AI_BASE_URL = "https://your-provider.example/v1"
$env:CHIMERA_AI_API_KEY = "your-secret-key"
$env:CHIMERA_AI_MODEL = "your-structured-output-model"
$env:CHIMERA_AI_PROVIDER = "provider-label"
$env:CHIMERA_AI_INPUT_USD_PER_MILLION = "0.50"
```

The adapter uses an OpenAI-compatible chat-completions endpoint with JSON output. Saved settings override environment configuration; disconnect blocks environment fallback until a new connection is saved. Text and media providers share connection resolution. Submitted jobs record a connection revision, not credentials: a changed connection requires queued work to be resubmitted, while an already-running request retains its captured connection. Redirects are rejected. Daily request counts are durable and concurrency is bounded within one API process; use a single-worker deployment. Request limits are not a spending budget. Cost estimates remain input-only; set provider-account spending controls separately. Without provider settings, authors can inspect the submission preview but cannot submit. Keep anonymous local operation bound to loopback; shared use requires the hosted authentication profile.

Platform tracking is controlled by `CHIMERA_EVENT_TRACKING_MODE`: `local` (the default) retains classified events in each project's `audit/events.jsonl`, `centralized` also queues events in `audit/event-queue.jsonl` for delivery by the configured tracking adapter, and `disabled` suppresses product events while retaining audit events. Set `CHIMERA_EVENT_TRACKING_URL` for the centralized service endpoint and use the delivery adapter's bounded retry policy. Tracking is not required for authoring, review, or export.

Scene edits are saved to `storyboard.json`; each update archives the previous storyboard under the project's `history` directory.
Scene action descriptions are stored separately from speaker notes and are included in storyboard JSON export.

PowerPoint scene templates are stored under `workspace/templates` (or the configured `CHIMERA_WORKSPACE`) and can be uploaded, renamed/described, or replaced with a revised PPTX in the UI. Scene ordering and template references are saved in each project's storyboard.

Project media uploads support JPG, PNG, GIF, WebP, MP3, M4A, AAC, WAV, and OGG files up to 100 MB. Media files are stored under each project's `assets` directory and scene references are stored in `storyboard.json`.

Each media asset has attribution text and a `draft` or `complete` status. Draft attribution is allowed during authoring. Production readiness is checked with `GET /api/projects/{project_id}/validation?target=production`; it fails until every media asset has non-empty attribution text and `complete` status. SCORM packages can be built for SCORM 2004 and 1.2. Local browser qualification covers both profiles; Blackboard verification is documented for SCORM 2004 only. See `docs/scorm-compatibility-checklist.md` for details.

Project mutation requests from the authoring UI include `If-Match: "<revision>"`, using the storyboard revision returned in each project response. Stale writes return `412 Precondition Failed` and include the current revision in the `ETag` header. The header remains optional for legacy API clients.

Scenes can be deleted with `DELETE /api/projects/{project_id}/scenes/{scene_id}`. Deletion archives the prior storyboard; remediation links targeting the removed scene are cleared in the same revision-checked save.

SCORM package assembly and report persistence serialize with storyboard writes, and a build is rejected if its captured revision changes. The workspace uses a filesystem lock to coordinate processes sharing that workspace; all API workers must use the same reliable local filesystem.

Editable Word storyboard exports are available at `GET /api/projects/{project_id}/storyboard-sme.docx` and `/api/projects/{project_id}/storyboard-full.docx`. SME Master uses editable landscape scene pages proportioned and organized to match `Visual_Slide_Storyboard_Template.pptx`; Full starts from `Multimedia_Instructional_Storyboard_Template.docx`, includes those SME pages in a landscape section, and adds detailed scene records in portrait. Attached image assets appear as compact thumbnails in their identifying Media-table rows. Both use `?include_answer_key=true` only when an authoring copy should contain answers; keys are excluded by default. The legacy `/storyboard.docx` endpoint remains available.

The local identity directory is exposed at `GET /api/identity/context`. It materializes the single-user actor, installation, team, and all supported platform roles. Team authentication and membership management can replace this directory without changing storyboard or export records.

Actor resolution is behind the `IdentityProvider` adapter in `backend/app/auth.py`. Local single-user and built-in hosted account authentication are implemented; no fake login or insecure header-based authentication is enabled. Encarta is an explicit fail-closed provider and requires a real token/claims validation implementation. OIDC, SAML, or another enterprise provider can use the same adapter contract.

Management contracts include `GET/PATCH /api/identity/policy`, project membership routes, and `GET /api/management/project-health`. Hosted project access and account administration are implemented; Encarta and multi-organisation hosting remain separate scope. Health exposes categorized blockers, findings, readiness, and stage/edit permissions. `PATCH /api/projects/{project_id}/production-stage` persists a manual workflow label in project metadata without revising the storyboard or certifying approval/publication.

Installation choices are represented by `OrganizationPolicy` and exposed read-only at `GET /api/installation/config`. An installation workflow should collect identity provider, tenancy, user provisioning, tracking mode, analytics identity, review access, administrator content visibility, audit retention, and data residency before enabling team mode. The local default is single-user, local identity, single organization, invitation provisioning, local tracking, no external review, and local data residency. These choices are persisted with the identity directory rather than inferred from individual projects.

The first management read models are `GET /api/management/my-work` and `GET /api/management/audit?offset=0&limit=100`. My Work summarizes local project health, pending approvals, unresolved comments, and publication blockers. Audit access is bounded and policy-controlled; malformed event lines are skipped rather than breaking the management view.

`GET /api/ai-connection` returns safe status/models/limits and management permission. `PUT /api/ai-connection`, `POST /api/ai-connection/test`, and `POST /api/ai-connection/disconnect` require installation-administrator authority in shared deployments and an allowed request origin. Validation errors redact submitted secrets. `GET /api/projects/{project_id}/media-generation-capability` supplies provider configuration and generation permission without credentials. Installation metadata and usage counters live under `identity`; OS credentials are outside project archives.
