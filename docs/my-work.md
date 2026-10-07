# My Work

My Work is the default opening screen after authentication. Refreshing the application returns to My Work; the remembered project remains available through Resume authoring. Direct review links still open their review surface.

New Project in the My Work header opens the existing course-creation dialog. Cancelling keeps My Work open; successful creation enters the new project's Storyboard workspace. Creation uses the same role checks as the sidebar command.

Identity and policy appears in the summary row alongside project, approval, comment, and publication-blocker totals. The dashboard follows the selected light, dark, or system appearance.

Recent activity is collapsed by default. Select its heading to expand or collapse the activity list. When expanded, the list has a bounded vertical scroll area that supports keyboard scrolling independently of the page.

Select a project name or its row to open that project's Storyboard authoring workspace. Project names are keyboard-accessible. Review-only members retain their existing review access and do not receive editing permissions.

## Production Stage

The stage selector records an explicit project status: Not set, Draft, In production, In review, Approved, or Published. Newly created projects start at Draft. Older projects remain Not set until classified. Stage changes persist in project metadata, update the project's timestamp, and create an audit event without changing the storyboard revision.

Stages are manually declared workflow labels, not approval records or evidence of successful publication. Changing a stage does not grant permissions, approve suggestions, publish a package, or bypass validation. Publication-check readiness is shown separately. Authors, instructional designers, and administrators with project-settings access can update the stage; review-only members cannot.

## Project Health

Publication blockers are grouped by validation code, including missing attribution, missing media files, broken media references, unavailable templates, invalid remediation targets, duplicate identifiers, and an empty storyboard. Expand a project's blocker summary to inspect individual findings and their available scene or asset context. Authoring warnings, unresolved comments, and pending enhancement approvals remain separate counts.

With five or more projects, Project health uses a bounded vertical scroll area with sticky desktop column headings. The area can be focused and scrolled with the keyboard. Fewer than five projects retain the normal unbounded layout.

## Verification

Run `npm run test:management` for isolated Chromium workflow, responsive-layout, accessibility, and API persistence checks. The tests use the existing onboarding test servers and a temporary backend workspace rather than real user projects.

Run `.venv/Scripts/python.exe -m unittest backend.tests.test_management` for focused storage and health-response coverage, and `npm --prefix frontend run build` for TypeScript and production-build validation.