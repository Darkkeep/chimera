# Chimera Delivery Guide

Last reviewed: 2026-10-18. Shared journey: `conversation-explainable-answers-files`.
Guide revision: 8. This is a maintained snapshot, not automatic telemetry.

## Start Here

This guide owns Chimera's current responsibilities, evidence, dependencies, and
next work for the shared journey. It supersedes the next-action order in older
[current work](docs/current-work.md) and [contract handoff](docs/pythia-sprint-9-contract-extraction-handoff.md)
documents, which remain historical records and may contain older Manteion counts.
Their existing local edits must be preserved. A historical recommendation to
submit a release candidate is not current authorization to push, merge, or deploy.

Shared product intent lives in Manteion's
[conversation, explainable answers, and files plan](../manteion/manteion/docs/product/conversational-consultation-plan.md).
The other root guides own their respective implementation status:

- [Manteion](../manteion/manteion/DELIVERY_GUIDE.md): primary conversational
  consultation UI, identity/sessions, files, downloads, and product acceptance.
- [Pythia](../Pythia/DELIVERY_GUIDE.md): dialogue, grounded answers, providers,
  ingestion and generated-content orchestration.
- [pythia-contracts](../pythia-contracts/DELIVERY_GUIDE.md): versioned public
  exchanges, examples, types, invariants, and compatibility.

These local links reflect the sibling checkout layout. Elsewhere open each named
repository's root `DELIVERY_GUIDE.md`; do not assume unpushed guides are published.

## Product Gate And Required Formats

> Did Pythia provide an answer I can explain to someone else, including why it
> makes sense, what supports it, and where it might be wrong?

Unrelated feature work, release preparation, and rollout are paused until explicit
owner acceptance of the real capability. Necessary authoring-consumer compatibility,
provenance, access, file, safety, and evaluation work can advance within this goal.

First-gate imports: PDF, DOCX, TXT, Markdown, CSV, MP4/MPEG-4, MP3, ZIP.
First-gate exports: DOCX, PDF, Markdown, CSV, MP4, MP3, ZIP.
"MPG4" means MP4/MPEG-4. These are the shared Pythia consultation/file requirements,
not a claim that Chimera already consumes/generates them all through Pythia.
PPTX/XLSX/images/OCR remain a separate priority decision for the new journey;
Chimera's existing PPTX/image/OCR authoring support is not being removed.

## How Far Along We Are

**Journey status: Pythia G1 packet accepted; G2-G6 not accepted.** Existing authoring,
media, export, and deterministic Pythia task workflows are reusable foundations,
not a qualified conversational answer/file capability.

Baseline inspected: `dc3cffb7d647b59236f8df88008234ef573ea34e`, branch
`feature/manteion-pythia-interoperability`. Two pre-existing dirty handoff documents
were present and must not be reset or silently rewritten. Local tracking status
is not a fresh remote/CI check or publication claim.

Verified sources and their limits:

- [Pythia provider](backend/app/learning_intelligence.py) uses HTTP task, status,
  artifact, cancel, health, and provider operations. Its inspected protocol has no
  conversation operation. Existing validators bind project/scene IDs and draft
  artifact identity; preserve those checks.
- Existing [analysis UI](frontend/src/PythiaAnalysisView.tsx) and related task
  views are not proof of open-ended dialogue or source-grounded conversational
  explanation. Do not relabel those task screens as the new capability.
- [Current work](docs/current-work.md) records authoring, Word/media/package
  exports and earlier qualification, including historical backend/browser test
  results and their limitations. Those suites were not rerun for this guide;
  no new live-model, media-understanding, LMS, or human approval is asserted.
- Manteion's [cross-client record](../manteion/manteion/docs/api/pythia-compatibility.md)
  contains prior synthetic interoperability/provenance qualification. It is not
  current conversation qualification and contains dated candidate references.
- Existing media playback/OCR or SCORM/standalone ZIP export does not establish
  Pythia ingestion, generated media, a safe general ZIP import path, or answer
  fidelity. Existing authoring features must keep passing while the new path grows.

## Shared Milestones And This Repository's Work

IDs match Slices 1-6 of the shared plan. Manteion coordinates owner acceptance;
Chimera owns its authoring-client code/evidence. Do not duplicate the intelligence
engine or build a second competing chat UX without an explicit design decision.

### G1 - Reference Conversations And Evaluation Baseline

Status: `accepted` for the Pythia packet only; independent evaluation freeze and
separate client acceptance remain pending. Owner: product owner with affected engineers.

Manteion's [synthetic reference cases](../manteion/manteion/docs/product/conversation-reference-cases.md)
are complemented by Pythia's [G1 packet](../Pythia/docs/conversation/g1-reference-packet.md),
whose file-comparison example includes exact synthetic scene provenance, a
correction, and an explicit no-storyboard-edit boundary. The packet is committed
locally with [owner acceptance](../Pythia/docs/conversation/g1-owner-acceptance.md)
recorded on 2026-10-18 in Pythia `8daf30d`. This accepts the Pythia target packet,
not a complete frozen evaluation corpus or live capability. Chimera's
[authoring handoff review](docs/conversation-authoring-handoff.md) records source
identity, return-access, authorization and advice-versus-edit requirements.
No conversation adapter has been implemented or qualified.

### G2 - Clearly Synthetic Consult Prototype

Status: `planned`. Primary owner: Manteion; Chimera reviews authoring handoff.

Confirm how users reach the primary Consult experience from a project/scene and
return without losing authoring context. Prototype links with inert fixtures.
Do not send source bodies, credentials, or sensitive content in a URL. Sending
project/scene IDs does not grant the destination permission to read them.

### G3 - Versioned Exchange And Safe File Ingestion

Status: `in-progress`. Owners: contracts/Pythia; Chimera owns its consumer boundary.

Internal [source/return guards](backend/app/conversation_boundary.py) now check
immutable authoring bindings, current authorization and advice-only semantics.
Focused synthetic checks pass; these guards are not wired to a conversation route
or application route. An independent opt-in
[public candidate HTTP client](backend/app/conversation_client.py) now implements
submit/read/cancel with strict schema/semantic validation and current authoring
checks. Its narrow transport is now `qualified-synthetic` against actual ephemeral
loopback HTTP in Pythia, in addition to stubbed HTTP checks. This used synthetic
credentials/source/producer, not live inference or application actor integration.
The internal authoring mapping is qualified synthetically against
unreleased contracts `d7b904d772730a7365388623a59d3f07828c07e1`
using explicit sibling schemas; no vendor pin changed. Parent source-store evidence
is now committed at `ffe6fa41afce4910add630b30f71b407229f6d6a`; parent reports
225 full-suite tests passed in 142.678s. Chimera did not rerun that suite.
[Source-grant/CSV requirements](docs/conversation-source-grants.md) and 19 typed
negative consumer examples now have pinned pure provenance validation against
contracts source candidate `ef7b85cfa31e0e8961663fbb6da4dcb112f55533`.
75 focused tests passed, 6 existing skips. No source-transfer HTTP or CSV parser/
turn support is implemented by this consumer slice. Integrated HTTP/session
compatibility, required file formats and overall G3 exit remain pending.

Qualify the additive public contract against the actual Chimera adapter, including
consumer `chimera`, tenant/project/session access, exact source versions/hashes,
stable scene/file/time/member references, and output-manifest validation. Reuse
the public HTTP boundary, not direct imports of Pythia internals. Do not guess
conversation routes, source access rules, or media/archive schemas.

Review useful existing extraction/render/export utilities for qualified reuse;
reuse must preserve their dependency, permission, and output guarantees. Do not
make the Pythia engine depend on a running authoring browser or copy reasoning
logic into Chimera. A new contract can be qualified as a local candidate before
publication; never label that candidate a release.

### G4 - Real Answers And Generated Files

Status: `blocked`. Dependencies: G3, Pythia producer, and Manteion session handoff.

Demonstrate exact project/scene sources reaching the authorized conversation,
source-grounded answers returning with preserved producer/answer/source identity,
and permitted generated-file retrieval. A user may inspect or copy advice without
applying it. Apply a change to a storyboard only through an explicit authorized
action with revision conflict checks and preserved history, not a chat response.

Qualify applicable file previews/import handoffs against actual output bytes.
Do not claim that every shared export is a Chimera-native authoring format or
that a generated ZIP is automatically a valid SCORM/QTI/release package.

### G5 - Quality, Explainability, Recovery, And Safety

Status: `blocked`. Dependencies: G4 and the frozen evaluation baseline.

Exercise cross-client provenance and permissions, foreign/unavailable projects,
stale scene/file revisions, partial media/archive coverage, failures, correction,
reload/retry, and no unintended storyboard changes. Include the shared user
explanation test and independent source checks. Retain authoring/media/Word/SCORM
regressions; format validity or successful playback alone does not prove an answer.

### G6 - Default Experience And Deliberate Resume

Status: `blocked`. Dependencies: G5 and explicit owner acceptance.

Document the supported handoff/consumer combination, limitations and rollback.
Preserve local authoring and existing project formats. Only an explicit owner
decision resumes unrelated work. No model answer, local review, file export,
manual production-stage label, or schema check grants formal release authority.

## Next Developer Action

Qualify source-transfer HTTP against the producer's explicitly configured source
grant/PUT/GET boundary after it is ready, using the pinned provenance adapter and
[typed consumer examples](docs/conversation-source-grants.md). Integrate application actor/session
boundaries using the
[authoring handoff requirements](docs/conversation-authoring-handoff.md), especially
scope attestation, exact source identity, revision/replay/cancellation and return
access. Then qualify the actual Chimera adapter. Do not continue the old
candidate-push/release next step or wait for publication to discuss the candidate.

## Verification And Status Updates

Applicable regression commands from this root, using synthetic isolated workspaces:

```powershell
python -m unittest discover -s backend/tests
npm --prefix frontend run build
npm run test:onboarding -- --project chromium
npm run test:management
```

Hosted-auth, visual, and Golden Path harnesses are additional scoped gates when
their surfaces change; follow the actual package scripts and documented test
setup. They are not permission to make real provider requests or publish a course.
Add focused consumer/source/file/conversation qualification as implemented and
record deterministic versus real model use. Do not run runtime suites just to
refresh a documentation date or report old CI as new evidence.

Use `planned`, `in-progress`, `implemented-local`, `qualified-synthetic`,
`qualified-live`, `blocked`, and `accepted` as defined in the
[Manteion guide](../manteion/manteion/DELIVERY_GUIDE.md#evidence-required-for-a-status-change).
Record exact date/commands/results, full Chimera/Pythia/contracts revisions and
dirty state, consumer/tenant setup without secrets, source/case identity, evidence
path, owner, and limits. Acceptance requires an explicit attributable gate record.

At session start read the affected guides/shared plan and inspect scoped Git
status/diffs. After meaningful work update this guide's local status, blockers,
evidence, next action and review date in the same change. Coordinate affected
G1-G6 entries across repos; each repo verifies its own claims. Record missing
guide updates rather than claiming synchronization. Shared product intent lives
in the Manteion plan; don't duplicate a competing global completion counter.

Update record template: `date | G-ID | before -> after | owner | full consumer/
engine/contracts revisions | commands/results | evidence path | dependencies/
limits | next action`. Preserve dirty project/docs and untracked assets. Stage
exact owned files only; no push/merge/release/deploy/training or formal approval
is authorized by this guide.

## Change Record

- 2026-10-18: Added pinned public source metadata/receipt and design-only CSV-anchor
  validators with local source-action/scene grants. All 19 typed consumer negatives
  are exercised; 75 focused tests OK, 6 existing skips. Contracts source candidate
  `ef7b85cf`; no source HTTP transport/parser or G3 completion implied. Next:
  qualify producer source PUT/GET boundary with current grants and exact bytes.

- 2026-10-18: Synchronized committed parent private-source evidence `ffe6fa41`;
  parent reports 225 full-suite tests passed in 142.678s, not rerun by Chimera.
  Prepared 19 typed negative source/scene-grant and CSV-anchor consumer examples
  for contracts review. No transfer/CSV runtime capability claimed. Next: exact
  additive contract and pinned consumer validation before source-transfer code.

- 2026-10-18: Recorded Pythia-owned actual loopback qualification using Chimera
  `69a9b6d6e159c1b0a1e0898aee4c9622654bfeeb`, engine baseline
  `5c66b818e60819d05169c3f7dd86bc6ebfac48bf` and contracts `e801445`.
  Parent reported one passing test; latest private SQLite source-reader rerun
  passed in 2.656s against ongoing engine source-store work. Exact distinction
  and evidence: `docs/conversation-authoring-handoff.md`. Narrow transport only
  is qualified-synthetic; G3 remains in-progress. No Chimera code/tests changed.

- 2026-10-18: Added independent public candidate HTTP submit/read/cancel transport,
  with exact content-pinned public schema/semantics, service bearer and trusted
  access-token issuer. 70 targeted tests OK, 6 existing skips. HTTP tests use
  synthetic stubs only; application/session integration and actual engine roundtrip
  remain pending. Evidence: `docs/conversation-authoring-handoff.md`.

- 2026-10-18: Qualified the internal authoring scope mapping synthetically against
  unreleased contracts `d7b904d772730a7365388623a59d3f07828c07e1`.
  56 targeted tests OK, 6 existing skips. Candidate is text-only and has no exports;
  no public HTTP adapter or full G3 qualification claimed. Next: integrate actual
  operation/session boundaries and source extraction when available.

- 2026-10-18: G3 consumer boundary planned -> in-progress. Added pure internal
  source/return authorization guards and 9 synthetic test methods. New plus
  existing learning-intelligence regression: 49 tests, OK, 6 existing skips.
  Initialized the previously absent vendor at existing pin
  `1fb6584a36552ca3f9f77ba1479fef45f8137b73`; no pin change. Evidence and limits:
  `docs/conversation-authoring-handoff.md`. Next: map/qualify exact public candidate.

- 2026-10-18: Recorded attributable Pythia G1 packet acceptance and completed
  Chimera's documentation review of Reference C/G3 source and return boundaries.
  Evidence: `docs/conversation-authoring-handoff.md`; Pythia acceptance `8daf30d`.
  No runtime tests, new API, frozen corpus, client compatibility or release claim.
  Next: agree candidate exchange with contracts/Manteion before adapter changes.

- 2026-10-18: Recorded the Manteion G1 reference-case draft and pending
  authoring-grounded review. Pythia's committed packet supplies a synthetic scene case;
  no Chimera runtime change or G1 acceptance.
- 2026-10-18: Added Chimera to the four-repository delivery guide set. Inspected
  the HTTP provider and existing handoff state; preserved both dirty handoffs.
  G1-G6 remain unaccepted. Documentation only; runtime suites not rerun.