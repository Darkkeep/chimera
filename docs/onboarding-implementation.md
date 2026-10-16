# Reusable onboarding implementation

The reusable package now lives in the private [Darkkeep/onboarding repository](https://github.com/Darkkeep/onboarding). See the [repository extraction plan](onboarding-repository-plan.md) and [migration record](onboarding-repository-migration.md).

The first implementation consists of a headless package, a shared DOM renderer and Playwright helpers, and two application adapters. The package imports neither React nor Chimera. It remains private and unpublished.

| Deliverable | Location | Journey |
| --- | --- | --- |
| Engine, declarations, renderer, test helpers, adapter contract | [Darkkeep/onboarding](https://github.com/Darkkeep/onboarding) | Scoped outcomes, explicit skips, abortable preparation, versioned local progress, recovery |
| Chimera integration | `frontend/src/onboarding.ts`, `App.tsx`, `EditorDialog.tsx` | Create/select project → create and save scene → acknowledge review |
| Independent vanilla JavaScript application | [upstream task demo](https://github.com/Darkkeep/onboarding/tree/main/examples/onboarding-demo) | Create task → save edited title → persist completion |
| Chimera browser checks and isolated server fixtures | `tests/onboarding/`, `playwright.onboarding.config.cjs` | Application journeys and recovery cases; standalone checks run upstream |

## Try the walkthroughs

Install root dependencies with `npm ci`, then frontend dependencies with `npm ci --prefix frontend`. Start Chimera normally using the root README. Choose **Start / resume walkthrough** in the sidebar or in **Review tools → Guided review**. Existing projects start at scene creation; an empty workspace starts with project creation. Saves create real authored content. Restarting the guide adds another practice scene rather than resetting the project.

The independent demo now lives in [Darkkeep/onboarding](https://github.com/Darkkeep/onboarding). In that repository, run `npm ci` and `npm run dev`, then open `http://127.0.0.1:5188`. It requires no Chimera checkout or API. Chimera installs the private `0.1.1` release tarball from `vendor/onboarding`; see its [provenance and update instructions](../vendor/onboarding/README.md).

## Walkthrough catalog

Open **Review tools > Guided review > All functionality walkthroughs**. Search by task name (for example, Pythia, canvas, audio, questions, storyboard), then choose a walkthrough. The sidebar **Start / resume walkthrough** resumes the last selected task. The catalog now contains **68 walkthroughs**, including **9 Pythia workflows**, with independent browser-local progress for the selected project; **Practiced**, **Paused**, and **Ended with skips** describe practice history rather than project readiness.

| Functionality | Walkthroughs and outcomes |
| --- | --- |
| Projects and workspace | First project/scene with optional course-design references, project selection, Light/Dark/System appearance, Trash/recovery review, permission-gated hosted members and review links |
| Scene authoring | PowerPoint import, text/notes/action/type/layout/required settings, dedicated saved canvas authoring, ordering, explicitly confirmed deletion |
| Templates | PPTX upload, name/description save, source replacement, saved scene assignment |
| Media | Image/audio upload, attach/detach, attribution save, required playback, alt text/decorative save |
| Assessments | Separate save journeys for single-choice, multiple-answer, true/false, ordering, drag/drop, matching and short-answer; attempts/score/weight/remediation; confirmed removal; QTI item export |
| Learner preview | Contents navigation, scene/media/question/retry/remediation/progress review, saved comments, replies, resolve/reopen, explicit enhancement from a comment |
| Course review | Saved completion rules, successfully loaded validation followed by acknowledgment of authoring/production findings |
| Enhancement | Reference upload, preview/explicit submission, cancel/retry jobs, edit/accept/reject/reverse suggestion decisions |
| Pythia | Persisted scene analysis and separate review decision, persisted transformation and separate sequence decision, persisted assessment blueprint and separate native-item decision, saved course review, finding resolution, confirmed task cancellation and recovery |
| Connections | Intelligence Engine diagnostics and separate media-provider configuration review, successful settings save, explicit provider test and confirmed disconnect |
| Generated media | Image/narration candidate review and approve/reject, explicit regeneration |
| Exports | SCORM 2004 and 1.2, build reports, Word/answer-key choice, QTI test, JSON, Chimera storyboard archive, saved size warning |
| Restore | JSON and Chimera storyboard ZIP restoration after the existing user confirmation and successful API response |
| Management | My Work project health, saved production/release stage, identity/policy and audit activity review |

Action steps wait for their handler's successful outcome, including the project scope and scene identity where applicable. Question-type journeys also require the matching saved type. Prerequisites block with Retry/Skip/Pause when required content is absent. Preparation opens existing views/forms; it never performs a save, accepts a destructive confirmation or starts a provider run. Review steps use Next for explicit acknowledgment. Escape pauses the guide; open dialogs offer Resume walkthrough without clearing drafts. Changing projects or tasks preserves separate progress.

Pythia draft steps advance only after the returned artifact has been persisted in Chimera, not after task submission or polling completion alone. Failed draft saves leave the task step active; **Retry polling** checks the existing task without submitting another one. Scene-based draft outcomes also match the selected scene. Decisions have separate outcome identifiers, so an unrelated enhancement decision cannot finish a Pythia review step. **Accept review** records analysis review without content changes; **Accept transformation** replaces selected scenes with no undo button; assessment **Accept change** uses the native proposal mechanism. Finding resolution requires a note and records a decision rather than fixing course content. Escape pauses the guide while keeping the form open; closing the form also pauses the guide but may discard unsaved form values.

The Golden Path now includes Engine diagnostics and a recovery archive before transformation. It ends with preview, production validation, a human-declared release stage and SCORM export. Trash/recovery, hosted access and connection inspection are review walkthroughs: they do not require destructive or permission-changing actions just to practice. Hosted access is unavailable without a signed-in account with membership-management permission. Provider actions and approvals always require an explicit user decision. See the [user guide's complete Pythia process](user-guide.md#14-work-with-pythia) for setup and operational limits.

The new catalog reuses the existing Guided review rows and controls. The reusable package and independent vanilla demo retain their framework-independent contract.

## Run verification

Chimera now opens on My Work after launch and refresh. Authoring reload checks explicitly choose Resume authoring before resuming a guide; this does not reset task/project progress. The media file picker is Add media, while the existing upload outcome identifier remains unchanged. Candidate review remains available when creation is collapsed or AI is unavailable. **Settings > Intelligence Engine** provides diagnostics; **Settings > Media provider** opens the separate permission-aware media connection dialog. Neither starts a provider task when opened by a walkthrough.

The 2026-10-07 Chromium run passed 56 tests across the existing catalog/recovery workflows and My Work, Media Library, and AI connection regression specs. AI setting tests use inert mocked keys/responses and isolated server workspaces. `npm run test:management` runs the 18 My Work checks; `npm run test:onboarding -- --project chromium` runs the full Chromium suite. These results do not assert current Firefox/WebKit or live-provider qualification.

On 2026-10-15, the expanded catalog and recovery suites passed **38 Chromium tests** with `npm run test:onboarding -- catalog.spec.cjs journeys.spec.cjs --project chromium`; the frontend TypeScript/production build also passed, with a bundle-size warning. The catalog check opened all 68 task entries, verifying visible targets for available tasks and the prerequisite block for hosted-only access. New checks cover Pythia draft persistence failures and polling recovery, explicit submission, unrelated decisions, wrong-project/scene outcomes, cancellation, required resolution notes, canvas saves, release-stage saves and media-provider actions. Desktop Light (1440px) and mobile Dark (390px) Pythia guide captures, scoped axe checks and draft-preserving pause/resume passed. Pythia/provider responses were inert browser fixtures; no external AI calls, hosted membership changes or live LMS tests were performed. This run did not requalify the separate management/media/connection suites or Firefox/WebKit.

Install backend requirements into your active Python environment. The browser fixture uses the root `.venv` Python when present, otherwise `python` on Windows or `python3` elsewhere. For the README's backend virtual environment, set `$env:CHIMERA_TEST_PYTHON = (Resolve-Path backend/.venv/Scripts/python.exe).Path` before running tests in PowerShell.

```powershell
npx playwright install chromium firefox webkit
npm run verify:onboarding:artifact
npm run test:onboarding
```

The test runner starts the frontend service at 5187 and the API at 8027. Those ports must be free. It refuses to reuse an existing service. Each run creates a fresh directory under `workspace/onboarding-tests/run-*`, keeps it for diagnosis, and clears AI-provider settings. Each test writes uniquely named projects; the initial empty project selector is mocked, while project and scene saves hit the real isolated API.

For this workspace's existing documentation browser cache:

```powershell
$env:PLAYWRIGHT_BROWSERS_PATH = (Resolve-Path workspace/user-guide-capture/browsers).Path
npm run test:onboarding
```

The root test dependency is pinned to Playwright 1.59.1, matching the documentation capture version. The previously declared 1.63.0 browser download timed out, and the installed Edge fallback failed before page creation; neither result is counted as application validation. New installations should use the pinned runner's browser installer.

Use `npm run test:onboarding -- --project=chromium` for a focused run. Optional `ONBOARDING_BROWSER_CHANNEL=msedge` selects installed Edge for the Chromium project; that is not the verified browser bundle. Inspect failures with `npx playwright show-report` or `npx playwright show-trace <trace.zip>`.

## Design decisions

12ui produced four candidates. Candidate A supplied the cream guide rail, restrained task form, serif heading, proportions, and controls. Its responsive HTML and LayerDoc were reviewed before implementation. The DOM alignment kit passed its mapping gate with 62.5% existing-element coverage. Relevant palette, hierarchy, and rail-label changes were applied; its resize-grip raster is included as a real asset.

The generated design was adapted to working semantic forms and dynamic guide states. Date/status fields, draft saving, navigation links, and decorative step controls from the design were omitted because they were outside the task-demo workflow. System/Georgia fonts preserve offline operation, and labels retain stronger contrast than the lighter suggested color. The demo is a functional adaptation, not a claim of pixel-exact reproduction. Local design and alignment artifacts remain in ignored `.improve/` directories.

Driver.js was removed after browser failures showed blocked form controls and a competing Tab handler. The current renderer uses an outline and a card inside the application's dialog; it has no runtime dependency. The controller remains renderer-independent.

## Acceptance boundaries

Verification on 2026-10-05: **24 browser checks passed** (eight scenarios in Chromium, Firefox, and WebKit), **11 engine checks passed**, and the frontend TypeScript/production build passed. The engine regression checks include keeping skipped journeys finished across start/reload until an explicit restart. Before extraction, the package tarball was installed into a separate consumer directory; headless completion and the DOM-module import passed without application imports or runtime dependencies. The current portable artifact is the versioned upstream `0.1.1` release, vendored in `vendor/onboarding`. Library tests and standalone-demo browser checks now run upstream; Chimera retains adapter and catalog browser checks.

Screenshots from isolated Chromium fixtures: [Light guide](onboarding/images/chimera-guide.png), [Dark guide](onboarding/images/chimera-guide-dark.png), and [narrow standalone demo](onboarding/images/demo-narrow.png). They contain demonstration data only.

Automated verification covers real saved outcomes, failed-save draft retention, missing-target retry, Escape pause/in-dialog resume, reload/resume, skipped-step reporting, namespace/scope separation, preparation cancellation, and stale/malformed storage. Browser coverage uses Chromium, Firefox, and WebKit. Scoped axe checks cover the Chimera guide in Light/Dark appearances; the independent demo also receives a full-page narrow-window check.

These checks do not establish screen-reader conformance or usability with novice authors. A small observed pilot and manual screen-reader review remain the next release gates before wider rollout. A second external project should install the package tarball and provide its own adapter and outcome tests before treating the API as stable.

The original [onboarding plan](onboarding-plan.md) remains a planning record. Automatic branching beyond prerequisites/persisted facts, hosted authoring, telemetry, and package publication remain later scope.
