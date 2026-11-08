# Chimera 1.2.0 - hosted SSO release

Repository context: **Chimera 1.2.0** | [MIT license](../LICENSE) | [Release notes](release-1.2.0.md). Dated evidence and independently versioned assets/contracts retain their original scope.

Established November 8, 2026. Chimera's product version is **1.2.0** and its first-party software and documentation are licensed under the [MIT License](../LICENSE), copyright 2026 DARKROGUE. See [licensing and redistribution](licensing.md) for dependency, asset and content boundaries.

## Release scope

- Hosted Chimera at `https://chimera.darkrogue.io`, with a dedicated workspace, HTTPS reverse proxy, service management and backups.
- DARKROGUE account sign-in through a 90-second, one-time, exact-audience handoff token. Chimera retains its own revocable eight-hour session.
- ADMIN maps to administrator, author and instructional-designer; INSTRUCTOR maps to author and instructional-designer; LEARNER maps to reviewer. Project memberships remain separate.
- Existing hosted accounts are adopted by normalized email while retaining their IDs. Disabled accounts and conflicting external identities fail closed. Re-login revokes the presented previous session.
- Hosted password login/reset are disabled under the DARKROGUE profile. The workstation's local single-user profile remains available.

The root and frontend package manifests, their lockfiles and the backend API metadata use the product version. Asset-kit versions, contract/schema identifiers, dependency versions, historical evidence and existing Git tags have independent meanings and must not be rewritten to 1.2.0.

## Recorded verification and limits

Hosted application source `9b5b0c5` passed 586 backend tests with 71 skips, built successfully, and returned healthy service responses. DARKROGUE PR #45 merged as `0816740` after Ubuntu, Windows and Supabase authentication/runtime CI passed. Hostinger build `01a1bbbb-22a0-72f9-a746-53e928c9d5fb` deployed the production-preserving source package; its manifest records the retained production UI and SSO overlay. It is not a claim that every deployed byte came solely from the merged Git tree.

Browser verification observed Erik Kristian Hart's existing DARKROGUE session adopted by Chimera, all three ADMIN roles, unchanged hosted account ID and successful project creation. The disposable project was moved to recoverable trash. The reverse proxy needed the exact `https://darkrogue.io/api/chimera/session` source in `connect-src`; a hard reload picked up the updated policy.

Sign-out was initiated, but final signed-out-state and reload verification were interrupted when Computer Use could not determine the browser URL. Those checks remain open. Temporary credential-file cleanup and the final operator checkpoint also remain open until that verification is completed. No secret belongs in release notes, source, logs or project archives.

This version/documentation update does not itself deploy the new 1.2.0 API metadata, create `v1.2.0`, publish an evaluation package or grant broader human, live-provider, target-LMS, accessibility or participant acceptance. The hosted functional source above predates this metadata reconciliation. Follow the [release policy](release-policy.md) before tagging or distributing an exact candidate.

## Getting started

Hosted authors use their DARKROGUE accounts. See [authentication deployments](authentication-deployments.md) for operators and the [user guide](user-guide.md) for authors. Local installations follow the [README](../README.md) and [local deployment checklist](single-user-deployment-checklist.md). The [creator-pilot checklist](pre-alpha-readiness.md) retains its independent installation, recovery and human-review gates.
