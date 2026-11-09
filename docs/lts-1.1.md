# Chimera 1.1 Desktop LTS

Chimera 1.1 (tag `v1.1.0`) is maintained on the `release/1.1` branch as the
supported **desktop** offering while hosted Chimera (1.2.0 and later) evolves
separately at `https://chimera.darkrogue.io`.

## Scope and support policy

- `release/1.1` receives **security and critical fixes only**. No feature
  backports are made from 1.2.0 or later.
- The published 1.1.0 evaluation ZIP and its human-acceptance packet
  (`docs/qualification/human-acceptance-1.1.0.md`) remain the reference
  artifacts for this track. New 1.1.x packages, if any, follow the normal
  packaging and release-policy gates.
- On this track, Pythia integration is **local-only by design**: the stdio
  bridge (`backend/bridges/pythia_mcp.py`) to a locally installed Pythia
  checkout and the loopback engine address (default `http://127.0.0.1:8001`)
  are the supported modes. Hosted/remote Pythia transport is a 1.3.0-track
  feature and is not backported.

## Data compatibility caveat

Do **not** open and save projects containing 1.2+ timeline/effect content in a
1.1 installation: older schemas may discard fields. When moving projects
between hosted Chimera and a 1.1 desktop installation, work on copies and
verify archive restore in a clean compatible installation first, per
`docs/release-policy.md`.

## Fix intake

Report issues against this track at
<https://github.com/Darkkeep/chimera/issues> and label them for `release/1.1`.
Fixes land on `main` first when applicable, then are cherry-picked here.
