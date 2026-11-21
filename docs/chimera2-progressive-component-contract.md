# Chimera2 progressive authoring: component event contract (draft v0.1)

Status: version-1 deterministic local slice implemented; not evidence that upstream Pythia streams incrementally. Work tracked in #41 and #43. Candidate base: `9c35f2b853cc42b7ab21c9ce11c70b171330558f`. See [implementation, transport audit and demo](chimera2-progressive-authoring-evidence.md).

## Goal
Display **complete, schema-validated draft scenes** while a generation job continues. Drafts must never silently mutate saved scenes. Start with simulated producer, then connect real Pythia only after verifying its transport.

## Event envelope

Transport candidate: authenticated same-origin SSE, with monotonic per-job event IDs and a read-only reconnect cursor. Do not send raw source text in URL parameters, analytics or logs.

The first slice uses bounded same-origin polling (500 ms, 64 events/job, eight
fixture jobs/project). SSE remains a future transport option, not a qualified
hosting claim. The local demo is explicitly gated and unavailable to team profiles.

```json
{
  "schemaVersion": 1,
  "eventId": "job-uuid:17",
  "type": "component.ready",
  "jobId": "job-uuid",
  "projectId": "project-id",
  "sourceRevision": 12,
  "projectRevision": 12,
  "sequence": 17,
  "componentId": "draft-scene-id",
  "componentRevision": 1,
  "orderHint": 4,
  "status": "proposed",
  "payload": {"sceneType": "content", "layoutMode": "native", "title": "Example", "extractedText": ["A complete instruction."]},
  "provenance": {"producer": "deterministic-fixture-v1", "sourceIds": [], "locators": ["synthetic:inspection-basics"]}
}
```

Example types: `job.started`, `component.ready`, `component.revised`, `component.failed`, `job.progress`, `job.completed`, `job.failed`, `job.cancelled`. `component.ready` includes a complete validated payload matching an existing Chimera draft/scene model, not partial JSON fragments. `job.progress` may use completed/total counts, not fabricated percentages. Event IDs are durable and replay-safe; clients dedupe by (jobId, sequence).

Implemented types are `job.started`, `component.ready`, `component.failed`,
`component.accepted`, `component.rejected`, `job.completed`, `job.failed`, and
`job.cancelled`. `component.revised`/`job.progress` are reserved, not accepted by
this implementation. `sourceRevision` stays fixed; `projectRevision` advances
only for this job's explicitly accepted insertions. Resume uses the response's
numeric `cursor` as `?after=N`; replay is read-only and never restarts generation.

## State and guardrails
- Separate **draft proposal store** and canonical persisted storyboard. Streaming is display-only until explicit accepted action.
- Validate permissions/project/source revision at submit, stream access, and apply. If permissions are revoked, stop delivery and prevent apply.
- Validate component shape and order; invalid components become errors and never enter the canonical editor.
- Apply through existing revision-checked authoring storage. On stale revisions, show a conflict and require review. A human-edited component cannot be silently overwritten by a later model event.
- Retry/reconnect replays durable events without repeat model calls. Cancel makes local generation stop where supported; document any remote billing limitation.
- Detect slow consumers, bounded retention, backpressure and terminal job status. Preserve evidence and per-component diagnostics without leaking source documents.
- Treat structurally valid, instructionally reviewed, and export-qualified as different statuses.

## Phase gates
1. **B0: inspect Pythia transport** and record live availability of partial outputs. If absent, do not relabel whole-response parsing as streaming.
2. **B1: deterministic demo** yields at least one valid scene before terminal job event, rendered in real Studio as a noncanonical proposal.
3. **B2: real upstream transport** with traceable source evidence and no paid calls unless explicitly authorized.
4. **B3: PPTX and assessment draft insertions** with approval and downstream SCORM validation.

## Verification cases
Out-of-order/duplicate events, reconnect and replay, invalid scene, stale source and storyboard revision, cancelled job, partial failure, unauthorized stream access, concurrent human edits, missing Pythia, provider cap, no unsolicited model request, and stable downstream export after accepted proposals.

Implementation may refine fields after inspecting the existing models. Such changes require schema-versioning and matching contract tests.
