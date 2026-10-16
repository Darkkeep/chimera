# Pythia Sprint 10 Golden Path Handoff

Updated 2026-10-15.

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

The integration test is skipped during normal offline test runs unless `CHIMERA_PYTHIA_GOLDEN_PATH_INTEGRATION=1` is set. On 2026-10-15, it passed against the local Pythia service.

## Qualification Limits

- The qualification covers SCORM 2004 package structure and Chimera build checks; it does not verify playback in a live LMS.
- Deterministic local Pythia providers validate contract and orchestration behavior, not instructional quality from a production model.
- Product demo use still requires a person to inspect the source, proposals, assessment, and course-review findings and make the release decision. The scripted test decisions are regression choreography only.
- The test does not qualify a hosted multi-tenant deployment or external-provider behavior.