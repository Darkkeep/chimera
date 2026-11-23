import { useRef, useState } from "react";
import { EditorDialog } from "./EditorDialog";

export type ImportPreview = { kind: "pythia" | "storyboard" | "pptx"; title: string; scenes: {title: string; extractedText?: string | string[]}[]; diagnostics: string[] };
export const progressiveImport = import.meta.env.VITE_CHIMERA_STUDIO_ENABLED === "true" && (import.meta.env.PROD || import.meta.env.VITE_CHIMERA_PROGRESSIVE_DEMO_ENABLED === "true");

export function ExperienceImport({onClose, onCreate}: {onClose: () => void; onCreate: (file: File, preview: ImportPreview, title: string) => Promise<void>}) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const sequence = useRef(0);
  async function inspect(selected?: File) {
    if (!selected || busy) return;
    const current = ++sequence.current;
    setFile(null); setPreview(null); setError(""); setBusy(true);
    try {
      if (selected.size > 25 * 1024 * 1024) throw new Error("Choose a file of 25 MB or smaller.");
      const body = new FormData(); body.append("file", selected); body.append("progressive_mode", String(progressiveImport));
      const response = await fetch("/api/experience-import/preview", {method:"POST", body});
      const data = await response.json();
      if (!response.ok) throw new Error(typeof data.detail === "string" ? data.detail : "This file could not be read. Choose a supported JSON or PowerPoint file.");
      if (current === sequence.current) { setPreview(data); setTitle(data.title); setFile(selected); }
    } catch (issue) { setError(issue instanceof Error ? issue.message : "This file could not be read."); }
    finally { setBusy(false); }
  }
  return <EditorDialog labelledBy="experience-import-title" onClose={onClose} busy={busy}>
    <h2 id="experience-import-title">Start Experience from Import</h2>
    <p>Bring a PowerPoint presentation, a saved Pythia handoff, or a Chimera storyboard JSON backup (up to 25 MB; Pythia up to 1 MB). We’ll explain what can be imported before creating a new project.</p>
    <div onDragOver={event => event.preventDefault()} onDrop={event => {event.preventDefault(); if (busy) return; if (event.dataTransfer.files.length !== 1) {setFile(null); setPreview(null); setError("Choose one file at a time."); return;} void inspect(event.dataTransfer.files[0]);}}>
      <label>Choose or drop a file (.pptx or .json)<input type="file" aria-label="Experience import file" accept=".pptx,.json" disabled={busy} onChange={event => {void inspect(event.currentTarget.files?.[0]); event.currentTarget.value = "";}} /></label>
    </div>
    {busy && <p role="status">{preview ? "Creating your experience…" : "Reading your file…"}</p>}
    {error && <p role="alert">{error}</p>}
    {preview && <section aria-label="Import preview">
      <p>Selected file: <strong>{file?.name}</strong></p>
      <h3>{preview.kind === "pythia" ? "Pythia production handoff" : preview.kind === "pptx" ? "PowerPoint presentation" : "Chimera storyboard backup"}</h3>
      <p>{preview.scenes.length} {preview.scenes.length === 1 ? "scene" : "scenes"} {preview.kind === "pythia" ? "available for review. No scenes are accepted automatically." : "available for a new project."}</p>
      <ul>{preview.diagnostics.map((message, index) => <li key={index}>{message}</li>)}</ul>
      <details open><summary>Preview scenes</summary><ol>{preview.scenes.map((scene, index) => <li key={index}><strong>{scene.title}</strong>{scene.extractedText && <p style={{whiteSpace:"pre-wrap", overflowWrap:"anywhere"}}>{Array.isArray(scene.extractedText) ? scene.extractedText.join("\n") : scene.extractedText}</p>}</li>)}</ol></details>
      <label>Experience name<input aria-label="Experience name" value={title} onChange={event => setTitle(event.target.value)} disabled={busy} /></label>
      <p>Creates a separate project. Your existing projects are kept.</p>
      <button className="button button-accent" disabled={busy || !title.trim()} onClick={async () => {if (!file) return; setBusy(true); setError(""); try {await onCreate(file, preview, title.trim());} catch(issue) {setError(issue instanceof Error ? issue.message : "Import failed.");} finally {setBusy(false);}}}>Create experience and {preview.kind === "pythia" ? "review scenes" : "import"}</button>
    </section>}
    <button className="button button-outline" disabled={busy} onClick={onClose}>Cancel</button>
  </EditorDialog>;
}
