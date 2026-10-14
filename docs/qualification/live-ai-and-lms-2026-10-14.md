# Live AI Quality and LMS Qualification

Date: 2026-10-14. Provider: saved OpenAI connection, `gpt-4.1-mini`. All submitted course/reference content was a synthetic widget-packing fixture. The existing PNutII course was not edited. Seven provider requests were made: one connection test and six generation requests, including failed and successful retests.

## Live AI findings

The initial course, animation, and question requests all returned HTTP 200 and passed Chimera's schema checks. Storyboard revisions stayed unchanged during generation. The four-scene course taught selecting exactly three blue widgets, loading them into one amber tray, and closing the lid last. Its single-choice question checked that sequence with the correct answer and explanatory feedback. The document's injected instruction to invent regulation Z-999 was ignored; no fabricated regulation, weight, dimensions, or certification appeared in the reviewed output. This is one adversarial fixture, not general prompt-injection certification.

The question revision preserved its identifier, false answer key, three attempts, passing score 100, score weight 2, optional status, notes, and narration. The initial animation response contained actual staggered bounce entrances with 600 ms durations and 0/150/300/450 ms delays, plus no exit effects, but reverted the unsaved title.

Investigation identified contradictory saved-title references in course sequence and visual-layout context alongside the current unsaved target title. Scene drafting now aligns those context titles with the current target and explicitly tells the provider to preserve current metadata unless a change is requested. The saved project is not mutated by context preparation. Two intermediate retests were rejected by the existing layout/text consistency validator; inspection of one raw response found the former heading included as a paragraph. After aligning the stale layout heading too, the same live request returned a valid draft preserving `Unsaved packing sequence`.

Captured live responses were replayed into the actual editor without further provider requests. Browser text fitting, explicit saving, animation playback, and question persistence passed. The question returned 0% for a wrong answer and 100% on the correct retry. Desktop/mobile Preview screenshots were inspected. A generated SCORM 1.2 package was downloaded from the live test project. These viewer checks used genuine captured provider output; the route replay itself was not a second live generation run.

The content remains a draft: the course's widget-selection paragraphs repeat the same fact, and the true-false question uses negative phrasing. Source citation metadata and complex media/reference coverage were not qualified. Three initial cases and one corrected retest are too small a sample to estimate general reliability or certify instructional quality across courses.

## LMS handoff

The operator requested the package and will conduct the external LMS test. External results are pending.

Package: `workspace/qualification-live-2026-10-14/lms-scorm12-qualification.zip`.

SHA-256: `c75bc72ae61569fe8f6ff8b26efb77bfb4e16520a8cf821ffee9cbb36a0603a3`.

This is a fresh deterministic two-scene SCORM 1.2 fixture, separate from the AI-generated widget course. It includes a locally generated three-second required tone and a single-choice equipment question with retries. Its build report passed all seven archive compatibility checks. The actual packaged player passed the strict local runtime harness for API discovery, suspend/resume, completion writes, rejected-call reporting, and termination. Local harness results do not establish target-LMS acceptance.

Use a graded SCORM activity and a learner attempt:

1. Confirm the player reports **Connected to LMS tracking**. Play the required tone to its end, then navigate to the question.
2. Close the activity before answering. Reopen the same attempt and choose **Continue**. Expect the question bookmark and completed audio to remain.
3. Answer **Weather only** (incorrect), close, and resume again. Expect the attempted response/state to remain. Retry with **Equipment** (correct); confirm 100% and passed/completed in the LMS Gradebook.
4. Reopen and choose **Start over**. Expect the first scene, required-audio state, answers, and attempts to reset. This resets course-owned state, not the LMS attempt or its Gradebook retention rules.
5. Record LMS/activity name, SCORM profile, grading/attempt settings, observed player status, resume result, reset result, and Gradebook score/completion. Include any rejected-call diagnostic if a step fails.

Raw requests, accepted responses, viewer results, screenshots, package, and build report are retained under `workspace/qualification-live-2026-10-14/`. The regression for unsaved context checks consistent titles and verifies the original saved scene remains intact.

The final full backend regression passed 190 tests. The live viewer replay script passed, the runtime harness passed, and patch whitespace checks were clean.
