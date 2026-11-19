# Chimera 2.0 Beta candidate qualification

Owner accepted the cumulative local Beta baseline on 2026-11-19. This candidate is on `feature/chimera-2-golden-path-qualification`, based on `dc21e48b56743c6f87572452a45742747e7212a3`. A candidate commit records implementation; it is not release approval. No production promotion, migration, new generation or Pythia operation is included.

## Automated gates

Qualification is in progress. Exact results are recorded after each suite finishes; earlier baseline CI is not evidence for this candidate.

- Retained qualification evidence verifier: passed locally.
- Pinned onboarding artifact verification: passed locally.
- TypeScript/Vite build: passed after qualification fixes (including workspace/palette state correction).
- Full backend discovery: first run 693 tests, 72 skipped, three Windows cleanup errors. Feedback SQLite connections were not closed; production and read-only test handles now close explicitly. Fourteen focused Signal tests passed. Full rerun passed: 693 tests run, 72 explicit skips.
- Isolated HTTPS authentication: passed, including login/recovery, secure cookies, reviewer isolation, expiry/logout, mobile overflow and no captured axe violations. This is not hosted-account acceptance.
- Visual/export qualification: passed after adapting the background picker interaction to its real popup and hex field; repeated successfully after the workspace-state correction.
- Chromium, Firefox, WebKit complete integration suites: in progress, with Studio enabled. Local execution uses Windows/Python 3.13; hosted CI uses Ubuntu/Python 3.12 and remains a separate gate.
- Classic editor with Studio disabled: pending.

The workflow now explicitly includes the newer authoring menu, theme, media alias, navigation, preview and timeline tests; all browser matrix jobs enable the Studio tests, and the backend job includes a separate classic-mode regression.

Focused qualification also exposed hidden-trigger focus restoration. Shared dialogs now select a visible initial input and return focus to the workspace menu toggle when the opening control becomes hidden. Provider-settings tests isolate their initial project list. Existing AI-draft tests now open the intended disclosure; all generation in these checks is mocked.

## Qualification corrections after the accepted baseline

The first local candidate commit is `e3dac499ba7b7416ba072784eab1ea4e7983f076`. Qualification found that a project-keyed palette provider remounted the entire workspace whenever project identity changed. The follow-up keeps the workspace mounted and changes only the saved-swatch scope, with an immediate per-project read that prevents cross-project swatch leakage. Existing trash/restore confirmation behavior and a new real project-selector/swatch regression verify this correction.

Shared dialog focus restoration now uses a visible initial field and falls back to the workspace menu toggle when its original trigger is hidden. Older regression fixtures now explicitly open the mobile drawer, use the accepted theme names and right-hand discussion layout, and open AI/color-picker disclosures before interacting. Their underlying persistence, consent, conflict, scoring and export checks are retained.

A focused Chromium run passed 106 of 109 cases; the three remaining cases were fixture issues (waiting for initial render, a reload that deliberately resets the Studio opt-in toggle, and checking a hidden sidebar control). A fresh 18-case run passed 17 with the final remaining reload/menu check then passing separately. This establishes 109 distinct focused cases across those runs, not a claim of a single all-green 109-case run or complete cross-browser acceptance. Full diagnostic runs were interrupted to fix findings; their partial results are not full passes.

The complete three-browser gate remains open. Source changes are versioned locally; pushing the feature branch to the existing draft PR #40 requires separate authorization under the handoff boundary. No merge/deployment is implied.

## Representative course and human gates

Use the existing `studio-golden-path.spec.cjs` synthetic course to verify authored text/image alternative text, meaningful branching feedback, scored question, saved learner preview and both SCORM packages. Its automated result must be recorded against the candidate. This does not establish target-LMS or novice-author acceptance.

Owner/reviewer walkthrough still required:

1. Complete project/scene creation, text/image authoring, a branching decision, question, save/reopen, preview and export using only the keyboard. Verify focus entry/return and Save/Discard/Keep editing.
2. Repeat essential navigation/editing and learner interactions with an actual screen reader; record reader, browser and findings.
3. On an actual touch device, test selection, properties/bottom sheets, on-screen keyboard, navigation and playback; record device/browser.
4. Launch the candidate's SCORM 1.2/2004 packages in the intended test LMS where supported. Record package identity and runtime result separately for each profile.
5. Invite a small author pilot only after qualification findings are resolved and the pilot environment is approved. Measure task completion, wrong turns and recovery, rather than feature count.

## Evidence and boundaries

Local detailed logs are in ignored `workspace/beta-qualification-20261119/`; browser fixtures use disposable workspaces and ports 5187/8027. Normal authoring remains on 5173/8000 and its project data is preserved. Prior screenshots and refinement evidence remain under `docs/qualification/founder-refinement-003/` and `docs/qualification/authoring-flow-2026-11-17/`.

A successful local suite does not substitute for hosted exact-commit CI, physical-device/assistive-technology acceptance, target-LMS acceptance or an authorized release. Do not merge or deploy this candidate automatically.
