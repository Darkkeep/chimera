# Consult Pythia directly

Repository context: **Chimera 1.2.0** | [MIT license](../LICENSE) | [Release notes](release-1.2.0.md). Dated evidence and independently versioned assets/contracts retain their original scope.

Open a project and select **Consult Pythia** in the workspace navigation. This
calls the local Pythia plugin's actual `pythia_consult` tool over MCP stdio, using
Pythia's own Python environment and live `TextConversationProducer`. It is the
adapter supplied by Pythia. A ChatGPT folder mention provides project context;
it does not configure this adapter. This feature does not use Chimera's
deterministic Engine authoring tasks, and there is no scripted-answer fallback.

## Native scene experiences

Select a storyboard scene and choose **Design experience**. This local-Pythia
workflow is independent of the Engine status dropdown. It proposes a whole
native learning scene, not a video storyboard: a responsive concept-flow
diagram, meaningful click-reveal explanations, a conclusion, author-selected
colors, and optional replayable motion. This first assembly slice supports
content scenes without existing timeline or assessment components; it refuses
to overwrite those components.

The native schema also supports branching decisions, hotspots over a project
image or a labelled schematic, sequencing and guided practice. Image-backed
hotspots use the source image's aspect ratio and percentage coordinates; the
separate explanation list keeps the author-defined reading order, and the
project image remains credited and retained in portable delivery. These are
formative activities with feedback, not graded assessments. It also supports a
bounded scripted learner roleplay: authored follow-up messages, no live AI,
network service, saved transcript, or evaluation. Pythia receives their schema
and capability constraints with each explicit design request.
All proposed content remains subject to validation and author review. You can instead start and save an
experience without a model call using **Start native experience without
Pythia**. See [native activity authoring](user-guide.md#author-native-activities-without-a-provider)
for controls, route validation, accessible alternatives and progress behavior.

1. Inspect **Context shared only when you request a design**. The scene's
   content, layout, current native experience, narration text and notes are
   supplied as context. Narration text does not authorize audio production.
   Include the agreed design brief only if appropriate.
2. Explicitly select up to five source documents and choose **Load selected
   context**. Inspect their versioned passages. No source document is sent
   merely because it exists in the project; no text is silently truncated.
3. Give Pythia your learning and production direction, including the governing
   brand direction when sources disagree. For the Sporting Merit reference,
   the author's choice is the main DARKROGUE plum/violet/pink identity, not a
   different section's palette. This is author direction, not a global theme.
4. Choose **Ask Pythia for a scene experience**. This is the only initial
   model call and may incur normal provider charges. Subsequent
   **Refine experience with Pythia** calls include your current edits.
   Nothing creates assets, changes scenes, renders video, or publishes.
5. Review the learning intent, assumptions, flow, explanations, colors and
   outstanding production work. Edit the literal content directly. Inspect
   **Actual learner experience preview**: it is the real native playback,
   not a mock picture. **Save treatment privately** persists edits without
   changing the scene.
6. Required production dependencies block application. Resolve them or make an
   explicit author decision to defer them; optional needs remain documented.
   A music filename is not evidence of licensing. This slice does not execute
   media generation, music licensing, scored assessment design, or Shotstack
   production.
7. Check the review acknowledgement, then choose **Apply reviewed experience
   to scene**. Application is revision-checked and source/brief drift requires
   a refreshed design. The existing canvas and source text are retained, but
   the native experience becomes the learner-facing stage. Existing media
   attachments and revision history are preserved.
8. Reopen to review the saved proposal. **Edit applied scene without Pythia**
   allows provider-free native edits and explicit saving. **Restore underlying
   canvas** requires a separate confirmation and removes only the native
   experience.

Keyboard and touch activation use native disclosure controls. **Show all
explanations** provides a non-exploratory reading alternative. Text reflows
on mobile instead of shrinking a fixed canvas; optional motion respects
reduced-motion preferences and never gates reading.
The experience review dialog uses available desktop width (up to 1,440px)
and retains viewport gutters and compact padding on mobile.
Its height is bounded by the backdrop, with one scrollable dialog surface
so the final reveal fields, preview and application controls remain reachable.
Text colors require 4.5:1 contrast, diagram accents 3:1. Body fonts use local system fonts.
Chimera preview, standalone (including local-file playback), SCORM 2004 and
SCORM 1.2 share this renderer. Printing and authored document snapshots expand
all explanations. Reveal state is not a scored assessment or a promise of
cross-session progress tracking.

Private proposals retain source hashes/versions, author direction, agreed-brief
snapshot and source revision. Drafts remain local to the actor/project/scene;
the applied native experience travels with the project and exported course.
Failed refinements preserve the previous proposal; retries are always explicit.
No live-provider creative-quality qualification is implied by automated tests.

## Use

1. **Check connection** initializes the local tool server and checks its
   advertised capabilities, without submitting a model consultation.
2. Enter a question and choose **Send to Pythia**. Follow up with a correction
   or another question in the same dialog.
3. Optionally select **Include current scene text** and specific source text.
   These are off by default. A selected scene shares its course title, scene
   title, screen text, narration and notes. Selected sources share their current
   extracted passages and titles, not original files or media.
4. Close and reopen the dialog, or reload Chimera, to recover this project's
   saved conversation. A response can finish while the dialog is closed.
5. **Author direction** holds the author's constraints and preferences. It is
   included in the next question or draft request and saved when that request is
   submitted. Each message and content draft retains its own direction snapshot.
6. Consultation is the default, even when Pythia replies with a numbered outline.
   Discuss sources, audience, purpose, outcomes, constraints, approaches, and
   unresolved questions at your own pace. Pythia receives the current process
   stage and is asked to distinguish evidence, assumptions, suggestions, and
   author decisions, not run a fixed questionnaire or jump to scenes.
7. When ready, choose **Review our design brief**. Write or edit your brief.
   **Use latest reply as a starting point** copies that reply only when you
   choose it; it does not accept Pythia's suggestions automatically. The brief
   is limited to 8,000 characters. Choose **Agree brief and explore scene design**
   to save your decision without a model call or scene creation. Ask Pythia to
   explore sequence, pacing, boundaries, and source coverage before production.
   **Return to consultation** preserves the brief and history while closing new
   draft controls. There is no required number of exchanges or mandatory form
   fields beyond a nonempty author-reviewed brief.
8. Only after that explicit decision, **Prepare a content draft from this advice**
   selects a completed answer. Choose
   **Update selected scene** or **Add new content scenes**, provide author
   direction, and choose **Generate content draft**. Chimera shows literal
   before/after values or new scenes, rationale, target, and source revision.
   The agreed brief is sent with the draft and retained on its private record.
   The backend also enforces this author-controlled transition.
9. **Apply changes** commits the reviewed content through Chimera's normal
   scene authoring and revision history. **Discard draft** preserves the current
   storyboard. A newer storyboard revision requires a fresh draft.
10. **New conversation** asks before clearing this account's saved conversation
   and drafts for the current project. It preserves applied scenes and sources.

Messages, selected text and successful prior exchanges are sent to the model
provider already configured for Pythia. Normal provider API charges apply.
Previously shared text remains in successful follow-up context until a new
conversation is started. Text is supplied evidence, without independent source
verification or qualified source citations. Conversational advice does not apply
storyboard edits automatically. Content drafts are applied only by the author's
explicit **Apply changes** decision; they grant no release approval. The tools
do not browse or create files. The conversation does not access
ChatGPT history or Manteion's private conversations.

Existing conversations without an explicitly saved brief open in consultation;
completed replies and existing draft decisions are retained. The consultation
stage and brief are private to the account/project conversation, survive reload,
and reset with **New conversation**. Returning to consultation does not discard
previous drafts or reverse applied content.

## Local configuration

The backend finds a sibling `Pythia` checkout by default. Set
`CHIMERA_PYTHIA_ROOT` in the Chimera backend environment for another checkout.
Alternatively, an installation-local `workspace/pythia-runtime.json` can contain
`{"root": "C:/path/to/Pythia"}`. The environment setting takes precedence.
Required files are:

- `.venv/Scripts/python.exe` with Pythia's existing MCP/runtime dependencies;
- `scripts/pythia_chatgpt.py`.

Without a local plugin configuration, the adapter uses the OpenAI connection
already saved under **Settings > AI connection**, including its model and OS
credential-store key. The key passes through a private process pipe and the
adapter's process environment; no credential file is created. Consultation and
draft generation consume the saved connection's daily/concurrent request budget;
capability discovery makes no model call and consumes no generation allowance.

An existing `plugins/pythia/mcp.json` takes precedence. This is the same
operator-managed configuration the installed `@Pythia` ChatGPT plugin uses, so
Chimera works directly with that plugin's adapter. It must supply the plugin
checkout's own virtual-environment Python command, its `scripts/pythia_chatgpt.py`
adapter and the explicit `--provider-file` argument. The plugin's optional
loopback `--media-url` and absolute `--media-output-dir` arguments are also
accepted, and the plugin's checkout may differ from the configured consultation
checkout. Both the text-only (`private-local-text`) and media-enabled
(`private-local-media`) plugin modes are supported. That path continues to use
Pythia's own operator-managed provider configuration.

For content drafting the adapter also exposes `pythia_draft_changes`, backed by
Pythia's live `ChimeraDraftProducer`. Its strictly validated result supports only
title, screen text, narration, production direction and author-note edits on one
selected scene, or new native content/title/summary scenes matching the agreed outline. Chimera independently
validates the returned mode, field/value types, target and current revision before
an author can apply it. Existing assessments, media, layout settings and other
scenes are preserved by the normal scene update path.

The browser cannot supply executable paths, commands, provider settings or keys.
Chimera never reads or copies a plugin's provider credential file; Pythia's adapter
reads that configuration when supplied. The bridge runs with Pythia's Python
environment so its newer MCP dependencies do not replace Chimera's FastAPI stack.
It creates no network listener and reuses no Manteion Engine service identity.
`CHIMERA_PYTHIA_BASE_URL` and **Settings > Pythia** still configure the separate
Engine task API; they do not configure this stdio consultation.

This connection is restricted to a single-user local Chimera installation and
the OS user's process boundary. Shared/hosted installations are rejected. A
different deployment requires its own authenticated service design.

## State and failure behavior

Private conversation files live in `workspace/private-pythia`, scoped by a hash
of installation, actor and project. They are excluded from project archives and
other actors' conversation endpoints. They persist locally until **New
conversation** clears them; project archival or trash does not include or delete
this separate history. They contain supplied text, so normal workstation access
controls and backups still apply.

Only successfully saved exchanges become follow-up context. Failed, interrupted
and uncertain turns stay visible with an explicit retry action and do not become
context. There is no automatic resubmission or model retry. Replaying the same
request ID and payload does not create another provider call. A restart marks
unfinished turns interrupted rather than pretending completion. A stale browser
session ID is rejected after a conversation is reset in another tab.

Chimera checks current project permissions before and after consultation. If a
selected scene revision or source version changes during the call, the returned
advice is withheld and the user must ask again with current text. Scene edits
remain under Chimera's existing authoring/review flow.

Allowances: 8,000,000 characters per message plus selected context and across
consultation history; 64,000,000 serialized characters for authoring drafts;
32 preceding history messages, 32 recorded consultation attempts, and 20 draft
attempts per conversation. Identical selected-source context appears once per
request, with later copies referencing the retained text. Unique source text is
never silently dropped. The selected model's token window is checked separately,
including prompt/schema text and room for the response. The configured GPT-4.1
mini model has a 1,047,576-token window; input that cannot fit is rejected with an
explicit token-limit message before a provider request.

Source files can be up to 100 MB each. Long extracted paragraphs are retained
as consecutive passages rather than cut off at 50,000 characters. Scanned PDFs
still require OCR before their text is available. Books larger than the model's
window must be split across consultations; these changes do not add retrieval
or an unlimited-context model.

The private bridge accepts up to 128 MiB of serialized input. Model calls time
out after 600 seconds and the bridge after 660 seconds; it terminates its own
process tree. Cancellation cannot guarantee that a provider request already
accepted stops or avoids charges.

## Verification

Focused tests cover completed-only history, follow-ups, actor isolation, retained
history, unchanged scenes, selected-only text, request replay, stale scene
rejection, origin enforcement, shared-deployment denial, restart interruption and
context limits. Browser qualification uses fictional data in an isolated Chimera
workspace; a real-provider browser test is explicitly opt-in:

```powershell
$env:CHIMERA_TEST_PYTHON = "$PWD\backend\.venv\Scripts\python.exe"
$env:CHIMERA_PYTHIA_LIVE_BROWSER = '1'
npx playwright test --config playwright.onboarding.config.cjs pythia-talk.spec.cjs --project chromium
```

This test makes two real consultations through the browser, checks correction,
reload recovery, producer identity, unchanged storyboard revision, automated
dialog accessibility and narrow-screen overflow. It keeps the production origin
allowlist intact while mapping its isolated test origin to the allowed local
origin. Passing checks do not grant owner usefulness acceptance, G3 completion,
approval authority or deployment authorization.

The interface adapts 12ui candidate A's existing-dialog composition and uses its
Pythia and user avatars. It keeps Chimera's established shell, source intake,
theme preferences and navigation; generated changes to global branding,
background illustrations and unrelated controls are outside this feature.

The final alignment capture was checked against that unchanged LayerDoc. Its
24% anchor overlap reflects the full-page reference shell and illustrative
conversation versus the existing app shell and real, variable-length messages.
The original user/Pythia avatars were carried into the dialog; the duplicate
small orb, generated workspace/source-card imagery, replacement logo and global
shell changes were excluded to preserve the established product. No full-page
pixel-parity claim is made.

Initial conversation verification: production frontend build passed; the selected
backend suites passed 61 tests with six opt-in Engine cases skipped. The eight
new conversation tests are included in that count. Chromium passed a controlled
failure/draft-preservation case and a real two-consultation browser case: initial
advice, a correction about ambiguous approval labels, revised advice, and exact
response recovery after reload. Both real answers reported
`live-chatgpt-text-v1`; the storyboard revision stayed unchanged. Automated
dialog accessibility and mobile overflow checks passed. The running app on port
5173 was separately checked through its normal production origin, with real MCP
tool discovery and no user project text sent to the provider. The full repository
suite, other-browser live conversations and owner usefulness acceptance remain
outside these checks.

## Authoring action verification

The author-direction/action extension passed 70 selected Chimera backend tests
(76 run, six opt-in Engine cases skipped) and six Pythia adapter/producer tests.
Checks include strict action scope and value validation, no writes during draft
generation, authored visual-text synchronization on apply, preservation of
unrequested fields, append-only scene creation, discard, stale revision denial,
idempotent generation/application, and rollback of content/history when recording
the decision fails.

A Chromium test made three real provider calls with fictional content: a
directed consultation, a scene-update draft and an additional-scene draft. The
drafts changed nothing until **Apply changes** was clicked. The resulting scene
used the exact directed title and paragraph while preserving narration; the new
scene was appended while the existing scene stayed unchanged. Both drafts
reported `live-chimera-authoring-v1`. Reload preserved the direction and applied
decision receipts. Automated accessibility and mobile overflow checks passed.
The failure/draft-preservation browser regression also passed. The running local
backend was restarted with its original environment, and real MCP capability
discovery advertised consultation and content drafting.

The updated UI adapts 12ui action candidate C's before/after review within the
existing dialog and uses the established avatars. Its fictional-data screenshots
were reviewed against the unchanged LayerDoc in an image-based alignment kit.
Global branding, extra decorative/duplicate icons, the generated side panel and
unrelated shell changes were excluded to preserve the app's existing structure.
The kit has no DOM anchor comparison; full-page pixel parity is not claimed.

Action proposals and decisions stay in the account/project's private conversation
file, outside project archives; applied scene content and normal storyboard
revision history remain part of the project. A reset clears pending proposals
and conversation records, not applied content. Source changes during consultation
or after draft generation prevent applying stale material. The author remains
responsible for inspecting content and layout after application. No full-suite,
hosted deployment, broader action capability or release acceptance is implied.

## Outline-driven first drafts

Course planning and empty-project first drafts treat top-level outline items
as coverage topics, not fixed scene boundaries. Numbered lists and Markdown
headings identify those topics. Pythia may split a topic or source slide into
several learner-sized scenes for explanation, examples, practice, and reflection,
using learner-facing titles rather than copying planning headings. Review the
content coverage and pacing: structural validation cannot prove instructional
quality or that every substantive detail was retained.

The old five-scene and one-scene-per-heading starter directions are replaced
when restoring those exact defaults; custom author direction is preserved.
There is no fixed total scene-count cap on this path.

Chimera requests one topic at a time with the full advice and successful
conversation context, accounting for each model request against the saved daily
allowance. This can require more provider calls than the previous four-heading
batches. Every topic must return a valid nonempty scene sequence before the
complete draft is offered for review. A failed batch does not publish a partial
draft or change the project. Apply changes appends the complete sequence
atomically. Existing scenes are not split or replaced by this add-scenes action;
use **Transform with Pythia** for a reviewed replacement sequence.

This path requires the local Pythia adapter's `outlineTopics` authoring support.
Older adapters reject the new field rather than silently reverting to one scene
per heading.
