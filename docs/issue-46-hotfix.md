# Issue 46 standalone production hotfix

Scope: retain an authorized Studio workspace and unsaved draft through transient
permission-check failures; pause actions until verification recovers. Initial
verification and confirmed denial still conceal private content. No backend,
schema, backup-permission, provider or DNS changes. This preserves the charter's
familiar authoring flow and existing access/revision safeguards.

## Qualification

The focused Chromium suite and existing full authoring smoke passed locally
(10 tests). The smoke's obsolete Studio button selector alone was corrected;
all editing, persistence, assessment, preview, export and no-model-call
assertions remain. The frontend production build and diff checks passed.
The PR's exact-head hotfix workflow repeats these tests. The existing release
workflow packages that exact head with Studio enabled/default, compares two
independent builds, and installs/tests the archive offline. Verify both CI
results and the downloaded artifact before any merge or production switch.
Machine results do not constitute Owner usability acceptance.

## Production preparation and switch

Proposal only; requires final Owner authorization. Read-only inspection on
November 22 confirmed the current pointer, systemd drop-in and Nginx static
root use `/srv/chimera-releases/current`. The current release is
`7dae45d1e68cf83f5eaac1c9e875b4fbd7d2772e`.

1. Pin the PR head, successful test/package runs, downloaded archive digest and
   manifest/frontend identity. Use the actual uploaded archive; do not rebuild
   on production. Confirm no backend source changes from the fallback.
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
fallback=7dae45d1e68cf83f5eaac1c9e875b4fbd7d2772e
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
