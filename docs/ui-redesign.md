# Authoring workspace redesign

Implemented September 30, 2026, using 12ui Design candidate A.

The original interface placed approximately 395 pixels of headers and controls above the storyboard at 1440px width. The updated workspace starts at approximately 110px. Scene actions sit next to the selected content, with a persistent pencil button on every scene row. The sequence has its own scrolling area.

Project selection, new-project creation, and libraries are in the navigation. Review tools expand in place. Preview and Export occupy one compact header. Export opens a keyboard-accessible dialog containing the existing SCORM, report, backup/restore, and conditional QTI test actions. Assessment and required-audio controls remain with their scene.

Scene, template, project-creation, and export dialogs trap keyboard focus, support Escape, restore focus to their trigger, and prevent dismissal during saving. File upload controls are keyboard accessible. Save failures remain visible inside the editor. Export warning thresholds now persist on blur instead of updating local state before the persistence comparison.

## Design integration

The navy navigation, pale workspace, blue accents, Inter typography, bordered panels, and upper-left scene action follow the chosen design. Both extracted raster assets are included in `frontend/src/assets`. Existing Lucide icons remain for the other controls. The theme is integrated in `frontend/src/workspace.css` after the existing component styles.

The design was deliberately adapted to the requested workflow: project, review, and export controls do not consume the scene sequence panel; they move to the navigation or Export dialog. The existing project name and state remain dynamic. The candidate's invented Local workspace navigation destination was not added. The empty-state Edit scene control is replaced by working import/create actions until a scene exists. Narrow layouts preserve readable labels and scrolling instead of scaling a desktop screenshot.

12ui's initial plan had 86% DOM anchor coverage. The final target-based comparison reused the unchanged LayerDoc without another conversion and reported 57.5% coverage after the intentional regrouping. Its structural suggestions to expose every review/export action in the sequence panel were not applied, since that would undermine the requested workflow. The visual treatment and assets were compared manually against the selected source; this is an adaptation, not a pixel-identical copy. The model-generated selector mapping is not evidence of accessibility compliance.

Local design evidence is ignored under `.improve/`: candidates and conversion in `chimera/`, recovered implementation plan in `chimera-plan/`, final comparison in `chimera-close/`, and populated browser screenshots at the root of `.improve/`.

## Validation

- Production TypeScript/Vite build passed.
- Isolated browser checks verified direct editing of a nonselected scene, the correct save endpoint and payload, failed-save recovery, Tab/Shift+Tab focus containment, Escape, and trigger focus restoration.
- Checked export threshold persistence and availability of existing export controls, review disclosure, media/templates navigation, assessment actions, learner preview, and no-project setup.
- Verified no horizontal page overflow at 1440, 1024, 768, 390, and 320px widths. Inspected desktop, tablet, phone, empty-state, and export-dialog captures.
- Browser fixture checks mock API requests and do not modify real courses. They verify frontend behavior, not backend package compilation. No backend code was changed.

## 12ui purchase record

Recorded ceilings are not confirmed charges. No additional work was purchased by the recovered or final LayerDoc comparison kits.

| Purchase | Stage | Recorded ceiling |
| --- | --- | --- |
| `crt-52a81c86c6532b30366424dc62155854807fa892` | Draft, four candidates | $0.12 |
| `cf79e143-5f13-47f0-b2fa-c3239dfccfa7` | Conversion | $0.55 shared across the two conversion purchases |
| `d3306970-2fb8-489f-a787-ac3942e9290c` | Responsive export | Same shared $0.55 ceiling |

The distinct recorded stage ceilings total $0.67. Full provenance and recovery records remain in the local kit.
