import { effectivePlacements } from "./media";
import { useState } from "react";
import { Check, CircleAlert } from "lucide-react";
import type { Asset, Project, Scene } from "./App";
import { MediaAttributionEditor } from "./MediaAttributionEditor";

type MediaLibraryItemProps = {
  project: Project;
  projectId: string;
  revision: number;
  asset: Asset;
  scenes: Scene[];
  selectedScene?: Scene;
  attached: boolean;
  canAttach: boolean;
  onAttach: () => void;
  onProjectUpdated: (project: Project) => void;
};

export function MediaLibraryItem({ project, projectId, revision, asset, scenes, selectedScene, attached, canAttach, onAttach, onProjectUpdated }: MediaLibraryItemProps) {
  const [available, setAvailable] = useState<boolean | null>(null);
  const uses = scenes.flatMap((scene, index) => effectivePlacements(project, scene).some(p => p.assetId === asset.id) ? [{ scene, number: index + 1 }] : []);
  const described = asset.kind !== "image" || uses.every(({ scene }) => effectivePlacements(project, scene).some(p => p.assetId === asset.id && (p.decorative || Boolean(p.altText.trim()))));
  const credited = asset.attributionStatus === "complete" && Boolean(asset.attributionText.trim());
  const accessible = asset.kind !== "video" || Boolean(asset.transcript?.trim() && asset.captionsVtt?.trim());
  const ready = available === true && uses.length > 0 && described && credited && accessible;
  const status = available === false ? "Media unavailable" : uses.length === 0 ? "Not attached to a scene" : !described ? "Description needed" : !accessible ? "Captions and transcript needed" : !credited ? "Attribution needed" : available === null ? "Checking media" : "Ready for production";
  const source = `/api/projects/${projectId}/assets/${asset.id}`;

  return <article className="media-item">
    <div className="media-preview">{asset.kind === "image"
      ? <img src={source} alt={asset.filename} loading="lazy" onLoad={() => setAvailable(true)} onError={() => setAvailable(false)} />
      : asset.kind === "video" ? <video controls playsInline preload="metadata" src={source} aria-label={`Video: ${asset.filename}`} onLoadedMetadata={() => setAvailable(true)} onError={() => setAvailable(false)} />
      : <audio controls preload="metadata" src={source} onLoadedMetadata={() => setAvailable(true)} onError={() => setAvailable(false)} />}</div>
    <div className="media-item-info">
      <strong title={asset.filename}>{asset.filename}</strong>
      <small>{asset.kind} / {(asset.sizeBytes / 1024 / 1024).toFixed(2)} MB</small>
      <span className={`accessibility-media-status ${ready ? "ready" : "pending"}`} role="status" title="Media readiness only. Course release still requires production validation.">{ready ? <Check size={14} /> : <CircleAlert size={14} />}{status}</span>
      <small className="media-scene-references">{uses.length ? uses.map(({ scene, number }) => `Scene ${number}: ${scene.title || "Untitled scene"}`).join("; ") : "No scene references"}</small>
    </div>
    <MediaAttributionEditor projectId={projectId} revision={revision} asset={asset} scene={selectedScene} canAttach={canAttach} onDetach={onAttach} onProjectUpdated={onProjectUpdated} />
    {asset.kind !== "image" && <button className={`button ${attached ? "button-dark" : "button-outline"}`} onClick={onAttach} disabled={!canAttach}>{attached ? "Detach media" : "Attach to scene"}</button>}
  </article>;
}