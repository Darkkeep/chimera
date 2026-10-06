# Release qualification: 2026-10-06

## CI reliability

PR #1's run `37469497612` failed four WebKit checks and reported one flaky check. Clicks stalled during visibility/stability, scrolling or dispatch; one retry exhausted its overall test deadline during an API read. This is insufficient evidence of a product defect.

Commit `feaf2a6` uses one worker on CI and retains three locally. All browser projects, assertions, deadlines and the existing single retry remain enabled. An isolated checkout of `996b21a` with only this configuration change passed all 27 WebKit checks without retries (4.8 minutes), using the committed backend rather than unrelated working-tree storage changes. Hosted verification: [run 37479229067](https://github.com/Darkkeep/chimera/actions/runs/37479229067) passed all 81 checks in 12.0 minutes with one worker, no flaky results and no retries. This supports reduced CI contention as the remedy for this failure set; it does not guarantee all future runs will be free of flakes.

## Word rendered inspection

Microsoft Word 16.0 opened the export, rendered PDFs and saved/reopened ordinary paragraph and table-cell edits. Both answer-key modes were rendered. Visual inspection covered all five pages of the default document plus the answer-key assessment page: long paragraphs across pages, Latin accents and Greek, native metadata/assessment tables, image/caption, accessibility/credit details, production directions, speaker notes and explicit scene page breaks. No clipping or overlap was observed after the fix.

The first inspection exposed a media-table layout defect: a long opaque asset ID squeezed accessibility and credit text into narrow columns. The exporter now fixes the four column widths within the six-inch text area. Re-rendering confirmed readable wrapped IDs, accessibility text and credits. The existing DOCX export/content test passed. Edits to the title and scene metadata survived save/reopen in Word after the correction.

Exact evidence is retained in [the versioned qualification archive](qualification/README.md), under `docs/qualification/2026-10-06/`, with a complete SHA-256 manifest and portable verification/fixture-generation scripts:

| Artifact | SHA-256 |
| --- | --- |
| `storyboard.docx` | `c6d1b3614f270dae4ccd48c00bdb2d7aaf45b9da3bd73f010572d738ddda1f6c` |
| `storyboard-answers.docx` | `506dc1df34fd1c7d0e07db1060c3806eaeb2287b0144c2a2e0c3fbc8112fded3` |
| `storyboard-fixed.pdf` | `2cc38c82b697e94b90d5f28f38e58aab9eaa18bc048ee02463e905702173fd89` |

The source is synthetic, project `release-qualification-caf-storyboard-a86acbc0`, revision 7. `source.json`, page PNGs, the answer-key PDF and `storyboard-fixed-edited.docx` retain supporting evidence. This qualifies the representative fixture, not arbitrary document sizes or all Unicode scripts.

## Independent SCORM 1.2 LMS qualification

Prepared a fresh two-scene package with a three-second generated WAV, required-audio completion, a three-attempt single-choice assessment, score and bookmark/response persistence. Production validation and all seven archive checks passed with no warnings. These checks are preparation, not independent LMS qualification.

- Artifact: [retained SCORM 1.2 package](qualification/2026-10-06/scorm12-qualification.zip) (7,793 bytes).
- SHA-256: `b3b023f2ba9c4cb9555281e5d5e08e6baabb96c142f76650d27d58cd238d9725`.
- Source project: `scorm-1-2-release-qualification-dc8a4fb6`, revision 7.
- Supporting files: `scorm12-source.json`, `scorm12-build.json` in the same directory.
- Intended independent environment: authenticated human testing at `https://usafsam.blackboard.com`.
- Status: human verification confirmed by Erik Hart on 2026-10-06: “SCORM 1.2 export is human-verified.” The supplied package above is the artifact for this pass. LMS version, browser and individual observations were not separately supplied, so no detailed environment matrix or per-check results are invented. No browser-control tool is available in this agent session; this is human attestation, distinct from local automated evidence.

Test sequence: upload through Course Content → Add content → Create → SCORM package, enable score grading, and launch as preview learner. Verify incomplete status before required audio ends. Finish audio, advance to assessment, exit and reopen to verify location. Submit “Weather only,” exit/reopen to verify the failed attempt persists, then retry “Equipment.” Exit and confirm score 100 and passed status in LMS reporting. Record LMS version, browser, warnings and individual results. Larger-course and suspend-data-limit qualification remain separate open checks.

## Sequence and claim boundaries

With Word and representative SCORM 1.2 qualification complete, follow the [operating model](product-operating-model.md): settle installation identity/tenancy and policy, prove membership/action permissions, and establish audit retention and tracking/redaction/delivery before external-review design. The [foundation readiness audit](platform-foundation-readiness-2026-10-06.md) records the concrete implementation gaps and ordered acceptance checks. External-review design must specify fixed revisions, reviewer identity or controlled invitations, expiry, permitted actions and concurrency before links are exposed. No broader workflow or richer-media implementation is added by this qualification work.

The [onboarding migration gates](onboarding-repository-migration.md) remain open: a second maintained consumer, observed novice-author pilot, manual screen-reader review and asset redistribution rights. CI passing does not establish API stability, human usability or permission for public rollout.
