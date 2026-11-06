export function clipProgressKey(sceneId, clip) {
  return `clip:${sceneId}:${clip.id}:${clip.assetId}:${clip.sourceInMs}:${clip.sourceOutMs}`;
}
export function normalizeTimelineClock(timeline, value) {
  const duration = timeline.durationMs / 1000;
  if (!value || typeof value !== "object" || value.duration !== duration ||
      !Number.isFinite(value.position) || value.position < 0 || value.position > duration ||
      !Array.isArray(value.watchedRanges) || value.watchedRanges.length) return null;
  return { position: Math.round(value.position * 1000) / 1000, duration, watchedRanges: [] };
}
export function scheduledAssets(scene) {
  return new Set(
    (scene.visualLayout?.timeline?.clips || []).map((clip) => clip.assetId),
  );
}
export function requiredTimelineClips(scene) {
  return (scene.visualLayout?.timeline?.clips || []).filter(
    (clip) =>
      clip.required ||
      (clip.kind === "audio" && scene.audioRequired) ||
      (clip.kind === "video" &&
        (scene.mediaPlacements || []).some(
          (p) => p.assetId === clip.assetId && p.requiredViewing,
        )),
  );
}
