# External review milestone design

Status: design deliverable; no review links, routes or invitations are enabled. Prepared after local acceptance of the platform foundations (83 backend checks, three-browser local suite and frontend build). Hosted foundation verification remains a merge prerequisite. The selected pilot is adapter-first identity, one organization and no guests.

## Outcome and boundaries

An author shares a fixed saved revision with named, authenticated reviewers. Reviewers can play that revision and perform only explicitly granted comment/reply/resolve actions. They receive no project membership, authoring, enhancement, approval, export or publication access. Editing the live storyboard never changes the shared revision. Sharing a new revision creates a new session; it does not retarget an existing session or move its comments.

The first pilot uses authenticated users provisioned into the installation directory. It does not implement public links, anonymous guests, email delivery or richer media. Invitation records are access grants, not messages automatically sent to third parties. Hosting/provider and policy choices must be configured before implementation is exposed to reviewers.

## Data contract (proposed version 1)

| Record | Required fields and invariants |
| --- | --- |
| ReviewSession | Opaque ID, schemaVersion, installationId, projectId, sourceRevision, snapshotId/digest, creatorActorId/display snapshot, createdAt, expiresAt, state (`draft`, `active`, `closed`, `expired`, `revoked`), version/ETag. No mutable live-content pointer. |
| ReviewSnapshot | Opaque ID, sourceRevision, immutable sanitized storyboard, manifest/digests for every included asset/resource, creation actor/time. Contains only selected reviewer-visible content. Snapshot files are read-only through the service. |
| ReviewGrant | Session ID, known reviewerActorId, explicit action set, grantor actor/time, expiresAt, revokedAt, version. Installation and session identity must match. An opaque routing URL is never a bearer credential. |
| ReviewThread | Opaque ID, session/snapshot IDs, scene ID, sourceRevision, body, author actor/display snapshot, createdAt, resolved state, version. Optional asset/time anchor must reference that snapshot. |
| ReviewReply | Thread/session IDs, author actor/display snapshot, createdAt, body, idempotency key. Cannot attach to a thread in a different session. |
| ReviewDecision | Thread/session IDs, resolve/reopen action, actor/display snapshot, occurredAt, expected thread version, correlationId. Append-only history preserves prior decisions. |

Store sessions/snapshots separately from live project content. Every record is installation-scoped. Session expiry bounds every grant even if its individual expiry is later. Closed sessions are read-only to their authorized owner; reviewers lose write access. Revocation and expiry deny both content and asset access immediately. A retained history record does not grant current access.

## Snapshot creation and publication

1. Require explicit `review.session.create` plus permission to read/share the source project, with an expected saved revision (`If-Match`). Metadata-only administrators cannot create snapshots or share content.
2. Hold the storyboard transaction while reading the revision and identifying included content. Copy referenced media and explicitly selected reviewer resources to staging; record hashes and validate every reference before activation.
3. Exclude unused assets, original decks, backing reference originals unless explicitly selected, provider settings/prompts, pending proposals, answer keys, author-only notes/directions, backups, identity records and audit history. Use the learner-preview rendering boundary as the default reviewer content boundary.
4. Commit an immutable snapshot and draft session atomically. On copy/validation failure, remove staging and expose no active URL or partial snapshot.
5. The author reviews the sharing summary (revision, included resources, reviewers, grants and expiry), then explicitly activates the session. Activation produces a security audit event. No automatic email/notification is part of this pilot.

Existing assets changing or disappearing after activation cannot change the snapshot. Snapshot retention follows installation content policy; open sessions cannot depend on live project assets. Purge must revoke access first and honor any configured audit/legal retention requirements.

## Authorization and session lifecycle

| Action | Author/owner | Invited authenticated reviewer | Metadata-only administrator |
| --- | --- | --- | --- |
| Create/activate review session | Explicit sharing grant and project content access | No | No |
| Read snapshot/selected assets | Project content access plus session owner access | Active unexpired `view` grant | No |
| Comment/reply | Granted actions | Separate `comment`/`reply` grants | No by default |
| Resolve/reopen threads | Explicit resolve grant | Only if explicitly granted | No by default |
| Grant/revoke reviewers or close session | Session-management grant | No | Only an explicit metadata/session-management grant; cannot add content access implicitly |
| Audit metadata | Subject to audit permission | Own authorized review history only | Organization audit permission |
| Edit live storyboard, approve enhancement, export/publish | Existing separately authorized project actions | No through review access | No implicit grant |

Resolve the verified actor using the installed provider on every request. Resolve review grants separately from project roles: a review invitation must not add a project membership. Author session-management permission is not automatically conferred by ordinary project read access. Administrative revocation does not imply the right to inspect content or approve it.

Only `active` sessions accept reviewer writes. `closed` and `revoked` cannot be reactivated; a new review requires a new session. Expired grants require a deliberate new grant, audited separately. Enforce expiry using server UTC time for all reads, writes and media requests; UI countdowns are advisory. Provider session expiry/revocation is independent and may terminate access sooner.

## API and transport boundary

Proposed, unimplemented routes under `/api/v1/review-sessions`:

- `POST /`: create draft from project ID and expected revision; require idempotency key.
- `POST /{id}/activate`, `POST /{id}/close`, `POST /{id}/revoke`: explicit state transition with expected session ETag.
- `POST /{id}/grants`, `DELETE /{id}/grants/{grantId}`: manage named reviewers, action grants and expiry; require owner/session-management permission.
- `GET /{id}/snapshot`, `GET /{id}/assets/{assetId}`: authenticated, session-authorized fixed content. Never reuse a live project asset route or infer access from an ID alone.
- `GET /{id}/threads`, `POST /{id}/threads`, `POST /{id}/threads/{threadId}/replies`, `POST /{id}/threads/{threadId}/decision`: enforce the session action and thread/snapshot association.

Return 401 for missing/expired provider authentication, 403 for denied permitted installation actions, 404 for inaccessible session/resource identifiers where existence would leak scope, 409 for incompatible state, and 412 for stale ETags. Error payloads must not disclose content, other reviewers or installation identities. Use explicit action mappings; unmapped routes remain denied.

Public hosting must use TLS, a configured allowed origin and authenticated session transport supplied by the provider integration. If cookie authentication is selected, require secure/HttpOnly cookies and CSRF protection for writes. Do not place authentication tokens in review URLs, logs or referrers. Asset routes must enforce grant/expiry on every fetch and must not offer publicly cached content; require private/no-store caching as appropriate and disable unintended cross-origin embedding. Validate attachment MIME types and response headers. Signed storage URLs, if later selected, must be short-lived and revocable without granting broader object-store access.

## Concurrency and retry behavior

Use a repository transaction/compare-and-swap for session state, grants and thread decisions. Require ETags for activation, revoke/close and resolve/reopen. A stale resolver gets 412 plus safe refresh instructions; no silent last-write-wins resolution. Recheck state/grant eligibility inside the write transaction so revocation racing with a comment cannot authorize a write after revocation commits.

Creation/comment/reply idempotency keys are scoped to installation, actor, session and operation. The same key/payload returns the recorded result; the same key with a different payload returns 409. Persist operation result and content mutation together. Replies are append-only; comment-edit/delete semantics require a separate design decision rather than overwriting history. Simultaneous distinct replies remain distinct and order by stable timestamp/ID.

Comments remain anchored to the original session revision even when live scenes are reordered or deleted. Authors may compare a review with the live project and see “outdated/deleted in current draft” markers, but review content and discussion remain recoverable until the selected retention policy removes them. Starting enhancement from review feedback uses the existing proposal flow and still requires separate author approval; reviewers cannot trigger provider jobs by possessing a comment grant.

## Audit, privacy and deployment prerequisites

Security events: snapshot creation/activation, grants/revocation, closure/expiry, and resolve/reopen decisions. Preserve verified actor/display snapshot, installation, session/project/revision IDs, correlation and event version; record successful state changes after commit. Failed attempts may produce redaction-safe denial events but never success events. Add session/grant/snapshot fields to the reviewed metadata allowlist; do not bypass the foundation's allowlist to collect comment bodies or document text.

Audit visibility, content retention and optional product analytics stay separate. Disabled analytics cannot disable required security audit. Anonymous analytics must not expose reviewer/project IDs or response contents. A central collector requires authenticated durable receipt/idempotency and approved residency; outage cannot prevent reading a retained snapshot or saving a permitted comment to durable local state.

Before a pilot, installation administration must supply the real session adapter and provisioning contract, trusted host/origin/TLS configuration, content-visibility/retention choices and any collector trust/residency settings. Guests remain disabled. Foundation tests and design approval do not certify a particular production provider or deployment.

## Acceptance matrix

| Scenario | Required observation |
| --- | --- |
| Edit/reorder/delete live scenes after activation | Reviewer snapshot and asset hashes unchanged; comments remain attached to the original scene/revision. |
| Missing asset or revision change during creation | No active/partial session; explicit validation/conflict response; no successful activation event. |
| Invite actor to session A | Only A's selected content/actions are accessible; no live project membership, backups, answer keys, proposals or provider jobs become available. |
| Other project/installation or swapped scene/asset/thread IDs | Denied without content or existence leakage. |
| Expired provider session, expired grant or revoked session | Content, comments and asset fetches denied, including already-open clients making new requests. |
| Reviewer edit/export/approval/activation request | Denied; no source mutation and no misleading success audit. |
| Metadata-only administrator | Can perform specifically permitted metadata/revocation/audit operations; cannot read/share project or snapshot content. |
| Two replies concurrently | Both durable, one result per idempotency key; no lost reply. |
| Duplicate retry/different payload with same key | Same result for exact retry; 409 for payload reuse. |
| Resolve/reopen with stale version | 412; no silent overwrite; decision history remains intact. |
| Revocation racing with comment | Transaction order determines result; no write authorized after committed revocation. |
| Collector outage/restart | Local permitted operation remains durable; pending security events recover without duplicate collector records. |
| Disabled/anonymous analytics | Required audit preserved; prohibited identity/content absent from optional analytics. |
| Reload, keyboard and assistive technology use | Review navigation/focus and comment state work; manual screen-reader review is required for the new UI before rollout. |

## Implementation sequence

1. Approve deployment/provider and content-policy settings; add schema/versioned repository contracts and authorization tests.
2. Implement atomic immutable snapshots and session/grant lifecycle with negative access tests.
3. Implement thread/reply/decision concurrency and idempotency, preserving revision context.
4. Implement authenticated review playback/comment UI using existing renderer semantics and a dedicated design review; qualify focus, keyboard, screen-reader and actual deployment behavior.
5. Run the acceptance matrix with named pilot reviewers, record exact build/provider/browser/host details, then decide rollout separately.

Structured placement, shared/course-wide media, video, OCR, provider-specific generation controls and onboarding rollout expansion remain separate follow-up work.
