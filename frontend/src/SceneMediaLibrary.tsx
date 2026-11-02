import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import type { Asset, Project, Scene } from "./App";
import { effectivePlacements } from "./media";

type Origin = { sceneId: string; approvedAssetId?: string; status: string };
export function SceneMediaLibrary({ project, scene, renderAsset, onEditScene, busy = false }: { project: Project; scene?: Scene; onEditScene: (scene: Scene) => void; busy?: boolean; renderAsset: (asset: Asset) => ReactNode }) {
  const [origins, setOrigins] = useState<Origin[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    setOrigins([]); setError("");
    fetch(`/api/projects/${project.id}/generated-candidates`, { signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error("Could not identify generated media destinations. Other project media is available below.");
      return response.json() as Promise<Origin[]>;
    }).then(setOrigins).catch(issue => { if (issue.name !== "AbortError") setError(issue.message); });
    return () => controller.abort();
  }, [project.id, project.storyboard.revision]);
  const attached = new Set(scene ? effectivePlacements(project, scene).map(item => item.assetId) : []);
  const intended = new Set(origins.filter(item => item.status === "approved" && item.sceneId === scene?.id).map(item => item.approvedAssetId));
  const current = project.storyboard.assets.filter(asset => attached.has(asset.id) || intended.has(asset.id));
  const other = project.storyboard.assets.filter(asset => !current.includes(asset));
  function card(asset: Asset) {
    const origin = origins.find(item => item.approvedAssetId === asset.id);
    const destination = project.storyboard.scenes.find(item => item.id === origin?.sceneId);
    return <div key={asset.id}>{destination && <p className="field-hint">Generated for: {destination.title}{origin?.sceneId === scene?.id ? attached.has(asset.id) ? " ? Attached to this scene" : " ? Approved, awaiting attachment" : ""}</p>}{renderAsset(asset)}</div>;
  }
  if (!project.storyboard.assets.length) return <div className="template-empty"><strong>No media in this project</strong><span>No images, audio, or video added yet.</span></div>;
  return <>
    {error && <p role="alert">{error}</p>}
    {scene ? <section aria-label="Selected scene media"><div className="template-toolbar"><h3>Media for {scene.title}</h3><button type="button" className="button button-outline" disabled={busy} onClick={() => onEditScene(scene)}>Edit scene</button></div><p className="field-hint">Attached media and approved assets requested for this scene.</p>{current.length ? <div className="media-grid">{current.map(card)}</div> : <p>No attached or approved media for this scene.</p>}</section> : null}
    {other.length > 0 && <details key={scene?.id || "project"} className="other-project-media"><summary>{scene ? "Other project media" : "Project media"} ? {other.length}</summary><p>These assets are available in the project. They are not attached to the selected scene.</p><div className="media-grid">{other.map(card)}</div></details>}
  </>;
}
