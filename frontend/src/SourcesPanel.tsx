import { useEffect, useState } from "react";
import { X } from "lucide-react";
import documentsIcon from "./assets/sources/documents.png";
import textIcon from "./assets/sources/text.png";
import webIcon from "./assets/sources/web.png";
import pythiaIcon from "./assets/sources/pythia.png";
import { EditorDialog } from "./EditorDialog";
import { ReferenceOcrPanel } from "./ReferenceOcrPanel";
import type { OcrResource } from "./ReferenceOcrPanel";
import "./sources.css";

export type SourceKind = "document" | "text" | "web" | "pythia";
export type PendingSource = { id: string; file: File; title: string; kind: SourceKind; sourceUrl?: string };
type Source = Omit<OcrResource, "versions"> & { versions: (OcrResource["versions"][number] & { sourceKind?: SourceKind; sourceUrl?: string | null })[] };

export function SourcesPanel({ projectId, projectTitle, canAdd, onClose, embedded = false, queued = [], onStage, onRemoveQueued, allowedKinds, locked = false, refreshVersion = 0, onBusyChange, onResourceSaved }: {
  projectId: string; projectTitle: string; canAdd: boolean; onClose: () => void; embedded?: boolean; queued?: PendingSource[];
  onStage?: (source: PendingSource) => void; onRemoveQueued?: (id: string) => void; allowedKinds?: SourceKind[]; locked?: boolean;
  refreshVersion?: number;
  onBusyChange?: (busy: boolean) => void; onResourceSaved?: (source: Source) => void;
}) {
  const [sources, setSources] = useState<Source[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [kind, setKind] = useState<SourceKind>(allowedKinds?.[0] || "document");
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploadKey, setUploadKey] = useState(0);
  useEffect(() => { onBusyChange?.(busy); return () => onBusyChange?.(false); }, [busy, onBusyChange]);
  useEffect(() => {
    if (!projectId) { setLoading(false); setSources([]); return; }
    const controller = new AbortController();
    fetch(`/api/projects/${projectId}/reference-resources`, { signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error("Could not load project sources.");
      setSources(await response.json());
    }).catch(issue => { if (issue.name !== "AbortError") setError(issue.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [projectId, refreshVersion]);

  async function save() {
    if (busy || locked || !canAdd) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const content = kind === "document" ? file : new File([text], `${kind}-source.txt`, { type: "text/plain" });
      if (!content) throw new Error("Choose a document first.");
      if (kind !== "document" && kind !== "web" && !text.trim()) throw new Error("Enter source text first.");
      if (content.size > 25 * 1024 * 1024) throw new Error("Sources must be 25 MB or smaller.");
      if (kind === "web") {
        let parsed: URL;
        try { parsed = new URL(url.trim()); } catch { throw new Error("Enter a valid HTTP(S) page URL."); }
        if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error("Use an HTTP(S) page URL without credentials.");
      }
      if (!projectId) {
        if (!onStage) throw new Error("Create a project before saving sources.");
        const name = title.trim() || content.name || "Supplied source";
        onStage({ id: crypto.randomUUID(), file: content, title: name, kind, ...(kind === "web" ? { sourceUrl: url.trim() } : {}) });
        setText(""); setTitle(""); setUrl(""); setFile(null); setUploadKey(value => value + 1);
        setNotice(`Queued ${name}. It will be saved when you create this project.`);
        return;
      }
      const form = new FormData();
      form.append("file", content);
      form.append("title", title.trim() || file?.name || "Supplied source");
      form.append("source_kind", kind);
      if (url.trim() && kind === "web") form.append("source_url", url.trim());
      const response = await fetch(`/api/projects/${projectId}/reference-resources`, { method: "POST", body: form });
      const result = await response.json();
      if (!response.ok) throw new Error(typeof result.detail === "string" ? result.detail : "Could not save this source.");
      setSources(current => [...current, result]);
      onResourceSaved?.(result);
      setText(""); setTitle(""); setUrl(""); setFile(null);
      setUploadKey(value => value + 1);
      setNotice(`Saved ${result.title}. ${result.versions.at(-1)?.extractionStatus === "complete" ? "Readable text is available for suggestions." : "This source has no usable text yet; see its extraction status below."}`);
    } catch (issue) { setError(issue instanceof Error ? issue.message : "Could not save this source."); }
    finally { setBusy(false); }
  }

  const options = [
    { kind: "document" as const, label: "Documents", hint: "PDF, DOCX, PPTX, TXT, or Markdown. Up to 25 MB each.", icon: documentsIcon },
    { kind: "text" as const, label: "Pasted text", hint: "Notes, excerpts, instructions, and other source text.", icon: textIcon },
    { kind: "web" as const, label: "Web pages and links", hint: "Save a link and paste the page text you want to use.", icon: webIcon },
    { kind: "pythia" as const, label: "Pythia conversations and outputs", hint: "Paste a selected conversation or output from your Pythia workspace.", icon: pythiaIcon },
  ];
  const content = <>
    <div className="modal-head"><div><p className="eyebrow">{projectId ? "PROJECT SOURCES" : "ADDITIONAL SOURCE MATERIAL"}</p><h2 id="sources-title">{projectId ? "Sources" : "Text, links, and Pythia excerpts"}</h2>{projectId && <p>{projectTitle}</p>}</div>{!embedded && <button className="icon-button" aria-label="Close sources" disabled={busy} onClick={onClose}><X size={18} /></button>}</div>
    <p>{projectId ? "Add material to support authoring and reviewed suggestions. Sources do not change your scenes automatically." : "Queue source material here. It will be saved with your new project, independently of the AI connection."}</p>
    {projectId && <section aria-label="Saved sources" className="saved-sources"><h3>Saved sources · {sources.length}</h3>
      {loading ? <p role="status">Loading sources…</p> : sources.length === 0 ? <p>No sources yet. Add material below to make it available in this project.</p> : sources.map(source => {
        const version = source.versions.find(item => item.version === source.currentVersion);
        return <details key={source.id}><summary>{source.title} · {version?.sourceKind || "document"} · {version?.passages.length || 0} passages</summary>
          <p>Version {source.currentVersion} · {version?.extractionStatus}</p>
          {version?.sourceUrl && /^https?:\/\//i.test(version.sourceUrl) && <a href={version.sourceUrl} target="_blank" rel="noopener noreferrer">Open source page (new tab)</a>}
          {version?.extractionMessage && <p>{version.extractionMessage}</p>}
          {version?.passages.slice(0, 3).map(passage => <blockquote key={passage.locator}><small>{passage.locator}</small><p>{passage.text.slice(0, 1500)}{passage.text.length > 1500 ? "…" : ""}</p></blockquote>)}
          {(version?.passages.length || 0) > 3 && <p>Preview shows the first three passages. The retained source includes all extracted passages.</p>}
        </details>;
      })}
    </section>}
    {canAdd && <form onSubmit={event => { event.preventDefault(); void save(); }}>
      <fieldset disabled={busy || loading || locked} className="source-choices"><legend>Bring content into this project</legend>
        {options.filter(option => !allowedKinds || allowedKinds.includes(option.kind)).map(option => <div key={option.kind} className={`source-choice ${kind === option.kind ? "selected" : ""}`}>
          <button type="button" className="source-choice-heading" aria-expanded={kind === option.kind} aria-controls={kind === option.kind ? `source-input-${option.kind}` : undefined} onClick={() => { setKind(option.kind); setError(""); }}><img src={option.icon} alt="" width={48} height={48} /><span><strong>{option.label}</strong><small>{option.hint}</small></span></button>
          {kind === option.kind && <div id={`source-input-${option.kind}`} className="source-choice-body">
            <label>Source title<input value={title} maxLength={200} required={kind !== "document"} onChange={event => setTitle(event.target.value)} /></label>
            {kind === "document" ? <label>Source document<input type="file" key={uploadKey} accept=".pdf,.docx,.pptx,.txt,.md" required onChange={event => setFile(event.target.files?.[0] || null)} /></label> : <>
              {kind === "web" && <><label>Page URL<input type="url" required maxLength={4000} placeholder="https://example.com/page" value={url} onChange={event => setUrl(event.target.value)} /></label><p className="field-hint">Chimera does not fetch this page. A link without pasted page text is saved for reference only.</p></>}
              {kind === "pythia" && <p className="field-hint">This stores text you supply, without verifying its origin or importing ChatGPT history. Use Settings → Pythia for the local Engine connection.</p>}
              <label>{kind === "web" ? "Page text (optional)" : kind === "pythia" ? "Conversation or output text" : "Source text"}<textarea rows={6} value={text} required={kind !== "web"} maxLength={1000000} onChange={event => setText(event.target.value)} /></label>
            </>}
            <button type="submit" className="button button-accent">{busy ? "Saving source…" : projectId ? "Save source" : "Queue source"}</button>
          </div>}
        </div>)}
      </fieldset>
    </form>}
    {error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
    {queued.length > 0 && <section className="saved-sources" aria-label="Queued sources"><h3>Queued sources · {queued.length}</h3>{queued.map(source => <div className="queued-source" key={source.id}><span>{source.title} · {source.kind}</span>{onRemoveQueued && <button type="button" className="button button-outline" disabled={locked || busy} aria-label={`Remove queued ${source.title}`} onClick={() => onRemoveQueued(source.id)}>Remove</button>}</div>)}</section>}
    {projectId && canAdd && sources.some(source => source.versions.some(version => version.filename.toLowerCase().endsWith(".pdf"))) && <ReferenceOcrPanel projectId={projectId} resources={sources} onUpdated={updated => { setSources(current => current.map(source => source.id === updated.id ? updated as Source : source)); onResourceSaved?.(updated as Source); }} />}
    {projectId && <p className="field-hint">Select readable source text in the Pythia conversation when you want to share it. Source material is supplied context and still needs author review.</p>}
  </>;
  return embedded ? <section className="sources-embedded" aria-labelledby="sources-title">{content}</section> : <EditorDialog labelledBy="sources-title" onClose={onClose} busy={busy} className="sources-dialog">{content}</EditorDialog>;
}
