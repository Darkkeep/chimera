import { reportOnboardingOutcome } from "./onboarding-journeys";
import { useEffect, useState } from "react";
import { Save } from "lucide-react";
import type { Asset, Project, Scene } from "./App";
import { revisionConflictMessage, storyboardWriteHeaders } from "./revision";

type MediaAttributionEditorProps = {
  projectId: string;
  revision: number;
  asset: Asset;
  scene?: Scene;
  canAttach?: boolean;
  onDetach?: () => void;
  onProjectUpdated: (project: Project) => void;
};

export function MediaAttributionEditor({ projectId, revision, asset, scene, canAttach = false, onDetach, onProjectUpdated }: MediaAttributionEditorProps) {
  const [attributionText, setAttributionText] = useState(asset.attributionText);
  const [attributionStatus, setAttributionStatus] = useState<"draft" | "complete">(asset.attributionStatus);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const savedDescription = scene?.imageAltText?.[asset.id] ?? "";
  const savedDecorative = scene?.decorativeImages?.includes(asset.id) ?? false;
  const [description, setDescription] = useState(savedDescription);
  const [decorative, setDecorative] = useState(savedDecorative);
  const attached = scene?.imageAssets.includes(asset.id) ?? false;
  const descriptionDirty = description !== savedDescription || decorative !== savedDecorative;

  useEffect(() => {
    setDescription(savedDescription);
    setDecorative(savedDecorative);
  }, [scene?.id, savedDescription, savedDecorative]);

  useEffect(() => {
    setAttributionText(asset.attributionText);
    setAttributionStatus(asset.attributionStatus);
  }, [asset.attributionText, asset.attributionStatus]);

  async function saveAttribution(attach = false) {
    if (busy || (attributionStatus === "complete" && !attributionText.trim())) return;
    setBusy(true);
    setError("");
    try {
      let nextRevision = revision;
      if (asset.kind === "image" && scene && (attach || (attached && descriptionDirty))) {
        const altText = { ...scene.imageAltText };
        delete altText[asset.id];
        if (!decorative && description.trim()) altText[asset.id] = description.trim();
        const response = await fetch(`/api/projects/${projectId}/scenes/${scene.id}`, {
          method: "PATCH",
          headers: storyboardWriteHeaders(nextRevision),
          body: JSON.stringify({
            imageAssets: attach ? [...new Set([...scene.imageAssets, asset.id])] : scene.imageAssets,
            imageAltText: altText,
            decorativeImages: [...(scene.decorativeImages ?? []).filter((id) => id !== asset.id), ...(decorative ? [asset.id] : [])],
          }),
        });
        if (!response.ok) throw new Error(revisionConflictMessage(response.status) || "Image description could not be saved. Your draft is still here.");
        const updated = await response.json() as Project;
        nextRevision = updated.storyboard.revision;
        onProjectUpdated(updated);
        if (attach) reportOnboardingOutcome("media.assigned", projectId, scene.id);
      }
      const response = await fetch(`/api/projects/${projectId}/assets/${asset.id}/attribution`, {
        method: "PATCH",
        headers: storyboardWriteHeaders(nextRevision),
        body: JSON.stringify({ attributionText: attributionText.trim(), attributionStatus }),
      });
      if (!response.ok) {
        const detail = await response.json().catch(() => null) as { detail?: string } | null;
        const conflictMessage = revisionConflictMessage(response.status);
        if (conflictMessage) throw new Error(conflictMessage);
        throw new Error(detail?.detail || "Media attribution could not be saved.");
      }
      onProjectUpdated(await response.json() as Project);
      reportOnboardingOutcome("media.credit-saved", projectId, asset.id);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Media attribution could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  return <div className="media-attribution-editor">
    {asset.kind === "image" && <>
      <strong className="media-description-scene">{scene ? `Description for: ${scene.title || "Untitled scene"}` : "No scene selected"}</strong>
      <label>Alternative text<textarea rows={2} maxLength={500} value={description} disabled={busy || !scene || decorative} onChange={(event) => setDescription(event.target.value)} /></label>
      <label className="media-description-decorative"><input type="checkbox" checked={decorative} disabled={busy || !scene} onChange={(event) => setDecorative(event.target.checked)} />Decorative image</label>
      {descriptionDirty && <small role="status">{attached ? "Description not saved" : "Description pending attachment"}</small>}
    </>}
    <label>Attribution / credit<textarea rows={2} maxLength={2000} disabled={busy} value={attributionText} onChange={(event) => setAttributionText(event.target.value)} placeholder="Creator, source, license or permission" /></label>
    <div className="media-attribution-actions"><label>Status<select disabled={busy} value={attributionStatus} onChange={(event) => setAttributionStatus(event.target.value as "draft" | "complete")}><option value="draft">Draft</option><option value="complete">Complete</option></select></label><button className="button button-outline" onClick={() => void saveAttribution()} disabled={busy || (attributionStatus === "complete" && !attributionText.trim())}><Save size={13} />{busy ? "Saving..." : "Save credit"}</button></div>
    {asset.kind === "image" && <button className={`button ${attached ? "button-dark" : "button-outline"}`} onClick={attached ? onDetach : () => void saveAttribution(true)} disabled={!canAttach || busy || (!attached && attributionStatus === "complete" && !attributionText.trim())}>{attached ? "Detach media" : "Attach to scene"}</button>}
    {error && <small className="media-attribution-error" role="alert">{error}</small>}
  </div>;
}