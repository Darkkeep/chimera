# Maintaining the illustrated user guide

## October 27 authored-scene refresh

The [authored-scene manifest](../refresh-authored-scenes-2026-10-27.json) records current Stage/Details, original comparison, direct template application, project background import/inheritance, new-scene, preview navigation, transcript, and discussion captures. It supersedes the older captures with matching filenames. The base Git commit alone does not identify uncommitted implementation; the manifest includes SHA-256 hashes of the relevant application source files.

Use a dedicated fixture and the isolated services on 8017/5178 described below:

```powershell
$env:CHIMERA_GUIDE_DIR = Join-Path (Get-Location) 'workspace/user-guide-authored-20261027'
.\backend\.venv\Scripts\python.exe docs/user-guide/support/seed-authored-scenes.py
node docs/user-guide/support/capture-authored-scenes.cjs
```

The seed creates or verifies only the named guide fixture. It generates a synthetic PowerPoint reference using local LibreOffice, a synthetic authored composition, and a simple demonstration backdrop. No user course is copied. The capture verifies the single fixture project's identity before interaction, imports the backdrop through Project background, exercises Apply template and Undo without saving a scene change, and captures comparison and preview controls. Provider/engine browser requests are blocked; no credentials or paid generation are needed. Repeated runs reuse the isolated fixture and refresh the same images. The original source-reference demonstration is not a fidelity qualification for arbitrary PowerPoint files.

Review refreshed images, then use the established PDF commands below. Update guide text, screenshot provenance, and PDF together. Preserve the date and evidence boundaries of historical captures and release records.

## October 27 provider-tabs refresh

The [provider/narration manifest](../refresh-providers-2026-10-27.json) records seven refreshed screenshots: all six provider tabs plus explicit narration connection selection. It supersedes earlier captures of `ai-connection-current.png` and `media-narration-form.png`; assessment/navigation provenance remains in its separate manifest below. The backend/UI must include the provider changes, even when the manifest's base commit predates those uncommitted changes.

Run `node docs\user-guide\support\capture-provider-tabs.cjs` from the repository root with the October 27 fixture and isolated services on 8017/5178. It verifies the fixture identity before interaction and refuses any other frontend port. It mocks safe connection status, credential-store availability and a documentation-only Cartesia narration capability in the browser. All forms are captured without a key; the narration example has a clearly named fixture connection/voice. Non-GET browser API requests and Pythia/external HTTPS requests are blocked. No provider settings are saved, tests/generation submitted, secrets accessed, user projects read or demonstration content mutated.

For these isolated services, set `CHIMERA_WORKSPACE` to `workspace\user-guide-20261027\data`, `CHIMERA_PYTHIA_BASE_URL` to `http://127.0.0.1:1` and clear all provider variables (`CHIMERA_AI_*`, `ELEVENLABS_API_KEY`, `CARTESIA_API_KEY`, `SYNTHESIA_API_KEY`, `SHOTSTACK_SANDBOX_API_KEY`, `SHOTSTACK_PRODUCTION_API_KEY`). Do not enable a real provider for capture. The actual service account's credential-store/ADC availability is not certified by these inert status fixtures.

Inspect the seven images, update the corresponding guide instructions, rebuild/verify the PDF using the commands below, and stop only the isolated services you started. Keep Synthesia/Shotstack explicitly labelled connection-only; screenshots and mock-based tests are not proof of video generation or paid provider access.

## October 27 documentation refresh

The Markdown and PDF instructions now describe **WORKSPACE > Assessments**, **Storyboard > Project background**, reviewed QTI/CSV/XLSX question import/export, **Fill-in-the-blank**, and the collapsed bottom **Tags and learning-objective references** search/dropdowns. The [October 27 manifest](../refresh-manifest-2026-10-27.json) records 19 current assessment/navigation captures, including all seven question types, the question bank/import review, Storyboard background location, named assessments, and collapsed/expanded metadata with existing-value search. Older capture manifests still apply to images not replaced by this selective refresh. A PDF rebuild does not imply a full screenshot or release qualification.

### Reproduce the October 27 assessment captures

Set `$env:CHIMERA_GUIDE_DIR = Join-Path (Get-Location) 'workspace\user-guide-20261027'`, then run `.\backend\.venv\Scripts\python.exe docs\user-guide\support\seed.py` once. The seed refuses to overwrite an existing fixture. Start the isolated services described below on 8017/5178, with `CHIMERA_WORKSPACE` pointing to this fixture's `data` directory and provider settings empty. Set `CHIMERA_PYTHIA_BASE_URL` to `http://127.0.0.1:1` to avoid connecting to a real Engine.

Run `node docs\user-guide\support\capture-assessments.cjs` from the repository root. It verifies the single fixture project identity before interacting, reviews but does not commit a template import, creates or updates the demonstration named assessment, and saves accepted-answer/tag/reference demonstration data. It opens the other question's searchable dropdowns to show reuse. It blocks browser Pythia requests and uses no provider. Repeated runs reuse the isolated project and refresh the same images and manifest. Review the images, rebuild/verify the PDF, then stop only the isolated services.

When recapturing these workflows, use only an isolated demonstration project. Capture the workspace rail/Storyboard background control, assessment question bank/import review, Fill-in-the-blank, and the bottom reference section both collapsed and expanded with a searchable dropdown. Verify reuse/create/remove and save/reopen for both fields. No provider connection, paid request, or user course is needed. Target-LMS acceptance must remain explicitly unverified rather than inferred from screenshots or local browser tests.

The guide is [docs/user-guide.md](../../user-guide.md). PNG screenshots are stored in [images](../images/). [capture-manifest.json](../capture-manifest.json) records the original complete capture; [refresh-manifest-2026-10-14.json](../refresh-manifest-2026-10-14.json) records the refreshed controls.

These helpers run against a separate demonstration workspace. They do not require changes to the application code or use real project content. The demonstration slide image is a repository graphic copied unchanged; it is not evidence of PowerPoint rendering fidelity. The sample suggestion is an author proposal seeded for documentation, not AI-generated output. The generated-media candidate also uses fixture data rather than paid generation.

## Prerequisites

- Run commands from the repository root in PowerShell.
- Use an active Python environment with the backend requirements installed.
- Install the frontend's ordinary dependencies as described in the root README.
- Supply Playwright 1.59.1 and its compatible Chromium headless shell. System browser versions may not match the automation library.

Optional isolated tool installation:

```powershell
npm install --prefix workspace/user-guide-tools --no-save playwright@1.59.1
$env:GUIDE_PLAYWRIGHT = (Resolve-Path workspace/user-guide-tools/node_modules/playwright).Path
$env:PLAYWRIGHT_BROWSERS_PATH = Join-Path (Get-Location) 'workspace/user-guide-tools/browsers'
node workspace/user-guide-tools/node_modules/playwright/cli.js install chromium --only-shell
```

`workspace/` is ignored by Git. No browser binaries or sample project files belong in the documentation commit.

## Create the fixture

```powershell
python docs/user-guide/support/seed.py
```

The fixture is written to `workspace/user-guide-restored/data`. The script refuses to overwrite an existing fixture. Reuse the existing fixture for recaptures. If it needs replacement, first stop the demonstration server and explicitly rename that exact fixture directory to preserve it; do not remove a real authoring workspace.

## Start isolated services

Backend terminal, from the repository root:

```powershell
$env:CHIMERA_WORKSPACE = Join-Path (Get-Location) 'workspace/user-guide-restored/data'
$env:CHIMERA_AI_BASE_URL = ''
$env:CHIMERA_AI_API_KEY = ''
$env:CHIMERA_AI_MODEL = ''
python -m uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8017
```

Frontend terminal, also from the repository root:

```powershell
node frontend/node_modules/vite/bin/vite.js --config docs/user-guide/support/vite.config.mjs
```

The separate frontend runs at `http://127.0.0.1:5178` and proxies requests to port 8017. Ensure these ports are free. Do not point capture at a production server or the normal user workspace.

## Capture and review

After the isolated API has started, prepare inert job records for the Cancel/Retry screenshots. Do not enable an AI provider on the demonstration API. The capture cancels the queued example without starting a worker:

```powershell
python docs/user-guide/support/seed-jobs.py
```

In the capture terminal, set `GUIDE_PLAYWRIGHT` and `PLAYWRIGHT_BROWSERS_PATH` to the same locations used during tool setup, then run:

```powershell
node docs/user-guide/support/capture.cjs
```

The script verifies the isolated fixture project ID before interacting with the interface. It saves an example question and temporarily changes demonstration question/media metadata to expose conditional controls, then restores that data. It opens authoring forms, changes unsaved question types, navigates learner playback, and exercises incorrect/correct answers and remediation. It creates and accepts a current-revision author proposal, imports a sample reference, and creates/resolves sample comments. It never sends a request to an AI provider. Recapturing adds demonstration proposals and comments to the isolated fixture.

Review the resulting images and Markdown preview. Confirm that:

- Task instructions use current control labels.
- Every documented Chimera control appears in an image, including conditional states.
- Clickable thumbnails open readable full-size images.
- Pending features remain clearly marked as unavailable unless the actual implementation is verified.
- Images contain only demonstration data.

Record the current source commit and any applied recovery snapshot in the guide when refreshing it. A screenshot pass verifies the depicted controls and exercised interactions; it does not substitute for export, accessibility, provider, or LMS qualification.

Stop both demonstration services when finished. The capture browser closes automatically.

## Refresh changed controls and rebuild the PDF

The 2026-10-14 refresh uses a fresh fixture so older demonstration artifacts stay intact. Set `CHIMERA_GUIDE_DIR` to the absolute path of `workspace/user-guide-20261014` before running `seed.py`. Seed refuses to overwrite an existing fixture; reuse it for recapture. Start an isolated API on port 8019 with `CHIMERA_WORKSPACE` pointing to that fixture's `data` folder and provider environment settings empty. Serve the normal frontend on port 5179 with `/api` proxied to 8019. See the configuration pattern above; keep both services separate from the user's normal app.

Run `node docs/user-guide/support/capture-refresh.cjs` from the repository root. It uses installed `@playwright/test`, verifies the fixture identity, and refreshes changed controls. AI configuration display and generated-course content use inert documentation fixtures; no provider request is made. It edits only the demonstration project, resets its named demonstration Assessment for recaptures, creates a temporary course-draft demonstration, and moves that temporary project to the isolated trash afterward. `GUIDE_URL` and `CHIMERA_GUIDE_DIR` override the default address and fixture path. The refresh manifest records which screenshots changed; earlier images remain documented by the original capture manifest.

To produce the PDF from the current Markdown and images:

```powershell
.\backend\.venv\Scripts\python.exe docs/user-guide/support/render-pdf.py
node docs/user-guide/support/render-pdf.cjs
.\backend\.venv\Scripts\python.exe docs/user-guide/support/finalize-pdf.py
.\backend\.venv\Scripts\python.exe docs/user-guide/support/verify-guide.py
```

If a helper reports a missing Python dependency, install the declared documentation requirements into that environment with `.\backend\.venv\Scripts\python.exe -m pip install -r docs/user-guide/support/requirements.txt`, then retry. Update the footer date in `render-pdf.cjs` to match the guide's documented refresh date before rebuilding.

The Python helper creates ignored print HTML under `workspace/`. Chromium embeds the images and creates `docs/user-guide.pdf` in A4 landscape, with page numbers and repeated table headers. Missing images fail the render. PDF links to repository documents/images use GitHub `main` paths so they do not depend on the maintainer's local filesystem. Markdown links remain relative. Inspect representative PDF pages and check all image/link targets before committing the source, screenshots, manifests, and PDF together.
