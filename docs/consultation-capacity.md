# Consultation capacity

The repair coordinates Chimera with Pythia's advertised capacity. It neither
silently summarizes nor truncates history. This source change is not deployed.

## Defaults and configuration

The new engine defaults to 200,000 total conversation characters, 100,000 per
message, 100 preceding wire messages and a 1 MiB request. Individual messages
and history length remain bounded by the unchanged pinned exchange contract.
Successful exchanges normally add two messages; accepted failed turns retain
their exact wire positions. The independent 32-attempt restriction is removed.
Tenant operation quotas remain separate and unchanged.

Chimera uses the lower of its setting and the authenticated engine advertisement:

- `CHIMERA_PYTHIA_CONTEXT_CHARS`: default 200000; maximum 2000000.
- `CHIMERA_PYTHIA_MESSAGE_CHARS`: default/maximum 100000.
- `CHIMERA_PYTHIA_HISTORY_MESSAGES`: default/maximum 100.
- `CHIMERA_PYTHIA_REQUEST_BYTES`: default 1048576; maximum 8388608.

Invalid settings or malformed advertisements fail closed. Capability metadata
is cached for at most 60 seconds by connection identity; **Check connection**
refreshes it. An older engine without metadata is treated as 24000 characters
and 262144 bytes, so updating Chimera alone cannot advertise unsupported capacity.

## Model budget

Pythia's `PYTHIA_CONSULTATION_MODEL_CONTEXT_TOKENS` defaults to 128000. This is
an operator budget, not automatic discovery or verification of a model's context
window. Confirm that it does not exceed the configured model's supported window
before deployment. It reserves 4096 completion tokens and 1024 safety units.

The estimate counts UTF-8 bytes of the actual serialized model messages,
including guidance, JSON/schema framing and message overhead. It is deliberately
conservative, not an exact token count; multilingual or escaped text may reach
it earlier. Byte-level tokenizer assumptions need provider qualification. The
engine advertises its fixed overhead so Chimera can show the same estimate
locally. Chimera counts all wire history conservatively; Pythia still sends only
completed exchanges to the model. No model capacity is guessed from its name.

## Author feedback and preservation

The hosted composer counts saved wire history, selected source/scene text,
direction, brief, application instructions and the draft. It shows character,
history-message and conservative model-budget usage, warns at 80%, and preserves
an over-capacity draft for editing. Stale previews cannot overwrite a newer one.

The project-scoped `/pythia-conversation/capacity` endpoint composes and counts
locally under normal permissions/origin checks. It reserves no turn and sends
no draft/source text to Pythia or a model; only capability metadata may be fetched.
Submit checks again independently. Pythia checks new requests before durable
acceptance or model invocation. Rejections do not append an accepted turn or
delete history, and idempotent replay never causes a new model call.

Existing **New conversation** remains an explicit confirmed reset. Keep useful
advice or the agreed brief before clearing. Automatic summaries, retrieval,
archives and model-specific tokenizer integration are separate future work.

## Rollout

Deploy Pythia first with model budget and outer request/proxy limits verified,
then Chimera's backend and frontend. The engine advertises the lower of its
consultation byte limit and general engine body limit. Rollback to an older
engine returns Chimera to its real legacy allowance. Stored conversations need
no migration. Publication and deployment require separate authorization.
