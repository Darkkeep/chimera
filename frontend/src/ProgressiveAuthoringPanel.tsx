import { useEffect, useRef, useState } from "react";
import type { Project } from "./App";
import { SceneSurface } from "./SceneSurface";
import { storyboardWriteHeaders } from "./revision";
import { mergeProgressiveEvents, proposalScene, type ComponentEvent } from "./progressive-events";
import "./progressive-authoring.css";

type EventPage = { jobId: string; projectId: string; status: string; cursor: number; projectRevision: number; requiresReview: boolean; events: ComponentEvent[] };

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
  const [reconnect, setReconnect] = useState(0);
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
        absorb(page); setError("");
        if (page.status === "running") timer = setTimeout(() => void poll(), 500);
      } catch (issue) {
        if (!disposed) setError(issue instanceof Error ? issue.message : "Connection interrupted. Reconnect to resume.");
      }
    }
    void poll();
    return () => { disposed = true; controller.abort(); clearTimeout(timer); };
  }, [jobId, reconnect, base]);
  async function begin() {
    setBusy(true); setError("");
    try {
      const page = await json(await fetch(base, { method: "POST", headers: storyboardWriteHeaders(project.storyboard.revision) })) as EventPage;
      activeJob.current = page.jobId; log.current = []; absorb(page); localStorage.setItem(storageKey, page.jobId); setJobId(page.jobId);
    } catch (issue) { setError(issue instanceof Error ? issue.message : "Could not start"); }
    finally { setBusy(false); }
  }
  async function cancel() {
    setBusy(true); setError("");
    try { absorb(await json(await fetch(`${base}/${jobId}/cancel`, { method: "POST" })) as EventPage); }
    catch (issue) { setError(issue instanceof Error ? issue.message : "Could not cancel"); }
    finally { setBusy(false); }
  }
  async function decide(componentId: string, decision: "accept" | "reject", edit = false) {
    setBusy(true); setError("");
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
    finally { setBusy(false); }
  }
  const ready = events.filter(event => event.type === "component.ready");
  return <section className="progressive-authoring" aria-label="Progressive scene proposals">
    <div className="progressive-heading"><h3>Progressive scene proposals</h3><span>Local demonstration · no AI calls</span></div>
    <p>Review a complete draft while the next scene is still being prepared. Nothing enters your course until you choose Accept scene.</p>
    <div className="progressive-actions">
      <button type="button" disabled={disabled || busy || status === "running"} onClick={() => void begin()}>Start progressive demo</button>
      {jobId && <button type="button" disabled={busy} onClick={() => { log.current = []; setEvents([]); setReconnect(value => value + 1); }}>Reconnect proposals</button>}
      {status === "running" && <button type="button" disabled={disabled || busy} onClick={() => void cancel()}>Cancel generation</button>}
    </div>
    <p role="status">{status === "running" ? `${ready.length} of 2 complete drafts available · Generation continues` : `Generation: ${status}`}</p>
    {error && <p role="alert">{error}</p>}
    {requiresReview && <p role="status">The generation sources or course structure changed. Review these preserved drafts and start a new demonstration before accepting. Generation can continue without changing your course.</p>}
    {ready.map(event => {
      const decision = events.find(item => item.componentId === event.componentId && ["component.accepted", "component.rejected"].includes(item.type));
      return <article key={event.componentId} aria-label={`Draft proposal: ${event.payload?.title}`}>
        <h4>{event.payload?.title}</h4><p>Proposal only · Synthetic source: inspection basics · {decision?.status || "Awaiting your review"}</p>
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
