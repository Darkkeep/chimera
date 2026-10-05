# Plan: extract onboarding into its own GitHub repository

Prepared 2026-10-05. Planning only; this document does not create a repository, move code, publish a package, or change dependencies.

## Proposed outcome

Create `Darkkeep/onboarding` as the independent home of `@guided-workflows/onboarding`. Treat the owner and repository name as proposed until implementation. Preserve the package name and its existing exports so consumers need only change how they install it.

The new repository owns the framework-independent engine, DOM renderer, optional Playwright helpers, standalone task demo, package tests, and integration documentation. Chimera remains a consumer and owns its application adapter, 48 task-specific journeys, anchors, successful-outcome signals, and backend integration tests.

Start with a private GitHub repository and versioned package tarballs attached to releases. Public visibility and registry publication are separate decisions; neither is required to extract the code. Keep `private: true` initially. Do not advertise a stable API until another external application has exercised the adapter contract.

## Current readiness and remaining coupling

The implementation already has no runtime dependencies and exposes native ESM with declarations. Its public entry points are the package root, `/dom`, `/style.css`, and `/playwright`. The Playwright peer dependency is optional.

The remaining repository dependencies are:

- Chimera's `frontend/package.json` installs `file:../packages/onboarding`.
- The task demo installs `file:../../packages/onboarding`, but runs Vite from `frontend/node_modules`; it cannot currently run from an independent checkout.
- Root npm workspaces, scripts, and lockfile manage the package and demo.
- `playwright.onboarding.config.cjs` starts both Chimera and the task demo, including the Python backend.
- `tests/onboarding/journeys.spec.cjs` mixes standalone and Chimera scenarios, and its shared helpers include Chimera setup.
- The package README links into Chimera through relative paths.
- Much of the onboarding work is currently untracked or mixed with other working-tree changes. Establish a reviewed extraction baseline before moving files; do not commit the entire working tree indiscriminately.

The implementation record reports 11 engine checks and 24 browser checks passing across three browsers, plus a separate tarball consumer check. Those are baseline evidence, not proof that extraction succeeds; repeat the applicable checks against the extracted artifact.

## Ownership and file mapping

| Current location | Destination / ownership |
| --- | --- |
| `packages/onboarding/src/` | New repository: `packages/onboarding/src/` |
| `packages/onboarding/testing/` | New repository: `packages/onboarding/testing/` |
| `packages/onboarding/test/` | New repository: `packages/onboarding/test/` |
| `packages/onboarding/package.json`, `README.md` | New repository: same locations, with independent metadata and links |
| `examples/onboarding-demo/` | New repository: same location, including the existing resize-grip asset |
| Standalone scenarios in `tests/onboarding/journeys.spec.cjs` | New repository: `tests/demo/`, with package-only helpers |
| `frontend/src/onboarding.ts`, `onboarding-journeys.ts` and UI integrations | Stay in Chimera |
| Chimera scenarios, `catalog.spec.cjs`, API/PPTX fixtures and frontend test config | Stay in Chimera |
| `docs/onboarding-implementation.md`, original plan and Chimera screenshots | Stay in Chimera; new repository receives a concise package-focused architecture and verification record |
| Existing mixed Playwright config and GitHub workflow | Split responsibility: package/demo CI in the new repository, consumer integration CI in Chimera |

Retain the package/demo workspace layout. This preserves the demo's existing relative package dependency and avoids unnecessary source moves. Add a repository-root README, license file, lockfile, scripts, `.gitignore`, Playwright config, and GitHub workflow. Verify the declared ISC license and demo asset redistribution rights before a public release.

## Implementation sequence

### 1. Establish the baseline

1. Inventory tracked, untracked, and modified onboarding files and their application dependencies. Record the selected source revision and verify it contains the complete package and demo.
2. Create focused baseline commits on a migration branch without folding in unrelated backend or frontend work.
3. Run the engine tests, full onboarding browser suite, and frontend production build. Record commands, versions, and results.
4. Record existing journey IDs, versions, namespaces, and storage-key behavior. Extraction must preserve browser-local progress and must not reset existing users' journeys.

Deliverable: a reproducible source baseline and explicit list of files to extract.

### 2. Build the independent repository locally

1. Copy the package and demo from the selected baseline into a separate checkout. Prefer an initial extraction commit with source-revision attribution; do not rewrite Chimera history. If relevant committed history later becomes important, evaluate a filtered-history export in a disposable clone.
2. Create a private root workspace manifest containing `packages/onboarding` and `examples/onboarding-demo`. Generate a new lockfile from this manifest rather than copying Chimera's dependency graph.
3. Give the demo its own pinned Vite development dependency and `dev`/`build` scripts. Replace its `../../frontend/node_modules/vite/...` command with the local Vite executable.
4. Add root scripts for engine tests, declaration checks, demo build, browser tests, and package creation. Keep the package's four exports and zero runtime dependencies.
5. Update package metadata for the proposed GitHub repository. Rewrite local install instructions and broken relative documentation links; reference Chimera as a consumer through a repository URL.
6. Add package-focused architecture, adapter-contract, contribution, release, and support documentation. Carry forward the known limitations, including modal scope and manual accessibility review needs.

Deliverable: a fresh checkout can install, test, build the demo, and pack the library without a Chimera checkout, Python, or backend service.

### 3. Separate verification and add package CI

1. Move the three existing standalone browser scenarios into the new repository. Import guide locators directly from `/playwright`; exclude Chimera-specific helpers.
2. Add a demo-only Playwright config serving port 5188 with strict port selection and no existing-server reuse. Run Chromium, Firefox, and WebKit with a pinned runner and matching browser installation.
3. Retain the engine regressions, including scoped events, skips, cancellation, and malformed storage. Add targeted renderer coverage for missing-target recovery and modal pause/resume where existing demo coverage does not exercise them.
4. Verify exported declarations in a small TypeScript consumer. Pack the library and install the tarball into a temporary consumer outside the workspace; check headless use without DOM globals, DOM import, CSS inclusion, and CommonJS Playwright-helper use when its peer is installed.
5. Add GitHub CI for clean installation, engine/declaration checks, demo build, browser/accessibility checks, and tarball smoke verification. Upload failure traces and the tested package artifact. Use a documented, fixed Node version supported by the chosen toolchain.
6. Keep all application-specific API, saved-outcome, catalog, and Chimera modal tests in Chimera. Each repository must own meaningful checks of its own boundary.

Deliverable: independently passing package CI and a tested, self-contained tarball.

### 4. Create GitHub repository and candidate release

1. Create the proposed private repository under the intended owner, push the reviewed extraction, and enable its CI.
2. Establish review and branch-protection settings appropriate to available account features. Record maintainers and release ownership.
3. Use a new version such as `0.1.1` for the first extracted artifact; never replace a version that has already been distributed. Tag the exact tested commit and attach its tarball, checksum, and release notes to the corresponding release.
4. Retain tarball distribution initially. Registry publication can follow once visibility, package scope ownership, authentication, and support expectations are decided.

Deliverable: a traceable candidate release that Chimera can consume without a sibling checkout.

### 5. Switch Chimera to the released package

1. Install the exact release artifact in Chimera's frontend. For the private-release phase, vendor the tested tarball under a documented `vendor/` path and reference it with `file:` so clean installs require no GitHub credentials. Record source tag and checksum. If a registry is selected instead, pin the exact version and configure authenticated CI installation as needed.
2. Regenerate the frontend lockfile using npm. Keep imports, adapter code, journey definitions, namespaces, versions, and stored progress unchanged.
3. Remove the extracted package and demo from Chimera only after the artifact-based consumer passes. Remove their root workspace entries and revise the root lockfile and scripts accordingly; retain the root development dependencies needed for Chimera tests.
4. Remove standalone cases and the port-5188 server from Chimera's browser suite. Preserve the Chimera API/frontend fixtures and catalog checks.
5. Update Chimera's workflow and documentation: library checks run upstream; Chimera checks its adapter, successful saves, recovery, accessibility, and production build. Link to the independent demo and package documentation.
6. Confirm no runtime, test command, or install path still requires `packages/onboarding` or the deleted demo.

Deliverable: Chimera runs from a clean checkout using the extracted artifact, with its existing walkthrough behavior and progress intact.

### 6. Validate reuse and finish the migration

Install the same artifact in a second external application, supply its own adapter and outcome assertions, and document any API changes discovered. Complete the existing novice-author pilot and manual screen-reader review before wider rollout. These product release gates do not prevent repository extraction, but they limit claims of API stability and accessibility.

## Acceptance checklist

- New repository installs and verifies independently; no Chimera, React, Python, backend, or sibling-checkout dependency is required.
- The demo runs and builds with its own dependencies, and all three existing standalone scenarios pass in all three browsers.
- Engine tests, exported declaration checks, and packed-artifact consumer checks pass.
- Package exports and runtime dependency count remain unchanged.
- Chimera installs the exact tested artifact and passes its retained browser suite and frontend build.
- Existing users can resume the same journey/project progress after the dependency switch.
- Extracted source has one authoritative home; Chimera retains application-specific journeys and tests.
- Documentation links, licensing, source provenance, artifact checksum, maintainer ownership, and release instructions are complete.

## Rollback and update policy

Keep the dependency switch and deletion of local package/demo files in a focused migration commit. If consumer validation fails, revert that commit to restore the baseline local dependency, workspaces, and test configuration. Do not change journey versions or storage keys merely to repair packaging. Keep the last verified artifact available for later release regressions.

For future updates, release and test upstream first, then open a focused Chimera dependency-update change and run its consumer checks. Avoid mutable branch dependencies. While the package remains `0.x`, document compatibility explicitly and review API changes before updating consumers.

## Decisions to settle during implementation

Recommended defaults are `Darkkeep/onboarding`, private visibility, the existing package name and ISC license subject to rights verification, a new `0.1.1` release, tarball distribution with a vendored Chimera artifact, and an attributed initial extraction commit. Confirm these choices before creating the remote or releasing; they do not block preparing the extraction locally.
