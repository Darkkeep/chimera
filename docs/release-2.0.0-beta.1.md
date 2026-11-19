# Chimera 2.0.0-beta.1

Prepared November 19, 2026. Status: local Beta candidate approved for commit;
unpublished and not authorized for production deployment. Product direction is
governed by [charter 2.0.0](../CHIMERA_CHARTER.md), independently of this
application version. The founder authorized the candidate commit, including the
initial charter and agent instructions, on November 19, 2026. Human qualification
and production release gates remain separate.

## Authoring changes

- Studio opens the selected scene directly in the existing stage editor.
  The permanent right-hand Studio Inspector is removed. Existing classic
  authoring remains available behind the Studio toggle.
- Scene, Insert, Format, Animate, Layers, View and Preview dropdowns expose
  established editing capabilities. Contextual floating inspectors support
  pinning, docking, collapsing and keyboard movement.
- The compact timeline provides layer arrangement, animation controls and
  transport. Project color swatches, interface themes and non-destructive media
  display names are part of the recovered Beta baseline.
- Save appears for a changed draft. Save/Discard/Keep editing protection uses
  the existing revision-checked writes. Preview retains the actual learner
  player and authored assessment/scoring behavior.
- Delete and Backspace now remove selected unlocked stage objects or timeline
  layers. Ctrl+Z restores them; inline text and property fields retain native
  editing behavior. Backspace on a locked object or empty selection cannot trigger
  WebKit browser-back navigation. Question components are not deleted by these
  object shortcuts.
- The stage's Check answer placeholder is readable and an editor-only hint
  directs authors to Preview to answer. Learner scoring is unchanged.
- Selecting text and releasing outside a dialog no longer dismisses its draft;
  an intentional backdrop click still dismisses a dismissible dialog.

## Engineering and compatibility

This is a presentation and authoring evolution over existing project, scene,
asset and playback contracts. No database migration or alternative content
engine is introduced. Pythia remains optional; no live consultation or paid
generation is required for manual authoring checks.

Root/frontend package versions and lockfile root metadata, backend version,
OpenAPI version, Studio identity and feedback report version agree on
`2.0.0-beta.1`. The API uses the backend version constant; frontend identity
and feedback use frontend package metadata. Historical release documents,
test fixtures and third-party versions retain their original values.

## Known limits and release gates

- Studio remains opt-in and must be re-enabled after a reload. The dev launcher
  makes the feature available; this does not change production defaults.
- Activities, assessments, HTML5 and saved timelines have existing scene-level
  compatibility restrictions. Use separate compatible scenes rather than
  replacing existing content implicitly.
- Full keyboard-only course authoring, a real screen-reader walkthrough and
  actual touch-device acceptance remain open. Recorded heading-hierarchy and
  narrow-screen usability findings require explicit follow-up; passing browser
  automation does not certify accessibility or intuitive authoring.
- SCORM 1.2/2004 export and local playback checks do not establish target-LMS
  acceptance. Import/launch the exact packages in the intended test LMS before
  making that compatibility claim.
- The complete PowerPoint → Pythia → review/selective acceptance → manual edit →
  publication journey needs its own qualification. H5P compatibility/licensing
  and general Unreal/simulation execution are not qualified by this Beta.
- Frontend build retains the existing large-bundle warning. Full hosted CI for
  this candidate, independent professional review and release approval are
  separate outstanding gates.

See the [review packet](beta-1-review-packet.md) for source lineage, verification
commands, results and the review/commit boundary.
