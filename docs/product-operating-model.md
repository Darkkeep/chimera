# Chimera Product Operating Model

The 2026-10-06 foundation execution uses adapter-first identity, one organization and guests disabled, as selected by the installation owner. See [implementation and acceptance boundaries](platform-foundation-implementation.md); a real provider and collector trust/residency contract remain deployment gates.

Status: Direction agreed 2026-09-30

## Product boundary

Chimera is a team authoring and publishing platform for learning content. Learners consume published SCORM or other exported course content, but they are not Chimera platform users in the first team-platform release.

The platform must support these roles:

| Role | Primary responsibilities |
| --- | --- |
| Author | Import, edit, organize, validate, and publish storyboard content. |
| Reviewer | Play a fixed revision, comment, reply, resolve feedback, and request changes. |
| Instructional designer | Shape learning objectives, assessment design, accessibility, media, and learner experience. |
| Administrator | Manage users, teams, projects, policy, integrations, retention, and audit access. |

One person may hold more than one role. Role permissions must be explicit and must not be inferred from the display name currently stored on a review comment.

## Deployment modes

The same product model supports two policy modes:

- **Team mode:** centralized identity, teams, project membership, role-based permissions, audit history, and centralized product events.
- **Restricted single-user mode:** one local operator, no external sharing, no cross-user analytics, and policy-controlled event collection. This mode is appropriate when deployment policy prohibits shared identity or centralized tracking.

Single-user mode is a deployment constraint, not a separate product fork. Data structures and APIs should retain stable actor and organization concepts so a later team deployment does not require rewriting project history.

## Build strategy: single-user now, multi-user-ready by design

The immediate product can remain local and single-user while the architecture is designed against the team-platform blueprint. The goal is to defer operational complexity, not to defer the contracts that prevent migration pain.

### Build now in single-user mode

- Keep the current local filesystem storage and local development workflow.
- Use a deterministic local actor such as `local-user` for authored changes and review actions.
- Use a deterministic local installation or organization such as `local-installation`.
- Keep centralized tracking behind a local event sink or disabled collector, controlled by policy.
- Expose only one effective membership with full local-authoring permissions.
- Continue to make exports, backups, enhancement jobs, and review work without requiring network identity.

### Preserve for the future team platform

- Every mutable record should have a stable owner or actor reference where ownership is meaningful.
- Every project should have an installation or organization reference, even when the local value is implicit.
- Every review, proposal decision, export, restore, and publication action should have an actor reference and correlation ID available in its event shape.
- Use opaque IDs rather than usernames or email addresses as relationships.
- Keep display names as snapshots for historical readability, never as authorization keys.
- Version API payloads and event schemas before introducing external consumers.
- Keep authorization checks at service boundaries, even when the single-user policy currently allows every action.
- Separate project content from identity, event, and delivery storage so a later centralized service can replace those adapters independently.

### Migration boundary

The single-user implementation should have explicit adapters for:

1. `ActorContext`: resolves the current actor and installation.
2. `AuthorizationPolicy`: answers whether an actor may perform an action.
3. `EventSink`: records or queues classified events.
4. `IdentityDirectory`: resolves users, teams, and memberships.

Single-user mode can provide local implementations of these adapters. Team mode can later provide authenticated and centralized implementations without changing storyboard, review, proposal, or export business logic.

Do not add fake login screens or pretend collaboration to the single-user release. Instead, make the seams real, keep the local implementations small, and add contract tests that prove the same business operation carries actor, installation, permission, and event context in both modes.

### Sequenced releases

| Release | User-visible goal | Foundation delivered |
| --- | --- | --- |
| Single-user foundation | Reliable local authoring, review, enhancement, backup, and export | Local actor/install context, policy adapter, event schema, audit-ready action boundaries |
| Team pilot | Invite teammates to selected projects | Authentication adapter, organizations, memberships, project permissions, centralized event delivery |
| Team operations | Manage work across projects and teams | My Work, Project Health, workload views, audit search, retention and policy controls |
| External review | Share fixed revisions safely | Review sessions, invitations, expiry, reviewer permissions, concurrency handling |

The single-user foundation now includes a local identity-provider adapter, persisted roles and project memberships, policy controls, project health, My Work, and bounded audit activity. External authentication remains disabled until an enterprise provider is selected and configured.

## Core entities

The platform foundation should establish these durable concepts before broad workflow expansion:

- Organization or installation: the policy and billing/security boundary.
- User: an authenticated human identity with status and profile metadata.
- Team: a group that can own projects and receive work.
- Membership: a user's role within an organization or team, including grant source and timestamps.
- Project membership: project-level access when team access is too broad.
- Project: the existing storyboard and all associated assets, references, proposals, comments, builds, and revisions.
- Review session: a fixed project revision exposed to reviewers with explicit permissions and expiry.
- Audit event: an immutable record of security-sensitive and publication-sensitive actions.
- Product event: a privacy-classified usage event for operational and product analysis.

Project and review records should reference stable user IDs while retaining a display-name snapshot for historical readability.

## Permission baseline

The first authorization matrix should distinguish actions rather than expose a single project-wide edit switch:

| Action | Author | Reviewer | Instructional designer | Administrator |
| --- | ---: | ---: | ---: | ---: |
| View assigned project | Yes | Yes | Yes | Policy-dependent |
| Edit storyboard | Yes | No | Yes | Policy-dependent |
| Comment and reply | Yes | Yes | Yes | Yes |
| Resolve review threads | Yes | Yes, if granted | Yes | Yes |
| Submit enhancement job | Yes | No | Yes | Policy-dependent |
| Approve enhancement | Yes | No | Yes | No by default |
| Export or publish | Yes, if granted | No | Yes, if granted | Yes |
| Manage project membership | No by default | No | No | Yes |
| Manage organization policy | No | No | No | Yes |
| View audit and usage data | Own activity | Own review activity | Project activity | Organization scope |

Approval and publication permissions should be separable from editing permissions. An administrator should not automatically become a content approver.

## Tracking policy

Tracking is centralized in team mode and must be privacy-classified at collection time:

- **Security and audit events:** sign-in, membership changes, permission changes, project sharing, revision publication, export, restore, enhancement approval, and administrative policy changes. These are immutable, access-controlled, and retained according to organization policy.
- **Operational events:** request failures, job durations, package build outcomes, queue health, and storage usage. These support reliability and contain no learner activity.
- **Product events:** project creation, import completion, review activity, validation outcomes, and workflow progression. These should use project and user identifiers, not learner identities or learner answers.
- **Never collect by default:** learner names, learner assessment responses, SCORM suspend data, raw provider prompts containing restricted content, or document contents solely for usage analytics.

Every event should include an event name, event version, occurred-at timestamp, organization ID, actor ID when known, project ID when relevant, correlation ID, deployment mode, and a redaction-safe metadata object.

The centralized tracking service should support delivery retry, idempotency keys, schema versioning, retention controls, export for administrators, and a local/offline queue for disconnected deployments. Analytics must not be required for authoring, review, or export to function.

## Management views

The first management surface should answer operational questions rather than become a generic dashboard:

1. **My work:** assigned projects, review requests, pending approvals, unresolved comments, and blocked releases.
2. **Project health:** revision, readiness blockers, pending proposals, review status, build history, and last activity.
3. **Team workload:** projects by status, overdue review requests, ownership gaps, and approval bottlenecks.
4. **Administration:** members, roles, policy mode, integrations, retention, audit events, and tracking status.
5. **Product operations:** aggregate workflow conversion, failure rates, latency, and storage/cost trends without learner data.

## Recommended implementation order

1. Define organization, user, team, membership, actor, and event schemas.
2. Add authentication and session ownership behind a deployment-mode boundary.
3. Add project membership and role-based authorization to every mutating and sharing route.
4. Replace free-form reviewer labels with authenticated actor references while preserving old records.
5. Add immutable audit events for permissions, review, approval, restore, and publication actions.
6. Add a centralized event collector with local queueing, retries, redaction, and retention settings.
7. Build My Work and Project Health before organization-wide analytics.
8. Add team workload and administration views after permission enforcement is proven.

## Decisions still required before implementation

- Identity provider: built-in accounts, enterprise OIDC/SAML, or an adapter-first combination.
- Organization tenancy: one organization per deployment, or multiple organizations in one service.
- Default retention for audit and product events.
- Whether administrators can inspect project content or only metadata and audit records.
- Centralized tracking hosting boundary and data residency requirements.
- Whether review links may support unauthenticated guest reviewers, controlled invitations, or authenticated users only.

## Installation-time configuration

These decisions are installation choices, not per-project settings. The installer or deployment administrator must select them before team mode is enabled:

- Identity provider: local, built-in email/password, Encarta, OIDC, SAML, or a configured adapter.
- Tenancy: one organization per installation or multiple organizations.
- User provisioning: invitations, directory synchronization, or both.
- Centralized tracking mode and whether analytics retain project/user identity or are organization-anonymous.
- Review access: authenticated users, controlled guest invitations, or no external review.
- Administrator content visibility, audit retention, and data residency.

The selected values are represented by `OrganizationPolicy`, persisted with the installation identity directory, and exposed through `GET /api/installation/config`. Project records must not override these choices. Invalid combinations are rejected at configuration validation time, such as non-local identity in single-user mode, guest review without guest approval, or identified analytics when tracking is disabled. Encarta is scaffolded as the planned Team Mode provider but remains fail-closed until its real authentication contract is implemented.

Local, Encarta, and darkrogue.io installation profiles are described in the [authentication deployment guide](authentication-deployments.md). The darkrogue profile provides built-in password sessions, operator-managed recovery, project membership/role enforcement, filtered read models, and authenticated review links. Profile environment settings override stored identity selection without modifying the local workspace; hosted profiles require a separate workspace. Live Linux/Nginx qualification awaits server details; Encarta verification awaits its integration contract.
