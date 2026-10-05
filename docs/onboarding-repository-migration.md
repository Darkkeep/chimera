# Onboarding repository migration

Implemented 2026-10-05 using the authorized defaults in the [extraction plan](onboarding-repository-plan.md).

## Result and ownership

- Private repository: [Darkkeep/onboarding](https://github.com/Darkkeep/onboarding).
- Experimental release: [v0.1.1](https://github.com/Darkkeep/onboarding/releases/tag/v0.1.1), containing the tested tarball and SHA256SUMS.
- Upstream source revision: `01efd81d12116a57b14adf7c94e73c53fae04f60`.
- Local independent checkout: `C:/Users/Erik.Hart/VS/onboarding`.
- Chimera migration branch: `extract-onboarding-repository`.
- Maintainer/release owner: Darkkeep. Upstream main requires one approving review and passing `verify`, including for administrators; force pushes and deletion are disabled.

The engine, renderer, declarations, Playwright helpers, standalone demo and their tests belong upstream. Chimera retains its adapter, 48 journeys, UI anchors, outcome signals, real API fixtures and catalog tests. Both Chimera manifests install the same vendored tarball: the frontend uses runtime exports and root tests use optional Playwright helpers. Neither needs a sibling checkout or GitHub credentials.

Artifact SHA256: `60c1a8670f4311a45653373744c2ec1f7a18e1b5a99dac221cf88ddf5e873bff`. The authenticated GitHub release download matches it. See [vendor provenance and update instructions](../vendor/onboarding/README.md).

## Baselines and compatibility

`f91830e` records the reusable source, demo, test fixtures and plan. `88a8a40` records the existing application onboarding integration. `57ddc76` records its pre-cutover local package dependency. Existing unrelated backend edits and Playwright scaffold files were left outside migration commits.

Reusable source and declarations are byte-identical after extraction. Chimera's adapter, journey IDs/versions, namespace, events and progress-key contract are unchanged. Production frontend assets were identical before and after the dependency switch. The package keeps its four exports and no runtime dependencies. The package remains private and unpublished to npm.

## Validation

The initial baseline passed 11 engine checks and the frontend build; its enlarged browser suite passed 84 of 90 checks. Those six failures were not accepted as validation. Focused reruns identified a label locator that stopped matching a populated textarea, shared template selection, and excessive default concurrency. Consumer tests now locate the prompt by accessible textbox name, replace the intended named template, allow the multi-operation template journey enough time, and use three workers.

Upstream validation after a fresh `npm ci`: 11 engine checks, strict exported-declaration checks, demo production build, packed-artifact installation into an external directory, headless ESM execution, DOM import, CSS inclusion, CommonJS Playwright helper import and consumer declarations passed. Its four browser scenarios passed in all three browsers (12 checks), including missing-target recovery and modal draft preservation/resume.

Both upstream GitHub Linux CI runs passed: [main](https://github.com/Darkkeep/onboarding/actions/runs/37333718732) and [release tag](https://github.com/Darkkeep/onboarding/actions/runs/37333882740).

Chimera artifact checksum/export verification, production build and all 81 retained browser checks passed across Chromium, Firefox and WebKit. After removing the local package/demo sources, a clean detached worktree at `effa1eb` installed both dependency trees with `npm ci`, passed artifact verification and the production build, and passed all 81 browser checks again using the committed backend (excluding the unrelated working-tree storage edits). This verifies the consumer without a sibling package checkout. The clean worktree and isolated fixture outputs remain under ignored `workspace/onboarding-extraction/` for diagnosis.

An explicit upgrade check wrote paused progress with the baseline `0.1.0` engine and resumed/completed it using the installed `0.1.1` artifact without changing storage keys. The published release download checksum also matched the vendored bytes.

The Chimera migration is pushed as [draft PR #1](https://github.com/Darkkeep/chimera/pull/1); its Linux consumer [CI run](https://github.com/Darkkeep/chimera/actions/runs/37334739347) independently verifies the committed application. The PR remains unmerged.

## Rollback and future updates

Revert the focused artifact-cutover commit `effa1eb` to restore the source package/demo, old dependency and mixed test configuration. The preceding `57ddc76` baseline includes the local frontend dependency. Do not revert the baseline application integration or alter progress keys to repair packaging. Keep the upstream release available.

Future changes originate upstream, release as a new version, and enter Chimera through a focused artifact/manifest/lockfile update with consumer verification. Do not modify the vendored tarball or install a mutable branch.

## Remaining product gates

A temporary external record application installed the tarball and supplied its own adapter and saved-outcome assertions. This establishes an automated integration boundary, not adoption by a second maintained project. A second independently maintained application, observed novice-author pilot and manual screen-reader review remain pending before API stability or wider rollout claims. Asset redistribution rights must be verified before public visibility; both repositories' extraction artifacts remain private. These human reviews cannot be replaced by automated checks.
