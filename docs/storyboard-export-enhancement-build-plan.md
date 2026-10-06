# Chimera storyboard, export, and enhancement build plan

Status: Release qualification in progress; the integrated authoring, enhancement, review, and backup flows are implemented, with external qualification and selected media gaps remaining. Team-platform direction is defined in [Product Operating Model](product-operating-model.md) before further breadth expansion.

Prepared: 2026-09-30

## Objective

Make a saved Chimera storyboard the common source for three user actions:

1. Export a playable SCORM course.
2. Export an editable Word storyboard.
3. Submit selected scenes or the whole storyboard for AI enhancement, with explicit author approval of every suggested change.

Connect these actions to imported reference resources, imported and generated media, and comments made during storyboard playback.

## Current implementation baseline

The source review found:

| Capability | Existing foundation | Remaining work |
| --- | --- | --- |
| SCORM | SCORM 2004 and 1.2 builders, validation, build reports, runtime tracking, publication filtering, and local browser qualification for both profiles | Independent LMS qualification for SCORM 1.2; larger-course and suspend-data qualification remain open |
| Word | Pinned `python-docx` exporter, DOCX download endpoint, editable scene sections, media/accessibility details, assessments, opt-in answer keys, and source revision; representative output rendered and edited in Word 16.0 on 2026-10-06 | Narration transcripts, source-resource citations, and review comments remain unmodeled; see [qualification evidence](release-qualification-2026-10-06.md) |
| Enhancement | Revision-bound proposals, grouped approval, edit-before-accept, audit history, reversal, stale/superseded handling, provider jobs, grounding references, cancellation, retry, and restart recovery | Provider-specific usage reporting, OCR, deployment authentication, and distributed queue hardening |
| Media | Project image/audio upload, scene attachment, accessibility metadata, attribution, generated candidates, and explicit approval | Structured placement, shared library, course-wide usage, video, and richer generation settings |
| Playback review | Learner preview, assessment playback, persistent comments, replies, resolution, outdated context, and comment-linked enhancement | External reviewer hosting, authentication, permissions, and link expiry |
| Reference resources | Versioned PDF, DOCX, PPTX, TXT, and Markdown upload with extraction, inspection, version pinning, scene/course association, and grounded enhancement selection | OCR for scanned sources and broader authoring-resource workflows |
| Backup | Versioned portable archive with storyboard, binaries, references, proposals, comments, history, manifest, and integrity checks | None for the current local restore scope; cross-deployment restore remains future work |

Relevant source files:

- `backend/app/models.py`: storyboard, scene, asset, and proposal models.
- `backend/app/storage.py`: persistence, scene changes, history, and proposal decisions.
- `backend/app/main.py`: API routes and uploads.
- `backend/app/scorm.py`: package generation and standalone player.
- `backend/app/validation.py`: authoring and production validation.
- `frontend/src/App.tsx`: workspace and export integration.
- `frontend/src/CoursePreview.tsx`: in-app playback.
- `frontend/src/EnhancementReviewView.tsx`: existing proposal review.
- `backend/tests/test_storyboard_flow.py`: existing flow coverage.
- `docs/scorm-compatibility-checklist.md`: recorded package qualification.

The preview omits speaker notes and action descriptions, and SCORM now follows that boundary in both visible rendering and the packaged storyboard. SCORM displays packaged imported slide renders and exposes their extracted text as a transcript; plain-text scenes continue to render extracted text directly. Course completion now also matches Preview for courses with only optional scenes. Storyboard revisions default to 1 for legacy files and increment on save, and builds record their source revision. Authoring UI mutations send `If-Match`; stale writes fail with HTTP 412, and upload routes reject stale requests before expensive work. The header remains optional for legacy API clients, while proposal decisions require it. Storyboard transactions and revision-checked writes use a filesystem lock shared across worker processes in the same workspace. README and guided workflow capability descriptions have been corrected.

The compatibility record documents Blackboard verification for one SCORM 2004 package, not equivalent Blackboard verification for SCORM 1.2. A repeatable backend fixture now exports imported and native scenes, image/audio, an optional assessment, and authoring notes through both SCORM profiles; the test asserts profile snapshots match. The frontend production build passes. A fresh React-preview/browser comparison remains to be recorded.

The first editable Word export is available at `GET /api/projects/{project_id}/storyboard.docx` and in the Export dialog. It records the source revision, uses native Word headings/paragraphs/tables, embeds available attached images and slide previews, labels authoring directions and speaker notes, and excludes answer keys unless explicitly requested. Narration transcripts, reference-resource citations, and review comments are not yet modeled in the Word contract, so the exporter does not claim to include them. Automated structure/content checks pass; a manual rendered inspection in Word remains outstanding because LibreOffice/Word is not installed in the current verification environment.

## Product rules and scope

- Direct export remains available without running AI enhancement.
- AI output remains a proposal until the author explicitly approves the exact change.
- Generation approval and placement approval are explicit. Generating an asset does not silently attach it to a scene.
- Pending and rejected proposals never enter published learner content.
- Preview, review, and export identify the storyboard revision they represent.
- Learner content, narration, production directions, and reviewer discussion have separate publication rules.
- “Global media” covers both reusable assets across projects and deliberate course-wide placement. Library membership alone does not imply course-wide display.
- Reference resources guide enhancement; they become learner downloads only when explicitly designated for publication.
- The initial Word capability is editable export. Word reimport and bidirectional synchronization are separate future work.
- Initial commenting is inside Chimera. External review links require a later hosting and access-control milestone.
- Initial AI media generation covers images and narration. Generated video is a later extension; externally created video is included in media management.
- Chimera is a team platform for authors, reviewers, instructional designers, and administrators; learners are output consumers rather than platform accounts.
- Team mode uses centralized identity, authorization, audit, and product tracking. Restricted single-user mode remains supported as a policy-controlled deployment mode.
- Identity, project membership, permission enforcement, and event classification precede deeper media and enhancement expansion.
- The local identity provider and first My Work management surface are implemented; external OIDC/SAML authentication remains an adapter decision for the team pilot.

## Delivery sequence

Implement the numbered steps in order. Each step should be a reviewable change with its acceptance checks completed before dependent work begins.

### Phase 1 — Establish a reliable publishing foundation

#### Step 1. Record baseline behavior and reconcile capability descriptions

- Run the existing backend flow suite and frontend build using the repository environment.
- Create a repeatable representative course fixture containing imported and native scenes, image/audio, assessments, optional scenes, and production notes.
- Record preview/export differences, current validation behavior, and known LMS limitations.
- Update README, backend README, and Golden Path copy to reflect implemented SCORM support and its verified limits.

Acceptance:

- Baseline failures are recorded separately from changes introduced by this plan.
- Documentation distinguishes implemented capabilities from verified compatibility.

#### Step 2. Define and migrate the storyboard publication model

- Add explicit revision identity and schema migration for existing projects.
- Specify learner text, narration, production directions, notes, and reference links. Preserve original imported values during migration.
- Define which fields appear in learner playback, Word, and review-only views.
- Retain stable scene IDs through edits and reordering.
- Define structured media placement and course-level media references for later phases.
- Make saves and multi-record changes consistent, with expected-revision checks and recoverable persistence.

Acceptance:

- Existing projects load without data loss.
- Production directions and reviewer-only information do not leak into learner output.
- Conflicting saves cannot silently overwrite newer revisions.

#### Step 3. Align preview and exported playback

- Establish shared rendering and assessment behavior between the React preview and packaged player; prefer a reusable player implementation where feasible.
- Define fidelity, hybrid, native, and template layout behavior, including how edited text relates to imported slide images.
- Apply the same media order, accessibility descriptions, navigation, scoring, and completion rules in preview and SCORM.
- Report unsupported layout or animation behavior before export; preserved PowerPoint XML must not imply supported playback.
- Build from an immutable revision snapshot and record that revision in the build report.

Acceptance:

- The representative course renders equivalent intended content in preview and both SCORM profiles.
- Assessment results, required audio, completion, and resume behavior match expected outcomes.
- Editing a project during a build cannot create a package containing mixed revisions.

### Phase 2 — Deliver simple SCORM and Word exports

#### Step 4. Consolidate export actions and validation

- Present direct SCORM and editable Word actions for the active saved storyboard.
- Offer SCORM 2004 and 1.2 profiles with clear build status and downloadable reports.
- Separate blocking errors from warnings, with navigation to affected scenes or assets.
- Identify the exported revision and prevent duplicate submissions while a build is running.
- Keep JSON transfer available with an accurate explanation of its limitations.

Acceptance:

- A user can export without entering the enhancement workflow.
- Failed validation explains what to fix and preserves the current project.

#### Step 5. Implement editable Word storyboard export

- [x] Add a backend DOCX export service and endpoint using the pinned `python-docx` dependency.
 - [x] Produce a cover/summary and ordered scene sections using native Word headings, paragraphs, and tables.
 - [x] Include scene IDs, titles, learner text, production directions, notes, media references/previews, accessibility text, assessments, and feedback. Narration transcripts and source-resource citations are not modeled yet.
 - [x] Represent interactions as editable specifications and audio as descriptive references; transcripts are not modeled yet.
 - [x] Use embedded images as illustrations while retaining accompanying text as editable document content.
 - [x] Offer explicit answer-key inclusion and label authoring material clearly. Review comments are deferred until comment records exist.
 - [x] Record the source revision in the document.

Acceptance:

- [x] Text and tables are native editable Word content, not reconstructed screenshots.
- [x] Scene order and substantive content match the selected revision in automated checks.
- [x] Long scenes, Unicode, tables, images, and page breaks remain readable in a representative rendered inspection in Word 16.0; see [qualification evidence](release-qualification-2026-10-06.md).
- [x] Automated document checks verify required sections and content; Word paragraph/table edits survived save and reopen on 2026-10-06.

Milestone A: trustworthy direct SCORM and editable Word export.

### Phase 3 — Add reference resources and complete media handling

#### Step 6. Implement Study Guide and supporting resource ingestion

- Add resource records, upload endpoints, storage, and a project resource view.
- Accept PDF, DOCX, PPTX, and text; retain originals and record extraction status, file hash, and version.
- Extract text with page, slide, or section locators. Flag scanned or unreadable content and offer OCR as an explicit follow-up capability.
- Let authors classify resources, mark authoritative guidance, and associate them with the whole course or selected scenes.
- Show extracted content for inspection before it is used for enhancement.
- Keep resource instructions as reference content rather than executable instructions to an AI service.

Acceptance:

- An imported Study Guide can be inspected and assigned to selected scenes.
- Extraction failures are visible and do not silently produce apparently grounded suggestions.
- Resource updates preserve the versions referenced by earlier proposals.

#### Step 7. Extend imported media and placement

- Extend the media model and upload validation to supported video, captions, and transcripts.
- Add scene placement controls for role, order, layout position, and playback settings.
- Add course-wide media use with explicit scene overrides and predictable precedence.
- Provide a shared library across projects; copy or pin assets into a project to prevent silent external changes.
- Track usage so replacement or deletion identifies affected scenes.
- Carry attribution, origin, alt text, captions, and transcript metadata through preview and export.
- Publish only referenced assets and explicitly selected learner resources; retain unused material in project backups.

Acceptance:

- Users can upload externally created media directly for a scene or add it to project/shared libraries.
- Course-wide assets and scene overrides render consistently in preview and SCORM.
- Replacing a shared asset does not unexpectedly modify existing courses.
- Missing media and unsupported formats are reported before publication.

### Phase 4 — Expand author-controlled AI enhancement

#### Step 8. Generalize proposals and approval transactions

- [x] Expand proposals beyond `actionDescription` to learner content, narration, assessments, media placement, and scene structure.
- [x] Store source revision, affected IDs, before/after values, rationale, provider/model, and reference citations.
- [x] Support accept, reject, edit-before-accept, stale, and superseded states with a decision audit trail.
- [x] Treat related changes as an explicit dependency group, showing every included change before acceptance.
- [x] Apply each accepted proposal atomically and preserve a recoverable prior revision.
- [x] Prevent concurrent decisions and retries from applying changes twice.
- [x] Support reversal without silently overwriting later author edits.

Acceptance:

- [x] Creating, rejecting, or failing a proposal leaves the active storyboard unchanged.
- [x] Acceptance applies only the displayed change against the expected revision.
- [x] Conflicts and dependent changes are understandable and recoverable.

#### Step 9. Add AI enhancement submission and background jobs

- [x] Let authors choose selected scenes or the whole course, enhancement goals, and permitted reference resources.
- [x] Introduce a provider adapter and server-side configuration; keep credentials out of frontend code and exports.
- [x] Show what content will be submitted and provide approximate input usage/cost when configured.
- [x] Add durable job states, progress, cancellation, retry, and restart recovery.
- [x] Request structured proposals and validate their fields, scene references, and supporting source locators.
- [x] Display source excerpts and distinguish source-backed suggestions from ungrounded creative proposals.
- [x] Surface cited contradictory resource passages instead of silently selecting one.

Acceptance:

- [x] A resource-guided enhancement run produces individually reviewable proposals.
- [x] Cancelled, failed, or retried jobs cannot mutate approved content or duplicate applied changes.
- [x] Users can trace a factual suggestion to the exact imported resource version and passage.

The provider adapter uses an OpenAI-compatible chat-completions API configured only on the server. The job runner uses durable filesystem records and restart recovery with in-process daemon workers; estimated cost is input-only and approximate. OCR, provider-specific actual usage, deployment authentication, and a dedicated distributed queue remain outside this step.

#### Step 10. Add AI media generation and placement proposals

- Add image and narration generation adapters using the same durable job framework.
- Let users specify scene purpose, style, dimensions, narration script, and voice settings as appropriate.
- Save generated candidates separately from approved storyboard attachments.
- Record prompts, provider/model, creation metadata, usage/cost when available, and asset provenance.
- Preview candidates in their proposed scene position, with editable alt text, captions, or transcript.
- Require explicit approval of the asset and placement before applying the change.
- Support reject, regenerate, and user-supplied replacement without deleting approved alternatives.

Acceptance:

- Generation alone changes neither the active scene nor its export.
- An approved placement renders identically in preview and SCORM and is documented in Word.
- Provider failure and regeneration preserve existing approved media.

Milestone B: resource-guided AI enhancement and media generation with individual author control.

### Phase 5 — Make playable storyboards commentable

#### Step 11. Add persistent review threads to playback

- [x] Add comments with stable scene ID, revision, author label, creation time, and optional asset/time anchor.
- [x] Support replies, resolve/reopen, and filters for unresolved or outdated threads.
- [x] Preserve original review context when scenes change; reordering must not detach threads.
- [x] Define deleted-scene handling so comments remain recoverable in review history.
- [x] Allow a comment to initiate an enhancement request while retaining a link to the originating discussion.
- [x] Keep reviewer comments out of learner exports unless explicitly selected for an authoring document.

Acceptance:

- [x] A reviewer can play, comment, reload, reply, and resolve feedback.
- [x] Scene reordering preserves comment associations, and later edits identify potentially outdated feedback.
- [x] Comment-driven enhancement still requires explicit proposal approval.

#### Step 12. Define the optional external review milestone

- Specify hosting, reviewer authentication or controlled invitations, permissions, and link expiry before adding shareable review links.
- Serve a fixed review revision and preserve comments against that revision.
- Add concurrency handling for multiple reviewers.

Acceptance:

- External reviewers can access only the intended review material and permitted actions.
- Shared review never grants implicit editing or publication rights.

This step is a separate deployment decision; it is not required for the first in-app commenting release.

### Phase 6 — Connect, preserve, and qualify the complete workflow

#### Step 13. Connect the authoring journey

- [x] Connect author/import, resources/media, optional enhancement, proposal review, playable review, validation, and export.
- [x] Show pending proposals, unresolved comments, missing media, and publication blockers in project readiness.
- [x] Keep advisory review status separate from true publication errors; pending optional suggestions do not force AI use before export.
- [x] Link review actions to the relevant scene, proposal, or comment.
- [x] Ensure each export represents the author's current saved content, including explicitly accepted enhancements.

Acceptance:

- [x] A user can complete the whole journey without manual JSON changes or hidden API calls.
- [x] The exported revision and excluded pending work are clear.

#### Step 14. Add complete project backup and restore

- [x] Create a versioned archive containing the storyboard, required media, reference originals, templates, proposals, comments, and selected history.
- [x] Include a manifest and integrity hashes; exclude credentials and temporary provider data.
- [x] Validate archive paths, size limits, schema compatibility, and references before restore.
- [x] Stage restoration and preserve the current project if validation fails.

Acceptance:

- [x] Restoring into a clean workspace preserves editable content, playback assets, references, comments, and approval history.
- [x] Malformed or incomplete archives do not partially overwrite existing projects.

#### Step 15. Complete release qualification and documentation

- Test the complete representative workflow, including import, references, generation, rejection, acceptance, stale proposals, comments, export, and restore.
- Verify both SCORM profiles for launch, scoring, completion, media, bookmarks, and resume in local harnesses and intended LMS environments.
- Verify suspend-data limits and larger-course behavior for each SCORM profile.
- Confirm packaged playback works without the Chimera backend or AI service.
- Inspect Word output visually and confirm ordinary editing behavior.
- Check keyboard access, dialog focus, accessibility descriptions, captions, and review controls.
- Update README, guided workflow text, and compatibility records with exact tested artifacts and remaining limitations.

Acceptance:

- Each original requirement has an implemented flow and recorded evidence.
- Unverified LMS behavior and deferred external review/video generation are explicitly identified.
- No release claim relies solely on archive structure or JavaScript syntax tests.

Milestone C: integrated authoring, enhancement, review, and portable export workflow.

## Verification strategy

Use focused checks appropriate to each change:

- Model/storage tests: migration, revision conflicts, atomic proposal decisions, comment anchoring, and restore integrity.
- API tests: uploads, validation failures, job lifecycle, export errors, and proposal decisions.
- Document/package checks: DOCX editable structure, SCORM manifests, packaged references, and revision metadata.
- Browser flows: playback parity, author approval, comment persistence, media placement, and completion behavior.
- External qualification: Word editing and target-LMS behavior, recorded separately from local tests.

Run existing backend coverage and the frontend build at relevant milestones. Broaden testing when a change affects shared rendering, persistence, or export behavior.

## Decisions to settle during implementation

These decisions do not block the publishing foundation, but must be resolved before their dependent steps:

| Decision | Needed before | Proposed starting point |
| --- | --- | --- |
| Word document layout and branding | Step 5 | Scene-based authoring document with native editable tables |
| Supported media formats and limits | Step 7 | Extend existing image/audio support with a documented video profile |
| AI providers, credentials, and budget controls | Step 9 | Provider adapters with explicit job submission and usage visibility |
| Resource authority when guidance conflicts | Step 9 | Author-selected priority plus visible conflict reporting |
| External reviewers and deployment environment | Step 12 | In-app review first; shared review as a separate milestone |
| Required LMS/browser matrix | Step 15 | Verify both export profiles in the intended deployment environments |

## Completion checklist

- [x] Saved storyboard exports directly to SCORM 2004 and SCORM 1.2, subject to validation gates.
- [x] Saved storyboard exports to editable Word.
- [x] Selected scenes or the entire storyboard can be submitted for AI enhancement.
- [x] Every suggested enhancement requires explicit author approval.
- [x] AI can generate media candidates; placement approval and richer generation controls remain limited.
- [x] External image and audio media can be imported and attached per scene; shared/global placement and video remain open.
- [x] Playable storyboard supports persistent review comments.
- [x] Study Guides and supporting resources guide traceable enhancement; OCR remains open.
- [x] Preview and exported course follow the implemented shared content, assessment, completion, and media rules; independent SCORM 1.2 LMS verification remains open.
- [x] The connected workflow is validated and documented.
- [x] Complete project backup and restore preserve the current local project scope.

## Next decision

After the remaining Word inspection and SCORM 1.2 LMS qualification, begin external review design as the next product milestone. Keep the richer media backlog explicit rather than making it a prerequisite for external review: structured placement, shared/course-wide media, video, OCR, and provider-specific generation controls are separate follow-up work.

The broader platform foundation now precedes that milestone: settle identity/tenancy, membership permissions, centralized tracking, and audit retention in the [Product Operating Model](product-operating-model.md), then implement those foundations before exposing external review links or adding further workflow breadth.
