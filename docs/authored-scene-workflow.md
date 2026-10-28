# One authored scene

Chimera authors one scene composition. Stage, storyboard, course preview, and delivery outputs use that composition with the same resolved project defaults. Fidelity, Hybrid, Native, and Template remain legacy API values, not authoring decisions.

## Authoring

- Open **Edit scene**. **Stage** edits the composition; **Details** edits its content and settings.
- **Compare with original** temporarily shows the retained PowerPoint rendering. **Return to scene** restores Stage. Comparison does not change the scene, previews, exports, or browser preferences.
- In Details, choose a **Template** and select **Apply template**. Review Stage, use Undo/Redo, and **Save scene** to keep the composition. Cancel leaves the saved scene unchanged. Reusable image assets imported while preparing a template may remain in Media library.
- **Project background** imports images directly and changes the project default with one save. Inheriting scenes update automatically. Explicit scene images and **None** remain exceptions; **Use project default** restores inheritance.
- A source-deck background is retained separately as a baseline. It is used when an inheriting scene has no project background. A source baseline is not an authored scene override.

Existing browser Source/Extracted view preferences no longer control rendering. The original is a comparison reference, not an alternative authored output.

## Existing projects

An editor with scene permissions prepares missing scene compositions once through `POST /api/projects/{id}/authoring/prepare`, with an `If-Match` revision. Existing compositions are preserved. Missing layouts are recovered from retained PowerPoint/template sources; new scenes use a native composition. Scene IDs, instructional text, notes, assessments, references, and original files are retained.

Preparation writes one revision with the previous storyboard in history, and is idempotent. A stale revision is rejected. Missing source material produces an error rather than replacing an imported slide with a generic layout. Review-only access does not trigger preparation.

PowerPoint conversion still has representational limits. Stage lists import limitations and original comparison remains available. Shared rendering does not establish pixel-perfect reproduction of every PowerPoint effect or approval to publish.

## Outputs

SCORM 1.2, SCORM 2004, and standalone delivery resolve the authored composition and background inheritance. Original source-preview images are not included when a scene has an authored layout.

Word storyboard exports embed static snapshots produced by the delivery player, accompanied by editable instructional text, notes, media information, and optional answer keys. Legacy scenes stop motion for print. Timed scenes use their authored **Word snapshot time**, with written clip/cue timing in storyboard records; interactive assessments are shown in their initial unanswered state. Original source screenshots are not substituted for unavailable authored snapshots.

Native shape appearance and the shared scene clock are described in the [timeline procedures](user-guide.md#schedule-scene-objects-audio-and-video). Media clips retain source bytes, use separate source-in/out and scene-start times, and share pause/seek/restart with native animations. Existing attachments are not silently converted. Bevel/emboss are browser lighting approximations, not a guarantee of PowerPoint effect fidelity.

The document renderer needs Node.js, the root production dependencies (`npm ci --omit=dev`), and Chromium (`npx playwright install chromium`). Playwright is pinned as a production dependency. Rendering uses a temporary localhost-only package, blocks external network requests, and removes temporary output afterward. A failed renderer returns an actionable export error.

The [illustrated user guide](user-guide.md) and its [PDF edition](user-guide.pdf) describe this workflow. Current authoring, comparison, background, template, and preview captures are recorded in the [authored-scene screenshot manifest](user-guide/refresh-authored-scenes-2026-10-27.json); unchanged screenshots retain their earlier provenance.

## Local verification

Copied Test Flight projects and evidence are under `workspace/authored-scene-review-20261028/`. The local preparation check preserves all 16 scenes and their original source bytes. Browser parity checks compare editor, storyboard, and course-preview element geometry and styles across every copied scene. This is local engineering evidence, not human acceptance or external LMS qualification.
