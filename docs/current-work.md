# Current work and handoff

The [completion plan](completion-plan-2026-10-15.md) and [execution record](completion-update-2026-10-15.md) track this update. Historical qualification evidence remains dated below; PR #5 is merged and PR #6 holds the preceding candidate.

Updated 2026-10-15. Candidate version: 1.1.0; see [release policy](release-policy.md). The active development branch is `extract-onboarding-repository`.

## Completed

- Completion update 1.1.0: explicit scene/course-wide media placement, precedence/exclusions, immutable shared-library copies, video/captions/transcripts, Word source provenance and optional discussion, local PDF OCR with inspection, AI request/source budgets, provider-reported enhancement usage, API layout warnings, per-profile resume budgets and CI/browser qualification repairs. See the execution record for final checks and remaining acceptance.

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

## Historical verification (before this update)

On 2026-10-13, the backend suite passed 150 tests, the frontend TypeScript/Vite production build passed, the full Chromium onboarding suite passed all 66 tests with one worker, visual qualification passed for unified Details/Canvas editing, master-layer rendering, save/reload and both SCORM profiles, and the hosted-auth HTTPS harness passed with no Axe or JavaScript errors and no mobile overflow. Running the browser suite with three workers once caused a Windows `PermissionError` during atomic storyboard replacement; the complete serial rerun passed. Guide screenshots were recaptured from the isolated `user-guide-restored` workspace and reviewed for the unified editor and Trash confirmation. Project-trash tests cover ownership, expiry, active-job protection, failed-restore recovery, API audit routing, checkbox confirmation and restore. No existing user project was modified in qualification. These local checks do not qualify live Linux/Nginx deployment, external-provider behavior, Firefox/WebKit, or interactive Word editing.

The hosted HTTPS harness also passed login/error handling, secure cookies, recovery/reset, membership display, authenticated review/commenting, reviewer isolation, session expiry, and logout, with zero JavaScript errors or Axe violations. The harness now explicitly resumes authoring from My Work and scopes identity checks to the sidebar. One parallel pre-commit browser run hit a transient Windows metadata replacement lock; the independent full rerun passed without storage changes.

## Next

1. **Qualify the completion update.** PR #5 is merged at `994f2afb9cd3618272efc8a5dd654ac429079d96`. PR #6 contains baseline `a181b7336a792f1a2840fbc059d7314bf09f606a`; its October 14 CI run failed WebKit local-file navigation with offline emulation. This update repairs that test while blocking and recording network requests, adds visual qualification to CI, and implements the local completion-plan work. New exact-head CI is required after these changes are submitted.
2. **Review the new media and reliability contracts.** See [media placement and OCR](media-placement-and-ocr.md), [resume-data policy](resume-data-policy.md), and the [execution record](completion-update-2026-10-15.md) for delivered behavior, checks and limits.
3. **Complete external acceptance before release claims.** Interactive Writer editing of both templates, target-LMS acceptance of changed packages, novice-author and manual screen-reader reviews remain human tasks. The October 14 replacement SCORM 1.2 package already passed retry, Continue, Start over and Gradebook by operator attestation; preserve that exact artifact evidence.
4. **Hosted deployment is deferred for this update**, as instructed on 2026-10-15. Encarta remains fail-closed pending its verified integration contract. Do not deploy templates or enable centralized event delivery without the environment and trust/residency inputs.

## Dated follow-up

- 2027-01-04: Reassess the temporary image-attribution export exception and plan re-implementation of the attribution discipline after 2027-01-01. Pending credits must remain labeled in exports and build warnings until verified.

MFA, automated email delivery, guest review, and multi-organization hosting are additional scope. No public server was deployed in this session.

## Working elsewhere

Check out the development branch, install Python backend/development dependencies and npm dependencies, then follow [README](../README.md) for local startup. Run the backend suite and `npm run test:auth` after building the frontend to regenerate hosted qualification evidence.

Local project data (`workspace/`), downloaded LibreOffice binaries (`tools/LibreOfficePortable/`), and design/test artifacts are intentionally excluded from Git. Moving the source checkout does not move those files. Use Chimera storyboards for authoring data and the documented portable LibreOffice download for another Windows workstation. Authentication accounts/session stores are installation data, not project backup contents.
