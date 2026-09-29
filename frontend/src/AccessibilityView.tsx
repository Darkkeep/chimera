import { useState } from "react";
import { Accessibility, Check, Image as ImageIcon, X } from "lucide-react";
import type { Asset, Project, Scene } from "./App";
import "./accessibility.css";

type AccessibilityViewProps = {
  projectId: string;
  scenes: Scene[];
  assets: Asset[];
  onClose: () => void;
  onProjectUpdated: (project: Project) => void;
};

type ImageDraft = { altText: Record<string, string>; decorative: string[] };

export function AccessibilityView({ projectId, scenes, assets, onClose, onProjectUpdated }: AccessibilityViewProps) {
  const [drafts, setDrafts] = useState<Record<string, ImageDraft>>(() => Object.fromEntries(scenes.map((scene) => [scene.id, {
    altText: scene.imageAltText ?? {},
    decorative: scene.decorativeImages ?? [],
  }])));
  const [savingScene, setSavingScene] = useState<string | null>(null);
  const [error, setError] = useState("");
  const assetById = new Map(assets.map((asset) => [asset.id, asset]));
  const imageScenes = scenes.filter((scene) => scene.imageAssets.length > 0);

  function updateDraft(sceneId: string, update: (draft: ImageDraft) => ImageDraft) {
    setDrafts((current) => ({
      ...current,
      [sceneId]: update(current[sceneId] ?? { altText: {}, decorative: [] }),
    }));
  }

  async function saveScene(scene: Scene) {
    const draft = drafts[scene.id] ?? { altText: {}, decorative: [] };
    setSavingScene(scene.id);
    setError("");
    try {
      const response = await fetch(`/api/projects/${projectId}/scenes/${scene.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageAltText: Object.fromEntries(Object.entries(draft.altText).filter(([, value]) => value.trim())),
          decorativeImages: draft.decorative,
        }),
      });
      if (!response.ok) throw new Error("Image accessibility details could not be saved.");
      onProjectUpdated(await response.json() as Project);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Image accessibility details could not be saved.");
    } finally {
      setSavingScene(null);
    }
  }

  return <div className="accessibility-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section className="accessibility-dialog" role="dialog" aria-modal="true" aria-labelledby="accessibility-title">
      <header className="accessibility-header">
        <div><p className="eyebrow">ACCESSIBILITY</p><h2 id="accessibility-title">Image descriptions</h2></div>
        <button className="icon-button" onClick={onClose} aria-label="Close image accessibility editor"><X size={18} /></button>
      </header>
      {error && <p className="accessibility-error" role="alert">{error}</p>}
      {imageScenes.length === 0 ? <div className="accessibility-empty"><ImageIcon size={20} /><span>No scene images to describe.</span></div> : <div className="accessibility-scenes">
        {imageScenes.map((scene) => {
          const draft = drafts[scene.id] ?? { altText: {}, decorative: [] };
          return <section className="accessibility-scene" key={scene.id}>
            <div className="accessibility-scene-heading"><div><span>{scene.title || "Untitled scene"}</span><small>{scene.imageAssets.length} {scene.imageAssets.length === 1 ? "image" : "images"}</small></div><button className="button button-outline" onClick={() => void saveScene(scene)} disabled={savingScene !== null}><Check size={14} />{savingScene === scene.id ? "Saving" : "Save"}</button></div>
            {scene.imageAssets.map((assetId) => {
              const asset = assetById.get(assetId);
              if (!asset) return null;
              const isDecorative = draft.decorative.includes(assetId);
              return <div className="accessibility-image" key={assetId}>
                <img src={`/api/projects/${projectId}/assets/${assetId}`} alt="" />
                <div className="accessibility-image-fields">
                  <strong title={asset.filename}>{asset.filename}</strong>
                  <label className="accessibility-decorative"><input type="checkbox" checked={isDecorative} onChange={(event) => updateDraft(scene.id, (current) => ({
                    altText: { ...current.altText, [assetId]: event.target.checked ? "" : current.altText[assetId] ?? "" },
                    decorative: event.target.checked ? [...current.decorative.filter((id) => id !== assetId), assetId] : current.decorative.filter((id) => id !== assetId),
                  }))} /> Decorative image</label>
                  <label className="accessibility-alt-label">Alternative text<textarea rows={2} maxLength={500} disabled={isDecorative} value={draft.altText[assetId] ?? ""} placeholder={isDecorative ? "Decorative images do not need a description" : "Describe the information this image conveys"} onChange={(event) => updateDraft(scene.id, (current) => ({ ...current, altText: { ...current.altText, [assetId]: event.target.value } }))} /></label>
                </div>
              </div>;
            })}
          </section>;
        })}
      </div>}
      <footer className="accessibility-footer"><Accessibility size={15} /><span>Each attached image needs alternative text or a decorative designation.</span></footer>
    </section>
  </div>;
}
