# PR54 isolated release qualification — November 23, 2026

This packet qualifies an unmerged candidate against disposable staging data.
It is not production authorization or Founder usability acceptance.

## Candidate and correction

Original PR54 head `00e09d73eb9f68c96c62d64cf77c18fa61e0ecd9`, stacked on
PR53 `86f7ed49ce98aae930149f2aa736c3b1d852e719`, matched the supplied handoff.
Both PRs were open, draft and unmerged when checked. Original checks run
45208246699 and packaging run 45208246519 passed.

Original artifact 14835222463, 254317084 bytes:

- GitHub ZIP SHA-256: `185c19b214e9de9b53cd1d7a7805031bc490b4f5ae1e027b39f1f5d4ea8785b4`.
- Inner tar SHA-256: `d393a63cd10ea6bf131a81330f6e4396efe6eb2442e8117e8dae2fac6c7cfbe5`.
- ZIP integrity, adjacent SHA256SUMS, manifest identity and all 75 packaged backend
  Python modules versus the exact Git commit passed.

Hosted staging reproduced a genuine defect: a reviewer-only account could read
and comment, but POST review-approval returned 403 for `project.mutate` before
the endpoint's `review.approve` guard. The single-user CI test did not expose this.
Correction `4a38e4952de20def973b5dcd91cda3f4dfe5b1cf` maps that exact POST to
`review.approve`, preserving independent endpoint enforcement. A hosted-session
regression verifies request changes, approval, denial of scene edits and immediate
revocation. The 38 focused password-auth/review tests passed locally.

This correction supports the charter's human approval and permission safeguards;
there is no authentication redesign or production modification.

## Host and isolation

Read-only preflight: production active at `8dab8474f5c1911081578240bf845762b9d9b973`
on 127.0.0.1:8000, Pythia active on 127.0.0.1:8001; both health controls passed.
Port 8002 was free. Available disk 87014608896 bytes; available memory 7013020 kB.
No systemd/Nginx configuration referenced `/srv/chimera2-staging`.

Existing staging releases, virtual environments, workspaces, incoming files and
checkpoints were preserved. The new release uses the artifact's portable Python
3.14.4/Node 24.19.0 runtime and hash-pinned offline installer. No runtime rebuild.
The staged ASGI entrypoint mounts the exact prebuilt frontend after API routes;
it lives in staging ops, outside the immutable application release.

Service identity: `chimera2-stage`; dedicated service; 127.0.0.1:8002 only.
Browser access: SSH local forward 127.0.0.1:18002 to remote 127.0.0.1:8002.
Staging-only HTTPS certificate is trusted only by the disposable automated browser
context. No public DNS, firewall, Nginx or production service changes.

Systemd restrictions: IPAddressDeny=any, IPAddressAllow=localhost,
ProtectSystem=strict, ProtectHome=true, NoNewPrivileges=true, PrivateTmp=true,
UMask=0077; writable staging qualification state only. Production/Pythia secrets,
sessions, identity and project files were neither read nor copied. Provider secrets
are absent. No paid generation or provider invocation is part of these tests.

Four independently provisioned builtin hosted/team identities: Author,
Independent Reviewer, Owner Administrator, Unauthorized Reviewer. Each has a
different authenticated account ID and session. No display-name impersonation.
This qualifies builtin team authorization, not DARKROGUE SSO interoperability.

## Reproduction and evidence handling

`scripts/qualification/pr54-hosted.cjs` runs real HTTP/session and Chromium UI
checks against the SSH-tunneled service; no API mocking. Fixture APIs establish
three scenes; project creation, text editing, native branching and reviewer
decisions use UI interactions. It is not entirely UI-only course construction.

`scripts/qualification/pr54-runtime.cjs` runs the exported packages in a standalone
test player with instrumented SCORM API adapters. It does not substitute for LMS
qualification. CHIMERA_QUALIFICATION_OUTPUT selects an ignored evidence directory.
Its private test-accounts.private.json input must never be committed or logged.

Original and replacement candidates, all prior staging state, browser screenshots,
synthetic exports and private account/session inputs are retained outside Git.
Only sanitized summaries are committed. Unrelated canonical worktree modifications
were stashed for the branch switch and reapplied, with the backup stash retained.

## Experience and cmi5

Experience's existing `scripts/qualify-chimera-scorm.ts` was inspected in
`C:/inetpub/darkrogue-experience-operations`. It creates an isolated loopback scratch
database and exercises real import, launch, branching, scoring, completion, resume
and gradebook paths. Its configured database is loopback port 54322, but connecting
returns ECONNREFUSED. Docker's Linux engine pipe is unavailable. No production
Experience data was accessed, and no mocked API is accepted as LMS evidence.
Current-candidate Experience qualification is BLOCKED, including cross-course and
cross-learner runtime isolation. Older November 19 results do not qualify PR54.

Source inspection found SCORM 1.2, SCORM 2004 and standalone exporters, with no
cmi5 package/runtime implementation. cmi5 is UNSUPPORTED and NOT QUALIFIED.

## Audit limits

Receipts bind actor, project, revision, storyboard digest and discussion snapshot;
the ledger is server-owned and excluded from portable archives. Hash chaining
detects unresealed edits. There is no external anchor or signature: an attacker
with ledger write access can recompute an entire chain or truncate its tail without
an external witness. It is not externally immutable evidence or nonrepudiation.

## Final evidence

Qualified application/artifact commit:
`4a38e4952de20def973b5dcd91cda3f4dfe5b1cf`. A later evidence-only commit does not
change this installed source identity or assert that a different binary was tested.

Replacement artifact 14842936793, packaging run
[45226252381](https://github.com/Darkkeep/chimera/actions/runs/45226252381), passed
independent byte-identical builds and offline archive install/exercise:

- GitHub ZIP SHA-256: `9b95b030bbf1ea5dc8b522ad4bb183592378bee690b0d55e0b1116af9f775777`.
- Inner tar SHA-256: `3be027979e2b26ca10177c95374b7e0f5a20f3db57dce4a4a929a7995fb4d9f4`.
- Manifest timestamp: `2026-11-23T17:18:29Z`; all 75 backend modules matched Git.
- Staging's running backend environment and public frontend identity matched this
  candidate. Installer completed without fetching dependencies.

Running unit: `chimera2-pr54-4a38e49-staging.service` (started, not enabled at boot).
Release: `/srv/chimera2-staging/releases/4a38e4952de20def973b5dcd91cda3f4dfe5b1cf`.
Venv: matching SHA under `venvs/`. Ops: `ops/pr54-4a38e49/`.
Fresh data: `state/qualification-pr54-4a38e49/workspace`.
Original PR54 staging unit is stopped; its release, ops and state remain intact.
The earlier `baf876c` staging release and both original workspace trees remain.
The SSH tunnel binds IPv4/IPv6 loopback only; keepalive was added after an idle
SSH connection reset during test setup. No application workaround was introduced.

### Review and security results

PASS — 19 hosted qualification checks in [results.json](qualification/pr54/results.json):
four independent sessions; UI course creation, Studio editing and save; UI native
branching; owner self-approval rejection; author/comment authority insufficient for
approval; unauthorized/revoked reviewer denial; reviewer UI request-changes and
approval; exact actor/project/revision/content-digest receipt binding; all approved
exports; permitted draft export; new/reopened/resolved-comment invalidation;
stale revision rejection; archive restore invalidation; cross-project isolation;
saved course reopen. Author explicitly set the course's stage to in-review.

PASS — a subsequent reply changed the discussion snapshot and blocked release;
resolving a new comment did not restore an old approval.

PASS — ledger tests modified an existing receipt and injected malformed JSON in
this synthetic workspace only. All three approved exporters returned 409 and no ZIP.
The review-status read returned 500 for an invalid chain, failing closed but without
a polished recovery message. Original synthetic ledger bytes were retained privately
and restored after the fault injection. Audit events attributed actual reviewer ID.

PASS — restart of the staging unit retained all 66 workspace files byte-for-byte,
durable sessions and exact storyboard content. Final read-only checks showed the
production PID still 146118 and Pythia PID still 146063, both active and healthy;
the production backup timer remained active. No production project files were read.

### Export and learner runtime results

PASS — SCORM 1.2, SCORM 2004 and standalone approved packages from revision 10:
valid ZIPs, required assets, well-formed IMS manifests for both SCORM profiles,
all referenced files present, exact saved storyboard/branching content.
Package hashes are in [package-results.json](qualification/pr54/package-results.json).

PASS — isolated Chromium test-player launch, branching and assessment for all three
formats. Both SCORM adapters recorded initialization, persisted score 100 and passing
status; 2004 also recorded completion=completed and success=passed. Close/fresh launch
resumed the second scene for both profiles. Standalone resume was not tested.
See [runtime-results.json](qualification/pr54/runtime-results.json).

PASS — approval-required checkbox and real UI download sent `approved=true` and
returned 200 for the freshly approved revision 11 after the archive-restore test.
The later discussion-reply negative required fresh review again. A final UI-only
correction cycle then recorded request changes, edited the visible scene text,
verified that the independent reviewer actually saw that correction, and approved
revision 13. All three approved exports were downloaded through UI and exercised
again in the test player. Final [package-results.json](qualification/pr54/package-results.json)
records revision 13; [package-results-r10.json](qualification/pr54/package-results-r10.json)
preserves the earlier packages' identities. No package is relabeled as another revision.

The packaged runtime checks use local SCORM adapters, not Experience or certification.
Experience import, learner launch, gradebook, persisted learner state and cross-course/
cross-learner isolation for this candidate remain NOT TESTED due to the stated blocker.

### Recommendation and remaining boundary

**CONDITIONAL:** Chimera's isolated hosted workflow and export runtime checks pass.
Integration/release readiness still depends on actual Experience qualification using
these approved packages once its isolated local services are available. cmi5 is not
supported. No human participant/Founder usability acceptance is claimed by the
automated two-account browser exercise or screenshot review.

PR53 and PR54 remain unmerged; this candidate was not deployed to production.
No production configuration/data, Pythia, backup permissions, paid generation or
public routing was changed. No prior staging release/state/checkpoint was deleted.

Exact-head CI run [45226252223](https://github.com/Darkkeep/chimera/actions/runs/45226252223)
passed all ten jobs, including all nine Chromium/Firefox/WebKit shards. Backend:
757 tests run, 72 explicitly skipped. Build, HTTPS auth, Studio and export checks
passed. [exact-head-ci.json](qualification/pr54/exact-head-ci.json) retains job IDs.
One redundant manually dispatched packaging run was cancelled after discovering
the automatic exact-head build; the successful run above is the qualified artifact.

Owner-directed follow-up is registered as
[Issue #55 — CONSTELLATION qualification limits](https://github.com/Darkkeep/chimera/issues/55)
for later today. It does not authorize implementation of new cmi5 or anchoring
features, production changes, or merging either PR.
