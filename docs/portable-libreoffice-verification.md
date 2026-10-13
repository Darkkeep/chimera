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

## Extended Word qualification: 2026-10-06

- Fresh TestFrame revision 8 export converted to a 35-page PDF, containing 31 editable tables and two embedded images.
- A copy generated through Chimera's Word exporter with accented Latin text, Greek characters, typographic punctuation, and 100 long paragraphs converted to 41 pages. PDF text checks confirmed Unicode and the final long paragraph survived; representative first/last page renders were inspected visually.
- A working copy with an edited paragraph, an edited table cell, and added Unicode text was converted to PDF and resaved as DOCX through LibreOffice. Reopening the saved DOCX confirmed the table-cell edit and Unicode persisted, with all 31 tables and both embedded images retained. The original project was not modified.
- Evidence: `workspace/portable-libreoffice-verification/word-qualification-results.json`, `qualify_word.py`, `storyboard-current.docx/pdf`, `storyboard-stress.docx/pdf`, `storyboard-qualification-edit.docx/pdf`, `storyboard-qualification-reopened.docx`, and rendered page PNGs.
- Interactive Writer launch was rejected by automatic approval review, without a specific reason supplied. Mouse/keyboard editing in Writer remains unverified; the headless edit/save/reopen checks above do not close that gate.

## Repeat the local verification

From the repository root, with the retained evidence folder:

```powershell
$env:PYTHONPATH = (Get-Location).Path
.\.venv\Scripts\python.exe -u workspace/portable-libreoffice-verification/verify.py
.\.venv\Scripts\python.exe -m unittest backend.tests.test_render_discovery
```

To inspect the document interactively, open `workspace/portable-libreoffice-verification/storyboard.docx` with `tools/LibreOfficePortable/LibreOfficeWriterPortable.exe`.
