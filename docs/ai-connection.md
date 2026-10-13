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

## Verification

`python -m unittest backend.tests.test_ai_connection backend.tests.test_password_auth` checks secure storage, origin restrictions, secret redaction, permissions, request limits, and job connection revisions.

`npm run test:onboarding -- ai-connection.spec.cjs --project chromium` checks the settings dialog with inert mocked credentials and provider responses. No live AI calls are required for these tests.