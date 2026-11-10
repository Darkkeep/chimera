import { useEffect, useState } from "react";
import { Download, FolderOpen, RefreshCw } from "lucide-react";

type Artifact = {
  id: string;
  sessionId: string;
  turnId: string | null;
  type: "advice" | "draft";
  title: string;
  filename: string;
  mimeType: string;
  byteSize: number;
  sha256: string;
  status: string;
  origin: string;
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

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    getArtifacts(projectId, controller.signal)
      .then(items => { setArtifacts(items); setError(""); })
      .catch(issue => { if (!controller.signal.aborted) setError(issue instanceof Error ? issue.message : "Artifacts unavailable"); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [projectId, sessionId, refreshKey, revision]);

  const visible = artifacts.filter(item => showAll || item.sessionId === sessionId);
  return <section className="pythia-consultation-artifacts" aria-label="Consultation artifacts">
    <div className="pythia-artifacts-heading">
      <div><h3><FolderOpen size={18} aria-hidden="true" /> Artifacts <span className="pythia-artifacts-count">{artifacts.filter(a => a.sessionId === sessionId).length}</span></h3>
        <p>Saved structured Pythia answers and content drafts. Downloadable JSON records, not generated PDF or media files.</p></div>
      <button type="button" className="button button-outline" onClick={() => setRevision(value => value + 1)} disabled={loading} aria-label="Refresh artifacts"><RefreshCw size={15} /> Refresh</button>
    </div>
    <label className="pythia-artifacts-filter"><input type="checkbox" checked={showAll} onChange={event => setShowAll(event.target.checked)} /> Include previous consultations in this project</label>
    {loading && <p role="status">Checking saved artifacts…</p>}
    {error && <p role="alert">{error}</p>}
    {!loading && !error && visible.length === 0 && <p>No downloadable structured records yet. Completed answers and content drafts will appear here; Pythia-generated media is not connected yet.</p>}
    {visible.map(item => <div className="pythia-artifact-item" key={item.id}>
      <div><strong>{item.title}</strong><small>{item.type === "draft" ? `Draft · ${item.status}` : "Completed consultation"} · JSON · {Math.ceil(item.byteSize / 1024)} KB</small></div>
      <a className="button button-outline" href={`/api/projects/${encodeURIComponent(projectId)}/consultation-artifacts/${encodeURIComponent(item.id)}/download`} download={item.filename} aria-label={`Download ${item.title} JSON`}><Download size={15} /> Download</a>
    </div>)}
  </section>;
}
