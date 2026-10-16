# Local candidate review — 2026-10-16

Reviewed application commit `2d5d44cd4549399d852e2df87c981fb752d59971` and the previously untracked evaluation packaging helpers. No release or hosted deployment approval is implied.

The branding commit builds successfully. Its focused Chromium checks pass in Light and Dark (2 tests), covering authoring dialogs, accessibility, mobile fit and the Source picker. The complete backend suite ran 242 tests successfully, with 6 skipped. The production build retains a non-blocking 611.43 kB entry-chunk warning. This is focused candidate review, not a fresh complete cross-browser qualification.

Review corrections:

- Moved `httpx==0.28.1` from development-only requirements to runtime requirements. A clean extracted installation reproduced `ModuleNotFoundError: httpx` on application import before this correction.
- Include pinned submodule source in evaluation archives at the application's recorded gitlink commit. Ordinary `git archive` omits it. The exported contracts need no GitHub credentials on the recipient's workstation.
- Include a helper-content fingerprint in artifact names and use stable ZIP metadata. Rebuilding identical inputs reproduces identical bytes; changed helpers get a distinct name.
- Check Node availability explicitly and correct the launcher's default data path to `backend/workspace/`, subject to `CHIMERA_WORKSPACE` overrides.
- Align README appearance instructions with the brand commit's Dark default.

The initial archive passed every payload hash, exact file inventory, ZIP integrity, pinned-contract and onboarding-artifact checks, installation-data exclusion checks, and byte-for-byte reproducibility. Fresh extraction, dependency installation and frontend build succeeded; its runtime import exposed the dependency issue described above. Installing the corrected runtime requirements into that isolated environment then passed application import and the empty-project API smoke check.

Build the reviewed commit with `.\.venv\Scripts\python.exe scripts/package-evaluation.py` (or an installed Python 3.11+). Output and SHA-256 sidecars live under ignored `workspace/distribution/`. Only committed application files and the explicitly fingerprinted packaging helpers enter the ZIP. Uncommitted application edits are intentionally excluded. The package is a source-based Windows evaluation installation requiring Python, Node/npm and setup internet access.

Next: submit the reviewed candidate, verify GitHub CI against its exact full SHA, and complete the human acceptance packet before final release. Hosted deployment remains deferred. The old PR #5 push/merge instructions in the historical handoff are superseded by the completion plan/update and this review.
