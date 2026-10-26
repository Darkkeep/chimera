# Chimera Build Plan  
**Purpose:** Local, database-free application that ingests PowerPoint (`.pptx`) files, converts them into editable storyboards, supports integrated audio/video authoring, and exports Blackboard Learn-compatible SCORM packages.

---

## 1. BLUF

Chimera will use a **filesystem-backed project model** and a **canonical storyboard JSON format**. It will preserve imported PowerPoint slides as visual references while allowing authors to edit text, narration, media, assessments, navigation, accessibility metadata, and completion rules before exporting a single-SCO SCORM package.

**Primary export target:** SCORM 1.2 for the currently documented target LMS.
**Additional export:** SCORM 2004 4th Edition; local qualification does not imply acceptance by every target LMS.
**Deployment model:** Local single-user operation remains supported; networked authentication is available. External media hosting is not required.

## 1.1 Current Status and Roadmap Authority

This document records the original product requirements and delivery sequence. It is not the authoritative implementation-status record: completed capabilities and their evidence are tracked in [current work and handoff](docs/current-work.md), the [1.1.0 completion update](docs/completion-update-2026-10-15.md), and the [SCORM compatibility checklist](docs/scorm-compatibility-checklist.md).

The current product follows the separate [Pythia + Chimera integrated build plan](Pythia_Chimera_Integrated_Build_Plan.md): Pythia provides learning-intelligence analysis and proposals; Chimera owns authoring, review and acceptance, preview, and package production. Pythia proposals must not silently mutate canonical project content.

| Original phase | Current status |
|---|---|
| 0 — Foundation | Delivered. |
| 1 — PPTX import and rendering | Delivered. |
| 2 — Storyboard editor | Delivered for the documented authoring workflows; see the current-work handoff for supported editing behavior and limits. |
| 3 — Audio/video authoring | Core media authoring, captions, transcripts, and packaging are delivered. Advanced cue-point workflows and video-watch completion requirements remain open unless separately verified. |
| 4 — Assessments and completion | Delivered for the documented assessment formats, scoring, completion rules, and remediation workflows. |
| 5 — SCORM 2004 export | Export and local qualification are delivered. External acceptance is target-LMS- and package-specific. |
| 6 — SCORM 1.2 export | Export and local qualification are delivered. Human acceptance evidence applies only to the packages and checks recorded in the compatibility checklist. |
| 7 — Blackboard validation and hardening | Partially complete and environment-specific; do not infer acceptance of one SCORM profile from another. |
| 8 — Release-candidate qualification | Local qualification is delivered. Human, target-LMS, and release-candidate gates remain distinct and must be recorded against the exact candidate. |

The capability checkboxes in the original backlog below are a historical feature inventory, not a complete current roadmap. Use the linked handoff and integrated plan to decide subsequent work. Automated package checks, local browser tests, human acceptance, and release approval are separate evidence types.

---

## 2. Objectives

### Primary Objectives
- Ingest `.pptx` source files locally.
- Extract usable slide content, including text, notes, images, hyperlinks, and media references where available.
- Render slide previews for visual-fidelity editing.
- Produce a structured, editable storyboard.
- Support audio and video as native authoring components.
- Support captions, transcripts, cue points, media completion rules, and media-linked interactions.
- Export portable SCORM packages compatible with Blackboard Learn.
- Track completion, score, bookmark/resume state, and optional question-level interactions.
- Keep filesystem-backed project content as a supported local persistence model without requiring a relational database.

### Non-Objectives for Initial Release
- Perfect conversion of all PowerPoint animation behavior.
- Full fidelity conversion of SmartArt, embedded OLE objects, macros, or complex chart data into editable HTML.
- Multi-user concurrent editing.
- Browser-based media transcoding.
- LMS administration, Blackboard configuration, or course deployment automation.

---

## 3. Product Scope

## 3.1 Input

```text
Required:
- PPTX presentation

Optional:
- MP4 video
- MP3, M4A, or WAV narration/audio
- PNG, JPG, JPEG, SVG images
- WebVTT caption files
- Transcript text files
- PDF job aids or downloadable references
```

## 3.2 Output

```text
1. SCORM 2004 4th Edition ZIP
2. SCORM 1.2 ZIP
3. Local preview build
4. Standalone HTML build
5. Storyboard JSON backup/export
6. Build validation report
```

## 3.3 Core User Workflow

```text
Create Project
  ↓
Import PPTX
  ↓
Extract and Render Slides
  ↓
Review Conversion Warnings
  ↓
Edit Storyboard
  ↓
Add/Replace A/V Content
  ↓
Configure Navigation, Assessments, and Completion
  ↓
Validate Course
  ↓
Preview Locally
  ↓
Build SCORM Package
  ↓
Upload to Blackboard Learn
```

---

## 4. Technical Architecture

## 4.1 Proposed Stack

| Layer | Recommended Technology | Purpose |
|---|---|---|
| Local backend | Python + FastAPI | Project management, ingestion, rendering orchestration, SCORM build pipeline |
| PPTX extraction | `python-pptx` plus direct OOXML inspection where needed | Extract slides, text, notes, shapes, images, tables, links |
| Rendering | LibreOffice headless adapter | Render source slides to PDF/PNG previews |
| Front end | React + TypeScript + Vite | Storyboard editor, timeline, canvas, build interface |
| Styling | CSS modules, Tailwind, or equivalent | Responsive authoring interface |
| Package generation | Python `zipfile` + XML generation | SCORM manifest and distributable package creation |
| Local storage | Filesystem + JSON | Project persistence without database |
| Local preview tracking | Browser `localStorage` | Preview-mode bookmark and completion simulation |
| Optional media processing | FFmpeg adapter | Metadata inspection, thumbnail generation, optional transcoding |

---

## 4.2 High-Level Architecture

```text
┌───────────────────────────────────────────────┐
│                 Chimera UI                    │
│  Project | Storyboard | Media | Assessments   │
│  Accessibility | Preview | Build              │
└───────────────────────┬───────────────────────┘
                        │ Local API
┌───────────────────────▼───────────────────────┐
│              Chimera Backend                  │
│                                               │
│  Project Service                              │
│  PPTX Ingestion Service                       │
│  Rendering Service                            │
│  Storyboard Service                           │
│  Media Service                                │
│  Validation Service                           │
│  SCORM Build Service                          │
└───────────────────────┬───────────────────────┘
                        │
┌───────────────────────▼───────────────────────┐
│              Local Project Filesystem         │
│                                               │
│  original/ | assets/ | renders/ | storyboard/ │
│  build/    | output/ | history/               │
└───────────────────────────────────────────────┘
```

---

## 5. Filesystem-Backed Project Model

## 5.1 Project Directory Structure

```text
chimera-workspace/
  projects/
    course-7d9bd4b4/
      project.json
      storyboard.json

      original/
        source-deck.pptx

      assets/
        images/
          image-001.png
        audio/
          narration-001.mp3
        video/
          inspection-demo-001.mp4
        captions/
          inspection-demo-en.vtt
        transcripts/
          inspection-demo.txt
        documents/
          job-aid-001.pdf

      renders/
        slide-001.png
        slide-002.png
        slide-003.png

      history/
        storyboard-20260929T130000Z.json
        storyboard-20260929T140000Z.json

      build/
        preview/
        scorm-2004/
        scorm-12/

      output/
        course-v001-scorm2004.zip
        course-v001-scorm12.zip

      reports/
        validation-v001.json
        build-v001.json
```

## 5.2 Persistence Rules

- `storyboard.json` is the authoritative course source.
- The original PPTX remains unchanged.
- Every author save creates a timestamped JSON snapshot.
- Writes use a temporary file followed by atomic rename.
- Only one active write/build operation may occur per project.
- Assets receive unique IDs and content hashes.
- Build folders may be deleted and regenerated at any time.
- Output packages are immutable artifacts once created.

---

## 6. Canonical Storyboard Model

## 6.1 Design Principle

The storyboard must be independent of:
- PowerPoint source structure.
- SCORM version.
- Blackboard-specific implementation details.
- HTML/CSS rendering behavior.

The compiler converts the storyboard into the target output profile.

## 6.2 Example `storyboard.json`

```json
{
  "schemaVersion": "1.0",
  "projectId": "course-7d9bd4b4",
  "title": "Equipment Inspection Fundamentals",
  "description": "Interactive training course generated from a source presentation.",
  "exportSettings": {
    "primaryProfile": "scorm2004-4th",
    "compatibilityProfile": "scorm12",
    "packageWarningThresholdMB": 200
  },
  "completionRule": {
    "operator": "AND",
    "requirements": [
      {
        "type": "required-scenes",
        "threshold": 1.0
      },
      {
        "type": "required-video-watch",
        "threshold": 0.9
      },
      {
        "type": "assessment-score",
        "minimumPercent": 80
      }
    ]
  },
  "scenes": [
    {
      "id": "scene-001",
      "sourceSlide": 1,
      "title": "Introduction",
      "layoutMode": "fidelity",
      "required": true,
      "background": {
        "assetId": "render-slide-001",
        "width": 1920,
        "height": 1080
      },
      "blocks": [],
      "media": [],
      "interactions": []
    }
  ]
}
```

---

## 7. Feature Requirements

## 7.1 PPTX Ingestion

### Required Capabilities
- Select or drag-and-drop a PPTX file.
- Validate file extension, size, archive structure, and extraction path safety.
- Preserve a copy of the original source file.
- Extract:
  - Slide count and dimensions.
  - Text boxes, paragraphs, and bullet levels.
  - Speaker notes.
  - Images.
  - Tables.
  - Hyperlinks.
  - Basic shape geometry.
  - Slide title candidates.
  - Embedded media references where accessible.
- Render every slide as a preview image.
- Record unsupported content for author review.

### Conversion Warning Examples

```text
Warning: Slide 7 contains SmartArt. Retained in slide-image background.
Warning: Slide 11 contains custom animation. Animation is not converted.
Warning: Slide 14 contains embedded OLE content. Source retained; object not exported.
Warning: Slide 18 contains chart data. Chart retained as a visual background.
```

---

## 7.2 Storyboard Editing

### Required Capabilities
- Reorder scenes.
- Rename scenes.
- Mark scenes as required or optional.
- Edit extracted on-screen text.
- Add or remove text blocks.
- Add buttons, hotspots, callouts, and links.
- Change scene background mode:
  - Fidelity background image.
  - Native editable layout.
  - Blank/template-based scene.
- Add scene-level narration.
- Configure scene completion behavior.
- Define reading order and accessibility labels.
- Add speaker notes or author notes.

### Scene Layout Modes

| Mode | Purpose |
|---|---|
| Fidelity | Retains rendered PowerPoint slide as visual background |
| Hybrid | Uses rendered background plus editable overlay blocks |
| Native | Rebuilds scene using editable HTML blocks |
| Template | Creates new scene from a Chimera layout template |

---

## 7.3 Audio and Video Authoring

### Required Capabilities
- Add audio narration to a scene.
- Add video to a scene.
- Replace imported or previously attached media.
- Define media placement and dimensions.
- Add a poster image for video.
- Attach captions.
- Add or edit transcripts.
- Configure media behavior:
  - Autoplay on/off.
  - Controls visible/hidden.
  - Seek enabled/disabled.
  - Resume enabled/disabled.
  - Required viewing threshold.
  - Volume default.
- Add timestamp-based cue points.
- Add media-linked interactions.
- Add media completion gates.

Required-view tracking is opt-in per video and defaults to a 90% watched threshold. Required videos save playback position and actual played ranges in Browser Preview and SCORM suspend data; ordinary videos are not tracked. Seeking past content does not count toward watched coverage.

### Initial Media Types

```text
Video:
- MP4 preferred
- H.264 video
- AAC audio

Audio:
- MP3
- M4A/AAC
- WAV accepted for authoring, warning for large exports

Captions:
- WebVTT

Images:
- PNG
- JPG/JPEG
- SVG
```

### Media Cue Point Actions

```text
pause-and-show-callout
pause-and-launch-question
reveal-block
enable-continue-button
jump-to-scene
set-completion-flag
set-bookmark-marker
```

---

## 7.4 Assessment Authoring

### Initial Question Types

```text
Multiple choice
Multiple response
True/false
Matching
Sequencing
Fill-in-the-blank
Short answer/self-assessment
```

### Assessment Settings

- Question required/optional.
- Randomized answer order.
- Correct-answer feedback.
- Incorrect-answer feedback.
- Retry count.
- Retry feedback.
- Score weighting.
- Passing score.
- Remediation scene.
- Question-level SCORM interaction reporting when enabled.

---

## 7.5 Accessibility

### Required Capabilities
- Image alt text.
- Decorative-image designation.
- Video captions.
- Video transcript.
- Audio transcript.
- Keyboard-accessible navigation.
- Visible focus indicators.
- Accessible labels for buttons and hotspots.
- Reading order configuration.
- Reduced-motion setting.
- No automatic media playback by default.
- Color-contrast warnings for native editable blocks.

### Validation Warnings

```text
Warning: Video "inspection-demo.mp4" has no captions.
Warning: Image block on Scene 5 has no alt text.
Warning: Hotspot "hs-004" is not keyboard accessible.
Warning: Required scene has no visible navigation control.
```

---

## 8. SCORM Export Requirements

## 8.1 Export Profiles

| Profile | Purpose |
|---|---|
| SCORM 2004 4th Edition | Primary Blackboard Learn output |
| SCORM 1.2 | Compatibility output |
| Local Preview | Browser preview with simulated LMS tracking |
| Standalone HTML | Optional non-SCORM course package |

## 8.2 SCO Design

```text
Course package
└── One SCO
    ├── Course player
    ├── Scene navigation
    ├── Media player
    ├── Assessments
    ├── SCORM runtime adapter
    ├── Storyboard JSON
    └── Packaged local assets
```

## 8.3 SCORM Tracking

### SCORM 2004
- Completion status.
- Success status.
- Raw score.
- Scaled score.
- Minimum and maximum score.
- Bookmark/location.
- Progress measure.
- Session time.
- Suspend/resume state.
- Optional interaction reporting.

### SCORM 1.2
- Lesson status.
- Raw score.
- Bookmark/location.
- Session time.
- Compact suspend/resume state.
- Optional interaction reporting.

## 8.4 Completion Rules

```text
Complete all required scenes.
Complete a percentage of required scenes.
Watch a percentage of required video.
Play required audio to completion.
Complete required knowledge checks.
Achieve a minimum assessment score.
Complete a defined combination of the above.
```

---

## 9. Validation and Build Reports

## 9.1 Pre-Build Validation

The builder must validate:

```text
- Missing assets
- Broken asset references
- Missing captions or transcripts
- Unsupported source content
- Missing required scene titles
- Missing accessibility labels
- Missing assessment answers
- Invalid completion logic
- Duplicate identifiers
- Invalid SCORM identifiers
- Package size estimate
- Oversized media files
- External URL dependencies
```

## 9.2 Build Report Example

```text
Chimera Build Report
====================

Project: Equipment Inspection Fundamentals
Export Profile: SCORM 2004 4th Edition
Build Status: Passed with Warnings

Package Size: 184.6 MB
Warning Threshold: 200 MB

Scenes: 18
Required Scenes: 15
Videos: 3
Audio Files: 12
Caption Tracks: 3
Assessments: 10 questions

Warnings:
- Scene 8: Image has no alt text.
- Scene 12: Video transcript is missing.
- Slide 14: SmartArt retained as background image.
- Slide 16: Custom animation not converted.

Errors:
- None
```

---

## 10. Development Phases

## Phase 0 — Foundation

### Deliverables
- Repository structure.
- Local development environment.
- Project-folder creation.
- JSON schema definitions.
- File locking and atomic save utilities.
- Basic FastAPI service.
- React application shell.

### Exit Criteria
- User can create, open, list, and delete local projects.
- Project metadata persists without a database.
- Project files survive application restart.

---

## Phase 1 — PPTX Import and Rendering

### Deliverables
- PPTX upload/import workflow.
- Secure ZIP validation.
- PowerPoint extraction service.
- Slide image rendering adapter.
- Source asset extraction.
- Conversion warning report.
- Initial storyboard generation.

### Exit Criteria
- User can import a PPTX.
- Every slide appears in a storyboard scene list.
- Slide thumbnails render locally.
- Extracted text and speaker notes are available.
- Unsupported objects are flagged, not silently discarded.

---

## Phase 2 — Storyboard Editor

### Deliverables
- Scene list and reordering.
- Canvas preview.
- Basic block editing.
- Scene metadata editor.
- Fidelity/hybrid/native layout modes.
- Autosave and revision history.
- Local project export/import.

### Exit Criteria
- User can reorder scenes.
- User can edit scene titles and text overlays.
- User can add and remove text, image, button, and hotspot blocks.
- User can restore a prior storyboard revision.

---

## Phase 3 — Audio/Video Authoring

### Deliverables
- Media asset manager.
- Video and audio blocks.
- Scene narration.
- Video poster images.
- Caption upload and attachment.
- Transcript editor.
- Timeline/cue-point editor.
- Media playback settings.
- Required-media completion tracking.

### Exit Criteria
- User can add video and audio to a scene.
- User can attach a WebVTT caption file.
- User can edit a transcript.
- User can add a cue point that triggers a scene event.
- Local preview can resume video at a saved position.

---

## Phase 4 — Assessments and Completion

### Deliverables
- [x] Single-choice assessment item authoring and QTI 2.1 item export.
- [x] Multiple-response, true/false, ordering, drag-and-drop, matching, and short-answer authoring and QTI 2.1 item export.
- [x] QTI 2.1 assessment-test packaging with multi-item aggregate scoring.
- [x] Assessment retry limit and passing threshold settings in local preview.
- [x] Multiple choice with single and multiple correct answers.
- [x] True/false, ordering, drag-and-drop, matching, and short-answer question formats.
- [x] Feedback and retry behavior for single-choice preview items.
- [x] Course completion rule engine across required scene visits, required audio, and assessment resolution.
- [x] Weighted course score and configurable passing threshold.
- [x] Assessment remediation navigation with a return path to the question.

### Exit Criteria
- User can create a scored knowledge check.
- User can configure passing score and retry behavior.
- Completion and success results are calculated correctly in local preview.
- Course progression responds to required media and assessment rules.

---

## Phase 5 — SCORM 2004 Export

### Deliverables
- SCORM 2004 4th Edition manifest generator.
- Course player template.
- SCORM 2004 runtime adapter.
- Media packaging.
- Bookmark/resume tracking.
- Completion and success reporting.
- ZIP packaging.
- Build report.

### Exit Criteria
- Chimera produces an installable SCORM ZIP.
- The ZIP includes `imsmanifest.xml` at the root.
- Packaged course launches in a SCORM test environment.
- Completion, score, bookmark, and resume behavior function as designed.
- Video, captions, transcripts, and assessments work within the SCO.

---

## Phase 6 — SCORM 1.2 Compatibility Export

### Deliverables
- SCORM 1.2 manifest generator.
- SCORM 1.2 runtime adapter.
- Status mapping from canonical completion model.
- Compact suspend/resume serialization.
- Compatibility test suite.

### Exit Criteria
- Chimera produces a SCORM 1.2 ZIP from the same storyboard.
- Course can report lesson status, score, and bookmark.
- Media and core assessments operate without dependence on SCORM 2004-specific behavior.

---

## Phase 7 — Blackboard Validation and Hardening

### Deliverables
- Blackboard-focused validation checklist.
- Package-size reporting and configurable warning threshold.
- Browser compatibility matrix.
- Error handling for blocked media, missing assets, and failed LMS calls.
- Author-facing diagnostic report.
- Regression test fixtures.

### Exit Criteria
- Test packages have been validated in the target Blackboard Learn environment.
- Launch, completion, scoring, bookmarking, media playback, captions, and resume behavior are verified.
- Known Blackboard-specific behavior is documented in the build report and release notes.

---

## Phase 8 — Release-Candidate Qualification

### Deliverables
- [x] Archive-level SCORM checks in each build report for manifest validity, one SCO, required launch files, packaged local references, and runtime profile.
- [x] Regression tests for both SCORM profiles, including a deliberately broken manifest reference.
- [x] JavaScript syntax checks for generated SCORM 2004 and SCORM 1.2 runtimes when Node.js is available.
- [x] A release checklist that distinguishes deterministic local checks from environment-specific Blackboard observations.

### Exit Criteria
- [x] Both SCORM profiles pass archive qualification and the backend regression suite.
- [x] Browser and Blackboard evidence is recorded with the tested workflow and any observed limitations.
- [x] The release checklist contains no stale or contradictory verification state.

Local Phase 8 qualification is complete for both profiles. Human LMS acceptance is package-specific: the compatibility checklist records SCORM 1.2 acceptance for the identified replacement package and states that the current target LMS does not accept SCORM 2004. Do not generalize that acceptance to other packages or environments. Both package reports retain content warnings for missing image alt text and an empty assessment scene, which must be resolved before treating that qualification storyboard as content-ready.

---

## 11. Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Complex PowerPoint features do not convert cleanly | Loss of editable fidelity | Preserve rendered slide as background; flag unsupported features |
| Media makes packages too large | Blackboard upload or course-storage issue | Provide package analysis, asset size report, warning thresholds, and optional media optimization |
| LMS runtime differences | Tracking discrepancies | Isolate SCORM runtime adapters; validate against target Blackboard environment early |
| SCORM 1.2 resume-state constraints | Incomplete learner resume behavior | Store only compact state: scene, media offset, completion flags, and assessment outcomes |
| Browser media compatibility | Video/audio playback failure | Use defined output media profiles and pre-build warnings |
| No database limits concurrent editing | File conflicts | Single-user project locking, atomic writes, and revision snapshots |
| Unsupported PPTX objects | Author confusion | Conversion warnings and explicit retain/replace/omit choices |
| Missing accessibility content | Reduced usability or compliance risk | Require captions/transcripts/alt text validation before build |

---

## 12. Initial Backlog

### Priority 1
- [x] Create local project workspace.
- [x] Import PPTX.
- [x] Extract slide text and notes.
- [x] Render slide previews.
- [x] Generate initial storyboard JSON.
- [x] Display scene list and slide canvas.
- [x] Save project without database.
- [x] Export/import storyboard JSON.

### Priority 2
- [x] Add editable text overlays.
- [x] Add audio narration.
- [x] Add video block.
- [x] Add captions and transcripts.
- [x] Add local preview player.
- [x] Add media resume and required-view tracking.
- [x] Add pre-build validation.

### Priority 3
- [x] Add all supported QTI 2.1 assessment item types, assessment-test export, and local preview scoring.
- [x] Add completion rule engine, weighted course score, and remediation navigation.
- [x] Build SCORM 2004 package.
- [x] Build SCORM 1.2 package.
- [x] Create package-size report.
- [x] Validate Blackboard Learn behavior in `Hart's Ultra Sandbox` with `Erik Hart_PreviewUser` (checklist: `docs/scorm-compatibility-checklist.md`).

### Priority 4
- [x] Add additional assessment types.
- [ ] Add hotspot and branching interactions.
- [x] Add native editable layouts.
- [ ] Add optional FFmpeg media optimization.
- [x] Add template library.
- [ ] Add advanced PowerPoint conversion support.

---

## 13. Definition of Done for Initial Operational Release

Chimera is ready for initial operational use when it can:

- Import a PPTX locally.
- Generate and save an editable storyboard without a database.
- Preserve source-slide visuals using rendered backgrounds.
- Extract and expose slide text and speaker notes.
- Support author-added video, audio, captions, transcripts, and downloadable resources.
- Support basic knowledge checks and completion rules.
- Produce SCORM 2004 4th Edition and SCORM 1.2 packages.
- Package all course assets locally in the SCO.
- Provide a local preview mode.
- Generate a validation/build report.
- Demonstrate successful launch, media playback, completion, score reporting, and resume behavior in the intended Blackboard Learn environment.