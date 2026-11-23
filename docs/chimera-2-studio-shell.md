# Chimera 2.0 | Studio shell first executable slice

Branch: `feature/chimera-2-studio-shell`
Base: `feature/chimera-2-authoring-foundation`
Status: implementation candidate; requires exact-head CI and local browser acceptance. No production release or schema migration.

## What is implemented

A new `StudioShell` provides a scene-first application surface:

- Persistently visible scene list with selection, scene creation, sources and media-library actions.
- Real saved-scene learner surface via `SceneSurface` / `resolvedSceneBackground`. The surface is not a mock.
- Context inspector with selected scene properties and actions. The existing complete scene editor is opened for direct manipulation; controls are **not yet embedded in the Studio shell**.
- Existing knowledge-check editor, actual learner preview, validation, and export actions remain connected to their original application handlers.
- An optional timeline summary and launch into the existing timeline-capable stage editor.
- On-demand, embedded `PythiaTalkPanel`, including the existing explicit context-sharing and proposal mechanisms; no automatic model call.
- Responsive layout, keyboard-focus styling, and reduced-motion handling.

The Studio is deliberately a *first slice*. The Stage Editor is still a modal and timeline editing happens there, not in the shell. Full inline canvas, docked inspector editing, timeline dragging, media drop, dark/light-theme parity and author usability testing remain for the next iteration.

## Turning it on (development only)

The Studio gate is compile-time, with **default off**:

```bash
VITE_CHIMERA_STUDIO_ENABLED=true npm --prefix frontend run build
```

On Windows PowerShell, set the environment variable before the build:

```powershell
$env:VITE_CHIMERA_STUDIO_ENABLED="true"
npm --prefix frontend run build
```

A running Vite dev server can also read this environment setting if it was present when started. With the flag enabled, open an editable project and select **Studio 2.0 preview** in the left workspace navigation. **Classic storyboard** toggles back without migrating or rewriting the project.

Production 1.x builds not explicitly opting in will display their existing storyboard and workflow. There is no URL query flag, localStorage override, server-side migration or server permission bypass.

## Qualification / acceptance plan

1. Confirm existing backend/frontend tests and build pass with the flag off.
2. Build with `VITE_CHIMERA_STUDIO_ENABLED=true`; confirm TypeScript and Vite build.
3. Use a synthetic local project with two saved scenes, media and one question.
4. Select Studio, switch scene; confirm genuine selected-scene player changes.
5. Open stage edit, change text, save, return; confirm stage and inspector reflect the saved change.
6. Open scene properties and question editor; verify save/cancel/revision conflict behavior stays identical to classic authoring.
7. Expand timeline and launch editor; verify existing timing survives.
8. Open Pythia pane and close it **without submitting**; verify no request/charge is made, and no scene is shared automatically.
9. Open learner preview, validation, export; inspect actual player and package.
10. Toggle back to Classic; confirm selected project, current revision and scene selection persist.
11. Verify keyboard and at least laptop/tablet/phone widths; check navigation landmarks, focus and Pythia pane overflow.
12. Confirm restricted hosted actors cannot gain edit, consultation or project permissions through Studio.
13. Confirm disabled gate hides the Studio toggle completely in a standard build.

## Known constraints

- The app already has a central `App.tsx` orchestration model and uses modal forms; this shell uses those handlers to avoid regression. Further docked editing needs explicit focus/unsaved-work state ownership.
- The optional timeline section currently summarizes and opens the legacy editor. It is not an inline editable timeline.
- The existing stage component may impose size and aspect constraints in a narrow dock; verify with real browser screenshots before styling is approved.
- This component has not been approved as the final visual design. Follow the 12ui comparison/improvement process when an approved screenshot is available.

## Production protection

Do not merge into the 1.x mainline or deploy to `chimera.darkrogue.io` under this branch. Keep real users and data away from the experimental UI until tests and a separate staging acceptance gate pass.
