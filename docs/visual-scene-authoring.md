# Visual scene authoring

## Data and activation

Scenes may have a nullable `visualLayout`. Legacy scenes remain valid. Version 1 stores an explicit slide-space width/height, background color/image, warnings, and independently identified text/image elements. Geometry is finite and bounded; image crop fractions must retain a visible region; element IDs are unique. Image references must resolve to project image assets. Element array order defines stacking and DOM reading order.

Imported layouts have `enabled: false`. Saving in the visual editor activates the layout. Enabled layouts replace, rather than overlay, the flattened preview in the workspace, React player, and exported SCORM players. Attached media remains available to authors but images are not repeated below an enabled visual scene. Audio, questions, review comments, and completion logic remain outside the visual stage. Authored slide colors do not change with application appearance.

## PPTX extraction

`extract_slide_layout` converts EMUs into a slide-width of 1280 units, retaining the original aspect ratio. It extracts text boxes, image instances, cropping, rotation, and groups with coordinate transforms. Shared assets retain SHA-256 deduplication while each placed image has a separate element ID.

Background precedence is slide, layout, then master. Solid/theme colors and embedded picture backgrounds are supported. Non-placeholder master/layout text and images are included and initially locked; visibility flags are respected. Placeholders use slide content/geometry. Unsupported objects and approximate text/group/gradient styling produce warnings. The source preview is retained for comparison and fallback.

The legacy upgrade endpoint is `POST /api/projects/{project_id}/scenes/{scene_id}/extract-layout`. It uses the retained source PPTX, is revision-guarded and idempotent, and only adds the selected scene's disabled layout and required assets. Authored text is mapped to recovered boxes where possible, otherwise preserved in a combined box with a warning. It does not invoke deck replacement or slide rendering. Normal saves continue to create storyboard history through existing persistence.

## Editing

The visual editor uses `react-rnd` for scaled pointer/touch move and resize interactions. Text can be edited on the stage or in properties. Native image drag/drop has a click/selector alternative; position inputs and arrow-key movement provide non-pointer control. Layers support selection, locking, ordering, duplication, and deletion. Local undo/redo retains up to 100 layout states. Cancel discards unsaved edits; the shared dialog preserves focus handling.

## Qualification

From the repository root:

```powershell
.\.venv\Scripts\python.exe -m pytest backend/tests -q
npm --prefix frontend run build
npm run test:visual
npm run test:auth
npm run test:onboarding
```

`test:visual` creates disposable workspaces and ports, loads built frontend files, and runs browser interactions against a real backend. It checks master/background extraction, direct text editing, pointer movement, dimensions, attached-image drag/drop, undo/redo, save/reload, named navigation from scene 23 to 8, light/dark reviewer accessibility, mobile editor layout, non-destructive legacy extraction, and SCORM 1.2/2004 image/text rendering. It uses Chromium, falling back to installed Edge if needed. Screenshots, exported player fixtures, reports, and a result summary are saved under `workspace/visual-qualification`.

This qualifies local editing and player rendering, not fidelity for every PowerPoint feature or compatibility with a particular hosted LMS. See the existing SCORM compatibility checklist for LMS release qualification.