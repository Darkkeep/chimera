# Hosted Pythia consultation

Repository context: **Chimera 1.2.0** | [MIT license](../LICENSE) | [Release notes](release-1.2.0.md). Dated evidence and independently versioned assets/contracts retain their original scope.

Team deployments can direct **Consult Pythia** at a hosted Pythia text engine
instead of the single-user local desktop adapter. The hosted transport speaks
Pythia's authenticated conversation-candidate contract: canonical safe-integer
JSON, SHA-256 request binding, short-lived Ed25519-signed access proofs, and a
per-turn current-access callback to this Chimera installation. Consultation
remains advisory only; it grants no approval and applies no changes.

## What is and is not hosted

- Hosted Pythia supports consultation and, with the coordinated authoring update,
  content drafts and storyboard suggestions. See [hosted storyboarding](hosted-storyboarding.md).
- Video/experience treatments, specialist tool orchestration, public web research
  and media generation still require their compatible local adapter.
- The engine advertises consultation capacity. The coordinated repair defaults
  to **200,000 characters across history and the next question**, **100,000 per
  message**, and **100 preceding wire messages**. A conservative model budget
  can bind first. Older engines retain their actual 24,000-character allowance.
  See [capacity configuration](consultation-capacity.md).
- Pythia's durable wire context records every accepted turn, including failed
  ones; Pythia's engine projects only completed exchanges to its model
  producer, so failed turns still never join the advice context.

## Backend configuration

Setting any of the credential variables below switches the Pythia consultation
transport to hosted mode; partial configuration fails closed with an
operator-actionable message. All values live only in the backend environment.

- `CHIMERA_PYTHIA_BASE_URL` — exact HTTPS origin of the hosted Pythia engine
  (an HTTP loopback address with a port is accepted for local evaluation).
- `CHIMERA_PYTHIA_SERVICE_TOKEN` — bearer token registered with the engine's
  Chimera trust profile; at least 32 characters.
- `CHIMERA_PYTHIA_SIGNING_KEY` — Ed25519 private key PEM whose public half is
  the engine's `PYTHIA_HOSTED_PUBLIC_KEY`. Accepts inline PEM or an absolute
  path to a PEM file readable only by the backend service user, because
  systemd environment files cannot hold multiline values.
- `CHIMERA_PYTHIA_KEY_ID` — key identifier matching `PYTHIA_HOSTED_KEY_ID`.
- `CHIMERA_PYTHIA_TENANT_ID` — tenant identifier matching
  `PYTHIA_HOSTED_TENANT_ID`.
- `CHIMERA_PYTHIA_CALLBACK_TOKEN` — bearer token Pythia presents to this
  installation's `/api/internal/pythia/turn-access` callback; at least 32
  characters and distinct from the service token.

The matching engine-side profile is enabled with `PYTHIA_HOSTED_CHIMERA=1` and
`PYTHIA_CHIMERA_ORIGIN` set to this installation's exact HTTPS origin. See
Pythia's `docs/operations/render-hosting.md` for the full engine checklist,
including the per-tenant `PYTHIA_HOSTED_TURN_LIMIT` allowance. The
`deploy/hosted-pythia.env.example` template in this repository holds a
commented copy of every backend variable.

## Who may consult

Consultation requires an active account with the **author**,
**instructional-designer** or **administrator** role, plus the project's
normal `enhancement.job.create` and `project.view` permissions. Reviewer-only
accounts are refused. Every turn is additionally re-verified by Pythia through
the turn-access callback: the callback recomputes the account's entitlement
and policy revision at call time, so disabling an account or changing its
roles revokes in-flight and future turns without waiting for session expiry.

## Operational notes

- Completed hosted answers include the contract's `answer_sha256` integrity
  field. Chimera verifies the checksum before adapting the answer to its shared
  advice display model. Unknown fields and unsupported answer content remain
  rejected. A rejected answer retains the accepted wire revision and is never
  retried automatically.

- Rotate the service, callback and signing credentials together with the
  engine operator; the engine requires distinct tokens of at least 32
  characters and refuses weak configurations at startup.
- The reverse proxy must allow server-to-server HTTPS from this backend to the
  engine origin and from the engine to
  `https://<this installation>/api/internal/pythia/turn-access`.
- Each consultation is a paid provider call made by the engine. Request IDs
  are stable and idempotent; Chimera never automatically repeats a paid turn.
- Starting a new conversation starts a fresh hosted session; the engine's
  per-tenant operation allowance (`PYTHIA_HOSTED_TURN_LIMIT`, default 128)
  still applies across the installation. Authors see an explicit message when
  the allowance is exhausted.
