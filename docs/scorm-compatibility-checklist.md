# SCORM Compatibility Checklist

## PNutII Tracking Requalification: 2026-10-14

- Subsequent operator retest: "It all worked," with a request to offer Continue or Start over instead of automatic resume. This records successful resume/score/completion by operator attestation for the retested package; its exact hash and profile were not supplied. The earlier failed attempt below remains historical.
- Returning SCORM learners now see an accessible Continue/Start over choice before course progress is written. Continue preserves the saved state; Start over resets course-owned bookmark, visited scenes, audio completions, assessment responses/attempts, and remediation. This is not a new LMS attempt and cannot override Gradebook retention, review mode, or attempt policies. Both choices passed browser tests for both profiles in Chromium, Firefox, and WebKit; the new prompt still needs target-LMS confirmation.
- Operator reports no resume and no score/completion in Gradebook. External acceptance is failed/open for this package; historical passes below do not supersede this result.
- Use SCORM 1.2 for the previously identified target deployment, which does not accept SCORM 2004. Actual profile used in this failed attempt remains unconfirmed.
- Tracking fixes: bounded parent/opener API discovery with cross-origin guards, checked initialization and false return values, explicit suspend exit, valid 1.2 session-time values, and once-only finalization on pagehide/beforeunload.
- The runtime reports Connected to LMS tracking only after successful initialization. A rejected-call diagnostic means tracking or grading may not have persisted. No-API preview mode is not a successful LMS connection.
- Automated tests cover popup discovery, second-session bookmark/visited restoration, status writes, rejection reporting, and finalization. Target-LMS learner launch, Gradebook score/completion, and resume must be retested with a new package.

## Human SCORM 1.2 qualification: 2026-10-06

Erik Hart confirmed: “SCORM 1.2 export is human-verified,” following delivery of the two-scene qualification ZIP for the authenticated USAFSAM Blackboard session. The supplied package has SHA-256 `b3b023f2ba9c4cb9555281e5d5e08e6baabb96c142f76650d27d58cd238d9725`; its production build and seven archive checks passed without warnings. See the [dated qualification record](release-qualification-2026-10-06.md) for artifact paths, source revision and test sequence.

This closes the representative independent-LMS gate by human attestation. LMS version, browser and per-step results were not separately supplied. Earlier dated records below remain historical; larger-course, suspend-data-limit and broader LMS/browser matrix qualification remain open.

Use this checklist for every release candidate package. Automated checks are recorded in the profile-specific build report alongside each release ZIP.

## Automated

- [x] `imsmanifest.xml` exists at the ZIP root and parses as XML.
- [x] The manifest contains exactly one SCO launch resource.
- [x] `index.html`, `player.js`, and `storyboard.json` are packaged.
- [x] All manifest-referenced local files exist inside the ZIP and use safe relative paths.
- [x] No manifest resource points to an external URL.
- [x] SCORM 2004 packages use `API_1484_11` and `cmi.*` fields.
- [x] SCORM 1.2 packages use `API` and `cmi.core.*` fields.
- [x] Package size is reported against the configured warning threshold.
- [x] Missing storyboard assets block production packaging.
- [x] Generated runtime JavaScript passes Node.js syntax validation when Node.js is installed.

Archive checks are included in each build report's `compatibilityChecks`. Run the backend flow suite to verify both profiles and the negative missing-reference case. Node.js syntax validation is skipped when Node.js is unavailable.

## Browser Smoke Test

Run the packaged `index.html` through a local HTTP server or SCORM test harness. Opening it directly from `file://` is not a valid media or LMS test.

- [x] Course launch renders the title and first scene.
- [x] Previous/next navigation works without page reload.
- [x] Package-relative images load; a package-relative audio fixture plays.
- [x] Missing media displays a learner-visible diagnostic.
- [x] Without an LMS API, the player displays preview-mode tracking status.
- [x] With fake SCORM 2004 and SCORM 1.2 APIs, initialization and termination complete.
- [x] Required scenes and required audio gate completion.
- [x] Assessments report correct and incorrect outcomes.
- [x] Weighted score and passing threshold map to LMS status.
- [x] Relaunching resumes the scene and assessment state.

### Local Browser Qualification: 2026-09-29

- Profiles: SCORM 2004 4th Edition and SCORM 1.2, served over HTTP from staged copies of the release archives.
- Both players rendered `TestFrame`, advanced to scene 2 and back, loaded the package-relative image, showed preview-mode status without an LMS, and displayed the missing-media diagnostic when the image request was deliberately blocked.
- Fake LMS sessions confirmed scene location persistence across reload, suspend-data restoration of assessment responses, and profile-specific termination (`Terminate` / `LMSFinish`).
- A disposable one-scene browser fixture injected a single-choice question and a one-second WAV file; the fixture is not part of either release ZIP. Incorrect and correct answers showed 0% and 100%. Completion remained incomplete until the required audio ended, then reported completed/passed and score 100 for SCORM 2004 and passed/score 100 for SCORM 1.2.

## Blackboard Verification

These checks require access to a Blackboard Learn test course and cannot be certified by local automated tests.

- [x] Upload accepts the package without manifest errors.
- [x] SCO launches in the target supported browser matrix.
- [x] Completion and success status appear in the gradebook/reporting view.
- [x] Score, bookmark, and resume survive a new learner session.
- [x] Audio playback works under Blackboard content security policy.
- [x] Package-relative media is not blocked by browser mixed-content rules.
- [x] Known LMS/browser behavior is recorded in the build report and release notes.

### Blackboard Attempt: 2026-09-29

- Environment: Blackboard Learn `4000.21.0-rel.33+e2d29c3`, `Hart's Ultra Sandbox`, instructor/ISD upload flow.
- Package: `workspace/blackboard-scorm2004-release-4000.21.0.zip`.
- Result: upload remained at `0%`.
- Blackboard console error: `TypeError: n.file.$url is not a function` from the Ultra upload client.
- Interpretation: the instructor/ISD upload path hit an upload-client/environment blocker; manifest acceptance and SCO launch were not reached through that path.

### Blackboard SCORM Item Workflow: 2026-09-29

- Course: `Hart's Ultra Sandbox` (`_2627_1`), Blackboard `4000.21.0-rel.33+e2d29c3`.
- Workflow: Course Content -> Add content -> Create -> SCORM package.
- Result: package uploaded successfully and a `TestFrame` SCORM item was created.
- Blackboard displayed: "Some issues were found with this course which may affect playability."
- Blackboard settings page exposed grading modes for `Score`, `Completion`, and `Satisfaction`; the item was saved with the default score configuration.
- Result: `Erik Hart_PreviewUser` testing confirmed launch, media playback, completion, score, bookmark/resume, and gradebook behavior.
- Reconciliation: the Course Content SCORM workflow succeeded despite the separate instructor/ISD upload-client failure above.
- Blackboard verification applies to the SCORM 2004 package used in that workflow; the newly generated SCORM 1.2 package has not been uploaded to Blackboard.

## Phase 8 Release Artifacts: 2026-09-29

- SCORM 2004 ZIP: `workspace/blackboard-scorm2004-release-4000.21.0.zip` (2,597,865 bytes); SHA-256 `4120af318596c6029b69da8458b4a8ee50b5d310bdb1670b9bf9b3ee882f0ccf`.
- SCORM 2004 build report: `workspace/blackboard-scorm2004-release-4000.21.0-build.json`.
- SCORM 1.2 ZIP: `workspace/blackboard-scorm12-release-4000.21.0.zip` (2,597,858 bytes); SHA-256 `355642cddae0ac20a3c349e4894ce516c9f140d5a400b6b52b62de2f0e435ef5`.
- SCORM 1.2 build report: `workspace/blackboard-scorm12-release-4000.21.0-build.json`.
- Both archives passed all seven archive qualification checks. Both build reports are `passed-with-warnings`: add alt text or mark `UncySam2.png` decorative, and add a question to the empty assessment scene before treating this storyboard as content-ready.

## Local Verification Record

Recorded 2026-09-29 against generated packages served from `http://127.0.0.1:8765/`:

- [x] SCORM 2004 package launched over HTTP without an LMS and displayed the preview-mode diagnostic.
- [x] SCORM 2004 package advanced from scene 1 to scene 2 and rendered package-relative content.
- [x] SCORM 2004 fake `API_1484_11` session initialized and issued location, suspend-data, status, score, and commit calls.
- [x] SCORM 1.2 package launched over HTTP without an LMS and displayed the preview-mode diagnostic.
- [x] SCORM 1.2 fake `API` session issued `LMSInitialize`, `LMSGetValue`, `LMSSetValue`, and legacy `cmi.core.*` calls.
- [x] Assessment and required-audio browser paths passed with a disposable fixture: correct answer reported 100%, audio `ended` completed the gate, and SCORM 2004 received completed/passed/score/suspend-data updates.
- [x] Blackboard Learn upload and gradebook/resume behavior were confirmed in the Blackboard SCORM item workflow above.

### Single-User Deployment Pass: 2026-09-30

- [x] Fresh SCORM requests enforced production attribution validation; the representative `TestFrame` project was blocked with a clear `422` response until `UncySam2.png` attribution is completed.
- [x] Previously recorded SCORM 1.2 and 2004 release archives still pass manifest completeness and profile runtime-token checks.
- [ ] No new Blackboard SCORM 1.2 LMS session was available during this pass; external qualification remains open.

**Policy update: 2026-10-08.** The `422` result above records the policy at the time of that pass. Incomplete image attribution is now an **Attribution Pending** production warning included in the build report, so SCORM export may proceed; incomplete audio attribution and missing media files remain blockers. Reassess the temporary image exception after 2027-01-01.

### TestFrame requalification: 2026-10-06

- Live production validation passed with no issues before and after export. Both fresh packages represent `testframe-565c5da8`, revision 8, with 28 required scenes and one image asset.
- SCORM 1.2: `workspace/scorm-qualification-current/scorm12.zip`, 2,594,440 bytes; SHA-256 `26c7df5d8d1745084fe9e3e92e805e28071af5220b6595561c37db83b6f6db57`.
- SCORM 2004: `workspace/scorm-qualification-current/scorm2004.zip`, 2,594,449 bytes; SHA-256 `ebd2df773d76e898b8bc910060eeed57b6d900677f52980a14a3bdd82c63e840`.
- Both build reports returned `passed`, no warnings, and all seven archive compatibility checks passed.
- Both packaged players were served over local HTTP and tested in headless Chromium: launch without an LMS, preview diagnostic, package-relative image loading, navigation, bookmark restoration, incorrect answer (0%), correct retry (100%), assessment state restoration, completion/pass status, score, and LMS termination passed. No browser JavaScript errors were observed. Suspend data was 531 UTF-8 bytes in each profile.
- All 52 backend storyboard flow tests passed, including profile exports, invalid-production rejection, missing manifest targets, runtime syntax validation, revision changes during assembly, and completion behavior.
- Browser evidence, screenshots, package copies, reports, and the local harness are retained in `workspace/scorm-qualification-current`. Run `node workspace/scorm-qualification-current/qualify.cjs` to repeat the retained-package browser pass.
- Scope: the browser harness uses permissive fake LMS APIs. It does not validate every SCORM data-model constraint or certify Blackboard behavior. TestFrame contains no audio asset; actual audio playback was not exercised in this pass. Larger-course qualification and independent SCORM 1.2 Blackboard qualification remain open.

### User LMS result: 2026-10-06

- The user reported that the supplied TestFrame SCORM 1.2 package passes their LMS testing. This closes the target-LMS gate for that package based on user confirmation.
- The user reported that their LMS does not accept SCORM 2004. That profile is unsupported for this deployment and is excluded from its acceptance requirements.
- LMS name/version, browser, and individual test outcomes were not supplied; this record does not infer those details or extend the result to audio fixtures, larger courses, or other LMS deployments.
