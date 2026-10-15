/** Programmatic native tracks avoid file-origin fetch and track-load resets. */
const installedCaptionTracks = new WeakMap();

export function installCaptionTrack(media, text, language = "en") {
  if (!media || typeof VTTCue === "undefined" || !media.addTextTrack) return;
  let installed = installedCaptionTracks.get(media);
  if (installed?.text === text && installed.language === language) return;
  if (installed && installed.language !== language) { installed.track.mode = "disabled"; installed = null; }
  if (!text && !installed) return;
  const track = installed?.track || media.addTextTrack("captions", "Captions", language);
  track.mode = "hidden";
  for (const cue of Array.from(track.cues || [])) track.removeCue(cue);
  const seconds = value => {
    const parts = value.split(":").map(Number);
    return parts.length === 3 ? parts[0] * 3600 + parts[1] * 60 + parts[2] : parts[0] * 60 + parts[1];
  };
  for (const block of text.replace(/\r\n?/g, "\n").split(/\n\s*\n/)) {
    const lines = block.split("\n");
    const index = lines.findIndex(line => /^(?:\d{2,}:)?\d{2}:\d{2}\.\d{3}\s+-->/.test(line));
    if (index < 0) continue;
    const timing = lines[index].split(/\s+-->\s+/);
    const start = seconds(timing[0]), end = seconds(timing[1].split(/\s+/)[0]);
    if (Number.isFinite(start) && Number.isFinite(end) && end > start) track.addCue(new VTTCue(start, end, lines.slice(index + 1).join("\n")));
  }
  track.mode = text ? "showing" : "disabled";
  installedCaptionTracks.set(media, { track, text, language });
}
