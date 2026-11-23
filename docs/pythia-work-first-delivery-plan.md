# Pythia: start with your work

Plan initiated November 19, 2026 against Chimera Beta `f12ed11`.
Founder direction: `Chimera_Pythia_Entry_First_Pass.zip`, followed by authorization
to develop the plan and begin local implementation. This is not release acceptance.
The original ZIP is preserved locally at
`workspace/intake-originals/Chimera_Pythia_Entry_First_Pass.zip`; extracted review
materials and qualification evidence remain under the ignored workspace directory.

## Intended experience

Bring scattered documents, an existing brief, a presentation, or an almost finished
experience. Supply one prompt describing the desired outcome. Pythia carries forward
existing decisions, checks alignment and asks only material questions. The author can
inspect evidence, proposed changes and actual execution, then selectively accept work
through Chimera's existing revision-controlled authoring model.

This implements the charter's familiar authoring, mixed-source projects and optional
Pythia intelligence. It preserves the classic application, native scene model, asset
provenance, permission checks and human approval. No charter amendment is proposed.

## Phase 1: direct entry (started)

Review and integrate the supplied patch locally. Default to Conversation; provide a
file drop/browse area and one visible prompt. Keep Design brief and Files reachable
as secondary views, with source selection, author direction, diagnostics and reset
available on demand. Preserve prompts and selected readable sources after failures;
never silently skip unreadable attachments or retry a model request automatically.

Retain the existing explicit brief agreement before content drafting. An already
designed project can record its existing decisions there; no mandatory ADDIE interview
is introduced. Simplifying the production approval control further requires a separate
review of the existing backend contract, not silently deleting that safeguard.

Exit: frontend build, focused backend checks, real application browser regression,
attachment/failure recovery, keyboard/accessibility and narrow-screen checks. Founder
reviews the actual local entry experience separately.

## Phase 2: connect conversation to existing capabilities

Trace the consultation adapter, Engine tasks, specialist orchestration, capability
discovery, source grants and artifact contracts before changing interfaces. Reuse the
storyboard enhancement implementation and its execution/job receipts; do not create
a second orchestration engine or route by fragile prompt keywords.

Define a server-owned conversation execution request that binds actor, project,
conversation, selected source versions, project revision, requested outcome and explicit
permissions. Read-only capability discovery must distinguish configured, permitted and
actually available operations without making paid calls. Cross-workspace context stays
unavailable unless explicitly authorized through existing grants.

Preview the planned scope and request budget before execution. Public web research
needs explicit opt-in; uploaded text and references to research do not authorize it.
Retain request IDs, bounded execution, cancellation/interruption states, permission
rechecks and explicit recovery. No automatic paid retry.

Exit: mocked contract tests for unavailable capabilities, authorization denial,
source/revision changes, replay, reset, interruption and preserved completed receipts.
Confirm upstream Pythia support before claiming an end-to-end connection.

Starting implementation map: `frontend/src/PythiaTalkPanel.tsx` owns conversation
entry; `backend/app/pythia_talk.py` owns selected-context composition and consultation
transport; `backend/app/enhancement_jobs.py` checks orchestration capability and
validates actual executions, source evidence and required-search ordering;
`backend/app/storage.py` restricts authoring orchestration to the local single-user
connection. `backend/app/pythia_hosted.py` currently advertises orchestration and web
research as unavailable. Preserve that hosted boundary while connecting local paths.

## Phase 3: evidence and reviewed production

Make actual execution status, completed and failed tool receipts, cited sources and
limitations inspectable from the conversation. Keep source evidence distinct from
provider summaries and never describe an unexecuted plan as completed work.

Bridge supported results into existing content drafts and structured storyboard
proposals. Show literal changes, affected scenes, provenance and revision binding.
Upload, consultation and generation do not mutate canonical scenes. Explicit acceptance
uses normal authoring/history paths; discard preserves content, and stale proposals
require regeneration. Keep media generation and publication independently authorized.

Exit: tested proposal review/apply/discard, preservation of unrelated content and
media, stale revision denial, replay and failure recovery. No parallel course model.

## Phase 4: qualify the complete journey

Use disposable copies and these cases:

1. Sporting Merit: existing presentation and decisions, focused enhancement, authorized
   research/specialists, evidence review, proposed changes, selective application,
   manual editing, preview, save and reopen.
2. Scattered documents: source coverage, contradictions and missing information;
   ask focused questions and preserve source identity through draft review.
3. Almost finished project: bounded changes with established decisions and unrelated
   scenes/media preserved.

Also retain the charter task: create a scene, edit text, insert an image, add a ready-made
activity, preview, save and reopen. Run the existing relevant Studio/classic regression,
cross-browser and accessibility checks. Record PASS/FAIL/NOT TESTED with exact revision,
environment and evidence. Fixture success is not live qualification or founder acceptance.

Live provider calls, paid generation and production use of private materials require
explicit authorization. Existing DELIVERY_GUIDE, Beta qualification and G3 gates remain.
Merging, migrations, deployment and publication need their existing explicit approvals.

## Current local slice

The original ZIP remains intact. Its patch was checked and applied to the matching base.
Review additionally found and corrected a nullable conversation access during initial
render. Conversation/planning browser selectors now follow the new entry and secondary
views; planning project titles are browser-specific to avoid collisions in the shared
disposable test workspace.

Verified locally November 19:

- PASS: production frontend type-check/build, with the existing large-bundle warning.
- PASS: 32 focused backend tests using `python -m unittest backend.tests.test_pythia_talk -q`.
- PASS: five deterministic conversation cases in each of Chromium, Firefox and WebKit
  (15 passes), including 390/1100/1440 pixel attachment recovery and automated axe scans.
- PASS: three deterministic project-planning cases in each browser (nine passes).
  Chromium passed in the combined run; Firefox/WebKit passed on the corrected planning
  rerun. The earlier combined run exposed project-title collisions, not duplicate
  project creation by one author action. Evidence: `workspace/pythia-entry-test-results`
  and `workspace/pythia-entry-planning-results`.
- PASS: `git diff --check`; frontend HTTP 200 and backend/direct-proxy health checks.
- NOT TESTED: the two opt-in live-provider scenarios per browser, specialist integration,
  Sporting Merit production journey, full regression suite and founder usefulness review.

The local backend was restarted using the canonical launcher and existing local workspace.
The frontend remains on port 5175. No paid calls, merge, deployment or author-project edits
were performed. Changes were uncommitted at that initial checkpoint; see cleanup below. Automated test data is
disposable; successful checks do not establish founder acceptance or close delivery gates.

## Local connection recovery, November 19

The configured plugin actually launches `C:/inetpub/Pythia-chimera-sync`, not the
default sibling's service implementation. Its old authoring request rejected
`designBrief` (sent by every current Chimera draft) and `outlineTopics`. The local
adapter now accepts both, includes them in provider input and guidance, and removes
the historical five-scene result cap. The provider timeout now matches the documented
600-second request allowance, below the bridge's timeout. These local companion changes
were subsequently committed as `5c5aa2a`; no merge or deployment occurred.

Fixed-category provider failures now pass through MCP and Chimera without exposing
exception text, credentials, source text or provider bodies. Unknown failures remain
redacted. This cannot reconstruct the original follow-up error; no claim is made that
the original consultation failure was caused by the authoring-contract mismatch.

Verification: 55 Chimera consultation/bridge/action tests and eight companion adapter
tests pass. A real read-only MCP discovery through the installed configuration confirms
consultation and authoring tools. No model request or automatic retry was made. The
previous failed turn/draft remains intact; a fresh explicit attempt is required for live
qualification. Canonical local backend restarted and remains on port 8002.

## Draft-to-slides handoff

Founder feedback identified the acceptance action as buried beneath draft content.
Ready drafts now have a visible review shortcut above the conversation, including on
reopen. Review focuses the saved proposal. Its first action is **Use this draft as my
slides** (or **Use these changes** for a scene update), with slide count and an explanation
that content becomes editable. Pending drafting/brief controls yield to the ready draft.
After successful application, **Open my slides** returns from the standalone conversation
to the authoring workspace. Embedded planning retains **Open storyboard**.

The operation still uses the existing apply endpoint, expected revision and permissions;
no author content was accepted on the founder's behalf. Backend behavior is unchanged.
The six focused handoff cases passed across Chromium, Firefox and WebKit, covering saved
draft discovery, keyboard focus, application into a disposable project, preservation of
existing scenes, stale rejection, automated axe scans and desktop/mobile overflow.
Screenshots are in `workspace/pythia-handoff-review-results`; desktop capture inspected.
The broader Chromium regression is recorded in `workspace/pythia-handoff-test-results`.
Tests use mocked Pythia drafts and disposable local API projects; live content quality,
founder usability acceptance and full-suite qualification remain separate.

## Founder observation and cleanup

After using the new acceptance control in the external browser, the founder reported
"it fell right in." This records successful use of the draft-to-slides handoff in that
session. It is not broader course-quality, release, accessibility or deployment acceptance.

The subsequent cleanup removes duplicate capacity alerts, replaces stale references to
the old Apply changes label and removes the incorrect local-only model badge. The
opt-in live authoring test now follows the new labels and secondary views, but remains
untested without a new explicitly authorized paid run. Original intake material was
archived with an integrity check; logs, captures and disposable workspaces were retained
as evidence. No project content or conversation history was removed.

Cleanup verification against the local implementation committed as backend `2bbb24f`
and interface `bff5637`, with companion Pythia `5c5aa2a`:

- PASS: frontend TypeScript/Vite production build; existing bundle-size warning retained.
- PASS: 57 Chimera consultation, bridge, action and origin tests; eight companion tests.
- PASS: 30 deterministic planning/conversation browser cases across Chromium, Firefox
  and WebKit; nine paid-provider scenarios intentionally skipped. Evidence is in
  `workspace/cleanup-pythia-results`.
- PASS: five Chromium Studio/native-authoring, reversible classic navigation, desktop/
  mobile menu and dialog-selection checks. Evidence is in `workspace/cleanup-studio-results`.
- PASS: whitespace checks in both repositories, local frontend HTTP 200 and proxied
  backend health. Both existing local services remain running.

No push, merge, migration, deployment or paid request was made during cleanup. The
full repository suite and hosted qualification were not run. Specialist integration
remains future work; the background/import-font wishes are recorded in current-work.
