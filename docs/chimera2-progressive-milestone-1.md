# Milestone 1: accept, edit, and keep generating

Issue #43 / PR #45. Application baseline:
`4968cab485e79ba921927f1b36cac20077fd4eb5`, including Issue #46 navigation,
access enforcement, persistent editor portal and unsaved-draft protection.
The two existing progressive commits were replayed onto that exact baseline;
`main` was not used as the application base. Production and hotfix branches
are not modified by this milestone.

The existing deterministic producer, scene model, proposal/event store,
`SceneSurface`, visual editor, history and revision guards are retained.
This supports the charter's familiar authoring and selective human acceptance.
No Pythia provider, paid generation, merge or deployment is included.

## Author behavior

1. A complete validated synthetic scene is proposed while generation continues.
2. **Accept and edit** explicitly inserts that scene and opens the existing
   visual editor immediately. **Accept scene** remains available separately.
3. The author improves and saves the accepted scene, advancing the storyboard.
4. The producer delivers scene 2 after its twenty-second review interval.
   This proposal does not update canonical project state or navigate the editor.
5. The accepted scene's saved content, editor DOM, selection, focus and unsaved
   follow-up edit remain intact. Scene 2 still needs a separate author decision.

## Conflict and recovery semantics

Generation remains bound to its original source revision/snapshot. Current
authorization is still required for delivery/replay/acceptance. Acceptance
uses current `If-Match` and validates original content/order and SHA-256 file
bindings. Editing this job's already accepted scene does not change its
generation source. Changes to original scenes, structure, original files or
reference versions require explicit review and a new demo, without discarding
the old proposals or failing otherwise valid background generation.

Replay, duplicate protection, cancellation, stable inserted identities,
interrupted-accept recovery and restart-without-regeneration remain. A stale
write is 412; a changed generation-source binding is an explicit 409. Older
retained jobs without snapshot bindings remain replayable but cannot be
accepted under inferred bindings.

## Short local review

Install the existing root/frontend dependencies and backend requirements.
Set `CHIMERA_TEST_PYTHON` to the intended backend Python if `python` is not the
correct interpreter, then run:

```powershell
npm run demo:progressive
```

Open `http://127.0.0.1:5191`. The launcher uses loopback-only ports 5191/8031,
requires them to be free, creates a new isolated synthetic workspace, strips
provider/hosted configuration and enables only the existing local demo gates.
Create a synthetic course/scene, enter Studio and follow the five steps above.
Keep typing in the first scene when the second appears. Ctrl+C stops the demo.
The workspace remains available as evidence; no existing project is modified.

## Verification

The new browser case performs the complete sequence through the real synthetic
producer and UI. It checks persisted scene content/revision, retained DOM node
identity, focused textbox, selected scene, replay, unsaved-edit Keep editing
and Save changes, and zero provider POSTs. Existing cancellation, accessibility
and replay cases remain. CI retains its video, screenshots and HTML report in
the progressive-authoring artifact. These are machine checks, not Owner
usability acceptance.

Local environment limitation: this session's Windows sandbox stalls during
Python loopback socket creation before API request handling. Local API/browser
attempts are therefore not passes. Direct backend tests, event reducer tests
and the frontend build can run locally; CI supplies the API/browser result.
Exact commit and run results are reported with the completed review handoff.
