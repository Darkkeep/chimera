# Platform foundation readiness: 2026-10-06

Word rendering/editability and representative SCORM 1.2 human qualification are recorded in the [release evidence](release-qualification-2026-10-06.md). This audit starts the next foundation milestone in the [operating model](product-operating-model.md); it does not certify team deployment or external review.

The existing local implementation has actor/install IDs, persisted identity and membership records, an action-role map, a global API authorization dependency, policy fields, local audit files and a retry queue. All 16 existing auth, identity and platform-foundation tests passed. Those tests principally establish local behavior and adapter contracts, not isolation between authenticated team users.

## Ordered foundation work

| Order | Source finding | Required result before external review |
| --- | --- | --- |
| 1. Identity and installation policy | `auth.get_identity_provider()` handles Encarta explicitly and otherwise returns the local provider, including for OIDC/SAML/adapter selections. Encarta itself fails closed. The policy's deployment mode does not automatically replace the stored actor context. | Select the provider/tenancy installation contract; unsupported providers and inconsistent team/local configurations must fail closed. Prove authenticated subject, installation ownership, disabled-user rejection and session lifetime with adapter contract tests. Preserve ordinary local/offline authoring. |
| 2. Membership and action permissions | `LocalIdentityDirectory.roles_for()` combines all team roles with project roles without resolving team-to-project scope. `RoleBasedAuthorizationPolicy` permits every action in single-user mode. `_request_action()` maps every GET to `project.view` before audit/export-specific rules. Project lists, health and My Work enumerate all projects. | Bind access to the actual installation/project membership. Distinguish read, export/publication, approval and administrative audit access; filter management/list responses. Enforce administrator content-visibility policy. Prove cross-project/installation denial and reviewer export/approval denial through HTTP tests. Single-user full access remains intentional. |
| 3. Actor attribution and audit policy | Several storage operations default to `LOCAL_ACTOR`; only selected project/review handlers pass resolved actor context. Policy and membership updates write identity state without an associated audit event. Events default to operational classification, and export/restore attribution is not comprehensively carried through service boundaries. | Pass request actor and correlation context through every security/publication-sensitive operation, including membership/policy, proposal decisions, export and restore. Classify events explicitly, retain historical display snapshots, and prove denied/failed actions do not produce misleading success events. Establish protected append-only storage and the selected retention policy. |
| 4. Tracking and delivery policy | `DurableEventSink` uses environment-derived delivery policy, independently of persisted `OrganizationPolicy`. Queue exhaustion removes entries; `flush()` rewrites the queue without concurrent-write protection. Retention, metadata redaction, anonymous analytics and receiver-side idempotency are not enforced by this sink. | Establish one effective policy source, classified metadata allowlists/redaction and anonymous analytics behavior. Keep audit collection independent of optional product analytics. Define collector trust/residency, atomic queue operations, retry/backoff, idempotency and recoverable exhausted deliveries; enforce retention. Prove offline authoring/export remain usable. |

These are readiness gaps in the code inspected at `3af942d`, not newly demonstrated failures of the qualified local authoring release. Avoid presenting the existing scaffolding as a production team platform.

## External-review milestone boundary

Begin external-review design after the ordered foundation acceptance checks are satisfied. The design must specify:

- A fixed, immutable source revision and only its intended review assets/resources.
- Authenticated reviewers or explicitly approved controlled invitations; guest access remains disabled by default.
- Separate view/comment/reply/resolve grants, with no implicit editing, enhancement approval or publication rights.
- Invitation expiry, revocation and session handling, with installation policy controlling the choices.
- Concurrent comment/resolve behavior, idempotency, outdated/deleted-scene context and actor-attributed audit events.
- Negative acceptance cases for other projects, expired/revoked access, prohibited actions and revision substitution.

Deployment choices still require a provider contract, tenancy, administrator content visibility, audit retention, collector residency and permitted review access. The persisted local defaults are not evidence that these team choices have been settled.

Structured placement, shared/course-wide media, video, OCR and provider-specific generation controls remain separate follow-ups. Onboarding's second maintained consumer, novice-author pilot, manual screen-reader review and asset-rights gates remain unchanged; neither this audit nor passing CI establishes API stability or broader rollout readiness.
