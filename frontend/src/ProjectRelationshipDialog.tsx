import { useState } from "react";
import type { Project } from "./App";
import { EditorDialog } from "./EditorDialog";

export type RelationshipProject = {
  projectId: string;
  title: string;
  parentProjectId?: string | null;
  siblingOrder?: number;
  metadataRevision?: number;
  canManageRelationship?: boolean;
};

type Props = {
  target: RelationshipProject;
  projects: RelationshipProject[];
  attaching: boolean;
  onClose: () => void;
  onUpdated: (project: Project) => Promise<void>;
};

export function ProjectRelationshipDialog({ target, projects, attaching, onClose, onUpdated }: Props) {
  const eligible = projects.filter(project => project.projectId !== target.projectId && !project.parentProjectId && project.canManageRelationship &&
    !projects.some(child => child.parentProjectId === project.projectId));
  const parents = projects.filter(project => project.projectId !== target.projectId && !project.parentProjectId && project.canManageRelationship);
  const [childId, setChildId] = useState(eligible[0]?.projectId ?? "");
  const [parentId, setParentId] = useState(target.parentProjectId ?? "");
  const [order, setOrder] = useState(String(attaching ? 0 : target.siblingOrder ?? 0));
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const child = attaching ? eligible.find(project => project.projectId === childId) : target;
  const orderNumber = Number(order);
  const validOrder = order.trim() !== "" && Number.isSafeInteger(orderNumber) && orderNumber >= 0 && orderNumber <= 2147483647;

  async function save() {
    if (!child || working || !validOrder) return;
    setWorking(true); setError("");
    try {
      const response = await fetch(`/api/projects/${child.projectId}/relationship`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parentProjectId: attaching ? target.projectId : parentId || null, siblingOrder: orderNumber, metadataRevision: child.metadataRevision }),
      });
      if (!response.ok) {
        const body = await response.json() as { detail?: string };
        throw new Error(response.status === 412 ? "Project relationships changed. Close this dialog and retry after refreshing My Work." : body.detail || "Project relationship could not be saved.");
      }
      await onUpdated(await response.json() as Project);
      onClose();
    } catch (issue) { setError(issue instanceof Error ? issue.message : "Project relationship could not be saved."); }
    finally { setWorking(false); }
  }

  return <EditorDialog labelledBy="project-relationship-title" className="project-relationship-dialog" onClose={onClose} busy={working}>
    <div className="modal-head"><h2 id="project-relationship-title">{attaching ? "Attach existing project" : "Manage subproject"}</h2></div>
    <p>{attaching ? `Attach a standalone project to ${target.title}. Projects that already have subprojects cannot be attached.` : `Move ${target.title} to another top-level project, detach it, or change its display order.`}</p>
    {attaching ? <label>Project to attach<select value={childId} disabled={working || !eligible.length} onChange={event => setChildId(event.target.value)}>
      {!eligible.length && <option value="">No eligible projects</option>}
      {eligible.map(project => <option key={project.projectId} value={project.projectId}>{project.title}</option>)}
    </select></label> : <label>Parent project<select value={parentId} disabled={working} onChange={event => setParentId(event.target.value)}>
      <option value="">None (detach to top level)</option>
      {target.parentProjectId && !parents.some(project => project.projectId === target.parentProjectId) && <option value={target.parentProjectId}>Current parent (unavailable)</option>}
      {parents.map(project => <option key={project.projectId} value={project.projectId}>{project.title}</option>)}
    </select></label>}
    <label>Display order<input type="number" min="0" max="2147483647" step="1" value={order} disabled={working} onChange={event => setOrder(event.target.value)} /></label>
    <p className="field-hint">Lower numbers appear first. Equal numbers use a stable project-ID order. Content, settings, permissions, and exports remain independent.</p>
    {error && <p role="alert">{error}</p>}
    <div className="modal-actions"><button type="button" className="button button-outline" disabled={working} onClick={onClose}>Cancel</button>
      <button type="button" className="button button-accent" disabled={working || !child || !child.metadataRevision || !validOrder} onClick={() => void save()}>{attaching ? "Attach project" : "Save relationship"}</button></div>
  </EditorDialog>;
}
