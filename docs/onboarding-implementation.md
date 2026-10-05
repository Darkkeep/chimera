# Reusable onboarding implementation

For the proposed independent GitHub repository, see the [repository extraction plan](onboarding-repository-plan.md).

The first implementation consists of a headless package, a shared DOM renderer and Playwright helpers, and two application adapters. The package imports neither React nor Chimera. It remains private and unpublished.

| Deliverable | Location | Journey |
| --- | --- | --- |
| Engine, declarations, renderer, test helpers, adapter contract | `packages/onboarding/` | Scoped outcomes, explicit skips, abortable preparation, versioned local progress, recovery |
| Chimera integration | `frontend/src/onboarding.ts`, `App.tsx`, `EditorDialog.tsx` | Create/select project → create and save scene → acknowledge review |
| Independent vanilla JavaScript application | `examples/onboarding-demo/` | Create task → save edited title → persist completion |
| Browser checks and isolated server fixtures | `tests/onboarding/`, `playwright.onboarding.config.cjs` | Both journeys and recovery cases |

## Try the walkthroughs

Install root dependencies with `npm ci`, then frontend dependencies with `npm ci --prefix frontend`. Start Chimera normally using the root README. Choose **Start / resume walkthrough** in the sidebar or in **Review tools → Guided review**. Existing projects start at scene creation; an empty workspace starts with project creation. Saves create real authored content. Restarting the guide adds another practice scene rather than resetting the project.

For the independent demo, run from the repository root:

```powershell
node frontend/node_modules/vite/bin/vite.js --config examples/onboarding-demo/vite.config.mjs
```

Open `http://127.0.0.1:5188`. The demo has no Chimera API dependency; tasks and practice progress remain in that browser's local storage.

## Walkthrough catalog

Open **Review tools ? Guided review ? All functionality walkthroughs**. Search by task name (for example, audio, questions, backup), then choose a walkthrough. The sidebar **Start / resume walkthrough** resumes the last selected task. Each of the 48 walkthroughs has independent browser-local progress for the selected project; **Practiced**, **Paused**, and **Ended with skips** describe practice history rather than project readiness.

| Functionality | Walkthroughs and outcomes |
| --- | --- |
| Projects and workspace | First project/scene, project selection, Light/Dark/System appearance |
| Scene authoring | PowerPoint import, text/notes/action/type/layout/required settings, saved ordering, explicitly confirmed deletion |
| Templates | PPTX upload, name/description save, source replacement, saved scene assignment |
| Media | Image/audio upload, attach/detach, attribution save, required playback, alt text/decorative save |
| Assessments | Separate save journeys for single-choice, multiple-answer, true/false, ordering, drag/drop, matching and short-answer; attempts/score/weight/remediation; confirmed removal; QTI item export |
| Learner preview | Scene/media/question/retry/remediation/progress review, saved comments, replies and resolve/reopen |
| Course review | Saved completion rules, successfully loaded validation followed by acknowledgment of authoring/production findings |
| Enhancement | Reference upload, preview/explicit submission, cancel/retry jobs, edit/accept/reject/reverse suggestion decisions |
| Generated media | Image/narration candidate review and approve/reject, explicit regeneration |
| Exports | SCORM 2004 and 1.2, build reports, Word/answer-key choice, QTI test, JSON, portable backup, saved size warning |
| Restore | JSON and portable ZIP restoration after the existing user confirmation and successful API response |
| Management | My Work project health, approvals, identity/policy and audit activity review |

Action steps wait for their handler's successful outcome, including the project scope and scene identity where applicable. Question-type journeys also require the matching saved type. Prerequisites block with Retry/Skip/Pause when required content is absent. Preparation opens existing views/forms; it never performs a save, accepts a destructive confirmation or starts a provider run. Review steps use Next for explicit acknowledgment. Escape pauses the guide; open dialogs offer Resume walkthrough without clearing drafts. Changing projects or tasks preserves separate progress.

The new catalog reuses the existing Guided review rows and controls. The reusable package and independent vanilla demo retain their framework-independent contract.

## Run verification

Install backend requirements into your active Python environment. The browser fixture uses the root `.venv` Python when present, otherwise `python` on Windows or `python3` elsewhere. Override with `CHIMERA_TEST_PYTHON` if needed.

```powershell
npx playwright install chromium firefox webkit
npm run test:onboarding:core
npm run test:onboarding
```

The test runner starts frontend services at 5187 and 5188 and the API at 8027. Those ports must be free. It refuses to reuse an existing service. Each run creates a fresh directory under `workspace/onboarding-tests/run-*`, keeps it for diagnosis, and clears AI-provider settings. Each test writes uniquely named projects; the initial empty project selector is mocked, while project and scene saves hit the real isolated API.

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

Verification on 2026-10-05: **24 browser checks passed** (eight scenarios in Chromium, Firefox, and WebKit), **11 engine checks passed**, and the frontend TypeScript/production build passed. The engine regression checks include keeping skipped journeys finished across start/reload until an explicit restart. The package tarball was installed into a separate consumer directory; headless completion and the DOM-module import passed without application imports or runtime dependencies. The portable artifact is `workspace/onboarding-package/guided-workflows-onboarding-0.1.0.tgz` (ignored local output; regenerate with `npm pack`).

Screenshots from isolated Chromium fixtures: [Light guide](onboarding/images/chimera-guide.png), [Dark guide](onboarding/images/chimera-guide-dark.png), and [narrow standalone demo](onboarding/images/demo-narrow.png). They contain demonstration data only.

Automated verification covers real saved outcomes, failed-save draft retention, missing-target retry, Escape pause/in-dialog resume, reload/resume, skipped-step reporting, namespace/scope separation, preparation cancellation, and stale/malformed storage. Browser coverage uses Chromium, Firefox, and WebKit. Scoped axe checks cover the Chimera guide in Light/Dark appearances; the independent demo also receives a full-page narrow-window check.

These checks do not establish screen-reader conformance or usability with novice authors. A small observed pilot and manual screen-reader review remain the next release gates before wider rollout. A second external project should install the package tarball and provide its own adapter and outcome tests before treating the API as stable.

The original [onboarding plan](onboarding-plan.md) remains a planning record. Automatic branching beyond prerequisites/persisted facts, hosted authoring, telemetry, and package publication remain later scope.
