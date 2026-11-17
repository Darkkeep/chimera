# Chimera 2.0 | Pythia Quiet Counsel
## Feature specification and implementation plan

**Status:** Proposed default, approved for specification and implementation planning only  
**Owner decision:** Quiet Counsel is the proposed default authoring-assistance mode  
**Date:** 2026-11-17  
**Branch:** `feature/chimera-2-quiet-counsel-spec` (derived from Studio shell work)  
**Scope:** Chimera 2.0 Authoring Studio. Do not deploy to `chimera.darkrogue.io` or modify existing 1.x user state.

## 1. Product promise

**Quiet Counsel is professional peer consultation, not automated instructional-design supervision.** It quietly identifies *potentially useful design questions*, without presuming error, assigning an author competence score, requiring remediation, or silently changing content. It is never a prerequisite for preview or publishing. Its purpose is to expand author judgment, not substitute for it.

Pythia should be capable of changing its recommendation after hearing the author's rationale. A professional may deliberately choose ambiguity, unguided discovery, a nontraditional assessment method, or a particular learning strategy. Such choices are not defects merely because they differ from a heuristic.

**Key distinction:** Quiet Counsel advisories are separate from deterministic authoring, accessibility, and publication validation. True policy or runtime validation blockers remain governed by the existing validator, cannot be waived by dismissing counsel, and must not be misrepresented as Pythia opinions.

## 2. Assistance modes

| Mode | Indicator behavior | Model/network behavior | Author control |
| --- | --- | --- | --- |
| Silent | No unsolicited counsel indicators | No counsel model requests | Explicit `Ask Pythia` remains available |
| **Quiet Counsel (proposed default)** | At most one low-priority, nonmodal indicator for a meaningful current-scene observation; no auto-open | Local deterministic signals only until author requests deeper insight | Open, dismiss, acknowledge intentional choice, snooze, disable |
| Collaborative | Additional *noninterruptive* candidate indicators, still throttled; user requests expansion | Same explicit-consent rule by default; no automatic model calls | Same choices, plus frequency setting |

New users should see a brief first-use disclosure: "Quiet Counsel can flag design questions. It does not judge or change your work. Opening a suggestion may offer a choice to consult Pythia." The mode is editable in settings and should not be treated as evidence of author skill. `Silent` does not remove independent validation notices.

Mode persistence: per actor + workspace/project preference, with user-level default; no user settings silently propagated across unrelated organizations. Do not bind an author's preference to a product license or badge.

## 3. Interaction contract

### Resting state
- Small neutral Pythia spark/indicator beside the selected scene's inspector heading or at the scene rail edge. It is absent when no advisory is warranted.
- Accessible label: "Pythia has a design observation for this scene." Never pulsing animation, sound, toast, badge count escalation, red warning dot, modal, or auto-focus.
- Indicator is stable under edits. It does not reappear repeatedly when dismissed or when the author returns to a scene.

### Opening an observation
- Opens a compact, dismissible panel or inspector section, not a blocking popup.
- It first displays the *observed fact or question* and the scope/uncertainty, not a judgment: e.g., "The decision asks for a choice before the relevant cues appear. Is that ambiguity intentional?"
- Controls: **Discuss with Pythia**, **Intentional design**, **Not useful**, **Remind me later**, **Close**. These actions must be keyboard accessible and visually secondary to authoring.
- The initial card must be useful without a model call. When deeper consultation is requested, show exactly what scene/source text will be sent, context limits, and expected provider/billing implications. Require affirmative request; do not preselect unpublished source documents.
- Returning from consultation preserves conversation, project context, selected scene and author history. Generated design change is proposed, not applied. Pythia must cite whether feedback is a local heuristic, source-backed fact, author-supplied intent, or model inference.

### Respecting intent
- **Intentional design** stores an *author-owned rationale*, optionally with free text and scope (this occurrence, this scene, or this design rule within the project). A blank explanation is allowed. This is not a binary declaration that the design is objectively effective.
- The current finding is suppressed for its content fingerprint; it remains visible in an unobtrusive "Design decisions" history when desired.
- If substantially relevant content changes, the finding can be reconsidered; show "Earlier marked intentional; new context may matter" rather than repeating the same suggestion. Never make that reconsideration a mandatory prompt.
- "Not useful" suppresses the fingerprint without implying the author disagrees with evidence. "Remind me later" snoozes without blocking workflow.
- If the user corrects Pythia, the next reply must incorporate the rationale and be able to explicitly revise or withdraw the previous recommendation; no defensive insistence.

### Examples
- **Suitable:** "Two choices lead to similar feedback. Are you aiming to practice selection or justification?"
- **Suitable:** "This interaction offers immediate feedback, while the stated goal involves delayed judgment. Worth discussing the transfer context?"
- **Not suitable:** "Your lesson is poorly designed." "You missed a required step." "Your content quality score is 63%."
- **Not counsel:** Missing mandatory alternative text or broken navigation is identified by the standard validation/accessibility process, with a clear action and severity.

## 4. Candidate detection and prioritization

Start with **deterministic, local, explainable signals** from existing scene/project state. No passive consultation requests. Candidate examples, subject to fixture testing:

1. Possible feedback equivalence: a decision's distinct choices have equivalent textual feedback.
2. Possible outcome/practice mismatch when *explicit, machine-readable* objective links exist (never infer a missing objective).
3. Possible information-order tension: a scene clearly references a needed cue only in a later authored text element, if confidently detectable.
4. Potential repetitive interaction structure across nearby scenes if an author selected an "explore alternatives" preference.

Do **not** implement speculative clinical/medical correctness, training efficacy judgments, learner psychological inference, source credibility assessments, or algorithmic assessment of author expertise in v0.1.

Every candidate has:
- `ruleId`, `ruleVersion`, a stable semantic `findingKey` and scope `projectId/sceneId`.
- `sourceRevision` and a content fingerprint of the fields actually checked; **do not hash entire projects if unnecessary**.
- `observation`, `question`, optional `evidenceRefs`, `limitations`, and confidence classification (`clear-signal` or `exploratory`, not an invented numeric probability).
- `category` such as `feedback`, `alignment`, `interaction`, `transfer`.
- `priority` only for notification arbitration, not a quality score.

Present at most one prominent scene indicator at a time. Debounce change processing; suppress repeated indications for an unchanged fingerprint; cap per-session new observations. Start with conservative thresholds. Avoid assertions where the detection rule cannot ground them in the saved scene.

No external user tracking, telemetry of private lesson text, or `project.create`/`scene.update` mutations from candidate detection.

## 5. Data and API design (proposed, not implemented)

Prefer existing Chimera identity, storage, revision guards, and audit hooks over introducing a second Pythia state database. Maintain separation between **ephemeral candidates** and **durable author decisions**.

```ts
type CounselMode = "silent" | "quiet" | "collaborative";
type CounselDisposition = "open" | "intentional" | "not-useful" | "snoozed";
type CounselCandidate = {
  id: string; ruleId: string; ruleVersion: string; findingKey: string;
  projectId: string; sceneId: string; sourceRevision: number;
  contentFingerprint: string; category: string;
  observation: string; question: string; limitations: string[];
  evidenceRefs: string[]; priority: "ordinary" | "consider";
  source: "local-heuristic";
};
type CounselDecision = {
  actorId: string; projectId: string; sceneId: string;
  findingKey: string; contentFingerprint: string;
  disposition: CounselDisposition;
  rationale?: string; scope: "occurrence" | "scene" | "project-rule";
  decidedAt: string; sourceRevision: number;
};
```

Implementation candidates:
- `GET /api/projects/{projectId}/counsel` delivers filtered deterministic candidates + durable decisions only to authorized project users; write permission not needed just to read own advice.
- `PUT /api/projects/{projectId}/counsel/preferences` is scoped to the authenticated actor; input limited to the three modes.
- `POST /api/projects/{projectId}/counsel/decisions` records actor-owned dispositions/rationale; validates project access, exact scene IDs, a current finding/revision and bounded lengths; no implicit authoring edits.
- `POST /api/projects/{projectId}/counsel/consult` **only after** a deliberate user action and explicit context preview, delegating through existing Pythia conversation/authorization transport and entitlements; avoid a new unreviewed model invocation path.
- Prefer a small, separate advice history store with versioned schema and scoped reads. Never put private author rationales into a published SCORM/QTI payload or learner-facing artifact.

These endpoint names are **proposals** and must be reconciled with existing route authorization/hosted policy inventory before implementation. Reject cross-project IDs and impersonated actor IDs. Preserve tenancy. Consult Pythia's own source/version/consent boundaries when linking artifacts.

**No model writes** from rule evaluation. In the first slice, recommendations are text observations and optional conversation launch, not a patch protocol. Later AI patches must use Chimera's existing review, revision conflict, apply, and undo mechanisms.

## 6. Lifecycle and invalidation

1. Scene is selected or saved.
2. Local detectors evaluate only relevant fields in a bounded time budget; no provider API request.
3. Candidate is matched against actor decisions and deduplication keys. Suppress identical findings previously acknowledged/dismissed.
4. Quiet indicator appears only if the mode and throttling permit.
5. Author opens the observation and selects an action.
6. On **Discuss**, present a context disclosure and initiate the existing Pythia consultation only on explicit confirmation.
7. A significant scene edit invalidates only affected fingerprints; compare again when stable.
8. If the scene is deleted, linked decisions are retained only under documented retention policy; no broken UI pointers.
9. Changing accounts, projects or tenants immediately switches authorization scope and clears any transient suggestion content for the previous scope.

Performance budget target for prototype: deterministic evaluation within 150 ms for an ordinary selected scene (measure on representative large fixtures); do not block save, render or validation. No polling loop, no per-keystroke server traffic, no hidden token usage.

## 7. Privacy, costs and safety

- The consent event must precede any model API use and must be clear about the exact context shared. Opening the indicator itself never calls a model.
- Never silently send unpublished source files, identifiable learner information, user private notes, or author rationales to Pythia.
- Where author consent explicitly includes rationale for deeper consultation, show the included text in the preview. Avoid automatically exporting a prior author's intent to another user.
- Request timeouts, disconnected providers, and missing subscription entitlements degrade to the local advisory view, never stop authoring.
- No new billing or repeated background generation. Existing consultation billing and metering remain authoritative.
- No competency scoring, behavior ranking, performance badges for dismissing counsel, or AI judgment of author professionalism.
- Preserve the separate mandatory accessibility/security/publish validation pathways.

## 8. Implementation plan and dependencies

### QC-0 | Baseline and consent contract
**Deliverable:** documented mode setting, first-use disclosure, author-scope design and candidate/disposition schemas. Review against current auth and privacy code.  
**Dependency:** Studio shell and current Pythia adapter source.  
**Exit:** spec review, permission/retention decisions, synthetic UX copy approved. No model calls.

### QC-1 | Local engine (first functional slice)
**Deliverable:** pure, deterministic candidate functions for 1–2 verifiable rules; sample fixtures; stable finding keys; fingerprint invalidation; prioritization and suppression.  
**Dependency:** existing Scene/Experience structures.  
**Exit:** unit tests for detection, false positives, no-scene state, changed/unchanged fingerprints, and large fixture budget. No network access.

### QC-2 | Quiet Studio surface
**Deliverable:** a neutral indicator and compact inspector card, open/close/focus behavior, Silent/Quiet/Collaborative preference, snooze and nonmodal dismissal.  
**Dependency:** QC-1.  
**Exit:** keyboard, screen-reader, responsive, reduced-motion tests; no focus stealing; no toast; no forced interaction. **Keep build flag default-off.**

### QC-3 | Durable human intent
**Deliverable:** per-actor/project decision persistence and accessible history. Optional rationale and occurrence/scene/project-rule scope, explicit cross-user privacy boundary, audited permissions and retention.  
**Dependency:** QC-1/2 and existing hosted/local auth.  
**Exit:** stale revision, scope, cross-tenant, deleted-scene, concurrent author, and regression tests.

### QC-4 | Consultative handoff
**Deliverable:** explicit "Discuss with Pythia" context preview and user-triggered conversation, with observation plus author-provided rationale optionally included. Reuse `PythiaTalkPanel`, existing Pythia scopes, and proposal review.  
**Dependency:** QC-2/3 and tested Pythia connectivity.  
**Exit:** opening/closing/dismissing never starts a provider request, consent is logged, provider-down/offline behavior leaves authoring unaffected, and actual model answers can respectfully revise prior advice.

### QC-5 | Expert acceptance pilot
**Deliverable:** synthetic expert authoring scenarios plus an invited mixed-experience pilot, structured observation of interruptions, false positives, trust, clarity, task completion, and voluntary counsel engagement.  
**Dependency:** accepted Studio and candidate rules.  
**Exit:** conservative defaults confirmed or revised with evidence, not assumed.

**Sequencing:** one small PR per QC stage against the Chimera 2.0 development branch. Qualify against the base branch with exact-head GitHub CI and local flagged-on browser smoke. Do not merge speculative detector rules into production.

## 9. Acceptance tests / negative cases

1. Quiet is default for a first-use author when Studio counsel is enabled; user can select Silent and see zero unsolicited indicators.
2. Identical scene saves do not generate repeated indicators, network calls or duplicate history.
3. Indicator never auto-opens, moves focus, plays sound, shows red alarm styling, or blocks Edit/Preview/Export.
4. Detector reports only verifiable scene text and appropriately uncertain wording; intentionally ambiguous design is not called defective.
5. Author marks "Intentional design" without explanation; finding stays quiet. Later rationale can be edited or removed.
6. Marking a suggestion intentional doesn't modify scene content or suppress unrelated accessibility validation.
7. New material content can cause renewed consideration with acknowledgment of prior author intent, not repetitive nagging.
8. With Pythia disconnected or unlicensed, scene editing/export and local advice remain usable.
9. No model POST on candidate calculation, opening an observation, dismissing it, or opening the local history.
10. Context preview shows exactly the scope to be sent; only explicit confirmation issues a Pythia request.
11. A model proposal cannot overwrite a scene without existing author approval, revision check, and validated diff.
12. Two authors on the same project can have different Quiet/Silent settings, without leaking personal rationale.
13. Tenant or project switching never displays the previous user's notes or candidate text.
14. Older 1.x clients and exports remain unaffected; new fields cannot be accidentally serialized into SCORM.
15. The design is evaluated by experienced authors: measure "felt judged", "interruption", "usefulness" and "ability to disagree" in addition to task outcomes. No author quality score.

## 10. Rollout / decision gates

- **Current action:** specification and work breakdown only. No production activation.
- **First prototype:** manual/heuristic-only local Quiet Counsel with two high-confidence detectors and synthetic data.
- **Staging:** verify permission boundaries, performance and default-off gating; avoid provider billing.
- **Pilot:** invite experienced professionals and monitor unwanted interruptions or distrust. Permit disabling the feature immediately.
- **Release:** enable Quiet Counsel as *proposed default* only after human acceptance, false-positive calibration and owner approval. No silent activation for existing 1.x users.

## 11. Success definition

Success is **not** the number of suggestions accepted. Success is an author saying: "Pythia noticed something worth considering, understood why I made my choice, and let me carry on."

The capability should feel like a respected peer's discreet note, never a performance review.
