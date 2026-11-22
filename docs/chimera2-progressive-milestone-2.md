# Milestone 2: Pythia-format scene proposals, provider-free

Issue #43 / draft PR #45. This is a **fixture-backed contract adapter**, not live Pythia generation, live incremental output, or hosted/team authorization.

## Verified upstream contract

Inspected [Pythia `service/chimera_authoring.py`](https://github.com/Darkkeep/Pythia/blob/8b6c9dc102fb50832bc18594e761faf1814b5a11/service/chimera_authoring.py) and [its authoring tests](https://github.com/Darkkeep/Pythia/blob/8b6c9dc102fb50832bc18594e761faf1814b5a11/tests/evals/test_chimera_authoring.py), pinned at Pythia `8b6c9dc102fb50832bc18594e761faf1814b5a11`.

Pythia `ChimeraDraftProducer` returns a **completed** `AuthoringPlan` with `mode`, `rationale`, `changes`, `scenes`, plus `producer_id: live-chimera-authoring-v1` and `stopping_boundary: draft-only`. The supported `add-scenes` output contains 1–5 bounded `ContentScene` objects. Pythia has **no verified per-scene streaming transport** here. The local demo intentionally schedules each converted fixture scene separately, which demonstrates the UI contract and does **not** imply Pythia emitted partial results.

## Supported mapping

- `ContentScene.sceneType: content` → existing Chimera `DraftScene` (`sceneType: content`, `layoutMode: native`).
- `title`, `extractedText`, `narration`, `actionDescription`, `notes` are preserved literally, then validated by Chimera's existing strict scene model.
- Pythia's top-level `rationale` becomes proposal provenance metadata.
- Provenance `producer: pythia-authoring-fixture-v1` is **explicitly labeled synthetic/fixture**. The Pythia authoring-plan result itself provides **no source IDs, reference citations, locators or versioned source identity**, so `sourceIds` and `locators` remain empty. No citation, asset, source binding, or learner interaction is invented.
- Incoming unknown fields, wrong producer marker or stopping boundary, updates to existing scenes, unsupported `title`/`summary` scene types, oversized text, nonempty `changes`, or malformed scenes are rejected before proposal delivery. Existing `sourceSnapshot` and SHA-256 file bindings of the Chimera job remain authoritative for acceptance.

## How to review

Run the local Milestone 1 demo (`npm run demo:progressive`) and open Studio. Choose **Try Pythia-format fixture**. A complete draft appears under the existing proposal panel, marked **Pythia-format test result (no live model or citations)**. Choose **Accept and edit**, save the scene, continue typing, and verify the second proposed fixture scene appears without moving focus. The original **Start progressive demo** remains available.

The same `/api/projects/:id/progressive-jobs` endpoint accepts the *demo-only* selector `?producer=pythia-authoring-fixture-v1`; it does not accept arbitrary model output or provider credentials from the browser. Team profiles remain excluded by `CHIMERA_PROGRESSIVE_DEMO` and the established authorization checks.

The adapter calls the existing `emit_scene`, `component.ready` event, durable job/replay, explicit decision and `If-Match` storage path. There is no alternate editor, generator or persistence mechanism.

## Out of scope and next connection

The adapter validates a completed Pythia result shaped according to a real contract, but uses a deterministic local fixture derived from that contract's tests. It does **not** call Pythia or demonstrate provider-side partial generation. A future, separately qualified provider boundary will need trusted source/provenance metadata, capability negotiation, authorization and metering before allowing actual generated scenes. Assessment, uploads, media generation, and hosted/team support remain outside this increment.

No merge, production deployment, paid provider call or Pythia repository change is authorized by this document.
