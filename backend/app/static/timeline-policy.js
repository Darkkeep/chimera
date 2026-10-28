export function clipProgressKey(sceneId, clip) {
  return `clip:${sceneId}:${clip.id}:${clip.assetId}:${clip.sourceInMs}:${clip.sourceOutMs}`;
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
