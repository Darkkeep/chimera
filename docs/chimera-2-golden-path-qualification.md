# Chimera 2.0 | Manual golden-path qualification

**Status:** Owner accepted the current local Chimera 2.0 experience as the Beta baseline on 2026-11-19. Release qualification and production promotion remain separate; see the acceptance record below.
**Branch:** `feature/chimera-2-golden-path-qualification`  
**PR:** #40 (stacked, draft; do not merge directly to production)
**Safety:** `VITE_CHIMERA_STUDIO_ENABLED` remains default-off; no Hostinger deployment, paid model run, Pythia change or schema migration.

**Later refinement:** [Founder UX Refinement 003](founder-ux-refinement-003.md) records the compact scene controls, centralized unsaved-work guard, screenshots and subsequent focused regressions. Its changes supersede the always-visible inspector and two-choice Cancel behavior described in the earlier pass below.

## Owner acceptance — Beta baseline · 2026-11-19

The Owner explicitly accepted the current local Chimera 2.0 experience as the Beta baseline: “The Owner accepts this as our Beta baseline.” This accepts the cumulative founder-led authoring UX refinements and current whole-app themes, including DARKROGUE as the purple default, Classic Dark and Light Temple, with the left navigation included.

Accepted working state: `C:\inetpub\chimera\chimera`, branch `feature/chimera-2-golden-path-qualification`, based on commit `dc21e48b56743c6f87572452a45742747e7212a3` **plus the current uncommitted implementation, tests and qualification documentation**. The base commit alone does not identify the accepted Beta. No immutable release commit or tag has yet been created.

This Owner acceptance supersedes earlier statements that founder UX acceptance is pending, for this Beta-baseline scope. Earlier dated test results and limitations remain historical evidence. It does not claim independent competitive benchmarking.

Remaining qualification: exact-candidate full cross-browser CI, physical touch and screen-reader walkthroughs, complete keyboard-only authoring, the broader representative manual-versus-Pythia course, target-LMS acceptance and invited-author pilot outcomes. Pythia collaboration and other unimplemented charter work remain separate backlog items.

No commit, push, merge, version/tag change, deployment, migration, production promotion or generation is authorized by this acceptance. Production remains outside this local baseline decision.

## Local acceptance pass — 2026-11-17

The starting checkout was clean at `dc21e48b56743c6f87572452a45742747e7212a3`, matching the fetched remote target (0 ahead / 0 behind). GitHub Actions run #223 / all 11 jobs is **user-supplied evidence for that starting commit**, not a claim that the new uncommitted changes have hosted CI qualification. This pass did not rerun the full CI suite.

Repository: `C:\inetpub\chimera\chimera`. The outer `C:\inetpub\chimera` checkout is on `main` and has existing edits; those edits were preserved. The old runtime used the outer backend. The nested checkout lacked dependencies and the Studio environment setting. This explains the older local experience; package metadata still reading 1.2.0 is not the Studio activation switch.

Local setup now uses Node 24.5.0, Python 3.13.1 through the existing outer backend virtualenv, and lockfile-installed Node dependencies. `pip check` passed. `frontend/.env.local` contains `VITE_CHIMERA_STUDIO_ENABLED=true` and is excluded locally via `.git/info/exclude`. No other environment values were printed or overwritten. The pinned submodule is clean at `1fb6584a36552ca3f9f77ba1479fef45f8137b73` (`v1.0.0`).

The reported Git for Windows submodule failure **did not reproduce**: fetch, `submodule update --init --recursive`, `submodule status`, and `submodule foreach 'git rev-parse --short HEAD'` succeeded. Git resolves to `C:\Program Files\Git\cmd\git.exe`; its bundled `bin\sh.exe` and `usr\bin\sh.exe` exist. `where.exe sh` finds no shell on the outer PATH, but this did not prevent Git from using its bundled shell. No PATH, registry, installation or security changes were made. Without the original error text, attributing the earlier failure to PATH would be speculation.

Running development services: frontend `http://127.0.0.1:5173`, backend `http://127.0.0.1:8000`, isolated classic comparison frontend `http://127.0.0.1:5174` (process override disables Studio). The normal frontend proxies `/api` to the local backend. VS Code was directed to the nested checkout. The backend uses the nested local workspace, not production data.

### Acceptance matrix

PASS means the stated bounded check was observed. It does not mean founder acceptance, full accessibility certification, or LMS qualification.

| Criterion | Result | Evidence / reproduction |
| --- | --- | --- |
| Correct checkout, dependencies, pinned contracts | PASS | Clean starting tree, exact remote match, npm lockfile installation, `pip check`, submodule commands above. |
| Studio activation | PASS | Open 5173, create/select project, choose **Studio 2.0 preview**. |
| Create project and three scenes entirely through UI | PASS | Create project → Studio → Add a scene → content, interaction, question. No API creation/seeding in this walkthrough. |
| Text editing, formatting and geometry | PASS | Edit on stage → select heading → change text → Bold → X=120 → Save. Saved data retained text, bold and X after reload. Keyboard-authored extra text also persisted. |
| Upload and place an image; alternative text | PASS | Media library → Add media file input → upload synthetic PNG → Storyboard → Edit on stage → select image in library dropdown → Add selected image → inspector alternative text → Save. File input was driven by Playwright, not an OS chooser walkthrough. Saved `imageAltText` verified after reload. |
| Meaningful manual branch and approval | PASS | Separate interaction scene → Build learner interaction → edit question, both choices and distinct safe/unsafe feedback → exercise actual learner widget → author review checkbox → Save. No Pythia generation required. |
| Scored question authored through UI | PASS | Question scene → Edit knowledge check → enter prompt/two answers → mark correct answer → two attempts / 100% threshold / weight 1 → Save. |
| Close/reopen persistence | PASS | Reload/reopen project; inspect all three saved scenes, branch choices/feedback, image alt and question scoring settings. Read-only API inspection corroborated UI work. |
| Real learner preview | PASS | Visit all three scenes, exercise both branch choices, answer question correctly: **Course passed · Score 100%**. [Screenshot](qualification/authoring-flow-2026-11-17/learner-score.png). |
| Validation | PASS | Studio → Validate: **0 errors · 0 warnings** for the original revision-12 lesson. Later keyboard/concurrency experiments changed the synthetic lesson; the earlier clean result is not claimed for every later revision. |
| SCORM 1.2 and 2004 | PASS | Publish / export → Build both profiles → actual downloads; both ZIP integrity checks pass, contain manifest and three scenes. Targeted golden-path test additionally verifies saved branch, assessment and image alt in both packages. ZIPs retained under ignored `workspace/local-activation/`. |
| Desktop 1440 and 1100 layouts | PASS | Scene/stage/inspector and inline editor inspected at both widths; no page horizontal overflow. Screenshots linked below. |
| Mobile 390 layout | PASS | Essential authoring controls remain available by scrolling. New menu defaults closed; drawer opens without consuming stage width. Timeline intentionally has its own horizontal scroll. This is a layout smoke check, not endorsement of comfortable phone authoring. |
| Keyboard-only text authoring | PASS | Tab → Edit on stage → Enter → Add text → Enter → inspector textarea → type → Tab to Save → Enter. Persisted text checked. This sampled route required 18 / 5 / 39 / 13 Tab presses respectively before the menu change; significant friction remains. |
| Entire course authored exclusively by keyboard / assistive technology | NOT TESTED | Upload chooser, all interaction fields and every assessment type were not walked end to end without pointer automation. No screen reader was exercised. |
| Preview focus entry, containment and restoration | PASS | Confirmed starting defect: BODY retained focus; Tab reached a background Play button; exit returned to BODY. Fixed in `CoursePreview.tsx`. Regression covers entry, reverse wrap, forward wrap, Escape and restoring Learner preview focus. |
| Undo / Redo / Cancel | PASS | Add object: 2→3, Undo: 3→2, Redo: 2→3. Cancel first dismissed the native discard prompt and retained draft; accepting it discarded unsaved text and left persisted text unchanged. |
| Concurrent revision guard | PASS | Open same scene in two tabs, save first, save stale second: conflict message retains draft; persisted title is first save, not stale overwrite. [Screenshot](qualification/authoring-flow-2026-11-17/revision-conflict.png). |
| Restricted editor permissions | PASS | Backend access tests reject reviewer edit/export/approval. Separate UI fixture simulates team auth configuration and `canEdit=false`: review-only screen, zero Edit scene controls. UI fixture does not establish a real hosted reviewer session. [Screenshot](qualification/authoring-flow-2026-11-17/restricted-ui.png). |
| Real restricted-account browser login/session | NOT TESTED | Normal runtime intentionally uses local single-user identity; no production or hosted identities altered. |
| Classic editing with flag disabled | PASS | 5174 uses `VITE_CHIMERA_STUDIO_ENABLED=false`: no Studio action; classic Edit scene opens, Save completes and closes. Studio smoke also verifies reversible Classic storyboard navigation. |
| No manual-authoring model requests | PASS | Request monitor recorded no matching Pythia/model POSTs during the resumed authoring/preview flow. Both targeted native and golden-path tests independently enforce no model POST. The initial monitoring session was reset after a tool timeout, so no claim of a single uninterrupted network trace is made. |
| Collapsible workspace menu | PASS | Desktop 232px menu collapses to 52px rail, reclaiming 180px, and preference survives reload. Mobile drawer defaults closed, background inert, keyboard wrap/Escape, backdrop close, restored toggle focus and Create project field focus covered by targeted tests. |
| Automated accessibility smoke | FAIL | Axe on Studio identified one moderate `page-has-heading-one` issue: Studio title is H2 without H1. No other violations in that captured state; this is not a full WCAG audit. [Details](qualification/authoring-flow-2026-11-17/axe-summary.json). |
| Founder UX acceptance and LMS imports | NOT TESTED | Agent-operated browser evidence is preparation for founder review. No LMS instance was used. |

### Confirmed defects, fixes and opportunities

**Fixed:** learner preview lacked initial focus, focus containment and reliable focus restoration. The small fix preserves its existing player, keyboard scene navigation, score logic and nested native assessment-feedback dialog. The regression passed after accounting for StrictMode and the temporarily disabled authoring trigger.

**User-requested improvement implemented:** `WorkspaceNavigation.tsx` wraps the existing menu contents. Desktop collapse preference is browser-local; mobile uses an overlay drawer, closes on navigation, Escape or backdrop, restores toggle focus and honors reduced motion. No routes, permissions, project schema or export semantics changed.

**Open confirmed issue:** Studio has no level-one heading in the captured state. Reproduce: open Studio and run Axe, or inspect the heading hierarchy. This is recorded separately from the preview focus defect; no broad typography redesign was attempted.

**Opportunities, not proven data-loss defects:** the timeline sits before the natural inspector in Tab order; 39 steps separated Add text from its text field. At 390px the scene navigator precedes the stage and the inspector follows it, making a long vertical journey; timeline scrolling is intentional. Image placement requires leaving Studio to upload, returning, selecting the uploaded file, then clicking a separate insertion control. The tiny white synthetic fixture and overlapping test objects are authored test content, not evidence of renderer corruption.

### Checks and recommendation

- Final targeted Chromium run: **5 passed** — `studio.spec.cjs`, `studio-native.spec.cjs`, `studio-golden-path.spec.cjs`, and two `workspace-navigation.spec.cjs` cases (14.7 seconds).
- Focused backend: **20 passed** — `test_platform_access`, `test_authoring`, `test_scorm_tracking` (8.674 seconds). Initial run errored because inherited `CHIMERA_DEPLOYMENT_PROFILE=local` conflicts with the tests' temporary team workspace; rerun with that variable removed passed. This was environment configuration, not an application revision/permission defect.
- Final TypeScript/Vite build passed. Existing large-bundle warning remains. Lockfile installation reported five high npm audit advisories; no dependency versions were changed in this acceptance pass.
- `git diff --check` passed. Changes remain local and uncommitted; no merge, push, production deploy, paid generation or Pythia service changes.

Run the targeted browser checks from this repository with `CHIMERA_STUDIO_TEST=true`, `VITE_CHIMERA_STUDIO_ENABLED=true`, and `CHIMERA_TEST_PYTHON=C:\inetpub\chimera\backend\.venv\Scripts\python.exe`:

```powershell
node node_modules/@playwright/test/cli.js test --config playwright.onboarding.config.cjs --project=chromium studio.spec.cjs studio-native.spec.cjs studio-golden-path.spec.cjs workspace-navigation.spec.cjs
```

Use `--project=chromium` with the equals sign so following filenames are not parsed as additional project names. Browser tests create isolated disposable workspaces and use ports 5187/8027.

**Recommendation:** ready for guided founder UX acceptance on desktop. The no-AI creation-to-export path is demonstrated through actual UI authoring, with preserved revision and access guards. Do not yet mark Authoring Flow 1.0 fully accepted across mobile, keyboard and assistive technology, or declare LMS compatibility from ZIP checks.

Next three highest-value improvements:

1. Shorten the keyboard path to selected-object properties; restore focus predictably after inline Save/Cancel; complete a screen-reader and keyboard-only full-course walkthrough, including the heading correction.
2. Add compact mobile scene/inspector disclosure around the stage and test editing at 390px with touch and the on-screen keyboard. The new workspace drawer removes the large navigation block but does not solve every small-screen authoring constraint.
3. Make upload-and-place clearer within the existing Studio/media workflow, then have the founder complete a fresh lesson unaided to validate discoverability and mental load.

Evidence: [original 1440](qualification/authoring-flow-2026-11-17/studio-1440.png), [original 1100](qualification/authoring-flow-2026-11-17/studio-1100.png), [inline editor 390](qualification/authoring-flow-2026-11-17/editor-390.png), [desktop collapsed](qualification/authoring-flow-2026-11-17/menu-collapsed-1440.png), [mobile closed](qualification/authoring-flow-2026-11-17/menu-mobile-closed.png), [mobile drawer](qualification/authoring-flow-2026-11-17/menu-mobile-open.png), [structured observations](qualification/authoring-flow-2026-11-17/results.json).

## Original automated fixture record

The sections below describe the pre-existing API-seeded automation, not the separate UI-created acceptance lesson above.

## Tested authoring journey

A fully synthetic lesson, `Studio manual golden path`, has three saved scenes:

1. **Recognize the signal**: content scene with native text, image, author-edited title/bold formatting and contextual image alternative text.
2. **Choose a response**: native branching interaction. A human author sets the decision question, both choices and distinct feedback in the **inline Studio interaction editor**, reviews and saves with the existing revision-checked scene API. The preview is the real `NativeExperience`.
3. **Check your judgment**: a scored true/false knowledge check with attempts, correctness and feedback. The test changes the prompt through the **existing real question editor**, then saves.

The browser opens the course's actual learner preview, then builds **both SCORM 1.2 and SCORM 2004** through real export routes. Each ZIP is extracted, its `imsmanifest.xml` and playback assets are checked, and the packaged `storyboard.json` is examined for all three scenes, the branch and its scored question, and the authored image alternative text. No model/consultation POST may occur.

## Setup versus authored steps

The fixture starts with a real project, three scenes, uploaded synthetic PNG and a valid question created through the project's **actual authenticated APIs** to avoid coupling the visual/interaction export test to onboarding. It does **not** prove that every project/scene/assessment creation click path in Studio has been completed by an unaided human author. These must be covered by a separate owner walkthrough before authoring-flow release.

The test changes content through real UI controls; it does not mock save, preview, export, media, SCORM player or Pythia.

## Code changes

- `StudioNaturalInspector`: selected image now exposes alternative text in place, next to its asset and position/size controls.
- `SceneVisualEditor`: image descriptions are a draft setting with unsaved-work detection and revision-checked Save, not an extra side-effect call.
- `App.saveVisualScene`: persists the edited descriptions together with layout and other scene settings on the same existing PATCH.
- `tests/onboarding/studio-golden-path.spec.cjs`: synthetic course acceptance fixture, marked opt-in with `CHIMERA_STUDIO_TEST=true`. The workflow's existing `studio` filter includes this test.

## Qualification evidence requirements

Before declaring Authoring Flow 1.0 completed:

1. GitHub CI successful for the **exact head commit**: backend/visual/auth, full Chromium/Firefox/WebKit regression and opt-in Chromium Studio smoke including this fixture.
2. Both ZIPs extract successfully and retain the same scene text, image alt, native decision and assessment.
3. Test human walkthrough of scene creation, asset upload, inline authoring, interaction construction, question editing, learner preview and export, on desktop and narrow viewport.
4. Test keyboard-only element/interaction editing, focus restoration, unsaved-work cancellation and concurrent revision errors.
5. If requested for actual LMS usage, import and launch both profiles in appropriate LMS test instances. A valid SCORM ZIP is not evidence of LMS-specific compatibility.
6. Ensure classic editor default-off behavior remains unchanged; Quiet Counsel stays parked, specialist-tool brokerage is independent.

**No release recommendation until gates are satisfied.**


## 2026-11-18 menu/inspector and swatch follow-up

The approved menu system and floating inspectors are implemented locally. See `founder-ux-refinement-003.md`, section “Authoring menu system and project swatches,” for the complete capability map, preserved authoring models, browser-local swatch scope and remaining UX limits. Qualification includes responsive Studio panels, course colors and saved swatches, direct flourish application, native activity/scored-question routing and the existing dirty/revision/permission paths. This local implementation does not supersede founder acceptance, assistive-technology/touch review or exact-final-revision CI.
