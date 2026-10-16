import { useEffect, useState } from "react";
import { AlertCircle, Check, LoaderCircle, RotateCw, Sparkles, X } from "lucide-react";
import { EditorDialog } from "./EditorDialog";
import type { Project } from "./App";

type Capability = { id?: string; capability?: string; capability_id?: string } | string;
type EngineStatus = {
  health: { status?: string };
  capabilities: { capabilities?: Capability[] | Record<string, Capability> };
  supportsCourseReview: boolean;
};
type Task = { task_id: string; status: string; progress?: number; artifact_id?: string; source_revision?: number; error?: string };
type ObjectReference = { object_type: "course" | "scene" | "objective" | "assessment" | "asset"; object_id: string };
type Finding = {
  finding_id: string;
  category: string;
  severity: "info" | "review" | "attention";
  statement: string;
  object_refs: ObjectReference[];
  evidence_refs: string[];
  recommendation: string;
  limitations: string[];
};
type CourseReview = {
  id: string;
  taskId: string;
  artifactId: string;
  sourceRevision: number;
  artifact: { payload: {
    domain_status: { domain: string; status: string; finding_count: number }[];
    findings: Finding[];
    specialist_routes: { domain: string; capability: string; provider: string }[];
    limitations: string[];
    review_questions: string[];
  } };
  findings: { findingId: string; status: "open" | "resolved" | "dismissed"; resolutionNote: string | null; decisionHistory: unknown[] }[];
  createdAt: string;
  updatedAt: string;
};

async function requestJson<T>(path: string, signal?: AbortSignal, method = "GET", payload?: unknown): Promise<T> {
  const response = await fetch(path, {
    method,
    signal,
    headers: method === "POST" || method === "PATCH" ? { "Content-Type": "application/json" } : undefined,
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });
  const body = await response.json().catch(() => null) as { detail?: unknown } | null;
  if (!response.ok) throw new Error(typeof body?.detail === "string" ? body.detail : `Request failed (${response.status}).`);
  return body as T;
}

function courseReviewCapability(value: EngineStatus["capabilities"]): boolean {
  const capabilities = value.capabilities;
  if (Array.isArray(capabilities)) return capabilities.some((item) => {
    if (typeof item === "string") return item === "course.review";
    return [item.id, item.capability, item.capability_id].includes("course.review");
  });
  return Boolean(capabilities && ("course.review" in capabilities || Object.values(capabilities).some((item) => typeof item === "string" ? item === "course.review" : [item.id, item.capability, item.capability_id].includes("course.review"))));
}

export function PythiaCourseReviewView({
  project,
  onClose,
  onNavigateToObject,
}: {
  project: Project;
  onClose: () => void;
  onNavigateToObject: (reference: ObjectReference) => void;
}) {
  const [engine, setEngine] = useState<EngineStatus | null>(null);
  const [reviews, setReviews] = useState<CourseReview[]>([]);
  const [selectedReviewId, setSelectedReviewId] = useState("");
  const [task, setTask] = useState<Task | null>(null);
  const [sourceRevision, setSourceRevision] = useState<number | null>(null);
  const [resolutionDrafts, setResolutionDrafts] = useState<Record<string, string>>({});
  const [checking, setChecking] = useState(true);
  const [busy, setBusy] = useState(false);
  const [busyFindingId, setBusyFindingId] = useState("");
  const [error, setError] = useState("");
  const [pollRevision, setPollRevision] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      requestJson<EngineStatus>(`/api/projects/${project.id}/pythia-status`, controller.signal),
      requestJson<CourseReview[]>(`/api/projects/${project.id}/pythia-course-reviews`, controller.signal),
    ]).then(([status, loadedReviews]) => {
      setEngine(status);
      setReviews(loadedReviews);
      setSelectedReviewId(loadedReviews.at(-1)?.id ?? "");
    }).catch((issue) => {
      if (!controller.signal.aborted) setError(issue instanceof Error ? issue.message : "Course reviews could not be loaded.");
    }).finally(() => { if (!controller.signal.aborted) setChecking(false); });
    return () => controller.abort();
  }, [project.id]);

  useEffect(() => {
    if (!task || !["submitted", "queued", "running"].includes(task.status)) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const next = await requestJson<Task>(`/api/projects/${project.id}/pythia-tasks/${encodeURIComponent(task.task_id)}`, controller.signal);
        if (next.status === "awaiting_review") {
          if (!next.artifact_id) throw new Error("Pythia completed without an artifact ID.");
          const revision = sourceRevision ?? next.source_revision;
          if (revision === undefined) throw new Error("Pythia task is missing its source storyboard revision.");
          const saved = await requestJson<CourseReview>(
            `/api/projects/${project.id}/pythia-course-reviews`,
            controller.signal,
            "POST",
            { taskId: next.task_id, artifactId: next.artifact_id, sourceRevision: revision },
          );
          if (!controller.signal.aborted) {
            setTask(next);
            setReviews((current) => [...current.filter((review) => review.id !== saved.id), saved]);
            setSelectedReviewId(saved.id);
          }
        } else if (!controller.signal.aborted) {
          setTask(next);
          if (next.status === "failed") setError(typeof next.error === "string" ? next.error : "Course review failed.");
          if (next.status === "cancelled") setError("Course review was cancelled.");
        }
      } catch (issue) {
        if (!controller.signal.aborted) setError(issue instanceof Error ? issue.message : "Course review status is unavailable.");
      }
    }, 750);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [project.id, sourceRevision, task, pollRevision]);

  async function startReview() {
    setBusy(true);
    setError("");
    try {
      const submitted = await requestJson<Task>(`/api/projects/${project.id}/pythia-course-review`, undefined, "POST");
      setSourceRevision(submitted.source_revision ?? null);
      setTask(submitted);
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : "Course review could not be submitted.");
    } finally {
      setBusy(false);
    }
  }

  async function cancelTask() {
    if (!task) return;
    try {
      setTask(await requestJson<Task>(`/api/projects/${project.id}/pythia-tasks/${encodeURIComponent(task.task_id)}/cancel`, undefined, "POST"));
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : "Course review could not be cancelled.");
    }
  }

  async function updateFinding(findingId: string, status: "open" | "resolved" | "dismissed") {
    if (busyFindingId) return;
    const resolutionNote = resolutionDrafts[findingId]?.trim() ?? "";
    if (status === "resolved" && !resolutionNote) {
      setError("Add a resolution note before resolving a finding.");
      return;
    }
    if (!selectedReviewId) return;
    setBusyFindingId(findingId);
    setError("");
    try {
      const saved = await requestJson<CourseReview>(
        `/api/projects/${project.id}/pythia-course-reviews/${encodeURIComponent(selectedReviewId)}/findings/${encodeURIComponent(findingId)}`,
        undefined,
        "PATCH",
        { status, resolutionNote: resolutionNote || null },
      );
      setReviews((current) => current.map((review) => review.id === saved.id ? saved : review));
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : "Finding status could not be saved.");
    } finally {
      setBusyFindingId("");
    }
  }

  const capabilityAvailable = Boolean(engine?.supportsCourseReview && courseReviewCapability(engine.capabilities));
  const active = Boolean(task && ["submitted", "queued", "running"].includes(task.status));
  const canStart = !task || ["failed", "cancelled"].includes(task.status);
  const selectedReview = reviews.find((review) => review.id === selectedReviewId) ?? null;
  const payload = selectedReview?.artifact.payload;
  const reviewIsStale = Boolean(selectedReview && selectedReview.sourceRevision !== project.storyboard.revision);
  const findingState = new Map((selectedReview?.findings ?? []).map((finding) => [finding.findingId, finding]));

  return <EditorDialog labelledBy="pythia-course-review-title" className="pythia-analysis-dialog" onClose={onClose} busy={busy}>
    <div className="modal-head"><div><p className="eyebrow">PYTHIA ENGINE</p><h2 id="pythia-course-review-title">Course review</h2></div><button className="icon-button" onClick={onClose} disabled={busy} aria-label="Close course review"><X size={19} /></button></div>
    <div className="pythia-scene-label"><span>COURSE</span><strong>{project.title}</strong></div>
    <section className="pythia-engine-state" role="status">
      {checking ? <><LoaderCircle className="pythia-spinner" size={17} /> Checking Engine API</> : engine?.health.status === "ok" ? <><Check size={17} /> Engine online</> : <><AlertCircle size={17} /> Engine unavailable</>}
      {engine?.health.status === "ok" && <span>{capabilityAvailable ? "course.review" : "Capability unavailable"}</span>}
    </section>
    {reviews.length > 0 && <label className="enhancement-form-field">Review run<select value={selectedReviewId} onChange={(event) => setSelectedReviewId(event.target.value)}>{[...reviews].reverse().map((review) => <option key={review.id} value={review.id}>{new Date(review.createdAt).toLocaleString()} · revision {review.sourceRevision}</option>)}</select></label>}
    {canStart && <div className="pythia-submit-row"><button className="button button-accent" onClick={() => void startReview()} disabled={checking || busy || !capabilityAvailable}><Sparkles size={16} /> {task ? "Run course review again" : "Review course with Pythia"}</button></div>}
    {task && <section className="pythia-task-state" aria-live="polite"><div><strong>{selectedReview ? "Draft saved for review" : task.status === "failed" ? "Course review failed" : task.status === "cancelled" ? "Course review cancelled" : "Course review in progress"}</strong><span>{task.progress !== undefined ? `${task.progress}%` : task.status}</span></div>{task.progress !== undefined && <progress max="100" value={task.progress} />}{active && <button className="button button-outline" onClick={() => void cancelTask()}>Cancel task</button>}</section>}
    {error && <div className="pythia-error" role="alert"><AlertCircle size={17} /><span>{error}</span>{active && <button className="button button-outline" onClick={() => { setError(""); setPollRevision((revision) => revision + 1); }}>Retry polling</button>}</div>}
    {selectedReview && payload && <div className="pythia-proposal">
      <div className="pythia-proposal-heading"><span>DRAFT COURSE REVIEW</span><span>Revision {selectedReview.sourceRevision}{reviewIsStale ? " · source has changed" : ""}</span></div>
      {reviewIsStale && <p className="pythia-readonly-note">This report reflects an earlier storyboard revision. Re-run the review for current course content.</p>}
      <section className="pythia-result-section"><h3>Domain status<span>{payload.domain_status.length}</span></h3><ul>{payload.domain_status.map((domain) => <li key={domain.domain}><strong>{domain.domain.replaceAll("_", " ")}</strong><span>{domain.status} · {domain.finding_count} finding{domain.finding_count === 1 ? "" : "s"}</span></li>)}</ul></section>
      <section className="pythia-result-section"><h3>Findings<span>{payload.findings.length}</span></h3>{payload.findings.length === 0 ? <p className="pythia-empty-list">No findings returned for the submitted inventory.</p> : payload.findings.map((finding) => {
        const state = findingState.get(finding.finding_id);
        return <article className="enhancement-proposal-change" key={finding.finding_id}>
          <div className="enhancement-proposal-field">{finding.category.replaceAll("_", " ")} · {finding.severity} · {state?.status ?? "open"}</div>
          <p><strong>{finding.statement}</strong></p>
          <p>{finding.recommendation}</p>
          {finding.limitations.length > 0 && <p><strong>Limitations:</strong> {finding.limitations.join("; ")}</p>}
          <ul className="enhancement-proposal-citations">{finding.evidence_refs.map((reference) => <li key={reference}>{reference}</li>)}</ul>
          <div className="enhancement-proposal-actions">{finding.object_refs.map((reference) => <button className="button button-outline" key={`${reference.object_type}-${reference.object_id}`} onClick={() => onNavigateToObject(reference)} title={`Open ${reference.object_type} ${reference.object_id}`}><span>Open {reference.object_type}</span></button>)}</div>
          {state?.status === "open" || !state ? <>
            <label className="enhancement-form-field">Resolution note<textarea rows={2} maxLength={2000} value={resolutionDrafts[finding.finding_id] ?? ""} onChange={(event) => setResolutionDrafts((current) => ({ ...current, [finding.finding_id]: event.target.value }))} /></label>
            <div className="enhancement-proposal-actions"><button className="button button-outline" onClick={() => void updateFinding(finding.finding_id, "dismissed")} disabled={busyFindingId === finding.finding_id}><X size={14} /> Dismiss</button><button className="button button-accent" onClick={() => void updateFinding(finding.finding_id, "resolved")} disabled={busyFindingId === finding.finding_id || !resolutionDrafts[finding.finding_id]?.trim()}><Check size={14} /> Resolve</button></div>
          </> : <div className="enhancement-proposal-actions"><span>{state.status}{state.resolutionNote ? ` · ${state.resolutionNote}` : ""}</span><button className="button button-outline" onClick={() => void updateFinding(finding.finding_id, "open")} disabled={busyFindingId === finding.finding_id}><RotateCw size={14} /> Reopen</button></div>}
        </article>;
      })}</section>
      {payload.review_questions.length > 0 && <section className="pythia-result-section"><h3>Review questions<span>{payload.review_questions.length}</span></h3><ul>{payload.review_questions.map((question, index) => <li key={`review-question-${index}`}>{question}</li>)}</ul></section>}
      {payload.limitations.length > 0 && <section className="pythia-result-section"><h3>Report limitations<span>{payload.limitations.length}</span></h3><ul>{payload.limitations.map((limitation, index) => <li key={`limitation-${index}`}>{limitation}</li>)}</ul></section>}
      <p className="pythia-readonly-note">Findings are recommendations. Resolving one records a human decision and does not change course content.</p>
    </div>}
  </EditorDialog>;
}