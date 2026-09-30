import { useEffect, useState } from "react";
import { Check, ImagePlus, Mic, RefreshCw, Sparkles, X } from "lucide-react";
import type { Project, Scene } from "./App";
import "./generated-media.css";

type Candidate = {
  id: string;
  jobId: string;
  sceneId: string;
  kind: "image" | "audio";
  status: "pending" | "approved" | "rejected";
  filename: string;
  purpose: string;
  prompt: string;
  script: string;
  altText: string;
  provider: string | null;
  model: string | null;
};

type Props = { project: Project; scene: Scene | undefined; busy: boolean; onProjectUpdated: (project: Project) => void };

export function GeneratedMediaPanel({ project, scene, busy, onProjectUpdated }: Props) {
  const [kind, setKind] = useState<"image" | "narration">("image");
  const [purpose, setPurpose] = useState("");
  const [prompt, setPrompt] = useState("");
  const [style, setStyle] = useState("");
  const [width, setWidth] = useState(1024);
  const [height, setHeight] = useState(1024);
  const [script, setScript] = useState("");
  const [voice, setVoice] = useState("alloy");
  const [altText, setAltText] = useState("");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");

  async function loadCandidates() {
    if (!project.id) return;
    const response = await fetch(`/api/projects/${project.id}/generated-candidates`);
    if (response.ok) setCandidates(await response.json() as Candidate[]);
  }

  useEffect(() => {
    void loadCandidates();
    if (!project.id) return;
    const timer = window.setInterval(() => void loadCandidates(), 3000);
    return () => window.clearInterval(timer);
  }, [project.id]);

  async function generate() {
    if (!scene || !purpose.trim() || (kind === "image" ? !prompt.trim() : !script.trim())) return;
    setWorking(true); setError("");
    try {
      const response = await fetch(`/api/projects/${project.id}/media-generation-jobs`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, sceneId: scene.id, purpose, style, width: kind === "image" ? width : null, height: kind === "image" ? height : null, prompt: kind === "image" ? prompt : "", script, voice: kind === "narration" ? voice : null, altText }),
      });
      if (!response.ok) throw new Error((await response.json().catch(() => null) as { detail?: string } | null)?.detail || "Media generation could not be started.");
      setPurpose(""); setPrompt(""); setScript(""); setAltText("");
      await loadCandidates();
    } catch (generationError) { setError(generationError instanceof Error ? generationError.message : "Media generation could not be started."); }
    finally { setWorking(false); }
  }

  async function decide(candidate: Candidate, decision: "approve" | "reject") {
    setWorking(true); setError("");
    try {
      const response = await fetch(`/api/projects/${project.id}/generated-candidates/${candidate.id}/${decision}`, {
        method: "POST", headers: decision === "approve" ? { "If-Match": `"${project.storyboard.revision}"` } : undefined,
      });
      const result = await response.json().catch(() => null) as { project?: Project; detail?: string } | null;
      if (!response.ok) throw new Error(result?.detail || "Candidate decision could not be saved.");
      if (result?.project) onProjectUpdated(result.project);
      await loadCandidates();
    } catch (decisionError) { setError(decisionError instanceof Error ? decisionError.message : "Candidate decision could not be saved."); }
    finally { setWorking(false); }
  }

  async function regenerate(candidate: Candidate) {
    setWorking(true); setError("");
    try {
      const response = await fetch(`/api/projects/${project.id}/generated-candidates/${candidate.id}/regenerate`, { method: "POST" });
      if (!response.ok) throw new Error((await response.json().catch(() => null) as { detail?: string } | null)?.detail || "Candidate regeneration could not be started.");
      await loadCandidates();
    } catch (regenerationError) { setError(regenerationError instanceof Error ? regenerationError.message : "Candidate regeneration could not be started."); }
    finally { setWorking(false); }
  }

  const visibleCandidates = candidates.filter((candidate) => !scene || candidate.sceneId === scene.id);
  return <section className="generated-media-panel" aria-labelledby="generated-media-title">
    <div className="generated-media-heading"><div><p className="eyebrow">AUTHOR CONTROLLED GENERATION</p><h3 id="generated-media-title">Create a media candidate</h3><span className="field-hint">Generation never attaches media to a scene automatically.</span></div><Sparkles size={18} /></div>
    <div className="generated-media-form">
      <label>Scene<select value={scene?.id || ""} disabled><option>{scene?.title || "Select a scene first"}</option></select></label>
      <label>Media type<select value={kind} onChange={(event) => setKind(event.target.value as "image" | "narration")}><option value="image">Image</option><option value="narration">Narration</option></select></label>
      <label>Purpose<input value={purpose} onChange={(event) => setPurpose(event.target.value)} placeholder="What should this support?" /></label>
      {kind === "image" ? <><label>Prompt<textarea rows={3} value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="Describe the proposed image" /></label><label>Style<input value={style} onChange={(event) => setStyle(event.target.value)} placeholder="e.g. clean technical illustration" /></label><label className="generated-media-dimensions"><span>Dimensions</span><span><input type="number" min="64" max="4096" value={width} onChange={(event) => setWidth(Number(event.target.value))} /><input type="number" min="64" max="4096" value={height} onChange={(event) => setHeight(Number(event.target.value))} /></span></label></> : <><label>Narration script<textarea rows={3} value={script} onChange={(event) => setScript(event.target.value)} placeholder="Write the narration to generate" /></label><label>Voice<input value={voice} onChange={(event) => setVoice(event.target.value)} placeholder="Provider voice" /></label></>}
      {kind === "image" && <label>Alt text<input value={altText} onChange={(event) => setAltText(event.target.value)} placeholder="Describe the image for learners" /></label>}
      <button className="button button-accent" onClick={() => void generate()} disabled={busy || working || !scene || !purpose.trim() || (kind === "image" ? !prompt.trim() : !script.trim())}>{kind === "image" ? <ImagePlus size={15} /> : <Mic size={15} />} Generate candidate</button>
    </div>
    {error && <p className="export-error" role="alert">{error}</p>}
    {visibleCandidates.length > 0 && <div className="generated-candidate-list"><h4>Candidate review</h4>{visibleCandidates.map((candidate) => <article className="generated-candidate" key={candidate.id}><div className="generated-candidate-preview">{candidate.kind === "image" ? <img src={`/api/projects/${project.id}/generated-candidates/${candidate.id}/asset`} alt={candidate.altText || candidate.filename} /> : <audio controls src={`/api/projects/${project.id}/generated-candidates/${candidate.id}/asset`} />}</div><div><strong>{candidate.filename}</strong><small>{candidate.kind} · {candidate.provider || "provider"} {candidate.model || ""}</small><span>{candidate.status === "pending" ? "Awaiting asset and placement approval" : candidate.status}</span></div>{candidate.status === "pending" && <div className="generated-candidate-actions"><button className="button button-accent" onClick={() => void decide(candidate, "approve")} disabled={working}><Check size={14} /> Approve asset</button><button className="button button-outline" onClick={() => void regenerate(candidate)} disabled={working}><RefreshCw size={14} /> Regenerate</button><button className="button button-outline" onClick={() => void decide(candidate, "reject")} disabled={working}><X size={14} /> Reject</button></div>}</article>)}</div>}
    {working && <span className="field-hint"><RefreshCw size={13} /> Working…</span>}
  </section>;
}
