# Vendored onboarding release

Source: https://github.com/Darkkeep/onboarding
Release: https://github.com/Darkkeep/onboarding/releases/tag/v0.1.1
Source commit: `01efd81d12116a57b14adf7c94e73c53fae04f60`
Package: `@guided-workflows/onboarding` version `0.1.1` (ISC; license included in tarball).
SHA256: `60c1a8670f4311a45653373744c2ec1f7a18e1b5a99dac221cf88ddf5e873bff`

This is the exact release tarball, vendored so root test helpers and the frontend install without GitHub credentials or another checkout. `npm run verify:onboarding:artifact` checks its checksum and installed exports. npm lockfiles additionally enforce package integrity.

For an update, download the versioned upstream release and checksum, run upstream artifact checks and Chimera consumer checks, update both manifests/lockfiles and this record in a focused change. Never edit the tarball or depend on a mutable branch. Preserve journey definitions and progress keys. Source belongs upstream; no library fork is maintained here.
