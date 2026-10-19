# CSV source candidate client

The opt-in `backend/app/csv_source_client.py` adds `PublicCsvSourceCandidate(root,
allowed_workers=callback)` and `CsvSourceCandidateClient`, with the same constructor
and `ingest(metadata, original_bytes)` / `read_manifest(metadata, original_bytes)`
API as the plain source client. Its public schema/helper content pins are the
exact additive CSV candidate `0fb76c5cf6517db5db6e8aeb0ff217410c189614`.
Existing plain clients, schemas, vendor pointers and application routes are unchanged.

The client sends exact UTF8 CSV bytes only to the explicitly configured source
PUT route, then validates an authenticated full receipt. GET sends no source body.
Service authentication and a separate signed source action proof are required.
There are no redirects, retries, proxy environment adoption or task API fallback.
Original bytes are limited to 262144 and response bytes to 1048576. Current
authoring identity, source action, policy and scene revision are checked before
credentials/HTTP and after the response; the qualified worker allowlist is a
mandatory fresh callback.

`contract.trusted_record(metadata, receipt, original_bytes)` reconstructs a full
public extraction document only for `ready` or `no_data_rows` receipts. It checks
exact original hash/byte size, strict UTF8, metadata/snapshot identity, full row
coverage, codepoint bounds, ordered duplicate-header disclosure, the complete
extraction schema/semantics and canonical extraction SHA, and current worker
qualification. Header span ends at the first data record or the retained text
length for a header-only source. Partial receipts cannot establish full records.
The returned scoped record can feed `TableConversationClient`'s authoritative
record callback after trusted storage and fresh authorization checks.

This is an authenticated server-response trust boundary. The client does not
independently parse CSV or prove that a completely rehashed extraction is the
correct interpretation of the raw bytes. Actor-supplied JSON must never be passed
as an authoritative receipt. An allowlisted worker ID asserted by an actor is not
authority. The caller must retain authenticated provenance and revoke cached
records when current access or worker qualification changes.

Focused synthetic HTTP stub checks: 7 tests passed in 1.481s on 2026-10-18, covering
raw PUT/GET, multiline/duplicate headers, header-only records, partial rejection,
modified metadata/header/cell/span/hash, worker/action/policy/scene revocation,
exact bytes, response bounds and failure/no-retry behavior. These checks do not
qualify this new source client against actual HTTP yet.
The combined new CSV source, existing plain source and table client regression
run passed 22 tests in 2.263s; no frontend surface changed.

Pythia engine source/CSV turn transport is committed at `fec9bce`; parent reports
298 tests passed in 274.180s with actual Docker and the earlier table conversation
loopback, plus kernel/evaluation verification. Our independent current table HTTP
rerun passed 7 tests in 31.824s. The earlier actual table loopback used raw httpx
source transfer and Chimera table client `74c6af5`; it did not use this new source
client. Next qualification replaces that raw source HTTP with this client and
feeds only its validated authenticated records into the table client. No live
provider, full application integration or G3 owner acceptance is claimed.

## 2026-10-19 actual producer loopback

The exact `CsvSourceCandidateClient` is now exercised against the actual opt-in
Pythia source/turn service in the cross-repository harness
`Pythia/tests/evals/test_table_conversation_loopback.py`. The focused command, run
from the Pythia root with
`PYTHIA_TEST_SOURCE_WORKER_IMAGE=sha256:2cdfcf80f1f3e70148305efe5363918fd4652e592df963566e58c155255a6fc8`,
passed 1 test in 12.299s on 2026-10-19.

That test uses real ephemeral HTTP and the restricted worker: client PUT201,
immutable replay200 and manifest GET200; authenticated receipt plus retained bytes
reconstructs the trusted extraction record; the table client then submits, reads,
replays and cancels a 1.1 turn. Only row 2 reaches the synthetic producer, which
runs once and returns a citation matching original/extraction/worker/header/row/
column/span identities. Worker and source revocation, stale scene revision, and
absence of task submission are verified. This is `qualified-synthetic` for that
exact boundary, not production actor/session wiring, live inference, G3 acceptance
or publication. The stub checks remain useful adversarial coverage, not the sole
transport evidence.

Revisions: Chimera client `d96bcd3247e19747c33d32161ba2fe89058ba954`; Pythia
engine `a99b298e72273598ac6b54a44c727998a8c7c9fd` plus the integration test change;
contracts checkout `8eb5469a1762b20430c7c8185058eac6990e4533`, with the CSV source
content still pinned to candidate `0fb76c5cf6517db5db6e8aeb0ff217410c189614`.

Next: integrate the qualified source clients with Chimera's trusted application
actor/session boundary and Manteion's private session persistence. Keep the
Pythia document route opt-in; application authorization, storage and return
checks are separate qualification gates.
