import { useEffect, useState } from "react";
import { AlertCircle, Check, LoaderCircle, Sparkles, X } from "lucide-react";
import { EditorDialog } from "./EditorDialog";
import { reportOnboardingOutcome } from "./onboarding-journeys";
import type { Scene } from "./App";
import "./pythia-analysis.css";

type Capability = { id?: string; capability?: string; capability_id?: string; provider?: string };
type CapabilityEntry = Capability | string;
type EngineStatus = { health: { status?: string; version?: string }; capabilities: { capabilities?: CapabilityEntry[] | Record<string, CapabilityEntry> }; supportsStoryboardAnalyze: boolean };
type Task = { task_id: string; status: string; progress?: number; artifact_id?: string; source_revision?: number; error?: string };
type AnalysisFinding = {
  id: string;
  category: string;
  statement: string;
  evidence_refs: string[];
  uncertainty: string;
};
type AnalysisRecommendation = { id: string; statement: string; finding_refs: string[] };
type AnalysisPayload = {
  project_id: string;
  scene_id: string;
  source_refs: unknown[];
  findings: AnalysisFinding[];
  recommendations: AnalysisRecommendation[];
  uncertainties: unknown[];
  review_questions: unknown[];
};
type ArtifactEnvelope = { payload: AnalysisPayload };
type AnalysisProposal = { id: string; status: "pending" | "accepted" | "rejected"; sourceRevision: number };

async function requestJson<T>(path: string, signal?: AbortSignal, method = "GET", payload?: unknown): Promise<T> {
  const response = await fetch(path, {
    method,
    signal,
    headers: method === "POST" ? { "Content-Type": "application/json" } : undefined,
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });
  const body = await response.json().catch(() => null) as { detail?: unknown } | null;
  if (!response.ok) throw new Error(typeof body?.detail === "string" ? body.detail : `Request failed (${response.status}).`);
  return body as T;
}

function capabilityRecords(value: EngineStatus["capabilities"]): Capability[] {
  const records = value.capabilities;
  if (Array.isArray(records)) return records.map((entry) => typeof entry === "string" ? { id: entry } : entry);
  return records ? Object.entries(records).map(([id, details]) => typeof details === "string" ? { id, provider: details } : { id, ...details }) : [];
}

function itemLabel(item: unknown): string {
  if (typeof item === "string") return item;
  if (item && typeof item === "object") {
    const record = item as Record<string, unknown>;
    for (const key of ["title", "summary", "text", "finding", "recommendation", "question", "description"]) {
      if (typeof record[key] === "string") return record[key] as string;
    }
  }
  return JSON.stringify(item, null, 2);
}

function AnalysisList({ title, items }: { title: string; items: unknown[] }) {
  return <section className="pythia-result-section"><h3>{title}<span>{items.length}</span></h3>{items.length ? <ul>{items.map((item, index) => <li key={`${title}-${index}`}>{itemLabel(item)}</li>)}</ul> : <p className="pythia-empty-list">None returned</p>}</section>;
}

function FindingList({ items }: { items: AnalysisFinding[] }) {
  return <section className="pythia-result-section"><h3>Findings<span>{items.length}</span></h3>{items.length ? <ul>{items.map((finding) => <li key={finding.id}>
    <p>{finding.statement}</p>
    <small>{finding.id} · {finding.category}</small>
    {finding.evidence_refs.length > 0 && <p><strong>Evidence:</strong> {finding.evidence_refs.join(" · ")}</p>}
    <p><strong>Uncertainty:</strong> {finding.uncertainty}</p>
  </li>)}</ul> : <p className="pythia-empty-list">None returned</p>}</section>;
}

function RecommendationList({ items }: { items: AnalysisRecommendation[] }) {
  return <section className="pythia-result-section"><h3>Recommendations<span>{items.length}</span></h3>{items.length ? <ul>{items.map((recommendation) => <li key={recommendation.id}>
    <p>{recommendation.statement}</p>
    <small>{recommendation.id}</small>
    {recommendation.finding_refs.length > 0 && <p><strong>Related findings:</strong> {recommendation.finding_refs.join(" · ")}</p>}
  </li>)}</ul> : <p className="pythia-empty-list">None returned</p>}</section>;
}

export function PythiaAnalysisView({ projectId, scene, onClose }: { projectId: string; scene: Scene; onClose: () => void }) {
  const [engine, setEngine] = useState<EngineStatus | null>(null);
  const [checking, setChecking] = useState(true);
  const [task, setTask] = useState<Task | null>(null);
  const [artifact, setArtifact] = useState<ArtifactEnvelope | null>(null);
  const [proposal, setProposal] = useState<AnalysisProposal | null>(null);
  const [sourceRevision, setSourceRevision] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [pollRevision, setPollRevision] = useState(0);
  const [statusRevision, setStatusRevision] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setChecking(true);
    requestJson<EngineStatus>(`/api/projects/${projectId}/pythia-status`, controller.signal)
      .then(setEngine)
      .catch((issue) => { if (!controller.signal.aborted) setError(issue instanceof Error ? issue.message : "Pythia status unavailable."); })
      .finally(() => { if (!controller.signal.aborted) setChecking(false); });
    return () => controller.abort();
  }, [projectId, statusRevision]);

  useEffect(() => {
    if (!task || !["submitted", "queued", "running"].includes(task.status)) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const next = await requestJson<Task>(`/api/projects/${projectId}/pythia-tasks/${encodeURIComponent(task.task_id)}`, controller.signal);
        if (next.status === "awaiting_review") {
          if (!next.artifact_id) throw new Error("Pythia completed without an artifact ID.");
          const result = await requestJson<ArtifactEnvelope>(
            `/api/projects/${projectId}/scenes/${scene.id}/pythia-artifacts/${encodeURIComponent(next.artifact_id)}`,
            controller.signal,
          );
          const analyzedRevision = sourceRevision ?? next.source_revision;
          if (analyzedRevision === undefined) throw new Error("Pythia task is missing its source storyboard revision.");
          const reviewProposal = await requestJson<AnalysisProposal>(
            `/api/projects/${projectId}/pythia-analysis-proposals`,
            controller.signal,
            "POST",
            {
              taskId: next.task_id,
              artifactId: next.artifact_id,
              sceneId: scene.id,
              sourceRevision: analyzedRevision,
            },
          );
          if (!controller.signal.aborted) {
            setTask(next); setArtifact(result); setProposal(reviewProposal);
            reportOnboardingOutcome("pythia.analysis.saved", projectId, scene.id);
          }
        } else if (!controller.signal.aborted) {
          setTask(next);
          if (next.status === "failed") setError(typeof next.error === "string" ? next.error : next.error ? JSON.stringify(next.error) : "Pythia analysis failed.");
          if (next.status === "cancelled") setError("Pythia analysis was cancelled.");
        }
      } catch (issue) {
        if (!controller.signal.aborted) setError(issue instanceof Error ? issue.message : "Pythia task status is unavailable.");
      }
    }, 750);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [projectId, scene.id, sourceRevision, task, pollRevision]);

  async function submitAnalysis() {
    setSubmitting(true);
    setError("");
    setTask(null);
    setArtifact(null);
    try {
      const created = await requestJson<Task>(`/api/projects/${projectId}/scenes/${scene.id}/pythia-analysis`, undefined, "POST");
      setSourceRevision(created.source_revision ?? null);
      setTask(created);
      setProposal(null);
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : "Pythia analysis could not be submitted.");
    } finally {
      setSubmitting(false);
    }
  }

  async function cancelTask() {
    if (!task) return;
    setError("");
    try {
      const cancelled = await requestJson<Task>(`/api/projects/${projectId}/pythia-tasks/${encodeURIComponent(task.task_id)}/cancel`, undefined, "POST");
      setTask(cancelled);
      if (cancelled.status === "cancelled") reportOnboardingOutcome("pythia.task.cancelled", projectId, scene.id);
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : "Pythia task could not be cancelled.");
    }
  }

  const capabilities = engine ? capabilityRecords(engine.capabilities) : [];
  const active = Boolean(task && ["submitted", "queued", "running"].includes(task.status));
  const canSubmit = Boolean(engine?.health?.status === "ok" && engine.supportsStoryboardAnalyze);
  const payload = artifact?.payload;

  return <EditorDialog onboardingTarget="pythia.analysis" labelledBy="pythia-analysis-title" className="pythia-analysis-dialog" onClose={onClose} busy={submitting}>
    <div className="modal-head"><div><p className="eyebrow">PYTHIA ENGINE</p><h2 id="pythia-analysis-title">Analyze with Pythia</h2></div><button className="icon-button" onClick={onClose} disabled={submitting} aria-label="Close Pythia analysis"><X size={19} /></button></div>
    <div className="pythia-scene-label"><span>SCENE {scene.id}</span><strong>{scene.title}</strong></div>
    <section className="pythia-engine-state" role="status">
      {checking ? <><LoaderCircle className="pythia-spinner" size={17} /> Checking Engine API</> : engine?.health?.status === "ok" ? <><Check size={17} /> Engine online</> : <><AlertCircle size={17} /> Engine unavailable</>}
      {engine?.health?.version && <span>v{engine.health.version}</span>}
    </section>
    {capabilities.length > 0 && <div className="pythia-capabilities" aria-label="Discovered Pythia capabilities">{capabilities.map((item, index) => {
      const id = item.id || item.capability || item.capability_id || "Capability";
      return <span className={id === "storyboard.analyze" ? "available" : ""} key={`${id}-${index}`}>{id}{item.provider ? ` · ${item.provider}` : ""}</span>;
    })}</div>}
    {!task && <div className="pythia-submit-row"><button className="button button-accent" onClick={() => void submitAnalysis()} disabled={checking || submitting || !canSubmit}><Sparkles size={16} /> Analyze selected scene</button></div>}
    {task && <section className="pythia-task-state" aria-live="polite"><div><strong>{task.status === "awaiting_review" ? "Draft ready for review" : task.status === "failed" ? "Analysis failed" : task.status === "cancelled" ? "Analysis cancelled" : "Analysis in progress"}</strong><span>{task.progress !== undefined ? `${task.progress}%` : task.status}</span></div>{task.progress !== undefined && <progress max="100" value={task.progress} />}{active && <button className="button button-outline" onClick={() => void cancelTask()}>Cancel task</button>}{["failed", "cancelled"].includes(task.status) && <button className="button button-outline" onClick={() => void submitAnalysis()} disabled={submitting || !canSubmit}>Analyze again</button>}</section>}
    {error && <div className="pythia-error" role="alert"><AlertCircle size={17} /><span>{error}</span>{(active || !task) && <button className="button button-outline" onClick={() => { setError(""); if (active) setPollRevision((revision) => revision + 1); else setStatusRevision((revision) => revision + 1); }}>{active ? "Retry polling" : "Retry connection"}</button>}</div>}
    {payload && <div className="pythia-proposal"><div className="pythia-proposal-heading"><span>DRAFT PROPOSAL</span><span>Scene {payload.scene_id}</span></div>
      <FindingList items={payload.findings} />
      <RecommendationList items={payload.recommendations} />
      <AnalysisList title="Uncertainties" items={payload.uncertainties} />
      <AnalysisList title="Review questions" items={payload.review_questions} />
      <section className="pythia-result-section"><h3>Source references<span>{payload.source_refs.length}</span></h3>{payload.source_refs.length ? <ul>{payload.source_refs.map((item, index) => <li key={`source-${index}`}>{itemLabel(item)}</li>)}</ul> : <p className="pythia-empty-list">No source references returned</p>}</section>
      <p className="pythia-readonly-note">{proposal ? `Saved to Review suggestions · ${proposal.status} · source revision ${proposal.sourceRevision}` : "Saving this draft for review..."} Recommendations are not applied to the storyboard.</p>
    </div>}
  </EditorDialog>;
}