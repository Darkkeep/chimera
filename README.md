# Chimera

Chimera is a local authoring tool for turning PowerPoint decks into editable storyboards and portable SCORM packages.

**Distinct parts. Deliberate design. Powerful learning.** The integrated Chimera mark brings a wing, body, and tail into one identity. See the [brand guide](docs/brand-identity.md) for assets and usage.

See the [illustrated user guide](docs/user-guide.md) for process-based task tables, step-by-step instructions, and screenshots of the current controls. Planned capabilities are labeled separately.

See [current work and handoff](docs/current-work.md) for completed milestones, remaining deployment checks, and continuing on another workstation.

The authoring workspace keeps scenes beside the canvas. Use a scene's pencil button to edit it directly, or **Edit scene** above the preview. Project selection and libraries live in the sidebar; **Review tools** groups validation, accessibility, completion rules, and guided review. **Export** opens SCORM packages, build reports, JSON backup/restore, and available QTI test export. Editing dialogs support Tab, Shift+Tab, and Escape.

In the scene editor's right-hand properties panel, each section starts collapsed. Select a section heading or focus it and press Enter or Space to expand it; its chevron turns down when open. Stage, Background, and Layers are always available, while Question, Animation, and Layout appear when applicable. Sections expand independently and reset when the editor is reopened.

Set a course-wide default under **Settings > Project background**. In **Edit scene > Stage > Background**, the thumbnail picker offers **Use project background**, a scene-specific image, or explicit **None**. Changing the project default updates inheriting scenes without replacing local overrides. Both pickers use images already in the project's Media library, including imported PowerPoint master backgrounds. Backgrounds fill the editable stage and are decorative; check text contrast and keep instructional details in accessible scene content. Saved choices are honored in Preview, SCORM 1.2/2004, and standalone exports, and retained in JSON and full backups. Original flattened source-slide previews remain unchanged; edit and save the Stage to use backgrounds on imported Fidelity scenes.

The **Pythia** group beside **Edit scene** contains scene analysis, transformation, and assessment design. It activates only after a healthy Pythia Engine connection is verified; individual actions also require their advertised capability and author permissions. Connection status refreshes every 30 seconds and appears in the Pythia button's tooltip, including when disabled. When unavailable, use **Check Pythia connection** to retry and inspect **Settings > Intelligence Engine**. Media provider settings do not enable Pythia.

Chimera opens on **My Work**, the first workspace menu item. Use **New Project** to create a course, select a project row to open its Storyboard, or **Resume authoring** to continue the remembered project. Project health shows manually declared production stages and categorized publication blockers; validation readiness is separate from approval. Project health scrolls at five projects, and Recent activity is collapsed by default with its own scroll area when expanded. See [My Work](docs/my-work.md).

Projects support two-level organizational subprojects. In a top-level project's **My Work > Project actions**, choose **Create subproject** or **Attach existing project**. Expand its subproject count to see accessible children and their individual health. A child's **Manage subproject** action moves it to another top-level project, detaches it, or sets its **Display order** (lower numbers first; ties use project ID). The sidebar and Media library selectors group children under their parent, and authoring shows a parent breadcrumb. Projects remain independent: scenes, assets, backgrounds, permissions, approval stages, previews, and exports are not inherited or merged. Aggregate approval counts include only visible children. Relationship changes require settings access on the child and affected parents; creating a child also requires project-creation permission.

Parents cannot move to Trash while they have active subprojects. A trashed child can return to its original parent if it is still available and authorized, or you can explicitly select a different parent or **None (restore to top level)** in Trash. Individual exports and archives contain only the selected project, not its family. Restoring a project archive restores content while preserving its current live parent attachment, rather than replaying the archive's older relationship. Existing projects without hierarchy metadata remain top-level projects.

The Media Library **Project** selector defaults to the active course and switches the active project while retaining the library view. **Add media** adds image/audio files to that project. **Create a media candidate** starts collapsed and cannot be expanded while AI availability is being checked or AI configuration or generation permissions are unavailable. It closes if AI availability is lost.

Configure an approved OpenAI connection through **Settings > AI connection**. Saved keys use the server account's OS credential store, never browser storage or project backups. Shared-deployment changes require an installation administrator. Existing server environment configuration remains supported; headless services without a supported credential store cannot save connections through the panel. See [AI connection](docs/ai-connection.md) for connection testing, request limits, and data-handling requirements.

Choose **Light**, **Dark**, or **System** under **Appearance** in the sidebar. The preference is remembered in this browser and shared across its tabs. Dark is the default; System follows changes to your device's color scheme. Slide images and uploaded media retain their original colors.

Onboarding's reusable engine and standalone demo live in the private [Darkkeep/onboarding repository](https://github.com/Darkkeep/onboarding). Chimera retains its application walkthroughs and installs the pinned release from `vendor/onboarding`, so no sibling checkout or GitHub credentials are needed. See the [implementation record](docs/onboarding-implementation.md) and [artifact update instructions](vendor/onboarding/README.md).

New media controls support explicit scene/course-wide placement, project copies of shared assets, captioned MP4/WebM video and local PDF OCR with author inspection. Word exports can include accepted source citations and optional review discussion. See [media placement and OCR](docs/media-placement-and-ocr.md), [resume-data limits](docs/resume-data-policy.md), and [release policy](docs/release-policy.md).

## Start locally

For local, Encarta, and networked authentication preparation, see the [deployment authentication guide](docs/authentication-deployments.md). Local single-user operation remains the default; hosted profiles use separate workspaces.

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

### Portable LibreOffice (Windows, no administrator installation)

For slide previews, download [LibreOffice Portable](https://portableapps.com/apps/office/libreoffice_portable), which is linked by the [LibreOffice project](https://www.libreoffice.org/download-other/). Run its portable package installer and select this checkout's `tools` folder as the destination. The resulting executable should be `tools\LibreOfficePortable\App\libreoffice\program\soffice.exe`. Chimera detects that location automatically; no system installation or PATH change is needed. Keep the complete portable folder together when distributing Chimera. The downloaded application is excluded from Git.

If the portable copy is stored elsewhere, set its executable path before starting the backend:

```powershell
$env:CHIMERA_LIBREOFFICE_PATH = 'D:\Apps\LibreOfficePortable\App\libreoffice\program\soffice.exe'
```

Restart the backend after adding LibreOffice. New PPTX imports use it to generate slide previews; reimport existing decks to generate missing previews. An explicitly configured path takes priority over the bundled portable copy and system installations; an invalid configured path leaves previews unavailable. Rendering uses a temporary, isolated LibreOffice profile. To inspect exported Word documents interactively, open them with `LibreOfficePortable.exe` in the portable folder.

See the [portable LibreOffice verification record](docs/portable-libreoffice-verification.md) for the tested package, checksum, slide-rendering results, and Word conversion checks.

Open http://localhost:5173. The authoring slice supports local project creation, PPTX upload, slide text and speaker-note extraction, image/audio asset capture, native animation/transition XML preservation, and slide previews. Switch between projects with the project selector; the selected project is remembered in this browser. Golden Path provides an in-app route through project setup, content review, media, image accessibility, learner preview, and validation. Preview opens a learner-style scene navigator, displays slide renders or scene text and attached images/audio, tracks required scene visits and required audio playback, and resumes progress in this browser. Assessment scenes support single-choice, multiple-correct, true/false, ordering, drag-and-drop, matching, and short-answer questions, answer-specific feedback, configurable attempts and passing thresholds, and local scoring/retry in Preview. Standalone QTI 2.1 item export supports all question types, and project assessment tests package multiple items with aggregate scoring. Per-item preview scores are binary (0% or 100%); retry and pass settings remain Chimera assessment settings and are not included in item XML. Export JSON downloads the active storyboard and asset manifest; it does not include media binaries. Import JSON replaces the active storyboard after validation and saves the previous version to history; referenced assets and templates must already be available in that project. Scenes have explicit purpose and layout settings, editable titles/text/notes/required status, media attachment, and persistent drag-and-drop sequencing. Use Image accessibility to add alternative text to attached images or mark them decorative; Run validation checks those descriptions alongside storyboard completeness, scene titles, template references, and media references and files. Upload images or audio to a project's Media library, preview them there, and attach/detach them from the selected scene. Upload PPTX files to the local Templates library, edit their names/descriptions, replace their source decks, and assign them to template-layout scenes. Storyboard saves create timestamped history snapshots. Slide previews require LibreOffice; without it, imports still succeed and the editor reports that previews are unavailable. Template uploads are limited to 50 MB and media uploads to 100 MB. SCORM packages can be built for SCORM 2004 and 1.2; local browser qualification covers both profiles, while Blackboard verification is documented for SCORM 2004 only. See the [SCORM compatibility checklist](docs/scorm-compatibility-checklist.md) for the recorded limits.

Use the [single-user deployment checklist](docs/single-user-deployment-checklist.md) for the repeatable local demonstration and release evidence.

Editable Word storyboard export is available from **Export**. Choose **SME Master** for editable landscape scene pages styled after the visual slide template, or **Full storyboard** for the Multimedia Instructional template with the SME pages and detailed scene records included. Scene text, tables, and production details remain editable Word content; answer keys are excluded unless explicitly selected.

**Export > Standalone course > Download standalone ZIP** creates a local course directory with its own player and media. Extract the entire ZIP and open `index.html`; no LMS, Chimera server, internet connection, or local web server is needed. Keep all packaged files together. Navigation, visual scenes, audio, and assessments remain available, but progress lasts only while the page is open and no LMS results are reported. The package includes launch instructions. Use SCORM instead when persistent learner tracking is required.

## License

Chimera is licensed under the [MIT License](LICENSE). Third-party components retain their own licenses; for example, the vendored `@guided-workflows/onboarding` package is ISC-licensed, with its license included in the package tarball.

## Verify changes

From the repository root, run the backend suite with `python -m unittest discover -s backend/tests`, build with `npm --prefix frontend run build`, and run Chromium workflows with `npm run test:onboarding -- --project chromium`. `npm run test:management` targets My Work. The browser suites use temporary workspaces and inert AI responses, not real provider credentials. Hosted HTTPS verification remains `npm run test:auth` after the frontend build.
