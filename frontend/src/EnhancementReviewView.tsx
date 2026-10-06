import { reportOnboardingOutcome } from "./onboarding-journeys";
import { ChangeEvent, useEffect, useState } from "react";
import { Check, FileUp, RotateCw, Sparkles, X } from "lucide-react";
import type { Project } from "./App";
import { revisionConflictMessage, storyboardWriteHeaders } from "./revision";
import "./enhancement-review.css";
import "./enhancement-proposal-details.css";
import "./enhancement-submission.css";

type EnhancementProposalChange = {
  targetSceneId: string | null;
  field: string;
  beforeValue: unknown;
  proposedValue: unknown;
};

type EnhancementProposal = {
  id: string;
  targetSceneId: string | null;
  field: string;
  beforeValue: unknown;
  proposedValue: unknown;
  changes: EnhancementProposalChange[];
  sourceRevision: number;
  affectedIds: string[];
  dependencyGroupId: string | null;
  referenceCitations: { resourceId: string; version: string | null; locator: string | null; excerpt: string | null }[];
  rationale: string;
  origin: "ai" | "author";
  provider: string | null;
  model: string | null;
  status: "pending" | "accepted" | "rejected" | "stale" | "superseded" | "reversed";
  createdAt: string;
  decidedAt: string | null;
  decisionHistory: { decision: string; decidedAt: string; expectedRevision: number }[];
};

type EnhancementProposalResult = { proposal: EnhancementProposal; project: Project | null };
type ReferenceResource = {
  id: string;
  title: string;
  classification: string;
  authoritative: boolean;
  sceneIds: string[];
  currentVersion: string;
  versions: { version: string; filename: string; extractionStatus: string; extractionMessage: string | null; passages: { locator: string; text: string }[] }[];
};
type EnhancementJob = {
  id: string;
  sourceRevision: number;
  scope: "selected-scenes" | "whole-course";
  sceneIds: string[];
  goal: string;
  resourceIds: string[];
  resourceVersions: Record<string, string>;
  status: "queued" | "running" | "completed" | "cancelled" | "failed";
  progress: number;
  message: string;
  provider: string | null;
  model: string | null;
  estimatedInputTokens: number | null;
  estimatedCostUsd: number | null;
  proposalIds: string[];
  resourceConflicts: { explanation: string; citations: { resourceId: string; version: string | null; locator: string | null; excerpt: string | null }[] }[];
  error: string | null;
  retryOf: string | null;
};
type JobRequest = { scope: "selected-scenes" | "whole-course"; sceneIds: string[]; goal: string; resourceIds: string[] };
type SubmissionPreview = { sourceRevision: number; sceneCount: number; resourceCount: number; estimatedInputTokens: number; estimatedCostUsd: number | null; providerConfigured: boolean; payload: { scenes: { id: string; title: string; learnerText: string[]; actionDescription: string; narration: string; assessmentItem: unknown }[]; references: { id: string; title: string; version: string; passages: { locator: string; text: string }[] }[] } };

type EnhancementReviewViewProps = {
  project: Project;
  onClose: () => void;
  onProjectUpdated: (project: Project) => void;
};

export function EnhancementReviewView({ project, onClose, onProjectUpdated }: EnhancementReviewViewProps) {
  const [proposals, setProposals] = useState<EnhancementProposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyProposalId, setBusyProposalId] = useState("");
  const [editingProposalId, setEditingProposalId] = useState("");
  const [changeDrafts, setChangeDrafts] = useState<Record<string, string[]>>({});
  const [resources, setResources] = useState<ReferenceResource[]>([]);
  const [jobs, setJobs] = useState<EnhancementJob[]>([]);
  const [scope, setScope] = useState<JobRequest["scope"]>("whole-course");
  const [selectedSceneIds, setSelectedSceneIds] = useState<string[]>([]);
  const [selectedResourceIds, setSelectedResourceIds] = useState<string[]>([]);
  const [goal, setGoal] = useState("Improve clarity and alignment with the selected references.");
  const [preview, setPreview] = useState<SubmissionPreview | null>(null);
  const [jobBusy, setJobBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    fetch(`/api/projects/${project.id}/enhancement-proposals`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Enhancement suggestions could not be loaded.");
        return response.json() as Promise<EnhancementProposal[]>;
      })
      .then(setProposals)
      .catch((loadError: unknown) => {
        if (loadError instanceof Error && loadError.name !== "AbortError") setError(loadError.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [project.id]);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      fetch(`/api/projects/${project.id}/reference-resources`, { signal: controller.signal }),
      fetch(`/api/projects/${project.id}/enhancement-jobs`, { signal: controller.signal }),
    ]).then(async ([resourceResponse, jobResponse]) => {
      if (!resourceResponse.ok || !jobResponse.ok) throw new Error("Enhancement resources or jobs could not be loaded.");
      const [loadedResources, loadedJobs] = await Promise.all([
        resourceResponse.json() as Promise<ReferenceResource[]>,
        jobResponse.json() as Promise<EnhancementJob[]>,
      ]);
      setResources(loadedResources);
      setJobs(loadedJobs);
    }).catch((loadError: unknown) => {
      if (loadError instanceof Error && loadError.name !== "AbortError") setError(loadError.message);
    });
    return () => controller.abort();
  }, [project.id]);

  const hasActiveJobs = jobs.some((job) => job.status === "queued" || job.status === "running");
  useEffect(() => {
    if (!hasActiveJobs) return;
    const timer = window.setInterval(() => {
      fetch(`/api/projects/${project.id}/enhancement-jobs`)
        .then(async (response) => response.ok ? response.json() as Promise<EnhancementJob[]> : [])
        .then((updatedJobs) => {
          setJobs(updatedJobs);
          if (updatedJobs.some((job) => job.status === "completed")) {
            fetch(`/api/projects/${project.id}/enhancement-proposals`)
              .then((response) => response.ok ? response.json() as Promise<EnhancementProposal[]> : [])
              .then(setProposals);
          }
        })
        .catch(() => undefined);
    }, 1800);
    return () => window.clearInterval(timer);
  }, [hasActiveJobs, project.id]);

  function jobRequest(): JobRequest {
    return {
      scope,
      sceneIds: scope === "selected-scenes" ? selectedSceneIds : [],
      goal: goal.trim(),
      resourceIds: selectedResourceIds,
    };
  }

  async function previewSubmission() {
    setError("");
    setJobBusy(true);
    try {
      const response = await fetch(`/api/projects/${project.id}/enhancement-jobs/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(jobRequest()),
      });
      const result = await response.json().catch(() => null) as SubmissionPreview & { detail?: string } | null;
      if (!response.ok || !result) throw new Error(result?.detail || "Submission preview could not be created.");
      setPreview(result);
    } catch (previewError) {
      setError(previewError instanceof Error ? previewError.message : "Submission preview could not be created.");
      setPreview(null);
    } finally {
      setJobBusy(false);
    }
  }

  async function submitEnhancement() {
    setJobBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/projects/${project.id}/enhancement-jobs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(jobRequest()),
      });
      const result = await response.json().catch(() => null) as EnhancementJob & { detail?: string } | null;
      if (!response.ok || !result) throw new Error(result?.detail || "Enhancement job could not be submitted.");
      setJobs((current) => [result, ...current.filter((job) => job.id !== result.id)]);
      setPreview(null);
      reportOnboardingOutcome("enhancement.submitted", project.id);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Enhancement job could not be submitted.");
    } finally {
      setJobBusy(false);
    }
  }

  async function uploadReference(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    setJobBusy(true);
    setError("");
    const form = new FormData();
    form.append("file", file);
    form.append("title", file.name.replace(/\.[^.]+$/, ""));
    form.append("scene_ids", JSON.stringify(scope === "selected-scenes" ? selectedSceneIds : []));
    try {
      const response = await fetch(`/api/projects/${project.id}/reference-resources`, { method: "POST", body: form });
      const resource = await response.json().catch(() => null) as ReferenceResource & { detail?: string } | null;
      if (!response.ok || !resource) throw new Error(resource?.detail || "Reference resource could not be uploaded.");
      setResources((current) => [resource, ...current]);
      if (resource.versions.at(-1)?.extractionStatus === "complete") setSelectedResourceIds((current) => [...current, resource.id]);
      reportOnboardingOutcome("reference.uploaded", project.id);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Reference resource could not be uploaded.");
    } finally {
      input.value = "";
      setJobBusy(false);
    }
  }

  async function updateJob(jobId: string, action: "cancel" | "retry") {
    setJobBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/projects/${project.id}/enhancement-jobs/${jobId}/${action}`, { method: "POST" });
      const result = await response.json().catch(() => null) as EnhancementJob & { detail?: string } | null;
      if (!response.ok || !result) throw new Error(result?.detail || `Could not ${action} enhancement job.`);
      setJobs((current) => [result, ...current.filter((job) => job.id !== result.id)]);
      reportOnboardingOutcome("enhancement.job-updated", project.id);
    } catch (jobError) {
      setError(jobError instanceof Error ? jobError.message : `Could not ${action} enhancement job.`);
    } finally {
      setJobBusy(false);
    }
  }

  async function decide(proposalId: string, decision: "accept" | "reject" | "reverse") {
    if (busyProposalId) return;
    setBusyProposalId(proposalId);
    setError("");
    try {
      const proposal = proposals.find((item) => item.id === proposalId);
      const editedValues = editingProposalId === proposalId ? changeDrafts[proposalId] : undefined;
      const proposalChanges = proposal ? (proposal.changes.length > 0 ? proposal.changes : [{
        targetSceneId: proposal.targetSceneId,
        field: proposal.field,
        beforeValue: proposal.beforeValue,
        proposedValue: proposal.proposedValue,
      }]) : [];
      const changes = decision === "accept" && proposal && editedValues ? proposalChanges.map((change, index) => ({
        targetSceneId: change.targetSceneId,
        field: change.field,
        proposedValue: typeof change.proposedValue === "string"
          ? editedValues[index]
          : JSON.parse(editedValues[index]),
      })) : undefined;
      const response = await fetch(`/api/projects/${project.id}/enhancement-proposals/${proposalId}/decision`, {
        method: "POST",
        headers: storyboardWriteHeaders(project.storyboard.revision),
        body: JSON.stringify({ decision, ...(decision === "accept" && changes ? { changes } : {}) }),
      });
      if (!response.ok) {
        const detail = await response.json().catch(() => null) as { detail?: string } | null;
        const conflictMessage = revisionConflictMessage(response.status);
        if (conflictMessage) throw new Error(conflictMessage);
        throw new Error(detail?.detail || "Suggestion could not be reviewed.");
      }
      const result = await response.json() as EnhancementProposalResult;
      setProposals((current) => current.map((proposal) => proposal.id === result.proposal.id ? result.proposal : proposal));
      if (result.project) onProjectUpdated(result.project);
      setEditingProposalId("");
      reportOnboardingOutcome("suggestion.decided", project.id);
    } catch (decisionError) {
      setError(decisionError instanceof Error ? decisionError.message : "Suggestion could not be reviewed.");
      if (decisionError instanceof Error && decisionError.message.includes("stale")) {
        setProposals((current) => current.map((proposal) => proposal.id === proposalId ? { ...proposal, status: "stale" } : proposal));
      }
    } finally {
      setBusyProposalId("");
    }
  }

  const pendingCount = proposals.filter((proposal) => proposal.status === "pending").length;
  function displayValue(value: unknown): string {
    if (typeof value === "string") return value || "Empty";
    return JSON.stringify(value, null, 2) ?? "Empty";
  }

  function beginEditing(proposal: EnhancementProposal) {
    const proposalChanges = proposal.changes.length > 0 ? proposal.changes : [{
      targetSceneId: proposal.targetSceneId,
      field: proposal.field,
      beforeValue: proposal.beforeValue,
      proposedValue: proposal.proposedValue,
    }];
    setChangeDrafts((current) => ({
      ...current,
      [proposal.id]: proposalChanges.map((change) => typeof change.proposedValue === "string"
        ? change.proposedValue
        : JSON.stringify(change.proposedValue, null, 2) ?? "null"),
    }));
    setEditingProposalId(proposal.id);
  }

  return <div className="assessment-editor-backdrop" onMouseDown={(event) => event.target === event.currentTarget && !busyProposalId && onClose()}>
    <section data-onboarding="review.enhancement" className="enhancement-review-dialog" role="dialog" aria-modal="true" aria-labelledby="enhancement-review-title">
      <header className="assessment-editor-header">
        <div><p className="eyebrow">AUTHOR APPROVAL · {pendingCount} PENDING</p><h2 id="enhancement-review-title">Storyboard suggestions</h2></div>
        <button className="icon-button" onClick={onClose} disabled={Boolean(busyProposalId)} aria-label="Close suggestion review"><X size={18} /></button>
      </header>
      {error && <p className="assessment-editor-error enhancement-review-error" role="alert">{error}</p>}
      <div className="enhancement-submission-scroll">
        <section className="enhancement-submission" aria-labelledby="enhancement-submit-title">
          <div className="enhancement-section-heading"><div><p className="eyebrow">STEP 9 · SUBMIT FOR REVIEW</p><h3 id="enhancement-submit-title">New enhancement run</h3></div><label className="button button-outline enhancement-upload-button"><FileUp size={14} /> Add reference<input type="file" accept=".pdf,.docx,.pptx,.txt,.md" onChange={(event) => void uploadReference(event)} disabled={jobBusy} /></label></div>
          <div className="enhancement-submit-grid">
            <label className="enhancement-form-field">Scope<select value={scope} onChange={(event) => { setScope(event.target.value as JobRequest["scope"]); setPreview(null); }}><option value="whole-course">Whole course</option><option value="selected-scenes">Selected scenes</option></select></label>
            <label className="enhancement-form-field enhancement-goal-field">Enhancement goal<textarea value={goal} maxLength={2000} rows={2} onChange={(event) => { setGoal(event.target.value); setPreview(null); }} /></label>
          </div>
          {scope === "selected-scenes" && <fieldset className="enhancement-choice-group"><legend>Scenes</legend><div className="enhancement-choice-list">{project.storyboard.scenes.map((scene) => <label key={scene.id}><input type="checkbox" checked={selectedSceneIds.includes(scene.id)} onChange={(event) => { setSelectedSceneIds((current) => event.target.checked ? [...current, scene.id] : current.filter((id) => id !== scene.id)); setPreview(null); }} /><span>{scene.title}</span></label>)}</div></fieldset>}
          <fieldset className="enhancement-choice-group"><legend>Permitted references</legend>{resources.length === 0 ? <p className="enhancement-inline-empty">No references added</p> : <div className="enhancement-choice-list">{resources.map((resource) => {
            const currentVersion = resource.versions.find((version) => version.version === resource.currentVersion);
            return <label key={resource.id} className="enhancement-resource-choice"><input type="checkbox" checked={selectedResourceIds.includes(resource.id)} disabled={currentVersion?.extractionStatus !== "complete"} onChange={(event) => { setSelectedResourceIds((current) => event.target.checked ? [...current, resource.id] : current.filter((id) => id !== resource.id)); setPreview(null); }} /><span><strong>{resource.title}</strong><small>{resource.classification} · v{resource.currentVersion}{resource.authoritative ? " · authoritative" : ""} · {currentVersion?.extractionStatus ?? "unavailable"}</small>{currentVersion?.extractionMessage && <small className="enhancement-resource-warning">{currentVersion.extractionMessage}</small>}</span></label>;
          })}</div>}</fieldset>
          <div className="enhancement-submit-actions"><button className="button button-outline" onClick={() => void previewSubmission()} disabled={jobBusy || !goal.trim() || (scope === "selected-scenes" && selectedSceneIds.length === 0)}><Sparkles size={14} /> Preview submission</button>{preview && <button className="button button-accent" onClick={() => void submitEnhancement()} disabled={jobBusy || !preview.providerConfigured} title={!preview.providerConfigured ? "Configure the server-side AI provider to submit." : "Submit this exact selection for proposal generation."}>Submit run</button>}</div>
          {preview && <div className="enhancement-submission-preview" role="status"><div><strong>Revision {preview.sourceRevision}</strong><span>{preview.sceneCount} scene{preview.sceneCount === 1 ? "" : "s"} · {preview.resourceCount} reference{preview.resourceCount === 1 ? "" : "s"} · about {preview.estimatedInputTokens.toLocaleString()} input tokens{preview.estimatedCostUsd === null ? "" : ` · estimated $${preview.estimatedCostUsd.toFixed(4)}`}</span></div>{!preview.providerConfigured && <p className="enhancement-resource-warning">Server-side AI provider is not configured. Add provider settings on the server before submitting.</p>}<details><summary>Inspect submitted content</summary><pre>{JSON.stringify(preview.payload, null, 2)}</pre></details></div>}
          {jobs.length > 0 && <div className="enhancement-job-list"><h4>Enhancement jobs</h4>{jobs.map((job) => <article className={`enhancement-job ${job.status}`} key={job.id}><div className="enhancement-job-heading"><strong>{job.status}</strong><span>Revision {job.sourceRevision}{job.provider ? ` · ${job.provider}${job.model ? ` / ${job.model}` : ""}` : ""}</span></div><p>{job.message}</p>{job.error && <p className="enhancement-resource-warning">{job.error}</p>}{job.resourceConflicts.map((conflict, index) => <section className="enhancement-resource-conflict" key={`${job.id}-conflict-${index}`}><strong>Reference conflict</strong><p>{conflict.explanation}</p><ul>{conflict.citations.map((citation, citationIndex) => <li key={`${citation.resourceId}-${citationIndex}`}>{citation.resourceId}{citation.version ? ` · v${citation.version}` : ""}{citation.locator ? ` · ${citation.locator}` : ""}{citation.excerpt ? `: “${citation.excerpt}”` : ""}</li>)}</ul></section>)}<div className="enhancement-job-meter" role="progressbar" aria-label={`${job.status} progress`} aria-valuenow={job.progress} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${job.progress}%` }} /></div><div className="enhancement-job-footer"><span>{job.estimatedInputTokens ? `~${job.estimatedInputTokens.toLocaleString()} tokens` : ""}{job.estimatedCostUsd === null ? "" : ` · ~$${job.estimatedCostUsd.toFixed(4)}`}{job.proposalIds.length ? ` · ${job.proposalIds.length} proposals` : ""}</span>{(job.status === "queued" || job.status === "running") && <button className="button button-outline" onClick={() => void updateJob(job.id, "cancel")} disabled={jobBusy}>Cancel</button>}{(job.status === "failed" || job.status === "cancelled") && <button className="button button-outline" onClick={() => void updateJob(job.id, "retry")} disabled={jobBusy}><RotateCw size={13} /> Retry</button>}</div></article>)}</div>}
        </section>
      </div>
      {loading ? <p className="enhancement-review-empty" role="status">Loading suggestions…</p> : proposals.length === 0
        ? <div className="enhancement-review-empty"><strong>No suggestions yet</strong><span>Enhancements will appear here for individual review. Nothing changes until you accept it.</span></div>
        : <div className="enhancement-proposal-list">{proposals.map((proposal) => {
          const targetScene = project.storyboard.scenes.find((scene) => scene.id === proposal.targetSceneId);
          const proposalChanges = proposal.changes.length > 0 ? proposal.changes : [{
            targetSceneId: proposal.targetSceneId,
            field: proposal.field,
            beforeValue: proposal.beforeValue,
            proposedValue: proposal.proposedValue,
          }];
          return <article className={`enhancement-proposal ${proposal.status}`} key={proposal.id}>
            <div className="enhancement-proposal-heading"><div><span className="enhancement-proposal-status">{proposal.status}</span><h3>{targetScene?.title ?? (proposal.targetSceneId ? "Scene no longer exists" : "Storyboard change")}</h3><span className="enhancement-proposal-field">{proposalChanges.length} change{proposalChanges.length === 1 ? "" : "s"} · source revision {proposal.sourceRevision}{proposal.dependencyGroupId ? ` · group ${proposal.dependencyGroupId}` : ""}</span></div><span className="enhancement-proposal-origin">{proposal.origin === "ai" ? `AI suggestion · ${proposal.referenceCitations.length ? "source-backed" : "ungrounded"}` : "Author suggestion"}{proposal.provider ? ` · ${proposal.provider}` : ""}{proposal.model ? ` / ${proposal.model}` : ""}</span></div>
            <p className="enhancement-proposal-rationale">{proposal.rationale}</p>
            {proposalChanges.map((change, index) => <section className="enhancement-proposal-change" key={`${change.targetSceneId ?? "storyboard"}-${change.field}-${index}`}>
              <div className="enhancement-proposal-field">{change.field.replace(/[A-Z]/g, (letter) => ` ${letter.toLowerCase()}`)}{change.targetSceneId ? ` · ${project.storyboard.scenes.find((scene) => scene.id === change.targetSceneId)?.title ?? "Missing scene"}` : " · storyboard"}</div>
              {editingProposalId === proposal.id ? <label className="enhancement-proposal-editor"><span>Suggested value{typeof change.proposedValue !== "string" ? " · JSON" : ""}</span><textarea value={changeDrafts[proposal.id]?.[index] ?? ""} onChange={(event) => setChangeDrafts((current) => ({ ...current, [proposal.id]: (current[proposal.id] ?? []).map((value, draftIndex) => draftIndex === index ? event.target.value : value) }))} rows={Math.min(8, Math.max(3, (changeDrafts[proposal.id]?.[index]?.split("\n").length ?? 3)))} /></label>
                : <dl className="enhancement-proposal-values"><div><dt>Current</dt><dd>{displayValue(change.beforeValue)}</dd></div><div><dt>Suggested</dt><dd>{displayValue(change.proposedValue)}</dd></div></dl>}
            </section>)}
            {proposal.referenceCitations.length > 0 && <ul className="enhancement-proposal-citations">{proposal.referenceCitations.map((citation, index) => <li key={`${citation.resourceId}-${index}`}>{citation.resourceId}{citation.version ? ` · v${citation.version}` : ""}{citation.locator ? ` · ${citation.locator}` : ""}{citation.excerpt ? `: “${citation.excerpt}”` : ""}</li>)}</ul>}
            {proposal.status === "pending" && <div className="enhancement-proposal-actions">
              <button className="button button-outline" onClick={() => void decide(proposal.id, "reject")} disabled={Boolean(busyProposalId)} title="Reject this suggestion without changing the storyboard."><X size={14} /> Reject</button>
              {editingProposalId === proposal.id ? <button className="button button-outline" onClick={() => setEditingProposalId("")} disabled={Boolean(busyProposalId)}>Cancel edit</button>
                : <button className="button button-outline" onClick={() => beginEditing(proposal)} disabled={Boolean(busyProposalId)}>Edit values</button>}
              <button className="button button-accent" onClick={() => void decide(proposal.id, "accept")} disabled={Boolean(busyProposalId)} title="Apply this suggestion to the storyboard and save a history snapshot."><Check size={14} /> Accept change</button>
            </div>}
            {proposal.status === "accepted" && <div className="enhancement-proposal-actions"><button className="button button-outline" onClick={() => void decide(proposal.id, "reverse")} disabled={Boolean(busyProposalId)} title="Restore the captured prior values if they have not since changed."><X size={14} /> Undo acceptance</button></div>}
          </article>;
        })}</div>}
    </section>
  </div>;
}
