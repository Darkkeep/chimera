import { useState } from "react";
import { Check, X } from "lucide-react";
import type { Project } from "./App";
import { BackgroundImagePicker } from "./BackgroundImagePicker";
import { EditorDialog } from "./EditorDialog";
import { revisionConflictMessage, storyboardWriteHeaders } from "./revision";

export function ProjectBackgroundPanel({ project, onClose, onProjectUpdated }: { project: Project; onClose: () => void; onProjectUpdated: (project: Project) => void }) {
  const [backgroundAsset, setBackgroundAsset] = useState(project.storyboard.backgroundAsset ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save() {
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/projects/${project.id}/background`, {
        method: "PATCH", headers: storyboardWriteHeaders(project.storyboard.revision), body: JSON.stringify({ backgroundAsset }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null) as { detail?: string } | null;
        throw new Error(revisionConflictMessage(response.status) || body?.detail || "Project background could not be saved.");
      }
      onProjectUpdated(await response.json() as Project);
      onClose();
    } catch (issue) { setError(issue instanceof Error ? issue.message : "Project background could not be saved."); }
    finally { setBusy(false); }
  }
  return <EditorDialog labelledBy="project-background-title" className="scene-editor" busy={busy} onClose={onClose}>
    <div className="modal-head"><h2 id="project-background-title">Project background</h2><button type="button" className="icon-button" aria-label="Close project background" disabled={busy} onClick={onClose}><X size={18} /></button></div>
    <p className="field-hint">Default image for scenes that use the project background. Existing scene images and explicit None overrides are preserved. Source slide previews are unchanged.</p>
    <BackgroundImagePicker project={project} label="Project background image" value={backgroundAsset} disabled={busy} onChange={value => setBackgroundAsset(value ?? null)} />
    <p className="field-hint">Add images in Media library. Backgrounds are decorative; keep instructional information in accessible scene content and check text contrast.</p>
    {error && <p role="alert" className="visual-editor-error">{error}</p>}
    <div className="modal-actions"><button type="button" className="button button-outline" disabled={busy} onClick={onClose}>Cancel</button><button type="button" className="button button-accent" disabled={busy} onClick={() => void save()}><Check size={16} /> Save project background</button></div>
  </EditorDialog>;
}
