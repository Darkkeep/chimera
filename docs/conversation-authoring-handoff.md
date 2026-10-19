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


## Exact public candidate mapping qualification

Contracts candidate: `d7b904d772730a7365388623a59d3f07828c07e1`, unreleased 1.2.0.
Chimera preceding revision: `af0f973c7f8f6616685eb914cd6986eab42a1a9d` plus
this owned mapping/test change. Pythia observed HEAD:
`6a5cab0c2abfaf95172ee6b4f587f57fe25237c2`, with unrelated staged README,
conversation-state work and untracked assets; no engine execution used here.
Contracts retained its unrelated staged README. Chimera retained its unrelated
staged README and two dirty historical handoffs. No vendor pin changed.

`validate_candidate_authoring_scope` maps the exact public `scope` identity and
source content identities to trusted local authoring state, reauthorizing first.
Source ordering is immaterial, duplicate source IDs fail, and scope policy revision
must match the caller's trusted current policy. Project/scene/revision are retained
in local session state because this candidate has no such wire fields; IDs must
never be smuggled into unsupported schema properties. Return checks still use the
separate immutable submitted/current binding. This is a pure mapping, not HTTP
transport or proof of authentication, parsing, persistence or byte access.

The candidate supports qualified text/plain source snapshots and empty
`requested_outputs` only. Extraction identity/coverage, canonical context/request/
answer hashes, operation lifecycle and advisory-only results must also pass the
public schema and semantic verifier. The scope mapper alone does not establish
these guarantees. It must not be used as a replacement for public validation.

Opt-in tests load explicitly selected public schemas and the contracts-owned
semantic verifier, never private Pythia code. They validate a synthetic Chimera
scope and recomputed request digest; reject foreign scope and source substitutions,
rehashed citations with foreign extraction identity/outside coverage, and an edit
boundary. No source bytes were ingested and no provider answer was generated.

```powershell
$env:CHIMERA_CONVERSATION_CONTRACTS_ROOT='C:/inetpub/pythia-contracts'
.\backend\.venv\Scripts\python.exe -m unittest backend.tests.test_conversation_boundary backend.tests.test_conversation_candidate backend.tests.test_learning_intelligence
```

Result after verifying exact committed candidate and no scoped candidate diff:
56 tests OK, 6 existing skips; `git diff --check` passed. Candidate tests intentionally
skip without an explicitly configured candidate path; that skip is not qualification.
No frontend changes/build, provider calls, publication or hosted acceptance.

Next: wire the real operation/session adapter only after those boundaries exist,
with trusted storage/current actor authorization and full schema/semantic checks.
Required PDF/DOCX/CSV/media/archive ingestion and generated outputs remain G3/G4
work, not supported features inferred from this text-only candidate.


## Public HTTP candidate client: synthetic transport qualification

`backend/app/conversation_client.py` supplies an independent opt-in
`ConversationCandidateClient`; the existing task provider is unchanged. Its
explicit base URL supports HTTPS and loopback-only HTTP, with no implicit default,
task fallback, redirects, automatic retry or proxy-environment inheritance.
It sends the agreed public POST `/conversation/turns`, GET
`/conversation/operations/{operation_id}` and POST cancellation routes; reads and
cancellation send no body. Expected HTTP statuses are 202/200/200 respectively.

Configuration must supply the service bearer, trusted current authorization,
current local authoring binding/policy callbacks and server-side access JWT issuer.
The issuer receives action/scope, submit request hash or read/cancel operation ID,
and deduplicated source hashes; tokens stay in headers. The real configured issuer
must implement the contracts-owned EdDSA claims, audience, expiry and key policy.
Tests substitute synthetic token callbacks and do not qualify real signing or
revocation infrastructure. The engine must independently verify both credentials.

`PublicConversationContract(root)` loads explicit reviewed public schemas and
executable semantics from a trusted configured checkout. Content pins correspond
to contracts `e80144585ca7432865b558404cde6c9351002566`; CRLF checkout normalization
is supported, while other schema/helper changes fail closed before executing the
verified public helper source. No private engine code, unchecked bytecode or
implicit vendor override is used. This is still unreleased candidate integration.

The client snapshots and validates canonical request bytes, local scope and exact
source identities before token issuance/HTTP. It bounds request/decoded-response
sizes to 1 MiB/2 MiB, uses a 10-second transport timeout, validates strict JSON,
public operation schema and semantic hashes/citations, and verifies read/cancel
operation ID. After I/O it rechecks current actor/source access, policy and scene
revision before returning even a valid answer. Errors omit HTTP response bodies
and credential details; failed/interrupted/cancelled states remain explicit rather
than becoming synthetic answers. The client never mutates a storyboard.

Qualification uses `httpx.MockTransport` only. Tests cover exact routes/headers/
request bodies and token-issuer binding; all operation states; foreign scope or
operation; invalid revisions/request/answer hashes; rehashed extraction/coverage
substitution; HTTP failures, redirects, network errors and no retry; strict JSON,
limits, invalid URL/token/path, access revocation and stale scene/policy before or
after HTTP; issuer mutation isolation; and content-pin/line-ending behavior.

```powershell
$env:CHIMERA_CONVERSATION_CONTRACTS_ROOT='C:/inetpub/pythia-contracts'
.\backend\.venv\Scripts\python.exe -m unittest backend.tests.test_conversation_client backend.tests.test_conversation_boundary backend.tests.test_conversation_candidate backend.tests.test_learning_intelligence
```

2026-10-18 result: 70 tests OK, 6 existing skips; `git diff --check` passed.
Chimera preceding revision `2e083b89ef27981e66f5c97f0c0c10705b13cb9d` plus this
owned module/test/documentation change; contracts candidate above has only its
unrelated staged README dirty. Pythia observed `6a5cab0c2abfaf95172ee6b4f587f57fe25237c2`
with ongoing opt-in-runtime work; no engine was called by these tests.
Chimera's staged README and two dirty historical handoffs were preserved.

Next: actual loopback qualification against the opt-in synthetic engine, followed
by real application actor/session/source setup. No UI, provider traffic, generated
files, live-model output, hosted acceptance or G3/G4 completion is claimed here.


## Actual loopback transport evidence synchronized from Pythia

2026-10-18, documentation-only update. Pythia engineering reported and owns the
execution evidence in
[the engine record](../../Pythia/docs/conversation/g3-candidate-evidence.md) and
[test](../../Pythia/tests/evals/test_conversation_loopback.py). Chimera inspected
that test and the checkout state; it did not rerun a runtime suite for this sync.

Committed engine baseline: `5c66b818e60819d05169c3f7dd86bc6ebfac48bf`.
Chimera client: `69a9b6d6e159c1b0a1e0898aee4c9622654bfeeb`.
Public candidate pins: `e80144585ca7432865b558404cde6c9351002566`.
Pythia's command from its root with its repository virtualenv:

```powershell
.\.venv\Scripts\python.exe -m unittest discover -s tests/evals -p test_conversation_loopback.py -v
```

The committed baseline record reports 1 test passed in 3.020s using actual
HTTP to an ephemeral 127.0.0.1 server, the public Chimera client and public schemas,
ephemeral synthetic service bearer/EdDSA actor identity, hash-verified partial UTF-8
source, submit/read/exact replay/cancel and current access revocation. It verifies
one synthetic producer execution. Cancellation after completion preserves the
completed operation; this test does not itself qualify an in-flight cancel race.

Pythia then reported the updated test passed in 2.656s using its actual private
SQLite source store/reader. At this inspection that extension was working-tree
work above the committed engine baseline: modified `service/conversation_candidate.py`
and loopback test, with new `service/conversation_sources.py` and source tests.
It must not be attributed to committed `5c66b81` bytes. Inspected file SHA-256:

- `tests/evals/test_conversation_loopback.py`:
  `7b576c4855b3791c44440b766cbee9fd2ba7359a30c0b68ec95c7bc8e71068c4`.
- `service/conversation_sources.py`:
  `7ef0c7780d8d49a9168e5f3bb60ed26ef7351b608951612e12c6476efa9bc0cb`.

This establishes narrow **qualified-synthetic transport**, not merely a stubbed
HTTP check. The producer and actor/source identity remain synthetic. It does not
qualify live inference/answer quality, real application sessions/authorization,
full client integration, additional file formats, generated exports, hosted
behavior or owner acceptance. G3 remains in-progress; G4 remains blocked.
No Chimera code changed, no runtime tests rerun, and unrelated dirty files remain
preserved. Next authoring work depends on agreed application source/session and
additional source-format contracts, not a second chat UI or automatic scene edits.


## Committed private-source follow-through and next consumer contract

The private SQLite UTF-8 source-store work described above is now committed in
Pythia `ffe6fa41afce4910add630b30f71b407229f6d6a`. Its
[source evidence](../../Pythia/docs/conversation/g3-source-evidence.md) records
10 source tests passed in 0.148s and updated actual SQLite-backed loopback passed
in 2.785s. The source store enforces exact original bytes/version/scope, byte/chunk
and transactional tenant quotas, including the empty-chunk regression. These
committed results supersede the earlier working-tree-only status; they do not
retroactively change what was committed at `5c66b81`.

Parent engineering also reports the completed full synthetic suite at that source
baseline: 225 tests passed in 142.678s using Pythia's repository virtualenv and
`-m unittest discover -s tests/evals -p "test_*.py" -v`. Chimera did not rerun that
suite; this is explicitly sister-owner-reported evidence, not a local test claim.
The consumed public conversation pin and Chimera client remain `e801445` and
`69a9b6d` respectively. No source upload API, CSV turn support, live provider,
application session acceptance or full G3 completion follows from these results.

Next cycle [source grants/CSV requirements](conversation-source-grants.md) and
`backend/tests/fixtures/conversation-source-consumer-cases.json` contribute
19 typed negative development examples before the additive source contract is
finalized. They distinguish schema, current permission, immutable byte integrity,
local scene revision and actual anchor-resolution failures. They are proposals,
not a new passing runtime test matrix. No held-out corpus files were used.


## Additive source candidate provenance follow-through

The [source grant/CSV consumer requirements](conversation-source-grants.md) now
include a pinned pure validator and 19 exercised negative consumer examples.
Contracts source candidate `ef7b85cfa31e0e8961663fbb6da4dcb112f55533` adds new
source metadata/manifest and separate design-only CSV anchor schemas without
changing the existing turn contract. Test-only `20d2527` preserves consumed bytes.
Chimera focused source/client/boundary/learning-intelligence run: 75 tests OK,
6 existing skips; no new provider, HTTP upload or CSV parser qualification.
Current source:ingest/read authority and unchanged local scene provenance remain
separate checks before and after any future source transfer. Next: exercise the
producer's exact source PUT/GET boundary when explicitly configured.


## Source transfer client follow-through

The [source-grant record](conversation-source-grants.md) now documents independent
raw PUT/manifest GET client transport, exact original-byte eligibility/receipt
validation and current source:ingest/read plus scene/policy rechecks. Its source
JWT issuer is an explicit trusted callback, not an implicit token fallback.
82 focused synthetic tests passed with 6 existing skips, including existing
conversation/task regressions after shared bounded transport extraction. Source
HTTP cases are stubbed; actual producer source endpoint integration is next.
No source parsing beyond plain UTF8, CSV turns, UI, provider or publication changed.


## Final source HTTP snapshot and review closeout

Engine `4ca5ef6a32a4420278980f95b4e32245a6b87fc7`, Chimera public/source client
`3fbe048d49cd7b57f7168eb5ab8cbdbc23c40b1b` and candidate
`aee473954047fe0b384da8e7934e51cedacee9b6` now have actual synthetic loopback
evidence for raw PUT201/replay200/manifest GET before the bounded conversation.
Chimera independently reverified three source authorization/framing blockers fixed,
zero committed rows in each rejected reproduction, and producer source11tests
passed13.077s. Parent reports final full243tests passed156.622s; not rerun here.
Exact commands, source review and limits are in the
[source-grant record](conversation-source-grants.md).

Narrow source+turn transport is qualified-synthetic; full application identity,
format pipeline, live answer quality and overall G3 remain unfinished. The next
independent blocker input is an agreed additive CSV original-source/structured
projection/coverage/turn-citation contract. The internal CSV parser/design-only
anchor must not be relabelled as current text-only public compatibility.


## Additive CSV1.1 client follow-through

The separate [CSV client record](conversation-csv-client.md) captures exact candidate
`0fb76c5cf6517db5db6e8aeb0ff217410c189614`, full original/extraction/worker/header/
row provenance, fresh trusted-record/allowlist callbacks and current authoring
checks.90focused tests passed6existing skips; new CSV1.1 HTTP uses synthetic stubs.
Existing1.0 client/schema/helper pins remain unchanged. Producer CSV source and
turn integration with real ephemeral HTTP and qualified immutable extraction
records is next. No live provider, hosted acceptance or complete G3 qualification.

## 2026-10-19 Acceptance Reconciliation Compatibility

Contracts' existing conversation wire schemas/helper pins are unchanged. The
[candidate acceptance rules](../../pythia-contracts/docs/conversation/candidate-1.2.0.md#durable-consumer-acceptance-reconciliation-2026-10-19)
now make the durable consumer intent and atomic local mirror/receipt transition
explicit. Context is consumed on acceptance, including failed/cancelled/interrupted
operations; only successful substantive answers consume answer revisions.

Chimera's existing client already preserves these receipts without mutating
application revisions or automatically retrying HTTP. New conformance tests
verify that every noncompleted lifecycle receipt retains expected context plus
one and null answer revision; an explicit retry after simulated response loss
sends exactly the original canonical request, reissues authorization and receives
the same bound acceptance state. Revocation before that retry prevents a second
HTTP call or token issuance. These are stub-transport consumer checks, not new
Chimera application persistence or an integrated authoring session.

Command from Chimera with the explicitly configured contracts path:

```powershell
$env:CHIMERA_CONVERSATION_CONTRACTS_ROOT='C:/inetpub/pythia-contracts'
.\backend\.venv\Scripts\python.exe -W error::ResourceWarning -m unittest backend.tests.test_conversation_client backend.tests.test_conversation_boundary backend.tests.test_conversation_candidate -v
```

Result: 32 tests passed in 0.358s, no skips. No client implementation, historical
vendor, project/scene mutation policy or content pin changed.

The cross-repository task also qualified Manteion's real NextAuth session boundary
with a synthetic database-session cookie, PostgreSQL durable intents and signed
Pythia turns. Its [acceptance evidence](../../Manteion/manteion/docs/product/g3-operation-acceptance.md)
owns those harness results and exact limits; the producer remains synthetic, and
there is no browser/email login, production storage, live inference or owner
acceptance. Chimera's next work is application-owned durable intent storage and
current project/scene/session binding under the same rules, not a second engine
or automatic storyboard edits. G3 remains in progress; G4-G6 remain blocked.
Pre-existing staged README and both dirty historical handoffs were preserved.
