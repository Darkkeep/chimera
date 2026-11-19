# Beta 1 review packet

Candidate: `2.0.0-beta.1`, prepared November 19, 2026 in
`C:\inetpub\Chimera2`. [Release notes](release-2.0.0-beta.1.md).

## Source lineage and preservation

The relocated copy stopped at `dc21e48b56743c6f87572452a45742747e7212a3` while
the original nested checkout advanced to
`fdd7c725a143b20c0c68cdc88840ae9c4d83c1fb`. Its four existing commits include
the accepted local authoring baseline and qualification corrections.

Fetched that existing commit directly from the local source checkout. Verified
it descends from the old baseline, confirmed the index contained no staged work,
then advanced the local branch/index baseline with a mixed reset. Verified all
814 existing version-controlled or untracked working files remained byte-for-byte
unchanged by that operation. No hard reset, branch merge, new commit or push
was used. Both original checkouts and local project data remain intact.

The verified backup, original patches and before-file manifest are under ignored
`workspace/beta-preparation/20261119-104505/`. Earlier recovery files remain under
`workspace/local-recovery/20261119-102110/`.

Restored the source baseline's CI workflow instead of leaving the older copied
workflow as an unintended reversal. Its Studio smoke command additionally includes
the dialog-selection and keyboard-delete regressions. No workflow was triggered
by these local changes, and no production configuration was changed.

## Changes beyond the verified source baseline

- App/API/package/feedback identity aligned to `2.0.0-beta.1`.
- Keyboard deletion and timeline keyboard-selection fix, with regression tests.
- Readable static question button and editor-only Preview hint.
- Dialog text-selection dismissal fix and its existing regression.
- Canonical local launcher/workspace, charter/agent instructions and local
  recovery documentation retained.
- README, release notes and this review packet separate the local Beta,
  historical 1.x release, application version and charter version.

Review focused diffs against `fdd7c72`, not the entire recovered authoring feature
as if it were new uncommitted work. `git status --short` identifies remaining
local additions and edits. The founder explicitly authorized the candidate commit,
including the initial charter and agent instructions, on November 19, 2026.

## Evidence identity

The recovered baseline's hosted [Chimera checks run 226](https://github.com/Darkkeep/chimera/actions/runs/44519207982)
completed successfully for `fdd7c725a143b20c0c68cdc88840ae9c4d83c1fb`;
this was verified through GitHub during preparation. It does not qualify local
changes made after that commit.

Candidate checks use disposable local workspaces. Detailed local logs, browser
artifacts and a final file-hash manifest are retained under ignored
`workspace/beta-preparation/`. The manifest identifies the uncommitted executable
candidate without pretending its parent Git SHA describes the working tree.
The Git SHA/build timestamp fields remain unknown unless supplied by an actual
build; a clean parent SHA must not be reported as the identity of this dirty tree.

## Verification commands

Use the repository's `backend/.venv/Scripts/python.exe`. Clear an inherited
`CHIMERA_DEPLOYMENT_PROFILE` before backend unit discovery, because tests select
their own isolated deployment profiles. Do not change private `.env` files.

```powershell
backend/.venv/Scripts/python.exe -m unittest discover -s backend/tests
npm --prefix frontend run build
backend/.venv/Scripts/python.exe docs/qualification/support/verify.py
npm run verify:onboarding:artifact
```

Browser checks use `CHIMERA_TEST_PYTHON` pointing to that interpreter and both
`CHIMERA_STUDIO_TEST=true` and `VITE_CHIMERA_STUDIO_ENABLED=true`:

```powershell
node node_modules/@playwright/test/cli.js test --config playwright.onboarding.config.cjs keyboard-delete.spec.cjs dialog-selection.spec.cjs assessment-placement.spec.cjs direct-stage.spec.cjs studio-golden-path.spec.cjs header-save.spec.cjs --workers 1 --output workspace/beta-preparation/browser-results --reporter list
```

The command covers Chromium, Firefox and WebKit. Classic qualification runs
separately with `VITE_CHIMERA_STUDIO_ENABLED=false`. The visual/export and HTTPS
authentication qualification scripts also use disposable local data and an
explicit `CHIMERA_TEST_PYTHON`.

## Verification results

- Full backend discovery: **693 tests run, 72 explicitly skipped, suite passed**
  in 205.453 seconds. Skips are not represented as passing coverage. The retained
  log includes a non-failing AnyIO resource warning.
- TypeScript/Vite build: **passed**, including the final keyboard change. The
  existing large-bundle warning remains.
- Retained qualification evidence: **9 artifacts verified**. Pinned onboarding
  artifact checksum and installed exports: **passed**.
- Visual authoring and export qualification: **passed**.
- Isolated HTTPS authentication qualification: **passed**, including recovery,
  reviewer isolation, session expiry/logout and zero captured Axe violations in
  that authentication flow. This is not a Studio-wide accessibility audit.
- Fresh root and frontend npm audits: **zero reported vulnerabilities** in both
  lockfiles. Backend `pip check`: **no broken requirements**. These are dependency
  checks, not an independent application security review.
- Focused authoring matrix: **39 tests passed in one 4.1-minute run** across
  Chromium, Firefox and WebKit. Coverage: question placement and learner scoring,
  dialog selection, direct stage navigation, conditional saves and rejected
  writes, keyboard deletion and the three-scene dual-SCORM golden path.
- Classic editor with Studio disabled: **3 tests passed in one 26.1-second run**,
  covering Chromium, Firefox and WebKit.
- Running local backend Build Information and the visible Studio label both
  report `2.0.0-beta.1`. No authored project save was used for that verification.

### Findings resolved during qualification

The first mixed-browser run passed 37 cases and failed two WebKit cases. One
long question-authoring journey reached the overall 30-second deadline; its
isolated rerun passed in 24.9 seconds. That fixture now has a 60-second full-journey
budget, retaining normal per-assertion deadlines and all behavior assertions.

The other failure was functional: Backspace on a locked object could invoke
WebKit browser Back. The editor now consumes Delete/Backspace on its non-input
surfaces even when deletion is a no-op, including repeated key events. Text
fields and inline editing retain native behavior. Regression assertions check
that empty/locked deletion does not leave the editor.

The initial classic matrix passed Chromium/Firefox and failed the WebKit guard
assertion. The same case passed alone; its fixture now waits for the edited title
to appear in the dialog heading before invoking Close. All original guard,
Escape, persistence and save assertions remain. The subsequent three-browser
classic run passed all three cases. Earlier failure traces are retained rather
than replaced by the successful runs.

Final confirmation after the repeated-key guard and fixture changes: **12 tests
passed in one 1.7-minute run**, covering question placement/scoring and keyboard
deletion/text/lock protection in Chromium, Firefox and WebKit. This repeats a
subset of the 39 cases rather than adding 12 distinct capabilities.

Final first-party source/configuration/test manifest: **456 files**, plus the
recorded submodule pins. SHA-256 fingerprint:
`b92608d7f41597a1a3c76210ac6be0472e0eac9af7a76b3bedfe3bd67642d608`.
The verified file hashes are in
`workspace/beta-preparation/candidate-manifest.json`. Documentation and generated
build/test output are outside that fingerprint; logs and this packet record their
scope separately. The charter approval status was updated after founder authorization;
no further executable source changes followed verification.

## Approval boundary

Prepare the full reviewable local candidate first. Founder review and explicit
commit authorization precede a new commit/tag. A later explicitly authorized push
must run hosted CI against that exact commit. Pilot publication, branch merging,
deployment, migrations and paid generation require their own authorization.
Local tests do not replace the human/accessibility/LMS gates in the release notes.
Founder authorization received November 19, 2026 covers this local candidate
commit, including the charter and agent instructions. It does not authorize a
tag, push, merge, packaging/publication or deployment. No evaluation ZIP was
generated during preparation: the existing packaging script intentionally
archives committed source. Packaging can follow the approved candidate commit.
