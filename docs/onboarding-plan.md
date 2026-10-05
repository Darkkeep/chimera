# Plan: interactive onboarding for Chimera

Prepared 2026-10-05. Planning only; no onboarding runtime or dependency changes are included.

## Intended outcome

Give authors optional, contextual walkthroughs that highlight the actual control, explain the next action, and recognize successful completion. Users can dismiss, resume, or restart a walkthrough and open the corresponding user-guide instructions.

This plan interprets “Walk-Me-style” as guided use of Chimera, with Playwright supporting discovery, testing, and documentation. Teaching developers to use Playwright itself would be a separate learning journey.

## Current foundation

- `frontend/src/GoldenPathView.tsx` already provides seven project-aware checklist steps, including content, media, accessibility, preview, and validation. Extend this entry point rather than introducing a competing checklist. Existing “done” indicators reflect available project data, not proof that a user reviewed it.
- `frontend/src/App.tsx` owns project selection, view selection, dialogs, and save operations. These are the integration points for navigation and successful-action signals.
- `docs/user-guide.md` supplies task instructions and known limitations across thirteen processes. Reuse its labels and link to its task sections; verify copy against current controls before release.
- `docs/user-guide/support/` supplies an isolated demonstration workspace and browser capture scripts. Adapt these fixtures for tests rather than using an author's normal workspace.
- Root Playwright configuration and dependencies are present as untracked files at inspection time. Configuration has no active base URL or service startup; `tests/example.spec.js` targets playwright.dev. Review and preserve this in-progress setup. Root CommonJS package metadata and ESM-style configuration/tests also need compatibility verification before relying on the runner.
- Documentation capture describes Playwright 1.59.1, while the root dependency declares ^1.63.0. Establish one verified, locked tool version and compatible browser installation, then update capture instructions.

## Recommended tools

| Tool | Role | Decision |
| --- | --- | --- |
| Driver.js | Highlight controls and render contextual tour popovers | First prototype candidate: TypeScript, no dependencies, MIT license. Validate keyboard behavior and interaction with existing dialogs before adopting. [Official site](https://driverjs.com/) and [async tours](https://driverjs.com/docs/async-tour). |
| Playwright Test | Exercise journeys, observe saved outcomes, capture screenshots, diagnose failures | Use the existing setup after configuring it for Chimera. Prefer role/name locators and explicit test IDs where needed. [Locators](https://playwright.dev/docs/locators), [best practices](https://playwright.dev/docs/best-practices). |
| Playwright Inspector/codegen and Trace Viewer | Discover controls, draft test interactions, inspect failed runs | Review generated locators and replace recording artifacts with meaningful assertions. Keep traces in the isolated test environment. [Debugging](https://playwright.dev/docs/debug), [Trace Viewer](https://playwright.dev/docs/trace-viewer). |
| @axe-core/playwright | Automated checks on tour popovers and the underlying interface | Scan each distinct open dialog/popover state; supplement with manual keyboard and screen-reader checks. [Official integration guidance](https://playwright.dev/docs/accessibility-testing). |
| Shepherd.js | Alternative tour renderer | Consider if Driver.js fails the interaction/accessibility prototype. Its documentation currently describes AGPL-3.0 for open-source/non-commercial use and commercial licensing; review terms before adoption. [Official documentation](https://docs.shepherdjs.dev/). |

Recommendation: start with a local tour implementation using Driver.js, React-owned journey state, and Playwright verification. This fits the current local application and avoids adding an external service requirement. A hosted digital-adoption platform can be evaluated separately if centralized non-developer editing and organization-wide reporting become requirements.

## Journey scope

Use short task-specific walkthroughs, typically four to eight steps, instead of a single tour covering the entire guide.

| Priority | Journey | Completion evidence |
| --- | --- | --- |
| MVP | First project and first scene | User creates a project, creates or imports content, saves a scene, and sees the saved content after reload. Manual scene creation is the default path; PowerPoint import is an alternative branch. |
| MVP | Preview and validate | User opens learner preview, returns to authoring, runs validation, and inspects findings or a clean result. Completing the journey does not imply the course passed validation. |
| Next | Attach media and describe images | Saved asset association and alt text/decorative designation appear in project state. |
| Next | Export and backup | User chooses the intended export profile, observes build/download success, and learns the distinction between portable backup and JSON. Do not imply LMS qualification from a download. |
| Later | Assessments, templates, comments, AI enhancement | Saved outcomes for each task. AI paths appear only when availability is known and require explicit user submission/acceptance; use inert fixtures in automated tests. |

Keep deletion and restore outside the initial tour. If added later, guide users through the existing confirmations and backup instructions without automatically confirming destructive operations.

## Runtime design

1. Add a React onboarding provider/controller and a versioned journey registry, proposed under `frontend/src/onboarding/`. Each step declares an ID, target anchor, instructions, prerequisite, navigation action, completion condition, and guide link.
2. Add stable `data-onboarding` anchors to relevant controls. Tests should normally find controls by accessible role/name; use a matching explicit test ID only where a semantic locator is ambiguous. Avoid CSS classes, DOM position, and translated text as runtime anchor contracts.
3. Keep business actions in existing application handlers. Emit successful-action signals after confirmed saves/imports/builds, including the applicable project and scene IDs. A click or a changed revision alone must not count as task completion.
4. Separate informational steps, acknowledged by Next, from action steps that advance after their named outcome. Support branching for empty projects, existing content, missing media, and unavailable capabilities.
5. Navigate through App's existing view/dialog callbacks before attaching a popover. Wait for the intended target to mount and become usable. If it cannot appear, show a recoverable explanation and Retry/Skip/Exit instead of an orphaned overlay.
6. Suspend the tour when switching projects, entering an unrelated task, or encountering an operation error. Revalidate prerequisites when resuming. Preserve unsaved form text and never navigate away from it without the application's appropriate handling.
7. Persist journey version, last step, explicit acknowledgments, and dismissal locally. Scope task progress by project; keep general interface orientation separate. Reconcile stored progress with current project state after reload. Explain that progress belongs to this browser; allow reset, and tolerate unavailable local storage.
8. Extend Guided review with Start/Resume actions and offer a dismissible first-use invitation. Keep a plain checklist/help path available if overlays are unsuitable. Do not interrupt every launch with an automatic tour.

Accessibility requirements: visible keyboard focus, reachable highlighted controls, Escape to exit, focus restoration on close, correct popover naming, and predictable focus when a modal opens. Avoid competing focus traps between tour and application dialogs. Support reduced motion, zoom, constrained windows, and Light/Dark/System appearances. Automated axe results alone are not accessibility acceptance.

## Implementation sequence and review gates

### 1. Establish the journey contracts

Inventory current controls and save signals for the two MVP journeys. Record prerequisites, expected outcomes, guide links, and proposed anchors. Audit checklist status labels so “content exists” does not become “review completed.” Deliver a journey matrix and a list of App integration points.

Gate: every planned step maps to an implemented control and a meaningful completion condition.

### 2. Make Playwright reliable for Chimera

Verify configuration/module compatibility and consolidate the supported Playwright/browser versions. Configure an explicit isolated frontend URL, backend workspace, service readiness, and reproducible fixture creation. Give mutating tests distinct fixture projects; use serial execution until fixture isolation is proven. Preserve user-created test setup while replacing or separating scaffold examples. Add documented commands for onboarding tests and report inspection.

Gate: a browser can create and save a scene in isolated storage and verify it after reload without touching normal authoring data or invoking an AI provider.

### 3. Prototype one complete walkthrough

Implement the provider, anchors, and first-project journey with Driver.js. Include a real save step, a modal, resume, dismissal, and a missing-target recovery. Check keyboard interaction and existing dialog focus before committing to the renderer. Review the concrete prototype before expanding journey coverage.

Gate: the user completes the workflow with mouse or keyboard; failed saves do not advance; dismissal leaves the application usable.

### 4. Add MVP coverage and documentation

Add preview/validation, checklist integration, versioned progress, guide links, and conditional entry states. Use Playwright to refresh selected documentation images from the isolated fixture. Keep runtime copy and guide instructions aligned through an explicit journey-to-guide mapping; do not attempt to convert Markdown tables automatically into executable tours.

Gate: all MVP paths and recovery scenarios below pass, and screenshots show the implemented interface.

### 5. Pilot and expand

Observe a small group of first-time authors completing the tasks without coaching. Record completion rate, time to first saved scene, abandonment step, confusing copy, and recovery success. Start with observation and local, content-free counters if needed; external analytics require a separate product decision. Expand only after recurring problems in the MVP are resolved.

## Verification and release criteria

- Happy paths: blank-project creation, existing-project entry, saved scene reload, learner preview, validation findings, and clean validation.
- Recovery: failed save, revision conflict, unavailable target, disabled control, interrupted import, project switch, reload/resume, cleared storage, stale journey version, and repeated start/dismiss cycles without duplicate listeners or overlays.
- Interaction: keyboard-only completion, Escape, focus return, modal focus, screen-reader announcements, reduced motion, zoom, small supported window, and each appearance mode.
- Browser coverage: Chromium during development; Firefox and WebKit before release using the configured projects. Interpret this as browser-engine coverage rather than certification of every OS/browser combination.
- Assertions: verify persisted business outcomes, correct project/scene association, and conditional branches. Use snapshots for a small set of overlay/dialog positioning states, rather than treating screenshot matches as proof of workflow correctness.
- Isolation: fixtures stay in a dedicated workspace, tests never overwrite an author's project, and AI examples remain inert. Retain traces on failure and review artifacts for fixture-only content.

Release the MVP when both journeys pass these checks, a novice can complete them without facilitator intervention, and the ordinary interface remains usable after exit or failure. Keep the existing guide/checklist available throughout rollout.

## Planned deliverables

Journey matrix; reviewed tour renderer prototype; React controller and step registry; App action/anchor integration; isolated Playwright fixtures and onboarding specs; accessibility review record; refreshed guide images and maintainer instructions; pilot findings and prioritized follow-up work.

Suggested sizing for one developer: foundation and contracts 1–2 days; prototype 2–3 days; second journey, persistence, and tests 3–5 days; accessibility review and pilot corrections 2–3 days. These are planning estimates, not a delivery commitment; dialog behavior and test-environment setup are the main uncertainties.
