import { useEffect, useState } from "react";
import { AlertCircle, Check, LoaderCircle, Sparkles, X } from "lucide-react";
import { EditorDialog } from "./EditorDialog";
import { reportOnboardingOutcome } from "./onboarding-journeys";
import type { Scene } from "./App";

type EngineStatus = {
  health: { status?: string; version?: string };
  capabilities: { capabilities?: Capability[] | Record<string, Capability | string> };
  supportsStoryboardTransform: boolean;
};
type Capability = { id?: string; capability?: string; capability_id?: string; provider?: string } | string;
type Task = { task_id: string; status: string; progress?: number; artifact_id?: string; source_revision?: number; source_scene_ids?: string[]; error?: string };
type ProposedScene = {
  proposal_scene_id: string;
  source_scene_ids: string[];
  purpose: string;
  title: string;
  learner_content: string[];
  interaction_recommendation: string;
  production_notes: string;
  media_requirements: string[];
  assessment_opportunities: string[];
  rationale: string;
};
type TransformProposal = {
  id: string;
  status: "pending" | "accepted" | "rejected" | "stale";
  sourceRevision: number;
  artifact: { payload: { rationale: string; proposed_scenes: ProposedScene[] } };
};

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

function capabilityRecords(value: EngineStatus["capabilities"]): (Exclude<Capability, string> & { id: string })[] {
  const records = value.capabilities;
  if (Array.isArray(records)) return records.map((item) => {
    if (typeof item === "string") return { id: item };
    return { ...item, id: item.id || item.capability || item.capability_id || "" };
  });
  return records ? Object.entries(records).map(([id, item]) => typeof item === "string" ? { id, provider: item } : { ...item, id }) : [];
}

export function PythiaTransformView({ projectId, scene, scenes, onClose }: { projectId: string; scene: Scene; scenes: Scene[]; onClose: () => void }) {
  const [engine, setEngine] = useState<EngineStatus | null>(null);
  const [checking, setChecking] = useState(true);
  const [task, setTask] = useState<Task | null>(null);
  const [sourceRevision, setSourceRevision] = useState<number | null>(null);
  const [sourceSceneIds, setSourceSceneIds] = useState<string[]>([]);
  const [selectedSceneIds, setSelectedSceneIds] = useState<string[]>([scene.id]);
  const [proposal, setProposal] = useState<TransformProposal | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [pollRevision, setPollRevision] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    requestJson<EngineStatus>(`/api/projects/${projectId}/pythia-status`, controller.signal)
      .then(setEngine)
      .catch((issue) => { if (!controller.signal.aborted) setError(issue instanceof Error ? issue.message : "Pythia status unavailable."); })
      .finally(() => { if (!controller.signal.aborted) setChecking(false); });
    return () => controller.abort();
  }, [projectId]);

  useEffect(() => {
    if (!task || !["submitted", "queued", "running"].includes(task.status)) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const next = await requestJson<Task>(`/api/projects/${projectId}/pythia-tasks/${encodeURIComponent(task.task_id)}`, controller.signal);
        if (next.status === "awaiting_review") {
          if (!next.artifact_id) throw new Error("Pythia completed without an artifact ID.");
          const revision = sourceRevision ?? next.source_revision;
          if (revision === undefined) throw new Error("Pythia task is missing its source storyboard revision.");
          const submittedSceneIds = sourceSceneIds.length > 0 ? sourceSceneIds : next.source_scene_ids ?? [];
          if (submittedSceneIds.length === 0) throw new Error("Pythia task is missing its selected source scenes.");
          const saved = await requestJson<TransformProposal>(
            `/api/projects/${projectId}/pythia-transform-proposals`,
            controller.signal,
            "POST",
            {
              taskId: next.task_id,
              artifactId: next.artifact_id,
              sourceSceneIds: submittedSceneIds,
              sourceRevision: revision,
            },
          );
          if (!controller.signal.aborted) {
            setTask(next); setProposal(saved);
            reportOnboardingOutcome("pythia.transform.saved", projectId, scene.id);
          }
        } else if (!controller.signal.aborted) {
          setTask(next);
          if (next.status === "failed") setError(typeof next.error === "string" ? next.error : "Pythia transformation failed.");
          if (next.status === "cancelled") setError("Pythia transformation was cancelled.");
        }
      } catch (issue) {
        if (!controller.signal.aborted) setError(issue instanceof Error ? issue.message : "Pythia task status is unavailable.");
      }
    }, 750);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [projectId, scene.id, sourceRevision, sourceSceneIds, task, pollRevision]);

  async function submitTransform() {
    setSubmitting(true);
    setError("");
    setProposal(null);
    setTask(null);
    const orderedSceneIds = scenes.filter((item) => selectedSceneIds.includes(item.id)).map((item) => item.id);
    if (orderedSceneIds.length === 0) {
      setError("Select at least one scene to transform.");
      setSubmitting(false);
      return;
    }
    setSourceSceneIds(orderedSceneIds);
    try {
      const created = await requestJson<Task>(
        `/api/projects/${projectId}/pythia-transform`,
        undefined,
        "POST",
        { sceneIds: orderedSceneIds, constraints: {} },
      );
      setSourceRevision(created.source_revision ?? null);
      setSourceSceneIds(created.source_scene_ids ?? orderedSceneIds);
      setTask(created);
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : "Pythia transformation could not be submitted.");
    } finally {
      setSubmitting(false);
    }
  }

  async function cancelTask() {
    if (!task) return;
    try {
      const cancelled = await requestJson<Task>(`/api/projects/${projectId}/pythia-tasks/${encodeURIComponent(task.task_id)}/cancel`, undefined, "POST");
      setTask(cancelled);
      if (cancelled.status === "cancelled") reportOnboardingOutcome("pythia.task.cancelled", projectId, scene.id);
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : "Pythia task could not be cancelled.");
    }
  }

  const active = Boolean(task && ["submitted", "queued", "running"].includes(task.status));
  const capabilities = engine ? capabilityRecords(engine.capabilities) : [];
  const transformAdvertised = capabilities.some((item) => item.id === "storyboard.transform");
  const canSubmit = Boolean(engine?.health.status === "ok" && engine.supportsStoryboardTransform && transformAdvertised);
  const canStartTask = !task || ["failed", "cancelled"].includes(task.status);
  const selectedScenes = scenes.filter((item) => sourceSceneIds.includes(item.id) || selectedSceneIds.includes(item.id));
  const selectionLocked = Boolean(task && !["failed", "cancelled"].includes(task.status));

  return <EditorDialog onboardingTarget="pythia.transform" labelledBy="pythia-transform-title" className="pythia-analysis-dialog" onClose={onClose} busy={submitting}>
    <div className="modal-head"><div><p className="eyebrow">PYTHIA ENGINE</p><h2 id="pythia-transform-title">Transform selected scene</h2></div><button className="icon-button" onClick={onClose} disabled={submitting} aria-label="Close Pythia transformation"><X size={19} /></button></div>
    <div className="pythia-scene-label"><span>ACTIVE SCENE</span><strong>{scene.title}</strong></div>
    <section className="pythia-engine-state" role="status">
      {checking ? <><LoaderCircle className="pythia-spinner" size={17} /> Checking Engine API</> : engine?.health.status === "ok" ? <><Check size={17} /> Engine online</> : <><AlertCircle size={17} /> Engine unavailable</>}
      {engine?.health.version && <span>v{engine.health.version}</span>}
    </section>
    <fieldset className="enhancement-choice-group" disabled={selectionLocked || submitting}>
      <legend>Scenes to transform</legend>
      <div className="enhancement-choice-list">{scenes.map((item, index) => <label key={item.id}>
        <input type="checkbox" checked={selectedSceneIds.includes(item.id)} onChange={(event) => setSelectedSceneIds((current) => event.target.checked ? [...current, item.id] : current.filter((id) => id !== item.id))} />
        <span><strong>{item.title}</strong><small>Scene {index + 1}</small></span>
      </label>)}</div>
    </fieldset>
    {task && <section className="pythia-task-state" aria-live="polite"><div><strong>{proposal ? "Draft saved for review" : task.status === "failed" ? "Transformation failed" : task.status === "cancelled" ? "Transformation cancelled" : "Transformation in progress"}</strong><span>{task.progress !== undefined ? `${task.progress}%` : task.status}</span></div>{task.progress !== undefined && <progress max="100" value={task.progress} />}{active && <button className="button button-outline" onClick={() => void cancelTask()}>Cancel task</button>}</section>}
    {canStartTask && <div className="pythia-submit-row"><button className="button button-accent" onClick={() => void submitTransform()} disabled={checking || submitting || !canSubmit || selectedSceneIds.length === 0}><Sparkles size={16} /> {task ? "Run transformation again" : "Propose transformation"}</button></div>}
    {error && <div className="pythia-error" role="alert"><AlertCircle size={17} /><span>{error}</span>{active && <button className="button button-outline" onClick={() => { setError(""); setPollRevision((revision) => revision + 1); }}>Retry polling</button>}</div>}
    {proposal && <div className="pythia-proposal">
      <div className="pythia-proposal-heading"><span>DRAFT TRANSFORMATION</span><span>Source revision {proposal.sourceRevision}</span></div>
      <p>{proposal.artifact.payload.rationale}</p>
      <section className="pythia-result-section"><h3>Current<span>{selectedScenes.length} scenes</span></h3><ul>{selectedScenes.map((item) => <li key={item.id}><strong>{item.title}</strong><p>{item.extractedText.join("\n") || "No learner text"}</p></li>)}</ul></section>
      <section className="pythia-result-section"><h3>Proposed sequence<span>{proposal.artifact.payload.proposed_scenes.length} scenes</span></h3>{proposal.artifact.payload.proposed_scenes.map((item) => <article key={item.proposal_scene_id}>
        <small>{item.purpose}</small><h4>{item.title}</h4><ul>{item.learner_content.map((line, index) => <li key={`${item.proposal_scene_id}-${index}`}>{line}</li>)}</ul>
        <p><strong>Interaction:</strong> {item.interaction_recommendation}</p><p><strong>Production:</strong> {item.production_notes}</p>
        {item.media_requirements.length > 0 && <p><strong>Media:</strong> {item.media_requirements.join("; ")}</p>}
        {item.assessment_opportunities.length > 0 && <p><strong>Assessment:</strong> {item.assessment_opportunities.join("; ")}</p>}
      </article>)}</section>
      <p className="pythia-readonly-note">Saved to Review suggestions. It will not replace the current scene unless you accept it there.</p>
    </div>}
  </EditorDialog>;
}