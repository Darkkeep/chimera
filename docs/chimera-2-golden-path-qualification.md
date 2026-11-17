# Chimera 2.0 | Manual golden-path qualification

**Status:** Implementation and test fixture committed, exact-head GitHub CI qualification pending.  
**Branch:** `feature/chimera-2-golden-path-qualification`  
**PR:** #40 (stacked, draft; do not merge directly to production)
**Safety:** `VITE_CHIMERA_STUDIO_ENABLED` remains default-off; no Hostinger deployment, paid model run, Pythia change or schema migration.

## Tested authoring journey

A fully synthetic lesson, `Studio manual golden path`, has three saved scenes:

1. **Recognize the signal**: content scene with native text, image, author-edited title/bold formatting and contextual image alternative text.
2. **Choose a response**: native branching interaction. A human author sets the decision question, both choices and distinct feedback in the **inline Studio interaction editor**, reviews and saves with the existing revision-checked scene API. The preview is the real `NativeExperience`.
3. **Check your judgment**: a scored true/false knowledge check with attempts, correctness and feedback. The test changes the prompt through the **existing real question editor**, then saves.

The browser opens the course's actual learner preview, then builds **both SCORM 1.2 and SCORM 2004** through real export routes. Each ZIP is extracted, its `imsmanifest.xml` and playback assets are checked, and the packaged `storyboard.json` is examined for all three scenes, the branch and its scored question, and the authored image alternative text. No model/consultation POST may occur.

## Setup versus authored steps

The fixture starts with a real project, three scenes, uploaded synthetic PNG and a valid question created through the project's **actual authenticated APIs** to avoid coupling the visual/interaction export test to onboarding. It does **not** prove that every project/scene/assessment creation click path in Studio has been completed by an unaided human author. These must be covered by a separate owner walkthrough before authoring-flow release.

The test changes content through real UI controls; it does not mock save, preview, export, media, SCORM player or Pythia.

## Code changes

- `StudioNaturalInspector`: selected image now exposes alternative text in place, next to its asset and position/size controls.
- `SceneVisualEditor`: image descriptions are a draft setting with unsaved-work detection and revision-checked Save, not an extra side-effect call.
- `App.saveVisualScene`: persists the edited descriptions together with layout and other scene settings on the same existing PATCH.
- `tests/onboarding/studio-golden-path.spec.cjs`: synthetic course acceptance fixture, marked opt-in with `CHIMERA_STUDIO_TEST=true`. The workflow's existing `studio` filter includes this test.

## Qualification evidence requirements

Before declaring Authoring Flow 1.0 completed:

1. GitHub CI successful for the **exact head commit**: backend/visual/auth, full Chromium/Firefox/WebKit regression and opt-in Chromium Studio smoke including this fixture.
2. Both ZIPs extract successfully and retain the same scene text, image alt, native decision and assessment.
3. Test human walkthrough of scene creation, asset upload, inline authoring, interaction construction, question editing, learner preview and export, on desktop and narrow viewport.
4. Test keyboard-only element/interaction editing, focus restoration, unsaved-work cancellation and concurrent revision errors.
5. If requested for actual LMS usage, import and launch both profiles in appropriate LMS test instances. A valid SCORM ZIP is not evidence of LMS-specific compatibility.
6. Ensure classic editor default-off behavior remains unchanged; Quiet Counsel stays parked, specialist-tool brokerage is independent.

**No release recommendation until gates are satisfied.**
