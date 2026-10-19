# Authoring source-transfer and CSV consumer requirements

2026-10-18. Consumer requirements and narrow synthetic provenance qualification against the
additive source contracts candidate. No upload/CSV turn support or public release.

## Trust and authoring context

Chimera must derive tenant/consumer/actor/session/current policy from trusted server
state, never a browser-supplied metadata object. A source transfer requires distinct
current authority for its action: a read grant is not an ingest grant. Possession
of project/scene IDs, a matching content hash or service bearer grants no actor
permission. Bind the exact source ID, immutable version, original byte hash and
byte size before signing or dispatch. Grant scope and private source ownership
remain actor/session-bound until an explicit sharing contract exists.

Project, scene and scene revision remain in trusted local authoring state because
the proposed public metadata does not contain them. Recheck authorization and
scene revision before and after a transfer, before attaching its manifest to a
session, and on return to authoring. A stale scene does not silently inherit a
newly transferred source. A source grant/manifest never approves an authoring edit.

Never include source bodies, paths, service credentials or signed URLs in public
navigation links or tokens. Tokens bind immutable metadata, not embedded source
bytes. Transfer source content only through the agreed private byte boundary.
The source should not become model-readable merely because bytes were uploaded;
its returned state and exact qualified snapshot/coverage must permit use first.

## Typed public synthetic examples

[Consumer cases](../backend/tests/fixtures/conversation-source-consumer-cases.json)
contain a 29-byte plain UTF-8 development fixture with exact CRLF preserved,
proposed `source-ingestion-metadata`, separate local authoring context, a design-only
CSV anchor, and 19 typed negative cases. These are public development scenarios,
not held-out cases, expected answers or observed runtime results.

The proposed metadata uses exact `schema_version`, `scope`, `source_id`, `version`,
`content_sha256`, `byte_size` and `media_type` fields. The draft presently permits
only text/plain. Its body hash is
`2482166e722d00ef1431aee29c4890429045c8fbc53a95e12a611075fb33b8d1`.
No metadata property alone proves that bytes were read or accepted. Proposed
routes/grants must be finalized by contracts and producer owners before Chimera
implements source-transfer HTTP; the current conversation client is unchanged.

The case matrix distinguishes rejection layers. Wrong scope and grant purpose
may be schema-valid but must fail authorization. Byte/hash drift and immutable
version rebinding must fail actual source-integrity checks. Scene revision
changes are a local consumer conflict. Declared CSV must fail the text-only
metadata schema, not be silently relabelled to bypass the format boundary.

## CSV identity and anchors

The CSV fixture has two columns with identical header names and two logical data
records; its first data record contains a quoted embedded newline. Bind original
content hash/version, parser revision and the digest of the ordered exact header
string array. Data-row numbering starts at one after the required header; parsed
logical records, not physical lines, determine the row. A zero-based column index
disambiguates duplicate names. Never guess a column from a name alone.

Schema-valid anchors still require the actual bounded parser's identity, header,
row and column bounds/coverage checks. Header reordering, parser-version drift,
foreign original bytes, nonexistent records and out-of-range columns must fail.
The agreed parser revision is `csv-strict-utf8-v1`; an anchor also binds the
half-open Unicode-code-point span of the entire logical data record in the exact
original text, including quoting/newlines. A fragment of a quoted multiline record
is not a valid full-record span. The fixture's second data row includes its CRLF.
The candidate CSV anchor is design-only: existing text-only request/operation
schemas cannot accept it as a text span. CSV parsing, CSV turn citations and their
format-specific ingestion/coverage semantics remain separate unfinished work.

## Evidence and next action

Prepared against the sister contracts draft and sent to its owner for review.
Inspected parent source store `ffe6fa41afce4910add630b30f71b407229f6d6a` and
the current owned Chimera guide/client; three unrelated dirty files preserved.
No source bytes were sent to a service, no producer invoked and no new runtime
qualification is claimed by these fixtures. Next: finalize the exact source
metadata/manifest/grant contract, then add a pinned consumer validator and focused
negative tests. Do not extend the current text-only pin by assumption.


## Pinned provenance adapter qualification

`backend/app/source_provenance.py::PublicSourceCandidate` now validates exact
source metadata and receipts using new public schemas/semantics pinned at
`ef7b85cfa31e0e8961663fbb6da4dcb112f55533`. Latest contracts
`20d2527d63e1f744436037728f204fe487446be1` adds only a shared CSV vector/test;
consumed schema/helper bytes remain identical. Existing turn schemas/helpers and
vendor pin remain untouched. The new helper imports only the already-pinned public
conversation helper through a scoped import mapping; no mutable global import
path/module registry or private engine dependency is used.

Receipt validation requires actual immutable original bytes, strict safe JSON,
matching metadata/snapshot identities and hashes, matching lifecycle, and exact
text coverage. Unreadable receipts cannot include a readable snapshot. Source
failure remains an explicit failure, never evidence of readability. Metadata alone
is not receipt validation or authorization.

`bind_source_transfer` separately binds schema-qualified metadata to trusted local
authoring state and current policy. Its trusted action callback must grant the
specific source:ingest/read purpose with literal True. All existing scope/source
permissions are checked and current project/scene/source revisions must match.
Call this guard before signing/sending and again before attaching a returned
receipt; this module itself performs no transport or durable attachment.

The CSV resolver validates design-only anchors against trusted parsed table
metadata. The tests provide explicit synthetic parser metadata; they do not execute
or qualify an actual CSV parser. Existing text-only turn schemas still reject CSV
anchors. Original file bytes, ordered duplicate headers, logical record spans,
parser revision, coverage and bounds remain material to any future integration.

```powershell
$env:CHIMERA_CONVERSATION_CONTRACTS_ROOT='C:/inetpub/pythia-contracts'
.\backend\.venv\Scripts\python.exe -m unittest backend.tests.test_source_provenance backend.tests.test_conversation_client backend.tests.test_conversation_boundary backend.tests.test_conversation_candidate backend.tests.test_learning_intelligence
```

2026-10-18: 75 tests OK, 6 existing skips; `git diff --check` passed. The new test
module exercises every one of the 19 typed negative examples, plus exact receipt,
revocation/foreign authoring state, unreadable/overclaimed snapshots, absent bytes
and public schema/helper content drift. No service, provider, UI or held-out case
was used. Evidence baseline: Chimera `bb9a22cb08c23716bc3e8e1e199213cae863e39f`
plus this owned change; parent engine source store `ffe6fa41`; new contracts above.

Next: producer source PUT/GET integration and exact-byte/action-grant loopback.
This pure provenance qualification does not qualify ingestion HTTP, signed source
grants, real actor/source storage integration, CSV turns, or the overall G3 gate.


## Raw source HTTP client: stub qualification

`backend/app/source_client.py::SourceCandidateClient` implements the finalized
candidate PUT `/conversation/sources/{source_id}/versions/{version}` and GET
manifest on the same path. Explicit constructor dependencies mirror the existing
conversation client, adding a source-action authorization callback and source JWT
issuer. Issuer arguments are action, exact scope, source ID/version, metadata
digest for ingest or null for read, and the exact original hash list. The actual
signer must add the source-specific claims, including operation_id:null, and
implement the contracts-owned EdDSA trust/expiry rules. Stub token callbacks do not
qualify real signing infrastructure.

`ingest(metadata, original_bytes)` sends exact retained UTF-8 bytes with text/plain,
Content-Length and X-Pythia-Content-SHA256; accepts 201 creation or 200 replay.
`read_manifest(metadata, original_bytes)` sends GET with no source body and expects
200. It needs retained trusted original bytes to check the returned receipt. No
bytes/storage key/download URL are expected from the manifest-only GET response.
Metadata is strict/schema-qualified and bound to current source-action/authoring
state; byte length/hash/eligibility are checked before token issuance and transfer.
No locally prepared eligibility check is returned as if the engine accepted it.

Actual responses must pass strict JSON, new manifest schema and public semantic
checks against those originals, followed by fresh authorization/action/scene/policy
checks. Failure states remain explicit; unreadable snapshots cannot be consumed.
The source client shares the conversation client's bounded no-retry/no-redirect,
10-second, no-environment-proxy HTTP helper, preserving sanitized errors. Source
manifest responses are bounded to 262144 bytes. No client/task fallback is used.

```powershell
$env:CHIMERA_CONVERSATION_CONTRACTS_ROOT='C:/inetpub/pythia-contracts'
.\backend\.venv\Scripts\python.exe -m unittest backend.tests.test_source_client backend.tests.test_source_provenance backend.tests.test_conversation_client backend.tests.test_conversation_boundary backend.tests.test_conversation_candidate backend.tests.test_learning_intelligence
```

2026-10-18: 82 tests OK, 6 existing skips, `git diff --check` passed. New HTTP tests
use `httpx.MockTransport`: raw bytes/routes/headers and exact signer binding,
creation/replay statuses, GET without body, invalid originals before issuance,
read-grant/ingest denial, changed scene/revocation after I/O, foreign/unreadable
receipts, HTTP errors without retry/body leakage, strict JSON and response limits.
Existing conversation and task-provider regressions pass after extracting the
shared transport helper. No frontend changed or required a build.

Baseline Chimera `d4895e0c862d54138463c82ee2de81c874da1a1e` plus this owned
client/test/documentation slice; source candidate ef7b85cf with later test-only
20d2527; producer baseline ffe6fa41. Next: actual ephemeral HTTP qualification
against the producer's explicitly configured source verifier/store. These stub
checks do not yet establish source endpoint interoperability, real actor/source
integration, CSV turn support, live inference or G3 completion.


## Actual source transport qualification and independent re-review

Final committed engine:
`4ca5ef6a32a4420278980f95b4e32245a6b87fc7`.
Chimera source client: `3fbe048d49cd7b57f7168eb5ab8cbdbc23c40b1b`.
Public candidate: `aee473954047fe0b384da8e7934e51cedacee9b6`; its attributes-only
follow-through preserves the pinned source schema/helper content introduced at
ef7b85cf. Parent-owned [source transport evidence](../../Pythia/docs/conversation/g3-source-transport-evidence.md)
records actual ephemeral HTTP raw PUT201, exact replay200 and manifest GET,
followed by a partial-source conversation turn/read/replay/cancel-completed and
revocation using synthetic EdDSA/service identity and one synthetic producer.
Bytes were transferred through HTTP rather than inserted directly into storage.

Chimera's read-only independent review reproduced three blockers in the earlier
working tree: HEAD accidentally entering PUT under service read authority,
Content-Length plus Transfer-Encoding accepted together, and full grant revocation
checked only after source insertion committed. Parent fixed method dispatch,
framing/encoding checks and full grant revalidation inside the write transaction.
The transaction callback runs after INSERT before commit; denial rolls back bytes.

Chimera independently reran each exact reproduction using isolated temporary
synthetic fixtures: framing returned400 with zero stored rows; transaction grant
revocation returned403 with zero rows; HEAD write attempt returned403 with zero
rows. Then, from Pythia root:

```powershell
.\.venv\Scripts\python.exe -m unittest discover -s tests/evals -p test_source_candidate.py -v
```

Result: 11 tests passed in13.077s. No blocking finding remained in that reviewed
source/client/auth/store scope. This is scoped review evidence, not a security
certification. No source/client code was edited during the review.

Parent separately reports its final full synthetic suite at the committed engine
above: 243 tests passed in156.622s, including source11, CSV7, prior regressions and
actual source/turn loopback. Kernel validation and the sibling34-schema unreleased
candidate verification passed. Chimera did not rerun that full suite or claim it
as its own execution. Existing source/client82-test result remains its local
consumer regression evidence. No live model, real application identity integration,
held-out content, hosted gate, publication or overall G3 acceptance is supplied.

## Next independent format boundary

The next bounded step is to make the internal CSV parser consumable through an
agreed public source/answer boundary. The current source metadata/verifier assumes
original text/plain, and the current snapshot/turn citation schemas allow only
text extraction spans. A design-only CSV anchor and a passing internal parser do
not define CSV transport, provider input or turn compatibility.

Contracts and producer/consumer owners must settle these semantics before code:

- Original CSV MIME/byte identity, strict encoding/BOM policy and immutable source
  grant metadata; preserve original hashes/newlines and current actor/session/
  policy/source authority without relabelling CSV as plain text.
- Structured parser projection and its immutable parser/extraction identity,
  ordered exact headers, logical record/column identity and explicit read coverage.
  Define exactly which rows/cells reach the producer and distinguish unread rows.
- The public turn source/citation extension needed to bind full logical record
  spans and column indexes to that exact table. Preserve existing text fixtures,
  schema semantics and canonical digest behavior for unchanged text requests.
- Whether permission remains source-wide; do not invent row-sharing grants or
  treat a row filter as authorization. Recheck current source access before turn
  acceptance/result publication and retain the exact source in corrected history.
- Failure/unsupported states, bounded parser worker/time limits and source
  retrieval. Keep quoted multiline records, duplicate headers, formulas as inert
  data, BOM/Unicode, malformed/ragged records and out-of-coverage anchors in the
  negative qualification set. Do not expose private storage handles.

These are semantic inputs, not proposed endpoint names or payload field guesses.
After agreement: pin the exact additive contract, reuse the bounded parser,
qualify actual source-transfer/turn/citation HTTP against those bytes and guards,
then update client compatibility. PDF/DOCX/Markdown/media/ZIP and exports remain
separate first-gate obligations; this CSV slice cannot close G3 by itself.
