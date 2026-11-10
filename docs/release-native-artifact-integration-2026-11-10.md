# Native Artifact Integration | Release Record

**Date:** November 10, 2026  
**Release disposition:** Repository changes merged and qualified. Hosted Chimera activation pending.

## What shipped to source

- Chimera PR [#20](https://github.com/Darkkeep/chimera/pull/20) merged into `main` as `365e6a7a969f92b970921705c248eab58fb972f1`.
- Shared schemas/API specification PR [#4](https://github.com/Darkkeep/pythia-contracts/pull/4) merged into `main` as `4fa1a671a037df065b39891e18b780b6502e1365`.
- Pythia private Showcase Engine release PR [#23](https://github.com/Darkkeep/Pythia/pull/23) deployed as `718d548f4becd1cc17e5a6187194f9edd531346b`.
- Pythia public Showcase Gateway bridge PR [#24](https://github.com/Darkkeep/Pythia/pull/24) deployed as `c4afdd5772bf7eb7b9d4fcfe1e1a347e8902bdb7`.

## Verified tests and deployment evidence

| Check | Result | Evidence |
| --- | --- | --- |
| Chimera `main` backend, visual exports, HTTPS auth and Chromium/Firefox/WebKit | Passed, all ten jobs | [Actions run 42871212207](https://github.com/Darkkeep/chimera/actions/runs/42871212207) on `365e6a7a` |
| Shared contracts `main` | Passed | [Actions run 42871175662](https://github.com/Darkkeep/pythia-contracts/actions/runs/42871175662) |
| Pythia release-candidate MEX-0 and cross-platform contract matrix | Passed | Release candidate branch checks; see [Pythia PR #23](https://github.com/Darkkeep/Pythia/pull/23) |
| Pythia Gateway native bridge test suite | Passed | [Pythia PR #24](https://github.com/Darkkeep/Pythia/pull/24) |
| Render private Engine | Live, startup verified | Service `srv-dbnkfm3rjlhs7393b43g`, deploy `dep-dbpk8o88v5cc73egdd8g` |
| Render public Gateway | Live, startup verified | Service `srv-dbnkfljrjlhs7393b21g`, deploy `dep-dbpkiu49v7es73f5pin0` |

## Supported source-code workflow

Pythia supports registered native SVG/GIF originals with immutable provenance, project/client-scoped discovery and byte retrieval. Chimera's Artifact Library can retrieve, retain and explicitly promote original images to its canonical media library, followed by author-controlled placement and SCORM export. SVG publication requires a passive-vector safety check; source download remains attachment-only. GIF original bytes are preserved, including animation timing and loops. Image generation is explicit and subject to model availability and billing.

Chimera can target Pythia's allowlisted HTTPS native bridge using separate backend configuration, without using browser-accessible credentials or changing its ordinary consultation connection.

## Production gates that are still OPEN

1. **Hostinger:** Chimera's merged version has **not** been deployed to Hostinger through this release work. Confirm a versioned, recoverable release artifact, the current hosted workspace and its authentication/SSO state before deployment.
2. **Credentials:** The native-media Engine flag, Gateway bridge opt-in and independent Engine/Gateway/Chimera credentials have **not** been activated. No secret values belong in Git, logs, documentation or frontend bundles.
3. **Live integration:** No authenticated Hostinger → Gateway → private Engine retrieval test or deployed SVG/GIF-to-SCORM acceptance has been evidenced.
4. **Persistence and recovery:** Both Render services have persistent storage, but a restorable backup has **not** been verified. Existing accounts, consultations and media must be preserved.
5. **Paid generation:** No paid native-image generation acceptance has been run or authorized through this deployment. Enable only after read-only transport, private storage and credentials are qualified.
6. **Version and distribution:** These merges are not a tagged Chimera release and do not supersede the established Chimera 1.2.0 release policy or outstanding human/LMS acceptance requirements.

## Activation order

1. Inventory and back up the existing Chimera Hosted workspace and Render state; record a tested rollback target.
2. Deploy a qualified Chimera build preserving DARKROGUE SSO; smoke-test existing authoring, consultations and project access.
3. Configure distinct server-side credentials for private Engine, Gateway and Chimera as documented in [Pythia's runbook](https://github.com/Darkkeep/Pythia/blob/feature/pythia-web-showcase-20261107/docs/operations/chimera-hosted-native-bridge.md) and [Chimera's example](../deploy/pythia-native-bridge.env.example).
4. Activate and test read-only bridge discovery and exact-byte SVG/GIF download, including cross-client/project denials and persistence after restart.
5. With explicit authorization for a billable request, qualify one native generation → registration → Chimera import → promotion → SCORM output; verify original SHA-256 and GIF animation.
6. Record service/deploy SHAs, smoke test results, acceptance owner, change date and any rollback action in this document.

## Rollback

- Engine previous known-good deploy: `dep-dbnkfmrrjlhs7393b6q0`, commit `79382af39b17d17875a4b2a0ff37f72da55f1233`.
- Gateway previous known-good deploy: `dep-dbp2ev3bc2fs73dt69a0`, commit `6f7cf1a954dea19ab45710846f7fcb6d89d97763`.
- On bridge problems, disable the Gateway opt-in first, retaining existing artifact state and separately turning off paid generation. Roll back application releases without deleting persistent media or identity data.
- For Chimera Hosted, capture and use the actual current Hostinger release and backup identifiers before any deployment; these identifiers are not currently verified.

**Release owner checkpoint:** Code merged and CI accepted. Hosted activation remains gated by service credentials, recovery evidence and authenticated end-to-end testing.
