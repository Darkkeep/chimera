# Release policy

Repository context: **Chimera 1.2.0** | [MIT license](../LICENSE) | [Release notes](release-1.2.0.md). Dated evidence and independently versioned assets/contracts retain their original scope.

The root `package.json` version is the Chimera product version. The private frontend package and backend API version use the same version; their old `0.1.0` values were scaffold metadata, not independent release lines. Package lockfiles must agree with their manifests.

The current product version is **1.2.0**, established for the hosted DARKROGUE SSO release on November 8, 2026. See [release notes](release-1.2.0.md) for scope, recorded source/build identities and outstanding checks. `v1.0.0` and `v1.1.0` remain historical; do not move an existing tag or overwrite a published artifact.

The October 28 timeline/appearance evidence remains tied to its recorded source. See [creator pre-alpha readiness](pre-alpha-readiness.md) for independent local-pilot installation, recovery, human and scope-dependent checks. Before distributing an evaluation candidate, record its exact version or prerelease identifier, supported scope, source SHA and artifact hashes. Establishing 1.2.0 aligns source metadata and documentation; it does not itself create a tag, publish a package, deploy version metadata or waive acceptance gates.

Release from a reviewed commit on `main` after exact-head CI and applicable local qualification pass. The release tag is `v<product version>` on that exact commit. Record source revision, package hashes, commands, test results and environment limits. Local test success alone does not authorize claims about live hosting, all LMS configurations or human acceptance.

The October 15 hosting deferral applied to that earlier update. The owner subsequently authorized hosting and DARKROGUE SSO; the November 8 hosted evidence and remaining sign-out/reload checks are recorded in the 1.2.0 notes. Encarta remains unimplemented. Interactive Word acceptance, observed novice-author and screen-reader review, target-LMS acceptance for materially changed playback, and onboarding public-distribution gates remain separate; never substitute automated results for them.

First-party software and documentation use the [MIT License](../LICENSE). Retain it and [third-party notices](../THIRD_PARTY_NOTICES.md) in distributions; upstream code, assets and user content retain their own terms. See [licensing](licensing.md).

Project archives back up project content. Installation backups must separately include identity/accounts, policy, AI connection metadata, secure-store provisioning/recovery instructions, shared-media library and operational audit records. Never put provider credentials in a project ZIP or Git history.
