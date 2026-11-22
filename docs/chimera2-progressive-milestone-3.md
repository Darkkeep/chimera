# Milestone 3 — saved portable artifact ingestion

Based on PR #45 head `cc881b94b2da7c91e02b34b0c91b1ac6e8b86754`.
This implements the charter's optional, independent Pythia relationship: bring a
saved artifact, inspect proposals, explicitly accept selected scenes, then edit
using existing Studio tools. Neither application requires the other to be running.

## Verified contract and supported subset

Only `pythia-chimera-production-handoff` version `1.0` is accepted. Inspected
Pythia commit `8b6c9dc102fb50832bc18594e761faf1814b5a11`:

- `service/production_handoff.py`: `build_handoff`, `from_authoring_plan`, `export_bytes`.
- `scripts/export_production_handoff.py` and `docs/production-handoff-v1.md`.
- `schemas/production-handoff-v1.schema.json`, identical Git blob
  `9f9bf2a90d454ce3d07b927dfd9659a9d845c63a` in Chimera's existing copied contract.

Pythia's existing exporter converts a saved add-scenes AuthoringPlan, or exports
a filled handoff template without a model call. This milestone consumes the saved
JSON, not a live Pythia service, provider response or simulated generation stream.
It does not modify Pythia. Existing Export → Import JSON batch review still works.

The new Studio control uses `/progressive-jobs/import`, the existing strict
decoder and reference checks, existing DraftScene/native layout, durable event
replay and explicit acceptance transaction. At most 20 **content** scenes per
artifact are proposed, preserving array order, title, screen text, narration,
production direction and notes. Title/summary/question scenes are withheld and
reported. Objective links, media references and interaction instructions remain
in the full source record; they are reported as unimplemented in editable scenes.
No referenced assets are downloaded, linked as executable content or fabricated.
An artifact with no supported scenes or more than 20 supported scenes is rejected
without creating a job. Other schema versions and unknown fields fail closed.

The full validated source document is retained in the durable job JSON, with its
handoff/artifact/project/source-scene IDs and exact supplied source IDs/locators
on ready events. `artifactSha256` hashes canonical JSON (sorted keys, UTF-8), not
the original file's whitespace. Canonical scene IDs link back to job/component
records. Source locators are displayed as supplied and unverified, never asserted
to be validated citations. Exact re-import returns the original job/decisions;
different content with the same handoff ID returns 409. Use a new handoff ID for
a revised submission. Re-import is not a way to bypass stale source review.

## Safeguards and status

Still default-off and single-user: both the existing backend
`CHIMERA_PROGRESSIVE_DEMO=true` gate and Studio progressive flag are required.
Existing route authorization, job ownership, mandatory If-Match, immutable course
and source-file bindings, revision/history writes, replay, dirty-editor guard and
explicit accept/reject remain. Import never writes storyboard content or selects
a scene. Accept and edit opens the existing editor after approval. Production and
hosted/team progressive activation remain unqualified.

Import is synchronous bounded local validation. All proposals are available when
it completes; the UI says **Saved artifact import complete**, stops the spinner
and shows an import report. There is no fake stage, percentage, artificial delay
or claim of live Pythia generation. Issue #48's existing operation-backed blurbs
are retained. Optional educational insights remain future work.

## Five-minute local Owner demo

From this worktree, install locked dependencies if needed (`npm ci`,
`npm ci --prefix frontend`) and select an existing Python environment containing
`backend/requirements.txt`. In PowerShell:

```powershell
$env:CHIMERA_TEST_PYTHON = 'C:/path/to/python.exe'
$env:PROGRESSIVE_API_PORT = '8037'
$env:PROGRESSIVE_UI_PORT = '5197'
npm run demo:progressive
```

Open `http://127.0.0.1:5197`. The runner creates a fresh isolated workspace and
strips inherited provider/hosted settings. Create a course and an original scene,
then open **Workspace → Chimera2 Studio**. In Progressive scene proposals:

1. **Import saved Pythia artifact** → `tests/progressive/sample-handoff.json`.
   This is clearly labeled, manually authored Lorem Ipsum demonstration data in
   the verified format, not evidence of actual Pythia generation. Both scenes are
   already complete; inspect them at your own pace with no spinner delay.
2. Preview the proposals and source labels. Confirm no scene was added yet.
3. Choose **Accept and edit** on the first proposal. Edit canvas text and save.
4. Type another unsaved edit. Accept the second proposal; use **Keep editing**,
   then **Save changes** when ready. Confirm your first scene's work survives.
5. Import `backend/tests/fixtures/production-handoff-v1.json` to inspect the
   explicit report for withheld questions and unimplemented media/interactions.
   Supplied sources in this synthetic fixture are not verified evidence.

Simple illustrative imagery and optional paced observation were deferred in
favor of actual import. No media asset is silently substituted for a reference.
The richer sample text makes actual native text elements visible; normal paths
are never slowed. For observing asynchronous fixture arrival, the existing
clearly labeled progressive demonstration remains separately available.

Owner decision pending: is saved-artifact review → selective accept → edit/save
usable enough to accept Milestone 3? This does not authorize merge or deployment.
