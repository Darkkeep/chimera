# Pythia Sprint 2 Handoff for Chimera

## Scope

Pythia's Sprint 2 work is complete. `storyboard.analyze` now performs bounded,
deterministic analysis of supplied scene content and returns an evidence-linked
draft artifact. It does not infer unsubmitted visual layout, media,
interactions, or source material; those limits remain explicit uncertainty.

The result is a proposal for human review. It does not change canonical Chimera
content, grant approval, authorize a transition, or launch downstream work.

## Local Configuration

Run Pythia from its repository root on port `8001` because Chimera's local
backend uses port `8000`:

```powershell
.venv\Scripts\uvicorn.exe service.app:create_app --factory --port 8001
```

Set `CHIMERA_PYTHIA_BASE_URL=http://localhost:8001` for the Chimera backend.

## Required Request Extension

`POST /tasks` still uses the existing Engine API Task Request 1.0 envelope.
For `storyboard.analyze`, its sole `inputs` item must now include
`scene_content`:

```json
{
  "schema_version": "1.0",
  "task_id": "chimera-scene-analysis-001",
  "capability": "storyboard.analyze",
  "consumer": "chimera",
  "project_id": "course-123",
  "inputs": [
    {
      "scene_id": "scene_a81f73",
      "source_ref": "chimera://course-123/scenes/scene_a81f73",
      "scene_content": {
        "title": "Respond to a fire alarm",
        "body_text": "Leave by the nearest marked exit and assemble at the designated area.",
        "speaker_notes": "Emphasize the local assembly point.",
        "objective_ids": ["objective-evacuation"]
      }
    }
  ],
  "constraints": {},
  "context": {}
}
```

`scene_content` requires all four fields. `title`, `body_text`, and
`speaker_notes` are strings and `objective_ids` is an array of stable IDs. At
least one text field must be nonempty. Identifier-only requests return `422`
because an opaque Chimera URI cannot support real analysis.

Only submit the selected scene's necessary content. Do not include an entire
course, unrelated assets, user metadata, or unrequested source documents.

## Task and Artifact Handling

Poll `GET /tasks/{task_id}` until it reaches `awaiting_review`, `failed`, or
`cancelled`. At `awaiting_review`, use `artifact_id` with
`GET /artifacts/{artifact_id}`.

The artifact remains an Artifact Envelope 1.0 draft:

- `artifact.type` is `storyboard-analysis`.
- `status` is `draft`.
- `validation.state` is `passed` for structural validation only.
- `producer.skill` is `storyboard-producer`.

The payload contains `project_id`, `scene_id`, `source_refs`, `findings`,
`recommendations`, `uncertainties`, and `review_questions`.

`findings` and `recommendations` are objects, not display strings. Render their
`statement` fields and retain their stable IDs and source/finding references:

```json
{
  "findings": [
    {
      "id": "narration-context-unavailable",
      "category": "narration_context",
      "statement": "No speaker notes were supplied, so narration intent and facilitator guidance cannot be assessed.",
      "evidence_refs": ["chimera://course-123/scenes/scene_a81f73"],
      "uncertainty": "Narration may exist outside the supplied scene content."
    }
  ],
  "recommendations": [
    {
      "id": "supply-narration-context",
      "statement": "Provide speaker notes or confirm that the scene is intended to stand without narration.",
      "finding_refs": ["narration-context-unavailable"]
    }
  ]
}
```

No result should be applied automatically. Preserve the original scene and
present the artifact as a reviewable result only.

## Required Chimera Work

1. Extend `PythiaProvider` request construction with `scene_content` from the
   selected scene.
2. Update validation and result rendering for object-shaped findings and
   recommendations.
3. Expose progress, `failed`, and `cancelled` task states with retry that uses a
   new task ID.
4. Add a real-scene integration test using the same scoped fields as Pythia's
   `tests/fixtures/storyboard-analysis-request.valid.json` fixture.
5. Verify a local round trip against Pythia on port `8001`.

## Pythia Verification

Pythia validates the scene input against
`schemas/storyboard-analysis-input.schema.json`. Its Engine API test uses the
real-scene fixture, and the full Pythia evaluation suite passes.

## Deferred Work

Model-backed analysis, visual/media interpretation, durable tasks,
authentication, cross-product CI, proposal persistence, and accept/edit/reject
operations remain outside Sprint 2.