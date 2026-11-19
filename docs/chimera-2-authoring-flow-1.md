# Authoring Flow 1.0 | Implementation and qualification

**Branch:** `feature/chimera-2-authoring-flow-1`  
**PR:** #39 (draft; stacked authoring work)  
**Scope:** safer classic inspector plus an inline, provider-free manual native interaction authoring path. **No production deployment.**

## Delivered in this candidate

- Fixed the classic editor regression by keeping inspector `details.visual-inspector-section` as direct children rather than introducing a wrapper. Studio still has the compact selection-aware natural properties panel.
- Studio inspector exposes **Build learner interaction** on eligible content scenes and **Edit learner interaction** for scenes with existing native experiences. Question scenes retain their knowledge-check path.
- `StudioNativeExperienceEditor` reuses the existing `ExperienceEditor` and actual `NativeExperience` player, side by side within the Studio Stage. Its supported native types include branching, guided practice, sequencing and hotspots.
- Manual changes remain local until author reviews and presses **Save learner interaction**. Save sends only `experience` via the existing scene PATCH endpoint and an `If-Match` revision captured when editing started. Conflict and validation errors remain visible in the editor; no generated Pythia treatment or provider call is required.
- The standalone legacy `SceneExperiencePanel` manual start button is repaired: for a new manual treatment with no Pythia draft ID, a reviewed `experience` is saved through a revision-guarded scene update instead of the no-op `review()` path.
- No native experience silently replaces a question, HTML5 activity or existing timeline. No scene schema or backend auth/API change is required.
- The Studio opt-in browser smoke now checks inline manual authoring, preview, and persisted branching experience with no model/design request.

## What remains

**This is not the completed Authoring Flow 1.0 release.** It needs:

1. Exact-head CI green across backend, frontend build and browser suites, including the flag-on Studio smoke and classic inspector tests.
2. Fully authored synthetic learning experience: create three scenes, add and format text and imagery, attach alt text, author a meaningful branching decision, add a graded knowledge check.
3. Play the saved experience from course learner preview, validate and export SCORM 1.2 and SCORM 2004. Inspect the packages and launch them through existing playback/qualification tests.
4. Editor UX review on 1440, 1100 and 390 px layouts, with keyboard-only authoring and focus checks. Confirm selected object inspector retains controls and undo behavior.
5. Concurrency: two editing sessions to confirm a stale scene save fails with a useful error and does not overwrite a newer revision.
6. Permissions: actor without scene.manage cannot save native experiences. Reader/Reviewer does not see enabled editing actions.
7. Regression: classic modal scene editing, Pythia-authored treatments and source deck fidelity remain unchanged.

## Design decisions

- Favor a narrow, real manual path over a broad set of mocked interactions.
- The inline interaction editor retains the existing editing forms and player; the next design pass can simplify their controls while preserving persistence and validation.
- Quiet Counsel stays parked, and Pythia's authorized third-party specialist tools are a separate Pythia integration track.
- Do not merge or deploy to Hostinger before owner acceptance.
