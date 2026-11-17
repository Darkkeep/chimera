# Chimera 2.0 | Studio Architecture Audit (first pass)

Date: 2026-11-17
Status: source inspection / design boundary only; no Studio shell implementation or live usability study
Related: [2.0 authoring charter](chimera-2-authoring-charter.md), Issues #28 and #29
Inspection basis: `frontend/src/App.tsx`, `SceneVisualEditor.tsx` integration, documented scene/timeline/authoring behavior and existing component paths on `main`. Follow up with local running app and screenshot/browser evidence before claiming observed friction.

## Confirmed current component seams

| Concern | Current ownership | 2.0 reuse strategy |
| --- | --- | --- |
| Project/workspace navigation and workflows | `frontend/src/App.tsx` | Extract workspace orchestration, avoid changing persistence |
| Selected scene and authoring draft state | `App.tsx` state and scene handlers | Keep stable IDs/revisions; extract selection and editor launch coordination |
| Canvas, move/resize, properties, layers, undo | `SceneVisualEditor.tsx`, `EditorDialog.tsx` | Rehost in continuous Studio pane; do not rewrite geometry |
| Scene and learner rendering | `SceneSurface.tsx`, `CoursePreview.tsx` | Reuse the actual player for preview, not a separate mock |
| Optional media and animation | `SceneTimeline.tsx`, `SceneSurface.tsx` | Docked, collapsible timeline and current transport |
| Consultation | `PythiaTalkPanel.tsx` and backend Pythia adapters | On-demand dock with explicit scene/source context consent |
| Pythia designs and native activities | `SceneExperiencePanel.tsx`, `NativeExperience.tsx`, `HTML5ActivityPanel.tsx` | Existing schema/validation; reviewed proposals only |
| Generated/retained assets | `ConsultationArtifacts.tsx`, media library and promotion endpoints | Unified provenance and shelf, no generated media automatically inserted |
| Assessment | `AssessmentEditor.tsx`, `AssessmentsEditor.tsx` | Contextual edit, retain scored/feedback behavior and QTI export |
| Settings, permission checks, onboarding | `App.tsx`, `AuthGate.tsx`, onboarding modules | Respect existing hosted/local identities and walkthrough surfaces |

## Concrete source observations

- `App.tsx` currently acts as a large central controller (approximately 125 KB at audit), with project state, many boolean modal states, onboarding surface classification, network calls, navigation, draft and permission handling. Extracting the whole application at once would be high-risk.
- `App.tsx` already imports the visual editor, learner surface, timeline-capable media, assessment tools, Pythia consultation and native design panels. The 2.0 shell should orchestrate, not duplicate, those mature components.
- `hasOpenForm` and `currentSurface` depend on many overlay booleans. Studio docked panels require a deliberate state contract or they can accidentally trigger scene preparation, navigation and onboarding behavior.
- Scene preparation can be revision-guarded and called automatically when an editor opens a legacy scene. Studio must continue this logic without invisible project mutation or lost undo.
- Current `SceneLayout.version` and timeline version 1 support stage geometry and timed media. No format migration is warranted merely to recompose the UI.
- Pythia consultation already distinguishes guidance from an author-approved design brief, with proposal review before scene edits. This is a core competitive asset, not a flow to replace with predetermined choices.
- Existing native interactions include branching, hotspot, sequencing, reveal and guided practice; scope must be verified on an actual learner playback fixture before selecting the golden path.

These are code/document observations, not quantified usability-test results.

## Proposed minimum safe refactor

1. Introduce a local-only, default-off `StudioShell` presentation container with slots for scene rail, existing `SceneVisualEditor`, inspector, learner preview, optional timeline and on-demand Pythia. Do not reimplement model operations.
2. Build a narrow adapter around existing `App.tsx` scene selection, edit launch, commit/cancel, permission, and revision state.
3. Preserve the existing launch and legacy editor routes while Studio matures, so users can revert during pilot sessions.
4. Extract only the necessary UI region and state, using regression tests for modal focus, source import, revision conflicts, save/cancel, selection and project switching.
5. Before routing real users to Studio, run a synthetic author journey manually on desktop and narrow viewport, then repeat across Chromium, Firefox and WebKit with keyboard-only navigation.

### Focused interface hypotheses to validate

- Most authoring tasks should place the scene stage and selected properties on one screen.
- A scene navigator and context inspector should outperform a series of modal dialogs for common changes.
- Pythia should be accessible from the selected scene without blocking manual editing or automatically sharing source text.
- The optional timeline should stay collapsed during text-only and interaction-only tasks.
- The author must be able to preview the actual learner interaction at any point without changing saved source.

## First golden-path fixture

Create a fictional workplace training course, 15–20 minutes total:

1. Scene: learning goal and scenario setup.
2. Scene: explanatory concept with a source note.
3. Scene: branching choice with two plausible responses and consequence/feedback.
4. Scene: native vector or animated image with attribution and text alternative.
5. Scene: knowledge check with feedback.
6. Validate and export to SCORM 1.2 and SCORM 2004.
7. Launch and inspect both packages in an actual learner runtime.

Repeat with Pythia: permit freeform consultation, agree a human-edited brief, propose a bounded change, review its diff, retain a generated/registered asset if available, and apply approved revisions. Do not pay for new generation without a separate authorization.

### Metrics to collect in pilot

- Number of navigation actions and dialogs per task.
- Time to first saved playable scene, first feedback edit, and first successful export.
- Number of wrong turns, errors, lost edits and recovery actions.
- Number of unrequested Pythia prompts or model calls (target zero).
- Whether the author can complete the full task with Pythia disconnected.
- Whether a novice can explain which material is proposed, approved, authored or published.

## Risks and gates

- Permission logic, especially hosted administration and cross-project work.
- The central `App.tsx` state machine and onboarding assumptions.
- Timeline and native experience preview/export parity.
- A new dock controlling an old modal lifecycle.
- Accessibility of selection, resizing, drag/drop and keyboard alternatives.
- Existing project backups, old save formats and release compatibility.

No production deployment, Pythia changes or format migrations authorized from this audit.
