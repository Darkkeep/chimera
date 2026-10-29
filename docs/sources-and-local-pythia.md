# Sources and local Pythia

## Add project sources

Select a project, then open **Sources** in the workspace navigation. The dialog
uses the existing reference-resource store, permissions, version history, retained
original bytes and extraction pipeline. Uploading a source does not alter scenes.

- **Documents:** PDF, DOCX, PPTX, TXT and Markdown, up to 25 MB per upload.
- **Pasted text:** named excerpts, notes or instructions retained as UTF-8 text.
- **Web pages and links:** an HTTP(S) URL and optional pasted page text. Chimera
  does not fetch the page. URL-only records contain no grounding passages; the
  source status explains this. Add another source with the page text when ready.
- **Pythia conversations and outputs:** selected text supplied by the author.
  This label records how it was supplied, not verified Pythia provenance. It does
  not access ChatGPT history or invoke the local workspace through `@Pythia`.

Saved sources show their current version, source kind, extraction status and a
bounded passage preview. Original files and full extracted passages remain in the
project. PDF sources can use the existing OCR inspection/acceptance flow when
available. Failed extraction and link-only records are not usable grounding.

Use **Review tools > Review suggestions** to select readable project sources for
a request. Existing course and scene drafting also consume their applicable
readable references. These workflows retain their existing provider capabilities,
size limits and author-review requirements.

## Connect the local Engine

In **Settings > Pythia**, an installation administrator can enter a running local
Engine address and choose **Connect local Pythia**. Health, Engine identity and
capability discovery must pass before the address is saved. This does not submit
a task, make a model request or change provider configuration.

The default is `http://127.0.0.1:8001`, leaving Chimera's backend on port 8000.
The saved preference is installation-local `pythia-connection.json` under the
Chimera workspace, outside project backups. Only HTTP loopback addresses with an
explicit port are accepted by the browser setup. The server-managed
`CHIMERA_PYTHIA_BASE_URL` takes precedence and locks this setting when supplied.
Authentication remains server-managed via `CHIMERA_PYTHIA_API_KEY`; do not enter
credentials in the address or reuse another application's service identity.

When the sibling Pythia checkout has its Python environment prepared:

```powershell
.\scripts\start-local-pythia.ps1
```

The script starts a hidden, loopback-only Engine on port 8001, or verifies an
existing Engine. It leaves occupied ports and other services alone, writes logs
under `%LOCALAPPDATA%\Chimera\logs`, and accepts `-PythiaRoot` and `-Port`.
It inherits server configuration; it does not configure model credentials.

**Connection availability is not proof of model-backed authoring.** The current
Engine registry supplies deterministic implementations of storyboard analysis,
transformation, enhancement, assessment design and course review. Its configured
analysis model supports `analysis.need`, a separate capability. Chimera's existing
authoring operations do not automatically become model-backed by connecting.
The authenticated Manteion conversation demo on port 8010 has its own identity
and access callback; this work does not grant Chimera access to it.

## Verification and current boundary

Focused backend checks cover retained bytes, source-kind and URL persistence,
no network fetching for links, malformed inputs, local endpoint validation,
environment precedence, origin rejection and verification before saving.
Chromium, Firefox and WebKit checks exercise all four intake types through the actual isolated
backend, reload, narrow-screen overflow, automated dialog accessibility, and a
mocked connection-settings interaction. A separate real HTTP round trip to the
local Engine uses fictional scene content and deterministic output, with temporary
Chimera project storage. It is not a real model or owner-acceptance test.

Restart a previously running Chimera backend to load these new routes and the new
default endpoint; the Vite development frontend updates automatically. Existing
source files, projects and unrelated worktree edits are preserved. Direct live
conversation invocation is now available through the separate [Talk to Pythia](talk-to-pythia.md)
local MCP connection. That connection uses the installed plugin's live producer;
it does not change the Engine's deterministic authoring task implementations.

The production frontend build passed. The selected backend suites passed 125
tests, including one real local HTTP round trip; six additional opt-in integration
cases were skipped. Seven browser cases passed across the three engines, including
the existing Chromium settings check. A Firefox test locator was corrected to
identify the saved-connection message while the separate refresh status was visible.
The full repository suite was not run.

The Sources dialog adapts 12ui candidate B's four source rows and uses its supplied
icon assets. Its final alignment capture was reviewed against the original
LayerDoc. The tool reported low overlap because its candidate is a full-page
composition and the implementation uses Chimera's existing dialog. Generated
global background, planet decoration, replacement branding, unrelated navigation
icons and shell-wide token changes were excluded to preserve the existing product
interface. This is a functional adaptation, not a claim of full-page pixel parity.
