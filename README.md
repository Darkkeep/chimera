# Chimera

Chimera is a local authoring tool for turning PowerPoint decks into editable storyboards and portable SCORM packages.

**Distinct parts. Deliberate design. Powerful learning.** The integrated Chimera mark brings a wing, body, and tail into one identity. See the [brand guide](docs/brand-identity.md) for assets and usage.

See the [illustrated user guide](docs/user-guide.md) for process-based task tables, step-by-step instructions, and screenshots of the current controls. Planned capabilities are labeled separately.

The authoring workspace keeps scenes beside the canvas. Use a scene's pencil button to edit it directly, or **Edit scene** above the preview. Project selection and libraries live in the sidebar; **Review tools** groups validation, accessibility, completion rules, and guided review. **Export** opens SCORM packages, build reports, JSON backup/restore, and available QTI test export. Editing dialogs support Tab, Shift+Tab, and Escape.

Choose **Light**, **Dark**, or **System** under **Appearance** in the sidebar. The preference is remembered in this browser and shared across its tabs. System is the default and follows changes to your device's color scheme. Slide images and uploaded media retain their original colors.

Onboarding's reusable engine and standalone demo live in the private [Darkkeep/onboarding repository](https://github.com/Darkkeep/onboarding). Chimera retains its application walkthroughs and installs the pinned release from `vendor/onboarding`, so no sibling checkout or GitHub credentials are needed. See the [implementation record](docs/onboarding-implementation.md) and [artifact update instructions](vendor/onboarding/README.md).

## Start locally

### Backend

Install Python 3.11+ and run:

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

### Frontend

In another terminal:

```powershell
cd frontend
npm install
npm run dev
```

Open http://localhost:5173. The authoring slice supports local project creation, PPTX upload, slide text and speaker-note extraction, image/audio asset capture, native animation/transition XML preservation, and slide previews. Switch between projects with the project selector; the selected project is remembered in this browser. Golden Path provides an in-app route through project setup, content review, media, image accessibility, learner preview, and validation. Preview opens a learner-style scene navigator, displays slide renders or scene text and attached images/audio, tracks required scene visits and required audio playback, and resumes progress in this browser. Assessment scenes support single-choice, multiple-correct, true/false, ordering, drag-and-drop, matching, and short-answer questions, answer-specific feedback, configurable attempts and passing thresholds, and local scoring/retry in Preview. Standalone QTI 2.1 item export supports all question types, and project assessment tests package multiple items with aggregate scoring. Per-item preview scores are binary (0% or 100%); retry and pass settings remain Chimera assessment settings and are not included in item XML. Export JSON downloads the active storyboard and asset manifest; it does not include media binaries. Import JSON replaces the active storyboard after validation and saves the previous version to history; referenced assets and templates must already be available in that project. Scenes have explicit purpose and layout settings, editable titles/text/notes/required status, media attachment, and persistent drag-and-drop sequencing. Use Image accessibility to add alternative text to attached images or mark them decorative; Run validation checks those descriptions alongside storyboard completeness, scene titles, template references, and media references and files. Upload images or audio to a project's Media library, preview them there, and attach/detach them from the selected scene. Upload PPTX files to the local Templates library, edit their names/descriptions, replace their source decks, and assign them to template-layout scenes. Storyboard saves create timestamped history snapshots. Slide previews require LibreOffice; without it, imports still succeed and the editor reports that previews are unavailable. Template uploads are limited to 50 MB and media uploads to 100 MB. SCORM packages can be built for SCORM 2004 and 1.2; local browser qualification covers both profiles, while Blackboard verification is documented for SCORM 2004 only. See the [SCORM compatibility checklist](docs/scorm-compatibility-checklist.md) for the recorded limits.

Use the [single-user deployment checklist](docs/single-user-deployment-checklist.md) for the repeatable local demonstration and release evidence.

Editable Word storyboard export is available from **Export**. The document preserves scene text as editable Word content and includes authoring directions, speaker notes, media details, accessibility text, assessments, and the source revision. Answer keys are excluded unless explicitly selected.
