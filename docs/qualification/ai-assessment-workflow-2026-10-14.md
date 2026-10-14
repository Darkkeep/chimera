# AI and Assessment Workflow Qualification

Date: 2026-10-14. This pass finalizes the existing workspace changes for AI drafting, Question scenes, Assessment collections, Stage playback, and standalone/SCORM export.

## Repairs in this pass

- Assessment import tests now use the existing PUT endpoint. Tests verify legacy scene-type normalization and reject duplicate collection IDs, missing members, and content-scene members without advancing the revision.
- Backend and browser assertions now expect the canonical Question scene type and current question-control labels. Legacy `assessment` API input remains covered separately.
- New browser coverage uses the isolated real API to create an Assessment, select and reorder questions, save, download QTI, edit, reload, and delete it without deleting its Question scenes. Preview checks answered counts and the weighted score. Both desktop and mobile widths are exercised.
- Windows denied atomic storyboard replacement in two browser runs, including a single-worker run. Project metadata and storyboard replacements now retry only Windows access/sharing errors, up to six attempts with 300 ms total backoff, while retaining atomic replacement and the storyboard transaction lock. Fault-injection tests cover transient recovery, bounded persistent failure with intact existing data, and immediate propagation of other permission errors.
- The animation browser test now waits for successful editor closure before reading the persisted scene, eliminating an observed read-before-save race.
- The Markdown user guide documents Question scenes and Assessment collection management, QTI export, deletion behavior, revision conflicts, and backup persistence. The pre-existing untracked PDF was not regenerated or included in this pass.

## Verified results

- Full backend suite: `python -m unittest discover -s backend/tests` — 189 tests passed.
- Full Chromium browser suite: `npm run test:onboarding -- --project chromium` — 80 tests passed in the final uninterrupted run.
- Targeted browser checks across Chromium, Firefox, and WebKit — 42 tests passed. Coverage includes AI drafts with inert provider fixtures, Assessment collections, Stage question placement, all seven question types, animations, SCORM resume choice, standalone offline playback, and text fitting.
- Frontend: `npm --prefix frontend run build` passed. The existing bundle-size warning remains.
- Desktop/mobile Assessment dialog screenshots inspected; saved title, counts, edit/delete controls, and QTI download remain readable and reachable.
- Patch whitespace validation passed.
- Live backend restarted on port 8000; `/api/auth/config` returned HTTP 200. The live OpenAPI document includes Assessment management and standalone export routes.

## Qualification limits

These runs use temporary isolated projects and mocked AI provider responses. They do not qualify live-provider factual or instructional quality, complete source coverage, large-course request budgeting, generalized visual collision/contrast detection, or the new resume-choice prompt in the target LMS. Prior operator tracking attestation and actual PNutII acceptance findings remain in the separate PNutII acceptance record. No live provider request or target-LMS change was made during this pass.
