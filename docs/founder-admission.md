# Chimera founder-controlled admission (DARKROGUE SSO)

Chimera authentication is distinct from Chimera admission. DARKROGUE accounts and
roles alone do not admit a visitor. The gate defaults to denied for every
DARKROGUE user, with a founder exception and explicit email approvals.

## Deployment prerequisite: preserve founder access

Before deploying, set `CHIMERA_FOUNDER_EMAIL` on the **Chimera server** to
the exact DARKROGUE email of the founder's existing administrator account.
The founder bypass applies **only while that account has the administrator role**.
Without this setting or an existing explicit approval, the server fails closed.
Keep the existing `CHIMERA_WORKSPACE` path unchanged.

For additional trusted users, provision admission from the hosted service
environment, which must point at the existing workspace:

```bash
.venv/bin/python scripts/manage-admission.py approve --email person@example.com
.venv/bin/python scripts/manage-admission.py revoke --email person@example.com
.venv/bin/python scripts/manage-admission.py list
```

Use `.venv/Scripts/python.exe` on Windows. The email can be approved
before the user first visits Chimera. Approvals live at
`CHIMERA_WORKSPACE/identity/admission.json` and must remain private.
Approving someone **does not** give them access to existing projects.
Assign project membership separately through Settings → Project access.

## User experience

- Sign in with DARKROGUE. If not admitted, Chimera shows an invitation-only
  holding screen with a return link to a trusted DARKROGUE referrer or its home.
- Unapproved users cannot access private Chimera APIs (including create, media,
  export and project listings). The authenticated admission probe is
  `GET /api/admission/status`.
- Local and non-DARKROGUE authentication profiles remain unaffected.
- Founder access is preserved through the configured administrator exception.

## Acceptance checks before publishing

1. Sign in as the founder: verify normal My Work and project APIs.
2. Sign in as an unapproved DARKROGUE LEARNER, INSTRUCTOR **and ADMIN**:
   verify the holding screen and 403 for `GET /api/projects` and `POST /api/projects`.
3. Approve an email and sign in again: verify admission and normal
   project-specific permissions. Revoke it and verify the next API call is denied.
4. Check the return link and narrow/mobile display, keyboard focus and
   reduced-motion preferences.
5. Confirm local workstation mode remains unaffected.

This is a deliberate manual-operator workflow. No public request-access form,
automatic admission or email delivery is introduced.
