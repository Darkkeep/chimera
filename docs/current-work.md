# Current work and handoff

Updated 2026-10-06. The active development branch is `extract-onboarding-repository`.

## Completed

- Portable LibreOffice discovery and Word rendering/edit-save-reopen checks.
- TestFrame revision 8 production validation and local qualification of both SCORM profiles. The user confirmed SCORM 1.2 passes their LMS; that LMS does not accept SCORM 2004.
- Local, Encarta, and darkrogue.io authentication profiles. Local single-user operation is retained; Encarta remains denied until its real contract is supplied.
- Hosted email/password sign-in/logout, session expiry, secure cookies, rate limits, and administrator-issued one-use password resets.
- Operator account provisioning, disabling/enabling, password changes, and reset-link tools.
- Project-scoped access, administrator-controlled membership, filtered project/management views, authenticated review names, and request/background audit attribution.
- Authenticated, account-bound, revision-bound review links with expiry and revocation.
- Local HTTPS browser qualification, responsive login/accessibility checks, and Linux/Nginx deployment templates. Regression and hosted browser checks are included in GitHub CI.

## Next

1. Live Linux/Nginx inspection and qualification. The user explicitly deferred SSH, hostname, and installation-directory details. Use the [authentication deployment guide](authentication-deployments.md) when those are available; do not assume the templates have been installed.
2. Implement Encarta verification when issuer/token, user/tenant mapping, session/logout, and provisioning details arrive.
3. Confirm interactive editing of the exported storyboard in Writer. Headless paragraph/table edits, Unicode, long text, and rendering passed; interactive Writer launch was blocked by automatic approval review.

MFA, automated email delivery, guest review, and multi-organization hosting are additional scope. No public server was deployed in this session.

## Working elsewhere

Check out the development branch, install Python backend/development dependencies and npm dependencies, then follow [README](../README.md) for local startup. Run the backend suite and `npm run test:auth` after building the frontend to regenerate hosted qualification evidence.

Local project data (`workspace/`), downloaded LibreOffice binaries (`tools/LibreOfficePortable/`), and design/test artifacts are intentionally excluded from Git. Moving the source checkout does not move those files. Use project portable backups for authoring data and the documented portable LibreOffice download for another Windows workstation. Authentication accounts/session stores are installation data, not project backup contents.
