# PNutII Acceptance Pass

Date: 2026-10-14. Project: `pnutii-9ce7c7f7`. The operator approved using the open course directly as a throw-away lesson. No live AI requests were made during this pass.

## Findings and Repairs

Revision 13 passed production validation and exported consistently, but two generated paragraph boxes in scene 3 clipped their text: browser measurements required 67 px inside 60 px boxes. This demonstrated that schema validity alone did not guarantee usable visual content. Q1 was an unrelated placeholder rather than a check of the stated lesson objective.

The editor now measures text with the browser's font metrics. AI scene drafts receive a fit pass before review; existing scenes have an explicit, undoable Fit text command. The repair grows unlocked, unrotated text boxes downward into available space, then reduces font size if necessary, stopping at 18 px or the original size when smaller. It preserves text, origins, and animation settings. Locked or unresolved overflow is reported; editor saving of enabled visual layouts is blocked until corrected. Direct API writes do not perform browser measurement.

Using the actual editor, scene 3's paragraphs were expanded to 69 px each, leaving title geometry, text, and animation data intact. The saved course became revision 14. Q1 was then revised through the question editor, producing revision 15:

> After spreading peanut butter on one slice and jelly on the other, how should you combine the bread slices?

The correct answer places the spreads facing each other and presses gently. The distractor puts the spreads facing outward. Feedback now explains the correct assembly step. The existing single-choice type, question identifier, two attempts, passing threshold, and scoring weight were retained. One question checks this assembly step; it does not establish mastery of the entire preparation task.

## Verification

- Actual revision-15 Preview: title and both scene-3 paragraphs fit with no horizontal or vertical overflow. Heights were 80, 69, and 69 px.
- Actual Preview assessment: wrong answer returned 0%, retry returned 100%, correct explanatory feedback appeared, and the course reported passed. Learner progress changes are browser-local.
- All three exports were built at revision 15 and contained identical published storyboard data. SCORM 2004 and standalone player JavaScript was byte-identical.
- Actual extracted standalone course: DOM measurements found no clipping in scene 3. The revised question appeared once inside the Stage, with no question below it. Form-handler checks returned 0% then 100% on the second attempt. The integrated browser stalled waiting for physical-click stability in the background local-file tab, so these actual-artifact checks used DOM handlers rather than claiming a successful physical-click pass.
- Automated ordinary browser interactions: nine final text-fit and standalone tests passed across Chromium, Firefox, and WebKit. Tests cover font-aware fitting, unchanged content and animation fields, locked/crowded content, draft-only repair, save blocking, and offline package interaction.
- Eight targeted Chromium authoring checks also passed for AI drafts, assessment placement, animations, and fitting. Final frontend build passed, with the existing bundle-size warning.

## Artifacts

Packages and the extracted standalone directory are under `workspace/projects/pnutii-9ce7c7f7/output/acceptance-r15/`. Earlier output and the operator's Desktop export were not overwritten.

| Package | SHA-256 |
| --- | --- |
| `pnutii-scorm-2004.zip` | `7a11e6f93b7f309ff25c8a1ac167043c97a8f43e5ca17e30b9bf81a4a1b53853` |
| `pnutii-scorm-12.zip` | `0177694efa43c8ff6206043c2803aaea4ec961e64f1dcefbd5ee311f3c1b3c0c` |
| `pnutii-standalone.zip` | `336a5f90a412469fedc9d2b7f6bdbafe8d3e9588f3146998d340c17ecdcea9b1` |

## Remaining Limits

Update following the tracking repairs: the operator reported "It all worked," confirming the retested tracking flow by attestation, and requested a resume choice. Exact retested package hash/profile was not supplied. The player now prompts returning learners to Continue or Start over; six browser tests cover both choices in both profiles across Chromium, Firefox, and WebKit. The new prompt itself has not yet received external LMS confirmation. Historical failed results and superseded artifact hashes below are retained for traceability.

The operator subsequently reported no resume and no score/completion in Gradebook for the exported package. The profile, launch topology, and runtime status message were not supplied; this is a failed external acceptance result, not a confirmed cause. Earlier deployment notes explicitly say the target LMS does not accept SCORM 2004 and previously accepted SCORM 1.2. Recommending 2004 for this deployment was incorrect; retesting must use 1.2 unless the operator confirms a different LMS.

Runtime inspection found parent-only API discovery (missing popup opener discovery), no explicit suspend exit, unchecked false LMS return values, and SCORM 2004 session-time formatting also used by the 1.2 player. Fixes add bounded, cycle-safe parent/opener discovery with cross-origin guards, explicit profile-correct suspend exit, initialization and rejected-call diagnostics, valid 1.2 session-time formatting, and once-only session finalization. Strict generated-player tests verify both profiles across two sessions, including bookmark/visited-state restoration. These fixes do not certify the external LMS outcome. The previously hashed artifacts above predate these tracking fixes and must not be used to verify them.

Retest a newly exported SCORM 1.2 ZIP as a SCORM activity with grading enabled, using a learner attempt. Confirm the player says Connected to LMS tracking, visit a subset of scenes, close and resume the same attempt, then finish all required scenes and the assessment. Capture any rejected-call or initialization diagnostic and the LMS grading configuration if results remain absent. An LMS preview, standalone package, or ordinary uploaded ZIP is not equivalent to a tracked learner SCORM attempt.

The lesson has no image/audio attachments or uploaded grounding documents, so this actual-course pass does not qualify media attribution, audio completion, or reference-grounded factual accuracy. Existing automated fixtures cover media playback separately.

Text fitting is not general collision detection, contrast validation, animation-boundary analysis, or cross-device font certification. Exports preserve authored dimensions and may render differently when fonts differ. Existing overlaps, rotated geometry, and the default assessment region still require visual inspection. For this revision the two repaired paragraphs had sufficient clear space and did not require a font reduction.