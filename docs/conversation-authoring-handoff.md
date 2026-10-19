# Conversation authoring handoff

2026-10-18 | Documentation review; no implemented conversation exchange.

## Reviewed evidence

Chimera baseline: `69523b3622c3d94fdb4f7e01c0b7be9b1cb557d9`.
Pythia's [owner acceptance](../../Pythia/docs/conversation/g1-owner-acceptance.md),
committed in `8daf30d`, accepts its G1 packet as an experience target. It permits
G2/G3 coordination; it does not accept a separate Manteion packet, freeze the
independent evaluation corpus, qualify an implementation, or authorize release.
The accepted packet is bound to the full revision and SHA-256 in that record.

Reviewed [Reference C](../../Pythia/docs/conversation/g1-reference-packet.md),
its synthetic source manifest and the proposed
[G3 boundary](../../Pythia/docs/conversation/g3-boundary-review.md).
The existing `LearningIntelligenceProvider` exposes task/status/artifact/cancel
operations, not conversation. The following are consumer requirements for the
candidate design, not a claim that those operations or guarantees exist today.

## Authoring source and return invariants

- Preserve project `dispatch-demo`, scene `night-handoff`, revision `scene-3`
  across departure and return. These synthetic identifiers convey provenance;
  neither possession of them nor a service credential proves actor access.
- Authorize the current actor against tenant, consumer `chimera`, project,
  scene, session and each source before disclosure. The destination must validate
  the agreed scope attestation and expiry. Missing, expired, revoked or foreign
  scope must deny access; never substitute a permissive development principal.
- Send immutable authorized source references and a digest-bound context snapshot
  through the agreed private transport. Do not place source bodies, credentials
  or signed download URLs in navigation URLs or conversation history. Exact
  version/hash and readable coverage must survive retrieval and return.
- Reference C uses policy hash
  `48e2e84bc4692a99bd50b8f48625d23ad09d56e2b1585ef511b32341e6952ea0`
  and pilot hash
  `99181fe2327a67357bd8f042a1148509eaf8e52cd232c64ed1c13a2fd855d2ea`.
  Resolve the policy Escalation paragraph and pilot data row 2 (header excluded).
  These are Markdown/CSV anchors; no PDF page or invented scene source is valid.
- The historical-date correction changes applicable advice from current policy
  10 minutes to September pilot 20 minutes. Retain the prior answer and bind the
  corrected answer to unchanged source bytes and the historical scene context.
- On return, recheck actor access and current scene revision. Preserve local
  authoring context; an unavailable session or stale scene must remain explicit.
  Returned text and files cannot silently overwrite newer local work.

## Advice, edit and file boundaries

Consultation is advice. Reading, copying or exporting an answer leaves `scene-3`
unchanged. A later storyboard edit needs a separate explicit authorized action,
current revision conflict checks and preserved history. A successful answer,
correction, export or synthetic review is never edit approval or release authority.

Any DOCX/PDF must contain genuine validated bytes and bind the corrected answer
revision/hash, both source hashes, producer identity and historical context. Check
the output manifest and retrieval authorization; unavailable generation must show
unavailable, not a fabricated download. A generated ZIP is not automatically an
authoring, SCORM or QTI package. Existing project/scene/draft artifact validators
and existing authoring workflows remain required.

## Candidate compatibility and next work

Contracts owns route names, schema fields and additive versioning. Manteion owns
the primary consultation session/history and actor authorization. Pythia owns
bounded operations and accepted context revisions. Chimera consumes the public
HTTP boundary; it must not import engine internals, disguise conversation as a
task submission, or duplicate the reasoning engine/chat experience.

Before implementation, agree canonical context digests, scope attestation and
expiry, source handles and anchor coverage, return context, and the operation
revision/replay/cancel rules. Require same-request replay to return the original
operation, changed-payload replay and stale revisions to conflict before inference,
and cancellation to prevent later publication when it wins the atomic transition.
Do not infer restart safety from in-process locks or whole-map JSON persistence.

Next: contracts and Manteion settle the candidate exchange; Chimera then qualifies
its actual adapter with positive and negative cases for scope, source hashes,
stale scene/context revisions, replay, cancellation, correction, unavailable files
and return access. Preserve existing task/media/export regressions when code
changes. A local candidate is not a released or compatible consumer pin.

## Verification and limits

Read-only inspection of the provider protocol, accepted packet, source manifest,
owner record and G3 proposal; guide/document diff review. No runtime tests were
needed or run for this documentation-only change. No model calls, UI, provider
protocol, consumer pins or hosted state changed. Existing dirty README and two
handoff documents were preserved. G2-G6 qualification remains outstanding.


## Internal boundary implementation and synthetic qualification

Chimera now supplies `backend/app/conversation_boundary.py`: immutable local
source identities and authoring bindings, an explicitly trusted policy callback,
and an advice-return guard. They are internal types, not speculative public API
fields. The callback rechecks tenant/actor/consumer access to session, project,
scene and each source. Only literal `True` grants access; exceptions propagate.
Return validation requires unchanged submitted identity and freshly server-loaded
scene/source state, and refuses all edit flags except literal `False`.

`backend/tests/test_conversation_boundary.py` covers matching advice, each revoked
resource, policy failure, foreign tenant/actor/session/project/scene, stale scene,
source version/hash/identity substitution, invalid identities, mutable/duplicate
sources and attempted edits. These tests establish pure local checks, not an auth
implementation, source ingestion, public response validation or integrated route.
The future adapter must obtain current state from trusted storage and supply a
real server-side policy; caller-provided IDs cannot grant authorization.

Verification on 2026-10-18:

```powershell
.\backend\.venv\Scripts\python.exe -m unittest backend.tests.test_conversation_boundary backend.tests.test_learning_intelligence
```

Result: 49 tests, OK, 6 existing skips. First run failed eight existing schema
checks because the vendor submodule was uninitialized. Initialized at the existing
tracked pin `1fb6584a36552ca3f9f77ba1479fef45f8137b73` and reran successfully;
no pin update or skipped schema assertion. `git diff --check` passed.
No frontend change, frontend build, provider request or hosted validation.
Pythia owner acceptance remains at `8daf30d`; current public conversation candidate
compatibility is a separate pending slice, not implied by the historical vendor.
