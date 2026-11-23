# Chimera 2.0 charter alignment review

**Superseded status assessment — November 19, 2026:** This review inspected a
stale relocated checkout and missed subsequent work committed in the original
nested checkout. The later menus, direct stage editing, floating properties,
timeline and local Beta acceptance are documented in
[Beta qualification](chimera-2-beta-qualification.md) and the updated
[founder refinement record](founder-ux-refinement-003.md). They have now been
recovered into this canonical local workspace. Read
[local recovery](local-authoring-recovery-2026-11-19.md) for its scope and checks;
the findings below describe the older snapshot, not the recovered interface.

Reviewed November 18, 2026 in `C:\inetpub\Chimera2` against
[charter 2.0.0](../CHIMERA_CHARTER.md). This is a local implementation review and
next-slice specification, not founder acceptance, charter amendment or release
authorization. Existing uncommitted authoring work remains in place.

## Findings and priorities

1. **Activity authoring needs simplification.** `StudioNativeExperienceEditor.tsx`
   initializes a new experience with branching and embeds `ExperienceEditor.tsx`.
   That shared form exposes Concept flow, reveals, eight add-activity buttons,
   raw activity-kind legends and five always-visible color fields. Concept flow
   represents learning content rather than a programming graph, but the overall
   form still makes authors configure the engine before choosing a familiar task.
   A recognizable activity choice and focused configuration are the first priority.
2. **Stage editing and navigation are useful foundations.** The uncommitted
   `SceneVisualEditor.tsx` work provides compact Scene/Insert/Format menus,
   contextual properties and an optional timeline. `scene-navigation.tsx` protects
   unsaved work through the existing save operation. Preserve these changes rather
   than replace the editor. Human ease of use remains unqualified.
3. **One project does not mean every experience can occupy the same scene.**
   `StudioShell.tsx` and `StudioNativeExperienceEditor.tsx` block native activities
   over assessments, HTML5 or saved timelines. A saved visual scene can therefore
   require a separate activity scene. Preserve this safeguard, explain it before
   authors invest in configuration, and test the complete course-level journey.
   This review does not authorize changing those compatibility rules.
4. **Pythia remains optional and bounded.** Studio opens consultation on demand;
   the manual editor saves through the existing PATCH endpoint with `If-Match`.
   Backend permission mapping requires `scene.manage`. Artifact retrieval and
   structured engine-draft downloads already exist in `ConsultationArtifacts.tsx`;
   content-draft capability checks and proposal application also exist. Presence
   of these pathways does not qualify the complete PowerPoint-to-Pythia-to-publish
   journey. Do not introduce a second project model or automatic application path.
5. **External ingestion already has explicit limits.** The user guide documents
   offline HTML/ZIP and bounded single-SCO SCORM import with review, attribution,
   text alternatives and isolation. Engine-draft JSON downloads are specifications,
   not proof of executable Unreal ingestion. H5P compatibility and rights remain
   investigation work; no general runtime or portability claim is justified.

## Instruction reconciliation

The earlier `docs/chimera-2-authoring-charter.md` is a proposed authoring baseline,
not the governing version charter. Added a short authority note linking it to
the root charter while retaining its compatible implementation and acceptance
guidance. Its application-release restriction remains separate from charter
version 2.0.0. No existing acceptance gates were removed. The initial charter
and agent instructions remain uncommitted; founder review is still recorded as
pending rather than inferred from authorization to perform this review.

## Next bounded slice: choose and configure a ready-made activity

Support the charter's initial authoring task by letting an author choose an
existing activity before encountering its detailed configuration.

- On a new eligible interaction, offer a compact, accessible choice of branching
  decisions, hotspots, sequencing or guided practice, each described by its
  learning purpose. Retain discoverability of the other existing native types.
- Reuse `newActivity`, `ExperienceActivityEditor`, the existing `Experience` model
  and `NativeExperience` player. Keep draft ownership in the existing editor;
  add no parallel persistent model, second engine or backend schema.
- Show the selected activity's relevant fields first. Put optional concept
  flow, reveals and appearance controls behind explicit disclosures. Preserve
  all existing content when opening or editing an experience with multiple parts.
- Keep author review, external-link review, permissions, revision checking,
  navigation protection and the actual learner preview authoritative.
- Explain incompatible scene content before opening configuration. Retain the
  separate-scene path instead of replacing or silently deleting visual content.
- Preserve classic behavior. Any shared-editor changes need a Studio-scoped
  presentation option with its current default behavior retained.

Acceptance for the slice: a fresh synthetic project can be authored through the
UI by creating a scene, editing text, uploading/inserting an image, adding a
ready-made activity in a compatible scene, previewing, saving and reopening.
Confirm image/text/activity retention after reload, keyboard choice and focus,
narrow layouts, rejected stale/unauthorized writes and no provider requests.
Existing preview/export and classic regressions must continue passing.

Founder walkthrough: observe a fresh author attempting that task; record wrong
turns, unclear labels, completion and recovery. Founder acceptance must be
explicit and separate from automated results. UI implementation should follow
the repository's applicable design workflow before changing the presentation.

## Verification on this review

- Two focused Chromium tests passed in 18.7 seconds: `studio-native.spec.cjs`
  and `studio-golden-path.spec.cjs`. They exercised manual native editing,
  persistence, actual preview and both SCORM profiles without Pythia requests.
- These tests seed scenes and imagery through API fixtures. They do not prove
  that a novice can create the entire representative task through the UI.
- The first launch failed before tests because the test harness selected global
  Python without FastAPI. Rerunning with `CHIMERA_TEST_PYTHON` pointing to
  `backend/.venv/Scripts/python.exe` succeeded. No dependencies were changed.
- Run settings: `CHIMERA_STUDIO_TEST=true`, `VITE_CHIMERA_STUDIO_ENABLED=true`,
  one Chromium worker, `playwright.onboarding.config.cjs`; output under
  `workspace/charter-review/test-results`. Backend fixtures used an isolated
  onboarding workspace, not the author's project data.
- No fresh full CI, cross-browser suite, screen-reader session, hands-on mobile
  review, live Pythia journey, H5P qualification or hosted/LMS acceptance was run.
- No application code changed in this review. No commit, merge, migration,
  deployment, paid generation or production change was performed.
