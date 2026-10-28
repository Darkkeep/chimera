# Single-User Deployment Checklist

Use this checklist for a repeatable local demonstration. Built-in hosted accounts are implemented separately; Encarta remains fail-closed until its integration contract is supplied.

## Current qualification - 2026-10-15

Use the [completion execution record](completion-update-2026-10-15.md) for this update. Earlier records below remain historical: representative SCORM 1.2 LMS acceptance is complete by operator attestation, including the October 14 retry replacement; ordinary interactive Writer acceptance remains distinct. Video/shared media/OCR and resume budgets are described in [media placement and OCR](media-placement-and-ocr.md) and [resume policy](resume-data-policy.md). Hosted deployment is deferred by owner instruction for this update.

## Install

- [ ] Python 3.11+ is installed.
- [ ] Node.js and npm are installed.
- [ ] LibreOffice is installed if rendered slide previews are required.
- [ ] The workspace directory is writable.
- [ ] No provider credentials are stored in frontend files or project exports.
- [ ] Backend requirements include `keyring`; a supported, unlocked OS credential store is available to the API account if browser-based AI connection saves will be used. Otherwise use protected server environment configuration.
- [ ] If Google narration is needed, its Text-to-Speech API/billing and server ADC are provisioned for the backend account. No Google private key is uploaded through Chimera.
- [ ] Provider environment secrets, if used, are injected into the backend only; Shotstack sandbox and production use different keys. See [provider setup](ai-connection.md#provider-tabs).

## Start

```powershell
cd backend
..\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

In a second terminal:

```powershell
cd frontend
npm run dev
```

Open `http://127.0.0.1:5173/`.

The repeatable API/artifact check can be run from the repository root:

```powershell
.\scripts\verify-single-user.ps1 -ProjectId testframe-565c5da8
```

It verifies health, installation mode, project loading, production validation, backup manifest integrity, Word artifact size, and the expected SCORM validation gate.

## Verify the installation

- [ ] `GET /api/health` returns `{"status":"ok"}`.
- [ ] `GET /api/installation/config` reports `single-user` and `local` identity.
- [ ] The browser opens My Work after launch/refresh; New Project opens creation, project rows open authoring, and Resume authoring returns to the remembered course.
- [ ] My Work displays compact identity/policy, categorized blockers, and explicit production stages without treating validation readiness as approval.
- [ ] Project health scrolls at five projects; Recent activity starts collapsed and scrolls when expanded.
- [ ] Media Library defaults its project selector to the current course; switching projects retains the library view and Add media targets that project.
- [ ] Create a media candidate starts collapsed and is greyed/disabled without configured AI or generation permission.
- [ ] Settings > AI connection shows safe status. Save/test/disconnect use the local operator's permissions; credentials are never returned to the browser. Tests use inert credentials unless the operator explicitly approves a live-provider check.
- [ ] All six provider tabs are reachable by mouse and keyboard and confirm before discarding unsaved changes. Pythia diagnostics remain separate under **Settings > Pythia**.
- [ ] Only configured speech connections with a saved voice are offered for narration. Narration-only setup does not enable images; Synthesia/Shotstack setup does not enable generation of any media.
- [ ] Synthesia/Shotstack tabs state that video generation is not yet available. Their tests read metadata without creating a video/render; successful testing is not a generation-quality or entitlement certification.
- [ ] Narration generation requires explicit connection selection and candidate review/approval. Disconnecting/removing a connection does not silently route regeneration to another provider.
- [ ] **User guide**, below Templates, opens the bundled PDF even with no selected project. Review the current [guide](user-guide.md#configure-media-connections) before a provider demonstration.
- [ ] Provider-account spending controls and data-handling approval are in place before AI use; request caps are not currency budgets.
- [ ] Preview opens and can navigate scenes without the backend learner runtime.
- [ ] Review comments can be created, replied to, resolved, and reopened.
- [ ] JSON export and Chimera storyboard archive can be created and restored into a clean workspace.
- [ ] Word export downloads an editable document.
- [ ] SCORM 2004 and 1.2 exports succeed only after production validation passes.
- [ ] Export reports and known LMS limitations are recorded.

## Verification record: 2026-09-30

- [x] API health returned `ok`; installation configuration reported `single-user`, local identity, local tracking, and local residency.
- [x] Python 3.14.5, Node.js, and npm were available. LibreOffice was not available on `PATH`.
- [x] The browser opened `TestFrame`, loaded 28 scenes, entered Preview, navigated from scene 1 to scene 2, created a review comment, and resolved it without UI errors.
- [x] Chimera storyboard downloaded successfully for `TestFrame`; its manifest contained the source revision, project files, audit events, history, and SHA-256 hashes.
- [x] Editable Word export downloaded successfully for `TestFrame`; structural inspection found 187 paragraphs, 29 tables, 1 embedded image, scene 28, and the storyboard revision. Answer keys were absent by default.
- [x] Backup round-trip and invalid-archive safety tests passed.
- [x] Recorded SCORM 1.2 and SCORM 2004 release archives passed manifest, packaged-reference, and runtime-profile checks; both reports were `passed-with-warnings`.
- [x] Fresh SCORM requests correctly enforced the production gate and returned HTTP 422 for incomplete attribution on `UncySam2.png`.
- [ ] Rendered Word pagination and ordinary editing inspection require Word or LibreOffice.
- [ ] Blackboard/LMS SCORM 1.2 qualification remains external; Blackboard evidence currently covers SCORM 2004 only.

## Verification follow-up: 2026-10-07

The My Work, Media Library, and AI connection changes passed 123 backend tests, 56 Chromium workflow tests, the frontend production build, and scoped light/dark desktop/mobile accessibility checks. Live Windows checks confirmed secure credential-store availability and the New Project dialog without saving a real API key, making an external AI request, or creating test projects in the user's workspace. The Evidence Before Impact storyboard proof was approved for illustrative use only, not production release. See [current work](current-work.md).

## Verification follow-up: 2026-10-08

The editable SME Master and Full Word storyboard templates were rendered with LibreOffice; landscape SME pages, portrait Full-template pages, and their section order were inspected. Media images now appear as compact row thumbnails. Interactive editing of the generated documents in Word/Writer remains unverified. The attribution-gate result recorded above is historical: pending image attribution now warns without blocking export, while audio attribution and missing media files remain blockers. See [current work](current-work.md) for the scheduled policy review.

## Team Mode boundary

Portable LibreOffice was extracted and verified on 2026-10-06: real PPTX rendering, visual inspection of the 34-page Word PDF, and an automated editable DOCX round trip passed. See the [verification record](portable-libreoffice-verification.md). Interactive Word editing and SCORM 1.2 LMS qualification remain separate checks.

Follow-up on 2026-10-06: the user confirmed SCORM 1.2 passes their LMS; SCORM 2004 is unsupported there. Extended Word checks passed for the current 35-page export, long-text/Unicode rendering, and paragraph/table edits retained through a DOCX round trip. Interactive Writer editing remains unverified because automatic approval review blocked launching Writer.

Do not select Team Mode for a demonstration deployment. Encarta is intentionally fail-closed until its token validation, claims mapping, tenant mapping, logout/session behavior, and failure contract are implemented against the real Encarta integration.
