# Chimera 1.1.0 evaluation installation

Human acceptance is pending. This package is for local evaluation. See
`docs/qualification/human-acceptance-1.1.0.md` and its interactive HTML checklist.
The ZIP does not certify Word editing, screen-reader usability, instructional
quality, or acceptance of newly exported packages in your LMS.

Extract the entire ZIP into a new folder. Requires Windows, Python 3.11+ and
Node.js 22.12+ (Node.js 24.19 was used for qualification), with Python and npm
on PATH. Internet access is required during setup. This is a source-based
installation, not a standalone executable; runtimes are not bundled.

1. Open PowerShell in the extracted folder. Run `./Install-Chimera.ps1`.
2. Run `./Start-Chimera.ps1 -Service Backend`.
3. In another PowerShell window in the same folder, run
   `./Start-Chimera.ps1 -Service Frontend`.
4. Open <http://localhost:5173>. Keep both terminals running; Ctrl+C stops them.

Use your organization's normal process if PowerShell script execution is
restricted. The manual commands are in README.md. The launcher uses Vite's
local development server; it is intended for local evaluation only.

Install LibreOffice separately for PPTX previews, following README.md. OCR
engine/language setup is documented in docs/media-placement-and-ocr.md.
No API key is required to start; configure an approved connection in Settings
for AI features. No provider credentials, existing projects, account data,
shared library, or optional third-party executables are bundled.

The default local data directory is `backend/workspace/` when using this launcher.
An existing `CHIMERA_WORKSPACE` environment setting overrides that location.
Extract future packages into new
folders and follow the backup/recovery instructions in docs/release-policy.md
before migrating data. Preserve installation identity/configuration and shared
library data separately from project archives.

`PACKAGE-MANIFEST.json` records the exact application source revision and
SHA-256 of every payload file. The sibling `.sha256` file checks the whole ZIP:
`Get-FileHash ./chimera-*.zip -Algorithm SHA256`.

Packaging helpers are identified separately in the manifest because they may
be prepared after the recorded application commit. Publishing a final release
still requires the review, CI, and applicable acceptance gates in release policy.
Pinned submodule sources are included at their recorded commits; no GitHub
credentials or submodule checkout is needed to use the extracted package.
