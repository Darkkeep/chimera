# Pythia Sprint 10 Golden Path

## Qualification

The cross-service regression runner starts a temporary local Pythia Engine and
invokes Chimera's full golden-path integration test. That test creates a
two-slide legacy PowerPoint in memory, imports it through Chimera, and exercises
storyboard analysis and review, revision-bound transformation acceptance,
assessment design and native-item acceptance, course review, the production
approval gate, and SCORM 2004 export/report checks. Project data and Engine
state are kept in temporary directories and removed when the run ends.

Use a Python environment with Pythia's runtime and Chimera's backend development
requirements installed. From the Chimera repository root in PowerShell:

```powershell
. C:\inetpub\Pythia\.venv\Scripts\Activate.ps1
python -m pip install -r backend\requirements-dev.txt
npm run test:golden-path
```

Set `PYTHIA_ROOT` if the Pythia checkout is not at `C:\inetpub\Pythia`.
The runner starts its own Engine on an available local port and does not use
provider credentials or external model services.

## Demo Boundary

The runner is deterministic integration evidence, not a browser-level product
demo. Its explicit proposal decisions verify that drafts do not mutate
canonical content before acceptance and that accepted changes use Chimera's
normal revision flow. Those fixture decisions do not constitute human review,
SME approval, or a release decision. A design-partner demonstration must pause
at the analysis, transformation, assessment, course-review, and release gates
for the responsible people to make and record their decisions. Export only
after the authorized release decision.

The qualification verifies the SCORM 2004 package entry point, manifest, build
status, and reported compatibility checks. It does not establish LMS
conformance, course validity, accessibility conformance, or readiness for
deployment.