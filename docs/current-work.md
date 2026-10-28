# Current work and handoff

Updated 2026-10-27. The active development branch is `feature/manteion-pythia-interoperability`.

## October 27 authored-scene workflow and guide refresh

The [authored-scene workflow](authored-scene-workflow.md) supersedes earlier descriptions of Rendering mode, disabled imported layouts, and source/extracted preview selection. Stage, storyboard, course preview, standalone/SCORM, and Word visuals use one authored composition. Compare with original is temporary; templates apply to a draft with Undo/Redo; project backgrounds import directly and propagate through inheritance while explicit scene exceptions remain.

Legacy preparation is revision-guarded, idempotent, and recorded in storyboard history. Both local Test Flight projects were backed up and prepared after copy-based checks preserved all 16 scenes and original source bytes. Local checks recorded 114 targeted backend tests, 30 cross-browser checks, final preview-order checks, and all-scene editor/storyboard/course-preview parity. These are local engineering checks, not a new full release, live-provider, hosted, or target-LMS qualification.

The user guide and active developer/deployment docs now cover the authored-scene contract and Word renderer requirements. Sixteen refreshed screenshots use an isolated synthetic lesson, a real locally rendered synthetic PPTX reference, and blocked provider/engine browser traffic. The [capture manifest](user-guide/refresh-authored-scenes-2026-10-27.json) records source-file hashes, image hashes, and final Markdown/PDF hashes; earlier provenance remains for unchanged images. The rebuilt PDF has 83 pages and 33 portable internal navigation links. Changed sections were rendered and visually checked; nine maintained Markdown documents passed 537 local-reference checks, the PDF has no blank pages, local-filesystem links, or out-of-page text, four desktop/mobile Light/Dark guide-access checks passed, and the production bundle's PDF matches the source bytes. This documentation verification remains separate from application acceptance.

## October 27 contextual walkthrough correction

An explicit **Dismiss walkthrough** control now puts the guide away without closing forms or deleting progress. The next help request follows the current workflow, including Stage versus Details, rather than preferring the dismissed task merely because both use the same editor. Pause/Escape retain their same-task resume behavior. Nine focused dismissal/keyboard/accessibility checks passed across Chromium, Firefox and WebKit.

Walkthrough start/resume now resolves the current workflow instead of offering a globally paused first-scene task in unrelated dialogs. Supported forms offer Start walkthrough independently of earlier practice; Resume appears only for matching paused progress. AI connection settings and new-scene forms have distinct surface identities. Scene-editor targets remain visible in Stage and Details; new question workflows use the selected type. Starting help preserves open drafts and does not submit providers or save content. An AI-enabled first-project walkthrough hands off to scene creation rather than stacking the optional course-drafting dialog beneath it; ordinary unguided course drafting is unchanged. See [context-aware start and resume](onboarding-implementation.md#context-aware-start-and-resume).

Verification: 57 focused browser checks passed across Chromium, Firefox and WebKit (14 context/provider scenarios and five original journey scenarios per browser). Coverage includes stale review isolation, current question type, Stage/Details targets, AI-enabled project handoff, failed saves, cancelled disconnect, draft preservation and no provider submission on navigation. TypeScript/Vite build and PDF verification passed; the existing bundle-size warning remains. The shared test helper waits for DOMContentLoaded and explicit application controls rather than unrelated page-load completion. This is targeted adapter verification, not full release qualification.

## October 27 media-provider connections and help

**Settings > Pythia** is the current label for the learning-intelligence diagnostics panel; internal Engine routes and contracts are unchanged. **User guide**, immediately below Templates, opens the bundled PDF in a separate tab and is available without a selected project.

**Settings > AI connection** now has six keyboard-accessible provider tabs:

| Provider | Implemented scope |
| --- | --- |
| OpenAI | Existing images and legacy narration; prior saved/environment configurations and old jobs remain compatible |
| ElevenLabs | Named connections, voice/model discovery and MP3 narration candidates |
| Google Cloud | Server ADC, voice discovery, optional quota project and MP3 narration candidates |
| Cartesia | Named connections, voice discovery and versioned MP3 narration adapter; default `sonic-3.6` |
| Synthesia | Secure connection setup and read-only video-list test only; video generation is not yet available |
| Shotstack | Separate sandbox/production connection settings and read-only template-list test only; video generation is not yet available |

Non-OpenAI keys use a supported OS credential store or fixed server environment variables; Google uses Application Default Credentials, never a pasted/uploaded private key. Shared installations require administrator permission for save/test/disconnect. Entered keys are write-only and cleared after actions or confirmed tab changes. Narration generation explicitly selects a saved connection with a voice, preserves its identity for regeneration, and fails rather than falling back when it is removed or changed. Video setup does not enable media generation. See [provider setup and limits](ai-connection.md).

Latest targeted verification: the six-provider backend regression selection ran 123 tests (122 passed, one skipped); the final provider browser spec passed 36 checks across Chromium, Firefox and WebKit, including light/dark desktop/mobile accessibility. The preceding combined provider/OpenAI/media-library selection passed 69 checks. Frontend TypeScript/Vite build passed with the existing chunk-size warning. These are targeted implementation results, not a full release qualification. No real credentials or paid synthesis/render requests were used; live provider entitlement, speech quality, video generation and deployment-specific secret-store/ADC behavior remain operator verification gates.

Documentation now includes current images of all six provider tabs and explicit narration selection, captured against an isolated demonstration project with inert connection-status/capability fixtures. The [capture manifest](user-guide/refresh-providers-2026-10-27.json) records provenance; rebuilding the guide does not qualify provider output or a release. Earlier dated release evidence below retains its original scope.

## October 27 authoring update

The current interface has **Assessments** under **WORKSPACE** in the left rail and **Project background** above the scene list in **Storyboard**. Neither is under its former Review tools/Settings location. See the [current user guide](user-guide.md), [root overview](../README.md#questions-assessments-and-metadata), and [backend API notes](../backend/README.md#question-import-metadata-and-export).

Completed question-authoring changes:

- Ordering controls and paired text-entry layouts are readable; assessment stages expand to show targets and submission controls.
- Drag tiles settle beside correct vertical targets or return home on incorrect drops. Drop retries are unlimited; Check answer consumes an attempt. Preview and both SCORM profiles share this behavior.
- Reviewed QTI 2.1 XML/ZIP and CSV/XLSX question import, templates, question-bank authoring, spreadsheet export, duplicate protection, and revision-checked atomic imports.
- Core metadata and unique stable-ID editing. Tags and learning-objective references use compact searchable dropdowns in a collapsed section at the bottom of the question editor, with reuse/create/remove actions from current-project question values.
- Short Answer is now **Fill-in-the-blank**, preserving legacy `short-answer` data. QTI exports correct the inline placement and supply a primary correct-answer value while preserving alternate-answer grading.

Focused validation during implementation passed parser/API/QTI and export regressions, frontend builds, and desktop/mobile Chromium/Firefox/WebKit checks for the changed interactions, contrast, tag/reference dropdowns, navigation, and backgrounds. These were targeted runs, not a new complete release-suite result. QTI/Blackboard question-bank acceptance, external LMS requalification of new SCORM packages, and human release approval remain separate gates.

The October 16 candidate status and older next-action instructions below are retained as historical handoff context, not a new approval for the October 27 changes.

Release-candidate follow-up from October 16: submit the reviewed 1.1.0 candidate and verify CI on its exact full SHA. See the [October 16 candidate review](candidate-review-2026-10-16.md) and [completion update](completion-update-2026-10-15.md). The October 27 authoring/provider changes need their own reviewed revision and CI evidence; do not treat the older candidate's results as qualification of these additions. The older PR #5 instructions below are historical and superseded. Hosted deployment remains deferred.

Release-gate status (2026-10-16 addendum): backend 252 passed/6 skipped, frontend build passes, and the full onboarding suite passes in Chromium, Firefox and WebKit after test-stability fixes (collapsed inspector sections expanded in tests, WebKit button focus, polled saves, longer seed waits, and a WebKit project-switcher overflow clip at 390px). The full suite is slow and shares a growing project list; CI runs one worker with one retry. Still human-owned: Writer/LibreOffice inspection of the SME Master and Full Storyboard exports, live Linux/Nginx inspection, and Encarta verification.

## Completed
- Portable LibreOffice discovery and Word rendering/edit-save-reopen checks.
- TestFrame revision 8 production validation and local qualification of both SCORM profiles. The user confirmed SCORM 1.2 passes their LMS; that LMS does not accept SCORM 2004.
- Local, Encarta, and darkrogue.io authentication profiles. Local single-user operation is retained; Encarta remains denied until its real contract is supplied.
- Hosted email/password sign-in/logout, session expiry, secure cookies, rate limits, and administrator-issued one-use password resets.
- Operator account provisioning, disabling/enabling, password changes, and reset-link tools.
- Project-scoped access, administrator-controlled membership, filtered project/management views, authenticated review names, and request/background audit attribution.
- Authenticated, account-bound, revision-bound review links with expiry and revocation.
- Local HTTPS browser qualification, responsive login/accessibility checks, and Linux/Nginx deployment templates. Regression and hosted browser checks are included in GitHub CI.
- Editable scene canvas, source-layout extraction, preset/custom vector shapes and connector lines, image/text manipulation, aspect-locked text resizing, image resize handles, layer ordering/deletion, Preview Contents navigation, and theme-aware review controls. Common shapes/freeforms preserve vector geometry; uncommon presets remain visible as warned editable approximations, while charts/SmartArt and other non-shape objects remain unsupported. Identical extracted image binaries share an asset while separate slide placements remain editable. Existing imported scenes retain their flattened previews until an authored visual layout is enabled. See [visual scene authoring](visual-scene-authoring.md).
- Template-based editable Word exports: landscape SME Master pages styled after the visual slide template, Full storyboard integrated with the Multimedia Instructional template, and compact image thumbnails in media-table rows. Both template outputs were rendered and page orientation/order inspected.
- Temporary image-attribution policy: incomplete image credits are labeled **Attribution Pending** and reported as production warnings so export can proceed; audio attribution and missing-file blockers remain enforced. Reassess after 2027-01-01; see the dated follow-up below.
- My Work as the opening screen and first menu item, New Project and direct project authoring navigation, compact identity summary, manual production stages, specific publication-blocker findings, five-project scrolling, and collapsed/scrollable Recent activity. See [My Work](my-work.md).
- Media Library project filtering defaults to the current course and switches the active project without leaving the library. Add media replaces the Upload media label. Candidate creation starts collapsed and disables generation when configuration/permission is unavailable; existing candidate review remains available.
- Settings > AI connection with approved OpenAI presets, write-only OS-keyring credentials, local-operator/shared-admin controls, same-origin mutations, redacted errors, explicit connection tests, disconnect, request limits, safe audit events, and queued-job connection-revision protection. See [AI connection](ai-connection.md). No real API key was saved or external AI call made during implementation.
- Evidence Before Impact proof v0.1 approved by user direction on 2026-10-07 for continued illustrative use only. Editable DOCX/PPTX and visual-review PDFs remain local under `workspace/storyboard-proof`; PDFs were checked as 20 and 6 pages. This is not SME approval, production handoff, or release approval. Named SME, production owner, and release approver remain pending.
- Scene layout choices now select rendering behavior: Fidelity uses the source slide, Hybrid enables extracted editable layers, Native uses an editable white canvas, and Template applies the selected PPTX first-slide/master treatment. Template, visual-canvas, course-preview, and SCORM paths are covered by backend and browser qualification. Existing scene editing uses one Details/Canvas editor and one save action.
- My Work now supports owner/admin-authorized project trash, title-independent checkbox confirmation, archive download before removal, 30-day restore, expiry purge, and active-generation-job protection. The project is cleared from active workspace state when trashed. Trash/restore and access boundaries have isolated backend and browser regressions.
- Added and passed the local Sprint 10 Golden Path integration regression: legacy PPTX import, Pythia analysis/transform/assessment/course review, explicit proposal and release-stage decisions, and SCORM 2004 package/report checks. The run uses deterministic local providers and isolated storage; it is not an LMS or human SME qualification. See [Sprint 10 handoff](pythia-sprint-10-golden-path-handoff.md).

## Latest verification

On 2026-10-15, the complete backend suite passed 190 tests, the frontend TypeScript/Vite production build passed, and the opt-in Sprint 10 Golden Path regression passed against local Pythia's deterministic providers using isolated test storage. The regression covers PPTX import, analysis, transformation, assessment design, course review, explicit release-stage approval, and SCORM 2004 packaging/report checks. The focused Chromium Golden Path test could not run because Playwright is not installed in this checkout; the shared browser page was non-interactable. These Sprint 10 checks do not qualify live LMS playback, model quality, or a human SME/release decision.

On 2026-10-13, the backend suite passed 150 tests, the frontend TypeScript/Vite production build passed, the full Chromium onboarding suite passed all 66 tests with one worker, visual qualification passed for unified Details/Canvas editing, master-layer rendering, save/reload and both SCORM profiles, and the hosted-auth HTTPS harness passed with no Axe or JavaScript errors and no mobile overflow. Running the browser suite with three workers once caused a Windows `PermissionError` during atomic storyboard replacement; the complete serial rerun passed. Guide screenshots were recaptured from the isolated `user-guide-restored` workspace and reviewed for the unified editor and Trash confirmation. Project-trash tests cover ownership, expiry, active-job protection, failed-restore recovery, API audit routing, checkbox confirmation and restore. No existing user project was modified in qualification. These local checks do not qualify live Linux/Nginx deployment, external-provider behavior, Firefox/WebKit, or interactive Word editing.

The hosted HTTPS harness also passed login/error handling, secure cookies, recovery/reset, membership display, authenticated review/commenting, reviewer isolation, session expiry, and logout, with zero JavaScript errors or Axe violations. The harness now explicitly resumes authoring from My Work and scopes identity checks to the sidebar. One parallel pre-commit browser run hit a transient Windows metadata replacement lock; the independent full rerun passed without storage changes.

## Historical next steps (superseded)

1. **Push the reviewed candidate commits.** `53ce20f` contains the implementation/tests and `5157cc1` the documentation refresh. The generated `docs/user-guide.pdf` and historical `docs/export-enhancement-recovery.md` change were intentionally left uncommitted. The worktree should remain otherwise clean before pushing.
2. **Wait for fresh PR #5 checks.** Its prior Playwright check predates these commits. Confirm the new head passes CI and no review/change requests appear. The local Chromium suite passed serially; a three-worker run hit one Windows atomic-replacement `PermissionError`, so hosted CI's one-worker configuration is the relevant confirmation.
3. **Merge and tag the stable release.** After fresh CI passes, merge PR #5 into `main` and tag the exact merge commit using the repository's release/version policy. Publish release notes with the local qualification evidence and its limits.
4. **Complete remaining human/deployment gates.** Inspect SME Master and Full Storyboard exports interactively in Writer/LibreOffice, including the user-supplied PPTX master. Live Linux/Nginx inspection still awaits SSH, hostname, and installation-directory details; use the [authentication deployment guide](authentication-deployments.md) and do not assume templates have been installed. Encarta verification awaits its issuer/token, user/tenant mapping, session/logout, and provisioning contract.

## Dated follow-up

- 2027-01-04: Reassess the temporary image-attribution export exception and plan re-implementation of the attribution discipline after 2027-01-01. Pending credits must remain labeled in exports and build warnings until verified.

MFA, automated email delivery, guest review, and multi-organization hosting are additional scope. No public server was deployed in this session.

## Working elsewhere

Check out the development branch, install Python backend/development dependencies and npm dependencies, then follow [README](../README.md) for local startup. Run the backend suite and `npm run test:auth` after building the frontend to regenerate hosted qualification evidence.

Local project data (`workspace/`), downloaded LibreOffice binaries (`tools/LibreOfficePortable/`), and design/test artifacts are intentionally excluded from Git. Moving the source checkout does not move those files. Use Chimera storyboards for authoring data and the documented portable LibreOffice download for another Windows workstation. Authentication accounts/session stores are installation data, not project backup contents.
