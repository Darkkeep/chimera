import { useRef, useState } from "react";
import { Check, Upload, X } from "lucide-react";
import type { Project } from "./App";
import { BackgroundImagePicker } from "./BackgroundImagePicker";
import { EditorDialog } from "./EditorDialog";
import { revisionConflictMessage, storyboardWriteHeaders } from "./revision";

export function ProjectBackgroundPanel({ project, onClose, onProjectUpdated }: { project: Project; onClose: () => void; onProjectUpdated: (project: Project) => void }) {
  const [backgroundAsset, setBackgroundAsset] = useState(project.storyboard.backgroundAsset ?? null);
  const [currentProject, setCurrentProject] = useState(project);
  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function importGraphic(file: File) {
    setError("");
    if (!/\.(png|jpe?g|gif|webp)$/i.test(file.name)) {
      setError("Choose a PNG, JPEG, GIF, or WebP image."); return;
    }
    setBusy(true);
    try {
      const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
      const sha256 = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
      const form = new FormData();
      form.append("file", file);
      const response = await fetch(`/api/projects/${project.id}/assets`, {
        method: "POST", headers: storyboardWriteHeaders(currentProject.storyboard.revision, false), body: form,
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null) as { detail?: string } | null;
        throw new Error(revisionConflictMessage(response.status) || body?.detail || "Graphic could not be imported.");
      }
      const updated = await response.json() as Project;
      const image = updated.storyboard.assets.find(asset => asset.kind === "image" && asset.sha256 === sha256);
      setCurrentProject(updated);
      onProjectUpdated(updated);
      if (!image) throw new Error("The image was uploaded but could not be selected. Choose it from the image list.");
      setBackgroundAsset(image.id);
    } catch (issue) { setError(issue instanceof Error ? issue.message : "Graphic could not be imported."); }
    finally { setBusy(false); if (fileInput.current) fileInput.current.value = ""; }
  }
  async function save() {
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/projects/${project.id}/background`, {
        method: "PATCH", headers: storyboardWriteHeaders(currentProject.storyboard.revision), body: JSON.stringify({ backgroundAsset }),
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
    <p className="field-hint">Apply a default background across the project with one save. Scenes with their own background or an explicit None override keep their settings. Imported slides are prepared from their source layout automatically.</p>
    <BackgroundImagePicker project={currentProject} label="Project background image" value={backgroundAsset} disabled={busy} onChange={value => setBackgroundAsset(value ?? null)} />
    <div><button type="button" className="button button-outline" disabled={busy} onClick={() => fileInput.current?.click()}><Upload size={16} /> Import graphic</button><input ref={fileInput} type="file" hidden accept="image/png,image/jpeg,image/gif,image/webp,.png,.jpg,.jpeg,.gif,.webp" aria-label="Import background graphic" disabled={busy} onChange={event => { const file = event.currentTarget.files?.[0]; if (file) void importGraphic(file); }} /></div>
    <p className="field-hint">Import a PNG, JPEG, GIF, or WebP image, then save to apply it. Imported images remain in Media library if you cancel. Backgrounds are decorative; keep instructional information in accessible scene content and check text contrast.</p>
    {error && <p role="alert" className="visual-editor-error">{error}</p>}
    <div className="modal-actions"><button type="button" className="button button-outline" disabled={busy} onClick={onClose}>Cancel</button><button type="button" className="button button-accent" disabled={busy} onClick={() => void save()}><Check size={16} /> Save project background</button></div>
  </EditorDialog>;
}
