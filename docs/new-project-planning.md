# Sources and Pythia planning in New Project

The **New Project** modal now supports source intake independently of the
separate AI connection setting. Name the course, attach documents, and optionally
expand **Add pasted text, web links, or Pythia excerpts**. Text and excerpts are
queued with **Queue source**; documents are queued by the file picker. A web link
can include pasted page text. A URL by itself is a bookmark, not usable grounding.

Queued items stay in the browser until a project is created; they are not uploaded
or sent to a model just by selecting them. **Create project** retains the existing
blank-project/direct-drafting behavior. **Create & plan with Pythia** saves the
project and its queued sources, keeps the same modal open, and places the starting
**Course prompt** in Pythia's composer. It does not automatically send the prompt.

## Plan before drafting

The saved project setup contains **Plan with Pythia** and **Sources** sections.
Keyboard users can move between the tabs with arrow keys, Home and End. Both
sections remain mounted, with one outer dialog/focus trap. Switching sections
preserves the conversation, author direction and an unsent follow-up. New or
reprocessed sources refresh the Pythia source choices without resetting the chat.

In **Plan with Pythia**, select readable source text and choose **Send to Pythia**.
Source sharing is explicit and initially unselected. Ask follow-ups and use
**Author direction** to refine the audience, goals and constraints. The usual
local Pythia consultation tool, account/project scope, successful-only history,
limits and provider charges apply. Nothing in the planning conversation creates
scenes automatically.

When ready, choose **Draft rough scenes from this advice** on a completed answer.
The controls default to adding new content scenes, with a starting direction that
the author can edit. **Generate content draft** returns up to five proposed
native content/title/summary scenes for review. **Apply changes** adds them;
**Discard draft** leaves the storyboard untouched. Existing revision checks,
author permissions and audit/history behavior remain in force. More batches can
be requested within the conversation allowances.

**Open storyboard** finishes setup. The project, saved sources, sent conversation
and server-recorded drafts remain available after closing or reloading; resume
from **Talk to Pythia**. Unsent text is preserved across setup tabs, but is not
promised across closing the modal or reloading the page.

The existing prompt-to-scenes workflow remains available when its AI connection
is configured. The first-scene onboarding handoff still opens one scene dialog
rather than being intercepted by project planning.

## Upload recovery

If an attachment fails, the modal stays open on **Sources**, identifies the
unattached items and offers **Retry queued sources**. Retries target the already
saved project and do not resend known-successful uploads. Failed items can also
be removed from the queue. Closing setup clears browser-only queued files, so
retry them first or attach the original files later from Sources. The original
files on disk are unaffected.

## Local verification

The new browser cases cover all four source kinds without AI configuration,
URL-only grounding exclusion, later source refresh, unsent draft preservation,
keyboard tab navigation, single-dialog structure, accessibility and mobile
overflow. A controlled attachment failure/retry verifies one saved project and
no duplicate known-successful source.

An opt-in Chromium case makes three real provider calls with fictional material:
two source-grounded planning messages and one rough-scene draft. It verifies zero
scenes before author application, the two requested scenes after application,
live producer identities, and conversation/decision recovery after reload.
Existing source intake, project creation, direct course drafting, dashboard and
first-scene onboarding regressions were also checked. This is local browser
evidence, not owner acceptance, hosted deployment or a full repository-suite run.

The interface adapts 12ui New Project candidate A to the established modal. It
uses its document emblem and the existing source/Pythia assets, while preserving
the current shell and controls. The reference's global branding/background,
duplicate decorative icons and illustrative summaries are excluded; source
statuses and conversation content come from actual project records. Rendered
fictional-data screenshots are compared against the unchanged LayerDoc, without
a claim of whole-page pixel parity.
