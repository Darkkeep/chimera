# CSV1.1 public conversation client qualification

2026-10-18. Narrow synthetic client qualification; G3 remains in-progress.
Exact unreleased contracts candidate:
`0fb76c5cf6517db5db6e8aeb0ff217410c189614`.
No existing text-only schema/helper/client pin or default vendor was promoted.

## Contract and trusted source boundary

`backend/app/table_conversation_client.py::PublicTableConversationContract` pins
new table request/operation1.1, full CSV extraction document, CSV snapshot,
qualified citation and public semantic helper bytes. It also loads the unchanged
pinned text canonical helper. Reviewed helper imports are scoped to that verified
module without changing process-global import paths/registries. CRLF checkout
normalization is supported; other content drift fails before helper execution.

The full canonical extraction digest binds parser revision, ordered exact string
headers, header span, all logical rows/cells/spans and duplicate-header disclosure.
Original-byte SHA remains distinct from full extraction SHA. Selecting read rows
changes the context/request digest but not full extraction identity. Columns are
zero-based and CSV values remain strings; no coercion/formula evaluation occurs.

`TableConversationClient` uses the existing explicit bounded HTTP submit/read/
cancel transport with the new contract. Trusted server callbacks must provide:
current actor/source authorization, local scene/binding and policy; current scoped
CSV extraction records keyed by source ID/version; and a current allowed-worker
set. Schema and self-consistent hashes alone cannot establish those records.
No CSV parser, worker, upload route, application session or permissive signer is
automatically configured by this client.

Before token issuance/HTTP and again before returning a result, the client checks
scope/current policy, immutable original authoring source identities, current
scene revision, trusted extraction documents, original/parser/worker bindings,
ordered headers and exact projected rows against the authoritative record and
worker allowlist. The public source access JWT still binds original hashes;
authoritative extraction and worker checks are additional, separate requirements.
Callbacks must load fresh trusted state and never simply echo actor assertions.

The producer receives the selected public context, not the client-side trusted
full extraction record. Row projection must equal declared inclusive read-row
coverage with no extra/missing/duplicate rows. Header-only input uses no_data_rows
and cannot yield a data citation. Result validation checks exact request/context/
answer identity and qualified row/column/record-span citations. A newly revoked
worker/source or changed scene after I/O hides an otherwise valid answer.

## Synthetic checks and limits

```powershell
$env:CHIMERA_CONVERSATION_CONTRACTS_ROOT='C:/inetpub/pythia-contracts'
.\backend\.venv\Scripts\python.exe -m unittest backend.tests.test_table_conversation_client backend.tests.test_source_client backend.tests.test_source_provenance backend.tests.test_conversation_client backend.tests.test_conversation_boundary backend.tests.test_conversation_candidate backend.tests.test_learning_intelligence
```

2026-10-18: 90 tests OK, 6 existing skips. New CSV1.1 tests use public development
vectors and `httpx.MockTransport`; no held-out data, parser, source endpoint or
provider was called. They cover selected-only transport; old1.0 rejection of1.1;
independently rehashed extraction/worker/parser/header/cell/span substitutions;
missing/foreign/unqualified authoritative records; incorrect coverage/rows;
rehashed citation worker/extraction/header/row/column/span drift; full-extraction
identity across read selection; post-I/O allowlist revocation/stale scene; and a
header-only clarification with no data citation. Existing text/source/task client
regressions continue passing. `git diff --check` passed; no frontend changes/build.

Evidence baseline: Chimera `00c3ebaa5be45638983119a9833f553ffc646dbc` plus this
owned client/test/docs change; parent source engine
`4ca5ef6a32a4420278980f95b4e32245a6b87fc7`; exact new candidate above.
The parent is separately implementing internal isolated parsers and CSV server
records/turn integration. Client stubs do not qualify that producer or real
actor/issuer/session infrastructure.

## Next integration slice

Pin the exact new producer contract; populate scoped immutable full extraction
records from explicitly qualified workers with original-byte binding and current
worker allowlist; qualify actual CSV source PUT/manifest GET and1.1 turn/read/
replay/correction/citation loopback. Preserve current source/action authorization,
scene return checks, version1.0 behavior and source-derived history access.

The isolated parser worker's internal2MiB input allowance does not increase the
public CSV upload cap262144. PDF/DOCX/Markdown/media/ZIP original/extraction and
format-anchor contracts, generated files, live answer quality and complete G3
acceptance remain separate pending work. No route names or vendor promotion were
invented by this client slice.

2026-10-19 update: the planned exact CSV source-client loopback is complete. The
cross-repository test exercises actual source PUT/replay/manifest GET through
`CsvSourceCandidateClient`, then passes its authenticated reconstructed record to
the table client for a real synthetic turn. See
[CSV source-client evidence](conversation-csv-source-client.md) for the command,
revisions, results and limitations. The PDF/DOCX manifest client has since passed
an actual-worker loopback; next integration work is the application actor/session
boundary and Manteion private persistence. No live or overall G3 qualification
follows from these loopbacks.
