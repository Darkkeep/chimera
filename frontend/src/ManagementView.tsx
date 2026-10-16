import { useEffect, useRef, useState } from "react";
import { Activity, ArrowRight, ChevronRight, LoaderCircle, Plus, RotateCcw, ShieldCheck, Trash2, Users } from "lucide-react";
import { EditorDialog } from "./EditorDialog";
import { reportOnboardingOutcome } from "./onboarding-journeys";
import "./management.css";

type ProductionStage = "not-set" | "draft" | "in-production" | "in-review" | "approved" | "published";
type Blocker = { code: string; message: string; sceneId: string | null; sceneTitle: string | null };
type Health = { projectId: string; title: string; revision: number; sceneCount: number; pendingProposals: number; unresolvedComments: number; publicationBlockers: number; authoringWarnings: number; updatedAt: string; productionStage: ProductionStage; productionPassed: boolean; blockerCounts: Record<string, number>; blockers: Blocker[]; canEdit: boolean; canSetStage: boolean; canTrash: boolean };
type TrashedProject = { id: string; title: string; sceneCount: number; updatedAt: string; trashedAt: string; expiresAt: string };
type Context = { actor: { actorId: string; actorDisplayName: string; installationId: string; deploymentMode: string }; memberships: { role: string }[]; policy: { deploymentMode: string; trackingMode: string; auditRetentionDays: number; allowGuestReviewers: boolean } };
type AuditEvent = { eventId: string; eventName: string; eventClass: string; occurredAt: string; projectId: string | null; actorId: string | null };
type ManagementViewProps = { onClose: () => void; onOpenProject: (projectId: string) => Promise<boolean>; onCreateProject: () => void; onProjectTrashed: (projectId: string) => Promise<void>; onProjectsRestored: (projectId: string) => Promise<void>; canCreateProject: boolean; canResume: boolean; busy: boolean };

const stages: Record<ProductionStage, string> = { "not-set": "Not set", draft: "Draft", "in-production": "In production", "in-review": "In review", approved: "Approved", published: "Published" };
const blockerLabels: Record<string, string> = {
  "no-scenes": "No storyboard scenes",
  "duplicate-scene-id": "Duplicate scene identifiers",
  "duplicate-asset-id": "Duplicate asset identifiers",
  "unresolved-template": "Unavailable templates",
  "invalid-remediation-scene": "Invalid remediation targets",
  "invalid-asset-reference": "Broken media references",
  "missing-asset-file": "Missing media files",
  "missing-media-attribution": "Missing media attribution",
};

export function ManagementView({ onClose, onOpenProject, onCreateProject, onProjectTrashed, onProjectsRestored, canCreateProject, canResume, busy }: ManagementViewProps) {
  const [health, setHealth] = useState<Health[]>([]);
  const [context, setContext] = useState<Context | null>(null);
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  const [savingStage, setSavingStage] = useState<string | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [showTrash, setShowTrash] = useState(false);
  const [trashItems, setTrashItems] = useState<TrashedProject[]>([]);
  const [trashLoading, setTrashLoading] = useState(false);
  const [trashTarget, setTrashTarget] = useState<Health | null>(null);
  const [confirmationChecked, setConfirmationChecked] = useState(false);
  const [lifecycleBusy, setLifecycleBusy] = useState(false);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const stageSavePending = useRef(false);

  useEffect(() => { titleRef.current?.focus(); }, []);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError("");
    Promise.all([
      fetch("/api/management/project-health").then((response) => response.ok ? response.json() as Promise<Health[]> : Promise.reject(new Error("Project health unavailable."))),
      fetch("/api/identity/context").then((response) => response.ok ? response.json() as Promise<Context> : Promise.reject(new Error("Identity context unavailable."))),
      fetch("/api/management/audit?limit=12").then((response) => response.status === 403 ? { events: [] } : response.ok ? response.json() as Promise<{ events: AuditEvent[] }> : Promise.reject(new Error("Audit activity unavailable."))),
    ]).then(([nextHealth, nextContext, nextEvents]) => {
      if (!alive) return;
      setHealth(nextHealth);
      setContext(nextContext);
      setEvents(nextEvents.events);
    }).catch((loadError: unknown) => {
      if (alive) setError(loadError instanceof Error ? loadError.message : "Workspace data could not be loaded.");
    }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [retry]);

  async function openProject(item: Health) {
    if (busy || opening || stageSavePending.current) return;
    setOpening(item.projectId);
    setError("");
    try {
      if (!await onOpenProject(item.projectId)) throw new Error("Project could not be opened. Please try again.");
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : "Project could not be opened.");
    } finally { setOpening(null); }
  }

  async function updateStage(item: Health, productionStage: ProductionStage) {
    if (stageSavePending.current || busy || opening) return;
    stageSavePending.current = true;
    setSavingStage(item.projectId);
    setError("");
    setStatus("");
    try {
      const response = await fetch(`/api/projects/${item.projectId}/production-stage`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ productionStage }),
      });
      if (!response.ok) throw new Error(response.status === 403 ? "You do not have permission to change this project's stage." : "Production stage could not be saved. Please try again.");
      const updated = await response.json() as { productionStage: ProductionStage; updatedAt: string };
      setHealth((current) => current.map((entry) => entry.projectId === item.projectId ? { ...entry, productionStage: updated.productionStage, updatedAt: updated.updatedAt } : entry));
      setStatus(`${item.title}: ${stages[updated.productionStage]} saved.`);
      reportOnboardingOutcome("project.stage-saved", item.projectId);
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : "Production stage could not be saved.");
    } finally { stageSavePending.current = false; setSavingStage(null); }
  }

  async function loadTrash() {
    setTrashLoading(true);
    setError("");
    try {
      const response = await fetch("/api/trash/projects");
      if (!response.ok) throw new Error("Trash could not be loaded.");
      setTrashItems(await response.json() as TrashedProject[]);
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : "Trash could not be loaded.");
    } finally { setTrashLoading(false); }
  }

  async function moveToTrash() {
    if (!trashTarget || !confirmationChecked || lifecycleBusy) return;
    setLifecycleBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/projects/${trashTarget.projectId}/trash`, { method: "POST" });
      if (!response.ok) {
        const body = await response.json().catch(() => ({})) as { detail?: string };
        throw new Error(body.detail || "Project could not be moved to trash.");
      }
      const result = await response.json() as { title: string; expiresAt: string };
      setHealth(current => current.filter(item => item.projectId !== trashTarget.projectId));
      setStatus(`${result.title} moved to trash. It can be restored until ${new Date(result.expiresAt).toLocaleDateString()}.`);
      setTrashTarget(null);
      setConfirmationChecked(false);
      await onProjectTrashed(trashTarget.projectId);
      if (showTrash) await loadTrash();
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : "Project could not be moved to trash.");
    } finally { setLifecycleBusy(false); }
  }

  async function restoreProject(item: TrashedProject) {
    if (lifecycleBusy) return;
    setLifecycleBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/projects/${item.id}/restore`, { method: "POST" });
      if (!response.ok) {
        const body = await response.json().catch(() => ({})) as { detail?: string };
        throw new Error(body.detail || "Project could not be restored.");
      }
      setTrashItems(current => current.filter(project => project.id !== item.id));
      setStatus(`${item.title} restored.`);
      setShowTrash(false);
      await onProjectsRestored(item.id);
      setRetry(current => current + 1);
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : "Project could not be restored.");
    } finally { setLifecycleBusy(false); }
  }

  const totals = health.reduce((summary, item) => ({
    pending: summary.pending + item.pendingProposals,
    comments: summary.comments + item.unresolvedComments,
    blockers: summary.blockers + item.publicationBlockers,
  }), { pending: 0, comments: 0, blockers: 0 });
  const disabled = busy || Boolean(opening || savingStage);

  return <section data-onboarding="workspace.management" className="management-view" aria-labelledby="management-title">
    <header className="management-header">
      <div><p className="eyebrow">WORKSPACE</p><h1 ref={titleRef} tabIndex={-1} id="management-title">My Work</h1></div>
      <div className="management-actions"><button type="button" className="button button-outline" disabled={disabled} aria-pressed={showTrash} onClick={() => { const next = !showTrash; setShowTrash(next); if (next) void loadTrash(); }}> {showTrash ? "My Work" : "Trash"}</button><button type="button" className="button button-accent" disabled={!canCreateProject || disabled} onClick={onCreateProject}><Plus size={15} />New Project</button><button type="button" className="button button-outline" disabled={!canResume || disabled} onClick={onClose}>Resume authoring<ArrowRight size={15} /></button></div>
    </header>
    <div className="management-body">
      {error && <div className="notice" role="alert"><span>{error}</span><button type="button" className="button button-outline" disabled={disabled || loading} onClick={() => setRetry((current) => current + 1)}>Retry</button></div>}
      <p className="management-status" role="status">{loading ? "Loading workspace..." : opening ? "Opening project..." : savingStage ? "Saving production stage..." : status}</p>
      <div className="management-summary" aria-label="Work summary" aria-busy={loading}>
        <div><strong>{loading ? "..." : health.length}</strong><span>Projects</span></div>
        <div><strong>{loading ? "..." : totals.pending}</strong><span>Pending approvals</span></div>
        <div><strong>{loading ? "..." : totals.comments}</strong><span>Unresolved comments</span></div>
        <div><strong>{loading ? "..." : totals.blockers}</strong><span>Publication blockers</span></div>
        <section className="management-identity" aria-labelledby="identity-title">
          <h2 id="identity-title"><Users size={14} />Identity and policy</h2>
          {context && <dl className="management-facts"><div><dt>Actor</dt><dd>{context.actor.actorDisplayName}</dd></div><div><dt>Installation</dt><dd>{context.actor.installationId}</dd></div><div className="identity-roles"><dt>Roles</dt><dd>{context.memberships.map((membership) => membership.role).join(", ")}</dd></div><div><dt>Mode</dt><dd>{context.policy.deploymentMode}</dd></div><div><dt>Tracking</dt><dd>{context.policy.trackingMode}</dd></div><div><dt>Retention</dt><dd>{context.policy.auditRetentionDays} days</dd></div></dl>}
        </section>
      </div>
      {!showTrash && <section className="management-section" aria-labelledby="health-title">
        <div className="management-section-title"><ShieldCheck size={17} /><h2 id="health-title">Project health</h2></div>
        {loading ? <p className="management-empty"><LoaderCircle size={16} className="management-spinner" />Loading projects...</p> : health.length ? <div className={`health-table-container${health.length >= 5 ? " is-scrollable" : ""}`} role={health.length >= 5 ? "region" : undefined} aria-label={health.length >= 5 ? "Project health list" : undefined} tabIndex={health.length >= 5 ? 0 : undefined}><table className="health-table">
          <thead><tr><th scope="col">Project</th><th scope="col">Production stage</th><th scope="col">Publication blockers</th><th scope="col">Comments</th><th scope="col">Pending approvals</th></tr></thead>
          <tbody>{health.map((item) => <tr key={item.projectId} className="health-row" onClick={() => void openProject(item)}>
            <td data-label="Project"><button type="button" className="health-project-link" disabled={disabled} onClick={(event) => { event.stopPropagation(); void openProject(item); }} aria-label={`${item.canEdit ? "Edit" : "Open"} ${item.title}`}><span>{item.title}</span><ArrowRight size={14} /></button><small>Revision {item.revision} / {item.sceneCount} scenes</small>{!item.canEdit && <small>Review access</small>}{item.canTrash && <button type="button" className="button button-outline project-trash-action" disabled={disabled} onClick={(event) => { event.stopPropagation(); setConfirmationChecked(false); setTrashTarget(item); }}><Trash2 size={13} />Move to trash</button>}</td>
            <td data-label="Production stage" onClick={(event) => event.stopPropagation()}>{item.canSetStage ? <select aria-label={`Production stage for ${item.title}`} value={item.productionStage} disabled={disabled} onChange={(event) => void updateStage(item, event.target.value as ProductionStage)}>{Object.entries(stages).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select> : <span>{stages[item.productionStage]}</span>}<small className={item.productionPassed ? "management-clear" : "management-muted"}>{item.productionPassed ? "Publication checks passed" : "Publication checks blocked"}</small></td>
            <td data-label="Publication blockers" onClick={(event) => event.stopPropagation()}>{item.publicationBlockers ? <details className="health-blockers"><summary><strong>{item.publicationBlockers} blocker{item.publicationBlockers === 1 ? "" : "s"}</strong><span>{Object.entries(item.blockerCounts).map(([code, count]) => `${blockerLabels[code] || code}: ${count}`).join("; ")}</span></summary><ul>{item.blockers.map((issue, index) => <li key={`${issue.code}-${index}`}>{issue.sceneTitle && <strong>{issue.sceneTitle}: </strong>}{issue.message}</li>)}</ul></details> : <span className="management-clear">No publication blockers</span>}{item.authoringWarnings > 0 && <small>{item.authoringWarnings} authoring warning{item.authoringWarnings === 1 ? "" : "s"}</small>}</td>
            <td data-label="Comments"><span>{item.unresolvedComments}</span></td><td data-label="Pending approvals"><span>{item.pendingProposals}</span></td>
          </tr>)}</tbody>
        </table></div> : <p className="management-empty">{error ? "Project health is unavailable." : "No projects yet."}</p>}
      </section>}
      {showTrash && <section className="management-section" aria-labelledby="trash-title"><div className="management-section-title"><Trash2 size={17} /><h2 id="trash-title">Trash</h2></div>{trashLoading ? <p className="management-empty"><LoaderCircle size={16} className="management-spinner" />Loading trash...</p> : trashItems.length ? <div className="health-table-container"><table className="health-table trash-table"><thead><tr><th scope="col">Project</th><th scope="col">Moved to trash</th><th scope="col">Recovery ends</th><th scope="col">Action</th></tr></thead><tbody>{trashItems.map(item => <tr key={item.id}><td data-label="Project"><strong>{item.title}</strong><small>{item.sceneCount} scenes</small></td><td data-label="Moved to trash">{new Date(item.trashedAt).toLocaleString()}</td><td data-label="Recovery ends">{new Date(item.expiresAt).toLocaleDateString()}</td><td data-label="Action"><button type="button" className="button button-outline" disabled={disabled || lifecycleBusy} onClick={() => void restoreProject(item)}><RotateCcw size={14} />Restore</button></td></tr>)}</tbody></table></div> : <p className="management-empty">Trash is empty. Trashed projects are permanently removed after 30 days.</p>}</section>}
      <details className="management-section management-activity" aria-labelledby="activity-title">
        <summary className="management-section-title"><Activity size={17} /><h2 id="activity-title">Recent activity</h2><ChevronRight size={17} className="activity-chevron" /></summary>
        {events.length ? <div className="activity-scroll" role="region" aria-label="Recent activity list" tabIndex={0}><ul className="audit-list">{events.map((event) => <li key={event.eventId}><span className="audit-class">{event.eventClass}</span><strong>{event.eventName.replaceAll("_", " ").replaceAll(".", " / ")}</strong><time dateTime={event.occurredAt}>{new Date(event.occurredAt).toLocaleString()}</time><small>{health.find((item) => item.projectId === event.projectId)?.title || event.projectId || "Workspace"}</small></li>)}</ul></div> : <p className="management-empty">{loading ? "Loading activity..." : "No audit activity available."}</p>}
      </details>
    </div>
    {trashTarget && <EditorDialog labelledBy="trash-project-title" className="project-trash-dialog" onClose={() => { if (!lifecycleBusy) { setTrashTarget(null); setConfirmationChecked(false); } }} busy={lifecycleBusy}><div className="modal-head"><div><p className="eyebrow">PROJECT REMOVAL</p><h2 id="trash-project-title">Move project to trash?</h2></div></div><p><strong>{trashTarget.title}</strong> will disappear from My Work and project lists. You can restore it for 30 days. Generation jobs must finish before it can be moved.</p><a className="button button-outline trash-backup-link" href={`/api/projects/${trashTarget.projectId}/backup.zip`} download>Download project archive first</a><p className="project-trash-backup-note">Archives include authored project records and referenced templates; build outputs and some generation-job records are excluded.</p><label className="project-trash-checkbox"><input type="checkbox" checked={confirmationChecked} onChange={event => setConfirmationChecked(event.target.checked)} /><span>Are you sure you about that?</span></label><div className="modal-actions"><button type="button" className="button button-outline" disabled={lifecycleBusy} onClick={() => { setTrashTarget(null); setConfirmationChecked(false); }}>Cancel</button><button type="button" className="button button-danger" disabled={lifecycleBusy || !confirmationChecked} onClick={() => void moveToTrash()}><Trash2 size={14} />{lifecycleBusy ? "Moving..." : "Move to trash"}</button></div></EditorDialog>}
  </section>;
}