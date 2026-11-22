import { useEffect, useRef, useState } from "react";
import type { Project } from "./App";
import { SceneSurface } from "./SceneSurface";
import { storyboardWriteHeaders } from "./revision";
import { mergeProgressiveEvents, proposalScene, progressiveProcess, type ComponentEvent } from "./progressive-events";
import { LoaderCircle } from "lucide-react";
import "./enhancement-submission.css";
import "./progressive-authoring.css";

type ImportReport = { handoffId: string; artifactSha256: string; supportedScenes: number; totalScenes: number; unsupported: string[]; notice: string };
type EventPage = { jobId: string; projectId: string; status: string; cursor: number; projectRevision: number; requiresReview: boolean; events: ComponentEvent[]; importReport?: ImportReport | null };

export function ProgressiveAuthoringPanel({ project, disabled, onProjectUpdated, onReviewAction, onAcceptAndEdit, getCurrentRevision }: {
  project: Project; disabled: boolean; onProjectUpdated: (project: Project) => void; onReviewAction: (action: () => void) => void;
  onAcceptAndEdit: (project: Project, sceneId: string) => void;
  getCurrentRevision: () => number;
}) {
  const storageKey = `chimera.progressive.job.${project.id}`;
  const [jobId, setJobId] = useState(() => localStorage.getItem(storageKey) || "");
  const activeJob = useRef(jobId);
  const [events, setEvents] = useState<ComponentEvent[]>([]);
  const log = useRef<ComponentEvent[]>([]);
  const [status, setStatus] = useState("idle");
  const [requiresReview, setRequiresReview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [operation, setOperation] = useState("");
  const [interrupted, setInterrupted] = useState(false);
  const [reconnect, setReconnect] = useState(0);
  const [importReport, setImportReport] = useState<ImportReport | null>(null);
  const base = `/api/projects/${project.id}/progressive-jobs`;
  async function json(response: Response) {
    const body = await response.json();
    if (!response.ok) throw new Error(response.status === 412
      ? "The saved course changed. Your edits and this proposal are preserved. Reopen the current course before reviewing again."
      : typeof body.detail === "string" ? body.detail : "The progressive demonstration is unavailable.");
    return body;
  }
  function absorb(page: EventPage) {
    if (page.projectId !== project.id || page.jobId !== activeJob.current || !Array.isArray(page.events) || !Number.isSafeInteger(page.cursor) ||
        !Number.isSafeInteger(page.projectRevision) || page.projectRevision < 1 || typeof page.requiresReview !== "boolean" ||
        !["running", "completed", "cancelled", "failed"].includes(page.status)) throw new Error("Invalid event page");
    const merged = mergeProgressiveEvents(log.current, page.events, page.jobId, project.id);
    if (page.cursor < log.current.length) return; // a slower poll cannot undo a newer review response
    if (page.cursor !== merged.length) throw new Error("Invalid resume cursor");
    log.current = merged; setEvents(merged); setStatus(page.status); setRequiresReview(page.requiresReview);
    setImportReport(page.importReport || null);
  }
  useEffect(() => {
    if (!jobId) return;
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    const controller = new AbortController();
    async function poll() {
      try {
        const page = await json(await fetch(`${base}/${jobId}/events?after=${log.current.length}`, { signal: controller.signal, cache: "no-store" })) as EventPage;
        if (disposed || activeJob.current !== jobId) return;
        if (page.jobId !== jobId) throw new Error("Unexpected job identity");
        absorb(page); setError(""); setInterrupted(false); setOperation(value => value === "Reconnecting to saved proposals…" ? "" : value);
        if (page.status === "running") timer = setTimeout(() => void poll(), 500);
      } catch (issue) {
        if (!disposed) { setInterrupted(true); setOperation(""); setError(issue instanceof Error ? issue.message : "Connection interrupted. Reconnect to resume."); }
      }
    }
    void poll();
    return () => { disposed = true; controller.abort(); clearTimeout(timer); };
  }, [jobId, reconnect, base]);
  async function begin(producer: "deterministic-fixture-v1" | "pythia-authoring-fixture-v1" = "deterministic-fixture-v1") {
    setBusy(true); setError(""); setInterrupted(false); setOperation("Requesting demonstration scenes…");
    try {
      const page = await json(await fetch(`${base}?producer=${producer}`, { method: "POST", headers: storyboardWriteHeaders(project.storyboard.revision) })) as EventPage;
      activeJob.current = page.jobId; log.current = []; absorb(page); localStorage.setItem(storageKey, page.jobId); setJobId(page.jobId);
    } catch (issue) { setError(issue instanceof Error ? issue.message : "Could not start"); }
    finally { setBusy(false); setOperation(""); }
  }
  async function cancel() {
    setBusy(true); setError("");
    try { absorb(await json(await fetch(`${base}/${jobId}/cancel`, { method: "POST" })) as EventPage); }
    catch (issue) { setError(issue instanceof Error ? issue.message : "Could not cancel"); }
    finally { setBusy(false); }
  }
  async function importArtifact(file: File) {
    setBusy(true); setError(""); setInterrupted(false); setOperation("Validating saved Pythia artifact…");
    try {
      if (file.size > 1_000_000) throw new Error("Pythia handoff JSON must be 1 MB or smaller.");
      const page = await json(await fetch(`${base}/import`, { method: "POST",
        headers: storyboardWriteHeaders(getCurrentRevision()), body: await file.text() })) as EventPage;
      activeJob.current = page.jobId; log.current = []; absorb(page);
      localStorage.setItem(storageKey, page.jobId); setJobId(page.jobId);
    } catch (issue) { setError(issue instanceof Error ? issue.message : "Could not import artifact"); }
    finally { setBusy(false); setOperation(""); }
  }
  async function decide(componentId: string, decision: "accept" | "reject", edit = false) {
    setBusy(true); setError(""); setOperation(decision === "accept" ? "Adding the scene to your course…" : "Rejecting the scene proposal…");
    try {
      const updated = await json(await fetch(`${base}/${jobId}/components/${componentId}/decision`, {
        method: "POST", headers: storyboardWriteHeaders(getCurrentRevision()), body: JSON.stringify({ decision }),
      })) as Project;
      if (decision === "accept") {
        if (edit) onAcceptAndEdit(updated, `progressive-${jobId}-${componentId}`);
        else onProjectUpdated(updated);
      }
      absorb(await json(await fetch(`${base}/${jobId}/events?after=${log.current.length}`, { cache: "no-store" })) as EventPage);
    } catch (issue) { setError(issue instanceof Error ? issue.message : "Could not review"); }
    finally { setBusy(false); setOperation(""); }
  }
  const ready = events.filter(event => event.type === "component.ready");
  const process = progressiveProcess(events, status);
  const processLabel = interrupted ? "Connection interrupted. Reconnect proposals to resume; your work is preserved."
    : error ? "Couldn't complete this step. Review the details below." : operation || (importReport && status === "completed" && !["component.accepted", "component.rejected"].includes(events.at(-1)?.type || "") ? "Saved artifact import complete. Review your proposals." : process.label);
  return <section className="progressive-authoring" aria-label="Progressive scene proposals">
    <div className="progressive-heading"><h3>Progressive scene proposals</h3><span>Local review · no AI calls</span></div>
    <p>Review a complete draft while the next scene is still being prepared. Nothing enters your course until you choose Accept scene.</p>
    <div className="progressive-actions">
      <label>Import saved Pythia artifact <input type="file" accept=".json,application/json" aria-label="Import saved Pythia artifact" disabled={disabled || busy || status === "running"}
        onChange={event => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ""; if (file) void importArtifact(file); }} /></label>
      <button type="button" disabled={disabled || busy || status === "running"} onClick={() => void begin()}>Start progressive demo</button>
      <button type="button" disabled={disabled || busy || status === "running"} onClick={() => void begin("pythia-authoring-fixture-v1")}>Try Pythia-format fixture</button>
      {jobId && <button type="button" disabled={busy} onClick={() => { log.current = []; setInterrupted(false); setError(""); setOperation("Reconnecting to saved proposals…"); setReconnect(value => value + 1); }}>Reconnect proposals</button>}
      {status === "running" && <button type="button" disabled={disabled || busy} onClick={() => void cancel()}>Cancel generation</button>}
    </div>
    <div className="progressive-process" data-operation={process.operationKey}>
      {!error && !interrupted && (busy || status === "running") && <LoaderCircle size={18} className="enhancement-working-spinner" aria-hidden="true" />}
      <p role="status" aria-live="polite" aria-atomic="true">{processLabel}</p>
    </div>
    <p>{status === "running" ? `${ready.length} of 2 complete drafts available · Generation continues` : `Generation: ${status}`}</p>
    {error && <p role="alert">{error}</p>}
    {importReport && <details open><summary>Artifact import report · {importReport.supportedScenes} of {importReport.totalScenes} scenes proposed</summary>
      <p>{importReport.notice}</p><p>Handoff: {importReport.handoffId} · SHA-256: {importReport.artifactSha256}</p>
      {importReport.unsupported.length > 0 && <ul>{importReport.unsupported.map((item, index) => <li key={index}>{item}</li>)}</ul>}
    </details>}
    {requiresReview && <p role="status">The generation sources or course structure changed. Review these preserved drafts and start a new demonstration before accepting. Generation can continue without changing your course.</p>}
    {ready.map(event => {
      const decision = events.find(item => item.componentId === event.componentId && ["component.accepted", "component.rejected"].includes(item.type));
      return <article key={event.componentId} aria-label={`Draft proposal: ${event.payload?.title}`}>
        <h4>{event.payload?.title}</h4><p>Proposal only · {event.provenance.producer === "pythia-production-handoff-v1" ? "Saved Pythia artifact (no live generation)" : event.provenance.producer === "pythia-authoring-fixture-v1" ? "Pythia-format test result (no live model or citations)" : "Synthetic source: inspection basics"} · {decision?.status || "Awaiting your review"}</p>
        {event.provenance.producer === "pythia-production-handoff-v1" && <p>Artifact: {event.provenance.artifactId} · Source scene: {event.provenance.sourceSceneId} · Source IDs: {event.provenance.sourceIds.join(", ") || "None supplied"} · Locators (supplied, unverified): {event.provenance.locators.join("; ") || "None supplied"}</p>}
        {event.provenance.producer === "pythia-authoring-fixture-v1" && event.provenance.rationale && <p>Design rationale: {event.provenance.rationale}</p>}
        <SceneSurface project={project} scene={proposalScene(event)} />
        <div className="progressive-actions">
          <button type="button" disabled={disabled || busy || requiresReview || Boolean(decision) || ["cancelled", "failed"].includes(status)} onClick={() => onReviewAction(() => void decide(event.componentId!, "accept"))}>Accept scene</button>
          <button type="button" disabled={disabled || busy || requiresReview || Boolean(decision) || ["cancelled", "failed"].includes(status)} onClick={() => onReviewAction(() => void decide(event.componentId!, "accept", true))}>Accept and edit</button>
          <button type="button" disabled={disabled || busy || Boolean(decision)} onClick={() => void decide(event.componentId!, "reject")}>Reject scene</button>
        </div>
      </article>;
    })}
    {events.some(event => event.type === "component.failed") && <p role="status">A component failed validation and was withheld. Other complete drafts remain available for review.</p>}
  </section>;
}
