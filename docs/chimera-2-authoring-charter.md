# Chimera 2.0 | Authoring Experience Charter and First Vertical Slice

Authority clarification (2026-11-18): [CHIMERA_CHARTER.md](../CHIMERA_CHARTER.md)
is the governing product charter. This earlier proposed baseline retains compatible
implementation guidance and acceptance gates; it does not independently amend
product direction. Its restriction on advancing the application release to 2.0
does not restrict the independently versioned product charter (2.0.0).

Status: proposed design baseline, not an implemented feature or a release approval.
Started: 2026-11-17
Branch: `feature/chimera-2-authoring-foundation`
Production rule: `chimera.darkrogue.io` remains on its existing 1.x deployment. No auto-deploy, data migration, or production configuration change from this branch.

## Product thesis

Chimera 2.0 is a modern, human-directed learning experience authoring and publishing environment. Pythia is an independent, subscription-capable learning-intelligence service: it consults, challenges assumptions, proposes designs, and generates bounded content or assets. Chimera remains usable without Pythia and owns editing, validation, preview, author approvals, project persistence, and portable publication.

Do not build an LMS. Learning assignment, delivery administration, and records belong to adjacent systems, including Experience. Existing PowerPoint modernization is a valuable input path, not the definition of the new authoring workflow.

This charter derives from the founder's 2026-11-17 2.0 direction and the competitive discussion's identified themes: learner-design consultation must leave room for the human to express original ideas; intuitive authoring is the competitive gap; Pythia and Chimera should gain interoperability without losing autonomy. Competitor pricing and willingness-to-pay are not established by this document.

## Existing implementation to reuse, not rebuild

- `frontend/src/SceneVisualEditor`, `SceneSurface`, and `EditorDialog`: existing stage, scene editing, layers, shapes, text, media placement, and undo/redo.
- `frontend/src/App.tsx`: existing project, storyboard, editor, media, assessment, preview, sources and consultation integration. Investigate state ownership and navigation seams before extraction.
- `frontend/src/PythiaTalkPanel`, `SceneExperiencePanel`, `NativeExperience`, `HTML5ActivityPanel`, `ConsultationArtifacts`: existing consultation, native interaction, and artifact pathways.
- Existing visual layout v1, timeline v1, scene/native experience fields, source deck preservation, revision-checked writes, permission checks, asset library, and SCORM/QTI/Word/JSON exports.
- Existing native SVG/GIF provenance, retention, promotion, passive-vector gate, and asset preservation work.
- Reference: `docs/visual-scene-authoring.md`, `docs/authored-scene-workflow.md`, `docs/scene-timeline-implementation.md`, `docs/talk-to-pythia.md`, `docs/release-native-artifact-integration-2026-11-10.md`.

The initial authoring shell should be a UI composition/refactor over established data and playback contracts. Avoid changing persisted formats, SCORM runtimes, or assessment semantics in the first slice.

## Non-negotiable design principles

1. Human-directed: freeform consultation and visible author decisions, never a mandatory multiple-choice funnel. AI suggestions remain editable, rejectable, and separately accepted.
2. One source of learning truth: Pythia proposes versioned patches/assets against Chimera's existing experience model; the human and AI do not maintain rival scene representations.
3. AI optional: all first-slice authoring actions must work offline or without Pythia, without degraded controls or blocked publishing.
4. Scene-centric: a dominant canvas and local preview; a compact scene navigator, context-aware inspector and optional timeline. No proliferation of full-width top toolbars.
5. No hidden writes: apply proposals only after diff/review; protect current scene revision, undo, asset provenance, and project authority.
6. Trustworthy playback: what the author previews is what SCORM/standalone playback uses. No decorative mock interaction substituted for an actual learner behavior.
7. Accessibility from the start: keyboard authoring alternatives, screen-reader labels, focus, contrast, reduced motion and accessible equivalents for interactive content.
8. Operational isolation: development/staging separated from Hostinger production, seeded with synthetic/non-sensitive projects.
9. Clear build identity: owner-visible version, Git SHA, build timestamp, environment and supported contract versions; never expose secrets.
10. Resource discipline: one-person-maintainable increments, reuse of existing components/tests, no paid generation without explicit approval.

## Authoring Studio interaction contract (proposal)

Main workspace:
- Top bar: project and save status, Undo/Redo, Preview, Validate, Publish; no multi-toolbar stack.
- Left scene rail: hierarchy, add/reorder/search scene, source-deck marker, review status.
- Center stage: direct text/media/interaction edits, active selection, responsive canvas; learner preview one click away.
- Right contextual inspector: only selected item/scene properties, useful defaults, accessibility and behavior controls.
- Bottom area: optional timeline and narration/media transport, collapsed for ordinary text/interaction editing.
- Pythia panel: on-demand dock/overlay with consultation, selected-scene context disclosure, preserved replies and artifact shelf. It may not cover the canvas by default.
- Project-level Sources, Media, Assessments, Review and Publishing remain discoverable workspace destinations, not simultaneous top bars.

Design full journeys for desktop/laptop and narrow viewport, pointer and keyboard. No assumption that the concept is approved without a hands-on prototype.

## First representative vertical slice

Create a 15–20 minute **synthetic scenario-based learning experience** (not real patient or sensitive data) built around:
- Introduction and measurable objective.
- Explanatory content with source note.
- One branching decision with meaningful feedback and return/recovery.
- One approved reusable SVG or GIF illustration, with text alternative.
- One short knowledge check.
- Learner preview, accessible navigation and published SCORM 1.2/2004 output.

Two author paths must produce equivalent results:
A. Author builds everything manually, without Pythia calls.
B. Author consults Pythia freely, reviews a proposed experience/patch, accepts selected parts, retrieves and approves an asset, and finishes via manual editing.

Existing native interactions may be reused; when a desired behavior is unsupported, document the gap rather than fake it or change export logic without qualification.

## Acceptance criteria

- An inexperienced evaluator can find a project, open scene editor, add/edit a scene, attach/reposition media, preview, change feedback and publish without knowing the current app's legacy navigation.
- Author can complete the same workflow with Pythia unavailable, and with Pythia enabled after an unconstrained consultation.
- Every Pythia proposal shows origin, target, before/after, approvals and rollback; stale revisions fail closed and surface a recovery path.
- Existing 1.x project imports/opens without destructive migration; changes on a 2.0 fixture do not mutate production.
- SVG remains safely passive when promoted; animated GIF original retains frames/timing; media attribution/accessibility preserved.
- Real learner behavior agrees between author preview and SCORM 1.2/2004; add deterministic browser coverage.
- Keyboard, focus, reduced-motion and responsive authoring cases tested.
- Owner-facing Build Information is accurate and externally visible only to authorized operators as appropriate. Version is not inferred from a frontend label alone.
- Build/tests pass in feature CI; a separate founder-reviewed staging release is required before any production deployment.

## Planned sequence and gates

### Phase 0: protect and measure
- Inspect live Hostinger build identity, deployment triggers, backups and current integration health; document uncertainty if unavailable.
- Preserve 1.x release path. Establish dedicated 2.0 branch, isolated dev/staging configuration and safe sample projects.
- Capture current task baseline: steps, time, errors and confusing controls for manual authoring and Pythia-assisted authoring.
- Implement owner-visible build provenance using build-time supplied values with a backend identity endpoint if needed; verify output against actual deploy.

### Phase 1: navigation + editor shell
- Audit `App.tsx` state ownership and current editor dialogs; propose a small component-extraction boundary.
- Implement one coherent Studio workspace behind an explicit dev-only feature toggle. Default off in 1.x.
- Reuse `SceneVisualEditor`, `SceneSurface`, timeline and current save/undo paths. No data-schema changes in this phase.
- Qualify one simple manual scenario authoring task in Chromium/Firefox/WebKit plus keyboard and narrow viewport.

### Phase 2: Pythia collaboration
- Expose on-demand contextual consultation and current scene/source sharing consent.
- Introduce a versioned, reviewable proposal-to-scene adapter using current contracts; do not let model output bypass Chimera validation.
- Surface answer-to-artifact provenance and project retention clearly.
- Make accept/decline/modify granular and undoable.

### Phase 3: experience + media qualification
- Author actual branching, feedback and knowledge check with native components.
- Preview/export consistency, SVG/GIF fidelity, accessibility and SCORM qualification.
- Run the synthetic manual-vs-Pythia author task and record completion/friction.

### Phase 4: limited pilot
- Test with invited authors; capture friction reports and authoring task outcomes.
- Scope release based on observed usability and defects rather than feature count or unverified competitive assumptions.

## Initial engineering work items

1. **BUILD-ID:** implement and test accurate build metadata in UI and authenticated/approved backend endpoint; document the source of each field and Hostinger deployment verification.
2. **STUDIO-AUDIT:** inventory `App.tsx` navigation state, dialogs, `SceneVisualEditor` interfaces, `SceneSurface` preview and tests; list components reusable unchanged.
3. **STUDIO-SHELL:** build feature-flagged authoring shell using existing editing component; no schema migration.
4. **MANUAL-GOLDEN-PATH:** author synthetic representative interaction entirely without Pythia; automate core browser smoke.
5. **PYTHIA-PATCH:** design versioned, author-reviewed patch contract and provenance linkage; test permission, stale revisions and offline graceful handling.
6. **EXPORT-PARITY:** compare scene interaction, original SVG/GIF assets, and SCORM 1.2/2004 learner playback.

## Change control

No production Hostinger deploy, Render restart, new paid generation, new account/credential, 1.x schema migration, or automatic default-branch merge is authorized by this charter. Keep work in 2.0 branch and review via PR. Do not advance a version identifier to 2.0 until acceptance confirms the release designation. Current documented 1.x baseline is 1.2.0, but actual Hostinger running commit must be independently verified.
