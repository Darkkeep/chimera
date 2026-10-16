# Pythia I2 Storyboard Transform Handoff

## Availability

Pythia now exposes `storyboard.transform` through the Engine API. It produces a
validated `storyboard-transformation` draft only. The draft is a review input;
it does not mutate Chimera, grant approval, or assign canonical scene IDs.

Run Pythia on port `8001` alongside Chimera's local backend on port `8000`:

```powershell
.venv\Scripts\uvicorn.exe service.app:create_app --factory --port 8001
```

Set `CHIMERA_PYTHIA_BASE_URL=http://localhost:8001`.

## Request

Submit `POST /tasks` using Task Request 1.0 with
`capability: "storyboard.transform"`. Include one `inputs` item per selected
scene, in current storyboard order. Every item requires `scene_id`,
`source_ref`, and `scene_content` with `title`, `body_text`, `speaker_notes`,
and `objective_ids`. At least one text field must be nonempty.

Do not submit unselected scenes, full-project metadata, asset binaries, or
inferred visual information. Do not repeat a scene ID. Pythia rejects malformed
or duplicate-scene requests with `422`.

## Response

Poll the task until `awaiting_review`, then retrieve its artifact. The draft
payload contains:

- `project_id`, `source_scene_ids`, and `source_refs`
- an artifact-level `rationale`
- ordered `proposed_scenes`

Each proposed scene includes an artifact-local `proposal_scene_id`, submitted
`source_scene_ids`, purpose, title, learner content, interaction
recommendation, production notes, media requirements, assessment opportunities,
and rationale.

`proposal_scene_id` is not a Chimera scene ID. Every source scene reference is
guaranteed to be from the submitted set.

## Chimera Boundary

Persist the exact validated artifact with its task ID, artifact ID, selected
source scene IDs, and source storyboard revision. Present it as a pending
proposal. Edits apply only to Chimera's proposal copy; retain the original
Pythia artifact as provenance.

Do not implement acceptance against a stale source revision. Acceptance,
rejection, replacement positioning, fresh canonical IDs, and revision history
remain Chimera-owned I2 work and require joint contract confirmation.

## Pythia Verification

Pythia verifies the multi-scene request and ordered transformation draft through
`tests/fixtures/storyboard-transform-request.valid.json` and
`tests/evals/test_engine_http.py`.