import { useState } from "react";
import { ArrowDown, ArrowUp, Check, Download, Pencil, Plus, RefreshCw, Trash2, X } from "lucide-react";
import type { Assessment, Project } from "./App";
import { EditorDialog } from "./EditorDialog";
import { revisionConflictMessage, storyboardWriteHeaders } from "./revision";
import "./assessments.css";

type Draft = { id: string | null; title: string; questionSceneIds: string[]; revision: number };

export function AssessmentsEditor({ project, canExport, onClose, onProjectUpdated }: {
  project: Project;
  canExport: boolean;
  onClose: () => void;
  onProjectUpdated: (project: Project) => void;
}) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [stale, setStale] = useState(false);
  const groups = project.storyboard.assessments ?? [];
  const questions = project.storyboard.scenes.filter(scene => scene.sceneType === "question");
  const questionById = new Map(questions.map(scene => [scene.id, scene]));

  function edit(group?: Assessment) {
    if (draft && !window.confirm("Discard the unsaved assessment changes?")) return;
    setDraft({ id: group?.id ?? null, title: group?.title ?? "", questionSceneIds: [...(group?.questionSceneIds ?? [])], revision: project.storyboard.revision });
    setError("");
    setStale(false);
  }

  function close() {
    if (!draft || window.confirm("Discard the unsaved assessment changes?")) onClose();
  }

  async function failure(response: Response, fallback: string): Promise<never> {
    const conflict = revisionConflictMessage(response.status);
    if (conflict) setStale(true);
    const detail = await response.json().catch(() => null) as { detail?: unknown } | null;
    throw new Error(conflict || (typeof detail?.detail === "string" ? detail.detail : fallback));
  }

  async function save() {
    if (!draft || !draft.title.trim() || busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/projects/${project.id}/assessments${draft.id ? `/${encodeURIComponent(draft.id)}` : ""}`, {
        method: draft.id ? "PATCH" : "POST",
        headers: storyboardWriteHeaders(draft.revision),
        body: JSON.stringify({ title: draft.title.trim(), questionSceneIds: draft.questionSceneIds }),
      });
      if (!response.ok) await failure(response, "Assessment could not be saved.");
      onProjectUpdated(await response.json() as Project);
      setDraft(null);
      setStale(false);
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : "Assessment could not be saved.");
    } finally { setBusy(false); }
  }

  async function remove(group: Assessment) {
    if (busy || !window.confirm(`Delete assessment "${group.title}"? Its question scenes will not be deleted.`)) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/projects/${project.id}/assessments/${encodeURIComponent(group.id)}`, {
        method: "DELETE", headers: storyboardWriteHeaders(project.storyboard.revision),
      });
      if (!response.ok) await failure(response, "Assessment could not be deleted.");
      const updated = await response.json() as Project;
      onProjectUpdated(updated);
      setDraft(current => current?.id === group.id ? null : current ? { ...current, revision: updated.storyboard.revision } : null);
      setStale(false);
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : "Assessment could not be deleted.");
    } finally { setBusy(false); }
  }

  async function reload() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/projects/${project.id}`);
      if (!response.ok) await failure(response, "Latest storyboard could not be loaded.");
      const updated = await response.json() as Project;
      onProjectUpdated(updated);
      setDraft(current => current ? { ...current, revision: updated.storyboard.revision } : null);
      setStale(false);
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : "Latest storyboard could not be loaded.");
    } finally { setBusy(false); }
  }

  async function download(group: Assessment) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/projects/${project.id}/assessments/${encodeURIComponent(group.id)}/assessment.qti.zip`);
      if (!response.ok) await failure(response, "QTI test could not be downloaded.");
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = `${project.id}-${group.id}-assessment.qti.zip`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : "QTI test could not be downloaded.");
    } finally { setBusy(false); }
  }

  function move(questionId: string, direction: number) {
    setDraft(current => {
      if (!current) return current;
      const questionSceneIds = [...current.questionSceneIds];
      const index = questionSceneIds.indexOf(questionId);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= questionSceneIds.length) return current;
      [questionSceneIds[index], questionSceneIds[target]] = [questionSceneIds[target], questionSceneIds[index]];
      return { ...current, questionSceneIds };
    });
  }

  const selectedIds = draft?.questionSceneIds ?? [];
  const orderedIds = [...selectedIds, ...questions.filter(scene => !selectedIds.includes(scene.id)).map(scene => scene.id)];
  const authoredCount = selectedIds.filter(id => questionById.get(id)?.assessmentItem).length;

  return <EditorDialog labelledBy="assessments-title" className="scene-editor assessments-editor" busy={busy} onClose={close}>
    <div className="modal-head"><h2 id="assessments-title">Assessments</h2><button type="button" className="icon-button" title="Close assessments" aria-label="Close assessments" disabled={busy} onClick={close}><X size={18} /></button></div>
    {error && <p className="assessment-editor-error" role="alert">{error}</p>}
    {stale && <button type="button" className="button button-outline" disabled={busy} onClick={() => void reload()}><RefreshCw size={15} /> Reload latest, keep draft</button>}
    <div className="assessments-heading"><h3>Saved assessments ({groups.length})</h3><button type="button" className="button button-outline" disabled={busy} onClick={() => edit()}><Plus size={15} /> Create assessment</button></div>
    <ul className="assessments-list" aria-label="Saved assessments">
      {groups.map(group => {
        const authored = group.questionSceneIds.filter(id => questionById.get(id)?.assessmentItem).length;
        return <li key={group.id}>
          <div className="assessments-description"><strong>{group.title}</strong><span>{group.questionSceneIds.length} questions · {authored} authored · {group.questionSceneIds.length - authored} unauthored</span></div>
          <div className="assessments-actions">
            <button type="button" className="icon-button" disabled={busy} title={`Edit ${group.title}`} aria-label={`Edit ${group.title}`} onClick={() => edit(group)}><Pencil size={16} /></button>
            <button type="button" className="icon-button" disabled={busy} title={`Delete ${group.title}`} aria-label={`Delete ${group.title}`} onClick={() => void remove(group)}><Trash2 size={16} /></button>
            <span title={!canExport ? "Export permission required" : authored < 2 ? "Requires at least 2 authored questions" : `Download QTI test for ${group.title}`}><button type="button" className="button button-outline" disabled={busy || !canExport || authored < 2} aria-label={`Download QTI test for ${group.title}`} onClick={() => void download(group)}><Download size={15} /> Download QTI test</button></span>
          </div>
        </li>;
      })}
    </ul>
    {!groups.length && <p>No assessments yet.</p>}
    {draft && <form className="assessments-draft" onSubmit={event => { event.preventDefault(); void save(); }}>
      <h3>{draft.id ? "Edit assessment" : "Create assessment"}</h3>
      <fieldset disabled={busy}>
        <label>Assessment title<input autoFocus required maxLength={120} value={draft.title} onChange={event => setDraft({ ...draft, title: event.target.value })} /></label>
        <p role="status">{selectedIds.length} selected · {authoredCount} authored · {selectedIds.length - authoredCount} unauthored</p>
        <ul className="assessments-questions" aria-label="Question selection">
          {orderedIds.map(id => {
            const question = questionById.get(id);
            const index = selectedIds.indexOf(id);
            const title = question?.title ?? "Unavailable question";
            return <li key={id}>
              <label className="assessments-question"><input type="checkbox" checked={index >= 0} onChange={event => setDraft({ ...draft, questionSceneIds: event.target.checked ? [...selectedIds, id] : selectedIds.filter(selected => selected !== id) })} /><span>{index >= 0 && `${index + 1}. `}{title}<small>{question?.assessmentItem ? "Authored" : question ? "Unauthored" : "Removed or no longer a question"}</small></span></label>
              {index >= 0 && <div className="assessments-actions"><button type="button" className="icon-button" title={`Move ${title} earlier`} aria-label={`Move ${title} earlier`} disabled={busy || index === 0} onClick={() => move(id, -1)}><ArrowUp size={16} /></button><button type="button" className="icon-button" title={`Move ${title} later`} aria-label={`Move ${title} later`} disabled={busy || index === selectedIds.length - 1} onClick={() => move(id, 1)}><ArrowDown size={16} /></button></div>}
            </li>;
          })}
        </ul>
        {!questions.length && <p>No question scenes available.</p>}
      </fieldset>
      <div className="modal-actions"><button type="button" className="button button-outline" disabled={busy} onClick={() => { setDraft(null); setError(""); setStale(false); }}>Cancel</button><button type="submit" className="button button-accent" disabled={busy || !draft.title.trim()}><Check size={15} /> Save assessment</button></div>
    </form>}
  </EditorDialog>;
}