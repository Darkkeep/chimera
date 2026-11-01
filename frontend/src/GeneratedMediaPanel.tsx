import { reportOnboardingOutcome } from "./onboarding-journeys";
import { useEffect, useState } from "react";
import { Check, ChevronRight, ImagePlus, Mic, Video, RefreshCw, Sparkles, X } from "lucide-react";
import type { Project, Scene } from "./App";
import type { MediaConnectionOption, MediaKind } from "./media-connections";
import "./generated-media.css";

type Candidate = {
  id: string;
  jobId: string;
  sceneId: string;
  kind: "image" | "audio" | "video";
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
type NarrationConnection = { id: string; name: string; provider: string; voice: string; model: string; language: string };
type Capability = { providerConfigured: boolean; canGenerate: boolean; imageConfigured?: boolean; videoConfigured?: boolean; videoUnavailableReason?: string; connectionOptions?: MediaConnectionOption[]; defaultConnections?: Partial<Record<MediaKind, string | null>>; narrationConnections?: NarrationConnection[] };

export function GeneratedMediaPanel({ project, scene, busy, onProjectUpdated }: Props) {
  const [kind, setKind] = useState<"image" | "narration" | "video">("image");
  const [connectionId, setConnectionId] = useState("");
  const [purpose, setPurpose] = useState("");
  const [prompt, setPrompt] = useState("");
  const [style, setStyle] = useState("");
  const [width, setWidth] = useState(1024);
  const [height, setHeight] = useState(1024);
  const [script, setScript] = useState("");
  const [voice, setVoice] = useState("");
  const [narrationConnectionId, setNarrationConnectionId] = useState("");
  const [language, setLanguage] = useState("en-US");
  const [altText, setAltText] = useState("");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [capability, setCapability] = useState<Capability | null>(null);
  const [capabilityError, setCapabilityError] = useState(false);
  const [connectionVersion, setConnectionVersion] = useState(0);
  const [creatorOpen, setCreatorOpen] = useState(false);
  const generationEnabled = Boolean(capability?.providerConfigured && capability.canGenerate);
  const imageConfigured = capability?.imageConfigured ?? capability?.providerConfigured ?? false;
  const narrationConnections = capability?.narrationConnections ?? (capability?.providerConfigured ? [{ id: "legacy-openai", name: "Legacy OpenAI narration", provider: "openai", voice: "alloy", model: "", language: "en-US" }] : []);
  const connectionOptions = (capability?.connectionOptions ?? []).filter(item => item.readyFor.includes(kind));
  const selectedConnection = connectionOptions.find(item => item.id === connectionId);
  const selectedNarration = narrationConnections.find(connection => connection.id === narrationConnectionId);
  const canCreate = generationEnabled && !busy && !working && scene && purpose.trim() &&
    selectedConnection && (kind !== "narration" ? prompt.trim() : script.trim() && voice.trim() && language.trim());

  useEffect(() => {
    if (!capability) return;
    const preferred = capability.defaultConnections?.[kind];
    if (!connectionId && preferred) {
      setConnectionId(preferred);
      const option = capability.connectionOptions?.find(item => item.id === preferred);
      if (kind === "narration" && option) { setNarrationConnectionId(preferred); setVoice(option.voice); setLanguage(option.language); }
    }
    if (!imageConfigured) setKind("narration");
    if (narrationConnectionId && !narrationConnections.some(connection => connection.id === narrationConnectionId)) {
      setNarrationConnectionId(""); setVoice("");
    }
  }, [capability, narrationConnectionId, connectionId, kind]);

  useEffect(() => {
    if (!generationEnabled) setCreatorOpen(false);
  }, [generationEnabled]);

  useEffect(() => {
    let alive = true;
    setCapability(null);
    setCapabilityError(false);
    if (!project.id) return;
    fetch(`/api/projects/${project.id}/media-generation-capability`).then(async (response) => {
      if (!response.ok) throw new Error("Media provider status unavailable");
      return response.json() as Promise<Capability>;
    }).then((result) => { if (alive) setCapability(result); }).catch(() => { if (alive) setCapabilityError(true); });
    return () => { alive = false; };
  }, [project.id, connectionVersion]);

  useEffect(() => {
    const refresh = () => setConnectionVersion(version => version + 1);
    window.addEventListener("chimera:ai-connection-updated", refresh);
    return () => window.removeEventListener("chimera:ai-connection-updated", refresh);
  }, []);

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
    if (!canCreate || !scene) return;
    setWorking(true); setError("");
    try {
      const response = await fetch(`/api/projects/${project.id}/media-generation-jobs`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, connectionId, sceneId: scene.id, purpose, style, width: kind !== "narration" ? width : null, height: kind !== "narration" ? height : null, prompt: kind !== "narration" ? prompt : "", ...(kind === "video" ? { durationSeconds: 4 } : {}), script, voice: kind === "narration" ? voice : null, altText, ...(kind === "narration" ? { narrationConnectionId, language } : {}) }),
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
      reportOnboardingOutcome("candidate.decided", project.id, candidate.id);
      await loadCandidates();
    } catch (decisionError) { setError(decisionError instanceof Error ? decisionError.message : "Candidate decision could not be saved."); }
    finally { setWorking(false); }
  }

  async function regenerate(candidate: Candidate) {
    if (!generationEnabled || busy || working) return;
    setWorking(true); setError("");
    try {
      const response = await fetch(`/api/projects/${project.id}/generated-candidates/${candidate.id}/regenerate`, { method: "POST" });
      if (!response.ok) throw new Error((await response.json().catch(() => null) as { detail?: string } | null)?.detail || "Candidate regeneration could not be started.");
      await loadCandidates();
      reportOnboardingOutcome("candidate.regenerated", project.id, candidate.id);
    } catch (regenerationError) { setError(regenerationError instanceof Error ? regenerationError.message : "Candidate regeneration could not be started."); }
    finally { setWorking(false); }
  }

  const visibleCandidates = candidates.filter((candidate) => !scene || candidate.sceneId === scene.id);
  return <section data-onboarding="media.generated" className="generated-media-panel" aria-labelledby="generated-media-title">
    <details className={`generation-creator${generationEnabled ? "" : " is-unavailable"}`} open={creatorOpen && generationEnabled} onToggle={event => setCreatorOpen(event.currentTarget.open && generationEnabled)}>
    <summary className="generated-media-heading" aria-disabled={!generationEnabled} onClick={event => {
      if (!generationEnabled) event.preventDefault();
    }} onKeyDown={event => {
      if (!generationEnabled && (event.key === "Enter" || event.key === " ")) event.preventDefault();
    }}><Sparkles size={18} /><h2 id="generated-media-title">Create a media candidate</h2>{!generationEnabled && <span className="generation-availability">{capabilityError ? "AI status unavailable" : !project.id ? "No project selected" : !capability ? "Checking media provider..." : !capability.providerConfigured ? "AI not configured" : "Generation access unavailable"}</span>}<ChevronRight size={18} className="generation-chevron" /></summary>
    <fieldset className="generated-media-form" disabled={!generationEnabled || busy || working} aria-label="Media candidate settings">
      <label>Scene<select value={scene?.id || ""} disabled><option>{scene?.title || "Select a scene first"}</option></select></label>
      <label>Media type<select value={kind} onChange={(event) => { const value = event.target.value as typeof kind; setKind(value); setConnectionId(""); setNarrationConnectionId(""); if (value === "video") { setWidth(1280); setHeight(720); } else if (value === "image") { setWidth(1024); setHeight(1024); } }}><option value="image" disabled={!imageConfigured}>Image</option><option value="narration" disabled={narrationConnections.length === 0}>Narration</option><option value="video" disabled={!capability?.videoConfigured}>Video clip · 4 seconds</option></select></label>
      {kind !== "narration" && <label>AI connection<select value={selectedConnection ? connectionId : ""} onChange={event => setConnectionId(event.target.value)}><option value="">Select a configured connection</option>{connectionOptions.map(item => <option key={item.id} value={item.id}>{item.name} · {item.models[kind] || item.provider}</option>)}</select></label>}
      <label>Purpose<input value={purpose} onChange={(event) => setPurpose(event.target.value)} placeholder="What should this support?" /></label>
      {kind !== "narration" ? <><label>Prompt<textarea rows={3} value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder={kind === "video" ? "Describe a short video clip" : "Describe the proposed image"} /></label><label>Style<input value={style} onChange={(event) => setStyle(event.target.value)} placeholder="e.g. clean technical illustration" /></label><div className="generated-media-dimensions"><span>{kind === "video" ? "4 seconds · MP4 · AI-generated" : "Dimensions"}</span><span><input aria-label="Media width" disabled={kind === "video"} type="number" min="64" max="4096" value={width} onChange={(event) => setWidth(Number(event.target.value))} /><input aria-label="Media height" disabled={kind === "video"} type="number" min="64" max="4096" value={height} onChange={(event) => setHeight(Number(event.target.value))} /></span></div></> : <><label>Narration connection<select value={selectedNarration ? narrationConnectionId : ""} onChange={event => {
        const connection = narrationConnections.find(item => item.id === event.target.value);
        setConnectionId(connection?.id || ""); setNarrationConnectionId(connection?.id || ""); setVoice(connection?.voice || ""); setLanguage(connection?.language || "en-US");
      }}><option value="">Select a narration connection</option>{narrationConnections.map(connection => <option value={connection.id} key={connection.id}>{connection.name} · {connection.provider}</option>)}</select></label><label>Narration script<textarea rows={3} value={script} onChange={(event) => setScript(event.target.value)} placeholder="Write the narration to generate" /></label><label>Voice<input value={voice} onChange={(event) => setVoice(event.target.value)} placeholder="Provider voice" disabled={!selectedNarration} /></label><label>Language<input value={language} onChange={event => setLanguage(event.target.value)} disabled={!selectedNarration} /></label><p className="field-hint">AI-generated voice · MP3. Select a connection to use its default voice, or override the voice for this request.</p></>}
      {kind === "image" && <label>Alt text<input value={altText} onChange={(event) => setAltText(event.target.value)} placeholder="Describe the image for learners" /></label>}
      <button className="button button-accent" onClick={() => void generate()} disabled={!canCreate}>{kind === "image" ? <ImagePlus size={15} /> : kind === "video" ? <Video size={15} /> : <Mic size={15} />} Generate candidate</button>
    </fieldset>
    </details>
    {capability?.videoUnavailableReason && !capability.videoConfigured && <p className="field-hint">Video generation: {capability.videoUnavailableReason}</p>}
    {error && <p className="export-error" role="alert">{error}</p>}
    {visibleCandidates.length > 0 && <div className="generated-candidate-list"><h4>Candidate review</h4>{visibleCandidates.map((candidate) => <article className="generated-candidate" key={candidate.id}><div className="generated-candidate-preview">{candidate.kind === "image" ? <img src={`/api/projects/${project.id}/generated-candidates/${candidate.id}/asset`} alt={candidate.altText || candidate.filename} /> : candidate.kind === "video" ? <video controls playsInline preload="metadata" aria-label="AI-generated video candidate" src={`/api/projects/${project.id}/generated-candidates/${candidate.id}/asset`} /> : <audio controls aria-label="AI-generated narration candidate" src={`/api/projects/${project.id}/generated-candidates/${candidate.id}/asset`} />}</div><div><strong>{candidate.filename}</strong><small>{candidate.kind} · {candidate.provider || "provider"} {candidate.model || ""}</small><span>{candidate.status === "pending" ? "Awaiting asset and placement approval" : candidate.status}</span></div>{candidate.status === "pending" && <div className="generated-candidate-actions"><button className="button button-accent" onClick={() => void decide(candidate, "approve")} disabled={working}><Check size={14} /> Approve asset</button><button className="button button-outline" onClick={() => void regenerate(candidate)} disabled={!generationEnabled || working || busy}><RefreshCw size={14} /> Regenerate</button><button className="button button-outline" onClick={() => void decide(candidate, "reject")} disabled={working}><X size={14} /> Reject</button></div>}</article>)}</div>}
    {working && <span className="field-hint"><RefreshCw size={13} /> Working…</span>}
  </section>;
}
