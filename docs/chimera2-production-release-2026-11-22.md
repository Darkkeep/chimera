# Chimera2 hosted production release — 2026-11-22

**Status: DEPLOYED AND VERIFIED.** This is a historical release record, not an authorization for a new change.

- Production origin: https://chimera.darkrogue.io/
- Deployed frontend and backend source: `7dae45d1e68cf83f5eaac1c9e875b4fbd7d2772e`
- Studio version: `2.0.0-beta.1`, Studio enabled and default, Classic authoring retained
- Candidate release archive SHA-256: `5b3dba6310f8c92e8c0bb8902e8b4e45e311eaa904d48e196c5dba1971093c5d`
- GitHub production evidence: [Issue #42](https://github.com/Darkkeep/chimera/issues/42#issuecomment-7074981807) and [PR #44](https://github.com/Darkkeep/chimera/pull/44#issuecomment-7074980549)
- Exact-head qualification: [CI run #44948139281](https://github.com/Darkkeep/chimera/actions/runs/44948139281)

## Verified release acceptance

The cutover occurred under a controlled write pause. The deployed frontend and running backend were verified to identify the pinned candidate.

- **Identity:** A pre-cutover session survived. A fresh DARKROGUE sign-in after sign-out succeeded with HTTP 200 and opened the authorized workspace.
- **Authoring:** Studio opened a disposable production-smoke project and saved scene content through revision 3.
- **Publishing:** A SCORM 1.2 export from the live application passed ZIP integrity checks; its manifest referenced bundled files and its storyboard contained the saved text.
- **Recovery:** A pre-cutover application-consistent backup covered projects, media, identities, application state and production configuration. Checkpoint timestamp 2026-11-22 05:44:19 UTC; SHA-256 `d0085c460c99bc386c6fdd014d9e65bf6708d4fc6ef73a9db1a2294b9614d8db`. All 104 restored regular files matched sources byte-for-byte, and both restored SQLite databases passed integrity checks. The temporary restore was removed and scheduled backups resumed.
- **Fallback:** A checksum-verified guarded Chimera 1.2.0 release is available for application-only reversal while preserving later workspace revisions. Its hosted synthetic rollback was verified in [Issue #42](https://github.com/Darkkeep/chimera/issues/42#issuecomment-7074596866). No rollback was needed during the real cutover.
- **Runtime:** Hostinger VPS service and Nginx were healthy in the post-cutover smoke result.

These statements are based on the executing deployment agent's recorded checks; they do not imply that every user pathway, LMS, or browser has been accepted.

## Source-control state and reconciliation

The application deployed from **draft PR #44**, currently headed at `7dae45d1e68cf83f5eaac1c9e875b4fbd7d2772e`, stacked on **draft PR #40** (`feature/chimera-2-golden-path-qualification`). The repository's default `main` branch is still the 1.2.0 lineage. The fact that the production artifact is live **does not mean PR #44 was merged**. Keep the exact deployed SHA in the release record until the stacked changes have undergone an explicit source-control integration review. Do not rewrite `main` to imply equivalence before it is verified.

Suggested source-control follow-through: review stacking/ancestry, merge in the correct dependency order only after confirming CI and unrelated changes, then tag a release pointing to the exact release source as permitted by repository policy. **No Git merge, retagging, VPS restart or deployment is performed by this documentation.**

## Deferred operations and honest limits

- The production smoke created a **disposable verification project**; its cleanup was not reported. Remove only after the Owner confirms it is no longer needed.
- Earlier VPS audit found backups readable by unprivileged local users (`/var/backups/chimera` 0755 and archives 0644). A separate least-privilege correction remains appropriate after validating backup-reader dependencies. The successful cutover recovery test does **not** itself establish the later state of every scheduled backup file.
- Independent off-host custody of the guarded rollback artifact was not confirmed. Preserve its hash and validate a second failure-domain copy as an operational hardening task.
- The verified production export was **SCORM 1.2**. Earlier synthetic rehearsals covered SCORM 2004 and DOCX; do not misreport those as live production smoke acceptance.
- Progressive rendering is a **subsequent development track**, not part of the release shipped here. Track in [Issue #43](https://github.com/Darkkeep/chimera/issues/43) and its [PR #45](https://github.com/Darkkeep/chimera/pull/45). Preserve human review, partial-result visibility, canonical source, revision conflict guards and user draft safety.

## Repeatable release principle

A tested, immutable frontend/backend pair should ship together; preserve project data and authentication configuration; capture a verified pre-cutover checkpoint; validate sign-in, project save/reopen, and export at the public origin; and retain a compatible guarded application fallback that does not overwrite newer author work.

**Deployment is a release outcome, not a new feature-development requirement.** See Issue #42 for evidence and audit trail.
