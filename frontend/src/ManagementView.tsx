import { useEffect, useRef, useState } from "react";
import { Activity, ArrowLeft, ShieldCheck, Users } from "lucide-react";
import "./management.css";

type Health = { projectId: string; title: string; revision: number; sceneCount: number; pendingProposals: number; unresolvedComments: number; publicationBlockers: number; authoringWarnings: number; updatedAt: string };
type Context = { actor: { actorId: string; actorDisplayName: string; installationId: string; deploymentMode: string }; memberships: { role: string }[]; policy: { deploymentMode: string; trackingMode: string; auditRetentionDays: number; allowGuestReviewers: boolean } };
type AuditEvent = { eventId: string; eventName: string; eventClass: string; occurredAt: string; projectId: string | null; actorId: string | null };

type ManagementViewProps = { onClose: () => void };

export function ManagementView({ onClose }: ManagementViewProps) {
  const [health, setHealth] = useState<Health[]>([]);
  const [context, setContext] = useState<Context | null>(null);
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [error, setError] = useState("");
  const titleRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => { titleRef.current?.focus(); }, []);

  useEffect(() => {
    Promise.all([
      fetch("/api/management/project-health").then((response) => response.ok ? response.json() as Promise<Health[]> : Promise.reject(new Error("Project health unavailable."))),
      fetch("/api/identity/context").then((response) => response.ok ? response.json() as Promise<Context> : Promise.reject(new Error("Identity context unavailable."))),
      fetch("/api/management/audit?limit=12").then((response) => response.ok ? response.json() as Promise<{ events: AuditEvent[] }> : Promise.reject(new Error("Audit activity unavailable."))),
    ]).then(([nextHealth, nextContext, nextEvents]) => {
      setHealth(nextHealth);
      setContext(nextContext);
      setEvents(nextEvents.events);
    }).catch((loadError: unknown) => setError(loadError instanceof Error ? loadError.message : "Management data could not be loaded."));
  }, []);

  const totals = health.reduce((summary, item) => ({
    pending: summary.pending + item.pendingProposals,
    comments: summary.comments + item.unresolvedComments,
    blockers: summary.blockers + item.publicationBlockers,
  }), { pending: 0, comments: 0, blockers: 0 });

  return <section className="management-view" aria-labelledby="management-title">
    <header className="management-header">
      <div><p className="eyebrow">TEAM PLATFORM / MANAGEMENT</p><h1 ref={titleRef} tabIndex={-1} id="management-title">My Work</h1><p>Review your projects, approvals, and recent activity.</p></div>
      <button type="button" className="button button-outline" onClick={onClose}><ArrowLeft size={15} /> Return to authoring</button>
    </header>
    {error && <p className="notice" role="alert">{error}</p>}
    <div className="management-summary" aria-label="Work summary">
      <div><strong>{health.length}</strong><span>Projects</span></div>
      <div><strong>{totals.pending}</strong><span>Pending approvals</span></div>
      <div><strong>{totals.comments}</strong><span>Unresolved comments</span></div>
      <div><strong>{totals.blockers}</strong><span>Publication blockers</span></div>
    </div>
    <div className="management-grid">
      <section className="management-panel"><div className="management-panel-title"><div><Users size={17} /><h3>Identity and policy</h3></div></div>
        {context && <dl className="management-facts"><div><dt>Actor</dt><dd>{context.actor.actorDisplayName}</dd></div><div><dt>Installation</dt><dd>{context.actor.installationId}</dd></div><div><dt>Roles</dt><dd>{context.memberships.map((membership) => membership.role).join(", ")}</dd></div><div><dt>Mode</dt><dd>{context.policy.deploymentMode}</dd></div><div><dt>Tracking</dt><dd>{context.policy.trackingMode}</dd></div><div><dt>Audit retention</dt><dd>{context.policy.auditRetentionDays} days</dd></div></dl>}
      </section>
      <section className="management-panel"><div className="management-panel-title"><div><ShieldCheck size={17} /><h3>Project health</h3></div></div>
        {health.length ? <div className="health-list">{health.map((item) => <article className="health-row" key={item.projectId}><div><strong>{item.title}</strong><span>Revision {item.revision} · {item.sceneCount} scenes</span></div><div className="health-counts"><span className={item.publicationBlockers ? "is-blocked" : "is-clear"}>{item.publicationBlockers} blockers</span><span>{item.unresolvedComments} comments</span><span>{item.pendingProposals} approvals</span></div></article>)}</div> : <p className="management-empty">No projects yet.</p>}
      </section>
      <section className="management-panel management-panel-wide"><div className="management-panel-title"><div><Activity size={17} /><h3>Recent activity</h3></div></div>
        {events.length ? <ul className="audit-list">{events.map((event) => <li key={event.eventId}><span className={`audit-class ${event.eventClass}`}>{event.eventClass}</span><strong>{event.eventName}</strong><time dateTime={event.occurredAt}>{new Date(event.occurredAt).toLocaleString()}</time><small>{event.projectId || "Workspace"}</small></li>)}</ul> : <p className="management-empty">No audit activity recorded yet.</p>}
      </section>
    </div>
  </section>;
}
