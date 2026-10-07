# Current work and handoff

Updated 2026-10-07. The active development branch is `extract-onboarding-repository`.

## Completed

- Portable LibreOffice discovery and Word rendering/edit-save-reopen checks.
- TestFrame revision 8 production validation and local qualification of both SCORM profiles. The user confirmed SCORM 1.2 passes their LMS; that LMS does not accept SCORM 2004.
- Local, Encarta, and darkrogue.io authentication profiles. Local single-user operation is retained; Encarta remains denied until its real contract is supplied.
- Hosted email/password sign-in/logout, session expiry, secure cookies, rate limits, and administrator-issued one-use password resets.
- Operator account provisioning, disabling/enabling, password changes, and reset-link tools.
- Project-scoped access, administrator-controlled membership, filtered project/management views, authenticated review names, and request/background audit attribution.
- Authenticated, account-bound, revision-bound review links with expiry and revocation.
- Local HTTPS browser qualification, responsive login/accessibility checks, and Linux/Nginx deployment templates. Regression and hosted browser checks are included in GitHub CI.
- Editable scene canvas, source-layout extraction, image/text manipulation, Preview Contents navigation, and theme-aware review controls. Existing imported scenes retain their flattened previews until an authored visual layout is enabled; unsupported PowerPoint features remain explicit limitations. See [visual scene authoring](visual-scene-authoring.md).
- My Work as the opening screen and first menu item, New Project and direct project authoring navigation, compact identity summary, manual production stages, specific publication-blocker findings, five-project scrolling, and collapsed/scrollable Recent activity. See [My Work](my-work.md).
- Media Library project filtering defaults to the current course and switches the active project without leaving the library. Add media replaces the Upload media label. Candidate creation starts collapsed and disables generation when configuration/permission is unavailable; existing candidate review remains available.
- Settings > AI connection with approved OpenAI presets, write-only OS-keyring credentials, local-operator/shared-admin controls, same-origin mutations, redacted errors, explicit connection tests, disconnect, request limits, safe audit events, and queued-job connection-revision protection. See [AI connection](ai-connection.md). No real API key was saved or external AI call made during implementation.
- Evidence Before Impact proof v0.1 approved by user direction on 2026-10-07 for continued illustrative use only. Editable DOCX/PPTX and visual-review PDFs remain local under `workspace/storyboard-proof`; PDFs were checked as 20 and 6 pages. This is not SME approval, production handoff, or release approval. Named SME, production owner, and release approver remain pending.

## Latest verification

On 2026-10-07, the backend suite passed 123 tests and the full Chromium onboarding/dashboard/media/AI suite passed 56 tests. The TypeScript/Vite production build passed, and scoped accessibility/responsive checks covered light/dark desktop/mobile views. Live checks confirmed the New Project dialog, My Work startup, media controls, and OS credential-store availability without modifying the five existing projects or submitting a real AI request. These results do not replace live-provider model qualification, Firefox/WebKit checks, or the deferred public-server deployment checks.

The hosted HTTPS harness also passed login/error handling, secure cookies, recovery/reset, membership display, authenticated review/commenting, reviewer isolation, session expiry, and logout, with zero JavaScript errors or Axe violations. The harness now explicitly resumes authoring from My Work and scopes identity checks to the sidebar. One parallel pre-commit browser run hit a transient Windows metadata replacement lock; the independent full rerun passed without storage changes.

## Next

1. Live Linux/Nginx inspection and qualification. The user explicitly deferred SSH, hostname, and installation-directory details. Use the [authentication deployment guide](authentication-deployments.md) when those are available; do not assume the templates have been installed.
2. Implement Encarta verification when issuer/token, user/tenant mapping, session/logout, and provisioning details arrive.
3. Confirm interactive editing of the exported storyboard in Writer. Headless paragraph/table edits, Unicode, long text, and rendering passed; interactive Writer launch was blocked by automatic approval review.

MFA, automated email delivery, guest review, and multi-organization hosting are additional scope. No public server was deployed in this session.

## Working elsewhere

Check out the development branch, install Python backend/development dependencies and npm dependencies, then follow [README](../README.md) for local startup. Run the backend suite and `npm run test:auth` after building the frontend to regenerate hosted qualification evidence.

Local project data (`workspace/`), downloaded LibreOffice binaries (`tools/LibreOfficePortable/`), and design/test artifacts are intentionally excluded from Git. Moving the source checkout does not move those files. Use project portable backups for authoring data and the documented portable LibreOffice download for another Windows workstation. Authentication accounts/session stores are installation data, not project backup contents.
