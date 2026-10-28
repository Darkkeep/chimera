import type { Project, Scene } from "./App";
import type { SceneLayout } from "./SceneSurface";

export function backgroundMode(layout: SceneLayout): "inherit" | "image" | "none" {
  return layout.backgroundMode ?? (layout.backgroundAsset ? "image" : "inherit");
}

export function effectiveBackgroundAsset(project: Project, scene: Scene): string | null {
  const layout = scene.visualLayout;
  if (layout?.backgroundMode === "none") return null;
  if (layout?.backgroundMode === "inherit") return project.storyboard.backgroundAsset ?? layout.sourceBackgroundAsset ?? null;
  return layout?.backgroundAsset || scene.backgroundAsset || project.storyboard.backgroundAsset || null;
}
