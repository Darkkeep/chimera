import type { Project, Scene } from "./App";
import { effectivePlacements } from "./media";
import { installCaptionTrack } from "../../backend/app/static/captions.js";

export function PublishedMedia({ project, scene, position, completedAudioKeys, onAudioEnded }: { project: Project; scene: Scene; position: "before" | "after"; completedAudioKeys: string[]; onAudioEnded: (key: string) => void }) {
  const embedded = new Set(scene.visualLayout?.enabled ? scene.visualLayout.elements.filter(e => e.kind === "image").map(e => e.assetId) : []);
  return <div className="published-media">{effectivePlacements(project, scene).filter(p => p.position === position && !embedded.has(p.assetId)).map(placement => {
    const asset = project.storyboard.assets.find(a => a.id === placement.assetId);
    if (!asset) return null;
    const source = `/api/projects/${project.id}/assets/${asset.id}`;
    const required = asset.kind === "audio" && scene.audioRequired;
    const key = `${scene.id}:${asset.id}`;
    return <section key={asset.id} className={asset.kind === "image" ? "course-preview-images" : `course-preview-audio ${required ? "required-audio" : ""}`}>
      {asset.kind === "image" ? <img className="course-preview-image" src={source} alt={placement.decorative ? "" : placement.altText || asset.filename} /> : <>
        <span>{asset.filename}{required ? ` · ${completedAudioKeys.includes(key) ? "Complete" : "Required"}` : ""}</span>
        {asset.kind === "video" ? <video ref={node => { if (node) installCaptionTrack(node, asset.captionsVtt || "", asset.language || "en"); }} controls playsInline preload="metadata" src={source} aria-label={`Video: ${asset.filename}`} loop={placement.loop} muted={placement.muted} />
          : <audio ref={node => { if (node) installCaptionTrack(node, asset.captionsVtt || "", asset.language || "en"); }} controls preload="metadata" src={source} aria-label={`Audio: ${asset.filename}${required ? ", required" : ""}`} loop={placement.loop} muted={placement.muted} onEnded={() => { if (required) onAudioEnded(key); }} />}
        {asset.transcript && <details><summary>Transcript: {asset.filename}</summary><p>{asset.transcript}</p></details>}
      </>}
    </section>;
  })}</div>;
}
