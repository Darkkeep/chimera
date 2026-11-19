# Founder UX Refinement 003 — compact scene controls and navigation protection

Local implementation verified on 2026-11-17 in `C:\inetpub\chimera\chimera`, branch `feature/chimera-2-golden-path-qualification`. HEAD remains `dc21e48`; this work and the prior workspace-menu/preview changes are uncommitted. No merge, deployment, migration, paid generation or Pythia invocation was performed.

## Owner acceptance — Beta baseline · 2026-11-19

The Owner explicitly accepted the current local Chimera 2.0 experience as the Beta baseline: “The Owner accepts this as our Beta baseline.” This accepts the cumulative founder-led authoring UX refinements and current whole-app themes, including DARKROGUE as the purple default, Classic Dark and Light Temple, with the left navigation included.

Accepted working state: `C:\inetpub\chimera\chimera`, branch `feature/chimera-2-golden-path-qualification`, based on commit `dc21e48b56743c6f87572452a45742747e7212a3` **plus the current uncommitted implementation, tests and qualification documentation**. The base commit alone does not identify the accepted Beta. No immutable release commit or tag has yet been created.

This Owner acceptance supersedes earlier statements that founder UX acceptance is pending, for this Beta-baseline scope. Earlier dated test results and limitations remain historical evidence. It does not claim independent competitive benchmarking.

Remaining qualification: exact-candidate full cross-browser CI, physical touch and screen-reader walkthroughs, complete keyboard-only authoring, the broader representative manual-versus-Pythia course, target-LMS acceptance and invited-author pilot outcomes. Pythia collaboration and other unimplemented charter work remain separate backlog items.

No commit, push, merge, version/tag change, deployment, migration, production promotion or generation is authorized by this acceptance. Production remains outside this local baseline decision.

## Theme completion and removal of green accents — 2026-11-18

The first theme pass was incomplete: `.studio-inline-editor` retained local purple-only tokens that masked application theme changes. Removed those overrides, migrated fixed palette declarations in the original 12ui-derived workspace/account/control styling to shared semantic values, unified primary/secondary commands and focus, and expanded Settings into labeled theme rows. DARKROGUE uses the original purple/magenta action gradient. The left menu, collapsed rail, project selector, review/settings sections, libraries, classic shell, Studio, dialogs and floating inspectors now share the theme contract. The founder subsequently requested removal of green: DARKROGUE success/readiness accents are lavender, and the legacy green/navy fallback canvas now follows the selected theme. Authored scene colors and uploaded images are preserved.

Browser inspection exposed an actual repaint issue when changing the browser color scheme around the transformed authored stage: DOM text remained present but disappeared from the light-theme screenshot. The visual editor canvas now maintains its own `color-scheme: light`, and the final Light Temple screenshot visibly retains the same dark authored text. No scene data or export renderer changed.

23 distinct focused Chromium checks passed across runs: 11 authoring menu/inspector/swatches checks, three course-library checks, four theme settings/draft checks, three populated screen/inspector/contrast checks at 1440/1100/390 and two workspace-navigation checks. Initial navigation tests shared other tests' projects; their initial list response is now isolated to the intended empty workspace. Nine theme/navigation checks passed after isolation, and a targeted populated-scene rerun confirmed visible text after the paint-scheme correction. Screenshots: `qualification/founder-refinement-003/full-theme-*`. Build and whitespace checks passed; final green-accent follow-up validation is in the current chat. These are local checks, not final-commit CI or human acceptance.

12ui account sign-in was verified in the shared browser. Visible conversion history contained one Hazard Hunt export, not a Chimera interface design. The older recorded Chimera workspace conversion returned not found through read-only purchase recovery. No generation or purchase was made, and no claim of restored original exports is made. The existing 12ui-derived owning source remains the implementation baseline.

## Whole-app themes — 2026-11-18

Founder direction: DARKROGUE is the purple default for Chimera 2.0, including the entire left navigation. Settings > Appearance also offers Classic Dark (existing charcoal/orange identity) and Light Temple (warm ivory, navy and blue inspired by the supplied Manteion reference). Existing System preference remains supported. Saved light/dark/system preferences remain compatible; fresh or invalid preferences default to DARKROGUE. Selection is browser-local and synchronized across tabs through the existing storage event path.

The app uses shared semantic colors for shell, left menu/rail/drawer, project picker, management, sources/media surfaces, dialogs, floating inspectors, menu commands and buttons. Studio chrome now consumes those same tokens instead of embedding purple-only values. Common primary/secondary controls share shape and state colors; compact editor control dimensions are preserved. Authored scene element colors, uploaded media, activity rendering, scoring and export styles are not rewritten. Changing themes retains an active dirty draft.

Validation: frontend build and whitespace check passed. Seven focused Chromium checks passed: theme switching and persistence at 1440/1100/390, dirty-draft/authored-style preservation across all themes, existing Studio save/undo/navigation smoke, and desktop/mobile workspace menu regressions. Screenshots are in `docs/qualification/founder-refinement-003/themes-*.png`. Shared browser inspection confirmed the purple and ivory app/left-menu skins. The founder then named the purple theme DARKROGUE; final label validation is recorded in the current chat. Human founder acceptance, physical touch/screen-reader review and exact-final-commit CI remain pending. No commit, push, deployment, migration, Pythia or generation calls.

## Media-library aliases — 2026-11-18

Media cards now offer Rename to edit a project-persisted library display name. Enter or Save name commits it; Cancel/Escape restores the saved name and focus. Clearing the alias restores filename display. The original filename remains visible when an alias is set. Authoring image/background/media/activity/HTML5 pickers use the alias, falling back to the filename for existing assets. Existing explicit scene-object and timeline-clip labels remain independently authored; aliases do not automatically rewrite those labels or exported filenames.

Implementation uses a backward-compatible optional `displayName` metadata field (default empty) on assets and the existing metadata PATCH endpoint, media.manage authorization and If-Match transaction path. No database migration or binary/file rename. Alias-only PATCHes preserve transcript, captions and language; existing transcript/caption saves preserve the alias. Asset ID, source path, original filename, file bytes, credit and scene references are retained. Failed permission/stale-revision saves keep the typed draft. Rename is available course-wide without requiring a scene attachment and is hidden without edit permission.

Validation: 30 backend tests passed, including alias preservation/validation/clear, missing and stale revisions, legacy metadata compatibility, shared-copy/media semantics and real author/reviewer permissions. Eleven focused browser checks passed across targeted runs: four rename/reopen/clear/picker/keyboard/error checks and seven existing course-library/media-placement/export checks. Frontend build and whitespace check passed. The first UI run targeted media hidden by the existing scene filter; the tests now explicitly select the whole-course view. Shared-viewer inspection opened the rename field without changing the founder's asset name.

The local API on port 8000 was restarted to load the metadata field after confirming all three current projects matched the nested workspace. Post-restart schema and project-count checks passed. No production service, deployment, merge, migration or paid generation was touched. Screenshot evidence: `docs/qualification/founder-refinement-003/media-alias-2026-11-18/`.

## Discussion beside preview follow-up — 2026-11-18

Scene discussion now occupies a right-hand panel beside the presentation at desktop/tablet widths (verified at 1440 and 1100 pixels). The presentation keeps its transport, scene navigation and slide-text disclosure together. Discussion remains visible while its thread list scrolls. At 800 pixels and below, it stacks after the presentation with normal page scrolling (verified at 390 pixels). Existing comment, reply, filter, resolve/reopen and enhancement handlers are unchanged; no review actions were invoked against the founder's live course during visual inspection.

Nine focused Chromium checks passed: three responsive discussion/comment/reply/resolve/accessibility checks and six player regressions, including timeline clock, fullscreen and media/captions. The frontend build and whitespace check passed. Screenshots are in `docs/qualification/founder-refinement-003/discussion-right-2026-11-18/`. No merge, deployment or model calls.

## Preview player follow-up — 2026-11-18

Learner preview now uses one compact transport bar immediately below the timed scene: Play/Pause, back/forward five seconds, Stop (pause and return to zero), Replay (start playback from zero), elapsed/total mm:ss and a full-width scrubber. Mute appears for scheduled media, Captions appears for captioned media, and fullscreen appears when supported. Controls have names, hover titles and visible focus; the native slider supports arrows (five seconds, Shift for one), Home/End, pointer and keyboard input. Whole-course navigation is compact; scene-only preview omits disabled Previous/End controls. Non-timed scenes retain their existing motion replay controls.

Removed competing motion controls from timed learner scenes. Animation definitions are now created before the existing scene transport captures them, so that transport owns animation pause/seek/replay as well as media timing. Explicit author-side animation replay uses the same clock and still works. No authoring schema, clip coverage policy, assessment scoring or SCORM runtime semantics changed. Mute/captions are local playback preferences, not authored volume or asset metadata changes.

Fixed the visible duplicate timed-text fallback: it is now properly visually hidden while remaining available to assistive technology. Preview canvas sizing respects the authored aspect ratio and leaves room for transport controls. The player itself is approximately 75–90 pixels high across 1440/1100/390 checks, with time-based motion and scrubbing tested at each size.

Validation: **30 distinct focused Chromium checks passed across targeted runs** (six player checks, five existing menu/preview checks, one full authored-course/export path and 18 existing animation/timeline/video-reflection checks). New checks cover paused animation clock positions, keyboard play/seek, stop/replay, fullscreen, real-media mute/caption state, unchanged authored settings and no seek-earned required-media credit. Targeted WCAG A/AA axe scans pass. Frontend build and `git diff --check` pass. The full CI suite was not repeated. Existing export-player controls were not redesigned in this preview-only change.

Screenshots: `docs/qualification/founder-refinement-003/preview-player-2026-11-18/` includes each responsive size and the shared viewer. Physical device and screen-reader acceptance remain pending. No model calls, paid generation, deployment, merge or migration.

## Timeline layer order follow-up — 2026-11-18

Drag an object layer's name in Timeline and layers above or below another row to change stacking order. A drop indicator marks the insertion edge. The list remains front-to-back: higher means in front. Alt+Up/Alt+Down on the focused layer label provides an equivalent keyboard action at 1440, 1100 and 390 widths. Locked layers cannot be moved, and read-only/busy controls remain guarded.

This reorders the existing `visualLayout.elements` array through the existing editor commit/history path. Canvas z-index and the Layers inspector therefore stay synchronized without a new ordering model or persistence path. Dragging labels changes stacking; dragging timing bars retains its existing timing behavior. Object properties, group membership, animation timing, scene timing and media clips are preserved. Audio/video tracks are not object-layer reorder targets; scheduled video retains its existing explicit layer-order setting. Native HTML drag-and-drop is intended for pointer browsers; keyboard shortcuts and the Layers inspector remain alternatives.

Seven focused Studio/transport checks passed, covering real label dragging, canvas and inspector order, Undo-to-clean/Redo, save/reopen and unchanged timing/property payloads, plus keyboard/lock checks at all three widths. Two existing classic grouped-layer/timed-shape checks also passed. Frontend build and whitespace checks passed. No deployment, merge, schema change or model calls.

## Authoring menu system and project swatches — 2026-11-18

The founder approved the complete menu proposal, Adobe-style floating inspectors and project color swatches. Implemented locally on the existing qualification branch, preserving the cumulative workspace/navigation/preview work. No merge, deployment, migration or paid/model generation.

### Implemented taxonomy

- Course toolbar: Course menu (templates, question bank/assessments, completion settings, default background image and accessibility review), Sources, Media library, learner preview, validation and export. Source/media scene filters retain their existing behavior.
- Scene: identity/purpose, canvas size, templates, narration/notes, requirements, content, original-slide comparison and the existing explicit AI draft workflow. A purpose label does not create a learner activity or assessment.
- Insert: text, native shapes, images, scheduled audio/video, manual learner activities, scored questions, HTML5 activities and scene media. All seven native shapes remain supported.
- Format: object properties, text/geometry, bold/italic, text fitting, style, directly applied shadow/bevel/emboss and crop reset.
- Animate: directly apply entrance/emphasis/exit effects; access the Motion gallery and exact timing; stagger text; replay/stop; remove animations. Emphasis is the author-facing name for the existing presentation phase. Multi-object animation editing still uses the existing unlocked target set.
- Layers: selection/order, stage alignment, distribution, grouping, lock/unlock, delivery visibility, duplicate/delete and the single scene Background inspector.
- View: Properties, Style, Motion and Layers inspectors, timeline disclosure, scene navigator visibility, close inspectors and restore panel layout.
- Preview: this scene or whole experience, using the existing guarded routes and separate scene-progress namespace. Undo/Redo remain before Scene; Save scene remains conditional on the existing dirty fingerprint.

### Inspectors

Studio uses nonmodal floating inspectors with pointer/keyboard movement, pin, collapse, right-edge dock and close. A pinned panel can remain open while another is selected. Opening or closing a panel does not save/discard the draft. Panels reuse the original commit/update/history and persistence callbacks. Menus still use top-layer command lists. Existing modal editors/navigation guards remain above the inspectors.

Properties follows the current selection. Style exposes directly applied effects and only the relevant detailed effect settings. Motion has Entrance/Emphasis/Exit galleries and original precision controls. Scene properties have Identity/Content/Notes/Template/Requirements sections, with the explicit AI workflow separately named. The duplicate contextual scene-background-color field is removed. The manual activity editor has a floating Activity inspector with focused Content/Concept flow/Reveals/Activities/Appearance sections and one selected activity at a time; the real learner player remains the primary surface. Studio panels become a single bottom sheet on mobile. Classic editing retains its existing modal layout.

All existing manual activities are exposed: concept flow, reveals, branching, hotspots, sequencing, guided practice, software walkthrough, before/after, external link and scripted conversation. The gallery initializes the requested draft using the existing activity constructors. A scored-question gallery opens the existing assessment editor with the requested type; an existing item is never replaced merely by opening it. Saving a newly inserted scored question sets its scene purpose in the same existing revision-checked PATCH. Question/HTML5 editing keep their dedicated existing editors and approval/scoring behavior. Existing incompatible component combinations remain blocked; they are not converted into canvas objects.

### Colors

The shared picker includes Standard colors, Course colors, Saved swatches, a custom native picker and validated hex entry (three-digit hex normalizes to six). It is used for scene backgrounds, text, shape fills/outlines, effects and activity palette colors. Course colors are collected from structured saved course values plus the active draft, including other scenes. Colors are not inferred from image pixels or imported SVG internals. There is no new course-wide color-inheritance schema.

Saved swatches are scoped by project ID in browser storage, synchronized between mounted authoring surfaces and retained across reopening. Saving a swatch is a workspace preference; applying a color is a normal undoable content edit. Invalid hex never reaches the document. Existing server-side activity contrast validation is preserved. Swatches are browser-local, not shared with collaborators or embedded in SCORM.

### Acceptance matrix for this follow-up

| Criterion | Result | Evidence / reproduction |
| --- | --- | --- |
| Course/scene/object/activity/question command taxonomy | PASS | Course toolbar and Scene/Insert/Format/Animate/Layers/View/Preview commands; capability regression |
| Floating inspectors, pin/collapse/dock/reset and keyboard return | PASS | Open View > Properties, pin, open Background, move with grip arrow keys; close/Escape restores focus |
| Desktop/tablet/mobile inspector and picker layout | PASS | 1440/1100/390 screenshots in `qualification/founder-refinement-003/menu-system-2026-11-18/` |
| Project colors, saved swatches, invalid hex and reopening | PASS | Layers > Scene background > color; save a swatch, reopen; invalid hex leaves draft clean |
| Direct flourishes and multi-phase animation timing | PASS | Insert rectangle; Format > Drop shadow; Animate > Bounce; gallery and timeline regressions |
| Existing-object selection preserves geometry and clean state | PASS | Click an existing text object; no Save/Undo entry or stage shift |
| Revision rejection and all guarded navigation routes | PASS | 403/409 failures retain draft; Save/Discard/Keep editing, scene/workspace/project/preview and browser leave checks |
| Manual activities and scored-question insertion | PASS | Activity gallery initializes hotspots; question gallery initializes and saves true/false; native author review retained |
| Classic and learner/export compatibility | PASS | 13 classic/media/timeline regressions; full three-scene authoring/preview/SCORM 1.2/2004 path |
| Automated panel/picker accessibility | PASS | Targeted WCAG 2 A/AA axe scan, keyboard focus and movement checks |
| Physical touch and assistive-technology walkthrough | NOT TESTED | Founder/device qualification remains pending |
| Exact-final-commit CI / hosted LMS acceptance | NOT TESTED | No commit, deployment or full CI rerun authorized in this refinement |

Final evidence: **67 distinct focused Chromium checks passed across targeted runs**, frontend production build passed, and `git diff --check` passed. The count avoids counting reruns twice. The full CI suite was not repeated. Screenshots and `verification.json` are under `docs/qualification/founder-refinement-003/menu-system-2026-11-18/`. Recommendation: ready for another founder UX walkthrough, with the remaining limits below explicitly open.

### Qualification and remaining limits

The isolated Chromium checks cover 1440/1100/390 layouts, menu overlay geometry, color application/Undo, invalid hex, saved swatch reopening, requested activity/question routing, effect application, pointer selection without edits, keyboard panel movement, pin/collapse/dock/reset, save conflicts, permission rejection, all guarded navigation routes and native browser leave protection. Existing classic/timeline/export checks and the frontend build are recorded with the final verification result in this chat. Initial qualification exposed a selection-toolbar layout shift and several outdated test locators; the toolbar now reserves space, unchanged pointer coordinates do not create history, and tests use the new explicit inspector access paths. Drawer transition completion is awaited before geometry measurements.

Remaining UX limits: dock anchors a panel at the right edge without reserving canvas width or providing Adobe-style tab stacks; saved positions/swatches are local browser preferences; floating activity forms can still require scrolling for complex branching trees; question/HTML5 editors retain dedicated dialogs; imported images/SVG pixels do not supply palette colors. Physical touch and assistive-technology walkthroughs, final-revision CI and founder acceptance remain separate gates. The build's existing chunk-size advisory remains.

## Compact timeline follow-up — 2026-11-18

Animation phases now overlay their owning object's lifetime bar in the same 40px layer row, instead of reserving a second animation row. Entrance, presentation and exit occupy separate thin bands so overlapping phases remain independently reachable. Phase tooltips identify the effect and absolute scene times; focus exposes the phase label. Arrow keys adjust phase start by 100ms through the existing animation alignment and editor commit paths. Locked layers disable phase manipulation as well as object timing. Precise phase start/duration fields remain available for the selected object.

Playback uses compact Play/Pause, Stop/return-to-start, Forward 5 seconds and preview/edit icons, with accessible names and hover labels. Forward is a five-second seek, not a playback-speed change. Scene timing, media scheduling, clip trims/fades/required coverage, cues and video reflections retain their existing state and persistence semantics. Video reflections start collapsed in Studio and remain expanded in classic editing. Shared-viewer inspection did not save, discard or otherwise modify the founder's draft.

Validation: 15 distinct focused Chromium checks passed (three new responsive checks and 12 existing classic timeline/authoring checks), plus the frontend build and git diff --check. Existing coverage includes video fit/save/reopen, reflections, Undo/Redo, audio waveform/trim/fades and SCORM 1.2/2004 timing and required-media completion. New isolated browser checks passed at 1440, 1100 and 390 pixels, verifying animation bands remain within their parent lane, keyboard phase edits and playback buttons. Timeline zoom still uses horizontal scrolling on narrow screens; thin phase bands are best manipulated with the keyboard or precise fields on touch devices. Screen-reader and physical touch walkthroughs remain pending. Screenshot: `C:\Users\darkk\OneDrive\Documents\ChatGPT\Chimera\compact-timeline.jpg`.

## Conditional Save follow-up — 2026-11-18

Studio now uses the existing draft fingerprint to show Save scene only when there is something to save. The action is in the scene header, replacing the close X. The footer Save/Cancel row and the Scene menu's Cancel edits command are removed from the persistent stage. Discard and Keep editing remain available through the centralized navigation guard; classic modal controls remain unchanged.

The header action calls the same existing save function and revision-checked API. Its visibility follows the same dirty value used by the navigation guard, including Undo/Redo. Successful save hides it; failed or stale save keeps it visible with the draft and error preserved. Header height is reserved so its appearance does not move the stage.

Focused regressions cover clean/dirty/Undo/Redo/saved visibility, header placement, absent Cancel/X/footer, rejected 403/409 saves, navigation protection, source-field persistence, both SCORM profiles and the classic modal. A former close-button regression now tests clean scene navigation because that stage action no longer exists. No changes were saved or discarded in the founder's shared-viewer course during inspection.

## Classic command-menu follow-up — 2026-11-18

The Studio menu bar now uses native top-layer dropdown command lists. Opening Scene, Insert, Format, Layers, Media or Preview does not resize or replace the canvas. Detailed commands open the same existing controls in a floating dialog; their values remain in the original editor draft and save path. Undo/Redo remain before Scene. Background is under Layers. Timeline is removed from the menu bar and remains available in its collapsible panel. Keyboard arrows, Home/End, Escape, outside-click dismissal, click-to-toggle and menu switching are supported.

Both the stage Preview button and the editor Preview menu offer **This scene** and **Whole experience**. Scene-only preview reuses CoursePreview with a filtered view and a separate browser-progress namespace; it does not change the saved course, exports, or whole-experience progress. Its header identifies scene preview rather than reporting whole-course completion. The explicit course-level Learner preview action continues to open the full experience. Unsaved changes use the existing navigation guard before either preview opens.

Local checks include canvas geometry before/after all six dropdowns at 1440, 1100 and 390 pixels, floating property edits, keyboard focus, menu switching, scene-preview progress isolation, existing scene editing, source/media filtering, native interactions, revision conflicts and both SCORM profiles. Forty of 41 checks passed in the broad run; the remaining smoke test exposed hover-to-click menu switching, which was corrected and verified with the five menu tests and the original smoke (6 passed). The build passed. Classic-mode and final whitespace checks are recorded in the chat execution evidence. No production changes or paid/model calls.

## Direct-stage follow-up — 2026-11-18

Founder review removed the intermediate scene inspection view. Studio now opens eligible selected scenes directly in the existing stage editor after source preparation. Existing native experiences open in their manual interaction editor. The duplicate Edit scene properties entry and separate inspector/notes/timeline landing presentation are removed.

Stage, Pythia, Interaction and real learner Preview are together in the stage command row. Question and HTML5 scenes retain their specialized editor actions. Interaction eligibility still preserves existing timelines, assessments and HTML5 content; no replacement bypass was introduced. Opening Pythia remains an explicit action and does not send a model request.

The centralized dirty guard remains active when switching scenes or editing modes, entering preview, opening course libraries, changing workspaces/projects, or cancelling a draft. Save and explicit discard return to the relevant editing surface; there is no inspection-screen detour. In persistent Studio editing, Close/Cancel resets the editor after the guard rather than leaving a read-only landing screen. Classic editing retains its modal behavior.

Local verification: 30 existing regressions passed in the main run; two interaction/export tests needed exact button-name selectors after the shorter Interaction label was introduced, then passed alongside four new direct-stage tests (6 passed in 17.9s). The classic-disabled check also passed (1 in 8.2s). Total: 37 distinct Chromium regressions passed across the focused runs. Direct entry and selection were tested at 1440, 1100 and 390 pixels; guarded Stage/Interaction switching and no-model-call Pythia opening were exercised. TypeScript/Vite build and diff checks passed. No merge or deployment.

The shared viewer was left on the founder's original course and scene, directly in its clean stage editor, with the workspace drawer closed. No content was saved or discarded in that course during verification. The preceding screenshots and earlier behavior record below remain historical evidence of refinement 003 before this follow-up.

## Implemented behavior

The existing inline `SceneVisualEditor` now has a small title/header and a compact command strip. The large Stage / Details / Media tabs remain in the classic modal editor; Studio uses the requested menu groups. The same component state and handlers remain responsible for editing and persistence.

| Group | Existing capabilities exposed |
| --- | --- |
| Scene | Title, type, template/application, on-screen text, action description, narration, notes, required/audio settings. Canvas settings opens the existing stage-size controls. AI drafting remains available in a closed disclosure; it was not invoked. |
| Insert | Text, supported native shapes, uploaded image selection and placement. |
| Format | Selected-object text, font, color, alignment and geometry; text fitting/staggering; existing appearance, animation, layout and question-region surfaces. |
| Background | Existing color/image/inherit/none background controls. |
| Layers | Existing layer selection, grouping, reorder, visibility, lock, duplication and deletion. |
| Timeline | Existing timing, transport, layers, cues, media clips, trimming, fades and reflection controls; opens only on request in Studio. |
| Media | Existing media workflow and placement controls; saved-context checks and author approvals retained. |
| Preview | Existing animation preview and original-slide comparison when applicable, plus guarded real learner preview. |

The small Add text and Undo/Redo controls remain immediately available. More tools retains the existing general toolbar. No authoring action was removed. Contextual object properties appear on selection; explicit menu/advanced requests expose scene-level properties. Timeline starts collapsed in Studio; classic mode keeps its previous initial timeline state for compatibility.

Compact controls use 28px minimum height, smaller gaps and labels. Scene details and the inspector no longer impose their own vertical height limits in the inline editor. Expanded timeline content retains its necessary scrollable timing grid. The existing workspace drawer and preview focus work are preserved.

## Centralized unsaved-work protection

`useSceneNavigation` holds a live registration for the active editor: dirty, busy, its existing save operation and its close/discard operation. It owns the pending navigation and the three-choice dialog. It does not own a second scene draft or construct a save payload.

The visual editor compares a fingerprint of its complete current draft with its opening/saved fingerprint. Historical action flags no longer keep an otherwise reverted draft dirty. Undoing the tested canvas changes back to the original composition restores clean state. A successful save-for-media updates the saved fingerprint without changing the established media workflow.

Protected paths include scene switches, Studio/classic switching, workspace/management navigation, project selection, editor Close/Cancel and learner preview. Save changes calls the existing editor save function and existing revision-checked API. Discard explicitly closes the draft. Keep editing or Escape cancels navigation. A rejected/failed save keeps both draft and pending navigation, shows an error, and allows returning to editing.

The same registration also protects manual native-interaction drafts. Their existing revision check, author-review checkbox and external-link review checks remain mandatory; a guard-initiated Save cannot bypass them.

Dirty browser refresh/tab-close uses native `beforeunload` protection. Browser policy determines whether that prompt appears and its wording; browsers do not support offering the custom asynchronous three-choice save dialog during unload. Chromium refresh and tab-close cancellation were exercised with real native dialogs.

## Verification

| Check | Result | Evidence |
| --- | --- | --- |
| Seven navigation paths: scene, classic, media workspace, My Work, project, close, learner preview | PASS | Each path tests Keep editing + explicit Discard, and a separate successful Save before navigation. |
| Real concurrent revision conflict | PASS | Another writer advances the stored revision; Save changes is rejected, navigation stays blocked and the stale draft remains editable. |
| Failed permission save | PASS | A simulated 403 response blocks navigation and preserves the draft. No alternate write path is used. |
| Undo back to clean | PASS | Add object → Undo → clean fingerprint; Close proceeds without a dirty prompt. |
| Native interaction review guard | PASS | Save before review is rejected; after explicit review the same operation saves and enters learner preview. |
| Browser refresh/tab close | PASS | Native `beforeunload` dialogs observed; cancelling retains the current draft. |
| Keyboard operation | PASS | Command-strip left/right navigation and Enter; guard Escape/Keep editing; existing timeline keyboard duration replacement regression. Focus outlines retained. |
| Every menu group | PASS | Additional inventory regression checks scene fields/stage size, shapes/images, text formatting/fitting, appearance/animation/layout, background, layer operations, timeline, media and preview controls. |
| 1440 / 1100 / 390 layout | PASS | Browser checks and visual screenshots; no page-level horizontal overflow. The narrow command strip wraps. |
| Classic mode with Studio disabled | PASS | Existing Details tab and modal retained; Close → Escape preserves draft; Close → Save changes persists and closes. |
| Existing Studio, native authoring and exports | PASS | Original Studio smoke, no-Pythia native flow and three-scene golden path with SCORM 1.2 / 2004 continue passing. |
| Prior workspace drawer and preview focus behavior | PASS | Existing menu persistence/mobile keyboard and Studio learner-preview focus regressions pass. |
| TypeScript/Vite build and whitespace validation | PASS | `npm --prefix frontend run build`; `git diff --check`. Existing large-bundle warning remains. |
| Full cross-browser CI, screen reader and founder acceptance | NOT TESTED | This is focused local Chromium qualification, not a claim of hosted CI or human acceptance for these uncommitted changes. |

Passed runs on the final implementation:

- **30 tests passed (53.9s):** `scene-refinement.spec.cjs` as of the main run, existing `studio`, `studio-native`, `studio-golden-path`, `workspace-navigation`, and `authoring-polish` suites.
- **1 additional test passed (8.5s including startup):** exhaustive menu-group capability inventory added after that run.
- **1 Studio-disabled classic test passed (7.8s including startup)** on the final implementation.

Total: **32 distinct browser regressions passed**, across the scoped runs. Initial test failures were corrected: a legacy smoke expectation assumed the always-visible inspector, a label selector assumed select-option text was excluded from the label, and the browser-refresh fixture waited indefinitely for a deliberately cancelled navigation. Those were test/fixture expectations; the final runs above passed. No full backend or full CI rerun was needed for this frontend-only refinement.

Use `CHIMERA_STUDIO_TEST=true`, `VITE_CHIMERA_STUDIO_ENABLED=true`, and `CHIMERA_TEST_PYTHON=C:\inetpub\chimera\backend\.venv\Scripts\python.exe` for the Studio run:

```powershell
node node_modules/@playwright/test/cli.js test --config playwright.onboarding.config.cjs --project=chromium scene-refinement.spec.cjs studio.spec.cjs studio-native.spec.cjs studio-golden-path.spec.cjs workspace-navigation.spec.cjs authoring-polish.spec.cjs
```

That command now includes the additional inventory test. For the classic-specific file, set `VITE_CHIMERA_STUDIO_ENABLED=false` and run `scene-refinement-classic.spec.cjs` separately. The browser tests use isolated disposable data and ports 5187/8027; the author's normal frontend/backend stay on 5173/8000.

## Screenshots and remaining UX limitations

- [Default editor, 1440px](qualification/founder-refinement-003/compact-1440.png)
- [Default editor, 1100px](qualification/founder-refinement-003/compact-1100.png)
- [Default editor, 390px](qualification/founder-refinement-003/compact-390.png)
- [Selected-object properties](qualification/founder-refinement-003/contextual-1440.png)
- [Background menu](qualification/founder-refinement-003/background-menu-1440.png)
- [Unsaved-work choices at 390px](qualification/founder-refinement-003/unsaved-guard-390.png)

The screenshots use a disposable UI-created lesson named **Founder refinement 003 – synthetic**. The protected-draft screenshot was discarded explicitly; the clean lesson remains available locally.

The menu groups reveal existing contextual surfaces rather than introducing a full operating-system-style menu framework. At 390px the scene navigator still precedes the stage, and selected properties move below it. Expanded timeline editing still needs horizontal scrolling. Complex scene metadata and manual interaction authoring remain longer tasks; this refinement prioritizes the default canvas and visual-editor controls. Touch/on-screen-keyboard and screen-reader acceptance remain to be performed by the founder/reviewer. No independent WCAG certification is implied.

Ready for founder review locally at `http://127.0.0.1:5173`; not merged or deployed.
