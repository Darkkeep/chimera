import { useState } from "react";
import type { Project, Scene } from "./App";
import { EditorDialog } from "./EditorDialog";
import { HTML5Player } from "./HTML5Activity";
import type { HTML5Activity } from "./HTML5Activity";
import "./scene-experience.css";

export function HTML5ActivityPanel({ project, scene, onClose, onProjectUpdated }: {
  project: Project; scene: Scene; onClose: () => void; onProjectUpdated: (project: Project) => void;
}) {
  const [value, setValue] = useState<HTML5Activity>(scene.html5Activity ?? {
    assetId: "", title: scene.title.slice(0, 120), alternative: "", tracking: "view", scoreWeight: 1,
  });
  const [entrypoint, setEntrypoint] = useState("index.html");
  const [credit, setCredit] = useState(project.storyboard.assets.find(asset => asset.id === scene.html5Activity?.assetId)?.attributionText ?? "");
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [reviewed, setReviewed] = useState(false);
  const [removeConfirm, setRemoveConfirm] = useState(false);
  const [discardConfirm, setDiscardConfirm] = useState(false);
  const [saved, setSaved] = useState(JSON.stringify(value));
  function close() { if (JSON.stringify(value) !== saved) setDiscardConfirm(true); else onClose(); }
  function edit(changes: Partial<HTML5Activity>) { setValue(current => ({ ...current, ...changes })); setReviewed(false); setNotice(""); }
  async function act(action: () => Promise<void>) {
    setBusy(true); setError(""); setNotice("");
    try { await action(); } catch (issue) { setError(issue instanceof Error ? issue.message : "Activity operation failed."); }
    finally { setBusy(false); }
  }
  async function read(response: Response): Promise<Project> {
    const data = await response.json();
    if (!response.ok) throw new Error(typeof data.detail === "string" ? data.detail : `Activity operation failed (${response.status}); check required fields.`);
    return data;
  }
  async function save(remove = false) {
    const response = await fetch(`/api/projects/${project.id}/scenes/${scene.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json", "If-Match": `"${project.storyboard.revision}"` },
      body: JSON.stringify({ html5Activity: remove ? null : value }),
    });
    onProjectUpdated(await read(response)); setSaved(JSON.stringify(value));
    setNotice(remove ? "Activity removed; the original canvas is retained." : "Reviewed HTML5 activity saved.");
    setReviewed(false); if (remove) onClose();
  }
  const blocked = Boolean(scene.experience || scene.assessmentItem || scene.visualLayout?.timeline);
  return <EditorDialog className="experience-dialog" labelledBy="html5-title" busy={busy} onClose={close}>
    <header className="modal-head"><h2 id="html5-title">Imported HTML5 activity</h2><button disabled={busy} onClick={close}>Close</button></header>
    <p>Import an offline HTML file or ZIP (20 MB expanded, 500 files). Assets are compiled into a portable document.
      Classic scripts, styles, images, fonts and media are supported. Bundle modules first. Network calls, nested frames, forms and multi-page navigation are not supported.</p>
    <p>Imported code runs in a sandbox without access to Chimera, browser storage or the LMS.
      CSP restricts fetch/resource requests, but is not a network-egress firewall. Import trusted content only.
      Use the Chimera activity protocol or supported SCORM 1.2/2004 calls to report results. Arbitrary HTML does not automatically produce a score.</p>
    {error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
    {blocked && <p role="alert">Remove the existing native experience, assessment or timeline explicitly before attaching an HTML5 activity.</p>}
    <fieldset disabled={busy}><legend>Import and configure</legend>
      <label>ZIP entry point<input value={entrypoint} onChange={event => setEntrypoint(event.target.value)} /></label>
      <label>Import credit and usage rights<input maxLength={2000} value={credit} onChange={event => setCredit(event.target.value)} /></label>
      <label>Upload HTML5 file or ZIP<input type="file" accept=".html,.htm,.zip" onChange={event => {
        const file = event.target.files?.[0]; if (!file) return;
        void act(async () => {
          const form = new FormData(); form.append("file", file); form.append("entrypoint", entrypoint);
          form.append("credit", credit);
          const response = await fetch(`/api/projects/${project.id}/html5-import`, {
            method: "POST", headers: { "If-Match": `"${project.storyboard.revision}"` }, body: form,
          });
          const result = await response.json();
          if (!response.ok) throw new Error(typeof result.detail === "string" ? result.detail : "HTML5 import failed.");
          onProjectUpdated(result.project);
          edit({ assetId: result.assetId }); setNotice("Imported. Review configuration and preview before saving to this scene.");
        });
      }} /></label>
      <label>Imported package<select value={value.assetId} onChange={event => {
        edit({ assetId: event.target.value });
        setCredit(project.storyboard.assets.find(asset => asset.id === event.target.value)?.attributionText ?? "");
      }}>
        <option value="">Select a package</option>
        {project.storyboard.assets.filter(a => a.kind === "html5").map(a => <option key={a.id} value={a.id}>{a.filename}</option>)}
      </select></label>
      {value.assetId && <button type="button" onClick={() => void act(async () => {
        const response = await fetch(`/api/projects/${project.id}/assets/${value.assetId}/attribution`, {
          method: "PATCH", headers: { "Content-Type": "application/json", "If-Match": `"${project.storyboard.revision}"` },
          body: JSON.stringify({ attributionText: credit, attributionStatus: credit.trim() ? "complete" : "draft" }),
        });
        onProjectUpdated(await read(response)); setNotice("Activity credit saved.");
      })}>Save activity credit</button>}
      <label>Activity title<input maxLength={120} value={value.title} onChange={event => edit({ title: event.target.value })} /></label>
      <label>Accessible text alternative<textarea maxLength={10000} rows={4} value={value.alternative} onChange={event => edit({ alternative: event.target.value })} /></label>
      <label>Activity tracking<select value={value.tracking} onChange={event => edit({ tracking: event.target.value as HTML5Activity["tracking"] })}>
        <option value="view">View only (no reported completion gate)</option><option value="completion">Require reported completion</option>
        <option value="scored">Require reported completion and include score</option>
      </select></label>
      {value.tracking === "scored" && <label>Activity score weight<input type="number" min={0.01} max={100} step={0.01} value={value.scoreWeight} onChange={event => edit({ scoreWeight: Number(event.target.value) })} /></label>}
    </fieldset>
    <p>Required scenes in completion/scored mode wait for the activity's completion report. Scored activities join the course weighted score.
      Optional scored activities follow Include optional assessments. The package owns its internal attempts; this is not secure testing.</p>
    {value.assetId && <section aria-label="Imported activity preview"><HTML5Player projectId={project.id} activity={value} /></section>}
    <label className="experience-check"><input type="checkbox" checked={reviewed} onChange={event => setReviewed(event.target.checked)} />I reviewed the package, accessibility alternative, tracking mode and preview.</label>
    <button disabled={busy || blocked || !reviewed || !value.assetId || !value.title.trim() || !value.alternative.trim()}
      onClick={() => void act(() => save())}>Save reviewed HTML5 activity</button>
    {scene.html5Activity && <button disabled={busy} onClick={() => setRemoveConfirm(true)}>Remove HTML5 activity</button>}
    {removeConfirm && <div role="alert"><p>Remove the activity from this scene and restore its retained canvas? The imported package remains available.</p>
      <button disabled={busy} onClick={() => void act(() => save(true))}>Confirm remove HTML5 activity</button>
      <button disabled={busy} onClick={() => setRemoveConfirm(false)}>Keep activity</button></div>}
    {discardConfirm && <div role="alert"><p>Discard unsaved activity configuration? Imported packages and saved credits remain in the project.</p>
      <button disabled={busy} onClick={onClose}>Discard changes and close</button>
      <button disabled={busy} onClick={() => setDiscardConfirm(false)}>Keep editing activity</button></div>}
  </EditorDialog>;
}
