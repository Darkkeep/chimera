# AI Connection

Pythia diagnostics are available separately under **Settings > Pythia** (formerly Intelligence Engine). Pythia manages learning-intelligence providers; **Settings > AI connection** configures media-provider connections, not Pythia's provider registry.

Open Settings in the sidebar, then AI connection. The local single-user operator can manage the connection. In shared deployments, only installation administrators can save, test, or disconnect; other authenticated users can view connection status.

## Provider Tabs

The dialog has six provider tabs. Arrow keys move between tabs; Home/End select the first/last tab. Switching away from an edited form requires confirmation and clears any entered password when confirmed. Only the active provider's named connections appear in its selector. Switching tabs does not change the provider selected for media generation.

| Tab | Available in Chimera | Server credential options | Non-generating test |
| --- | --- | --- | --- |
| OpenAI | Images and legacy narration | OS credential store; existing `CHIMERA_AI_*` configuration | Models list |
| ElevenLabs | MP3 narration | OS credential store or `ELEVENLABS_API_KEY` | Voices and speech-model lists |
| Google Cloud | MP3 narration | Application Default Credentials | Voices list |
| Cartesia | MP3 narration | OS credential store or `CARTESIA_API_KEY` | Voices list |
| Synthesia | Connection setup/testing only; video generation not yet available | OS credential store or `SYNTHESIA_API_KEY` | Video-list metadata, discarded after validation |
| Shotstack | Connection setup/testing only; video generation not yet available | OS credential store or environment-specific server key | Saved-template metadata, discarded after validation |

Saved non-OpenAI connections share the existing `/api/narration-connections` API and installation metadata for backward compatibility. Video connections are explicitly excluded from narration/image generation capabilities, even when configured. Saving or testing them never submits a render job.

For illustrated setup and the narration workflow, see [Configure media connections](user-guide.md#configure-media-connections) and [Request narration](user-guide.md#request-narration). The [current capture manifest](user-guide/refresh-providers-2026-10-27.json) distinguishes inert documentation status from live-provider verification.

### Connection API and persistence

| Endpoint | Purpose |
| --- | --- |
| `GET /api/ai-connection` | Existing safe OpenAI status; its PUT/test/disconnect contract is unchanged |
| `GET /api/narration-connections` | Safe non-OpenAI collection: revision, management/storage flags and named connection metadata |
| `PUT /api/narration-connections` | Administrator/local-operator save with `expectedRevision`; omit `id` to create, supply it to update |
| `POST /api/narration-connections/{id}/test` | Read-only provider discovery/check with the collection's `expectedRevision` |
| `POST /api/narration-connections/{id}/disconnect` | Remove the named connection and its owned secret with `expectedRevision` |
| `GET /api/projects/{id}/media-generation-capability` | Project permission, separate image availability and usable speech connections, never video setup |

Metadata is installation-scoped under `identity/narration-connections.json`, not embedded in each project. IDs retain the `narration-...` form even for video setup. `apiKey` is write-only and accepted only with `credentialSource: secure-store`; `environment` and `adc` modes reject submitted keys. An empty key retains a compatible stored key, except changing Shotstack environment requires its matching new key. Non-OpenAI updates cannot change provider in place. Concurrent collection changes return a revision conflict; reload status, inspect it and resubmit intentionally rather than overwriting another administrator's edit.

Safe status reports credential availability, not a previously certified live connection. A saved speech connection may initially have no voice so discovery can run; it is excluded from generation until a voice is saved. Google voice selection replaces a separate model ID. Video connections accept no narration voice/model settings. Backend adapters use fixed approved URLs, bounded responses, no redirects and sanitized failures; raw list responses and credentials are not forwarded to the browser. Returned voice/model choices are the documented discovery subset.

## OpenAI Images and Legacy Narration

The settings panel supports the approved OpenAI endpoint `https://api.openai.com/v1` and a curated set of text, image, and audio models. It does not accept an arbitrary base URL. Existing server-side `CHIMERA_AI_*` environment settings remain supported until a saved connection overrides them. Replacing a different environment provider requires entering a new OpenAI key.

API keys are stored in a supported OS credential store through `keyring`: Windows Credential Manager, macOS Keychain, or Linux Secret Service/KWallet. Plaintext keyring backends are rejected. The API server must run as an account that can access an unlocked supported credential store. Headless Linux services may need credential-store provisioning; when unavailable, the panel refuses to save and environment configuration remains the alternative.

Enter the key directly in the application's password field. The saved key is never returned by the settings API or retained in browser storage. Leaving the field blank on subsequent saves keeps the configured key. Metadata under the workspace identity directory stores only models, limits, revision, and a credential-store reference. Project backups do not contain the installation credential. Backing up metadata alone does not transfer the OS credential to another machine.

Disconnect in the OpenAI section deletes its saved credential and disables that connection, including environment fallback, until a new connection is saved. It does not disconnect separate narration connections. Running requests may finish; queued jobs submitted against another connection revision fail with a request to resubmit rather than silently changing destination or credential.

## Separate Narration Connections

The **Narration connections** section in each speech-provider tab supports named ElevenLabs, Google Cloud Text-to-Speech and Cartesia connections. Save credentials first, leaving Voice blank if necessary; select **Test narration connection** to discover voices, select a voice, then save again. A connection is offered for generation only when credentials and a saved voice are available. Up to 20 non-OpenAI connections (including video setup) can be saved per installation. Images continue to use the OpenAI connection. A saved connection cannot change provider; create another connection instead.

### ElevenLabs

Choose **Secure credential store** to enter a write-only API key, or **Server environment** to use the backend process's fixed `ELEVENLABS_API_KEY` variable. Environment mode has no key field and never reads browser/Vite variables. Provision the variable through your service environment or managed secret injection, then restart the backend as required by the deployment. Keys are not copied into metadata, projects, logs, or status responses. Use a restricted ElevenLabs key with only the required speech, voice-list and model-list permissions and account-side credit controls.

Choose a supported speech model and voice returned by discovery. Discovery reads the first 100 voices and reports when more exist; an authorised voice ID can also be entered directly. The saved Language is narration metadata for ElevenLabs: speech language is detected by the selected model, not forced through an unsupported language parameter.

### Google Cloud Text-to-Speech

Enable the Cloud Text-to-Speech API and billing in your Google Cloud project. Provision **Application Default Credentials (ADC)** for the account running the backend; the form accepts an optional quota project, never a pasted/uploaded Google credential or private key. For local development, use `gcloud auth application-default login` under that account. For hosted services, prefer an attached service identity or workload identity federation with least-privilege Text-to-Speech access. If an operator uses `GOOGLE_APPLICATION_CREDENTIALS`, it is a server-side file reference managed outside Chimera, not an uploaded project asset.

Select a voice and matching language locale; Google selects its speech model through the voice rather than a separate model field. Requests use plain text and MP3 output, with a 5,000 UTF-8 byte input limit. Features such as SSML, streaming, custom audio encodings and long-audio jobs are not exposed by this adapter.

### Cartesia

Choose **Secure credential store** for a write-only API key or **Server environment** for `CARTESIA_API_KEY` injected into the backend service. The adapter uses the fixed `https://api.cartesia.ai` endpoint, Bearer authentication, and `Cartesia-Version: 2026-08-14`; arbitrary endpoints and browser access tokens are not accepted.

The default model is `sonic-3.6`. Save credentials, test to discover the first 100 voices, and save the selected voice. Additional pages are reported but not automatically fetched; a known voice ID can be entered directly. The test discovers voices only; it does not verify model access. The selected language/locale is sent with the transcript. Explicit generation requests MP3 at 44.1 kHz/128 kbps and follows the same candidate review and approval process as other narration providers.

### Testing, Generation and Disconnection

Narration tests list provider voices (and ElevenLabs speech models), without sending course text or synthesizing audio. Cartesia's default model comes from the API contract, not model discovery. Passing discovery is not proof of synthesis permissions, voice/model compatibility or output quality. **Generate candidate** is the explicit, potentially billable synthesis action. In Media library, choose **Narration**, explicitly select a saved connection (or **Existing AI connection** for legacy OpenAI), and review its voice/language before generating. Candidates still require normal review and approval; saving a connection or testing it never attaches audio to a scene.

Each connection is disconnected separately, removing its metadata and any credential it owns; server environment variables and ADC identities are not deleted. Removal never falls back to another provider. Queued jobs bind to the selected connection revision; a changed/removed connection fails rather than silently switching providers. Rotating a fixed provider environment key is detected; replacing an ADC file at the same path is not a credential-version guarantee. Existing legacy jobs remain compatible.

Narration discovery, synthesis and video connection tests share the installation's durable request counter with OpenAI. Each non-OpenAI request enforces a ceiling of 20 requests/day and one concurrent request in the API process; OpenAI's configurable form limits do not change these ceilings. ElevenLabs discovery makes two requests and consumes two units. Request counts are not spending controls. Provider-side limits and organisation data-use approval remain necessary.

## Video Connection Setup

**Synthesia:** save an API-enabled account's key using the OS store or server `SYNTHESIA_API_KEY`. **Test video connection** makes `GET https://api.synthesia.io/v2/videos?limit=1` with the key in the `Authorization` header (not an added Bearer prefix). The response is checked and discarded; no video names, URLs or content are returned to the browser or written into project data. This tests list permission, not video-generation entitlement.

**Shotstack:** choose **Sandbox (stage)** or **Production (v1)** and provide the matching key. Server environment mode reads `SHOTSTACK_SANDBOX_API_KEY` or `SHOTSTACK_PRODUCTION_API_KEY`, respectively. Secure-store mode requires a new key when changing environment so a sandbox credential is never silently reused for production. **Test video connection** reads `/templates` at the selected fixed `https://api.shotstack.io/edit/stage` or `/edit/v1` endpoint using `x-api-key`. It does not render a video or generate AI assets. Future sandbox renders can be watermarked and AI generation can still incur charges; sandbox is not a general spending exemption.

Both tabs explicitly state **video generation is not yet available in Chimera**. No avatar/template editor, render submission, polling, webhook handling, video download or generated-video review is provided by this connection-only setup. Existing uploaded video assets remain usable through the normal media library.

Official references: [ElevenLabs authentication](https://elevenlabs.io/docs/api-reference/authentication), [ElevenLabs speech API](https://elevenlabs.io/docs/api-reference/text-to-speech/convert), [Google authentication](https://cloud.google.com/text-to-speech/docs/authentication), [Cartesia speech](https://docs.cartesia.ai/api-reference/tts/bytes), [Cartesia voices](https://docs.cartesia.ai/api-reference/voices/list), [Synthesia list videos](https://docs.synthesia.io/reference/list-videos), and [Shotstack keys/environments](https://shotstack.io/docs/guide/getting-started/request-api-keys.md).

## Testing and Limits

Save first, then select the active provider's Test button. This explicitly performs the read-only request(s) described above; it sends no course content and does not generate text, images, audio or video. Redirects are rejected. A successful test verifies the endpoint and credential response, not every model's availability or account permissions.

The daily request limit is durable, installation-wide, and resets at midnight UTC. Connection tests and unsuccessful provider attempts consume this limit. Concurrent requests are bounded within the API process. This protection assumes the application's existing single-worker deployment; multi-worker scaling needs shared concurrency coordination.

Request limits are not a currency budget. Configure account-side spending controls with the provider before use. Generation still requires an explicit user action and may send selected course text, references, prompts, or narration to the provider. Apply your organisation's data-classification and retention policies before enabling it.

AI setting mutations require permitted request origins and installation administrator permissions. Audit entries record connection-save, disconnect, and test actions without credentials. Validation failures do not echo the submitted key.

## Generation Context and Review

Course and scene drafting send the course title, description, storyboard revision, completion settings, and the ordered scene IDs, titles, types, and required flags. This sequence is context, not permission to rewrite other scenes. Enhancement requests include the same course context even for a selected-scene run, while proposals remain restricted to the selected targets and fields.

Scene generation uses the current editor values, including unsaved title, learner text, narration, action description, notes, required flags, assessment data, and layout. The server overlays these values only for the request; generating a draft does not save them. Scene context also includes rendering mode, template and attached asset IDs, image descriptions, and assessment scoring settings. Assets are metadata references, not uploaded binary media. Layout context includes at most 24 elements, reports the omitted count, and excludes raw shape SVG geometry.

Course drafts use explicitly selected reference resources. Scene drafts use current course references that are unassigned or linked to the target scene. Draft reference context is limited to 60,000 text characters total and 8,000 per passage. This is an excerpt budget, not a guarantee that complete documents or every relevant passage fit. Enhancement uses the reference versions bound at submission, and its request preview shows the payload and estimated input size before submission. Source text and notes are treated as context rather than instructions overriding the generation contract.

Draft requests include JSON schemas derived from Chimera's models. Enhancement requests list the allowed fields for their scope and the schemas for field values; selected-scene runs cannot propose course-level changes. Provider output still undergoes server-side validation. Unsupported draft fields are rejected instead of silently discarded.

Scene layout drafts are text-only replacement compositions, not edits that preserve every existing visual object. They must use an enabled 1280 by 720 canvas, a non-white background, no background asset, and exactly one title element followed by one element for each learner-facing paragraph. Elements must be non-empty and inside the canvas. This prevents missing or contradictory display text; it does not prove text will fit at every font size, avoid overlap, or have adequate contrast. Review the Stage before saving. Images, audio, and arbitrary custom interactions are not created by text-drafting instructions.

Scene-layout elements accept validated `animations` settings for entrance, presentation/emphasis, and timed exit. The request supplies allowed presets, duration/delay ranges, finite presentation repeats, and sequencing rules alongside the model-derived schema. Requested motion must be returned as actual element fields, not only described in notes. Preview, both SCORM profiles, and standalone packages share playback routines. The optional authored [scene timeline](user-guide.md#schedule-scene-objects-audio-and-video) synchronizes native animation with scheduled audio/video; automatic inference of narration timing from AI prose is not a documented generation workflow. Exit times use the scene clock; stored presentation delays follow the entrance ending. Individual effects support 0.1-60 seconds, with delays up to one hour; timed-scene endpoints must fit its duration. Reduced motion suppresses movement while preserving timed visibility. Course drafts without visual layouts do not support element animation fields. Arbitrary CSS/scripts, motion paths, effect keyframes, and click-triggered sequences remain unsupported. Inspect and save generated drafts explicitly, then re-export previously downloaded packages.

Assessment drafts must contain a structured supported question, valid answer keys, and optional scoring settings, not just prose describing a question. Question content, answers, feedback, and scoring are visible in draft review. Reviewed assessment data is retained when adding course scenes or saving a scene revision. Omitted optional scene fields preserve existing values; an explicit replacement remains an author-reviewed change. Use the assessment editor for further question editing after saving.

Course drafts are only persisted by Add selected scenes, using the storyboard revision check. Scene drafts remain in the editor until Save scene. Enhancement proposals continue through the existing accept/reject and revision-checking workflow. A generated scene's action description is a production instruction, not proof that the described behavior exists in the exported course.

Scene drafts now receive a browser-measured text-fit pass before editor review. It grows unlocked text boxes into available space or reduces type within a readable limit, preserving text, positions, and animations. Unresolved overflow is identified and blocks editor saving for enabled visual layouts. Existing scenes can use the explicit Fit text command. This does not run on direct API writes and does not certify overlap, contrast, or identical font rendering on another machine.

Remaining qualification work includes live-provider output quality, source coverage and citation review for drafts, request-size budgeting for large courses and enhancement references, and broader visual checks for overlap and contrast. Structural validation cannot guarantee factual accuracy or instructional quality; review against the supplied sources remains required.

## Verification

`python -m unittest backend.tests.test_ai_connection backend.tests.test_password_auth` checks secure storage, origin restrictions, secret redaction, permissions, request limits, and job connection revisions.

`npm run test:onboarding -- ai-connection.spec.cjs --project chromium` checks the settings dialog with inert mocked credentials and provider responses. No live AI calls are required for these tests.

`python -m unittest backend.tests.test_content_generation backend.tests.test_ai_connection backend.tests.test_storyboard_flow` checks request context and schemas, current unsaved scene values, optional-field preservation, layout/text consistency, assessment validation and persistence, and enhancement review behavior.

`npm run test:onboarding -- ai-drafting.spec.cjs --project chromium` checks reference-backed course creation, unsaved scene context, draft-only generation, layout saving, and assessment review and persistence. It captures assessment review at desktop and mobile sizes with mocked provider responses.
