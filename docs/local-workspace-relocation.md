# Chimera 2.0 local workspace relocation

Verified 2026-11-17. Canonical local development repository: `C:\inetpub\Chimera2`.
Use this path in the forthcoming Chimera 2.0 charter and repository agent instructions.
Open `C:\inetpub\Chimera2\Chimera2.code-workspace` in VS Code.

## Preservation and comparison

Source: `C:\inetpub\chimera\chimera`. Destination did not exist before copying.
Both the outer and nested original checkouts remain in place. No removal or archiving is authorized.

Inventoried 8,464 files / 257,471,951 bytes, including hidden Git metadata, ignored local
configuration, dependencies, local project data, untracked files and qualification evidence.
No reparse points were found. Robocopy copied all 8,464 files with zero failed files.
SHA-256 comparison matched 8,463 files against the pre-copy inventory. The sole exception
was volatile `.git/FETCH_HEAD`, which changed during the copy window and was subsequently
refreshed from the source. No working-tree content differed in that comparison.

Branch: `feature/chimera-2-golden-path-qualification`.
HEAD: `dc21e48b56743c6f87572452a45742747e7212a3`.
All eight original modified tracked files have matching diffs; the staged diff matches.
All 31 original untracked files match byte for byte.
The contracts submodule is clean at `1fb6584a36552ca3f9f77ba1479fef45f8137b73`;
its relative Git-directory and worktree links resolve inside the new checkout.

Relocation additions: this report, `Chimera2.code-workspace`, `scripts/start-local.ps1`,
`scripts/vite.local.mjs`, and an update to `.vscode/tasks.json`. Original Founder UX source
and evidence files were not edited. Build output was regenerated; original test reports
were retained, and new test output uses `workspace/relocation-test-results`.

Private verification artifacts remain local: `C:\inetpub\chimera2-source-inventory.csv`,
`C:\inetpub\chimera2-copy.log`, and `workspace/relocation/`.

## Local launch

Use VS Code tasks **Chimera Backend** and **Chimera Frontend**, or run in two terminals:

```powershell
Set-Location C:\inetpub\Chimera2
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/start-local.ps1 Backend
```

```powershell
Set-Location C:\inetpub\Chimera2
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/start-local.ps1 Frontend
```

Frontend: `http://127.0.0.1:5175`; backend: `http://127.0.0.1:8002`.
These ports avoid the untouched original local services on 5173/5174/8000.
The backend uses the copied `workspace/local-activation` data and the new
`backend/.venv/Scripts/python.exe`. The frontend proxy targets the new backend.
The ignored `frontend/.env.local` still enables `VITE_CHIMERA_STUDIO_ENABLED=true`;
the launcher also sets that flag for its process.

## Verification

- Frontend TypeScript/Vite build passed; existing large-chunk warning remains.
- New backend virtualenv installed the declared requirements constrained to versions
  from the previous local environment; `pip check` passed. Constraint snapshot is
  `workspace/relocation-python-constraints.txt`.
- 29 Chromium tests passed in 1.5 minutes: Studio shell, native authoring, three-scene
  golden path with both SCORM exports, workspace navigation, and Founder scene refinements.
- New frontend and proxied `/api/health` returned successfully. A headless browser loaded
  the running frontend with no page errors and confirmed the served Studio flag is true.
- Backend module and interpreter resolve under `C:\inetpub\Chimera2`.
- `git diff --check` passed.

Reproduce targeted tests from the new repository:

```powershell
$env:CHIMERA_STUDIO_TEST='true'
$env:VITE_CHIMERA_STUDIO_ENABLED='true'
$env:CHIMERA_TEST_PYTHON='C:\inetpub\Chimera2\backend\.venv\Scripts\python.exe'
node node_modules/@playwright/test/cli.js test --config playwright.onboarding.config.cjs --project=chromium studio.spec.cjs studio-native.spec.cjs studio-golden-path.spec.cjs workspace-navigation.spec.cjs scene-refinement.spec.cjs --reporter=list --output=workspace/relocation-test-results
```

## Remaining dependencies and boundaries

No active local launcher or VS Code task requires the former nested checkout or outer
backend virtualenv. Historical qualification documents and copied logs intentionally
retain their original paths; use this document for current launch/test commands.
Direct `npm --prefix frontend run dev` still uses the repository's original 5173/8000
defaults; use the supplied VS Code tasks or launcher for the relocated runtime.

Python 3.13.1 remains installed outside the checkout under the user's local Programs
directory; Node and browser binaries are also machine dependencies. Optional Pythia
integration uses the sibling `C:\inetpub\Pythia` checkout and its environment; it was
not started or qualified here. Optional external tools such as Inkscape retain their
existing installation dependencies.

No push, merge, deployment, database migration, production service change or paid
generation occurred. Browser tests wrote isolated local test workspaces. These checks
do not constitute Founder acceptance or hosted qualification.
