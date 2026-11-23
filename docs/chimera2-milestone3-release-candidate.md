# Chimera2 Milestone 3 combined release candidate

Status: candidate preparation and qualification; not merged or deployed.
Owner accepted the local Milestone 3 saved-artifact journey and both primary
creation paths in this chat on November 22, 2026 (America/New_York), then asked
to prepare the combined candidate. This acceptance is distinct from hosted/team
qualification and from authorization to merge or deploy.

## Pinned inputs and reconciliation

- Current public frontend release identity, read via verified HTTPS on November
  22, 2026: `4968cab485e79ba921927f1b36cac20077fd4eb5`; version 2.0.0-beta.1,
  Studio enabled/default. `/api/health` returned `{"status":"ok"}`. This checks
  frontend identity and API health, not independently authenticated backend SHA.
- Historical November 22 cutover: `7dae45d1e68cf83f5eaac1c9e875b4fbd7d2772e`.
  The current public frontend SHA descends from it and adds the access polling,
  navigation latency and draft-preservation corrections. The historical release
  record is retained unchanged and is not current-deployment telemetry.
- PR #45: `cc881b94b2da7c91e02b34b0c91b1ac6e8b86754`.
- PR #49: `6b553c5a8147a1e9403c71d7b81fc3b13415def8`.
- PR #50 including the Owner-observed entry fix:
  `775cd7f169a70d37077b3c743c5bb967e66c9f2f`.
- Mainline: `b8aeab52a271ae4347f246c064ee5af4c9780ab3`. Its only changes absent
  from the feature stack were `7187291`, `db25334`, and `b8aeab5`, all docs.
  They were cherry-picked in order. README conflicts were resolved by retaining
  current Beta setup, historical cutover context and explicit undeployed-candidate
  status; the obsolete claim that hosted production was still 1.2.0 was removed.
  The historical production release record was retained byte-for-byte.

The stack is linear: live baseline -> #45 -> #49 -> #50. No application cherry-
picks, squashes, merge commits, feature replacements or product changes were
needed. All three PR heads and the current public frontend baseline are ancestors
of this candidate. Mainline-only documentation is retained by content; the
original mainline commit IDs are not ancestors merely because they were copied.
The original PR branches and `main` remain unchanged.

This supports the charter's familiar authoring and independent Pythia relationship:
start from a file or idea, inspect imported recommendations, explicitly accept,
then author in the same editor with existing identity, revision and provenance
controls. The candidate adds release verification rather than another importer.

## Feature configuration and limits

The release artifact keeps Studio enabled/default, matching the observed public
frontend configuration. Progressive authoring remains default-off: the package
build does not set `VITE_CHIMERA_PROGRESSIVE_DEMO_ENABLED`; the backend's existing
`CHIMERA_PROGRESSIVE_DEMO` gate is not activated by this preparation.
With progressive gates off, Pythia JSON file start uses existing batch suggestions
and requires explicit acceptance. Both content and supported question scenes
remain available through that established mapper. With the demo gates on in
isolated tests, existing per-scene proposal review/accept/edit remains covered.
The gated progressive subset is still at most 20 content scenes, with unsupported
scene/media/interaction/objective mappings reported. No live generation, asset
fetching, paid call, team rollout or new provider capability is claimed.

## Qualification and immutable identity

The candidate source identity is the exact commit containing this packet, pinned
in its draft PR, exact-head CI runs, archive filename, `release-manifest.json`,
frontend `release-version.json` and archive `SHA256SUMS`. Do not substitute a later
branch tip for the qualified SHA. CI URLs and final digest belong in the PR after
completion so this document does not contain a self-referential source SHA.

- Local release-default browser tests: both primary file-start paths, gates off,
  Pythia JSON preview/create/review, zero canonical scenes before acceptance,
  explicit acceptance, assessment retention, revision increment and reopen.
- Existing progressive fixture/adapter/import checks remain in CI with demo
  gates on, including unsaved draft, revision, duplicate/replay and focus guards.
- Exact-head CI runs the full backend suite, frontend build, progressive tests,
  the new release-default checks, Studio/access, Classic recovery, HTTPS auth,
  visual/export checks and nine Chromium/Firefox/WebKit browser groups.
- The existing release-artifact workflow builds an exact-SHA Linux archive twice,
  compares bytes, verifies checksums and installs/exercises it offline. It bundles
  the pinned Python 3.14.4, Node, Chromium and locked wheelhouse. This qualification
  does not contact or change production.

Local tests and synthetic HTTPS/archive qualification do not establish current
hosted authentication continuity, restored real-data compatibility or production
progressive/team acceptance. Owner local acceptance is recorded separately above.

## Release review and later execution

1. Review the combined candidate PR against `main`; retain the existing #40/#44
   deployment/access lineage and #46 fixes as well as #45/#49/#50. No PR is
   automatically merged or closed. The eventual integration method must retain
   equivalent source and account for all open stack dependencies.
2. Select the immutable archive from the exact candidate run and verify its
   approved SHA-256 and manifest before any staging. Keep persistent data and
   identity/provider configuration outside versioned releases.
3. Before a later deployment decision, recheck frontend and authenticated backend
   identities, current data/runtime/feature configuration, and the compatible
   rollback release. Treat the copied old promotion runbook and local dirty
   audit files as historical material, not a new execution authorization.
4. Hosted staging, backup/restore operations, migrations, service changes, live
   traffic changes, credential changes and paid calls need their own authorized
   scope. Prepare the exact cutover/rollback steps against then-current state.
   Application rollback must preserve newer author data; never restore an old
   workspace over it. No existing recovery prerequisite is retired by this packet.
5. A later approved release needs fresh SSO login/logout and roles, create/edit/
   save/reopen, supported file import/review, media, assessment and export checks
   on its actual hosted configuration. Progressive activation requires separate
   hosted/team qualification; the current candidate does not activate it.

The unrelated modified release workflow, promotion runbook, build script and
untracked audit/tooling files in the canonical checkout were preserved and
excluded from this candidate. The archive builder uses committed source, not
those local working-tree modifications.
