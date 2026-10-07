import { reportOnboardingOutcome } from "./onboarding-journeys";
import { useRef, useState } from "react";
import { Accessibility, Check, CircleAlert, Image as ImageIcon, X } from "lucide-react";
import type { Asset, Project, Scene } from "./App";
import { revisionConflictMessage, storyboardWriteHeaders } from "./revision";
import "./accessibility.css";

type AccessibilityViewProps = {
  projectId: string;
  revision: number;
  scenes: Scene[];
  assets: Asset[];
  onClose: () => void;
  onProjectUpdated: (project: Project) => void;
};

type ImageDraft = { altText: Record<string, string>; decorative: string[] };

export function AccessibilityView({ projectId, revision, scenes, assets, onClose, onProjectUpdated }: AccessibilityViewProps) {
  const [drafts, setDrafts] = useState<Record<string, ImageDraft>>(() => Object.fromEntries(scenes.map((scene) => [scene.id, {
    altText: scene.imageAltText ?? {},
    decorative: scene.decorativeImages ?? [],
  }])));
  const [savingScene, setSavingScene] = useState<string | null>(null);
  const saveInProgress = useRef(false);
  const [error, setError] = useState("");
  const [loadedAssets, setLoadedAssets] = useState<Record<string, boolean>>({});
  const assetById = new Map(assets.map((asset) => [asset.id, asset]));
  const imageScenes = scenes.filter((scene) => scene.imageAssets.length > 0);

  function isDirty(scene: Scene) {
    const draft = drafts[scene.id];
    return Boolean(draft && (JSON.stringify(draft.altText) !== JSON.stringify(scene.imageAltText ?? {}) || JSON.stringify(draft.decorative) !== JSON.stringify(scene.decorativeImages ?? [])));
  }

  function updateDraft(sceneId: string, update: (draft: ImageDraft) => ImageDraft) {
    setDrafts((current) => ({
      ...current,
      [sceneId]: update(current[sceneId] ?? { altText: {}, decorative: [] }),
    }));
  }

  async function saveScene(scene: Scene, expectedRevision = revision): Promise<Project | null> {
    if (saveInProgress.current) return null;
    saveInProgress.current = true;
    const draft = drafts[scene.id] ?? { altText: {}, decorative: [] };
    setSavingScene(scene.id);
    setError("");
    try {
      const response = await fetch(`/api/projects/${projectId}/scenes/${scene.id}`, {
        method: "PATCH",
        headers: storyboardWriteHeaders(expectedRevision),
        body: JSON.stringify({
          imageAltText: Object.fromEntries(Object.entries(draft.altText).filter(([, value]) => value.trim())),
          decorativeImages: draft.decorative,
        }),
      });
      if (!response.ok) throw new Error(revisionConflictMessage(response.status) || "Image accessibility details could not be saved.");
      const updatedProject = await response.json() as Project;
      const savedScene = updatedProject.storyboard.scenes.find((candidate) => candidate.id === scene.id);
      if (!savedScene) throw new Error("The saved scene could not be found. Your draft is still here.");
      setDrafts((current) => ({ ...current, [scene.id]: { altText: savedScene.imageAltText ?? {}, decorative: savedScene.decorativeImages ?? [] } }));
      onProjectUpdated(updatedProject);
      reportOnboardingOutcome("image.described", projectId, scene.id);
      return updatedProject;
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Image accessibility details could not be saved.");
      return null;
    } finally {
      saveInProgress.current = false;
      setSavingScene(null);
    }
  }

  async function savePending(close = false) {
    if (saveInProgress.current) return;
    let nextRevision = revision;
    for (const scene of imageScenes.filter(isDirty)) {
      const updatedProject = await saveScene(scene, nextRevision);
      if (!updatedProject) return;
      nextRevision = updatedProject.storyboard.revision;
    }
    if (close) onClose();
  }

  return <div className="accessibility-backdrop" onMouseDown={(event) => event.target === event.currentTarget && void savePending(true)}>
    <section data-onboarding="review.accessibility" className="accessibility-dialog" role="dialog" aria-modal="true" aria-labelledby="accessibility-title">
      <header className="accessibility-header">
        <div><p className="eyebrow">ACCESSIBILITY</p><h2 id="accessibility-title">Image descriptions</h2></div>
        <button className="icon-button" onClick={() => void savePending(true)} disabled={savingScene !== null} aria-label="Close image accessibility editor"><X size={18} /></button>
      </header>
      {error && <p className="accessibility-error" role="alert">{error}</p>}
      {imageScenes.length === 0 ? <div className="accessibility-empty"><ImageIcon size={20} /><span>No scene images to describe.</span></div> : <div className="accessibility-scenes">
        {imageScenes.map((scene) => {
          const draft = drafts[scene.id] ?? { altText: {}, decorative: [] };
          const dirty = isDirty(scene);
          return <section className="accessibility-scene" key={scene.id} aria-label={`Scene ${scenes.findIndex((candidate) => candidate.id === scene.id) + 1}: ${scene.title || "Untitled scene"}`}>
            <div className="accessibility-scene-heading"><div><span>Scene {scenes.findIndex((candidate) => candidate.id === scene.id) + 1}: {scene.title || "Untitled scene"}</span><small>{(scene.sourceSlide ?? 0) > 0 ? `Source slide ${scene.sourceSlide} · ` : ""}{scene.imageAssets.length} {scene.imageAssets.length === 1 ? "image" : "images"}</small><small role="status">{savingScene === scene.id ? "Saving..." : dirty ? "Unsaved changes" : "Saved"}</small></div><button className="button button-outline" onClick={() => void saveScene(scene)} disabled={savingScene !== null || !dirty}><Check size={14} />{savingScene === scene.id ? "Saving" : "Save"}</button></div>
            {scene.imageAssets.map((assetId) => {
              const asset = assetById.get(assetId);
              if (!asset) return null;
              const isDecorative = draft.decorative.includes(assetId);
              const described = (scene.decorativeImages ?? []).includes(assetId) || Boolean(scene.imageAltText?.[assetId]?.trim());
              const credited = asset.attributionStatus === "complete" && Boolean(asset.attributionText.trim());
              const ready = !dirty && described && credited && loadedAssets[assetId] === true;
              const status = dirty ? "Save pending" : !described ? "Description needed" : !credited ? "Attribution needed" : loadedAssets[assetId] === false ? "Media unavailable" : !loadedAssets[assetId] ? "Checking media" : "Ready for production";
              return <div className="accessibility-image" key={assetId}>
                <img src={`/api/projects/${projectId}/assets/${assetId}`} alt="" onLoad={() => setLoadedAssets((current) => ({ ...current, [assetId]: true }))} onError={() => setLoadedAssets((current) => ({ ...current, [assetId]: false }))} />
                <div className="accessibility-image-fields">
                  <strong title={asset.filename}>{asset.filename}</strong>
                  <span className={`accessibility-media-status ${ready ? "ready" : "pending"}`} role="status" title={ready ? "Media available; image description and attribution saved. Course release still requires production validation." : "Production requires available media, a saved image description or decorative designation, and completed attribution in the media library."}>{ready ? <Check size={14} /> : <CircleAlert size={14} />}{status}</span>
                  <label className="accessibility-decorative"><input type="checkbox" disabled={savingScene !== null} checked={isDecorative} onChange={(event) => updateDraft(scene.id, (current) => ({
                    altText: { ...current.altText, [assetId]: event.target.checked ? "" : current.altText[assetId] ?? "" },
                    decorative: event.target.checked ? [...current.decorative.filter((id) => id !== assetId), assetId] : current.decorative.filter((id) => id !== assetId),
                  }))} /> Decorative image</label>
                  <label className="accessibility-alt-label">Alternative text<textarea rows={2} maxLength={500} disabled={isDecorative || savingScene !== null} value={draft.altText[assetId] ?? ""} placeholder={isDecorative ? "Decorative images do not need a description" : "Describe the information this image conveys"} onChange={(event) => updateDraft(scene.id, (current) => ({ ...current, altText: { ...current.altText, [assetId]: event.target.value } }))} /></label>
                </div>
              </div>;
            })}
          </section>;
        })}
      </div>}
      <footer className="accessibility-footer"><Accessibility size={15} /><span>Each attached image needs alternative text or a decorative designation.</span><button className="button button-outline" disabled={savingScene !== null || !imageScenes.some(isDirty)} onClick={() => void savePending()}><Check size={14} />Save all</button></footer>
    </section>
  </div>;
}
