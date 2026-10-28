# Scene timeline, layers, and appearance

Implemented on 2026-10-28 against `main` following the [plan](scene-timeline-layers-plan.md), and delivered with the reconciled documentation in this source revision. Release/distribution approval remains pending under [creator pre-alpha readiness](pre-alpha-readiness.md). Existing scenes do not gain scheduled playback automatically.

## Authoring

- Native rectangle, rounded rectangle, ellipse, line, arrow, triangle, and diamond insertion; geometry, aspect-ratio locking, fill/outline colors and alpha, and whole-object opacity.
- Shared text/shape drop-shadow, bevel, and emboss controls, including independent reset. Bevel/emboss approximate raised/recessed silhouette lighting with browser filters; imported SVG geometry retains original fill/outline styling.
- Named layers, drag reordering and keyboard/button alternatives, lock/hide, grouping and joint stage movement, alignment/distribution, and existing draft Undo/Redo.
- Optional resizable/collapsible timeline with seconds, shared playhead, playback transport, zoom, snapping, object lifetimes, entrance/presentation/exit blocks, dragging and right-edge resizing, and exact timing inputs.
- Scheduled audio/video clips with distinct clip IDs, source in/out trimming, overlaps, volume/fades, preview-only mute/solo, video position/size/layer order, cue markers, and local waveforms. PCM WAV decoding works without Web Audio; other waveform codecs depend on the browser. Waveforms are limited to 25 MB sources.

## Data and playback

`SceneLayout.timeline` has version 1, explicit duration, print timestamp, clips, and cues. Elements add optional native geometry, appearance, visibility timing, naming/grouping, aspect locking, and publishing visibility. Existing `SceneLayout.version` remains 1 because the new fields are optional and old representations remain readable. Older application builds must not save newly authored timeline/effect content, because they do not understand these fields.

The shared JavaScript transport controls media and paused native animations, including seeking before media readiness settles. Source timestamps and scene timestamps are separate. Media errors or buffering pause playback; background tabs pause the clock. Audible playback requires an explicit learner action. Reaching the end retains learner-controlled navigation.

Native `played` ranges determine consumption, intersected with each trimmed interval. Seek holes remain holes; coverage is merged per clip, and the progress key includes source asset and in/out points so retrimming does not inherit stale coverage. Existing required-audio/video rules are inherited when scheduling their media. Required overlapping narration should be reviewed for instructional usability.

Preview and SCORM retain a shared scene clock and clip coverage within the existing progress structure. Budget estimates include clocks and clips; actual serialized suspend-data size remains checked before saving. Standalone progress remains session-only. Older per-asset progress stays available for unscheduled attachments; scheduling a clip does not turn prior full-asset completion into trimmed-clip completion.

Scheduled assets are included in package resolution, asset usage/deletion checks, validation, and ordinary storyboard persistence/backups. Their independent player is suppressed in scenes where they are scheduled. Unscheduled attachments retain their previous behavior. Templates that replace a composition intentionally replace its timeline as part of that draft, and Undo restores the previous composition.

## Outputs and accessibility

Stage, preview, SCORM 1.2/2004, standalone, and Word snapshots share appearance and transport code. Timed Word visuals seek to the chosen print time with native animations paused; detailed records include clip and cue timings. A real screenshot regression checks a timed shape at its authored snapshot timestamp. Missing/unsupported media still reports its limitation; a still image cannot represent an entire moving scene.

Timeline inputs provide keyboard alternatives to dragging. Timed visual text also has an always-available screen-reader equivalent. Reduced motion suppresses movement while preserving timed visibility. Video captions use source-media time; audio captions are also surfaced as text. Transcripts remain accessible. Automated checks are supplemented by the manual acceptance items below.

## Verification and remaining acceptance

See the October 28 entry in [current work](current-work.md) for final test counts and the [capture manifest](user-guide/refresh-timeline-2026-10-28.json) for source/image/PDF hashes. Tests use isolated synthetic courses, local PCM audio, and a generated three-second video test pattern; no user course, real provider, or paid generation is used.

Manual acceptance remains for editing comfort with large timelines, screen-reader use, narration synchronization on representative real media, effect quality, interactive Word review, and newly exported target-LMS packages. This implementation does not add transcoding, destructive media edits, arbitrary effect keyframes, motion paths, or full PowerPoint effect fidelity. Automated local checks are not a new release qualification.
