import type { Project, Scene } from "./App";
import { resolvedSceneBackground } from "./SceneSurface";

export type MediaPlacement = { assetId: string; role?: "supporting" | "narration" | "demonstration"; order: number; position: "before" | "after"; loop: boolean; muted: boolean; requiredViewing?: boolean; viewingThresholdPercent?: number; altText: string; decorative: boolean };
export const placementFor = (assetId: string): MediaPlacement => ({ assetId, role: "supporting", order: 0, position: "after", loop: false, muted: false, requiredViewing: false, viewingThresholdPercent: 90, altText: "", decorative: false });

export function scenePlacements(scene: Scene): MediaPlacement[] {
  const result = new Map<string, MediaPlacement>();
  [...scene.imageAssets, ...scene.audioAssets, ...(scene.videoAssets ?? [])].forEach((assetId, order) => result.set(assetId, { ...placementFor(assetId), order, altText: scene.imageAltText?.[assetId] ?? "", decorative: scene.decorativeImages?.includes(assetId) ?? false }));
  (scene.mediaPlacements ?? []).forEach(item => result.set(item.assetId, item));
  return [...result.values()];
}

export function effectivePlacements(project: Project, scene: Scene): MediaPlacement[] {
  const result = new Map((project.storyboard.courseMedia ?? []).filter(item => !(scene.excludedCourseMedia ?? []).includes(item.assetId)).map(item => [item.assetId, item]));
  scenePlacements(scene).forEach(item => result.set(item.assetId, item));
  return [...result.values()].sort((a, b) => Number(a.position !== "before") - Number(b.position !== "before") || a.order - b.order || a.assetId.localeCompare(b.assetId));
}

export function resolvedProject(project: Project): Project {
  const assets = new Map(project.storyboard.assets.map(asset => [asset.id, asset]));
  return { ...project, storyboard: { ...project.storyboard, scenes: project.storyboard.scenes.map(scene => {
    const placements = effectivePlacements(project, scene);
    return { ...resolvedSceneBackground(project, scene), mediaPlacements: placements,
      imageAssets: placements.filter(p => assets.get(p.assetId)?.kind === "image").map(p => p.assetId),
      audioAssets: placements.filter(p => assets.get(p.assetId)?.kind === "audio").map(p => p.assetId),
      videoAssets: placements.filter(p => assets.get(p.assetId)?.kind === "video").map(p => p.assetId),
      imageAltText: Object.fromEntries(placements.filter(p => p.altText).map(p => [p.assetId, p.altText])),
      decorativeImages: placements.filter(p => p.decorative).map(p => p.assetId),
    };
  }) } };
}
