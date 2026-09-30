# Export and enhancement recovery

Recovered on 2026-09-30.

## What happened

The missing controls were saved in Git stash **Export Enhancement -- Pass 1**, rather than lost from the repository.

- Stash commit: `fe48af89b3e8d54c5e30902dfea76968c5a9a21c`.
- Base commit: `ce700671bfba808796fd785e6f7c8f02605da661`.
- Stash timestamp: 2026-09-30 14:45:26 EDT.
- HEAD reflog: 2026-09-30 14:45:28 EDT, `reset: moving to HEAD`.

The working tree subsequently showed only the older committed build. This explains why the controls disappeared and why a guide captured afterward classified them as unavailable. Git records the stash and reset, but does not identify which UI or client initiated the operation.

## Restored scope

The saved implementation was reapplied to the current working tree, including its dependencies, tests, and supporting documentation:

- Editable Word export and answer-key selection.
- Enhancement references, submission previews, background jobs, and broader proposal review.
- Generated image/narration candidate controls and explicit approval.
- Scene discussion during playback.
- Portable project backup/restore.
- My Work, readiness indicators, local identity/audit foundations, scene deletion, and revision checks.
- The export/enhancement build plan and deployment checklist.

The existing README guide link was retained. The illustrated guide and capture helpers were updated to match the recovered interface rather than overwritten with the incomplete stashed guide.

## Preservation

The stash was not popped or dropped. Before restoration, a separate snapshot was saved under `workspace/recovery-export-enhancement-20260930/`, including the pre-recovery README, guide/images, a stash archive, and the exact restoration patch. This directory is intentionally ignored by Git.

Restoration used a checked patch that excluded the guide files. Forty-two restored files other than README were compared with the stash contents and matched, allowing for line endings. README combines the recovered feature documentation with the current guide link.

The recovered changes remain uncommitted in the working tree. They must be included in the next source commit to become part of the committed build. New backend modules, frontend components, tests, and documentation must be included as well as modifications to existing files.

## Verification

- Backend: `python -m unittest discover -s backend/tests -v` — **67 tests passed**.
- Frontend: `npm run build` — **passed**, including TypeScript and the Vite production bundle.
- Browser: restored Word/backup controls, reference upload and submission preview, proposal editing/acceptance, media candidate controls, scene commenting/resolution, My Work, and assessment playback were inspected or exercised against isolated demonstration data.
- The illustrated guide was refreshed from the recovered interface. No real authoring projects were modified during browser verification.
- Isolated API smoke check: Word document downloaded (43,398 bytes), portable backup downloaded (46,328 bytes), and backup manifest validated. The SCORM smoke build was correctly blocked by the demonstration assets' unfinished attribution.
- The existing backend on port 8000 advertised both recovered Word and portable-backup routes after restoration.

The initial sandboxed test/build attempts encountered Windows temporary-directory and subprocess permission errors. The same checks passed with the required permissions; no source workaround was introduced for those environment errors.

AI provider submission was intentionally disabled for the browser demonstration. Visible generation/submission controls do not imply that a provider has been configured or live generation has been qualified. This recovery did not repeat LMS qualification.
