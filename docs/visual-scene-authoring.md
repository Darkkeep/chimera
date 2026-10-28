# Visual scene authoring

Current navigation (2026-10-27): set the project-wide default using **Storyboard > Project background**, above the scene list, not Settings. Scene-specific choices still live in **Edit scene > Stage > Background** and can inherit the project default, select a local image, or explicitly choose None. **Assessments** now opens directly from **WORKSPACE** in the left rail. For question imports, Fill-in-the-blank, and collapsed tag/objective-reference dropdowns, see the [assessment user guide](user-guide.md#5-author-assessments).

## Scene metaphor

A **Scene** is one authored moment in a course. Its **Stage** is the required, bounded surface on which visual content appears. A **Layout** is the arrangement of content on that stage, not the choice of rendering strategy. **Layers** order content along the Z-axis; the highest numbered layer is frontmost. The **Background** is the backdrop behind all content, separate from the layer stack.

The scene editor opens on Stage. Stage settings offer widescreen, standard, square, and custom dimensions (1-10000 units per axis). A valid default stage is supplied for scenes without a stored layout. Changing stage dimensions does not resize or reposition content. Layout controls align a selected content box to stage edges or centers; coordinates, dimensions, and rotation remain editable. Locked content cannot be aligned. Background color and image are edited separately, and Layers lists content from front to back. These changes participate in undo/redo and are persisted by Save scene.

The metaphor is content-neutral. The spatial layer stack supports text, images, and imported vector shapes. Question scenes also have a movable, resizable assessment region on the Stage; its interaction and scoring remain scene-level data, not ordinary visual layers. Narration/audio and completion behavior remain outside the spatial layer stack. Video, arbitrary HTML, documents, and embedded applications are not yet stage content types; they require explicit rendering, accessibility, security, persistence, and export support before being offered in the editor.

Details contains scene metadata, narration, notes, and **Rendering mode** (Fidelity, Hybrid, Native, or Template). Guided metadata/template workflows open Details directly. Existing `visualLayout` data remains the storage contract; no migration or removal of legacy source-slide rendering is required.

## Data and activation

Scenes may have a nullable `visualLayout`. Legacy scenes remain valid. Version 1 stores an explicit slide-space width/height, background color/image, warnings, and independently identified text/image elements. Geometry is finite and bounded; image crop fractions must retain a visible region; element IDs are unique. Image references must resolve to project image assets. Element array order defines stacking and DOM reading order.

Imported layouts have `enabled: false`. Saving in the visual editor activates the layout. Enabled layouts replace, rather than overlay, the flattened preview in the workspace, React player, and exported SCORM players. Attached media remains available to authors but images are not repeated below an enabled visual scene. Questions use their assessment region, with the player expanding the assessment area as needed to keep targets and submission controls visible. Audio, review comments, and completion logic remain outside the visual stage. Authored slide colors do not change with application appearance.

## PPTX extraction

`extract_slide_layout` converts EMUs into a slide-width of 1280 units, retaining the original aspect ratio. It extracts text boxes, image instances, preset and custom vector shapes, line connectors, cropping, rotation, and groups with coordinate transforms. Shape text remains editable text over its vector decoration. Byte-identical image content shares one SHA-256-addressed asset across slides; separate placements remain separate elements with independent geometry and element IDs.

Background precedence is slide, layout, then master. Solid/theme colors and embedded picture backgrounds are supported. Non-placeholder master/layout content is included and initially locked; visibility flags are respected. Placeholders use slide content/geometry. Common preset geometry, connector lines, and custom freeform paths are emitted as SVG vectors. Less-common preset shapes may use an editable bounding-box approximation with an import warning; unsupported non-shape objects and approximate text/group/gradient styling also produce warnings. The source preview is retained for comparison and fallback.

The legacy upgrade endpoint is `POST /api/projects/{project_id}/scenes/{scene_id}/extract-layout`. It uses the retained source PPTX, is revision-guarded and idempotent, and only adds the selected scene's disabled layout and required assets. Authored text is mapped to recovered boxes where possible, otherwise preserved in a combined box with a warning. It does not invoke deck replacement or slide rendering. Normal saves continue to create storyboard history through existing persistence.

### Reusable master backgrounds

PPTX conversion also walks every slide master, including masters not used by any slide. It extracts the master's backdrop and non-placeholder artwork into a self-contained SVG image. Embedded pictures, vector shapes, and static text are retained; title/body/date/footer/slide-number placeholders, layout-specific artwork, and slide content are excluded. The image has the presentation's aspect ratio and is created without LibreOffice.

The generated SVG content is SHA-256-addressed: masters that produce identical extracted backdrops share one asset even when their master names or part IDs differ. This is deduplication of the supported extracted appearance, not byte comparison of the original master XML or pixel-perfect PowerPoint rendering. Gradient fills, uncommon shapes, inherited fonts, and complex text styling retain the existing extractor's approximations.

These image assets have `role: "background"` and names such as `Master background 1.svg`. Existing media defaults to `role: "content"`. In the scene editor, Stage > Background > Background image groups them under **PowerPoint masters**. Applying one removes inherited `source: "master"` elements from that scene in the same undoable change so its artwork does not appear twice; layout- and slide-local elements remain editable. Merely importing the PPTX does not change any scene's current background or activate its editable layout. Generated backgrounds are project assets, persist through backups, and are packaged when referenced by a SCORM scene.

Existing converted projects are not rewritten automatically. Reimporting the source deck generates its background library through the usual replacement workflow; preserve authored changes with a Chimera storyboard backup before reimporting. This extracts masters, not every slide layout as an additional background.

## Editing

The visual editor uses `react-rnd` for scaled pointer/touch move and resize interactions. Text can be edited on the stage or in properties; text resize handles preserve the selected box's aspect ratio, while image and vector-shape boxes can be resized freely with visible handles. Native image drag/drop has a click/selector alternative; position inputs and arrow-key movement provide non-pointer control. Layers support selection, locking, ordering, duplication, and deletion. Local undo/redo retains up to 100 layout states. Cancel discards unsaved edits; the shared dialog preserves focus handling.

## Qualification

From the repository root:

```powershell
.\backend\.venv\Scripts\python.exe -m pytest backend\tests -q
npm --prefix frontend run build
npm run test:visual
npm run test:auth
npm run test:onboarding
```

`test:visual` creates disposable workspaces and ports, loads built frontend files, and runs browser interactions against a real backend. It checks master/background extraction, preset shape and connector rendering, direct text editing, pointer movement, aspect-locked text resizing, image-handle resizing, layer ordering/deletion, attached-image drag/drop, undo/redo, save/reload, named navigation from scene 23 to 8, light/dark reviewer accessibility, mobile editor layout, non-destructive legacy extraction, and SCORM 1.2/2004 image/text/vector rendering. Backend coverage verifies preset/freeform/connector extraction and byte-identical image assets deduplicate across slides without removing separate placements. It uses Chromium, falling back to installed Edge if needed. Screenshots, exported player fixtures, reports, and a result summary are saved under `workspace/visual-qualification`.

This qualifies local editing and player rendering, not fidelity for every PowerPoint feature or compatibility with a particular hosted LMS. See the existing SCORM compatibility checklist for LMS release qualification.

Master-background qualification also checks picker grouping, replacement of inherited master layers without duplicate artwork, undo/redo restoration, save/reopen, packaged asset availability, and SVG decoding in both SCORM players. Native pointer checks scroll resize handles into view and target the visible intersection of the stage and editor dialog after scrolling the content library. The fixture server serves SVGs as `image/svg+xml`; a hosted player must likewise serve packaged SVG files with their correct content type.