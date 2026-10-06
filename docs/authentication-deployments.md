# Authentication deployment preparation

Chimera uses one backend with installation-specific authentication. No hosted deployment or real user account was created by this change. The existing local workspace is unchanged.

| Profile | Identity | Current status |
| --- | --- | --- |
| `local` | Existing local single-user identity | Available; no login required |
| `encarta` | Encarta adapter | Profile prepared; protected requests return 503 until real validation is implemented |
| `darkrogue` | Built-in email/password accounts | Backend sign-in/session foundation implemented; operator-created administrators only |

The examples under `deploy/` describe environment variables. They are not automatically loaded. Each hosted profile must use its own `CHIMERA_WORKSPACE`; do not reuse the local authoring workspace. Profiles take precedence over stored installation identity settings. A `local` profile cannot override a workspace already configured for team identity. Unimplemented OIDC, SAML, or generic adapters never fall back to local identity.

## darkrogue.io

Set these variables in the service environment:

```text
CHIMERA_DEPLOYMENT_PROFILE=darkrogue
CHIMERA_PUBLIC_ORIGIN=https://darkrogue.io
CHIMERA_WORKSPACE=/srv/chimera/darkrogue-workspace
```

If the application will use a subdomain, set its exact HTTPS origin instead. Serve the frontend and `/api` at that same origin behind an HTTPS reverse proxy. Bind Uvicorn to a private interface and configure trusted proxy addresses explicitly. CORS permits the configured origin in the darkrogue profile; it does not accept wildcards.

Provision the initial operator account from the server, using the same workspace environment:

```powershell
.\.venv\Scripts\python.exe scripts/provision-account.py --email operator@example.com --name "Operator" --roles administrator author instructional-designer
```

The command prompts for a password and confirmation; passwords do not appear in command arguments. Passwords must be 15–1024 characters. The application stores salted scrypt password hashes, not passwords. Parameters are `N=2^17`, `r=8`, `p=1`, consistent with the [OWASP password storage guidance](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html).

Backend endpoints:

- `GET /api/auth/config`: public discovery of deployment mode, provider, and whether password login is available.
- `POST /api/auth/login`: JSON `email` and `password`; requires the exact configured `Origin` header. Returns an opaque session cookie.
- `POST /api/auth/logout`: requires the same origin; revokes the server-side session and removes the cookie.
- `GET /api/identity/context`: returns the signed-in hosted actor and roles rather than the local user.
- Other API data routes require authentication and authorization. `/api/health` remains public.

Sessions expire after eight hours. Cookies use `Secure`, `HttpOnly`, `SameSite=Strict`, `Path=/`, and the `__Host-` prefix; session tokens are stored only as SHA-256 digests. Signing in again rotates and revokes the presented session. Disabled accounts and expired/revoked sessions cannot resolve an actor. Mutating authenticated requests require the exact configured origin, including requests from sibling subdomains. Login validation errors do not echo submitted passwords. API responses use `Cache-Control: no-store`.

Failed sign-ins are limited to five per normalized account and thirty per direct client address within fifteen minutes. Unknown and disabled accounts receive the same credential error as bad passwords. Behind a reverse proxy, client-address interpretation must be configured deliberately; add ingress rate and request-size limits before public exposure.

Account hashes, failure counters, and session digests live in `identity/accounts.json` inside the dedicated workspace. Writes use the existing filesystem transaction lock and atomic replacement. Protect that directory with operating-system permissions; Windows requires appropriate ACLs. These installation credentials are not project backup content.

### Remaining work before public release

- Login/logout UI and session-expiry handling in the frontend.
- Password reset, account recovery, operator account disabling/reset tools, and account lifecycle audit events.
- Project-scoped membership and tenant authorization. Non-administrator accounts are deliberately denied application data access in this foundation; no self-registration route is provided. Administrators need additional explicit content roles to approve enhancements.
- Resolve current local assumptions in remaining management/audit read models and event attribution before enabling collaborative use.
- Hosting configuration, TLS/proxy integration tests, restricted filesystem permissions, ingress limits, and end-to-end browser qualification at the actual deployment origin.

This is backend preparation, not a public-release claim. MFA and email verification are not implemented. No live credentials, outbound email service, or public deployment were configured.

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
.\.venv\Scripts\python.exe -m unittest discover -s backend/tests
```

The hosted authentication tests cover credential errors, password redaction, hashed session storage, secure cookies, actor mapping, logout/relogin revocation, expiry, disabled accounts, origin checks, rate limiting, non-admin denial, installation downgrade prevention, and Encarta/unimplemented-provider rejection.
