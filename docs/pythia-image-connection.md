# Media and scene drafts from Pythia in Chimera

Repository context: **Chimera 1.2.0** | [MIT license](../LICENSE) | [Release notes](release-1.2.0.md). Dated evidence and independently versioned assets/contracts retain their original scope.

Chimera's existing **Media library → Create a media candidate** can send image
requests to Pythia. Pythia uses its existing image generator and retains the
provider receipt; Chimera retains the returned image as a candidate. Approve the
asset and attach it to the selected scene, or apply the existing placement proposal.
Reload and standalone export use normal Chimera storage and rendering.

The local installation selects this route in `workspace/pythia-connection.json`:

```json
{"baseUrl":"http://127.0.0.1:8002","imageProvider":"pythia"}
```

The existing Pythia address setting continues to control the connection. The normal
VS Code backend task honors that saved setting. An explicit server environment
override still takes precedence. `CHIMERA_IMAGE_PROVIDER=pythia` may also select the
route for a process. With media enabled, the existing scene editor prompt also uses
Pythia, and the narration selector offers Pythia. Other saved narration connections
keep their existing routes. An unavailable Pythia does not silently fall back to a
direct provider for these requests.

For this local feature checkout, start the service from the Chimera repository:

```powershell
.\scripts\start-local-pythia.ps1 -PythiaRoot ..\Pythia-chimera-sync -Port 8002 -EnableMedia -ImageProjectId 'proj_YOUR_APPROVED_PROJECT'
```

This uses the existing encrypted per-user credential file by default, or an existing
`PYTHIA_MEX_API_KEY`. `-ImageCredentialFile` accepts a different approved encrypted
file. Keys are loaded into Pythia's process, never into Chimera's browser or project.
Supply the approved billing project for the installation. No generation is performed during startup.

Then start the normal Chimera backend and frontend. The older Pythia service on
port 8001 can remain running; this installation uses port 8002 for the feature checkout.

The private local service uses `GET /media/images/status` and `POST /media/images`.
It is opt-in through `PYTHIA_MEX_IMAGE_ENABLED=1`, with the tested `gpt-image-1.5`,
one low-quality 1024×1024 PNG per request. Configured service clients need
`engine:read` and `media:generate` scopes. Provider spending controls remain separate
from request counts. Actual charges are not invented from missing billing data.

The Chimera job ID binds the request to Pythia's receipt. Repeating the same completed
request returns its saved image; changed, failed or interrupted requests do not
automatically call the provider again. Chimera also leaves interrupted running jobs
failed for explicit reconciliation instead of silently restarting a paid request.

This connection was verified through a real browser request, candidate approval,
scene attachment, reload and independent reopening of a standalone export. It does
not register new public Engine capabilities or grant content/release approval.


`-EnableMedia` enables images plus scene drafts and MP3 narration, using the same
existing credential. Scene drafts use `gpt-6.1-sol`; narration uses
`gpt-4o-mini-tts` and a stock voice. No extra credentials are copied into Chimera.
The scene editor receives a draft, previews it in memory, and saves only when the
author selects Save scene. Diagrams use native shapes and the editor's existing
animation fields. Arbitrary SVG, scripts, and invented asset references are rejected.

For narration, select **Media library → Create a media candidate → Narration →
Pythia narration**, supply a purpose and script, and generate once. Preview the
MP3, approve the asset, then accept its existing placement suggestion under
**03 Enhance**. This saves through normal project history and standalone export.
The form identifies the voice as AI-generated. Scene and narration receipts are
saved next to image receipts in `media-output-requests`; completed requests replay
their saved output without another provider call.

Video upload, playback and scene placement already exist. The candidate/job types
and preview now also accept video, but live generation is unavailable with the
current OpenAI connection: [Sora 2 and the Videos API shut down on September 24,
2026](https://developers.openai.com/api/docs/models/sora-2). The video option is
disabled with that explanation; the private video route returns 503 without a
provider call. A supported provider must be selected before implementing a live
video adapter. The first attempted clip failed and its receipt was preserved; no
clip or successful provider render is claimed. This describes the retired Pythia
route; Chimera now offers direct Synthesia/Shotstack adapters as described below.

The narration adapter reuses the existing Speech API. OpenAI's [current speech
guide](https://developers.openai.com/api/docs/guides/text-to-speech) schedules its
retirement for January 6, 2027; this local integration will need that provider
adapter updated before then. That migration is not part of this connection change.

Private routes: `GET /media/status`, `POST /media/scenes`, and
`POST /media/narration`. Clients need `engine:read` and `media:generate`; video
retrieval routes retain `media:read`. Startup and health checks do not generate
media. Local samples and technical tests do not grant content or release approval.


The local multimedia sample is **Pythia multimedia connection**, scene
**Request, preview, place**. One live scene request produced five animated native
shapes; one live narration request produced an 8.112-second MP3. Its accepted
placement survived reload and independently reopened standalone export, with the
same audio hash at Pythia, Chimera, and export. Existing projects were unchanged.
The sample is an engineering demonstration, not course or production acceptance.


Settings → AI Connections now opens an **Available connections** overview from the
same inventory used by scene and media requests (`GET /api/ai-connections`). It
combines the saved Pythia address and its live execution capabilities, the existing
OpenAI/compatible connection, and saved narration/video connection records.
Configured speech adapters are selectable for narration. Synthesia and Shotstack
now have direct Chimera video adapters: script/avatar presenter videos and
text/title clips respectively, up to 30 seconds. Saving/testing is still
non-generating; see [video connections](ai-connection.md#video-connections-and-generation).
Pythia is preferred where configured. The scene prompt and media form offer the
connections that can execute that output type. A newly saved supported connection
appears after settings refresh; there is no separate media provider list to edit.

Before using a selected connection, Chimera shares only connection IDs, capability
flags, model IDs and revisions with Pythia's private
`POST /media/connections/resolve` route (`engine:read`). Pythia verifies its own
execution revision and acknowledges external references as Chimera-managed;
external credential validity and generation are still checked by the existing
Chimera adapter. No keys are sent in this inventory. The selected connection ID is
stored with each new media job and candidate; execution checks its saved revision.
Provider failure does not automatically select another provider. Existing stored
jobs retain their original routing. Credential availability does not prove live
render permissions or access to an avatar; those require account-side approval.
