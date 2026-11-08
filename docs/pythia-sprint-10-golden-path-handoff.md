# Pythia Sprint 10 Golden Path Handoff

Repository context: **Chimera 1.2.0** | [MIT license](../LICENSE) | [Release notes](release-1.2.0.md). Dated evidence and independently versioned assets/contracts retain their original scope.

Updated 2026-11-02.

## Delivered

`backend/tests/test_learning_intelligence.py` now has an opt-in integration regression that exercises this complete local path through Chimera's HTTP API:

1. Generate and import a two-slide legacy PowerPoint into isolated test storage.
2. Submit `storyboard.analyze`, persist its artifact as a proposal, and record an accept decision without changing the imported storyboard.
3. Submit `storyboard.transform`, persist its proposal, and accept it with a revision precondition.
4. Submit `assessment.design`, create a native assessment proposal, and accept it with a revision precondition.
5. Submit `course.review`, persist the report, resolve its findings with notes, and confirm review does not mutate the storyboard.
6. Record the release stage as `approved`, export SCORM 2004, and validate the manifest, player entry, build status, and compatibility checks.

The test uses the configured local Pythia service and its deterministic providers. Its scripted proposal decisions and finding resolutions exercise the human-decision APIs; they are not SME approval or a live human release decision. The test does not call an external model provider or modify existing workspace projects.

## Run

Start Pythia on port 8001 as described in the [Sprint 1 handoff](pythia-sprint-1-handoff.md), then run from the Chimera repository root:

```powershell
$env:CHIMERA_PYTHIA_GOLDEN_PATH_INTEGRATION = '1'
$env:CHIMERA_PYTHIA_BASE_URL = 'http://127.0.0.1:8001'
.\backend\.venv\Scripts\python.exe -m unittest backend.tests.test_learning_intelligence.PythiaRouteTests.test_live_pythia_golden_path_imports_reviews_transforms_assesses_and_exports
```

The integration test is skipped during normal offline test runs unless `CHIMERA_PYTHIA_GOLDEN_PATH_INTEGRATION=1` is set.

## Current cross-repository check

The [Pythia Golden Path workflow](https://github.com/Darkkeep/Pythia/blob/master/.github/workflows/chimera-golden-path.yml)
runs on Pythia pushes and pull requests, every Monday, and by manual dispatch.
It checks the Pythia revision under test against current Chimera `main`, starts
Pythia with deterministic local providers, and runs the complete test above.
CI logs record both repository SHAs and both contract package SHAs and versions.
The revisions are intentionally independent: Chimera currently pins contracts
`v1.0.0`, while Pythia's Engine currently pins `v1.1.0`; successful round-trip
validation checks their actual compatibility rather than requiring their
version labels to match.

The workflow uses Pythia's `GITHUB_TOKEN` to check out Pythia itself. Configure
`PYTHIA_CONTRACTS_READ_TOKEN` under **Darkkeep/Pythia > Settings > Secrets and
variables > Actions** with read-only Contents access to private
`Darkkeep/pythia-contracts`; the workflow reports a setup error if it is absent.
Never commit or share the token value. Pull requests from forks skip the private
contract checkout.

On 2026-11-02, the full Golden Path passed locally against Chimera
`4c91da50c4b394b634507077f02fcc3c6f626491` and Pythia
`867635778c7825b5eefef6d59d7f937e750e5ee4`. Chimera used contracts commit
`1fb6584a36552ca3f9f77ba1479fef45f8137b73` (`1.0.0`); Pythia used
`c8cf6324fcd212cbc187a94d521195fea7249ece` (`1.1.0`). This was a deterministic
local-provider check, not a live-provider, LMS, or human-acceptance qualification.

## Qualification Limits

- The qualification covers SCORM 2004 package structure and Chimera build checks; it does not verify playback in a live LMS.
- Deterministic local Pythia providers validate contract and orchestration behavior, not instructional quality from a production model.
- Product demo use still requires a person to inspect the source, proposals, assessment, and course-review findings and make the release decision. The scripted test decisions are regression choreography only.
- The test does not qualify a hosted multi-tenant deployment or external-provider behavior.