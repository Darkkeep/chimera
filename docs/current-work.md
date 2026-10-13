# Current work and handoff

Updated 2026-10-13. The active development branch is `extract-onboarding-repository`.

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
- Scene layout choices now select rendering behavior: Fidelity uses the source slide, Hybrid enables extracted editable layers, Native uses an editable white canvas, and Template applies the selected PPTX first-slide/master treatment. Template, visual-canvas, course-preview, and SCORM paths are covered by backend and browser qualification. The Edit scene and Edit canvas entry points now share one Details/Canvas editor with one save action.
- My Work now supports owner/admin-authorized project trash, title-independent checkbox confirmation, archive download before removal, 30-day restore, expiry purge, and active-generation-job protection. The project is cleared from active workspace state when trashed. Trash/restore and access boundaries have isolated backend and browser regressions.

## Latest verification

On 2026-10-13, the backend suite passed 149 tests, the frontend TypeScript/Vite build passed, all 20 isolated Chromium My Work/Project Health tests passed, and the visual qualification passed for scene layout switching, unified Details/Canvas editing, master-layer rendering, canvas save/reload, and both SCORM profiles. The focused project-trash backend and browser tests passed. No existing user project was modified in qualification. These local checks do not qualify live Linux/Nginx deployment, external-provider behavior, Firefox/WebKit, or interactive Word editing.

The hosted HTTPS harness also passed login/error handling, secure cookies, recovery/reset, membership display, authenticated review/commenting, reviewer isolation, session expiry, and logout, with zero JavaScript errors or Axe violations. The harness now explicitly resumes authoring from My Work and scopes identity checks to the sidebar. One parallel pre-commit browser run hit a transient Windows metadata replacement lock; the independent full rerun passed without storage changes.

## Next

1. **Prepare one reviewed release candidate.** PR #5's pushed revision has a passing Playwright check and no outstanding review requirement, but the 2026-10-13 Trash, unified scene-editor, and other working-tree changes are not included in that CI run. The branch also has a large dirty worktree. Inventory and group the intended changes; do not stage or commit the entire tree blindly. Preserve user work and keep unrelated changes out of the release candidate.
2. **Qualify the exact candidate that will merge.** Run the full backend suite, frontend production build, authentication harness, management/onboarding browser suites, visual qualification, and required CI. Inspect real SME Master and Full Storyboard exports in Writer/LibreOffice, including the user-supplied PPTX master. Confirm no outstanding test failures, review requests, or data-loss concerns. Do not call the earlier PR check qualification of uncommitted changes.
3. **Merge and tag the stable release.** Once the reviewed candidate is committed and pushed, update PR #5 (or create a successor if scope cannot be kept coherent), merge it into `main`, and tag the exact merged commit using the repository's release/version policy. Publish release notes and qualification evidence; do not label an unmerged or locally tested worktree as a stable release.
4. **Complete deployment qualification.** Live Linux/Nginx inspection remains blocked on SSH, hostname, and installation-directory details, which were explicitly deferred. Use the [authentication deployment guide](authentication-deployments.md); do not assume templates have been installed.
5. Implement Encarta verification when issuer/token, user/tenant mapping, session/logout, and provisioning details arrive. Confirm interactive editing of the exported storyboard in Writer; headless edits, Unicode, long text, and rendering passed, but interactive Writer launch was previously blocked by automatic approval review.

## Dated follow-up

- 2027-01-04: Reassess the temporary image-attribution export exception and plan re-implementation of the attribution discipline after 2027-01-01. Pending credits must remain labeled in exports and build warnings until verified.

MFA, automated email delivery, guest review, and multi-organization hosting are additional scope. No public server was deployed in this session.

## Working elsewhere

Check out the development branch, install Python backend/development dependencies and npm dependencies, then follow [README](../README.md) for local startup. Run the backend suite and `npm run test:auth` after building the frontend to regenerate hosted qualification evidence.

Local project data (`workspace/`), downloaded LibreOffice binaries (`tools/LibreOfficePortable/`), and design/test artifacts are intentionally excluded from Git. Moving the source checkout does not move those files. Use Chimera storyboards for authoring data and the documented portable LibreOffice download for another Windows workstation. Authentication accounts/session stores are installation data, not project backup contents.
