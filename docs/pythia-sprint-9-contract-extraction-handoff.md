# Pythia Sprint 9 Contract Extraction Handoff

## Package Location

The local contract package is at `C:\inetpub\pythia-contracts`. It is a
standalone local Git repository with no remote or release tag yet.

## Consumer Surface

Use its versioned public files:

- `schemas/` for Engine requests, task state, artifact/error envelopes, and
  Chimera-facing capability payloads.
- `examples/` for representative valid requests/artifacts.
- `openapi/engine-api.yaml` for Engine endpoint documentation.
- `compatibility/matrix.yaml` for supported version combinations.
- `generated/typescript/engine.ts` for stable frontend/backend envelope types.

The package intentionally excludes API credentials, provider policy, tenant
configuration, audit logs, durable task state, skill manifests, and internal
Pythia task declarations.

## Verification and Refresh

From the package root:

```powershell
C:\inetpub\Pythia\.venv\Scripts\python.exe scripts\verify_contract_package.py
```

To refresh an unreleased local package after a Pythia contract change:

```powershell
C:\inetpub\Pythia\.venv\Scripts\python.exe scripts\export_from_pythia.py C:\inetpub\Pythia
```

Refreshes require verification and compatibility review. Do not automatically
overwrite a released contract version from a moving Pythia checkout.

## Required Chimera Work

1. Consume contract schemas/types from `pythia-contracts` rather than local
   copies when preparing the next integration branch.
2. Validate generated requests/responses against the extracted versioned
   schemas in cross-product tests.
3. Treat the compatibility matrix as the supported version source.
4. Keep Pythia credentials and provider configuration outside Chimera code and
   package artifacts.

## Cross-Project Manteion Dependencies (2026-10-18)

Manteion records 56 implemented, 5 partial, and 10 blocked. Its local Docker
staging evidence is not production qualification. The remaining Pythia requests
are tracked upstream:

- [pythia-contracts #2](https://github.com/Darkkeep/pythia-contracts/issues/2)
   requests proposal/scope, task-graph, and next-action schemas for Manteion.
- [Pythia #5](https://github.com/Darkkeep/Pythia/issues/5) requests a supported
   resume/orchestration contract for Manteion.
- [Pythia #6](https://github.com/Darkkeep/Pythia/issues/6) requests formal
   authority verification for Manteion.

These requests do not change Chimera's currently qualified `storyboard.analyze`
consumer route or its provenance/deep-link behavior. Do not add guessed graph
edges, proposal shapes, resume operations, or approval semantics to Chimera. If
a published versioned contract later changes Chimera's consumer surface, import
it from `pythia-contracts`, update the compatibility matrix, and qualify the
actual Chimera route against the supported Pythia revision before claiming
compatibility.