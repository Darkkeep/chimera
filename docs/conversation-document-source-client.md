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

2026-10-19 cross-repository checkpoint: Contracts `41aa2f8` defines media upload
metadata; Pythia `b45b85a`, `866410d`, `0aea7ec`, and `1279d9c` add metadata-only
normalization, exact pinning, signed grant verification, and an opt-in private
inspection route/store. Chimera's client remains PDF/DOCX-only, with no media/ZIP
application binding at this checkpoint. MP3 route qualification uses the synthetic
local fixture; the MP4 fixture exceeds Pythia's current source byte cap. Neither
proves Manteion session integration, production behavior, nor owner acceptance.

## 2026-10-19 Metadata-only media client

`backend/app/media_source_client.py` is a separate opt-in client for signed MP4/MP3
metadata and inspection manifests. It pins the exact media metadata, inspection,
manifest and semantic-helper bytes from the local Contracts candidate; checks
original hash/size/MIME; binds source transfer to the current authoring scene and
policy; and rechecks the trusted worker set after HTTP. It does not inspect media
content, expose transcripts, add media citations, or bind this client to a user
facing upload workflow.

The focused `backend.tests.test_media_source_client` suite passed 5 tests in 0.593s
with mocked HTTP and synthetic bytes. It covers exact PUT/GET envelopes, metadata
and manifest binding, source/worker substitution, current-policy changes, and
redacted no-retry errors. Pythia's `tests/evals/test_media_source_loopback.py`
then passed one test in 4.451s using the actual opt-in route and restricted MP3
worker for signed PUT, immutable replay and manifest GET. It uses a synthetic
signer, service principal and current-access callback; it does not qualify Manteion
session policy, a browser upload workflow, production storage, or live media
understanding.

Evidence revisions: Chimera document client/tests extend `adcab3a`; Pythia engine
is `a99b298e72273598ac6b54a44c727998a8c7c9fd` with the loopback test change;
contracts metadata schema is committed at `136fa58c83bfee86e953ad98a2cbe7dac98bda05`
and Pythia's opt-in pin references that exact revision. The normalized metadata
schema digest is `9ed42383f6fdf05d8322b2f6b9dfaabf0a5c64b3c66821525f84b65640f5d0ed`.
The default vendor is unchanged. No held-out cases, production data, live model,
release, publication or G3 owner acceptance are claimed.

## Next work

Manteion now stores creator-private PDF/DOCX originals as quarantined records under
the current session owner. The remaining cross-repository dependency is to reconcile
uncertain `uploading` reservations and attach a fresh, signed source grant/manifest
to the authenticated session boundary. Manteion must retain exact source identities
and current policy before these clients are used by an application. Other formats,
document turns/citations, full G3, live answer quality and G4-G6 remain open gates.
