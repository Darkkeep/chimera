# Chimera 2.0 | Quiet Counsel QC-1 implementation record

**Branch:** `feature/chimera-2-quiet-counsel-spec`  
**Feature:** Pure, deterministic local analysis of one saved scene  
**Status:** Implemented in source, CI qualification pending; no user-facing indicator yet.

## Current behavior

`frontend/src/quiet-counsel.ts` exports `detectCounselCandidates(scene, revision)` and `visibleCounselCandidates(candidates, decisions, mode)`. Neither function performs network requests, asks Pythia anything, writes state, edits the author's project, or creates notifications.

**Conservative detectors (rule version 1):**
- `branch-equivalent-feedback`: a branching decision node has two or more distinct authored options that all return the same substantive feedback.
- `practice-equivalent-feedback`: a guided-practice step has the same pattern.
- `video-pause-equivalent-feedback`: a formative video pause has the same pattern.

A feedback message must be at least 12 non-whitespace characters, and every response must have matching normalized text, before any candidate is emitted. The observation is a question about author intention, not a recommendation to rewrite the content.

**No inference** of correctness, assessment quality, clinical safety, accessibility compliance, learning effectiveness, or professional competence is attempted. These rules do not count overlapping outcomes as an error.

## Identity, staleness and suppression

Candidates carry scene ID, source revision, rule ID/version, per-target finding key, local content fingerprint, explanatory observations and references. Fingerprints cover the actual reviewed choice labels and feedback, not unrelated fields in the scene. Re-saving an unchanged scene does not change its fingerprint. Editing checked text naturally yields a new fingerprint.

`visibleCounselCandidates` excludes decisions marked `intentional`, `not-useful`, or `snoozed` for the matching finding key and fingerprint. `silent` returns none; `quiet` returns at most one; `collaborative` returns remaining findings. This is pure-memory filtering only: **no per-user persistence or privacy boundary is claimed until QC-3**.

## Tests / qualifications

Run using Node.js 24 or newer from repo root:

```bash
node --experimental-strip-types --test tests/quiet-counsel/detectors.test.mjs
```

The CI workflow invokes this suite before the frontend TypeScript/Vite build. New tests cover all three rule targets, false-positive suppression, normalized sameness, no-scene handling, version-independent fingerprint stability, edited content invalidation, explicit decisions, mode output, nondestructive operation and a coarse performance budget.

**Known gate:** CI and real Studio browser acceptance must pass before calling QC-1 qualified. The missing UI, per-actor settings, decisions/history, and Pythia handoff remain separate QC-2/3/4 work items; do not claim these are implemented. On purpose, this first slice has no indicator visible to normal authors.

## Follow-on

QC-2 may compute candidates inside the selected Studio scene using `useMemo` and display a neutral icon without calling Pythia. Do not store decisions globally or across actors until QC-3 enforces identity and retention. Any user-visible Quiet default must include the first-use notice and an easy Silent option.
