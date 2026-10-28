# Release policy

The root `package.json` version is the Chimera product version. The private frontend package and backend API version use the same version; their old `0.1.0` values were scaffold metadata, not independent release lines. Package lockfiles must agree with their manifests.

The candidate for the media/reliability update is **1.1.0**. Added authoring capabilities warrant a minor version increment. `v1.0.0` is historical; do not move an existing tag or overwrite a published artifact.

The October 28 timeline/appearance source is an engineering update, not an approved release. See [creator pre-alpha readiness](pre-alpha-readiness.md) for open candidate, installation, recovery, human, and scope-dependent checks. Before distributing it, choose and record a distinct pre-alpha identifier and intended supported scope; package manifests and source hashes must identify the actual candidate. This documentation update does not change product versions, create a tag, or waive applicable acceptance gates.

Release from a reviewed commit on `main` after exact-head CI and applicable local qualification pass. The release tag is `v<product version>` on that exact commit. Record source revision, package hashes, commands, test results and environment limits. Local test success alone does not authorize claims about live hosting, all LMS configurations or human acceptance.

Hosted deployment is deferred for this update by the installation owner's instruction on 2026-10-15. Interactive Word acceptance, observed novice-author and screen-reader review, target-LMS acceptance for materially changed playback, and onboarding public-distribution gates are recorded separately; never substitute automated results for them.

Project archives back up project content. Installation backups must separately include identity/accounts, policy, AI connection metadata, secure-store provisioning/recovery instructions, shared-media library and operational audit records. Never put provider credentials in a project ZIP or Git history.
