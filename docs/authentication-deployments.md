# Authentication deployment preparation

Chimera uses one backend with installation-specific authentication. No hosted deployment or real user account was created by this change. The existing local workspace is unchanged.

| Profile | Identity | Current status |
| --- | --- | --- |
| `local` | Existing local single-user identity | Available; no login required |
| `encarta` | Encarta adapter | Profile prepared; protected requests return 503 until real validation is implemented |
| `darkrogue` | Built-in email/password accounts | Login, logout, recovery, project roles, and authenticated review links implemented; live server qualification deferred |

The examples under `deploy/` describe environment variables. They are not automatically loaded. Each hosted profile must use its own `CHIMERA_WORKSPACE`; do not reuse the local authoring workspace. Profiles take precedence over stored installation identity settings. A `local` profile cannot override a workspace already configured for team identity. Unimplemented OIDC, SAML, or generic adapters never fall back to local identity.

## darkrogue.io

Set these variables in the service environment:

```text
CHIMERA_DEPLOYMENT_PROFILE=darkrogue
CHIMERA_PUBLIC_ORIGIN=https://darkrogue.io
CHIMERA_WORKSPACE=/srv/chimera/darkrogue-workspace
CHIMERA_REVIEW_ACCESS=authenticated
```

If the application will use a subdomain, set its exact HTTPS origin instead. Serve the frontend and `/api` at that same origin behind an HTTPS reverse proxy. Bind Uvicorn to a private interface and configure trusted proxy addresses explicitly. CORS permits the configured origin in the darkrogue profile; it does not accept wildcards.

Provision the initial operator account from the server, using the same workspace environment:

```powershell
.\.venv\Scripts\python.exe scripts/provision-account.py --email operator@example.com --name "Operator" --roles administrator author instructional-designer
```

The command prompts for a password and confirmation; passwords do not appear in command arguments. Passwords must be 15â€“1024 characters. The application stores salted scrypt password hashes, not passwords. Parameters are `N=2^17`, `r=8`, `p=1`, consistent with the [OWASP password storage guidance](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html).

Backend endpoints:

- `GET /api/auth/config`: public discovery of deployment mode, provider, and whether password login is available.
- `POST /api/auth/login`: JSON `email` and `password`; requires the exact configured `Origin` header. Returns an opaque session cookie.
- `POST /api/auth/logout`: requires the same origin; revokes the server-side session and removes the cookie.
- `POST /api/auth/reset-password`: one-use reset token and new password; same-origin requests only.
- `GET /api/identity/context`: returns the signed-in hosted actor and roles rather than the local user.
- `GET /api/accounts`: administrator-only account directory, with no password/session material.
- `/api/projects/{id}/members`: administrator-controlled project roles; removing membership immediately removes that project access.
- `/api/projects/{id}/permissions`: capabilities for the current actor/project.
- `/api/projects/{id}/review-links`: create/list/revoke authenticated, audience-bound, expiring review links.
- Other API data routes require authentication and authorization. `/api/health` remains public.

Sessions expire after eight hours. Cookies use `Secure`, `HttpOnly`, `SameSite=Strict`, `Path=/`, and the `__Host-` prefix; session tokens are stored only as SHA-256 digests. Signing in again rotates and revokes the presented session. Disabled accounts and expired/revoked sessions cannot resolve an actor. Mutating authenticated requests require the exact configured origin, including requests from sibling subdomains. Login validation errors do not echo submitted passwords. API responses use `Cache-Control: no-store`.

Failed sign-ins are limited to five per normalized account and thirty per direct client address within fifteen minutes. Unknown and disabled accounts receive the same credential error as bad passwords. Behind a reverse proxy, client-address interpretation must be configured deliberately; add ingress rate and request-size limits before public exposure.

Account hashes, failure counters, and session digests live in `identity/accounts.json` inside the dedicated workspace. Writes use the existing filesystem transaction lock and atomic replacement. Protect that directory with operating-system permissions; Windows requires appropriate ACLs. These installation credentials are not project backup content.

### Account management and recovery

Accounts are operator-provisioned; there is no public registration or outbound email flow. The login page's recovery guidance directs the user to their administrator. Use the same workspace and public-origin environment for these operator commands:

```powershell
.\.venv\Scripts\python.exe scripts/manage-account.py disable --email reviewer@example.com
.\.venv\Scripts\python.exe scripts/manage-account.py enable --email reviewer@example.com
.\.venv\Scripts\python.exe scripts/manage-account.py reset-password --email reviewer@example.com
.\.venv\Scripts\python.exe scripts/manage-account.py reset-link --email reviewer@example.com
```

On Linux use `.venv/bin/python`. Direct password changes prompt securely. Reset links last fifteen minutes, are stored as token digests, and can be used once. Operators deliver links through their approved channel; the application sends no messages. Password changes and disabling accounts revoke sessions and outstanding reset links. The last active administrator cannot be disabled. Account lifecycle and membership actions produce security audit events.

### Project permissions and review links

Organization roles allow project creation and administration; they do not grant authors or reviewers access to every project. Creating a project assigns its creator the instructional-designer project role. Assigned reviewers can view/play the project and comment/reply/resolve threads; they cannot change scenes, approve enhancements, manage members, or export project content. Project lists and My Work are filtered to accessible projects. Administrators have content access under the installation policy, but content approval requires an explicit author/instructional-designer project membership. Comments and replies use the authenticated display name. Request and background-job audit attribution follows the verified actor; recovered background work uses a service actor.

In the hosted frontend, open **Settings ? Project access** as an administrator to assign an existing account, update a role, or remove membership. Set `CHIMERA_REVIEW_ACCESS=authenticated` to expose review-link creation. Other installations retain `no-external-review` by default.

Review links are bound to an existing project's assigned account, current storyboard revision, and configured HTTPS origin. Creation defaults to three days; the API supports one to 168 hours. Tokens are in URL fragments and then supplied in the `X-Review-Token` request header, not the API URL. The invited user must sign in. Expired, revoked, wrong-user, or removed-membership links fail; a changed storyboard requires a new link. Link revocation controls that invitation, while membership separately controls ordinary project access. Remove membership to withdraw all project access. No unauthenticated guest review is enabled.

### AI connection administration

Settings > AI connection lets installation administrators manage the approved OpenAI preset; other authenticated users see status only. Keys use the service account's OS credential store and never appear in settings responses or project archives. Mutations require administrator authority and an approved origin; safe audit events and validation redaction cover credential changes. See [AI connection](ai-connection.md).

Before enabling browser-based saves on Linux, provision and unlock a supported Secret Service or KWallet backend for the actual service identity. Headless services without that store fail closed rather than using plaintext storage; protected service environment variables remain available. Do not assume a developer's Windows credential-store verification qualifies the Linux service. Use one API worker for the current per-process concurrency limit, configure provider-account spending controls, and approve the data destination/retention policy. Daily request counts are durable, but are not a currency budget.

### Linux/Nginx deployment handoff

The user selected an existing Linux server with Nginx. Server/SSH details and live qualification are explicitly deferred.

- `deploy/darkrogue.env.example`: service environment, dedicated workspace, exact public origin, authenticated review mode.
- `deploy/darkrogue.nginx.conf`: same-origin static SPA and reverse proxy, TLS certificate paths, security headers, login/API rate limits, body-size limits, and loopback upstream.
- `deploy/chimera-darkrogue.service`: service-user API process, restrictive file creation, filesystem boundary, and trusted loopback proxy settings.

Before enabling the live site, adapt the hostname, certificate paths, checkout directory, service user, and workspace to the actual server. Build `frontend/dist`, install Python dependencies into the server's virtual environment, provision accounts under the service identity, and restrict workspace ownership/permissions. Validate `nginx -t` and service startup before switching traffic. These configuration templates were not installed or tested against the real Nginx server in this session.

Remaining live checks: certificate/hostname and redirect behavior, proxy client-IP handling, Linux workspace permissions, real-domain login/logout/reset/review flows, and intended browser coverage. MFA, email verification, automatic email delivery, and multi-organization tenancy are separate scope; they are not implemented by this single-organization deployment.

## Encarta integration contract

Set `CHIMERA_DEPLOYMENT_PROFILE=encarta` and a separate workspace. `CHIMERA_ENCARTA_URL` can be supplied when known, but setting it alone does not enable authentication. Requests remain denied even if callers supply identity headers or cookies.

Before implementing the real verifier, obtain:

1. Sign-in flow and supported protocol; authorization/token/user-info endpoints or the equivalent documented contract.
2. Token verification method, issuer/audience rules, expiry and revocation behavior, signing keys or introspection authentication.
3. Stable user identifier, display name, organization/tenant mapping, disabled-user behavior, and provisioning policy.
4. Session ownership, logout, callback origins, and failure/status-code contract.
5. Project permission mapping and test credentials/environment supplied through the deployment operator.

Do not infer role grants from unverified browser headers or token payloads. Each verified provider must produce the same `ActorContext` used by the authorization layer.

## Verification

Run the backend suite from the repository root:

```powershell
.\.venv\Scripts\python.exe -m pip install -r backend/requirements-dev.txt
.\.venv\Scripts\python.exe -m unittest discover -s backend/tests
```

The hosted authentication tests cover credential errors, password redaction, hashed session storage, secure cookies, actor mapping, logout/relogin revocation, expiry, disabled accounts, origin checks, rate limiting, non-admin denial, installation downgrade prevention, and Encarta/unimplemented-provider rejection.


Run the real HTTPS frontend/API harness after building the frontend:

```powershell
npm run build --prefix frontend
npm run test:auth
```

The harness uses disposable accounts/passwords, an isolated temporary workspace, a short-lived test certificate, and an HTTPS reverse proxy. It does not enable a production authentication bypass. Set `OPENSSL_BINARY` and `CHIMERA_TEST_PYTHON` if needed. Node, Playwright Chromium, and OpenSSL are required; browser contexts ignore the disposable certificate only inside the test harness. Evidence is regenerated in `workspace/auth-qualification`.

The 2026-10-06 browser pass verified sign-in errors, login, secure session cookie flags, recovery guidance, password reset/mismatch handling, project membership display, authenticated review/comments, cross-project denial, session-expiry handling, and logout. The sign-in page had no Axe violations, no horizontal overflow at 390px, and no observed JavaScript errors. This is local HTTPS qualification, not live darkrogue.io certification. GitHub CI now runs backend regression tests and this hosted authentication harness alongside the existing onboarding tests.

On 2026-10-07, the same HTTPS harness passed again after adapting identity selectors and navigation to My Work startup. Backend tests additionally verify AI-setting administrator authority, origin enforcement, safe audit entries, and key redaction. This remains isolated local qualification, not public-server or live-provider certification.

12ui produced the account-screen images and HTML references; clickable prototype export hit a Windows `fsync` error. Completed outputs were integrated into React. Screenshot comparisons against the original LayerDocs are retained locally under `.improve/chimera-auth-align-*`; those image-based kits have no DOM-selector coverage claim. The actual Chimera logo, existing application styles, fifteen-character password policy, and fifteen-minute reset expiry were retained over conflicting generated copy.
