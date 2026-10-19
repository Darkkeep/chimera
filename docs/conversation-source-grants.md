# Authoring source-transfer and CSV consumer requirements

2026-10-18. Proposed consumer requirements against the next additive contracts
candidate, not implemented upload/CSV support or a public release.

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
