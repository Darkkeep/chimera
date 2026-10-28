# Human acceptance packet — candidate 1.1.0

Status: pending operator/reviewer evidence. Hosted deployment is deferred for this update. This packet specifies concrete checks; no item is approved by its existence.

Updated 2026-10-28 for timeline/appearance and supported creator-pilot readiness. Use [pre-alpha readiness](../pre-alpha-readiness.md) to select scope and distinguish pre-distribution checks from observations collected during the pilot. Existing observations remain tied to their recorded candidate and artifacts.

Use the [interactive HTML checklist](human-acceptance-1.1.0.html) to record the remaining observations, reviewer/date and artifact evidence. It saves locally in the browser and downloads an evidence JSON; it does not automatically update this record or approve a release.

| Gate | Owner | Evidence to record | Acceptance |
| --- | --- | --- | --- |
| Word editing | Course author/operator | Source revision, template, SME/Full DOCX hashes, application version, before/after screenshots | Open both formats; edit a paragraph/table; save/reopen; inspect orientation, page order, captions/transcripts/citations and independently selected discussion/answer keys |
| Target LMS | LMS operator | Exact new ZIP/hash, LMS/activity/profile, grading settings, observed result | Required audio, question retry, Continue, Start over, score/completion and video/captions work; no rejected saves; qualify any large-course warning against the target |
| Novice pilot | Product owner plus novice author | Task observations, errors, assistance required | Create/import, place media, inspect OCR, review AI, resolve feedback, validate/export/restore without unexplained loss or hidden API steps |
| Screen reader | Accessibility reviewer | Browser/reader/version, keyboard path and announcements | Dialog focus/escape, library controls, captions/transcripts, stage/assessment names and review controls are understandable and operable |
| AI quality | Instructional reviewer | Captured synthetic outputs, named rubric ratings and critical errors | All cases in `ai-evaluation-cases.json` pass contract checks and every rubric dimension reaches 2 with no critical errors |
| Onboarding distribution | Upstream package maintainer | Second maintained consumer, observed pilot, asset/license review | No API-stability/public-rights claim without this evidence; the package is already extracted and privately usable |
| Timeline and appearance | Author plus accessibility/LMS reviewer as applicable | Candidate SHA, project/archive and export hashes, browser/media details, task observations | Shapes/alpha/effects/groups survive reopen; timed/trimmed media stays synchronized; seeking earns no required coverage; resume/captions/reduced motion work; Word snapshot time matches |
| Clean install and recovery | Engineering plus operator | Package manifest/hash, clean environment, commands, archive and restored-project comparison | Document the root Node/Chromium prerequisite; install/launch from supplied instructions; export both Word formats; restore complete timeline/media/assessment content into a compatible clean workspace |

Run `python scripts/evaluate-ai.py responses.json --report workspace/ai-evaluation/report.json` against captured outputs. Missing cases and missing reviewer scores remain pending; the script never contacts a provider. Existing October 14 live-AI and LMS attestations retain their original scope and hashes.

The attribution exception is scheduled for owner review on 2027-01-04. Keep Attribution Pending labels/warnings until a policy change is selected and tested. No scheduler was created by this update.
