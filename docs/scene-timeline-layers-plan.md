# Scene timeline, layers, shapes, and effects

Date: 2026-10-28. Status: implemented locally; see the [implementation record](scene-timeline-implementation.md) for delivered behavior, verification, approximations, and remaining manual acceptance. The original phased plan below is retained as its design and acceptance reference.

## Outcome

Authors can compose a scene visually, arrange objects in layers, and coordinate text, shapes, audio, and video over a shared scene timeline. They can insert editable shapes and style shapes and text with opacity, color, drop shadows, bevel, and emboss. The authored result behaves consistently in Stage, learner preview, standalone delivery, SCORM 1.2/2004, and Word scene visuals.

This is an extension of the existing authored composition, not a second independent scene representation.

## Foundation at planning time

The following describes the baseline before implementation. Current limits and behavior are recorded in the implementation document: timed scenes support one hour, individual effects support 0.1-60 seconds, and cues currently support navigation/snapping rather than event actions. Numeric timing inputs display seconds; minute/second timecode and arbitrary effect keyframes are not claimed as delivered.

- `frontend/src/SceneVisualEditor.tsx` provides stage editing, object selection, layers, geometry controls, and draft Undo/Redo.
- `frontend/src/SceneSurface.tsx` defines and renders text, image, and shape elements. Imported shapes currently use stored SVG geometry; shapes already have width, height, and rotation.
- `backend/app/models.py` validates the saved composition and entrance/presentation/exit animations. Animation delays currently stop at 60 seconds and individual effect durations at five seconds.
- `backend/app/static/stage-animations.js` shares native animation playback with delivery. It accepts an initial elapsed time but does not provide a persistent shared transport for media and animation.
- Audio/video attachments, media placements, required-audio completion, and required-video coverage already exist. These must remain compatible.
- Word scene visuals already use the delivery player, providing a route to consistent visual effects.

## Author workflow

1. Insert text, a shape, an image, audio, or video from the editor toolbar or media library.
2. Position and resize visual objects on the stage; use exact position/size fields when needed.
3. Select the same object through the stage or its named layer row. Selection remains synchronized.
4. Adjust appearance in the inspector and timing in the timeline below the stage.
5. Drag the playhead or play the scene to check synchronization. Use Undo/Redo before saving the draft.

The timeline is collapsible and resizable. Its header provides play/pause, restart, current time, scene duration, zoom, and snapping. Time fields display seconds or minute/second timecode; milliseconds remain the internal storage unit. Authors can enter `4.2 s` without calculating `4200 ms`.

## Layers and tracks

- Give objects editable display names and stable IDs. Support duplicate, delete, lock, reorder, and multi-selection.
- Visual layer order controls front-to-back stacking. Horizontal timeline position controls time independently.
- Provide object visibility intervals plus separate entrance, emphasis, and exit blocks. Plain objects can appear/disappear without a motion effect.
- Provide dedicated audio rows and video rows with clip start/end and source in/out points. Multiple clips can reference the same asset through distinct clip IDs.
- Offer authoring visibility, mute, and solo controls with explicit semantics: temporary preview controls do not silently change published content. Persisted learner visibility and clip volume are separate properties.
- Add named groups with synchronized selection and movement in a later phase; group membership must not silently change stacking or timing.
- Provide keyboard alternatives to dragging, labeled controls, visible focus, and a compact layout for smaller windows.

## Shape insertion and appearance

Initial shape palette: rectangle, rounded rectangle, ellipse/circle, line, arrow, triangle, and diamond. Add stars, polygons, and callouts after the core model is stable.

| Control | Behavior |
| --- | --- |
| Position and size | Drag handles plus numeric X/Y/width/height; optional aspect-ratio lock; rotation |
| Fill | Solid color, no fill, and independent fill opacity |
| Outline | Color, width, opacity, and no outline; line/arrow endpoint options where applicable |
| Object opacity | 0–100%; applies to the composed object and its effects |
| Geometry | Editable corner radius and applicable shape parameters; resizing preserves vector quality |
| Arrangement | Front/back order, alignment, distribution, duplicate, lock, and delete |

Keep native shape geometry and style as structured data. Generate rendering geometry from that data instead of rewriting arbitrary imported SVG strings. Preserve imported SVG shapes unchanged by default; offer supported styling only where geometry supports it, or an explicit conversion to an editable native shape. Do not promise full editability for every imported PowerPoint shape.

Text uses the same object opacity and effects model while retaining its existing font, size, weight, alignment, and color controls. Fill opacity, text color opacity, and whole-object opacity must be distinguishable.

## Shape and text effects

All effects are optional, non-destructive, independently enabled, and resettable. Start with restrained presets and expose precise settings through an expanded inspector section.

| Effect | Controls and rendering requirement |
| --- | --- |
| Drop shadow | Color, opacity, angle/distance or X/Y offset, blur; follow the actual shape silhouette or text glyphs |
| Bevel | Inner/outer style where supported, depth/size, softness, light angle, highlight/shadow colors and opacity |
| Emboss | Raised/recessed preset, depth, softness, light angle, highlight/shadow colors and opacity |

Define a stable effect order: geometry and fill/stroke, bevel/emboss surface treatment, drop shadow, then whole-object opacity. Animation opacity multiplies authored opacity rather than replacing it. Keep animation transforms separate from geometry transforms and effect wrappers.

Prototype bevel/emboss with representative text and shapes in Chromium, Firefox, and WebKit before committing to a rendering technique. Prefer shared SVG/filter definitions or equivalent supported browser rendering; ensure filter IDs are unique and filter bounds allow shadows without clipping. Use glyph/silhouette masks so effects do not decorate the rectangular text container. Document visual approximations relative to PowerPoint. Cache reusable definitions and set bounded effect parameters to control rendering cost.

## Shared timeline and playback contract

- Introduce one scene transport exposing current time, play, pause, seek, restart, playback state, and ended state. Animation and media subscribe to this clock.
- Separate scene start time from source-media in/out points. A clip beginning at scene second 12 with source-in 3 plays source second 3 at scene second 12.
- Support overlapping audio and video; synchronize after seek, buffering, tab visibility changes, and resumed playback without accumulating timer drift.
- Require a user gesture to start audible playback. Handle rejected playback, missing assets, unknown duration, buffering, and unsupported media with useful author/learner feedback.
- Store an explicit scene duration. Default it to the latest authored endpoint when preparing a new timeline; flag clips or effects extending beyond it and offer to extend it. Do not silently truncate.
- Default to learner-controlled navigation at timeline end. Automatic advance is a separate explicit setting and must respect required activities.
- Define interactions and assessments independently from the scene clock: a paused or finished timeline must not disable answering or discussion.
- Keep captions synchronized to source-media time, including source trimming. Keep accessible text available when visual elements are temporarily hidden.
- Seeking does not earn listening/viewing completion. Define required coverage over the intended trimmed clip interval, keyed by clip identity, and prevent overlapping clips from inflating credit. Decide explicitly how overlapping required audio is presented to learners.
- Use one saved scene time for coherent resume; reconcile existing per-video bookmarks and version resume data without discarding earned completion. Preserve standalone's documented session-only progress boundary.
- Reduced-motion preferences remove movement while preserving timed visibility, instructional content, and media synchronization.

## Persistence, compatibility, and export

Add a versioned timeline/clip model and backward-compatible optional appearance fields. Keep layer identity and ordering in one canonical composition; timeline rows reference those IDs rather than duplicating objects. Retain integer milliseconds internally, validate finite geometry and bounded effects, and replace the existing 60-second limit with a documented scene-duration policy.

Existing scenes with no timeline retain their present attachment/playback behavior. Opening an old scene must not automatically schedule or autoplay all media. Provide an explicit, undoable conversion to a timed scene, with existing animations translated to equivalent scene-time positions. Preserve source PowerPoint bytes and legacy compositions/history.

Update frontend types, API validation, persistence, history, backup/restore, template application, project duplication, and import/export together. Verify code paths that construct or selectively copy elements do not strip the new properties. Keep new native SVG/filter generation trusted and sanitize any imported geometry according to existing asset boundaries.

Use the same appearance and timing implementation for editor preview and published playback. Word visuals use an explicit representative scene timestamp, initially author-selectable with a sensible default; they cannot represent a moving sequence in one still image. Include timing/media information in detailed storyboard records. Video poster frames and unavailable media must have deterministic print behavior. QTI item interoperability remains a separate scope; do not imply timeline/effect support in external QTI consumers.

## Implementation sequence and acceptance gates

### 1. Model and rendering spike

Specify canonical layer/clip IDs, time semantics, opacity/effect composition, resume behavior, and schema compatibility. Prototype text/shape bevel and emboss across three browser engines and Word rendering. Use a synthetic scene with overlapping media, captions, transparent shapes, and animated text.

Gate: existing scenes round-trip unchanged; proposed effects render acceptably without clipping; compatibility decisions and unsupported cases are documented.

### 2. Native shapes and appearance

Implement the shape palette, editable geometry, fill/outline/object opacity, shared text/shape effects, inspector controls, layer names, arrangement, and Undo/Redo. Deliver bevel and emboss after the spike confirms the technique; they remain part of planned scope.

Gate: native shapes remain editable after save/reopen and backup/restore; opacity/effects match Stage, preview, delivery, and Word visuals. Geometry and effects survive template and duplication workflows.

### 3. Animation timeline and layers

Introduce the shared transport, visual-object lifetimes, timeline rows, animation blocks, seconds-based inputs, snapping, zoom, seeking, and synchronized selection. Translate existing relative presentation delays into absolute ruler positions without changing playback.

Gate: seeking forward/backward and pause/restart produce the same visible result at the same timestamp; stacking is independent of timing; reduced motion and keyboard editing work; scenes longer than 60 seconds are supported under the new policy.

### 4. Scheduled audio and video

Add clip insertion, scene start offsets, source in/out trimming, overlap, volume, caption synchronization, buffering/error handling, completion, and coherent resume. Video is a positioned stage object with a corresponding timed clip; audio has a nonvisual track.

Gate: a clip beginning at 12 seconds with a three-second source-in seeks correctly; clips stop at their out points; seeking cannot complete required media; preview, standalone, and both SCORM profiles agree.

### 5. Authoring refinement and qualification

Add waveforms, cue markers, groups, mute/solo preview, volume fades, and snapping to cues. Waveform decoding stays local where feasible and has bounded resource use. Update walkthroughs, illustrated guides, API/deployment documentation, and the bundled PDF after behavior stabilizes.

Gate: representative long scenes and many-layer scenes remain usable; browser/accessibility and export regression checks pass; exact artifact/browser/LMS evidence is recorded with its actual scope.

## Verification strategy

Use focused model/migration tests for legacy timing, invalid clips, duplicate asset references, trimmed coverage, and opacity defaults. Use deterministic clock tests for pause/seek/restart and buffering. Add browser workflows for stage/timeline selection, shape/effect editing, keyboard operations, Undo/Redo, and save/reopen. Compare representative fixed-time renders across Stage and delivery, including transparent and overlapping elements, in all three supported browser engines. Validate backups, Word visuals, standalone operation, SCORM completion/resume, and captions. Reserve manual acceptance for effect quality, narration synchronization, editing usability, screen-reader behavior, and target-LMS checks.

## Scope boundaries and decisions

The initial feature does not require video transcoding, destructive audio editing, arbitrary animation keyframes, motion paths, or full PowerPoint effect fidelity. Source trimming is playback metadata and preserves original media bytes. No time estimate is asserted before the model/rendering spike; shared playback and legacy compatibility are the largest engineering risks.

Delivered defaults: timeline below the stage; learner-controlled advance; seconds-based timing; explicit enabling for legacy scenes; static appearance effects; optional timeline use for simple scenes. The phased requirements above remain the original design reference; the implementation record and pre-alpha checklist identify delivered scope and outstanding acceptance.
