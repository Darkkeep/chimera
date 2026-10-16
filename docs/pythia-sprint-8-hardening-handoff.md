# Pythia Sprint 8 Production Hardening Handoff

## Authentication and Tenancy

Pythia supports tenant bearer-token enforcement. Production operators set:

```text
PYTHIA_REQUIRE_AUTH=true
PYTHIA_API_CLIENTS=[{"token":"<secret-token>","client_id":"chimera-production","consumer":"chimera","tenant_id":"tenant-a","scopes":["engine:read","tasks:submit","tasks:read","tasks:cancel","telemetry:read","capability:storyboard.analyze"]}]
```

`PYTHIA_API_CLIENTS` is a server-side secret. Do not put it in Chimera
source, browser storage, request payloads, logs, or committed environment files.
Chimera sends the token only as `Authorization: Bearer <token>` from its trusted
backend.

Each tenant can access only its own tasks and artifacts. Endpoints require
scopes (`engine:read`, `telemetry:read`, `tasks:submit`, `tasks:read`, or
`tasks:cancel`), and task submission also requires
`capability:<capability-id>`. Missing or invalid credentials receive `401`;
missing scope or capability authorization receives `403`; a tenant or global
capacity limit receives `429`.

## Structured Errors

Every Engine API response includes `X-Pythia-Request-Id`. Errors have this
shape:

```json
{
  "error": {
    "code": "capability_forbidden",
    "message": "This tenant is not authorized for the requested capability",
    "request_id": "..."
  }
}
```

Chimera should show a recoverable state, retain the request ID for support, and
keep authoring, preview, validation, and export available when Pythia is
unavailable or returns an error.

## Limits and Persistence

`PYTHIA_ENGINE_MAX_REQUEST_BYTES` controls request-body size. Tasks are also
limited by tenant active-task policy and Pythia provider capacity. Capacity is
released when a task is cancelled, completes, or fails.

Set `PYTHIA_ENGINE_STATE_DIR` outside the repository for durable task/artifact
state and a redacted `audit.jsonl`. On restart, interrupted work is marked
failed; completed artifacts remain available to the original tenant. Audit
records omit request bodies, API keys, provider credentials, and artifact
payloads.

## Provider Health

`GET /health` includes provider health and active-task count. `/providers` and
`/telemetry` remain diagnostics only; Chimera must not select providers or
interpret telemetry as a durable audit ledger.

## Required Chimera Work

1. Store and send a Pythia bearer token only from the trusted backend.
2. Map `401`, `403`, `413`, `422`, `429`, and `503` to recoverable UI states.
3. Capture `X-Pythia-Request-Id` with support diagnostics.
4. Keep the editor usable if Pythia is offline or a task is interrupted.
5. Add administrator visibility for capability authorization, provider health,
   and tenant-safe diagnostics.