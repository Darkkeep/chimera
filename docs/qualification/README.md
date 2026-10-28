# Retained release qualification evidence

## Scope of later documentation and provider changes

The October 27 six-provider connection work and refreshed [user guide](../user-guide.md#configure-media-connections) do not extend the dated evidence below. Its targeted test results are recorded in [current work](../current-work.md#october-27-media-provider-connections-and-help); provider screenshots use inert safe-status fixtures with [separate provenance](../user-guide/refresh-providers-2026-10-27.json). No real-provider entitlement, narration-quality or Synthesia/Shotstack video-generation qualification is implied. Video generation for those two providers is not yet implemented. Existing LMS attestations remain specific to their original package hashes; new code requires its own candidate/CI and human release decisions.

## Archived artifact verification

`2026-10-06/` contains the exact synthetic artifacts inspected in Word and supplied for human SCORM 1.2 verification. `SHA256SUMS` identifies all retained files; these are versioned repository artifacts, not references to a disposable workspace. The source snapshots, edited Word document and both answer-key modes are included. The media was created locally for qualification and contains no third-party assets or learner data.

From a fresh checkout, run:

```powershell
python docs/qualification/support/verify.py
```

To regenerate equivalent synthetic fixtures, install `backend/requirements.txt`, then run the generators from the repository root:

```powershell
python docs/qualification/support/qualify_word.py
python docs/qualification/support/qualify_scorm.py
```

Regenerated outputs go into `workspace/qualification-regenerated/`, with a separate isolated fixture workspace for each generator. IDs, timestamps and ZIP metadata change; regenerated equivalents are not byte-identical to the retained originals. Open the DOCX in Word to render PDFs and verify normal paragraph/table editing. The archived edited document records those edits for the original pass. SCORM generation/structure checks do not replace independent LMS testing.

The human attestation and remaining larger-course/suspend-data limits are recorded in [the dated qualification record](../release-qualification-2026-10-06.md).
