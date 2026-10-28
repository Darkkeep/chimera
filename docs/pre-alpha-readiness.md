# Creator pre-alpha readiness

Reviewed 2026-10-28. This is the current release-readiness checklist for a proposed invitation-only, supported, local Windows creator pilot. It records open work; it does not approve distribution or change the release policy.

Use [current work](current-work.md) for delivered features, the [user guide](user-guide.md) for supported procedures, and the [human acceptance packet](qualification/human-acceptance-1.1.0.md) for observations. Dated qualification documents retain evidence for their original revisions and artifact hashes.

## Implemented baseline

Local authoring includes PPTX import, an editable authored composition, native shapes and appearance effects, layers/groups, optional animation/media timelines, assessments, preview, project archives, Word, standalone, and SCORM exports. The timeline is explicitly enabled per scene. Bevel/emboss are browser lighting approximations. Generated video, arbitrary HTML/document stage objects, and event-triggering cue actions are outside this baseline; cue markers currently support navigation and snapping.

The October 28 backend run recorded 403 tests with 71 skipped; 27 focused browser checks passed across Chromium, Firefox, and WebKit. Additional shape-editor checks covered Light/Dark and 320/768/1024/1440px layouts. These results establish local engineering evidence, not candidate CI, clean-install qualification, instructional quality, or human release acceptance.

## Before independent participant use

| Task | Owner | Status / completion evidence |
| --- | --- | --- |
| Select the candidate | Release maintainer | Commit/review the intended source; choose a distinct pre-alpha identifier under release policy; retain exact SHA and hashes. Packaging excludes uncommitted application files. |
| Repair automatic installation | Engineering | Open: `Install-Chimera.ps1` installs frontend dependencies but omits root production dependencies and Chromium required by current Word rendering. Manual setup is documented in the evaluation start guide. |
| Verify clean installation | Engineering plus operator | Open for the current candidate: extract on a fresh Windows environment; follow supplied instructions; launch, import, edit, save/reopen, preview, and export Word/standalone. Verify optional LibreOffice/OCR setup and useful missing-dependency errors. |
| Qualify the complete candidate | Engineering | Open: exact-commit CI, full browser matrix, visual/export and applicable authentication checks, artifact verification, and explicit disposition of skipped tests. Earlier focused checks are not a fresh complete candidate run. |
| Verify recovery and upgrade | Engineering plus operator | Open: archive and restore a representative timeline/media/assessment project into a clean installation; compare sources and content. Back up installation identity/configuration/shared media separately. Older builds must not save new timeline/effect content. |
| Rehearse essential tasks | Product owner plus author/accessibility reviewer | Open: representative lesson and media, timeline synchronization, keyboard/screen-reader operation, both Word formats edited/saved/reopened. Resolve data-loss and essential-workflow blockers. |
| Prepare participant support | Pilot coordinator | Open: supported OS/browser matrix, short first-session instructions, approved content handling, known issues, defect-reporting channel, named support owner, task prompts, and pause/exit criteria. |
| Review distribution rights | Release maintainer | Open: review bundled code/assets and notices for the selected distribution scope; keep private onboarding use separate from public API-stability/public-distribution claims. |

## Scope-dependent checks

- **LMS publishing:** qualify a newly exported ZIP in the selected LMS, with captions, timed/trimmed media, seek-versus-consumption behavior, resume, retries, and gradebook reporting. Historical October 14 attestations apply to their recorded packages. If LMS publishing is outside the pilot, state that explicitly rather than claiming acceptance.
- **AI-assisted authoring:** approve provider configuration/content handling/spending and review actual outputs against the captured-output rubric. Manual authoring and imported media do not require a live AI connection. Synthesia/Shotstack remain setup/read-only-test integrations, not video generation.
- **Hosted participation:** requires deployment-specific identity/isolation, secrets, recovery, and operational acceptance. Hosting and Encarta remain deferred; a local pilot does not qualify them.

## During the pilot and before wider rollout

Observe creators completing real tasks with copies of approved lesson material. Record task completion, assistance, time, confusing controls, instructional-quality findings, and defects. Novice usability findings are an outcome of this supported pilot; its exit criteria determine readiness for wider rollout. The pilot does not replace the release policy's applicable acceptance gates.

Deferred feature work includes generated video, arbitrary motion keyframes/paths, Word reimport, guest review, MFA, automated email, multi-organization hosting, and distributed workers. A second independently maintained onboarding consumer is required for API-stability claims, not proof that Chimera's private pinned integration exists. Keep the 2027-01-04 attribution-policy review separate from present feature completion.
