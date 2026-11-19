# Local authoring recovery — November 19, 2026

The canonical `C:\inetpub\Chimera2` copy was still based on `dc21e48` while
the original nested checkout had advanced through four commits to `fdd7c72`.
Restarting the canonical copy therefore served the older interface. Production
protection was not the cause: it prohibits promotion of development work to the
public site, not running the new authoring experience locally.

Recovered the newer implementation, tests and qualification documentation from
the source commit into the local working tree. Source Git history and the
destination branch/HEAD were not changed. No Git merge, commit, push, production
deployment, migration or paid generation was performed. CI workflows were not
copied. Original checkouts remain intact.

Before applying changes, verified a SHA-256 backup of 126 existing affected or
locally changed files. Backup, original tracked/index patches and the exact
161-path recovery manifest are under ignored
`workspace/local-recovery/20261119-102110/`. Later refinement versions supersede
overlapping older authoring files; compatible local changes were retained.
The charter, instruction files, canonical launch configuration, unrelated local
files, dialog selection fix and existing project data remain in place.

Run this workspace's `scripts/start-local.ps1` services, or its VS Code tasks:
frontend `http://127.0.0.1:5175`, backend `http://127.0.0.1:8002`.
The original qualification documents describe their original source paths,
ports and commits; those historical values are not the canonical local launcher.
The local recovery is uncommitted and does not inherit hosted exact-commit CI.

The recovered work supports familiar direct authoring through actual dropdown
menus, contextual floating properties and the revised timeline while retaining
existing content, guarded writes and learner playback. The preceding
[alignment review](charter-alignment-review-2026-11-18.md) was based on the stale
copy and is marked superseded. Source qualification records contain local Beta
acceptance and separate outstanding release and accessibility gates.

Verification: frontend TypeScript/Vite build passed (existing bundle-size
warning); 29 focused backend media-alias, Signal and permission tests passed.
All 24 focused Chromium checks passed in 1.6 minutes: authoring menus, compact
timeline, direct stage, header save, native authoring and the three-scene dual
SCORM golden path. These are local recovery checks, not full release acceptance.

Restarted both canonical local services after file recovery. Confirmed backend
health through the frontend proxy. Observed the existing PBJ project at revision
13 in the user's VS Code browser with Course, Stage/Interaction, Scene/Insert/
Format/Animate/Layers/View menus and Timeline and layers; the permanent Studio
Inspector is absent. No project edit or save was performed during this check.
