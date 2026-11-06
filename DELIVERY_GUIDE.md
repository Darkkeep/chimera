# Chimera Delivery Guide

Last reviewed: 2026-10-18. Shared journey: `conversation-explainable-answers-files`.
Guide revision: 13. This is a maintained snapshot, not automatic telemetry.

Product-level reconciliation (2026-10-28): Chimera's local timeline/appearance delivery is recorded in [current work](docs/current-work.md); [creator pre-alpha readiness](docs/pre-alpha-readiness.md) owns the local pilot's open release checks. This guide continues to govern the named shared journey; local authoring completion does not close its integration or G3 gates.

Cross-repository records below use `repository:path` locators rather than links into absent sibling checkouts. Their sources belong to [Manteion](https://github.com/Darkkeep/manteion), [Pythia](https://github.com/Darkkeep/Pythia), and [pythia-contracts](https://github.com/Darkkeep/pythia-contracts). Those records are not bundled Chimera guides; their availability and current acceptance must be verified upstream before changing shared-journey status.

## Start Here

Constrained final-envelope follow-up: latest run completed search, learning
design and assessment before malformed final proposal/conflict structure failed.
Pythia final drafting now requests strict OpenAI JSON Schema output, not merely
another prompt adjustment. Field values decode from JSON strings to unchanged
native proposal values; Chimera's validation and explicit review are unchanged.
Unsupported model/schema or refusal fails without silent downgrade/paid retry.
48 focused Pythia tests and contracts pass; live final-call completion is unverified.

Assessment-format follow-up: latest retry failed assessment item validation
before final drafting (search and learning design completed). Pythia's planner
had requested polls alongside native scored formats. Guidance now explicitly
constrains scored items to registered native types, derives required fields
from the schema, and leaves polls/reflections as review recommendations.
Future invalid drafts report item numbers and matching-branch field errors,
without exposing prompts/answers. 43 focused Pythia cases and contracts pass;
no paid retry or user-course edit, and no claim that historical failing items
were recovered or that live end-to-end generation is qualified.

Citation handoff follow-up: latest live run completed research_web,
learning.design-brief and assessment.blueprint, retaining three cited sources;
final proposals failed exact excerpt validation. Local drafting now selects
server-owned source-passage IDs and the adapter supplies exact source identity
and excerpt (chunks bounded below the 2,000-character citation limit). Backend
validation remains unchanged. Historical failed output cannot be reconstructed;
no paid rerun or automatic quote repair was performed.
Verification: 41 focused Pythia cases and 17 Chimera expansion/job cases pass,
plus contract validation. All 12 passage selections derived from the failed
run's three retained sources resolve to exact, bounded substrings. Live final
drafting with this selection contract remains unverified.

Live search now observed: enhancement-96987a1a22d0 completed research_web with
nine cited sources (25 search sources), one 7,251-character answer and no refusal.
The following research.synthesize failed schema validation; its invalid draft
was not retained, so exact failing fields are unknown. The research adapter now
supplies the canonical research_sources input required by its guide, preserves
unknown/unverified metadata, and enforces exact source-list preservation.
Failures retain bounded schema-path/rule diagnostics. No paid retry was made.
Review now has a pinned active-job banner with spinner, elapsed time, latest
server message and reduced-motion support. Status polling errors retain the last
known active state rather than silently clearing it.
Verification: 38 focused Pythia tests plus contract validation, 18 desktop/mobile
browser cases across Chromium/Firefox/WebKit, and frontend type-check/build pass.
The six Chromium cases were rerun after final initial-load state isolation.
Frontend/backend health checks pass. No paid call or course edit was performed.

Required-search slice: the separate opt-in is now **Search the public web before
drafting**, not discretionary permission. Selected runs restrict the first planner
action to research_web (catalog, schema and runtime guard), require cited
evidence, then permit up to two specialists within the existing three-tool/seven-
request budget. Chimera independently rejects missing, uncited or late searches.
No automatic retries, new permissions or course mutations were introduced.
Verification: 35 focused Pythia tests, 17 Chimera expansion/job tests, nine
desktop/mobile browser cases across Chromium/Firefox/WebKit, type-check and
production build pass. Live account/model search eligibility is not claimed.

Second live-run follow-up: research synthesis and learning design completed,
but assessment.blueprint reported output truncation while drafting 8-10 items.
Specialist calls had inherited the generic 4,096-token allowance. They now
explicitly request 16,384 tokens (matching final drafting), with concise
64,000-character guidance and unchanged validation/time/request limits. Thirty-three
focused Pythia tests and contract validation pass, including the actual HTTP
request allowance, a schema-valid ten-item blueprint, and retained completed
receipts/sources on truncation without retry. No paid call or course edit was
performed. Fresh per-request bridge processes load the change without restarting
Chimera. The failed run had no completed live web-search execution.

Live-run follow-up: the first public-research attempt produced a 525-character
query, accepted by the 2,000-character planner but rejected by the search tool's
500-character guard before any search HTTP request. The catalog, planner and
search now share the 2,000-character bound; no query truncation or paid retry.
Safe failure reasons/stages now reach both execution receipts and the job error,
without exposing raw provider bodies. The actual saved query forwards intact to
mocked transport. Thirty focused Pythia tests plus contract validation and sixteen
Chimera expansion/job tests pass. No live search/model call was made for this fix,
and the original failed job/course remain unchanged.

Local authoring orchestration connection (Storyboard suggestions only):

- Explicit **Enable specialist tool orchestration** executes registered
  Research, Learning Design, Storyboard Analysis, Assessment, Technology Fit and
  Evaluation specialist calls using canonical guidance and payload validation.
  A model-selected plan is executed and its actual results feed final drafting.
  Optional **Allow public web research** invokes the configured OpenAI Responses
  hosted search tool; a completed search receipt and cited sources are required.
- Preview lists permissions and the seven-provider-request ceiling without
  making a model/search request. Up to three tools can run; saved text-model
  connections reserve all seven daily requests conservatively before launch.
  Initial cost/input estimates exclude subsequent context and search costs.
  Only public non-confidential research is appropriate; queries may leave the
  model provider. Endpoint readiness is not proof of account/model eligibility.
- Received tool results, completed/failed status, instructions and source links
  persist on jobs and remain inspectable after reload or final-draft failure.
  Web passages are marked provider-cited synthesis, not verbatim page evidence.
  Citation excerpts must match retained versions/locators. Explicit acceptance,
  revision checks and unchanged-scene undo protections remain intact.
- No automatic retry or restart replay of tool runs; bounded tool/final deadlines
  fit the existing bridge timeout. No arbitrary plugin loading, shell/file tools,
  publishing or media-production access. Consult Pythia and experience/video
  treatments are intentionally unchanged in this first connection.
- Evidence: focused backend tests report 61 cases with one opt-in case skipped;
  15 desktop/mobile Chromium, Firefox and WebKit checks pass. TypeScript and the
  production build pass with the existing chunk-size warning. Installed MCP
  discovery reports all six specialists and endpoint-level web-search support.
  The affected Pythia MCP/provider/authoring suites pass 44 tests and contract
  validation. Full Pythia discovery runs 442 cases: 329 pass, 90 skip and 23 error
  on unchanged conversation/media reviewed-byte pin mismatches. Those unrelated
  trust pins are not altered or bypassed.
  No live model/search call, paid media call, real-course mutation or automatic
  retry was performed. Source guidance is updated; bundled PDF remains unchanged.

Local Storyboard suggestions expansion fix:

- Confirmed root cause: the legacy Engine `storyboard.enhance` only copied learner
  text into missing action descriptions, ignored expansion goals and reported
  zero proposals as completed. Single-user runs now use the installed live local
  `pythia_storyboard_enhancement` tool. Shared installations retain the Engine.
  Preview discovers capability without a model call; explicit submission can
  incur charges through the installed plugin or saved text-model connection.
- New `additionalScenes` proposals draft after selected anchors, including
  whole-course expansion. Strict bounded drafts receive server-owned identities
  and normal native layouts. Originals/media remain unchanged; explicit grouped
  acceptance is required. Undo preserves changed scenes and assessment references.
  Default layouts are captured before approval so reload preparation cannot
  falsely mark untouched additions as edited.
- Empty results fail explicitly; historical zero-result runs remain visible and
  are never retried automatically. All proposal changes are preflighted before
  persistence. Submitted readable, versioned references and citations are checked.
  File paths and `@research` alone grant no browsing permission. Without the
  explicit orchestration/research controls above, missing research remains a
  production gap, not invented evidence.
- Evidence: 41 focused Chimera expansion/context/bridge tests, 30 Pythia
  enhancement/provider/authoring/video/experience tests, contract validation and
  six desktop/mobile browser cases across Chromium, Firefox and WebKit pass.
  TypeScript and production build pass with the existing chunk-size warning.
  A broader 77-test storyboard/bridge run had one unrelated existing SCORM
  optional-only completion harness error (`cmi.core.lesson_status` missing);
  it also fails in isolation and was not changed in this slice. Existing Python
  diagnostics outside the new logic remain; no clean repository-wide claim.
- No live model requests, paid media calls, user-course mutations or automatic
  retries. Source guidance is updated; bundled PDF is unchanged. This local fix
  does not qualify shared deployment or close integration/release gates.

Local Scene Editor media integration:

- **Edit scene > Media** reuses candidate generation, scene-aware Pythia video
  treatments, job feedback, and candidate review without leaving the editor.
  Configured image/narration/video connections and existing authorization gates
  are unchanged. Opening the tab does not generate media.
- Unsaved scene context requires explicit **Save scene for media**, which saves
  without closing the editor. Save failures preserve edits and block new requests.
  Media request fields survive tab switches, not editor closure.
- Candidate approval refreshes the editor's project/assets without resetting its
  local scene state. Placement remains explicit through the reused placement,
  captions, and shared-media panel; stage image insertion and timeline controls
  remain available. Submission/approval/placement busy states protect editor saves.
- Evidence: 20 targeted provider-free Chromium scenarios pass, including image
  requests, narration prefill from newly saved context, both video providers in
  both entry points, failed context saves, tab retention, candidate approval,
  persistent placement, mobile scene-aware context reachability, treatment
  review/refinement, and original media-library regressions. Stale test fixtures
  now return an array for job-list GET and expand Other project media before
  attaching. TypeScript, production build, editor diagnostics, and diff whitespace
  checks pass; the existing large-chunk build warning remains.
- No live model or paid-render calls were made; tests use synthetic projects and
  provider fixtures. Source user guidance is updated; bundled PDF is unchanged.
  This does not close shared integration/release gates.

Local authoring polish (Autopilot request):

- Question saves now show a bordered checkmarked confirmation with a live status
  announcement, and the action changes to **Question saved**. Edits and save
  attempts clear the old success state; failed saves retain the draft and show
  the server error.
- Scene duration accepts keyboard replacement and decimals, committing on Enter
  or blur. Escape restores the current duration. Invalid numeric input cannot
  silently save the old value; existing content-endpoint checks remain intact.
- **Consult Pythia** is first in WORKSPACE; visible application, documentation,
  and browser-test references use the new name. Internal routes and identifiers
  remain compatible.
- Text insertion is a labeled **Text layer** action grouped with **Insert shape**.
  Selection, Undo/Redo, persistence, and reopening are covered.
- Validation: 23 distinct provider-free Chromium scenarios passed across
  authoring polish, question authoring (light/dark at 390/1440 px, including saved
  cue contrast), layer selection, timeline, consultation, project dismissal,
  and project planning. Three live-Pythia cases remained intentionally skipped.
  Two new test expectation mismatches were corrected (server error wording and
  disambiguation of the timeline status from its clock output); both new
  scenarios passed on rerun. TypeScript and the production frontend build pass;
  the existing large-chunk warning remains. Frontend and backend HTTP checks
  both returned 200. No provider/render calls or user-course edits were made.
- Markdown guidance is updated; bundled PDF and older guide screenshots have
  not been regenerated. These local UI checks do not close shared G1-G6 gates.

This guide owns Chimera's current responsibilities, evidence, dependencies, and
next work for the shared journey. It supersedes the next-action order in older
[current work](docs/current-work.md) and [contract handoff](docs/pythia-sprint-9-contract-extraction-handoff.md)
documents, which remain historical records and may contain older Manteion counts.
Their existing local edits must be preserved. A historical recommendation to
submit a release candidate is not current authorization to push, merge, or deploy.

Shared product intent lives in Manteion's
conversation, explainable answers, and files plan (`manteion:docs/product/conversational-consultation-plan.md`).
The other root guides own their respective implementation status:

- Manteion (`manteion:DELIVERY_GUIDE.md`): primary conversational
  consultation UI, identity/sessions, files, downloads, and product acceptance.
- Pythia (`Pythia:DELIVERY_GUIDE.md`): dialogue, grounded answers, providers,
  ingestion and generated-content orchestration.
- pythia-contracts (`pythia-contracts:DELIVERY_GUIDE.md`): versioned public
  exchanges, examples, types, invariants, and compatibility.

These local links reflect the sibling checkout layout. Elsewhere open each named
repository's root `DELIVERY_GUIDE.md`; do not assume unpushed guides are published.

## Current authoring workflow

The [authored-scene workflow](docs/authored-scene-workflow.md) and [illustrated user guide](docs/user-guide.md) describe the current local scene editor, original comparison, project defaults, templates, previews, and output visuals. Older Rendering mode or inactive-layout descriptions in dated handoffs are historical. This authoring/documentation update does not change the shared G3 status or grant release, deployment, provider, or LMS acceptance.

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

**Journey status: G1 and G2 accepted; G3 in progress; G4-G6 not accepted.** Existing authoring,
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
- Manteion's cross-client record (`manteion:docs/api/pythia-compatibility.md`)
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

Manteion's synthetic reference cases (`manteion:docs/product/conversation-reference-cases.md`)
are complemented by Pythia's G1 packet (`Pythia:docs/conversation/g1-reference-packet.md`),
whose file-comparison example includes exact synthetic scene provenance, a
correction, and an explicit no-storyboard-edit boundary. The packet is committed
locally with owner acceptance (`Pythia:docs/conversation/g1-owner-acceptance.md`)
recorded on 2026-10-18 in Pythia `8daf30d`. This accepts the Pythia target packet,
not a complete frozen evaluation corpus or live capability. Chimera's
[authoring handoff review](docs/conversation-authoring-handoff.md) records source
identity, return-access, authorization and advice-versus-edit requirements.
That G1 packet did not qualify a conversation adapter; current narrow synthetic
transport evidence is recorded under G3 below.

### G2 - Clearly Synthetic Consult Prototype

Status: `accepted`. Primary owner: Manteion; Chimera reviews authoring handoff.

Owner explicitly accepted the reviewed G2 packet `9ab9acfc4394faedd09161cfff57b5292b4ce49b`
on 2026-10-18. Manteion acceptance record `65d3209a3775fed25f2114f8049e781e3b05c66f`
and provenance clarification `bc5854ce24afa7cf0af1148a190a58612b1ed379` preserve that
exact target, including committed-LF versus local-CRLF manifest distinctions.
This accepts synthetic interaction/practice only; it grants no live-provider,
G4 usefulness or production qualification.

Chimera completed the [pinned guided-practice core audit](docs/guided-review-practice-package-audit.md)
for Manteion's optional synthetic human-review practice. Exact0.1.1 archive and
installed exports verified; React/storage concerns were sent to the consumer and
addressed in the inspected working tree. Manteion owns final UI/test/commit
qualification. Practice history is never a real review/owner acceptance gate.

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
An independent [source candidate client](backend/app/source_client.py) now sends
exact raw PUT and manifest-only GET with source-specific grants and current
provenance checks. 82 focused tests passed, 6 existing skips. Source HTTP is now also narrowly
`qualified-synthetic` against parent `4ca5ef6a32a4420278980f95b4e32245a6b87fc7`
and candidate `aee473954047fe0b384da8e7934e51cedacee9b6` over real loopback.
Chimera reverified three source blockers fixed and 11 producer source tests passed.
Parent reports final full suite 243 tests passed in 156.622s; not rerun by Chimera.
CSV parsing exists internally in Pythia. An additive
[CSV1.1 public conversation client](docs/conversation-csv-client.md) now has pinned
schema/semantic/authoritative-record guards and stubbed HTTP qualification against
contracts `0fb76c5cf6517db5db6e8aeb0ff217410c189614`: 90 focused tests OK,
6 existing skips. On 2026-10-19 the exact `CsvSourceCandidateClient` passed an
actual synthetic source/table-turn loopback against Pythia: signed upload/replay/
manifest GET, authenticated trusted-record reconstruction, then table submit/read/
replay/cancel. One actual restricted-worker test passed in 12.299s; details are in
[CSV source-client evidence](docs/conversation-csv-source-client.md). This is
scoped transport qualification, not application actor/session integration or G3
exit. Pythia also qualified actual PDF/DOCX worker output and added an opt-in
private signed manifest path; 4 Pythia actual-container route tests pass against
its committed synthetic fixtures. Chimera's document client has now passed the
actual-worker manifest loopback; see
[document client evidence](docs/conversation-document-source-client.md).
That client now validates signed pre-ingestion metadata against contracts 1.2.0
commit `136fa58c83bfee86e953ad98a2cbe7dac98bda05`; this does not add a document
turn or citation operation. Integrated HTTP/session compatibility, required file
formats and overall G3 exit remain pending. See Pythia's
document worker evidence (`Pythia:docs/conversation/g3-parser-worker-evidence.md`)
and CSV HTTP evidence (`Pythia:docs/conversation/g3-csv-http-evidence.md`).

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

The CSV source/table and PDF/DOCX manifest clients are qualified only for their
synthetic HTTP boundaries. Pythia's routes remain unreleased opt-in candidates and
do not enable document turns or citations. Manteion has creator-private session/
message history, quarantined PDF/DOCX bytes and a separate engine-context mirror,
but no signed source association, accepted-operation transition or access
attestation.

Next: reconcile uncertain upload reservations, then qualify the signed
source-grant/manifest association under current actor/policy authorization. Agree
the atomic local-history/engine-context revision transition and wire the
Chimera application actor/session boundary using the
[authoring handoff requirements](docs/conversation-authoring-handoff.md), especially
scope attestation, exact source identity, revision/replay/cancellation and return
access. The client loopbacks do not establish application integration, full G3,
live quality, release or deployment. Do not continue the old candidate-push/release
next step or wait for publication to discuss a local candidate.

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
Manteion guide (`manteion:DELIVERY_GUIDE.md#evidence-required-for-a-status-change`).
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

- 2026-11-04: Follow-up to screenshot-reported bottom reveal-editor clipping:
  bounded the experience dialog to its backdrop using a non-growing flex
  container and explicit full-height internal scrolling. Added last-explanation,
  conclusion and bottom-application-control reachability checks with eight long
  reveals at short desktop and 817x768 viewports. Three focused Chromium
  scenarios passed, including mobile accessibility and existing design/apply.
  Original screenshot environment was not exposed in the shared browser;
  final confirmation there remains an author check. No provider or scene calls
  were made outside isolated test fixtures.

- 2026-11-04: Fixed experience-review modal CSS specificity so the generic
  450px dialog rule cannot override it. The experience dialog now uses available
  viewport width up to 1,440px with 16px gutters and compact mobile padding.
  Focused Chromium whole-scene and mobile-reflow scenarios passed (2 tests),
  including explicit desktop width, mobile overflow and accessibility assertions.
  No provider calls or user-course changes.

- 2026-11-04: Native scene-experience slice is `implemented-local` and
  `qualified-synthetic`, owned by Chimera's local authoring surface and Pythia's
  explicit local MCP producer. Human direction and selected source snapshots
  produce a private learning-intent/rationale/native-composition proposal,
  editable executable preview, explicit production blockers and revision-checked
  application. Native flow/reveals share semantic playback across authoring,
  preview, local-file standalone, SCORM 2004 and SCORM 1.2; print snapshots expand
  explanations. Mobile reflow, keyboard/touch, reduced motion and contrast are
  covered. Original canvas, source content and attached media are preserved,
  with provider-free editing and explicit canvas restoration.
  Baselines: Chimera `9748ec961b5255685ab52c53339232735901b0ff` and configured
  compatibility checkout Pythia `d8b29e223ab2412c93bb06fbc0919469feb4ef01`,
  both dirty before/after this slice; prior work preserved. No contracts,
  Manteion or shared G1-G6 status change is claimed.
  Evidence: `python -m unittest backend.tests.test_experience_treatments
  backend.tests.test_video_treatments backend.tests.test_pythia_talk
  backend.tests.test_scene_timeline backend.tests.test_pythia_actions
  backend.tests.test_video_generation` passed 79 tests; Pythia
  `python -m unittest tests.evals.test_chimera_experience
  tests.evals.test_chimera_video tests.evals.test_chimera_authoring` passed 15.
  Chromium `npx playwright test --config=playwright.onboarding.config.cjs
  --project=chromium scene-experience.spec.cjs video-treatments.spec.cjs`
  passed 9. Final apply-context/restoration adjustments were rechecked with
  all 11 experience backend tests, all 6 experience browser tests and the
  frontend TypeScript/Vite build. Source tests and browser specifications are
  the reproducible evidence; no live provider was used. Existing chunk-size
  and Python deprecation/resource warnings remain.
  Live read-only checks: frontend/backend HTTP 200; installed MCP advertises
  `experience_treatments: true`; Sporting Merit `sporting-merit-244393e6`,
  scene `scene-cf12b7a1`, remains revision 3 without an applied experience or
  generated experience draft. No billable model/render calls or user-course
  mutations occurred. Limits: native linear concept flow, not arbitrary
  rich-media production, assessment/timeline replacement, cross-session reveal
  tracking, real-model creative qualification or release acceptance. Next:
  author-led live reference design with explicitly selected brand evidence,
  human review and separate apply decision. Updated guides:
  `docs/talk-to-pythia.md`, `docs/user-guide.md`, `docs/ai-connection.md` and the
  configured Pythia local-authoring guide; bundled user-guide PDF unchanged.

- 2026-10-24: Enlarged the metallic wings into the upper blank space and moved
  them behind the shoulders and all three heads, preserving the dragon ear and
  original dark anatomy in the foreground. Rebuilt matching marks/icons and
  revised cache keys; export validation now checks rear wing layer order.
  Validation: regeneration and frontend build passed; inspected the full-size
  mark and 128px icon, and confirmed the browser loads the rear-wings revision.
  Foreground checks preserve original dragon-ear pixels and opacity.

- 2026-10-24: Refined the existing metallic logo at owner request, preserving
  the lion/eagle/dragon composition while broadening the lion jaw and adding a
  fuller faceted mane and layered wings. Shared app icons, favicon/PWA and kit
  treatments derive from preserved original art plus an editable SVG overlay.
  Identity-only work; no G1-G6 capability or approval change.
  Validation: `python scripts/refine-brand.py --verify` passed icon dimensions,
  ICO resolutions, transparency, kit parity and manifest hashes;
  `npm run build --prefix frontend` passed (existing chunk-size warning).
  Live sidebar inspection confirmed the revised 128px asset loads at 44px
  display width; frontend and backend both returned HTTP 200.

- 2026-10-18: Audited exact onboarding0.1.1 tarball/core/license for Manteion's
  optional synthetic review practice; archive/installed exports and exact copied
  members verified. Documented storage allowlist and React subscription/lifecycle
  fixes reviewed in the sister working tree. Docs only; Manteion owns UI evidence.

- 2026-10-18: Added separate CSV1.1 public conversation contract/client with fresh
  authoritative extraction/worker/current authoring checks before and after I/O.
  Exact contracts0fb76c5c; 90 focused tests OK6existing skips; CSV HTTP is stubbed.
  Existing1.0 clients/pins unchanged. Next: actual CSV source/turn loopback with
  qualified server-owned worker records; no full G3/live quality claim.

- 2026-10-18: Synchronized actual raw-source+turn loopback at engine `4ca5ef6a`,
  Chimera client `3fbe048d` and contracts `aee47395`. Independently reverified
  framing400/rows0, revoked-grant403/rows0, HEAD-write403/rows0 and 11 source tests
  OK13.077s. Parent final suite reports243passed156.622s; no own full rerun.
  Narrow source transport qualified-synthetic; G3 remains in-progress. Next:
  additive CSV source/projection/citation semantics before implementation.

- 2026-10-18: Recorded Pythia `fec9bcea7b081c061565c9f6ac33db98ceb6d60c` follow-up:
  signed CSV source plus table-turn loopback passed using raw source HTTP and the
  public table client; this does not exercise Chimera's new CSV source client.
  Pythia's PDF/DOCX normalizer passed 7 focused tests against the pinned worker and
  committed synthetic fixtures; Chimera has not qualified a client against the
  document receipt route.
  Chimera's CSV source-client HTTP remains the next consumer check; application
  actor/session integration and G3 exit remain open. Evidence is parent-reported,
  not rerun by Chimera. No contract release, vendor promotion or live provider.

- 2026-10-18: Recorded Pythia's follow-up private PDF/DOCX source candidate:
  its opt-in route passed 4 actual-container HTTP tests for signed ingest, replay,
  manifest-only GET, unreadable input, revoked access and current worker allowlist.
  Evidence is parent-reported, not rerun by Chimera. No Chimera document client,
  application actor/session integration, document turn/citation route, contract
  release, vendor promotion or live provider is qualified. Next consumer action
  remains the exact CSV source-client loopback, followed by a document client
  boundary check against Pythia's current signed manifest candidate.

- 2026-10-19: Exact Chimera CSV source-client and table-turn loopback passed in
  Pythia's harness: one test in 12.299s with the qualified restricted worker.
  Signed source PUT/replay/manifest GET, trusted record reconstruction, row-2-only
  producer input, matching citation, turn lifecycle, revocation, stale-scene and
  no-task checks passed. Evidence is cross-repository and parent-run; Chimera's
  focused stubs were not rerun in this cycle. G3 remains in-progress. Next:
  qualify a Chimera PDF/DOCX manifest client and application/session boundary.

- 2026-10-19: Manteion added metadata-only creator-private conversation sessions,
  with workspace/creator-filtered list/read and transactional active-membership
  recheck on create. Manteion reports 103 unit tests passed plus Prisma/type
  validation; no turns, source attachments or engine attestations are included.
  This is parent-reported and not run by Chimera. Next cross-repo dependency is
  agreed session/message/source revision and authorization semantics before
  application turn or upload wiring.

- 2026-10-19: Manteion now persists a separate zero-initialized
  `engineContextRevision` alongside local history revision. Local message writes
  do not advance it; there is still no accepted-operation transition, source
  association, or Pythia access attestation. The field is not evidence of engine
  state. Next: agree source association and atomic accepted-turn advancement before
  wiring the Chimera application session boundary.

- 2026-10-19: Manteion added reservation-first PDF/DOCX source association. Current
  membership/session is rechecked before quarantine promotion; uncertain storage
  outcomes remain non-readable `uploading` records. Manteion reports 10 focused
  source tests and 122 unit tests passed, plus Prisma/type checks. No parser,
  Pythia grant/manifest or download integration is enabled. Next: reconcile exact
  bytes for uncertain reservations and qualify the signed source grant/manifest.

- 2026-10-19: Chimera's PDF/DOCX source client passed 5 stub/adversarial tests and
  5 actual-worker HTTP tests in Pythia's cross-repository harness. Both formats
  passed signed upload/replay/manifest-read and trusted-record checks; the worker
  ran once per immutable source. See `docs/conversation-document-source-client.md`.
  This remains opt-in synthetic qualification, not application session wiring,
  document turns/citations, G3 exit or release. Next: integrate trusted actor,
  session and source access in the application boundary.

- 2026-10-18: Added exact-byte raw source PUT/manifest GET client against the new
  candidate; shared bounded HTTP behavior with the conversation client. Source
  action-specific grants and current authoring state are checked before/after I/O.
  82 focused tests OK, 6 existing skips; source transport tests use HTTP stubs,
  not producer integration. Next: actual synthetic source endpoint loopback.

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
