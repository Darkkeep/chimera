# Chimera backend

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

The API stores projects under `workspace/projects` by default. Set `CHIMERA_WORKSPACE` to use another location.

Rendered slide previews require LibreOffice with `soffice` available on `PATH`. If it is unavailable, PPTX import still extracts slide content and reports that previews could not be generated.

Scene edits are saved to `storyboard.json`; each update archives the previous storyboard under the project's `history` directory.
Scene action descriptions are stored separately from speaker notes and are included in storyboard JSON export.

PowerPoint scene templates are stored under `workspace/templates` (or the configured `CHIMERA_WORKSPACE`) and can be uploaded, renamed/described, or replaced with a revised PPTX in the UI. Scene ordering and template references are saved in each project's storyboard.

Project media uploads support JPG, PNG, GIF, WebP, MP3, M4A, AAC, WAV, and OGG files up to 100 MB. Media files are stored under each project's `assets` directory and scene references are stored in `storyboard.json`.

Each media asset has attribution text and a `draft` or `complete` status. Draft attribution is allowed during authoring. Production readiness is checked with `GET /api/projects/{project_id}/validation?target=production`; it fails until every media asset has non-empty attribution text and `complete` status. SCORM package production is not implemented yet.
