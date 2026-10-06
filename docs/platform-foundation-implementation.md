# Platform foundation implementation

Implemented after the 2026-10-06 qualification/readiness review. Selected pilot direction: adapter-first identity, one organization per installation, guests disabled. Local/offline authoring remains the supported default; a production identity adapter and collector transport are not supplied or silently enabled.

## Identity and permissions

`SessionAdapter.authenticate()` is an installation-startup integration boundary. It must verify credentials/signatures, issuer, audience and revocation before returning `AuthenticatedSession`. Chimera additionally requires an unexpired, timezone-aware session, matching team deployment/installation, and an active known installation user. Display names come from the directory rather than session labels. Register the adapter using `configure_session_adapter()` in trusted startup code. HTTP requests cannot register adapters. Without registration, adapter/OIDC/SAML configurations fail closed; Encarta continues to fail closed until its real validation contract exists. Local identity cannot impersonate a team actor. Multiple organizations and guest review are rejected by the pilot runtime.

Every API route has an explicit named action; new/unmapped routes and unknown actions deny by default. Project actions require matching installation ownership and project membership, an assigned team's membership, or ownership with an author/designer organization role. Unassigned team roles do not grant access across projects. Export and approval are separate from read permissions; administrators are not automatically content approvers. Metadata-only administrators cannot read or export content. Lists, My Work and Project Health filter project scope, and administrative audit access is separate. Membership grants record actor/time; legacy records retain unspecified grant provenance rather than inventing timestamps.

## Actor and audit boundaries

Request context binds a server-generated correlation ID and verified actor through async handlers, sync storage calls and dependency cleanup. Project creation, review actions and proposal decision history retain actor/installation/display snapshots. The metadata writer preserves those ownership values. Successful mutating API actions and exports emit classified events with actor/correlation context; denied or failed requests do not emit success events. Membership/policy changes are security events, even when optional analytics are disabled.

Backup restore preserves the target project's installation/owner and authoritative live audit/queue state. Imported audit history is retained under `history/` as evidence; it cannot replace live security history or inject delivery jobs. Audit reads filter installation scope. Metadata uses an allowlist and excludes document contents, learner responses and provider prompts.

## Tracking, retention and recovery

Persisted installation policy controls collection mode, anonymous analytics and retention. Environment mode is used only when bootstrapping an installation without a persisted policy; the environment transport URL is not a credential and does not activate a sender. Product events are suppressed when tracking is disabled; security/operational audit remains. Anonymous product events remove actor/project/display identifiers and use a separate correlation ID with a narrower metadata allowlist.

Audit append and queue changes use thread/process locks, file flush/fsync and atomic replacements. Files receive owner-only mode bits on POSIX; Windows production deployment must provision equivalent directory ACLs. The application exposes no audit-edit route, and restore cannot overwrite audit state. Filesystem administrators remain trusted operators; this is not a WORM/tamper-proof archive claim.

Delivery claims a recoverable inflight file while permitting new records during network calls. Retry uses capped backoff; exhausted events move to a durable dead-letter file and can be requeued with `retry_exhausted()`. A delivery acknowledgment must return the event ID. `IdempotentEventReceiver` persists receipts, accepts retries of the identical event and rejects ID reuse with a different payload. A real collector transport must authenticate both sides and return an ID only after durable/idempotent acceptance; no network transport is auto-configured. Retention runs on audit writes/reads and can be invoked explicitly for maintenance; pending/dead-letter delivery is not discarded by audit-file cleanup.

## Verification and deployment gates

The backend suite includes HTTP tests for reviewer denial, cross-project/installation access, management filtering, metadata-only administrators, disabled/expired/unconfigured sessions, actor/correlation attribution, successful/failed export audit, policy audit with analytics disabled and restore ownership/history preservation. Delivery tests cover concurrent recording, interrupted claims, retry due times, receipts, dead-letter recovery, redaction/anonymity and retention. CI installs `backend/requirements-dev.txt`, verifies retained qualification checksums, runs the backend suite, builds the frontend and exercises all three browsers.

Remaining deployment choices: real provider/token/revocation contract and provisioning, collector authentication/trust/data residency, and administrator-approved retention/content-visibility settings. The selected single-organization/guests-disabled direction does not approve those remaining settings. Team enablement requires provisioning the directory and configuring a real verified session adapter; central delivery requires a trusted transport. Production permissions/ACLs and collector residency must be qualified in that environment.

External-review design follows this foundation's acceptance checks; shareable links are not implemented here. Richer media, larger-course/suspend-data qualification and onboarding's maintained-consumer/pilot/screen-reader/asset-rights gates remain separate.
