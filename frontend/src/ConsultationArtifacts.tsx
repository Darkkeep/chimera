import { useEffect, useState } from "react";
import { Download, FolderOpen, RefreshCw } from "lucide-react";

type Artifact = {
  id: string;
  sessionId: string;
  turnId: string | null;
  type: "advice" | "draft" | "markdown" | "vector" | "gif" | "animated-gif";
  title: string;
  filename: string;
  mimeType: string;
  byteSize: number;
  sha256: string;
  status: string;
  origin: string;
  animated?: boolean;
  frameCount?: number;
  durationMs?: number;
};

type EngineArtifact = {
  artifact_id: string;
  artifact_version: number;
  artifact_type: string;
  task_id: string;
  project_id: string;
  consumer: string;
  content_kind: "structured";
  retrieval: "json-envelope";
  downloadable_file: false;
  status: string;
};

type NativeIncoming = {
  format: "pythia-native-file-v1";
  artifact_id: string;
  source_id: string;
  project_id: string;
  mime_type: "image/svg+xml" | "image/gif";
  byte_size: number;
  animated: boolean;
  frame_count?: number;
};

type PythiaCandidate = {
  id: string;
  jobId: string;
  provider: string | null;
  kind: "image" | "audio" | "video";
  status: "pending" | "approved" | "rejected";
  filename: string;
  contentType: string;
  sizeBytes: number;
};

async function getArtifacts(projectId: string, signal?: AbortSignal): Promise<Artifact[]> {
  const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/consultation-artifacts`, { signal });
  if (!response.ok) throw new Error("Could not retrieve consultation artifacts. Check your project access and try again.");
  const body = await response.json() as { artifacts: Artifact[] };
  return body.artifacts;
}

export function ConsultationArtifacts({ projectId, sessionId, refreshKey }: {
  projectId: string;
  sessionId: string;
  refreshKey: string;
}) {
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [showAll, setShowAll] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const [exporting, setExporting] = useState<string | null>(null);
  const [engineArtifacts, setEngineArtifacts] = useState<EngineArtifact[]>([]);
  const [engineStatus, setEngineStatus] = useState<"loading" | "ready" | "unavailable">("loading");
  const [mediaCandidates, setMediaCandidates] = useState<PythiaCandidate[]>([]);
  const [mediaStatus, setMediaStatus] = useState<"loading" | "ready" | "unavailable">("loading");
  const [nativeSourceId, setNativeSourceId] = useState("");
  const [importingNative, setImportingNative] = useState(false);
  const [incoming, setIncoming] = useState<NativeIncoming[]>([]);
  const [incomingStatus, setIncomingStatus] = useState<"loading" | "ready" | "unavailable">("loading");
  const [promotingId, setPromotingId] = useState<string | null>(null);
  const [promotionNotice, setPromotionNotice] = useState("");
  const [nativePrompt, setNativePrompt] = useState("");
  const [nativeFormat, setNativeFormat] = useState<"svg" | "gif">("svg");
  const [gifFrames, setGifFrames] = useState(9);
  const [gifDuration, setGifDuration] = useState(200);
  const [generatingNative, setGeneratingNative] = useState(false);
  const [generatedNotice, setGeneratedNotice] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    getArtifacts(projectId, controller.signal)
      .then(items => { setArtifacts(items); setError(""); })
      .catch(issue => { if (!controller.signal.aborted) setError(issue instanceof Error ? issue.message : "Artifacts unavailable"); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [projectId, sessionId, refreshKey, revision]);

  useEffect(() => {
    const controller = new AbortController();
    setEngineStatus("loading");
    fetch(`/api/projects/${encodeURIComponent(projectId)}/pythia-engine-artifacts`, { signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error("Engine artifact discovery is not available");
        return await response.json() as { artifacts: EngineArtifact[] };
      })
      .then(data => { setEngineArtifacts(data.artifacts); setEngineStatus("ready"); })
      .catch(() => { if (!controller.signal.aborted) { setEngineArtifacts([]); setEngineStatus("unavailable"); } });
    return () => controller.abort();
  }, [projectId, revision]);

  useEffect(() => {
    const controller = new AbortController();
    setMediaStatus("loading");
    fetch(`/api/projects/${encodeURIComponent(projectId)}/generated-candidates`, { signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error("Candidate lookup unavailable");
        return await response.json() as PythiaCandidate[];
      })
      .then(items => {
        setMediaCandidates(items.filter(item => item.provider === "Pythia" && (item.kind === "image" || item.kind === "audio")));
        setMediaStatus("ready");
      })
      .catch(() => { if (!controller.signal.aborted) { setMediaCandidates([]); setMediaStatus("unavailable"); } });
    return () => controller.abort();
  }, [projectId, revision]);

  useEffect(() => {
    const controller = new AbortController();
    setIncomingStatus("loading");
    fetch(`/api/projects/${encodeURIComponent(projectId)}/pythia-native-files`, { signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error("Native file discovery is unavailable");
        return await response.json() as { artifacts: NativeIncoming[] };
      })
      .then(result => { setIncoming(result.artifacts); setIncomingStatus("ready"); })
      .catch(() => {
        if (!controller.signal.aborted) { setIncoming([]); setIncomingStatus("unavailable"); }
      });
    return () => controller.abort();
  }, [projectId, revision]);

  async function exportMarkdown(turnId: string) {
    setExporting(turnId);
    setError("");
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/consultation-artifacts/exports/${encodeURIComponent(turnId)}`, { method: "POST" });
      if (!response.ok) {
        const result = await response.json().catch(() => ({})) as { detail?: string };
        throw new Error(result.detail || "Could not export this answer.");
      }
      setRevision(value => value + 1);
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : "Could not export this answer.");
    } finally { setExporting(null); }
  }

  async function generateNative() {
    if (!nativePrompt.trim()) { setError("Enter an image direction first."); return; }
    setGeneratingNative(true);
    setGeneratedNotice("");
    setError("");
    try {
      const response = await fetch(
        `/api/projects/${encodeURIComponent(projectId)}/pythia-native-images`,
        { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt: nativePrompt.trim(), outputFormat: nativeFormat,
            ...(nativeFormat === "gif" ? { frameCount: gifFrames, frameDurationMs: gifDuration } : {}),
            confirmPaid: true,
          }) },
      );
      if (!response.ok) {
        const detail = await response.json().catch(() => ({})) as { detail?: string };
        throw new Error(detail.detail || "Image generation was not completed. Check Pythia's request record before retrying.");
      }
      const output = await response.json() as { artifactId: string; mimeType: string };
      setGeneratedNotice(`Pythia created ${output.mimeType === "image/svg+xml" ? "an SVG" : "an animated GIF"} and registered asset ${output.artifactId}. Choose Retain in project below.`);
      setRevision(value => value + 1);
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : "Image generation status is unknown; verify Pythia before retrying.");
    } finally { setGeneratingNative(false); }
  }

  async function importNativeSource(artifactId?: string) {
    const source = (artifactId ?? nativeSourceId).trim();
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]{7,119}$/.test(source)) {
      setError("Enter a valid Pythia native artifact ID.");
      return;
    }
    setImportingNative(true);
    setError("");
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/consultation-artifacts/native/${encodeURIComponent(source)}`, { method: "POST" });
      if (!response.ok) {
        const detail = await response.json().catch(() => ({})) as { detail?: string };
        throw new Error(detail.detail || "Pythia native asset import failed.");
      }
      setNativeSourceId("");
      setRevision(value => value + 1);
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : "Pythia native asset import failed.");
    } finally { setImportingNative(false); }
  }

  async function promoteNative(artifactId: string) {
    setPromotingId(artifactId);
    setPromotionNotice("");
    setError("");
    try {
      const project = await fetch(`/api/projects/${encodeURIComponent(projectId)}`);
      if (!project.ok) throw new Error("Project is unavailable.");
      const details = await project.json() as { storyboard?: { revision?: number } };
      const revision = details.storyboard?.revision;
      if (!Number.isInteger(revision)) throw new Error("Cannot determine the current storyboard revision.");
      const response = await fetch(
        `/api/projects/${encodeURIComponent(projectId)}/consultation-artifacts/${encodeURIComponent(artifactId)}/promote`,
        { method: "POST", headers: { "If-Match": String(revision) } },
      );
      if (!response.ok) {
        const result = await response.json().catch(() => ({})) as { detail?: string };
        throw new Error(result.detail || "Media promotion was not completed.");
      }
      setPromotionNotice("Original image added to Chimera's project media library. Placement remains under author control.");
      setRevision(value => value + 1);
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : "Media promotion failed.");
    } finally { setPromotingId(null); }
  }

  const visible = artifacts.filter(item => showAll || item.sessionId === sessionId);
  return <section className="pythia-consultation-artifacts" aria-label="Consultation artifacts">
    <div className="pythia-artifacts-heading">
      <div><h3><FolderOpen size={18} aria-hidden="true" /> Artifacts <span className="pythia-artifacts-count">{artifacts.filter(a => a.sessionId === sessionId).length}</span></h3>
        <p>Retained consultation records, exports and verified original vector or animated assets. Originals are never rasterized or flattened.</p></div>
      <button type="button" className="button button-outline" onClick={() => setRevision(value => value + 1)} disabled={loading} aria-label="Refresh artifacts"><RefreshCw size={15} /> Refresh</button>
    </div>
    <label className="pythia-artifacts-filter"><input type="checkbox" checked={showAll} onChange={event => setShowAll(event.target.checked)} /> Include previous consultations in this project</label>
    <form className="pythia-native-import" onSubmit={event => { event.preventDefault(); void generateNative(); }}>
      <label htmlFor="pythia-native-prompt">Generate new SVG or animated GIF with Pythia</label>
      <textarea id="pythia-native-prompt" value={nativePrompt} maxLength={2000}
        onChange={event => setNativePrompt(event.target.value)} rows={3}
        placeholder="Describe the vector illustration or motion you need..." />
      <div className="pythia-native-import-controls">
        <label htmlFor="pythia-native-format">Output format</label>
        <select id="pythia-native-format" value={nativeFormat}
          onChange={event => setNativeFormat(event.target.value as "svg" | "gif")}>
          <option value="svg">Editable SVG vector</option><option value="gif">Animated GIF</option>
        </select>
        {nativeFormat === "gif" && <>
          <label htmlFor="pythia-gif-frames">Frames</label>
          <input id="pythia-gif-frames" type="number" min={2} max={16} value={gifFrames}
            onChange={event => setGifFrames(Number(event.target.value))} />
          <label htmlFor="pythia-gif-duration">ms/frame</label>
          <input id="pythia-gif-duration" type="number" min={20} max={2000} value={gifDuration}
            onChange={event => setGifDuration(Number(event.target.value))} />
        </>}
      </div>
      <small>This action calls a paid image model once. There is no automatic retry. You decide separately whether to retain, use, or publish the result.</small>
      <button type="submit" className="button button-outline"
        disabled={generatingNative || !nativePrompt.trim() || (nativeFormat === "gif" && (gifFrames < 2 || gifFrames > 16 || gifDuration < 20 || gifDuration > 2000))}>
        {generatingNative ? "Generating…" : "Generate with Pythia (billable)"}
      </button>
    </form>
    {generatedNotice && <p role="status">{generatedNotice}</p>}
    <div className="pythia-artifacts-heading"><div>
      <h3>Incoming from Pythia <span className="pythia-artifacts-count">{incoming.length}</span></h3>
      <p>Verified native SVG and GIF sources registered for this project. Retain a private original copy before authoring reuse.</p>
    </div></div>
    {incomingStatus === "loading" && <p role="status">Checking Pythia's native files…</p>}
    {incomingStatus === "unavailable" && <p>Native-file discovery is unavailable on this connection.</p>}
    {incomingStatus === "ready" && incoming.length === 0 && <p>No registered native files for this project yet.</p>}
    {incomingStatus === "ready" && incoming.map(item => <div className="pythia-artifact-item" key={item.artifact_id}>
      <div><strong>{item.mime_type === "image/svg+xml" ? "SVG vector" : item.animated ? "Animated GIF" : "GIF image"}</strong>
        <small>{item.artifact_id} · {Math.ceil(item.byte_size / 1024)} KB{item.frame_count ? ` · ${item.frame_count} frames` : ""}</small></div>
      <button type="button" className="button button-outline" disabled={importingNative}
        onClick={() => void importNativeSource(item.artifact_id)}>Retain in project</button>
    </div>)}
    <form className="pythia-native-import" onSubmit={event => { event.preventDefault(); void importNativeSource(); }}>
      <label htmlFor="pythia-native-source-id">Retrieve registered Pythia SVG / GIF original</label>
      <div className="pythia-native-import-controls">
        <input id="pythia-native-source-id" type="text" value={nativeSourceId}
          onChange={event => setNativeSourceId(event.target.value)} maxLength={120}
          placeholder="Pythia artifact ID" autoComplete="off" />
        <button className="button button-outline" type="submit" disabled={importingNative || !nativeSourceId.trim()}>
          {importingNative ? "Importing…" : "Import original"}
        </button>
      </div>
      <small>Use the artifact ID returned by Pythia's registered-file API. SVG previews are disabled for security; GIF downloads preserve the original frames.</small>
    </form>
    {loading && <p role="status">Checking saved artifacts…</p>}
    {error && <p role="alert">{error}</p>}
    {promotionNotice && <p role="status">{promotionNotice}</p>}
    {!loading && !error && visible.length === 0 && <p>No retained consultation artifacts yet. Completed answers and imported native assets will appear here.</p>}
    {visible.map(item => <div className="pythia-artifact-item" key={item.id}>
      <div><strong>{item.title}</strong><small>{item.type === "draft" ? `Draft · ${item.status}` : item.type === "markdown" ? "Exported answer" : item.type === "vector" ? "SVG vector · original only" : item.type === "animated-gif" ? `Animated GIF · ${item.frameCount ?? "?"} frames` : item.type === "gif" ? "GIF image" : "Completed consultation"} · {item.mimeType === "image/svg+xml" ? "SVG" : item.mimeType === "image/gif" ? "GIF" : item.type === "markdown" ? "Markdown" : "JSON"} · {Math.ceil(item.byteSize / 1024)} KB</small></div>
      {item.type === "advice" && item.turnId && <button type="button" className="button button-outline"
        disabled={exporting !== null}
        onClick={() => void exportMarkdown(item.turnId!)}>{exporting === item.turnId ? "Exporting…" : "Export Markdown"}</button>}
      {["vector", "gif", "animated-gif"].includes(item.type) &&
        <button type="button" className="button button-outline" disabled={promotingId !== null}
          onClick={() => void promoteNative(item.id)}>
          {promotingId === item.id ? "Promoting…" : "Add to media library"}
        </button>}
      <a className="button button-outline" href={`/api/projects/${encodeURIComponent(projectId)}/consultation-artifacts/${encodeURIComponent(item.id)}/download`} download={item.filename} aria-label={`Download ${item.title} original file`}><Download size={15} /> Download</a>
    </div>)}
    <div className="pythia-artifacts-heading"><div><h3>Engine drafts <span className="pythia-artifacts-count">{engineArtifacts.length}</span></h3>
      <p>Structured proposals from the Pythia Engine associated with this project. These are not generated media files or consultation attachments.</p></div></div>
    {engineStatus === "loading" && <p role="status">Checking Engine drafts…</p>}
    {engineStatus === "unavailable" && <p className="field-hint">Engine artifact discovery is unavailable on this connection. Your saved consultation exports remain accessible.</p>}
    {engineStatus === "ready" && engineArtifacts.length === 0 && <p className="field-hint">No Engine drafts found for this project.</p>}
    {engineStatus === "ready" && engineArtifacts.map(item => <div className="pythia-artifact-item" key={item.artifact_id}>
      <div><strong>{item.artifact_type.replaceAll("-", " ")}</strong><small>Engine draft · {item.status} · Version {item.artifact_version} · JSON envelope</small></div>
      <a className="button button-outline" href={`/api/projects/${encodeURIComponent(projectId)}/pythia-engine-artifacts/${encodeURIComponent(item.artifact_id)}/download`} download aria-label={`Download ${item.artifact_type} structured JSON`}><Download size={15} /> JSON</a>
    </div>)}
    <div className="pythia-artifacts-heading"><div><h3>Generated media <span className="pythia-artifacts-count">{mediaCandidates.length}</span></h3>
      <p>Existing Pythia-generated candidates. Recover original PNG or MP3 bytes only when the source is still retained and its checksum matches.</p></div></div>
    {mediaStatus === "loading" && <p role="status">Checking generated media…</p>}
    {mediaStatus === "unavailable" && <p>Media candidates are unavailable on this connection.</p>}
    {mediaStatus === "ready" && mediaCandidates.length === 0 && <p>No Pythia media candidates found for this project.</p>}
    {mediaStatus === "ready" && mediaCandidates.map(item => <div className="pythia-artifact-item" key={item.id}>
      <div><strong>{item.filename}</strong><small>{item.kind === "audio" ? "AI narration" : "Image"} · {item.status} · {Math.ceil(item.sizeBytes / 1024)} KB</small></div>
      <a className="button button-outline"
         href={`/api/projects/${encodeURIComponent(projectId)}/generated-candidates/${encodeURIComponent(item.id)}/asset`}
         download={item.filename} aria-label={`Download retained ${item.filename}`}><Download size={15} /> Saved copy</a>
      <a className="button button-outline"
         href={`/api/projects/${encodeURIComponent(projectId)}/generated-candidates/${encodeURIComponent(item.id)}/pythia-original`}
         download aria-label={`Recover Pythia source for ${item.filename}`}><Download size={15} /> Original</a>
    </div>)}
  </section>;
}
