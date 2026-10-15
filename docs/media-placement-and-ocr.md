# Media placement, shared copies and OCR

Media library > **Placement, captions, and shared media** contains the new controls. Upload image/audio as before, or MP4/WebM video up to 100 MB. Container headers are validated; codec support must be checked in Preview on the intended browsers. Prefer MP4 with widely supported codecs for broad distribution. Video is optional learner playback, not a completion requirement in this release.

Choose media, a descriptive role (supporting content, narration or demonstration), a placement scope, order and position before/after scene content, then **Save placement**. No upload, shared-library copy or generation automatically places content. Entire-course placement applies to all scenes, including new ones. A scene placement overrides that asset's course placement; a scene exclusion suppresses inheritance only. Removing a scene placement restores inheritance when applicable. Shared asset IDs are stable within a project, so a shared copy cannot update a course invisibly.

Images need a placement description or a decorative designation. Audio/video have native keyboard-accessible controls, optional looping/muting and transcript disclosure. Required audio cannot loop. Video production export requires valid WebVTT captions, a transcript and complete credit. Save these under **Transcript and timed captions**. Plain WebVTT caption cues travel inside packaged data and populate native text tracks directly in Preview and packaged players, including standalone courses. No caption fetch is required for local files. Cue positioning, regions and STYLE blocks are not interpreted by this release; use plain timed text. A same-origin caption endpoint also exposes the original WebVTT text. Playback never autostarts.

Installation administrators can **Publish copy to shared library**. This is an explicit publication of the media and its metadata to authors using this installation. An author can **Copy to project**, creating independent project bytes, credits, captions and provenance; copying identical media preserves existing project metadata. Publishing a replacement creates a new immutable library record. Withdrawing a record removes it from browsing and copying; pinned project copies remain intact. Usage details identify affected scenes. Remove placements before removing a project asset. Immutable bytes are retained for history/review snapshots. Backups retain unused project media; learner packages include only referenced media.

## Local OCR

Reference resources continue accepting PDF, DOCX, PPTX, TXT and Markdown. In enhancement review, expand **Local PDF text recognition (OCR)** for PDF references. OCR is explicit, local and independent of the AI provider. It creates a new reference version with page locators, retaining the source bytes and earlier versions. Inspect passages, then choose **Use inspected OCR text** before it may ground suggestions. Recognition is not factual approval. Jobs pinned to older versions retain their sources.

PyMuPDF integrates the OCR engine and needs Tesseract language data; see its [installation instructions](https://pymupdf.readthedocs.io/en/latest/installation.html#enabling-integrated-ocr-support). Install the pinned English data without administrator rights:

```powershell
.\.venv\Scripts\python.exe scripts/setup-ocr.py
```

The script downloads `eng.traineddata` from [tessdata_fast](https://github.com/tesseract-ocr/tessdata_fast/tree/87416418657359cb625c412a48b6e1d6d41c29bd), verifies SHA-256 `7d4322bd2a7749724879683fc3912cb542f19906c83bcc1a52132556427170b2`, and writes ignored `tools/tessdata`. Its Apache-2.0 licensing and upstream notices apply when redistributing language data. No language binaries are committed. Set `CHIMERA_OCR_TESSDATA` to another trusted language directory for a different installation. Missing language data disables OCR with instructions; it never produces apparently grounded empty text.

OCR accepts unencrypted PDFs of at most 20 pages, renders at 150 DPI and rejects excessive page dimensions. A 60-second elapsed check between pages limits continued processing; a single engine call is synchronous and cannot be interrupted by this check. Split expensive documents rather than treating this as a hard per-request timeout. OCR output is always initially pending inspection, and failures retain the old version.

## Word and AI

Word exports include media transcripts and accepted-enhancement citations with pinned resource version, locator, excerpt and source hash. Citations describe accepted proposal provenance; subsequent author edits may need renewed source review. **Include review discussion** is opt-in authoring material; comments stay outside learner packages and answer-key selection remains independent.

AI submissions have a 256,000-byte complete-request budget. Drafting reference context is limited to 60,000 characters total and 8,000 per passage. Oversized submissions fail with an actionable error before a provider request; selected reference text is never silently truncated. Enhancement jobs show actual input/output token usage only when returned by the provider; currency estimates remain separate and approximate. No live-provider call is made by qualification tests.
