# Pythia Sprint 7 Provider Consolidation Handoff

## Ownership

Pythia now owns learning-intelligence execution-provider selection. Capability
ownership remains in the existing capability registry; runtime execution policy
lives separately in `registry/execution-providers.yaml`. The runtime registry
contains provider IDs, model IDs, capability eligibility, priority, budgets,
retry limits, and fallback relationships. It contains no credentials.

Chimera must not select or configure a text-reasoning provider for Pythia
capabilities. Chimera may keep production media adapters temporarily, as defined
by the shared plan.

## Read-Only API

The Engine API now exposes:

- `GET /providers`: public runtime provider configuration without credentials.
- `GET /telemetry`: in-process provider selection, retry, fallback, completion,
  and failure events.

`POST /tasks` returns `429` when the configured concurrent-task capacity is
full. Capacity is process-local in Sprint 7 and is released when the queued,
running, completed, failed, or cancelled task reaches a terminal state.

An event contains the provider ID, model ID, capability, estimated units,
attempt number, and outcome. Telemetry is process-local in Sprint 7 and is lost
on Pythia restart; durable audit storage is a Sprint 8 concern.

## Policy Behavior

For every supported Engine task, Pythia selects the highest-priority enabled
provider that supports the requested capability and fits the configured
per-task budget and concurrent-task capacity. A transient failure receives only
the declared retry count; after that, Pythia selects the declared eligible
fallback. Non-transient errors do not retry or fall back automatically.

The initial registry uses deterministic providers to preserve current bounded
draft behavior. Adding an external model provider later requires a new registry
entry and secure server-side credential configuration; credentials never belong
in Chimera requests, client code, or this registry.

## Required Chimera Work

1. Replace remaining text-model settings with Intelligence Engine status sourced
   from Pythia.
2. Use `/providers` only for display/diagnostics, not provider selection.
3. Use `/telemetry` for a local diagnostics view only; do not treat it as a
   durable audit log.
4. Keep offline behavior recoverable when Pythia is unavailable.
5. Treat `429` as a recoverable capacity response and retry later with a new
   task ID when the user still requests the work.