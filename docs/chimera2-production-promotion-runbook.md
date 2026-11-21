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
