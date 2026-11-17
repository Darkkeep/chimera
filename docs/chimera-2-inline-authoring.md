# Chimera 2.0 P0 | Inline scene editing first implementation

**Branch:** `feature/chimera-2-inline-authoring`  
**PR:** #36 (draft; stacked on #30 and #27)  
**Issue:** #35  
**Status:** implementation candidate. Exact-head CI and local visual acceptance required. No Hostinger deployment authorized.

## What changed

The Studio scene surface now hosts **the existing `SceneVisualEditor` directly** rather than opening its modal. It is the same stateful authoring engine: object selection, double-click text editing, keyboard nudging, dragging, resizing, alignment, properties inspector, timeline, attached assets, local undo/redo, and revision-checked project saves.

The editor now accepts an optional `embedded` prop:
- `false` (default): classic `EditorDialog`, including modal focus trap and existing 1.x behavior.
- `true`: rendered as a labeled inline section of the Studio Stage, with no modal backdrop, forced focus, or body scroll locking.

The single editor React element is created in `App.tsx`, then mounted either in the Studio slot or as the original external modal. This avoids duplicate editing state and leaves the project schema and API write path untouched.

The Studio remains behind `VITE_CHIMERA_STUDIO_ENABLED=true` (default off). The old Storyboard remains available. Selected-scene rail switches and reader preview are disabled while inline editing is active, requiring Save or Cancel first. Cancel from the embedded editor confirms if there are unsaved local changes. The in-editor keyboard undo shortcut now uses the active visual editor region rather than assuming it is inside a modal.

## How to exercise

In a safe local development workspace, set `VITE_CHIMERA_STUDIO_ENABLED=true` before starting Vite, open a project, and switch to **Studio 2.0 preview**.

1. Select a scene; click **Edit on stage**. The scene editor should appear *inside Studio*, with the scene rail still visible and no modal backdrop.
2. Double-click text on canvas and edit in place; select and move/resize elements using existing controls; try Ctrl/Cmd+Z for authored geometry changes.
3. Change object properties using the inspector within the editor (right side on wide screens, stacked on narrow screens).
4. **Save scene**. The embedded editor closes; the saved scene renders in the selected Studio stage.
5. Reopen the same scene and confirm the edits persist; test **Cancel** and choose whether to discard unsaved changes.
6. Check existing keyboard editing alternatives, responsive widths, timeline panel, media placement, and actual learner preview/export.
7. Switch to **Classic storyboard** and repeat one scene edit. Confirm the original modal editor still functions.

## Automated regression

`tests/onboarding/studio.spec.cjs` has been updated to assert no scene-edit modal, edit actual canvas text, invoke Save, and read the persisted project scene to verify the changed text. The workflow Studio smoke Playwright argument order has been corrected.

**Remaining acceptance gates:** clean exact-head CI, hands-on flagged-on browser verification at wide/laptop/narrow widths, permission and unsaved-work tests, SCORM preview/export parity, and review by the founder.

## Boundaries and next iteration

This is **real inline editing**, not yet a clean-room rewrite of the entire authoring chrome. The existing Stage/Details/Media controls and native timeline are still visually busy inside the embedded editor, and image/assessment editing retains current UI. The next pass can gradually consolidate selection, direct properties and timeline presentation without destroying tested editing behavior.

**Quiet Counsel is parked** (#34). This branch contains none of its detector/spec implementation. Do not automatically consult Pythia or perform paid generation.

There is no database migration, backend schema change, production deployment, commit to `main`, or change to Pythia services in this PR.
