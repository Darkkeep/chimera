import { useEffect, useState } from "react";
import { Check, X } from "lucide-react";
import type { CourseCompletionSettings, Project } from "./App";

type CompletionSettingsEditorProps = {
  project: Project;
  onClose: () => void;
  onProjectUpdated: (project: Project) => void;
};

export function CompletionSettingsEditor({ project, onClose, onProjectUpdated }: CompletionSettingsEditorProps) {
  const [settings, setSettings] = useState<CourseCompletionSettings>(project.storyboard.completionSettings);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => setSettings(project.storyboard.completionSettings), [project.storyboard.completionSettings]);

  async function saveSettings() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/projects/${project.id}/completion-settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      if (!response.ok) {
        const detail = await response.json().catch(() => null) as { detail?: string } | null;
        throw new Error(detail?.detail || "Completion rules could not be saved.");
      }
      onProjectUpdated(await response.json() as Project);
      onClose();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Completion rules could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  return <div className="modal-backdrop" onClick={() => !busy && onClose()}>
    <section className="modal scene-editor" role="dialog" aria-modal="true" aria-labelledby="completion-settings-title" onClick={(event) => event.stopPropagation()}>
      <div className="modal-head"><div><p className="eyebrow">COURSE SUCCESS</p><h2 id="completion-settings-title">Completion rules</h2></div><button className="icon-button" onClick={onClose} disabled={busy} aria-label="Close completion settings"><X size={18} /></button></div>
      {error && <p className="assessment-editor-error" role="alert">{error}</p>}
      <label>Course passing score<select value={settings.passingScore} onChange={(event) => setSettings({ ...settings, passingScore: Number(event.target.value) })}>{[50, 60, 70, 75, 80, 85, 90, 100].map((score) => <option key={score} value={score}>{score}% weighted assessment score</option>)}</select></label>
      <label className="required-toggle"><input type="checkbox" checked={settings.includeOptionalAssessments} onChange={(event) => setSettings({ ...settings, includeOptionalAssessments: event.target.checked })} /><span>Include optional questions in course score</span></label>
      <p className="field-hint">Completion also requires visiting required scenes and finishing required audio. Assessment weights are set on each question.</p>
      <div className="modal-actions"><button className="button button-outline" onClick={onClose} disabled={busy}>Cancel</button><button className="button button-accent" onClick={() => void saveSettings()} disabled={busy}><Check size={15} /> Save rules</button></div>
    </section>
  </div>;
}