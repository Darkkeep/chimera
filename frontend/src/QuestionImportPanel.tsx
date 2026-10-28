import { useState } from "react";
import type { AssessmentItem, AssessmentSettings, Project } from "./App";
import { AssessmentDraftPreview } from "./AssessmentDraftPreview";
import { revisionConflictMessage, storyboardWriteHeaders } from "./revision";

type ImportQuestion = { index: number; source: string; title: string; item: AssessmentItem | null; settings?: AssessmentSettings | null; errors: string[]; warnings: string[] };
type ImportReview = { revision: number; digest: string; questions: ImportQuestion[] };

export function QuestionImportPanel({ project, onProjectUpdated, onClose, onBusyChange }: {
  project: Project;
  onProjectUpdated: (project: Project) => void;
  onClose: () => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [review, setReview] = useState<ImportReview | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [assessmentId, setAssessmentId] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const hasWarnings = review?.questions.some(row => selected.includes(row.index) && row.warnings.length > 0) ?? false;
  function working(value: boolean) { setBusy(value); onBusyChange(value); }
  async function check(response: Response) {
    if (response.ok) return;
    const body = await response.json() as { detail?: unknown };
    throw new Error(revisionConflictMessage(response.status) || (typeof body.detail === "string" ? body.detail : "Question import request failed."));
  }
  async function preview() {
    if (!file) return;
    working(true); setError(""); setReview(null); setSelected([]); setConfirmed(false);
    try {
      const data = new FormData(); data.append("file", file);
      const response = await fetch(`/api/projects/${project.id}/question-import/preview`, { method: "POST", body: data });
      await check(response);
      const result = await response.json() as ImportReview;
      setReview(result);
      setSelected(result.questions.filter(row => row.item && !row.errors.length).map(row => row.index));
    } catch (issue) { setError(issue instanceof Error ? issue.message : "The file could not be reviewed."); }
    finally { working(false); }
  }
  async function commit() {
    if (!file || !review || !selected.length) return;
    working(true); setError("");
    try {
      const data = new FormData();
      data.append("file", file); data.append("selected", JSON.stringify(selected)); data.append("digest", review.digest);
      data.append("assessment_id", assessmentId); data.append("confirm_warnings", String(confirmed));
      const response = await fetch(`/api/projects/${project.id}/question-import`, {
        method: "POST", body: data, headers: storyboardWriteHeaders(review.revision, false),
      });
      await check(response);
      onProjectUpdated(await response.json() as Project);
      onClose();
    } catch (issue) { setError(issue instanceof Error ? issue.message : "Questions could not be imported."); }
    finally { working(false); }
  }
  async function template(format: "csv" | "xlsx") {
    working(true); setError("");
    try {
      const response = await fetch(`/api/projects/${project.id}/question-import/template.${format}`);
      await check(response);
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a"); link.href = url; link.download = `chimera-questions-template.${format}`; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (issue) { setError(issue instanceof Error ? issue.message : "Template could not be downloaded."); }
    finally { working(false); }
  }
  return <section className="question-import" aria-labelledby="question-import-title">
    <h3 id="question-import-title">Import questions</h3>
    <p>Review QTI 2.1 XML/ZIP or a filled CSV/XLSX template before adding questions. Imports add new questions only; existing questions are never overwritten. Text-only interactions are supported; unsupported content is reported.</p>
    <div className="assessments-actions">
      <button type="button" className="button button-outline" disabled={busy} onClick={() => void template("csv")}>Download CSV template</button>
      <button type="button" className="button button-outline" disabled={busy} onClick={() => void template("xlsx")}>Download XLSX template</button>
    </div>
    <p>Templates include all seven question types. List and answer cells use JSON arrays; keep the column headings unchanged. Maximum upload: 10 MB, 500 questions.</p>
    <label>Question file<input type="file" accept=".xml,.zip,.csv,.xlsx" disabled={busy} onChange={event => {
      setFile(event.target.files?.[0] ?? null); setReview(null); setSelected([]); setConfirmed(false); setError("");
    }} /></label>
    <button type="button" className="button button-outline" disabled={busy || !file} onClick={() => void preview()}>{busy ? "Working..." : "Review import"}</button>
    {error && <p className="assessment-editor-error" role="alert">{error}</p>}
    {review && <>
      <p role="status">{selected.length} selected of {review.questions.length} reviewed questions. Nothing has been added yet.</p>
      <ul className="question-import-rows">
        {review.questions.map(row => <li key={row.index}>
          <label className="question-import-select"><input type="checkbox" disabled={busy || row.errors.length > 0 || !row.item} checked={selected.includes(row.index)} onChange={event => {
            setSelected(event.target.checked ? [...selected, row.index].sort((a, b) => a - b) : selected.filter(index => index !== row.index)); setConfirmed(false);
          }} /><span>{row.title || row.source} {row.item && <small>{row.item.identifier} · {row.item.type === "short-answer" ? "Fill-in-the-blank" : row.item.type}</small>}</span></label>
          <small>{row.source}</small>
          {row.errors.map((message, index) => <p className="assessment-editor-error" key={index}>Cannot import: {message}</p>)}
          {row.warnings.map((message, index) => <p className="question-import-warning" key={index}>Review warning: {message}</p>)}
          {row.item && <details><summary>Inspect question and metadata</summary>
            <AssessmentDraftPreview item={row.item} settings={row.settings} label={`Imported question ${row.index + 1}`} />
          </details>}
        </li>)}
      </ul>
      <label>Add imported questions to<select disabled={busy} value={assessmentId} onChange={event => setAssessmentId(event.target.value)}>
        <option value="">Question bank only (no assessment group)</option>
        {(project.storyboard.assessments ?? []).map(group => <option value={group.id} key={group.id}>{group.title}</option>)}
      </select></label>
      {hasWarnings && <label className="question-import-select"><input type="checkbox" checked={confirmed} disabled={busy} onChange={event => setConfirmed(event.target.checked)} /><span>I have reviewed the warnings for the selected questions.</span></label>}
      <p>Imported questions use Chimera's supported answer and scoring model. Review the questions before publishing. If the project has changed, choose Review import again.</p>
      <button type="button" className="button button-accent" disabled={busy || !selected.length || hasWarnings && !confirmed} onClick={() => void commit()}>Import {selected.length} selected questions</button>
    </>}
    <button type="button" className="button button-outline" disabled={busy} onClick={onClose}>Cancel import</button>
  </section>;
}
