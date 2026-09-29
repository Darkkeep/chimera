import { useEffect, useState } from "react";
import { Save } from "lucide-react";
import type { Asset, Project } from "./App";

type MediaAttributionEditorProps = {
  projectId: string;
  asset: Asset;
  onProjectUpdated: (project: Project) => void;
};

export function MediaAttributionEditor({ projectId, asset, onProjectUpdated }: MediaAttributionEditorProps) {
  const [attributionText, setAttributionText] = useState(asset.attributionText);
  const [attributionStatus, setAttributionStatus] = useState<"draft" | "complete">(asset.attributionStatus);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setAttributionText(asset.attributionText);
    setAttributionStatus(asset.attributionStatus);
  }, [asset.attributionText, asset.attributionStatus]);

  async function saveAttribution() {
    if (busy || (attributionStatus === "complete" && !attributionText.trim())) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/projects/${projectId}/assets/${asset.id}/attribution`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attributionText: attributionText.trim(), attributionStatus }),
      });
      if (!response.ok) {
        const detail = await response.json().catch(() => null) as { detail?: string } | null;
        throw new Error(detail?.detail || "Media attribution could not be saved.");
      }
      onProjectUpdated(await response.json() as Project);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Media attribution could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  return <div className="media-attribution-editor">
    <label>Attribution / credit<textarea rows={2} maxLength={2000} value={attributionText} onChange={(event) => setAttributionText(event.target.value)} placeholder="Creator, source, license or permission" /></label>
    <div className="media-attribution-actions"><label>Status<select value={attributionStatus} onChange={(event) => setAttributionStatus(event.target.value as "draft" | "complete")}><option value="draft">Draft</option><option value="complete">Complete</option></select></label><button className="button button-outline" onClick={() => void saveAttribution()} disabled={busy || (attributionStatus === "complete" && !attributionText.trim())}><Save size={13} /> Save credit</button></div>
    {error && <small className="media-attribution-error" role="alert">{error}</small>}
  </div>;
}