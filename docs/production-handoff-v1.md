# Import a Pythia production handoff

In the target project, choose **Export → Import JSON** and select the Pythia handoff. Review the pending suggestion before choosing **Accept change** or **Reject**. Acceptance adds the proposed scenes and any single-choice questions as one storyboard revision. Open the handoff details to inspect objectives, source locators, media and interaction instructions. Media and interaction references can be used during authoring.

The import validates the schema and references and accepts up to 1 MB and 40 scenes. It records the target storyboard revision. If that revision changes, acceptance fails and the handoff needs a new ID before resubmission. Retrying the same content and ID returns the existing proposal. Chimera backup JSON uses the same file picker and still asks for confirmation before restore.

## Contract parity and round-trip verification

Pythia owns the schema, reference validator and example fixture. Synchronize these three files when evolving the contract. From the Chimera checkout, run the following with backend test dependencies installed:

```powershell
$env:PYTHIA_HANDOFF_SOURCE = (Resolve-Path ../pythia-source).Path
python -m unittest discover -s backend/tests -p test_production_handoff.py -v
npm run test:onboarding -- --project chromium production-handoff.spec.cjs
```

With the companion checkout configured, the backend test compares the shared files, invokes Pythia’s actual exporter and uploads its output through Chimera’s project API. The browser test uses the same fixture and verifies that the storyboard changes only after acceptance.
