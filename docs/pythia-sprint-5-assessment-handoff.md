# Pythia Sprint 5 Assessment Design Handoff

## Contract

Pythia exposes the frozen `assessment.design` capability through the Engine API.
It returns an `assessment-blueprint` draft artifact with `proposed_items`; it
does not create, score, approve, or mutate a Chimera assessment.

Run Pythia on port `8001` beside Chimera's local backend on port `8000`, with
`CHIMERA_PYTHIA_BASE_URL=http://localhost:8001`.

## Request

Submit `POST /tasks` with `capability: "assessment.design"`. Put one selected
scene per `inputs` item using the existing scene shape:

```json
{
  "scene_id": "scene_a81f73",
  "source_ref": "chimera://course-123/scenes/scene_a81f73",
  "scene_content": {
    "title": "Respond to a fire alarm",
    "body_text": "Leave by the nearest marked exit.",
    "speaker_notes": "Emphasize the assembly point.",
    "objective_ids": ["objective-evacuation"]
  }
}
```

Put global assessment context in `context`:

```json
{
  "objectives": [{"id": "objective-evacuation", "statement": "Choose the safe evacuation response."}],
  "audience": "New staff",
  "desired_difficulty": "application",
  "completion_rules": "One correct response is required."
}
```

Every objective must map to a submitted scene, and every scene objective must
be declared in `context.objectives`. Pythia rejects invalid or ungrounded scope
with `422`.

## Response

Poll to `awaiting_review`, then retrieve the `assessment-blueprint` draft. Its
payload preserves the normal blueprint fields and adds `proposed_items`. Each
proposal includes `proposal_item_id`, `target_scene_id`, `objective_ids`, a
Chimera-native discriminated `item`, rationale, and evidence references.

Pythia currently emits a `single-choice` item shape that conforms to Chimera's
native discriminator. The frozen schema accepts all seven supported native item
types for future proposal variants. Preserve item fields exactly when storing a
proposal.

Draft correct responses, feedback, fairness, scoring, and completion
implications require SME and policy review. Structural validation is not
approval and no proposal may be applied automatically.

## Required Chimera Work

1. Build the scoped `inputs` plus global `context` request.
2. Render `alignment`, `proposed_items`, limitations, and review questions.
3. Persist the exact artifact with source scene IDs and storyboard revision.
4. Convert only explicitly accepted, non-stale proposals to native assessment
   items and verify them in learner preview.
5. Preserve original Pythia artifacts for rejected and edited proposals.

Pythia validates this contract with
`tests/fixtures/assessment-design-request.valid.json` and
`tests/evals/test_engine_http.py`.