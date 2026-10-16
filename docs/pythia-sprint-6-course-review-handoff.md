# Pythia Sprint 6 Course Review Handoff

## Availability

Pythia exposes `course.review` through the Engine API. It produces a validated
`course-review` draft with object-linked findings; it does not resolve findings,
approve readiness, or mutate Chimera content.

Run Pythia on port `8001` beside Chimera's backend on port `8000` and set
`CHIMERA_PYTHIA_BASE_URL=http://localhost:8001`.

## Request Scope

Submit one course inventory in `inputs`. Include:

- objectives with stable `objective_id` and source reference;
- scenes with stable `scene_id`, source reference, title/body text, and linked
  objective IDs;
- assessment items with stable IDs and objective IDs;
- assets with stable IDs, alternative-text state, and decorative flag;
- source records with a currency-check date or explicit absence;
- standards, tracking, and packaging readiness status.

All object IDs and objective relationships are validated as submitted scope.
Pythia rejects unknown objective references with `422`.

## Response and Deep Links

Poll to `awaiting_review`, then retrieve the `course-review` draft. It contains
`domain_status`, `specialist_routes`, and `findings`. Render each finding using
its category, severity, statement, recommendation, limitation, and
`object_refs`.

Use the object reference to deep-link into Chimera:

```json
{
  "object_refs": [
    {"object_type": "asset", "object_id": "asset-exit-map"}
  ]
}
```

Allowed object types are `course`, `scene`, `objective`, `assessment`, and
`asset`. Never treat a Pythia finding as resolved automatically. Persist the
original artifact and manage review/resolution status in Chimera.

## Pythia Verification

Pythia validates this contract with
`tests/fixtures/course-review-request.valid.json` and
`tests/evals/test_engine_http.py`.