# Licensing and redistribution

Repository context: **Chimera 1.2.0** | [MIT license](../LICENSE) | [Release notes](release-1.2.0.md). Dated evidence and independently versioned assets/contracts retain their original scope.

Chimera **1.2.0** first-party software and associated documentation are distributed under the [MIT License](../LICENSE). The existing copyright notice is **Copyright (c) 2026 DARKROGUE**. Preserve the complete copyright and permission notice when copying or distributing the software or substantial portions of it. The license includes the warranty and liability disclaimer; this guide does not replace its text.

## Scope and notices

- The root `LICENSE` is the authoritative Chimera license. Both package manifests identify it with the SPDX identifier `MIT`.
- Dependencies and bundled third-party material retain their own copyright notices and license terms. Chimera's MIT declaration does not relicense them. See [third-party notices](../THIRD_PARTY_NOTICES.md).
- Imported presentations, course content, uploaded media, fonts, external HTML5 activities and provider-generated outputs require their own applicable permissions. Installing Chimera or exporting a course does not supply those rights.
- Pythia's identity remains owned and governed upstream. Asset-kit version numbers describe those assets, not the Chimera product release. The historical brand Bible and source reference documents remain unchanged.
- Private repository access, including the pinned Pythia contracts submodule, is not a redistribution license. Verify upstream terms before including it in a public package; do not infer MIT coverage from Chimera's license.
- The MIT license is a software/documentation license; do not infer permission to use another party's marks or identity from the project license declaration.

## Packaging

Keep `LICENSE`, `THIRD_PARTY_NOTICES.md` and applicable bundled dependency notices with source/evaluation distributions. The source packager includes committed files and exact submodule revisions; only package a reviewed commit. Check the resulting archive's notices and redistribution scope separately from application tests. Do not include workspace data, credentials, environment secrets or user content.

Historical qualification documents and signed/recorded acceptance retain their original dates, versions and hashes. The documentation release-context line points to the current release; it does not requalify their original artifacts. The [release policy](release-policy.md) governs versioning and acceptance.
