# Issue 46 standalone production hotfix

Scope: retain an authorized Studio workspace and unsaved draft through transient
permission-check failures; pause actions until verification recovers. Initial
verification and confirmed denial still conceal private content. Backend changes
are limited to current-response capability batching, non-blocking authorization
I/O and aggregate diagnostics. No schema, backup-permission, provider or DNS changes. This preserves the charter's
familiar authoring flow and existing access/revision safeguards.

## Navigation correction and delay investigation

The first patch is live at `9a151797ffffe4160759192986280234cac71f05`.
This follow-up stays on the same branch and PR #47 and requires fresh Owner
production authorization.

The project check formerly reset permissions on project changes and gated the
entire shell, including My Work. Opening the same project also fetched/applied
it again and reset the editor. The corrected shell/navigation remain mounted;
My Work is independent of the project check. Visiting My Work hides the current
editor without unmounting it, and resuming that project does not reload it.
Actual project switches retain the unsaved-change decision. New unverified
project content is not mounted; its pane offers status, retry and My Work.
A late project response cannot pull the author back out of My Work.

Backend inspection established six sequential authority calls for the six
permission flags, repeated checks per My Work row, and blocking authority I/O
in the asynchronous request guard. Flags within one response now share one
current authority decision; nothing is cached across calls, requests or jobs.
The guard runs that I/O in the thread pool, leaving the event loop responsive.
Existing local-role restrictions, live revocation and fail-closed writes remain.

The exact historical sixty-second wait is unproven: the live Nginx configuration
has no request/upstream timing fields. A read-only bounded journal sample at
investigation time contained permissions responses 200 (903), 401 (1), 503 (3).
Public health/config controls returned 200 in 244/146 ms respectively; those
controls do not measure authenticated authority latency. The source defects
are verified contributors, not proof of the Owner's exact request history.

Requests for login, identity, admission, My Work, project loading and permissions
are bounded to ten seconds per request and offer retry on failure. Browser
performance measures record only operation category, code/timeout and duration.
API Server-Timing reports aggregate application/authority durations and authority
call counts. No subjects, project IDs, credentials, bodies or private documents
enter these diagnostics. These measurements distinguish browser waiting,
Chimera work and authority time after the correction is deployed.

## Qualification

Local correction validation passed: 38 Chromium tests (zero skips/failures),
58 relevant backend tests, and the frontend production build. Measured fixture
transitions were 80–306 ms; the identity timeout surfaced a retry at about ten
seconds. These are controlled local timings, not hosted latency claims.

The focused suite covers fresh DARKROGUE handoff and logout/login, slow initial
project verification, My Work round trips, real project switches, retained
unsaved drafts, explicit retry, request timeouts, actual denied decisions,
demotion, session expiry, recovery and stale-write 412. Navigation timings are
retained as JSON test attachments and must remain below 1500 ms in the controlled
slow-response fixture. The broader editing/assessment/preview/both-SCORM smoke
retains every assertion. Backend tests check one online lookup for a capability
batch, fresh revocation on the next call, event-loop responsiveness under a slow
authority, authorization parity and aggregate-only timing headers.

Exact-head CI repeats the browser/backend checks and frontend build. The
existing release pipeline compares two archive builds and installs/tests the
exact payload offline. Verify the new head and artifact before final approval.
Machine results do not constitute Owner usability acceptance.

## Production preparation and switch

Proposal only; requires final Owner authorization. Read-only inspection on
November 22 confirmed the current pointer, systemd drop-in and Nginx static
root use `/srv/chimera-releases/current`. The current release is
`9a151797ffffe4160759192986280234cac71f05`. The earlier guarded
`7dae45d` release remains retained separately.

1. Pin the PR head, successful test/package runs, downloaded archive digest and
   manifest/frontend identity. Use the actual uploaded archive; do not rebuild
   on production. Review the bounded backend authorization/diagnostic correction as well as the frontend; no data schema changes are included.
2. Recheck the current pointer and healthy fallback; retain its complete release
   and `production.conf`. Under the approved procedure, prepare the current
   application-consistent recovery checkpoint and drain writes for the switch.
   This does not require the separate backup-permission correction.
3. In the authorized window, install the verified archive into a new root-owned
   `/srv/chimera-releases/FULL_HOTFIX_SHA` directory. Use its bundled offline
   installer/runtime. Derive its `production.conf` from the current release by
   replacing only release-root paths and the four build SHA/timestamp values
   with the artifact identity. Preserve service identity/hardening, external
   environment-file references, proxy/auth settings and
   `/srv/chimera/networked-workspace`. Review these exact substitutions privately.
4. Run the following in one root Bash session, with `candidate` set to the
   independently verified full hotfix SHA. Keep the lock through checks or
   reversal. No Nginx configuration change or reload is needed: its existing
   static root follows the same pointer.

```bash
set -euo pipefail
releases=/srv/chimera-releases
fallback=9a151797ffffe4160759192986280234cac71f05
: "${candidate:?set the approved full hotfix SHA}"
[[ $candidate =~ ^[0-9a-f]{40}$ && $candidate != "$fallback" ]]
unit=chimera-networked.service
exec 9>/run/lock/chimera-production-switch.lock
flock -n 9
select_release() {
  local expected=$1 target=$2 pending
  test "$(readlink -e "$releases/current")" = "$releases/$expected"
  test -f "$releases/$target/production.conf"
  test -s "$releases/$target/frontend/dist/index.html"
  pending=$(mktemp -d "$releases/.select.XXXXXXXX")
  ln -s "$releases/$target" "$pending/current"
  mv -Tf "$pending/current" "$releases/current"
  rmdir "$pending"
}
nginx -t
test "$(readlink -e "$releases/current")" = "$releases/$fallback"
test -f "$releases/$candidate/production.conf"
systemctl stop "$unit"
select_release "$fallback" "$candidate"
systemctl daemon-reload
systemctl start "$unit"
curl -fsS --max-time 5 http://127.0.0.1:8000/api/health
```

5. Before reopening writes/traffic, verify public frontend and backend identity,
   fresh DARKROGUE login, authorized project open/edit/save/reopen and SCORM
   export using the approved disposable project. Observe editing through a
   normal poll. Simulated failures belong in isolated tests, not service-wide
   production fault injection. Check sanitized access-failure diagnostics.
   Record the latest saved revision. Resume traffic on success.

## Application-only rollback

If identity, health, authorization, draft recovery, persistence or export fails,
keep/reinstate the approved traffic hold. In the same locked session:

```bash
systemctl stop "$unit"
select_release "$candidate" "$fallback"
systemctl daemon-reload
systemctl start "$unit"
curl -fsS --max-time 5 http://127.0.0.1:8000/api/health
```

If failure preceded pointer replacement, verify it still points to the fallback
and start that service directly. Unexpected pointer or failed fallback health:
keep traffic held and inspect; do not guess. Verify served fallback identity,
DARKROGUE authorization, latest saved revision and export before reopening.
Rollback changes application/frontend together, retaining all newer author
data. Never restore an older workspace as code rollback. Backup writer, timer,
archive permissions and retention remain untouched throughout.
