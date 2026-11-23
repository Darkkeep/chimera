# Start Experience from Import — Owner review

Owner-approved Milestone 3 onboarding extension. Based on draft PR #49 head
`6b553c5a8147a1e9403c71d7b81fc3b13415def8`, which is based on PR #45 head
`cc881b94b2da7c91e02b34b0c91b1ac6e8b86754`. The prior implementation chat was
idle/completed when inspected; its checkout and branch were left untouched.

## Behavior and contracts

The primary **+ New Project** action in My Work and **Create project** in workspace navigation open a shared choice. **Start from a file** opens the existing import workflow. **Start with an idea** opens the existing course naming, source and consultation form. Empty-storyboard and Golden Path creation share the choice; subproject creation and guided naming stay unchanged. Direct import shortcuts remain available.

The shared dialog traps keyboard focus and supports Escape. Closing returns focus to the creation trigger, or the menu toggle if responsive navigation hides it.
Choose or drop one PPTX or JSON file, inspect its recognized type, scene text and
unsupported-content diagnostics, name the experience, then explicitly create it.
Preview is read-only, authorized with `project.create`, and creates no project,
job or storyboard revision. Unsupported JSON fails visibly before creation.

The preview delegates to the existing Pythia decoder/reference validation and
progressive `prepare`, or the existing batch handoff mapper when progressive
authoring is disabled. Actual imports use the unchanged project creation,
PowerPoint source, progressive handoff, batch proposal and native restore routes.
Existing If-Match, ownership, provenance, replay, source bindings and acceptance
transactions remain authoritative. No additional import engine or content model.
The native restore route still normalizes project identity and preserves history.

Progressive authoring remains default-off. With both existing frontend flags and
the backend demo gate enabled, a saved Pythia artifact opens individual scene
proposals in Studio; no scenes are added until accepted. The established subset
remains at most 20 content scenes, with other types and mappings reported.
Without the flags, the existing batch review accepts the existing supported
handoff contract and requires an explicit proposal decision. No live Pythia call.

Native JSON v1.0 without external assets/templates can restore into a new project
after confirmation. Media-dependent backups are directed to the existing archive
restore; JSON does not carry their files. PPTX preview lists slide titles, then
the existing importer extracts/renders editable scenes after confirmation.
The onboarding limit is 25 MB, with the existing 1,000,000-byte handoff limit.

Project creation and import are separate existing operations. If import fails,
the empty new project remains saved; retry within the dialog reuses it instead
of making duplicates. Existing projects are never used as this flow's target.
All existing in-project import/restore controls remain available.

Upstream inspected: Pythia `service/production_handoff.py` at
`8b6c9dc102fb50832bc18594e761faf1814b5a11` (`build_handoff`,
`from_authoring_plan`, `export_bytes`). Its v1 schema Git blob matches Chimera:
`9f9bf2a90d454ce3d07b927dfd9659a9d845c63a`.

## Owner demo

Use the existing isolated demo runner (`npm run demo:progressive`) with a Python
environment containing backend dependencies. No provider settings are inherited.

1. Open the demo with no project selected. Click the prominent **+ New Project**, then **Start from a file**.
2. Drop `backend/tests/fixtures/production-handoff-v1.json`. Read the recognized
   Pythia type, scene preview and withheld-question/media/objective diagnostics.
   Cancel once: no project should have been created.
3. Choose it again and select **Create experience and review scenes**. The new
   project's storyboard remains empty while its proposed scene is reviewed.
4. Choose **Accept and edit**, change canvas text and save. Reopen to confirm it.
5. Return to **+ New Project**, choose **Start with an idea**, and name and create a course. Sources and consultation remain available.
6. Try malformed JSON and an unrelated JSON document: both show an error with no
   Create action. Try a PPTX: inspect slide titles, create, and review the result.
6. Check keyboard navigation, Escape/focus return, and the narrow mobile layout.

Automated qualification is distinct from Owner usability acceptance. No merge,
deployment, live generation, spending or credential change is authorized here.
