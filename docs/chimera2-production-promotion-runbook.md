# Chimera2 production promotion: execution runbook (draft v0.1)

Status: **PREPARATION ONLY**, not a deploy authorization. Work tracked in #41 and #42. Candidate base: `9c35f2b853cc42b7ab21c9ce11c70b171330558f`.

## Objective
Make Chimera2 the primary application at `https://chimera.darkrogue.io`, without losing the current hosted DARKROGUE SSO, authored projects, identity, media, audit or connection metadata. Afterwards, make each deployment repeatable from an immutable tested release artifact.

## Known repository evidence
- Chimera2 candidate PR #40 reports passing exact-commit hosted CI run 44638715006.
- Existing `.github/workflows/playwright.yml` is a test workflow, not a verified production deployment workflow.
- The repository includes example systemd and Nginx configurations. These examples are **not proof** of live Hostinger topology.
- Beta Studio is feature-gated; production presentation/default must be explicitly qualified.
- Experience SCORM 1.2 integration passed locally with a separate DARKROGUE LMS correction; that correction's release remains independent.

## A0: READ-ONLY HOST PREFLIGHT (all blanks must be filled from live evidence)
| Check | Evidence and observed value |
| --- | --- |
| Authorized target host/SSH entry | UNVERIFIED |
| Current active production release SHA/version | UNVERIFIED |
| Real deployment directory and service unit | UNVERIFIED |
| Nginx/proxy route, TLS and cache headers | UNVERIFIED |
| Public origin/CSP and DARKROGUE SSO flow | UNVERIFIED |
| Active data workspace and ownership | UNVERIFIED |
| Existing full installation backup/restore method | UNVERIFIED |
| Provider connectivity without credential disclosure | UNVERIFIED |
| Available staging, release switching, and rollback mechanisms | UNVERIFIED |
| Required operational access and approval | UNVERIFIED |

Never display secrets, private keys, session tokens, or source documents in logs, issue comments, CI artifacts or this file.

## A1: reproducible build
- Pin exact SHA and dependency lockfiles; confirm expected CI runs and tests.
- Build immutable versioned artifacts for frontend and backend with SHA, checksums, build-time feature toggles and provenance manifest.
- Preserve a tested 1.x rollback artifact.
- Review stacked PR ancestry (#27/#30/#36–#40) and integration method without overwriting unrelated `main` changes.
- Keep persistent workspace and secrets **outside** versioned release directories.

## A2: reversible staging and verification
- Stage new release without changing the active public endpoint. Use actual server layout after A0, not assumed paths.
- Verify pre-cutover backups and a restore drill, including identity, policy, media, audit and external secret reprovisioning instructions.
- Run authenticated isolated smoke: health/build identity; SSO login/logout; project list/create/open/save/reopen; Studio inline edit; assessment/SCORM 1.2 export; Pythia connection diagnostics (no paid generation); asset and cache behavior.
- Confirm data/schema backward compatibility. If not, produce a specific reversible migration/recovery plan before authorization.

## A3: Owner approval gate
STOP and request explicit authorization for the **exact candidate SHA/artifact**, preflight/backup report, cutover plan, rollback steps, and production config changes. No merge, release promotion, DNS/traffic switch, migration, service restart, credential change or billable provider request before approval.

## A4: only after separate authorization
- Run approved cutover actions. Confirm the public host serves the intended immutable SHA.
- Run production-safe smoke, record observed results and any degradation.
- On failure, restore previous release **without reverting or overwriting newer user data**; maintain compatibility or stop for recovery decision.
- Record current deployed SHA and Owner acceptance in the release manifest and update operational queue.

## Success measure
A subsequent small tested improvement ships through the same procedure without manual copying/rebuilding on the production server. Changes must remain separately authorized until the Owner changes this policy.

## Track A evidence and operator checks

Observed on November 21, 2026, via unauthenticated HTTPS GETs to the public
origin. TLS certificate verification succeeded. The homepage and health route
returned HTTP 200, and health returned `{"status":"ok"}`. The homepage
advertised HSTS with max-age 31536000, frame denial, and a CSP with
`frame-ancestors 'none'` and `connect-src 'self' https://darkrogue.io/api/chimera/session`.
The public auth config reported team mode, DARKROGUE identity, and password
login disabled. These observations establish edge behavior and advertised
auth settings. Origin proxy details, real SSO login/logout and version remain
unverified.

| Unverified item | Read-only operator evidence to return |
| --- | --- |
| Host, active service and release | In Hostinger, identify the owning server or managed service. If systemd is in use, run `systemctl show "$UNIT" -p Id -p ActiveState -p MainPID -p FragmentPath -p WorkingDirectory -p User -p Group` for the identified unit. Resolve the working directory with `realpath -- "$ACTIVE_RELEASE"` and record the deployed manifest SHA or commit, plus dashboard build information if available. Compare frontend and backend identities independently. |
| Proxy, TLS and CSP | In the hosting panel or proxy admin surface, record the public vhost's static root, upstream bind, TLS termination and expiry, cache behavior for HTML, build metadata and hashed assets, and sanitized effective CSP. Compare to the public headers and inspect the actual active route. |
| SSO and roles | Record the allowed origin and callback from approved non-secret policy metadata. Confirm identity provider and login/logout with approved test identities on isolated staging. Check author, reviewer and administrator capabilities using the installation's supported role matrix. |
| Workspace and permissions | Have the operator identify the configured workspace from approved non-secret metadata. Run `realpath -- "$WORKSPACE"`, `stat -c '%U %G %a %n' -- "$WORKSPACE"` and `findmnt --target "$WORKSPACE"`. Confirm it sits outside release directories and verify the prior release can read candidate-written fixture data. |
| Backups and restore | In the backup dashboard, record snapshot timestamp, scope, retention, last successful job and last restore-test result. Verify coverage for workspace, identity, projects, media, policy, audit and connection metadata. Record the existing recovery procedure for external secrets as an owner-managed dependency. A new restore requires approval for an isolated target. |
| Rollback and deployment constraints | Record current release pointer or equivalent, drain/reload mechanism, disk space (`df -h -- "$ACTIVE_RELEASE" "$WORKSPACE"`), OS/architecture, Python ABI, Node/Chromium, LibreOffice availability and the existing rollback release's checksum. Confirm the staging endpoint and isolated workspace with the operator. |

Return a sanitized inventory and timestamps. Do not dump environment files,
raw proxy configuration, process arguments, session material or keys. Use
`python scripts/release-smoke.py https://chimera.darkrogue.io` for the public
health check. The repository's sample service and Nginx configuration remain
reference material.

## Artifact and isolated rehearsal

- GitHub Actions run [44638715006](https://github.com/Darkkeep/chimera/actions/runs/44638715006)
  completed successfully for the exact Beta SHA. The release branch starts
  with the runbook-only commit `cee304984a1d5205c23bd449beae79bd50f1c096`
  directly above Beta. At audit time, `main` at `c9d07b700de82987cfb1eefbb3719b572ad6e464`
  was an ancestor, 70 commits behind the release branch. A local
  `git merge-tree --write-tree origin/main HEAD` found no conflicts.
  Review Track A against PR #40's head branch
  `feature/chimera-2-golden-path-qualification` while that stack is pending.
  Recheck the merge base and integration diff after the Beta integration
  method is approved, especially if the stack is squash-merged.
- Build from the release tooling checkout with
  `bash scripts/build-release.sh FULL_SHA false` for the classic rehearsal
  and run again with `true` for the Studio rehearsal. The output bundles the
  compiled frontend, backend source, runtime templates and Python wheelhouse
  with a manifest and archive SHA-256. The manifest identifies the Pythia
  contracts commit used for qualification. The private submodule is a test
  input and is excluded from the runtime payload. The manual GitHub Actions
  workflow requires registration on the default branch before GitHub accepts
  its first dispatch. It has no deployment job.
- Verify the downloaded archive with `sha256sum -c SHA256SUMS` from its
  artifact directory. Match the digest to the approved CI run and inspect the
  manifest before staging. The frontend lockfile pins npm inputs. The current
  backend requirements can resolve different wheel versions on a later build.
  Promote the exact verified artifact. Lock and hash the backend dependency
  resolution and pin runtime prerequisites before claiming byte-for-byte rebuilds.
- After isolated staging is authorized, unpack into a new release directory,
  create its venv, install with `pip install --no-index --find-links backend/wheelhouse -r backend/requirements.txt`
  from the release root, and provision export prerequisites using the existing
  runtime instructions. In the candidate release root, install the locked Node
  export renderer dependencies with `npm ci --omit=dev` and use the approved
  Chromium and LibreOffice runtime. Set `CHIMERA_BUILD_SHA` and `CHIMERA_FRONTEND_BUILD_SHA` from
  `sourceSha`, and `CHIMERA_BUILD_TIMESTAMP` and
  `CHIMERA_FRONTEND_BUILD_TIMESTAMP` from `sourceTimestamp` and point `CHIMERA_WORKSPACE` at
  the isolated restored workspace. Confirm the runner ABI and runtime
  prerequisites match the host before using the bundled wheelhouse.
- Run `python scripts/release-smoke.py "$STAGING_ORIGIN" --sha "$CANDIDATE_SHA"`
  and compare backend build identity in the admin build-information UI.
  Use a separate browser session and test identities to check login/logout,
  project create/save/reopen, inline scene editing, questions and SCORM 1.2,
  and Pythia connection with an approved stub or diagnostics-only setup.
  Record restore results and repeat the project checks after reverting the
  application release while retaining the candidate-written fixture data.
  Preserve Classic as the rehearsal default until the Owner chooses the
  production Studio setting and confirms the classic recovery path.
- Supply the exact cutover and reversal commands for Owner review after A0.
  For a confirmed same-filesystem Linux symlink layout, rehearse pointer
  replacement using `ln -s -- "$CANDIDATE_RELEASE" "$PENDING_POINTER"`
  followed by `mv -T -- "$PENDING_POINTER" "$ACTIVE_POINTER"` on isolated
  staging. Reverse by targeting the recorded prior release with a fresh
  pending pointer. Verify the expected starting pointer and serialize changes
  before either invocation. The actual host may use a different mechanism.
  Include any separately authorized service reload or route change, checks
  for both static and API paths, and abort criteria in the reviewed command set.
  Never point this rehearsal at the live workspace or restore an old backup
  over newer user data during rollback.

## Backup permission correction for Owner review

The proposed host change applies only to the existing root-run backup writer and its archives.
Before approval, identify legitimate backup readers and confirm the writer is idle. Inspect
the destination and its parents with lstat. Require the verified root-owned directory,
no symlink components, and root-owned regular single-link archives matching the writer’s
two timestamped naming patterns. Stop on an unexpected owner, ACL, type or reader.

After separate authorization, restrict the archive directory to 0700 first and its verified
archives to 0600. Preserve a root-only copy of the writer, insert `umask 077` immediately
after its shell shebang, syntax-check the replacement and preserve its owner and executable
mode. Verify the unprivileged readability check now fails, then check the modes and successful
completion of the next scheduled backup. Revert the writer from the private copy if it fails.
Keep archive protections in place. A protected restore drill still requires its own target.

## Runtime qualification

The x86-64 Linux artifact contains a relocatable CPython 3.14.4 interpreter, a
hash-locked wheelhouse, Node 24.19.0, the locked Playwright renderer modules and
its matching Chrome headless shell. The interpreter, Node and browser archives
are pinned by SHA-256 in `scripts/release/runtime-inputs.txt`. The Linux wheel
lock records the exact previously tested 3.14.4 resolution. The workflow builds
twice from the same source and compares the archive bytes before publication.

After approval for an isolated rehearsal, verify the independently recorded archive
digest and extract at its final release path. From the release root, run
`bash scripts/release/offline-install.sh /absolute/new/venv`. Use that venv's
Python and put the release's `runtime/node/bin` first on PATH. Set
`PLAYWRIGHT_BROWSERS_PATH` to the absolute `runtime/browser` directory. Preserve
the release path for the lifetime of the venv. No system Python installation is
involved. The wheel lock and runtime installer supersede the generic venv, wheel
and npm installation steps above.

LibreOffice Impress, suitable fonts and the browser's Linux shared libraries
are host prerequisites. The CI verification image supplies these packages and
disables networking before installing or running the artifact. It converts a
real PPTX to PNG, renders an authored scene into DOCX, exercises both SCORM
profiles, and runs backend and access tests against the extracted application.
Recheck those operations with the actual service identity on approved staging.
