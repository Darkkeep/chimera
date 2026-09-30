# Single-User Deployment Checklist

Use this checklist for a repeatable local demonstration while Team Mode remains scaffolded.

## Install

- [ ] Python 3.11+ is installed.
- [ ] Node.js and npm are installed.
- [ ] LibreOffice is installed if rendered slide previews are required.
- [ ] The workspace directory is writable.
- [ ] No provider credentials are stored in frontend files or project exports.

## Start

```powershell
cd backend
..\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

In a second terminal:

```powershell
cd frontend
npm run dev
```

Open `http://127.0.0.1:5173/`.

The repeatable API/artifact check can be run from the repository root:

```powershell
.\scripts\verify-single-user.ps1 -ProjectId testframe-565c5da8
```

It verifies health, installation mode, project loading, production validation, backup manifest integrity, Word artifact size, and the expected SCORM validation gate.

## Verify the installation

- [ ] `GET /api/health` returns `{"status":"ok"}`.
- [ ] `GET /api/installation/config` reports `single-user` and `local` identity.
- [ ] The browser can list projects and open the active storyboard.
- [ ] My Work displays identity, policy, project health, and audit activity.
- [ ] Preview opens and can navigate scenes without the backend learner runtime.
- [ ] Review comments can be created, replied to, resolved, and reopened.
- [ ] JSON backup and portable backup can be created and restored into a clean workspace.
- [ ] Word export downloads an editable document.
- [ ] SCORM 2004 and 1.2 exports succeed only after production validation passes.
- [ ] Export reports and known LMS limitations are recorded.

## Verification record: 2026-09-30

- [x] API health returned `ok`; installation configuration reported `single-user`, local identity, local tracking, and local residency.
- [x] Python 3.14.5, Node.js, and npm were available. LibreOffice was not available on `PATH`.
- [x] The browser opened `TestFrame`, loaded 28 scenes, entered Preview, navigated from scene 1 to scene 2, created a review comment, and resolved it without UI errors.
- [x] Portable backup downloaded successfully for `TestFrame`; its manifest contained the source revision, project files, audit events, history, and SHA-256 hashes.
- [x] Editable Word export downloaded successfully for `TestFrame`; structural inspection found 187 paragraphs, 29 tables, 1 embedded image, scene 28, and the storyboard revision. Answer keys were absent by default.
- [x] Backup round-trip and invalid-archive safety tests passed.
- [x] Recorded SCORM 1.2 and SCORM 2004 release archives passed manifest, packaged-reference, and runtime-profile checks; both reports were `passed-with-warnings`.
- [x] Fresh SCORM requests correctly enforced the production gate and returned HTTP 422 for incomplete attribution on `UncySam2.png`.
- [ ] Rendered Word pagination and ordinary editing inspection require Word or LibreOffice.
- [ ] Blackboard/LMS SCORM 1.2 qualification remains external; Blackboard evidence currently covers SCORM 2004 only.

## Team Mode boundary

Do not select Team Mode for a demonstration deployment. Encarta is intentionally fail-closed until its token validation, claims mapping, tenant mapping, logout/session behavior, and failure contract are implemented against the real Encarta integration.