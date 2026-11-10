# Priority 1: Consultation Artifact Library (Chimera)

Date: 2026-11-10
Status: Implementation kickoff; not delivered or deployed
Coordinated branch: `feature/consultation-artifacts`

## Decision and outcome

A Pythia consultation is a workspace, not just a transcript. Chimera users must be able to discover, inspect, retrieve, and safely reuse the actual artifacts Pythia produced. This is Priority 1 for the current product development cycle, subject to existing safety and release gates.

**Ownership:** Pythia generates intelligence and preserves authoritative output provenance. Chimera owns the project-facing artifact library, durable consumer copies, preview, downloads, and explicit author-controlled application. The versioned `pythia-contracts` repository owns the exchange schema. Do not move Pythia intelligence into Chimera or rebuild existing media/authoring production services in Pythia.

## Verified starting points

- `frontend/src/PythiaTalkPanel.tsx`: session-bound saved consultation UI.
- `backend/app/pythia_talk.py`: local MCP adapter and hosted conversation integration.
- `backend/app/pythia_hosted.py`: hosted authenticated transport (inspect before changes).
- `docs/talk-to-pythia.md` and `docs/hosted-pythia-consultation.md`: documented differences between local and hosted availability.
- `vendor/pythia-contracts`: pinned contract submodule; do not assume same SHA as another consumer.
- `DELIVERY_GUIDE.md` remains the shared-journey status and qualification record; local feature work does not close G3-G6 or production gates.

## First change: verify boundaries before coding

1. In each local checkout record `git status --short --branch`, `git remote -v`, `git branch -vv`, `git submodule status`, and the exact commit SHA. Preserve all local changes and reconcile commits ahead/behind origin; GitHub-only inspection cannot see the VS Code working tree.
2. Inventory each output path: Pythia task artifacts, consultation advice/content drafts, media/saved work, and exported file bytes. Mark each as structured-data-only, actual file, previewable, or not yet implemented. Never advertise a download until the byte path is real.
3. Compare existing Engine artifact envelope, hosted conversation-candidate exchange, and MCP media export facilities. Implement only compatible extensions; do not retrofit unknown keys into strict existing envelopes.
4. Inventory local and hosted persistence, identity, ACL, retention, build, and deploy triggers. No automatic deploy or paid provider test.

## V1 user-visible acceptance

- An Artifacts tab with visible count in Consult Pythia, with links from individual answers and from the project's artifact library.
- List by current consultation and across project; stable artifact versions and source-turn link; statuses: pending, ready, failed, expired/unavailable.
- Differentiate Pythia's structured proposals from actual downloadable files. Show supported type, filename, size when known, created timestamp, provenance, and available actions.
- Preview safe supported types; securely download the actual bytes; clear diagnostic errors; recover catalog after reopen/restart.
- Explicit review-before-apply for eligible drafts and assets, respecting scene revision and existing approval boundaries. No source overwrite, publish, or approval on retrieval.
- Starting a new conversation does not silently delete retained project artifacts; any retention/deletion behavior must be explicit and authorized.

## Shared adapter API (design, not implemented)

Chimera backend exposes a transport-neutral artifact service: list(project, actor, consultation), describe(id, version), stream/preview(id, version), ingestAuthorizedCopy(id, version), and applyAfterReview(id, version, targetRevision). Only the backend accesses Pythia credentials and source retrieval endpoints. Each operation rechecks actor/project permissions.

Common metadata: artifactId, producer, sourceKind, projectId, consultationId, turnId/taskId, version, filename?, mimeType?, byteSize?, sha256?, creationTime, availability/status, sourceRef, storedCopyRef?, retained/provenance fields. Exact wire names and limits are set in the shared contracts PR, not by this document.

### Desktop

Use the current local MCP/Engine adapter. Persist managed copies to installation-local project-scoped storage with safe filenames and atomic verified writes. No extra hosted dependency; support offline reuse of retained copies.

### Hosted

Use authenticated server-to-server HTTPS, per-operation actor/policy checks, tenant-scoped durable private object storage and audited reads. Do not use ephemeral Render filesystem as the only retained copy, browser credentials, or expiring Pythia URLs as permanent references. Fail closed on revoked entitlements.

## Milestone sequence

- **A. Retrieve:** contract inventory and compatible extension; real output discovery, storage, listing, preview/download and desktop/hosted integration tests.
- **B. Reuse:** explicit reviewed application into Chimera scenes/media library, revision and undo protection.
- **C. Extend:** bulk export, richer multimedia, version comparison and cross-consultation search.

## Qualification

Synthetic and actual-byte fixtures (non-sensitive), MIME/signature verification, SHA-256, path traversal and ZIP limits, URL allowlisting/SSRF protections for hosted retrieval, size/time/rate limits, idempotent ingest, interrupted transfer, no auto-paid retry, concurrent requests, restart recovery, role revocation, cross-tenant denial, no unauthorized writes. Run backend, frontend, browser, Pythia, and pinned shared-contract suites. Record exact SHAs and explicit Desktop and Hosted results; do not infer production qualification from unit tests.

## Release guardrails

No direct commits to default branches; coordinated feature PRs and contract version bump as appropriate. Do not update submodule pins until exact version compatibility passes. Do not deploy to Hostinger/Render or enable production release automatically. Verify workflow triggers before any merge. Production needs a separate authorization and sign-off.

## First runtime slice (feature branch, 2026-11-10)

Chimera now has a private consultation artifact catalog that snapshots completed advice and content drafts into verified JSON, survives consultation resets, and offers download endpoints and an Artifacts shelf in Consult Pythia. It also adds a **per-answer Export Markdown** action. Desktop uses Pythia's new `pythia_export_text` local MCP capability to retrieve real base64-encoded file bytes, validates hash and length, then saves a private immutable project/actor copy. Hosted Chimera produces a deterministic Markdown export from its retained Pythia advice with clearly different provenance; this does not imply the hosted engine supports binary generation.

This is a bounded vertical slice, not full Pythia-generated file discovery. PDF/DOCX/audio/image/ZIP, durable multi-server object storage, actor/tenant authorization qualification, and the new shared exchange contract remain open. Tests and CI must pass before marking the slice delivered; no default-branch merge or deployment is authorized.

## Engine draft discovery integration (feature branch, 2026-11-10)

Added a Pythia Engine discovery client and project-scoped read-only proxy. The Artifacts shelf now distinguishes **Consultation artifacts** (private retained answers/Markdown exports) from **Engine drafts** (project-related structured task proposals). Engine metadata comes from the new Pythia `GET /artifacts?project_id=...` endpoint. The Chimera server filters by project and `consumer: chimera`, and rechecks the task's project/consumer/artifact association and artifact envelope ID/version before serving a bounded JSON download. Both Desktop and Hosted Chimera require `project.export` permission for file retrieval; the Engine still enforces tenant-scoped `tasks:read`. An offline/older Engine leaves the consultation shelf usable and marks Engine discovery unavailable.

These Engine drafts are not automatically linked to an individual consultation and are explicitly **structured JSON**, not generated media files. The draft PRs are awaiting independent CI and security qualification. No merge, pin update, paid generation, or production deployment has been authorized.

## Priority 1 SVG + animated GIF incoming (founder direction, 2026-11-10)

Chimera must retrieve **original SVG vectors and animated GIFs** as first-class assets, without converting vectors to PNG or flattening animation. Current Pythia source recovery and Chimera's `PythiaImageProvider` remain PNG-specific; do not claim these formats work yet. Extend with a versioned file descriptor and a new verified byte adapter once the producer provides them, rather than overloading the PNG-specific response. The artifact shelf should label SVG as *Vector*, GIF as *Animated image* when animation is verified, and expose original download and separate preview actions. Author-approved application remains separate.

Any SVG preview must be isolated and sanitized, with no script execution, external loads, event attributes or active links. Never inject untrusted SVG into a page's DOM; serve original source as a forced attachment with `Content-Disposition: attachment` and `X-Content-Type-Options: nosniff`. Keep raw original and preview derivatives distinct, preserve SHA-256/source provenance, and enforce project/actor/tenant permission on each retrieval. Bound GIF frame count, dimensions, decoded workload and bytes, preserving frame timing and loop count in source downloads. Add cross-browser animation and SVG accessibility checks, and test Desktop and Hosted independently. Native SVG/GIF support remains **pending**, not shipped.
