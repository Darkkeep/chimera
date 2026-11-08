# Scene timeline, layers, and appearance

Repository context: **Chimera 1.2.0** | [MIT license](../LICENSE) | [Release notes](release-1.2.0.md). Dated evidence and independently versioned assets/contracts retain their original scope.

Implemented on 2026-10-28 against `main` following the [plan](scene-timeline-layers-plan.md), and delivered with the reconciled documentation in this source revision. Release/distribution approval remains pending under [creator pre-alpha readiness](pre-alpha-readiness.md). Existing scenes do not gain scheduled playback automatically.

## Authoring

- Native rectangle, rounded rectangle, ellipse, line, arrow, triangle, and diamond insertion; geometry, aspect-ratio locking, fill/outline colors and alpha, and whole-object opacity.
- Shared text/shape drop-shadow, bevel, and emboss controls, including independent reset. Bevel/emboss approximate raised/recessed silhouette lighting with browser filters; imported SVG geometry retains original fill/outline styling.
- Named layers, drag reordering and keyboard/button alternatives, lock/hide, grouping and joint stage movement, alignment/distribution, and existing draft Undo/Redo.
- Optional resizable/collapsible timeline with seconds, shared playhead, playback transport, zoom, snapping, object lifetimes, entrance/presentation/exit blocks, dragging and right-edge resizing, and exact timing inputs.
- Scheduled audio/video clips with distinct clip IDs, source in/out trimming, overlaps, volume/fades, preview-only mute/solo, video position/size/layer order, cue markers, and local waveforms. PCM WAV decoding works without Web Audio; other waveform codecs depend on the browser. Waveforms are limited to 25 MB sources.
- New video clips automatically use the scene's full canvas. Select an existing
  video clip and choose **Fit video to scene** to reset its position to the scene
  origin and size its playback box to the current stage dimensions. Playback
  centers the whole picture with its original proportions, without stretching or
  cropping; mismatched proportions leave letterboxing/pillarboxing. Manual
  geometry stays available. Fitting is a draft edit with Undo/Redo and is retained
  by **Save scene**. Existing clips and later stage-size edits do not silently
  replace custom video geometry; use Fit again after changing the stage size.

## Data and playback

`SceneLayout.timeline` has version 1, explicit duration, print timestamp, clips, cues, and optional `pauses` (default empty). Elements add optional native geometry, appearance, visibility timing, naming/grouping, aspect locking, and publishing visibility. Existing `SceneLayout.version` remains 1 because the new fields are optional and old representations remain readable. Older application builds must not save newly authored timeline/effect content, because they do not understand these fields.

The shared JavaScript transport controls media and paused native animations, including seeking before media readiness settles. Source timestamps and scene timestamps are separate. A paused seek target is issued once, allowing decoders that round to frame boundaries to settle instead of repeatedly seeking the same timestamp. Seeks that land more than 50 ms away are retried by the bounded settling loop. Media errors or network buffering pause playback; background tabs pause the clock. Decoder-only waits after a seek do not pause media when the remaining clip is already buffered, so decoding can become ready. Exported players retain an explicit playback request while buffering and resume on either `canplay` or a completed seek with ready media. Cancelling playback clears that request. Audible playback requires an explicit learner action. Reaching the end retains learner-controlled navigation.

Native `played` ranges determine consumption, intersected with each trimmed interval. Seek holes remain holes; coverage is merged per clip, and the progress key includes source asset and in/out points so retrimming does not inherit stale coverage. Existing required-audio/video rules are inherited when scheduling their media. Required overlapping narration should be reviewed for instructional usability.

Preview and SCORM retain a shared scene clock and clip coverage within the existing progress structure. Budget estimates include clocks and clips; actual serialized suspend-data size remains checked before saving. Standalone progress remains session-only. Older per-asset progress stays available for unscheduled attachments; scheduling a clip does not turn prior full-asset completion into trimmed-clip completion.

Scheduled assets are included in package resolution, asset usage/deletion checks, validation, and ordinary storyboard persistence/backups. Their independent player is suppressed in scenes where they are scheduled. Unscheduled attachments retain their previous behavior. Templates that replace a composition intentionally replace its timeline as part of that draft, and Undo restores the previous composition.

## Optional interactive-video pauses (November 5, 2026)

The shared transport supports at most eight distinct question/decision pauses
inside scheduled video intervals (start inclusive, end exclusive). Each pause
has an ID, scene-clock `timeMs`, prompt and two to four uniquely identified
responses with feedback. Strict schemas reject grading/gating/route properties;
there is no branching-video editor. Prompts/feedback are bounded to 1,000
characters and response labels to 200. No new asset type or endpoint is needed.

Policy: formative, skippable, unlimited retries. Crossing a timestamp in playback
stops at that exact millisecond. Responses only reveal feedback; explicit
Continue/Skip resumes at that position. Seeking across a timestamp skips it,
backward seeking replays it, and an exact seek offers it on Play (immediately
when already playing). Restart seeks zero without autoplay. A focused heading,
native keyboard controls, status feedback and an always-available text/replay
alternative serve the same content without timing.

Only the existing scene clock and watched ranges persist. No learner response
or handled-pause list is stored or included in suspend-budget estimates.
Restored clocks require the current timeline duration, finite in-range position
and empty watched ranges. Continue at a pause timestamp reoffers the question
on Play; answers are intentionally ephemeral. SCORM Start over clears clocks
and coverage. No completion, assessment attempt, grade or pass/fail policy
changes. Legacy timelines/cues remain non-interactive.

Stage, course preview, local-file standalone and both SCORM dialects share this
implementation. Written Word/SME timeline alternatives contain every prompt,
response and feedback; screenshots retain the authored print time. See the
[user procedure](user-guide.md#add-optional-video-reflections).

## Outputs and accessibility

Stage, preview, SCORM 1.2/2004, standalone, and Word snapshots share appearance and transport code. Timed Word visuals seek to the chosen print time with native animations paused; detailed records include clip and cue timings. A real screenshot regression checks a timed shape at its authored snapshot timestamp. Missing/unsupported media still reports its limitation; a still image cannot represent an entire moving scene.

Timeline inputs provide keyboard alternatives to dragging. Timed visual text also has an always-available screen-reader equivalent. Reduced motion suppresses movement while preserving timed visibility. Video captions use source-media time; audio captions are also surfaced as text. Transcripts remain accessible. Automated checks are supplemented by the manual acceptance items below.

## Verification and remaining acceptance

See the October 28 entry in [current work](current-work.md) for final test counts and the [capture manifest](user-guide/refresh-timeline-2026-10-28.json) for source/image/PDF hashes. Tests use isolated synthetic courses, local PCM audio, and a generated three-second video test pattern; no user course, real provider, or paid generation is used.

Manual acceptance remains for editing comfort with large timelines, screen-reader use, narration synchronization on representative real media, effect quality, interactive Word review, and newly exported target-LMS packages. This implementation does not add transcoding, destructive media edits, arbitrary effect keyframes, motion paths, or full PowerPoint effect fidelity. Automated local checks are not a new release qualification.
