# Talk to Pythia directly

Open a project and select **Talk to Pythia** in the workspace navigation. This
calls the local Pythia plugin's actual `pythia_consult` tool over MCP stdio, using
Pythia's own Python environment and live `TextConversationProducer`. It is the
same adapter used by the installed `@Pythia` plugin. It does not use Chimera's
deterministic Engine authoring tasks, and there is no scripted-answer fallback.

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
6. **Draft changes from this advice** selects a completed answer. Choose
   **Update selected scene** or **Add new content scenes**, provide author
   direction, and choose **Generate content draft**. Chimera shows literal
   before/after values or new scenes, rationale, target, and source revision.
7. **Apply changes** commits the reviewed content through Chimera's normal
   scene authoring and revision history. **Discard draft** preserves the current
   storyboard. A newer storyboard revision requires a fresh draft.
8. **New conversation** asks before clearing this account's saved conversation
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

## Local configuration

The backend finds a sibling `Pythia` checkout by default. Set
`CHIMERA_PYTHIA_ROOT` in the Chimera backend environment for another checkout.
Required files are:

- `.venv/Scripts/python.exe` with Pythia's existing MCP/runtime dependencies;
- `scripts/pythia_chatgpt.py`;
- `plugins/pythia/mcp.json`, with its supported local Python command, adapter
  and explicit `--provider-file` argument.

For content drafting the adapter also exposes `pythia_draft_changes`, backed by
Pythia's live `ChimeraDraftProducer`. Its strictly validated result supports only
title, screen text, narration, production direction and author-note edits on one
selected scene, or 1-5 new native content/title/summary scenes. Chimera independently
validates the returned mode, field/value types, target and current revision before
an author can apply it. Existing assessments, media, layout settings and other
scenes are preserved by the normal scene update path.

The browser cannot supply executable paths, commands, provider settings or keys.
Chimera never reads or copies the provider credential file; Pythia's adapter reads
its existing operator-owned configuration. The bridge runs with Pythia's Python
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

Allowances: 8,000 characters per authored message, 16,000 per question including
selected context, 24,000 combined question/history characters, 32 preceding
history messages, 32 recorded attempts per conversation, and two simultaneous
consultations per Chimera process. Larger context is rejected without silent
truncation. The bridge times out after 85 seconds and terminates its own process
tree; this cannot guarantee cancellation of a request already accepted by the
external model provider or avoid its charges.

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
