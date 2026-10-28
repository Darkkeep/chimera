# Guided review practice: pinned core consumer audit

2026-10-18. Chimera package/provenance and sister-consumer review only. Optional
synthetic practice is not formal review, owner acceptance or product qualification.
Manteion owns its React implementation and browser/build evidence.

## Exact local artifact

Package `@guided-workflows/onboarding`0.1.1; local archive
`vendor/onboarding/guided-workflows-onboarding-0.1.1.tgz`.
SHA256 `60c1a8670f4311a45653373744c2ec1f7a18e1b5a99dac221cf88ddf5e873bff`.
The included package metadata declares private:true, type:module and ISC. Included
LICENSE retains Darkkeep2026 copyright and the permission/warranty notice.
Declared upstream source is `01efd81d12116a57b14adf7c94e73c53fae04f60`, as recorded
in [Chimera provenance](../vendor/onboarding/README.md); this source association is
inherited provenance, not a fresh upstream fetch or reproducible-build proof.

Manteion can reuse exact unmodified archive members core.js, core.d.ts and LICENSE
in a pinned vendor directory without changing its unrelated staged manifests.
Its copied archive and member-byte verifier must retain the full license and
provenance, enforce the archive hash and compare extracted members exactly. Journey
configuration/React rendering stay outside the vendor; maintain fixes upstream,
not by silently editing the pinned core. This does not establish public package
API stability or general distribution/asset-rights qualification.

## API facts and adapter review findings

The headless module exports createJourney with journey/version/steps, scoped
adapter context/optional abortable preparation, optional storage, namespace and
scope. Its controller exposes snapshot/subscribe/start/signal/next/skip/block/
pause/setScope/dispose. Event advancement requires active state, matching scope,
matching event type and any step accept predicate. These are workflow mechanics,
not evidence of a human decision or trusted domain authority.

The engine publishes full internal state including scope and message. It does
not itself restrict storage to selectors. Adapter exception messages can therefore
enter storage unless a wrapper strips them. Manteion's reviewed wrapper allowlists
only version, status, index, completed and skipped in sessionStorage. Drafts,
source bodies, decisions and free-text practice reasons are excluded. The storage
key still contains encoded workspace/user scope; encoding is not a privacy or
authorization boundary. Storage access must remain deferred/caught for unavailable
browser storage and SSR.

snapshot() returns a fresh object. A React useSyncExternalStore adapter must cache
the last published snapshot; directly using controller.snapshot as getSnapshot
can cause repeated renders. A disposed controller cannot be reused: unsubscribe/
unmount/StrictMode cleanup must dispose and clear it so a later subscription
constructs a fresh controller. Scope changes must not use carry:true across actors
or workspaces. The inspected preview keys its practice component by the current
checkpoint scope, derived from the authenticated workspace/user pair, resetting
in-memory answers on scope change.

Practice uses a separate `manteion.synthetic-review-practice.v1` namespace and
source-review journey/version1. The current answer facts and practice reasoning
stay in component memory. They are passed only to the practice accept predicates;
no real conversation/task/assignment endpoint or domain review event is involved.
Advance journey version when fixture/criteria meaning changes. Completed/skipped
local history is user-editable and can never confer acceptance or qualification.

The inspected adapter addressed the initial persistence and React lifecycle
findings: allowlisted storage, cached external-store snapshots, lazy controller
creation/recreation and dispose on unsubscribe. Its fixture-only checks concern
source support, user assertion versus evidence, limits and a next action/reason.
A reason-length check is explicitly a supplied-reason check, not reasoning-quality
assessment. Outcomes remain Practiced or Ended with skips, not approved/accepted.
No blocking issue remained in this read-only working-tree review. Manteion owns
final integration, browser/accessibility checks and the exact implementation commit.

## Verification and limits

From Chimera:

```powershell
npm run verify:onboarding:artifact
```

Passed: pinned archive checksum and installed core/DOM/test-helper exports.
Additionally executed Manteion's `scripts/verify-onboarding-vendor.py`: pinned
archive and exact unmodified core/declarations/license passed. Read the actual
archive core.js/core.d.ts/package metadata/license and current React/journey/
checkpoint integration; no upstream code or UI was edited by this audit.

Manteion's added browser scenario was inspected for explicit wrong-answer recovery,
pause/reload/resume, skipped outcome, exact storage-field allowlist and no POST/task
mutation assertions. Its execution and final commit are sister-owner evidence,
not claimed as a Chimera browser run. No frontend code changed here, so no build
or broad runtime suite was rerun for this documentation-only slice.

Chimera baseline `74c6af5083c9ce2390ff21de89a7b644b9a927e8`; unrelated staged
README and two dirty historical handoffs preserved. Next: Manteion commits/tests
its exact consumer integration and records practice-only limits. Continue source/
CSV capability work separately; completing this walkthrough cannot close G1-G6.
