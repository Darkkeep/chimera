# Portable LibreOffice verification

Verified on Windows on 2026-10-06 without a system LibreOffice installation.

## Package

- Publisher download: https://download.documentfoundation.org/libreoffice/portable/26.2.4/LibreOfficePortable_26.2.4_MultilingualStandard.paf.exe
- Package listing and checksum: https://portableapps.com/apps/office/libreoffice_portable
- SHA-256 verified before execution: `4bde93374aef4409243505b20d16561a4628ac7591457dd01fc6e1ccf571ba65`.
- Extracted to `tools/LibreOfficePortable`; package wizard reported successful completion. No machine-wide installation or PATH changes were used.
- `App/libreoffice/program/soffice.com --version` reported LibreOffice 26.2.4.2, build `0229ac93fcf0d7cbc6376066c6f35021cef002dc`.

## Results

- Chimera discovered the portable `soffice.exe` automatically.
- The real `TestFrame` source PPTX rendered through `backend.app.render.render_slides`: 26 PNG slide previews, no rendering warning. The 28-scene storyboard includes scenes added separately from the source deck.
- A fresh Word export from the running API converted to a 34-page PDF. Contact sheets of all pages were visually inspected for readable content, tables, image placement, and pagination. The export includes a cover page and separate scene pages; long speaker notes continue onto subsequent pages.
- An edited copy was opened and saved as DOCX by LibreOffice's headless conversion. The added text and all 29 tables survived the round trip.
- Three discovery tests and the two existing renderer fallback/rasterization tests passed.
- The running backend was restarted to load portable discovery support.

Local evidence is retained in `workspace/portable-libreoffice-verification`: original and edited DOCX files, LibreOffice-resaved DOCX, PDF, slide PNGs, page contact sheets, verification scripts, and `results.json`. This folder and the application binaries are excluded from Git.

LibreOffice emitted `Could not find platform independent libraries <prefix>` during the Word conversions; conversions returned zero and produced verified files. Interactive Writer editing, broader Unicode/layout fixtures, and execution on a separately restricted user account were not tested by this pass. Application execution restrictions remain dependent on the user's Windows policy.

## Repeat the local verification

From the repository root, with the retained evidence folder:

```powershell
$env:PYTHONPATH = (Get-Location).Path
.\.venv\Scripts\python.exe -u workspace/portable-libreoffice-verification/verify.py
.\.venv\Scripts\python.exe -m unittest backend.tests.test_render_discovery
```

To inspect the document interactively, open `workspace/portable-libreoffice-verification/storyboard.docx` with `tools/LibreOfficePortable/LibreOfficeWriterPortable.exe`.
