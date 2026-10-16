# Pythia Sprint 1 Integration Handoff

Sprint 1 is complete. For the current real scene-analysis contract, use
[Pythia Sprint 2 Handoff](pythia-sprint-2-handoff.md).

## Purpose

Pythia now exposes a local Engine API for Chimera's first integration slice.
This handoff covers the `storyboard.analyze` round trip required by Sprints 1
and 2 of the shared integration plan.

The API proves the shared contract and task polling behavior, and produces
deterministic evidence-linked observations from supplied scene content. It does
not change canonical Chimera content or grant approval.

## Pythia Startup

From the Pythia repository root:

```powershell
.venv\Scripts\uvicorn.exe service.app:create_app --factory --port 8000
```

Pythia listens at `http://localhost:8000`.

Chimera's local API also uses port 8000. When both services run on the same
workstation, start Pythia with `--port 8001` and set
`CHIMERA_PYTHIA_BASE_URL=http://localhost:8001` in the Chimera backend
environment. The adapter's default remains `http://localhost:8000` for a
separately hosted Pythia service.

## Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/health` | Confirm that the Engine API is available. |
| `GET` | `/capabilities` | Discover Pythia capability IDs and their declared providers. |
| `POST` | `/tasks` | Submit an asynchronous capability task. |
| `GET` | `/tasks/{task_id}` | Poll task state. |
| `POST` | `/tasks/{task_id}/cancel` | Cancel a submitted or queued task. |
| `GET` | `/artifacts/{artifact_id}` | Retrieve a completed draft artifact. |

`/health` returns:

```json
{
  "status": "ok",
  "version": "1.0"
}
```

## Chimera Implementation Scope

Implement these components in Chimera:

1. `LearningIntelligenceProvider` interface.
2. `PythiaProvider` HTTP implementation.
3. Local Engine API base-URL configuration, defaulting to `http://localhost:8000`.
4. Health check and capability discovery.
5. Task submission and polling client.
6. A first integration fixture that submits `storyboard.analyze` for one stable
   Chimera scene identifier.

Do not add provider-routing logic, specialist prompts, approval controls, or
canonical storyboard mutation as part of this slice.

## Task Submission Contract

Submit `POST /tasks` with this JSON body:

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

Requirements:

- `task_id` is caller supplied and must be unique within a running Pythia
  process.
- `consumer` must be `chimera`.
- `capability` must be returned by `/capabilities`; Pythia supports
  `storyboard.analyze` for source-scoped analysis.
- Include exactly the scene-scoped input needed for analysis. Do not transmit an
  entire course, unrelated assets, user metadata, or unrequested sources.
- Include one input object containing `scene_id`, `source_ref`, and
  `scene_content`. `scene_content` must include `title`, `body_text`,
  `speaker_notes`, and `objective_ids`; at least one text field must be
  nonempty.
- Identifier-only requests are rejected with `422` because Pythia cannot make a
  real analysis from an opaque Chimera URI.

On success, Pythia returns `202 Accepted` and a task-state object with
`status: "submitted"`.

## Polling and Terminal States

Poll `GET /tasks/{task_id}` until the task enters a terminal state:

- `awaiting_review`: a structurally valid draft artifact is available.
- `failed`: no artifact is available; display the returned `error` value.
- `cancelled`: no artifact is available.

Intermediate states are `submitted`, `queued`, and `running`. A task state may
include `progress` and, at `awaiting_review`, an `artifact_id`.

For example:

```json
{
  "schema_version": "1.0",
  "task_id": "chimera-scene-analysis-001",
  "capability": "storyboard.analyze",
  "consumer": "chimera",
  "project_id": "course-123",
  "status": "awaiting_review",
  "created_at": "2026-10-15T12:00:00+00:00",
  "updated_at": "2026-10-15T12:00:01+00:00",
  "progress": 100,
  "artifact_id": "chimera-scene-analysis-001.artifact"
}
```

Use normal short-interval polling for Sprint 1. Pythia does not provide
webhooks, SSE, or durable task recovery yet.

## Artifact Contract

After `awaiting_review`, retrieve `GET /artifacts/{artifact_id}`. Pythia returns
the existing Artifact Envelope 1.0 with:

- `artifact.type: "storyboard-analysis"`
- `status: "draft"`
- `validation.state: "passed"`
- `producer.skill: "storyboard-producer"`
- a `payload` conforming to the storyboard-analysis schema

The payload contains `project_id`, `scene_id`, `source_refs`, `findings`,
`recommendations`, `uncertainties`, and `review_questions`.

Treat this as a reviewable proposal. Show findings against the referenced
Chimera scene, but do not automatically apply the recommendations to canonical
scene or storyboard data.

## Error Handling

- `400`: request body is not valid JSON.
- `404`: unknown task or artifact.
- `409`: duplicate task ID, or cancellation requested after a task left the
  submitted/queued states.
- `422`: request does not conform to the task-request schema or names an
  unknown capability, including missing required scene content.

Pythia task and artifact records are in memory for Sprint 1. A Pythia restart
invalidates prior task and artifact IDs. Chimera should display a recoverable
unavailable/failed state and remain fully usable for editing, preview, media,
validation, and export.

## Sprint 1 Acceptance Check

1. Start Pythia locally.
2. Chimera confirms `/health` and discovers `storyboard.analyze`.
3. Chimera submits a scene-scoped task including the actual scene content.
4. Chimera polls until `awaiting_review`.
5. Chimera retrieves and schema-validates the draft artifact.
6. Chimera displays the result as a proposal associated with the stable scene
   ID, without changing canonical content.

The Sprint 2 exit condition is met when a real scene-content task completes the
round trip from Chimera through Pythia and back to a validated draft artifact.

## Deferred to Later Sprints

- Model-backed analysis and visual/media interpretation beyond the submitted
  scene content.
- Proposal acceptance/rejection and canonical content mutation.
- Durable task queueing, authentication, CORS policy, tenancy, webhooks, and
  cross-product CI.