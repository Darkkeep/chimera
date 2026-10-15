# Repository review and completion plan

Reviewed 2026-10-15 against `a181b7336a792f1a2840fbc059d7314bf09f606a` on `extract-onboarding-repository`. This is an execution plan, not release approval. Application source and user projects were not changed during review.

## Implementation status - 2026-10-15

The installation owner selected the full local media scope and explicitly deferred hosted deployment. Delivery and final verification are recorded in [completion update](completion-update-2026-10-15.md).

| Stage | Disposition |
| --- | --- |
| 1 - accurate backlog/version policy | Implemented: reconciled handoff, historical-plan dispositions and aligned product/frontend/API 1.1.0 |
| 2 - qualification/release | Local qualification and CI repairs implemented; exact-head hosted CI, human gates, merge/tag/release remain pending |
| 3 - persistence/resume | Implemented: per-profile byte budgets, build estimates, no truncation or grade reporting after failed saves, legacy state/boundary/Unicode/large-course/corruption checks; target-LMS reacceptance remains external |
| 4 - hosted deployment | Deferred for this update by user instruction; Encarta remains fail-closed |
| 5 - AI safeguards/quality | Implemented: complete-request and source budgets, no silent reference truncation, reported enhancement usage, API layout warnings and captured-output evaluation runner; broader human/live quality ratings remain pending |
| 6 - media/Word/OCR | Implemented: scene/course placement, overrides/exclusions, pinned shared copies, captioned imported video, Word provenance/opt-in discussion and versioned local OCR requiring inspection |
| 7 - adoption/policy | Human acceptance packet prepared; observed pilot, screen-reader review, upstream maintained consumer/rights and January attribution decision remain human/future gates |

The original review and ordered plan below remain the baseline, not a claim that human or deployment gates have passed.

## Assessment

The local authoring/export product has a substantial implemented and tested baseline. The next work should close release and reliability gaps before expanding media or hosting scope. Older planning documents mix historical gaps with current tasks and should not serve as an executable backlog without reconciliation.

Evidence reviewed: current handoff, original enhancement plan, product operating model, authentication deployment guide, onboarding migration, visual authoring guide, October 14 live-AI/LMS record, models, storage writes, provider workers, packaged player, browser configuration, and CI workflow. This is a targeted readiness review, not an exhaustive security or correctness audit.

### Established capabilities

- Local authoring, PPTX import, editable visual scenes, templates, animations, assessment authoring, learner Preview, standalone ZIP and both SCORM profiles.
- Word SME Master and Full storyboard export, project archive/restore, project trash/restore, and revision-aware writes.
- AI course/scene drafts, reference-guided enhancement, explicit proposal decisions, image/narration candidates, and secure connection configuration.
- Hosted password authentication, project membership enforcement, account-bound expiring/revocable fixed-revision review links, and audit attribution.
- Independent onboarding package extraction with a pinned, verified consumer artifact. Extraction itself is complete.
- October 14 live-provider synthetic checks and operator-attested SCORM 1.2 retry, Continue, Start over, and Gradebook acceptance for the exact replacement fixture. This does not establish arbitrary-course or broad LMS compatibility.

### Findings that change the backlog

1. `docs/current-work.md` still says to push two old commits and merge PR #5. GitHub reports #5 merged at `994f2afb9cd3618272efc8a5dd654ac429079d96`; cached `origin/main` agrees. The current branch contains later feature, fix, documentation and test commits. Release the actual candidate, not the old handoff SHA.
2. The handoff's 150 backend/66 Chromium test baseline is obsolete. The current backend has 190 passing tests and Chromium discovers 86 tests. Older documents also describe authentication and external review links as unimplemented, although both have code and qualification.
3. The packaged player serializes assessment responses, visited scenes and completed audio directly into suspend data. Review found no size budget in that save path. Large-course and long-answer resume limits remain a concrete reliability risk requiring boundary tests and then an explicit policy.
4. A Windows replacement retry helper exists in `storage.py`; older reports of transient locks do not alone justify rewriting storage. Verify the intended concurrency model and reproduce remaining failures before changing it. Other file types still use direct replacement and warrant focused inspection if concurrent writes are supported.
5. AI scene drafts are structurally validated, but the live record reports repetitive content and negative question phrasing; broader source coverage, citation correctness, overlap/contrast and request budgeting remain unqualified. Browser fitting does not protect direct API writes. Word SME pages already include `scene.narration`; older claims that narration is wholly unmodeled are stale. Source citations and optional discussion remain separate export gaps.
6. CI runs backend, build, onboarding across configured browsers, artifact verification and hosted-auth checks. The separate visual qualification script is absent from that workflow; identify its unique coverage before adding or consolidating it.
7. Hosted production operation remains unverified. Encarta intentionally rejects requests until its real identity contract is implemented. These are deployment gates rather than local authoring regressions.

## Ordered delivery plan

Each numbered item should be a focused PR or a recorded qualification task. Engineering work can proceed locally; human/provider/deployment tasks depend on the listed inputs.

### 1. Establish one accurate release backlog — first

Owner: engineering/release maintainer. No external dependency.

- Update `current-work.md` to the current candidate, merged PR status, October 14 acceptance, and fresh verification results.
- Reconcile the original enhancement plan and deployment checklist against implemented authentication, external review, narration fields, generation, and Word behavior. Preserve historical evidence with dates and add current dispositions rather than rewriting attestations.
- Classify every remaining item as release gate, deployment gate, product follow-up, or explicitly deferred scope. Give each item an owner, evidence link and acceptance criterion.
- Establish the authoritative version policy: root package is `1.0.1`, frontend package is `0.1.0`, and the local tag list includes `v1.0.0`. Decide whether frontend versioning is deliberately independent before changing anything.

Done when the handoff identifies the actual branch/head and no completed feature appears as an open implementation prerequisite.

### 2. Qualify and release the current local product

Owner: engineering/release maintainer; document editing acceptance requires an author/operator.

- Refresh remote branch, PR and CI state; identify the PR for commits after the #5 merge, or prepare one if none exists. Verify checks against its full exact SHA. A workflow lookup using an abbreviated SHA returned no runs during review; this does not establish that CI is missing or failing.
- Run the backend suite, production build, pinned artifact/evidence verification, all configured browser projects serially where required, visual qualification, and isolated HTTPS auth harness on the candidate. Record baseline failures separately from changes.
- Inspect SME Master and Full exports interactively using the supplied template: edit paragraphs/tables, save, reopen, and check orientation, page order, images and answer-key exclusion. Rendered/automated round trips already exist; interactive acceptance remains distinct.
- Preserve the exact October 14 replacement SCORM fixture/hash and operator acceptance. Record future LMS name/activity/grading settings where available. Requalify materially changed playback rather than reopening already accepted checks without cause.
- After applicable checks and review pass, merge, tag the exact selected release commit under the agreed version policy, and prepare release notes stating verified limits. Do not include ignored user data or credentials.

Done when a reproducible, reviewed release commit has matching evidence and no unaddressed release-blocking failures. Public hosting and new media types are not prerequisites for a restricted local release.

### 3. Close large-course persistence and resume risks

Owner: backend/player engineering. Depends on a declared supported course size and target LMS/profile matrix.

- Build deterministic small, medium and boundary-sized courses with many scenes, required audio, matching/ordering questions and long Unicode short answers.
- Use strict per-profile runtime fixtures to measure serialized suspend-state size and exercise rejection, interrupted saves, resume, retry, remediation, Start over, completion and Gradebook reporting.
- Define the supported state budget and behavior before exceeding it. Choose versioned compact state, a validated course limit, or another explicitly supported persistence policy based on results. Never silently discard answers or imply a rejected save succeeded.
- Verify backward-compatible resume from existing packages/state where supported. Keep player state and local Preview semantics aligned.
- Investigate Windows shared-workspace write behavior with focused concurrent read/write tests. Retain atomicity and revision conflict checks; do not expand supported worker count until job ownership and request budgets are safe across processes.

Done when supported limits are documented and enforced, and both profiles resume every supported fixture without silent state loss. Failures outside supported limits must produce actionable diagnostics.

### 4. Complete hosted deployment and authenticated review acceptance

Owner: deployment operator plus engineering. Requires hostname, SSH/access method, installation directory, TLS configuration, backup location and administrator policy choices.

- Deploy the existing Linux/systemd/Nginx templates to a separate workspace under the intended service account, initially using the documented single-worker architecture.
- Verify certificate/redirects, proxy client IP and rate limiting, filesystem permissions, credential-store or protected environment configuration, restart behavior and health monitoring.
- Test real-domain login/logout/expiry/reset, disabled users, project membership, review link expiry/revocation, revision binding and reviewer isolation with disposable accounts.
- Perform an installation backup and recovery drill covering account/configuration storage as well as project archives; project archives alone do not back up the installation.
- Set audit retention, collector trust/authentication and residency before enabling centralized event delivery. Qualify retry, deduplication and outage behavior if enabled.
- Implement and qualify Encarta only after receiving issuer/audience, token verification/key rotation/revocation, stable user/tenant mapping, provisioning and session/logout contracts plus a test environment. Keep rejection behavior until then.

Done when the operator records environment-specific evidence and recovery instructions. A built-in-password deployment can be qualified independently of Encarta.

### 5. Strengthen AI quality and resource handling

Owner: AI/backend engineering plus instructional reviewer. Live retests require approved provider spend and synthetic or approved source material.

- Create a small source-backed evaluation set covering conflicting resources, missing evidence, long references, metadata preservation, prompt injection, animation/layout requests and all assessment types. Replay captured responses for deterministic regressions.
- Establish human scoring for factual support, citation locators, redundancy, question clarity and suitability. Treat schema validity and educational quality as separate results.
- Bound total course/reference input before provider submission; show truncation/omissions clearly. Validate citation-to-version/passage associations and distinguish uncited creative drafts from grounded enhancement.
- Decide whether API-authored visual layouts need fit/overlap validation or explicit warnings, then cover Preview and exported rendering. Preserve draft-only generation and explicit approval.
- Add actual provider usage and output cost reporting when reliably available; retain estimated-versus-actual labels and provider-side spending controls.

Done when the evaluation set has recorded thresholds/results, unsupported coverage is visible, and provider failure or invalid output cannot alter approved content.

### 6. Finish media and Word contract gaps in dependent slices

Owner: product and engineering. Product must select formats, publication rules and placement semantics first.

1. Define transcript/caption and placement contracts, migrations and publication rules; reconcile existing `narration` and generated-candidate caption fields before adding duplicate concepts.
2. Add explicit role/order/playback settings and placement approval. Carry accessibility, provenance and attribution consistently through Preview, SCORM, standalone and Word.
3. Add course-wide placement and per-scene overrides, then a shared library with copy/pin semantics and usage-aware replace/delete. Library membership must not implicitly publish an asset.
4. Add a bounded imported-video profile with captions, transcripts, keyboard access and portable packaging. Generated video remains separate scope.
5. Add version-pinned source citations and optional review discussion to Word authoring exports; preserve learner export exclusions and answer-key opt-in.
6. Add explicit OCR as an optional ingestion capability with extraction inspection, source locators and failure states. Scanned sources must not appear successfully grounded before usable text exists.

Done per slice when old projects migrate without loss, only approved referenced content is published, and playback/export/accessibility/backup tests cover the new contract. These are follow-up features, not retroactive blockers for the existing image/audio release.

### 7. Complete adoption checks and dated policy follow-up

Owner: product/accessibility reviewer and installation owner.

- Conduct an observed novice-author pilot and manual keyboard/screen-reader review of authoring, dialogs, assessment playback and review links. Track concrete task failures before broad rollout.
- A second independently maintained consumer and asset redistribution rights review remain gates for onboarding API-stability/public-distribution claims; a temporary consumer test is already complete. Upstream package work belongs in the onboarding repository.
- On 2027-01-04, reassess the image-attribution exception after its January 1 review threshold. Until a new decision is implemented, retain visible Attribution Pending labels and build warnings. Test any policy change against existing projects; audio and missing-file blockers remain enforced.
- Defer MFA, automated email, guest review, multi-organization hosting, distributed workers, Word reimport and arbitrary PowerPoint animation playback unless separately selected. Each requires its own contract and acceptance checks.

## Maintenance after the release

The production build warns about the approximately 531 kB JavaScript entry chunk. Profile startup and split substantial optional authoring/export panels if measurements justify it. Large application/API modules and duplicated Preview/player logic also deserve incremental extraction when touched by the above work; avoid a broad refactor before release qualification.

## Review-time verification

- Backend: 190 tests passed.
- Frontend: TypeScript/Vite production build passed; chunk-size warning noted above.
- Isolated hosted HTTPS harness: passed login, reset, membership, authenticated review, isolation, expiry and logout; zero Axe violations or JavaScript errors. This is not live-server certification.
- Retained evidence: all 9 artifacts verified. Pinned onboarding artifact checksum and installed exports verified.
- Full Chromium suite: all 86 tests passed with one worker in 4.0 minutes.
- Separate visual harness: passed Stage editing, save/reload, master backgrounds, accessibility, mobile editor and both SCORM profiles' visual rendering. Evidence regenerated under ignored `workspace/visual-qualification`.
- Full Firefox/WebKit, real server, live provider and interactive Word checks were not rerun during this review.
