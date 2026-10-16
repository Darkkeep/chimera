import { useEffect, useState } from "react";
import { AlertCircle, Check, LoaderCircle, Plus, Sparkles, X } from "lucide-react";
import { EditorDialog } from "./EditorDialog";
import type { Scene } from "./App";

type Capability = { id?: string; capability?: string; capability_id?: string; provider?: string } | string;
type EngineStatus = {
  health: { status?: string; version?: string };
  capabilities: { capabilities?: Capability[] | Record<string, Capability> };
  supportsAssessmentDesign: boolean;
  assessmentCapability?: string | null;
};
type ObjectiveDraft = { id: string; statement: string };
type AssessmentTask = { task_id: string; status: string; progress?: number; artifact_id?: string; source_revision?: number; source_scene_ids?: string[]; objective_ids?: string[]; capability?: string; error?: string };
type ProposedAssessmentItem = {
  proposal_item_id: string;
  target_scene_id: string;
  objective_ids: string[];
  item: { type: string; identifier: string; prompt: string; [field: string]: unknown };
  rationale: string;
  evidence_refs: string[];
};
type AssessmentBlueprint = {
  payload: {
    alignment: { objective_id: string; evidence: string; method: string; scoring: string; fairness: string }[];
    assumptions: string[];
    limitations: string[];
    review_questions: string[];
    ai_use_boundaries: string;
    proposed_items: ProposedAssessmentItem[];
  };
};
type SavedProposal = { id: string; targetSceneId: string | null; proposedValue: ProposedAssessmentItem["item"]; rationale: string; status: string; sourceArtifact: AssessmentBlueprint };

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

function capabilityRecords(value: EngineStatus["capabilities"]): { id: string }[] {
  const records = value.capabilities;
  if (Array.isArray(records)) return records.map((item) => {
    if (typeof item === "string") return { id: item };
    return { id: item.id || item.capability || item.capability_id || "" };
  });
  return records ? Object.entries(records).map(([id, item]) => typeof item === "string" ? { id } : { id: item.id || item.capability || item.capability_id || id }) : [];
}

export function PythiaAssessmentDesignView({ projectId, scene, scenes, onClose }: { projectId: string; scene: Scene; scenes: Scene[]; onClose: () => void }) {
  const [engine, setEngine] = useState<EngineStatus | null>(null);
  const [checking, setChecking] = useState(true);
  const [task, setTask] = useState<AssessmentTask | null>(null);
  const [sourceRevision, setSourceRevision] = useState<number | null>(null);
  const [sourceSceneIds, setSourceSceneIds] = useState<string[]>([]);
  const [objectives, setObjectives] = useState<ObjectiveDraft[]>([{ id: "", statement: "" }]);
  const [audience, setAudience] = useState("");
  const [difficulty, setDifficulty] = useState("application");
  const [completionRules, setCompletionRules] = useState("");
  const [blueprint, setBlueprint] = useState<AssessmentBlueprint | null>(null);
  const [proposals, setProposals] = useState<SavedProposal[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [pollRevision, setPollRevision] = useState(0);
  const [selectedSceneIds, setSelectedSceneIds] = useState<string[]>([scene.id]);

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
        const next = await requestJson<AssessmentTask>(`/api/projects/${projectId}/pythia-tasks/${encodeURIComponent(task.task_id)}`, controller.signal);
        if (next.status === "awaiting_review") {
          if (!next.artifact_id) throw new Error("Pythia completed without an artifact ID.");
          const revision = sourceRevision ?? next.source_revision;
          const selectedIds = sourceSceneIds.length > 0 ? sourceSceneIds : next.source_scene_ids ?? [];
          const objectiveIds = next.objective_ids ?? objectives.map((objective) => objective.id.trim()).filter(Boolean);
          if (revision === undefined || selectedIds.length === 0 || objectiveIds.length === 0) throw new Error("Assessment task is missing its source context.");
          const saved = await requestJson<SavedProposal[]>(
            `/api/projects/${projectId}/pythia-assessment-proposals`,
            controller.signal,
            "POST",
            {
              taskId: next.task_id,
              artifactId: next.artifact_id,
              sourceSceneIds: selectedIds,
              objectiveIds,
              sourceRevision: revision,
            },
          );
          const result = saved[0]?.sourceArtifact;
          if (!result) throw new Error("Saved assessment proposals are missing their source blueprint.");
          if (!controller.signal.aborted) { setTask(next); setProposals(saved); setBlueprint(result); }
        } else if (!controller.signal.aborted) {
          setTask(next);
          if (next.status === "failed") setError(typeof next.error === "string" ? next.error : "Assessment design failed.");
          if (next.status === "cancelled") setError("Assessment design was cancelled.");
        }
      } catch (issue) {
        if (!controller.signal.aborted) setError(issue instanceof Error ? issue.message : "Pythia task status is unavailable.");
      }
    }, 750);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [projectId, sourceRevision, sourceSceneIds, task, pollRevision, objectives]);

  async function submitDesign() {
    const objectiveValues = objectives.map((objective) => ({ id: objective.id.trim(), statement: objective.statement.trim() }));
    if (objectiveValues.length === 0 || objectiveValues.some((objective) => !objective.id || !objective.statement)) {
      setError("Enter an ID and statement for every objective.");
      return;
    }
    const orderedSceneIds = scenes.filter((item) => selectedSceneIds.includes(item.id)).map((item) => item.id);
    if (orderedSceneIds.length === 0) {
      setError("Select at least one scene.");
      return;
    }
    setSubmitting(true);
    setError("");
    setBlueprint(null);
    setProposals([]);
    try {
      const created = await requestJson<AssessmentTask>(
        `/api/projects/${projectId}/pythia-assessment-design`,
        undefined,
        "POST",
        {
          sceneIds: orderedSceneIds,
          objectives: objectiveValues,
          audience: audience.trim(),
          desiredDifficulty: difficulty,
          completionRules: completionRules.trim(),
          constraints: {},
        },
      );
      setSourceRevision(created.source_revision ?? null);
      setSourceSceneIds(created.source_scene_ids ?? orderedSceneIds);
      setTask(created);
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : "Assessment design could not be submitted.");
    } finally {
      setSubmitting(false);
    }
  }

  async function cancelTask() {
    if (!task) return;
    try {
      const cancelled = await requestJson<AssessmentTask>(`/api/projects/${projectId}/pythia-tasks/${encodeURIComponent(task.task_id)}/cancel`, undefined, "POST");
      setTask(cancelled);
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : "Pythia task could not be cancelled.");
    }
  }

  function updateObjective(index: number, update: Partial<ObjectiveDraft>) {
    setObjectives((current) => current.map((objective, currentIndex) => currentIndex === index ? { ...objective, ...update } : objective));
  }

  const capability = engine?.assessmentCapability || capabilityRecords(engine?.capabilities ?? { capabilities: [] }).find((entry) => ["assessment.design", "assessment.blueprint"].includes(entry.id))?.id;
  const canSubmit = Boolean(engine?.health.status === "ok" && engine.supportsAssessmentDesign && capability);
  const active = Boolean(task && ["submitted", "queued", "running"].includes(task.status));
  const selectedScenes = scenes.filter((item) => sourceSceneIds.includes(item.id) || selectedSceneIds.includes(item.id));
  const canStartTask = !task || ["failed", "cancelled"].includes(task.status);

  return <EditorDialog labelledBy="pythia-assessment-title" className="pythia-analysis-dialog" onClose={onClose} busy={submitting}>
    <div className="modal-head"><div><p className="eyebrow">PYTHIA ENGINE</p><h2 id="pythia-assessment-title">Design assessment</h2></div><button className="icon-button" onClick={onClose} disabled={submitting} aria-label="Close assessment design"><X size={19} /></button></div>
    <div className="pythia-scene-label"><span>ACTIVE SCENE</span><strong>{scene.title}</strong></div>
    <section className="pythia-engine-state" role="status">
      {checking ? <><LoaderCircle className="pythia-spinner" size={17} /> Checking Engine API</> : engine?.health.status === "ok" ? <><Check size={17} /> Engine online</> : <><AlertCircle size={17} /> Engine unavailable</>}
      {capability && <span>{capability}</span>}
    </section>
    {canStartTask && <div className="enhancement-submission-scroll">
      <fieldset className="enhancement-choice-group" disabled={submitting}>
        <legend>Scenes</legend>
        <div className="enhancement-choice-list">{scenes.map((item, index) => <label key={item.id}><input type="checkbox" checked={selectedSceneIds.includes(item.id)} onChange={(event) => setSelectedSceneIds((current) => event.target.checked ? [...current, item.id] : current.filter((id) => id !== item.id))} /><span><strong>{item.title}</strong><small>Scene {index + 1}</small></span></label>)}</div>
      </fieldset>
      <fieldset className="enhancement-choice-group"><legend>Objectives</legend>{objectives.map((objective, index) => <div className="enhancement-submit-grid" key={`objective-${index}`}>
        <label className="enhancement-form-field">Objective ID<input value={objective.id} maxLength={120} onChange={(event) => updateObjective(index, { id: event.target.value })} /></label>
        <label className="enhancement-form-field enhancement-goal-field">Statement<input value={objective.statement} maxLength={2000} onChange={(event) => updateObjective(index, { statement: event.target.value })} /></label>
        {objectives.length > 1 && <button className="icon-button" aria-label="Remove objective" onClick={() => setObjectives((current) => current.filter((_, currentIndex) => currentIndex !== index))}><X size={14} /></button>}
      </div>)}<button className="button button-outline" onClick={() => setObjectives((current) => [...current, { id: "", statement: "" }])} disabled={submitting}><Plus size={14} /> Add objective</button></fieldset>
      <div className="enhancement-submit-grid">
        <label className="enhancement-form-field">Audience<input value={audience} maxLength={500} onChange={(event) => setAudience(event.target.value)} /></label>
        <label className="enhancement-form-field">Desired difficulty<select value={difficulty} onChange={(event) => setDifficulty(event.target.value)}><option value="recall">Recall</option><option value="understanding">Understanding</option><option value="application">Application</option><option value="analysis">Analysis</option></select></label>
      </div>
      <label className="enhancement-form-field">Completion rules<textarea rows={2} maxLength={2000} value={completionRules} onChange={(event) => setCompletionRules(event.target.value)} /></label>
      <div className="pythia-submit-row"><button className="button button-accent" onClick={() => void submitDesign()} disabled={checking || submitting || !canSubmit || !audience.trim() || !completionRules.trim() || selectedSceneIds.length === 0}><Sparkles size={16} /> {task ? "Run assessment design again" : "Design assessment"}</button></div>
    </div>}
    {task && <section className="pythia-task-state" aria-live="polite"><div><strong>{proposals.length > 0 ? `${proposals.length} draft item${proposals.length === 1 ? "" : "s"} saved for review` : task.status === "failed" ? "Assessment design failed" : task.status === "cancelled" ? "Assessment design cancelled" : "Assessment design in progress"}</strong><span>{task.progress !== undefined ? `${task.progress}%` : task.status}</span></div>{task.progress !== undefined && <progress max="100" value={task.progress} />}{active && <button className="button button-outline" onClick={() => void cancelTask()}>Cancel task</button>}</section>}
    {error && <div className="pythia-error" role="alert"><AlertCircle size={17} /><span>{error}</span>{active && <button className="button button-outline" onClick={() => { setError(""); setPollRevision((revision) => revision + 1); }}>Retry polling</button>}</div>}
    {blueprint && <div className="pythia-proposal">
      <div className="pythia-proposal-heading"><span>DRAFT ASSESSMENT BLUEPRINT</span><span>Source revision {sourceRevision}</span></div>
      <section className="pythia-result-section"><h3>Objective alignment<span>{blueprint.payload.alignment.length}</span></h3><ul>{blueprint.payload.alignment.map((item) => <li key={`${item.objective_id}-${item.method}`}><strong>{item.objective_id}</strong><p>{item.evidence} · {item.method} · {item.scoring}</p><p>{item.fairness}</p></li>)}</ul></section>
      <section className="pythia-result-section"><h3>Draft items<span>{proposals.length}</span></h3><ul>{proposals.map((proposal) => <li key={proposal.id}><strong>{proposal.proposedValue.prompt}</strong><p>{proposal.proposedValue.type} · {proposal.proposedValue.identifier}</p><p>{proposal.rationale}</p><p>Scene: {selectedScenes.find((item) => item.id === proposal.targetSceneId)?.title ?? proposal.targetSceneId}</p></li>)}</ul></section>
      {blueprint.payload.assumptions.length > 0 && <section className="pythia-result-section"><h3>Assumptions<span>{blueprint.payload.assumptions.length}</span></h3><ul>{blueprint.payload.assumptions.map((item, index) => <li key={`assumption-${index}`}>{item}</li>)}</ul></section>}
      {blueprint.payload.limitations.length > 0 && <section className="pythia-result-section"><h3>Limitations<span>{blueprint.payload.limitations.length}</span></h3><ul>{blueprint.payload.limitations.map((item, index) => <li key={`limitation-${index}`}>{item}</li>)}</ul></section>}
      {blueprint.payload.review_questions.length > 0 && <section className="pythia-result-section"><h3>Review questions<span>{blueprint.payload.review_questions.length}</span></h3><ul>{blueprint.payload.review_questions.map((item, index) => <li key={`question-${index}`}>{item}</li>)}</ul></section>}
      <p className="pythia-readonly-note">Saved to Review suggestions. Questions are not added to the storyboard until accepted.</p>
    </div>}
  </EditorDialog>;
}