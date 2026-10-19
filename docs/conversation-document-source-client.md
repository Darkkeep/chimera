# PDF/DOCX source candidate client

2026-10-19. Opt-in local candidate qualification only. The client consumes the
unreleased document partial-text schemas from pythia-contracts and the explicit
Pythia signed source-manifest route. It adds no document turn/citation operation,
provider call, application persistence or released/default route.

## Client boundary

`backend/app/document_source_client.py` supplies `PublicDocumentSourceCandidate`
and `DocumentSourceCandidateClient`. Its content pins cover the new
`document-source-ingestion-metadata` schema plus the document extraction, manifest
and citation schemas and contracts-owned semantic helper. The client uses the
source metadata digest and authoring-boundary helpers. A source grant binds action,
scope, source ID/version, original hash/size and PDF/DOCX MIME for ingest. It sends
exact retained bytes by bounded PUT; manifest GET sends no body. Redirects, retries,
environment proxies and task fallback are not used.

Before credential issuance and again before returning a receipt, the caller's
current authoring binding, source action, policy and scene revision are checked.
The client validates strict manifest structure and document semantics, rechecks
original bytes/hash/size and MIME, and requires the worker identity to remain in a
fresh trusted allowlist. Only an authenticated server receipt plus retained exact
original bytes can establish a local trusted record; actor-supplied JSON cannot.
PDF/DOCX remain partial text, with page/paragraph/cell anchors and explicit
uninspected-content limits. This client does not parse either format or establish
that a completely rehashed worker extraction is correct; that trust remains at the
qualified producer/worker boundary.

## Verification

Stub/adversarial tests, from the Chimera root with the explicit candidate checkout:

```powershell
$env:CHIMERA_CONVERSATION_CONTRACTS_ROOT='C:/inetpub/pythia-contracts'
.\backend\.venv\Scripts\python.exe -m unittest backend.tests.test_document_source_client -v
```

Result on 2026-10-19: 5 tests passed in 1.022s. They cover PDF and DOCX receipt
validation, exact MIME/bytes and grant digests, source/manifest/hash/document/worker
substitution, invalid input before credentials, action denial, post-I/O scene and
worker revocation, and redacted no-retry transport failures.

Actual producer loopback, from the Pythia root:

```powershell
$env:PYTHIA_TEST_SOURCE_WORKER_IMAGE='sha256:2cdfcf80f1f3e70148305efe5363918fd4652e592df963566e58c155255a6fc8'
.\.venv\Scripts\python.exe -m unittest discover -s tests/evals -p test_document_source_candidate.py -v
```

Result: 5 tests passed in 26.499s. The cross-repo test uses a real ephemeral HTTP
server, the restricted worker, and Manteion's committed synthetic PDF/DOCX files.
Chimera's client performs signed PUT201, immutable replay200, and manifest GET200
for each format. Worker execution occurs exactly once per source. The test validates
partial status, exact original and extraction hashes, typed anchors, qualified
worker provenance, and authenticated manifest reconstruction. Existing tests in
the same module also cover unreadable input, wrong MIME/service scope, access
revocation rollback and worker allowlisting.

Evidence revisions: Chimera document client/tests extend `adcab3a`; Pythia engine
is `a99b298e72273598ac6b54a44c727998a8c7c9fd` with the loopback test change;
contracts metadata schema is committed at `136fa58c83bfee86e953ad98a2cbe7dac98bda05`
and Pythia's opt-in pin references that exact revision. The normalized metadata
schema digest is `9ed42383f6fdf05d8322b2f6b9dfaabf0a5c64b3c66821525f84b65640f5d0ed`.
The default vendor is unchanged. No held-out cases, production data, live model,
release, publication or G3 owner acceptance are claimed.

## Next work

The next cross-repository dependency is Manteion's trusted actor/session/source
persistence and access wiring. It must retain exact source identities and current
policy through session operations before these clients are used by an application.
Other formats, document turns/citations, full G3, live answer quality and G4-G6
remain separate open gates.
