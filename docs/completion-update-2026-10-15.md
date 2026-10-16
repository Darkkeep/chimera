# Completion update 1.1.0

Implemented locally on 2026-10-15 from `a181b7336a792f1a2840fbc059d7314bf09f606a`, following the [completion plan](completion-plan-2026-10-15.md). The owner selected video, shared media, course-wide placement and OCR, and explicitly deferred hosted deployment. This record does not approve a release or replace human acceptance.

## Delivered

- Aligned root/frontend/API product version to 1.1.0 and recorded the release policy. Reconciled stale handoff/checklist claims: PR #5 is merged; PR #6 holds the preceding candidate. Its failed exact-head CI was inspected: the blocking case was WebKit standalone file navigation with offline emulation.
- Added profile-specific JSON/UTF-8 resume budgets, conservative build-report estimates, visible overflow/rejection/commit diagnostics, and protection against overwriting unreadable resume data. Bookmark and grade writes follow accepted progress persistence. Old resume JSON stays readable, and answers are never truncated.
- Added explicit media role, scene/course placement, before/after position, ordering, loop/mute settings, exclusions and scene override precedence. Required audio cannot loop. New defaults preserve legacy image/audio projects. APIs enforce project permissions, revision conflicts and valid references; archive/JSON restore validates new media contracts.
- Added an installation shared library with administrator-approved publication/withdrawal and author-controlled copying. Copies retain independent bytes, credit, captions, transcript, provenance and checksum verification. Copying duplicates preserves project metadata; copying never places an asset. Withdrawals leave project copies intact. Shared mutations receive security audit classification. Usage-aware removal retains immutable bytes for old history/review snapshots.
- Added bounded MP4/WebM upload with header validation, native keyboard-accessible playback, transcripts and timed plain WebVTT caption cues. Video production exports require captions/transcript/credit. Preview, both SCORM profiles and standalone use the same caption implementation. Learner packages include referenced media only; backups preserve unused project assets.
- Added local PDF OCR, pinned English language-data setup/checksum, capability status, bounded extraction, page locators, original checksum verification and new reference versions. OCR output is initially unavailable for grounding; inspection and explicit acceptance are required. Source versions used by old enhancement jobs remain unchanged.
- Added media transcripts/captions and placement details to Word, accepted-enhancement source citations pinned to version/locator/hash, and independent opt-in review discussion. Comments stay out of learner packages. Long opaque media IDs and transcript bodies live in the appendix so video access notes do not unnecessarily crowd SME pages; speaker notes remain editable alongside production content.
- Added complete AI request/source budgets with actionable rejection instead of silent reference truncation, optional provider-reported enhancement token usage, advisory API layout overlap/contrast/geometry findings, eight synthetic evaluation cases and an offline captured-output evaluator that leaves missing human scores pending.
- Added visual qualification/evidence upload to CI and ensured visual/auth checks can still report after a browser failure. Fixed the WebKit AI-dialog focus-return issue and qualified standalone networking without relying on WebKit's incompatible offline flag. Video fixtures use real local/static playback, including byte-range responses, rather than treating intercepted container bytes as decode evidence.

## Verification

| Check | Result and scope |
| --- | --- |
| Backend suite | 204 passed; later focused media/permission checks passed after shared-record audit/checksum changes |
| Frontend | TypeScript/Vite production build passed; approximately 546 kB entry chunk remains a non-blocking performance follow-up |
| Full original browser suite | 256 passed and 2 WebKit AI-dialog focus failures before repair; both failures subsequently passed |
| Final changed browser workflows | 54 passed across Chromium, Firefox and WebKit: AI connection, media controls, real video/caption playback in both SCORM profiles and standalone, resume choice and retries |
| OCR browser workflow | All 3 passed across Chromium, Firefox and WebKit; uninspected recognition stayed unavailable for selection until explicit acceptance |
| Visual harness | Passed Stage authoring, backgrounds, mobile/accessibility, save/reload and both SCORM players |
| Hosted-auth harness | Isolated HTTPS passed login/reset/membership/review/isolation/expiry/logout with zero Axe or JavaScript errors; no production-host claim |
| Retained evidence | Nine retained artifacts and pinned onboarding checksum/installed exports verified |
| OCR engine | Real local raster PDF recognized “Inspect equipment before operation.” at `page:1`; result remained pending author inspection |
| Word | New synthetic SME/Full artifacts rendered and edited/reopened programmatically; final proof is 4 landscape SME pages and 13 Full pages with intended portrait/landscape transitions |

This is composite regression evidence: the full original matrix was run first, then failures and materially changed paths were rerun. It is not a claim that a new complete 273-test matrix ran in one invocation. No existing user project was used as a test fixture. No real AI-provider generation request was made by this update's tests.

Word acceptance files are under ignored `workspace/completion-1.1.0/word`, including original/edited DOCX, PDFs, screenshots, hashes and `qualification.json`. Regenerate them with `python scripts/qualify-word-completion.py`. Interactive Writer editing remains pending.

The existing media screen was extracted through the **12ui-design** skill (conversion `42897e6a-949f-426a-8637-3f8c86258b39`). Its LayerDoc and completed alignment kit are under ignored `.improve/media-completion-reference` and `.improve/media-completion-frontend`. The kit reported 54.3% anchor overlap against a historical fixture. Existing repository-native logo/icons, actual media previews, theme tokens and new functional controls were retained; replacing them with extracted screenshot raster crops would replace live content or duplicate the existing brand. Desktop/mobile screenshots and scoped Axe checks exercised the added controls. Candidate collection's `design.create` scope was unavailable; permitted conversion and local alignment succeeded after 12ui sign-in. No claim is made that the added controls were generated from retrieved draft candidates.

## Gates still open

1. Review/submit the concrete candidate and obtain passing GitHub CI on its exact full SHA, then merge/tag under [release policy](release-policy.md). No release tag or merge has been made by this update.
2. Perform the [human acceptance packet](qualification/human-acceptance-1.1.0.md): interactive Word editing, new-package target-LMS acceptance, novice-author and screen-reader checks, and broader instructional quality ratings. Existing October 14 LMS acceptance remains valid only for its recorded replacement ZIP.
3. Hosted deployment and Encarta integration are deferred by user instruction. No server templates were installed, no external event collector enabled, and no identity contract guessed.
4. Keep upstream onboarding maintained-consumer/public-rights checks and the 2027-01-04 image-attribution policy decision explicit. MFA, automated email, guest review, tenancy expansion, distributed workers, Word reimport and generated video remain separate scope.

Imported video codec support is browser/platform dependent; container validation is not codec certification. Plain timed captions are supported; WebVTT positioning/regions/styles are not interpreted. OCR's elapsed check occurs between synchronous page operations, not as a hard engine timeout. API layout warnings are advisory geometry/flat-background checks, not browser text fitting or comprehensive WCAG certification. Installation recovery must include shared-library/identity/configuration data separately from project archives. The illustrated PDF guide predates these supplemental workflows; the updated Markdown guide links their current instructions.
