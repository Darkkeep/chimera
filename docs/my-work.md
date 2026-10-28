# My Work

My Work is the default opening screen after authentication. Refreshing the application returns to My Work; the remembered project remains available through Resume authoring. Direct review links still open their review surface.

New Project in the My Work header opens the existing course-creation dialog. Cancelling keeps My Work open; successful creation enters the new project's Storyboard workspace. Creation uses the same role checks as the sidebar command.

Identity and policy appears in the summary row alongside project, approval, comment, and publication-blocker totals. The dashboard follows the selected light, dark, or system appearance.

Recent activity is collapsed by default. Select its heading to expand or collapse the activity list. When expanded, the list has a bounded vertical scroll area that supports keyboard scrolling independently of the page.

Select a project name or its row to open that project's Storyboard authoring workspace. Project names are keyboard-accessible. Review-only members retain their existing review access and do not receive editing permissions.

## Subprojects

Organize full, independent projects under top-level projects. Only two levels are supported. In a parent's **Project actions**, choose **Create subproject** or **Attach existing project**. An existing project with children must remain top-level. Expand the parent's **visible subprojects** button with a click, Enter, or Space to inspect accessible children. Child statuses remain independent; the aggregate approved/published count includes only children you can see.

A child's **Project actions > Manage subproject** can move it to another parent, detach it to top level, or set its display order. Lower numbers appear first; ties use project ID. Saves check the metadata revision and reject stale relationship edits. Close the dialog and refresh before retrying a conflicting change.

Relationship changes require settings access on the child and its old and new parents; creating a child also requires project-creation permission. Parent access never grants child access. A visible child whose parent is restricted remains accessible independently, labeled **Parent project unavailable** without exposing the parent's title. The sidebar and Media library selectors group accessible children under accessible parents; child authoring includes a breadcrumb to the parent.

Content, media, background defaults, completion rules, review records, permissions, and exports are not inherited or combined. Each preview, export, and archive includes only its selected project. Archive restore preserves the current live attachment, not the archive's historical relationship.

A parent with active children cannot be trashed. Move, detach, or individually trash them first. Trashing a child leaves its siblings untouched. In Trash, **Restore parent** lets you retain the original parent if available and authorized, select another permitted parent, or explicitly restore to top level. An unavailable original parent produces an error rather than silently changing the child's placement.

## Production Stage

The stage selector records an explicit project status: Not set, Draft, In production, In review, Approved, or Published. Newly created projects start at Draft. Older projects remain Not set until classified. Stage changes persist in project metadata, update the project's timestamp, and create an audit event without changing the storyboard revision.

Stages are manually declared workflow labels, not approval records or evidence of successful publication. Changing a stage does not grant permissions, approve suggestions, publish a package, or bypass validation. Publication-check readiness is shown separately. Authors, instructional designers, and administrators with project-settings access can update the stage; review-only members cannot.

## Project Health

Publication blockers are grouped by validation code, including missing media files, broken media references, unavailable templates, invalid remediation targets, duplicate identifiers, incomplete audio attribution, and an empty storyboard. Pending image attribution is a production warning labeled **Attribution Pending**, not a publication blocker; complete and verify it before release. Expand a project's blocker summary to inspect individual findings and their available scene or asset context. Authoring warnings, unresolved comments, and pending enhancement approvals remain separate counts.

With five or more projects, Project health uses a bounded vertical scroll area with sticky desktop column headings. The area can be focused and scrolled with the keyboard. Fewer than five projects retain the normal unbounded layout.

## Verification

Run `npm run test:management` for isolated Chromium workflow, responsive-layout, accessibility, and API persistence checks. The tests use the existing onboarding test servers and a temporary backend workspace rather than real user projects.

Run `.venv/Scripts/python.exe -m unittest backend.tests.test_management` for focused storage and health-response coverage, and `npm --prefix frontend run build` for TypeScript and production-build validation.