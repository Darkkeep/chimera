# AI Connection

Open Settings in the sidebar, then AI connection. The local single-user operator can manage the connection. In shared deployments, only installation administrators can save, test, or disconnect; other authenticated users can view connection status.

## Provider and Credentials

The settings panel supports the approved OpenAI endpoint `https://api.openai.com/v1` and a curated set of text, image, and audio models. It does not accept an arbitrary base URL. Existing server-side `CHIMERA_AI_*` environment settings remain supported until a saved connection overrides them. Replacing a different environment provider requires entering a new OpenAI key.

API keys are stored in a supported OS credential store through `keyring`: Windows Credential Manager, macOS Keychain, or Linux Secret Service/KWallet. Plaintext keyring backends are rejected. The API server must run as an account that can access an unlocked supported credential store. Headless Linux services may need credential-store provisioning; when unavailable, the panel refuses to save and environment configuration remains the alternative.

Enter the key directly in the application's password field. The saved key is never returned by the settings API or retained in browser storage. Leaving the field blank on subsequent saves keeps the configured key. Metadata under the workspace identity directory stores only models, limits, revision, and a credential-store reference. Project backups do not contain the installation credential. Backing up metadata alone does not transfer the OS credential to another machine.

Disconnect deletes the saved credential and disables AI for the installation, including environment fallback, until a new connection is saved. Running requests may finish; queued jobs submitted against another connection revision fail with a request to resubmit rather than silently changing destination or credential.

## Testing and Limits

Save first, then select Test connection. This explicitly performs an authenticated models-list request; it sends no course content and does not generate text, images, or audio. Redirects are rejected. A successful test verifies the endpoint and credential response, not every model's availability or account permissions.

The daily request limit is durable, installation-wide, and resets at midnight UTC. Connection tests and unsuccessful provider attempts consume this limit. Concurrent requests are bounded within the API process. This protection assumes the application's existing single-worker deployment; multi-worker scaling needs shared concurrency coordination.

Request limits are not a currency budget. Configure account-side spending controls with the provider before use. Generation still requires an explicit user action and may send selected course text, references, prompts, or narration to the provider. Apply your organisation's data-classification and retention policies before enabling it.

AI setting mutations require permitted request origins and installation administrator permissions. Audit entries record connection-save, disconnect, and test actions without credentials. Validation failures do not echo the submitted key.

## Generation Context and Review

Course and scene drafting send the course title, description, storyboard revision, completion settings, and the ordered scene IDs, titles, types, and required flags. This sequence is context, not permission to rewrite other scenes. Enhancement requests include the same course context even for a selected-scene run, while proposals remain restricted to the selected targets and fields.

Scene generation uses the current editor values, including unsaved title, learner text, narration, action description, notes, required flags, assessment data, and layout. The server overlays these values only for the request; generating a draft does not save them. Scene context also includes rendering mode, template and attached asset IDs, image descriptions, and assessment scoring settings. Assets are metadata references, not uploaded binary media. Layout context includes at most 24 elements, reports the omitted count, and excludes raw shape SVG geometry.

Course drafts use explicitly selected reference resources. Scene drafts use current course references that are unassigned or linked to the target scene. Draft reference context is limited to 60,000 text characters total and 8,000 per passage. This is an excerpt budget, not a guarantee that complete documents or every relevant passage fit. Enhancement uses the reference versions bound at submission, and its request preview shows the payload and estimated input size before submission. Source text and notes are treated as context rather than instructions overriding the generation contract.

Draft requests include JSON schemas derived from Chimera's models. Enhancement requests list the allowed fields for their scope and the schemas for field values; selected-scene runs cannot propose course-level changes. Provider output still undergoes server-side validation. Unsupported draft fields are rejected instead of silently discarded.

Scene layout drafts are text-only replacement compositions, not edits that preserve every existing visual object. They must use an enabled 1280 by 720 canvas, a non-white background, no background asset, and exactly one title element followed by one element for each learner-facing paragraph. Elements must be non-empty and inside the canvas. This prevents missing or contradictory display text; it does not prove text will fit at every font size, avoid overlap, or have adequate contrast. Review the Stage before saving. Images, audio, and arbitrary custom interactions are not created by text-drafting instructions.

Scene-layout elements now accept validated `animations` settings for entrance, presentation/emphasis, and timed exit. The request supplies allowed presets, duration/delay ranges, finite presentation repeats, and sequencing rules alongside the model-derived schema. Requested motion must be returned as actual element fields, not only described in notes. Preview and both SCORM profiles and standalone packages use the same playback routine, with static rendering for reduced-motion users. Exit times are measured from scene entry, not navigation; presentation delays follow the entrance ending. Course drafts without visual layouts do not support these fields. Arbitrary CSS, scripts, audio-synchronized motion, and click-triggered sequences remain unsupported. Inspect and save the generated scene explicitly, then re-export any previously downloaded packages.

Assessment drafts must contain a structured supported question, valid answer keys, and optional scoring settings, not just prose describing a question. Question content, answers, feedback, and scoring are visible in draft review. Reviewed assessment data is retained when adding course scenes or saving a scene revision. Omitted optional scene fields preserve existing values; an explicit replacement remains an author-reviewed change. Use the assessment editor for further question editing after saving.

Course drafts are only persisted by Add selected scenes, using the storyboard revision check. Scene drafts remain in the editor until Save scene. Enhancement proposals continue through the existing accept/reject and revision-checking workflow. A generated scene's action description is a production instruction, not proof that the described behavior exists in the exported course.

Scene drafts now receive a browser-measured text-fit pass before editor review. It grows unlocked text boxes into available space or reduces type within a readable limit, preserving text, positions, and animations. Unresolved overflow is identified and blocks editor saving for enabled visual layouts. Existing scenes can use the explicit Fit text command. This does not run on direct API writes and does not certify overlap, contrast, or identical font rendering on another machine.

Remaining qualification work includes live-provider output quality, source coverage and citation review for drafts, request-size budgeting for large courses and enhancement references, and broader visual checks for overlap and contrast. Structural validation cannot guarantee factual accuracy or instructional quality; review against the supplied sources remains required.

## Verification

`python -m unittest backend.tests.test_ai_connection backend.tests.test_password_auth` checks secure storage, origin restrictions, secret redaction, permissions, request limits, and job connection revisions.

`npm run test:onboarding -- ai-connection.spec.cjs --project chromium` checks the settings dialog with inert mocked credentials and provider responses. No live AI calls are required for these tests.

`python -m unittest backend.tests.test_content_generation backend.tests.test_ai_connection backend.tests.test_storyboard_flow` checks request context and schemas, current unsaved scene values, optional-field preservation, layout/text consistency, assessment validation and persistence, and enhancement review behavior.

`npm run test:onboarding -- ai-drafting.spec.cjs --project chromium` checks reference-backed course creation, unsaved scene context, draft-only generation, layout saving, and assessment review and persistence. It captures assessment review at desktop and mobile sizes with mocked provider responses.