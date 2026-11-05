import { useEffect, useState } from "react";
import type { Project, Scene } from "./App";
import { PythiaProcessing } from "./PythiaProcessing";

type Shot = { text: string; durationSeconds: number; transition: "fade" | "none" };
type Treatment = { title: string; purpose: string; rationale: string; shots: Shot[]; productionNeeds: string[] };
type Context = { sourceRevision: number; fingerprint: string; scene: Pick<Scene, "title" | "extractedText" | "narration" | "actionDescription" | "notes" | "experience">; designBrief: string };
type Draft = { sourceRevision: number; treatment: Treatment; designBrief: string; usesDesignBrief: boolean };
type TreatmentState = {
  context: Context;
  draft: Draft | null;
  operation: { requestId: string; status: "running" | "completed" | "failed"; error: string | null } | null;
};

async function responseJson<T>(response: Response): Promise<T> {
  const value = await response.json() as T & { detail?: string };
  if (!response.ok) throw new Error(value.detail || "Video treatment request failed.");
  return value;
}

function validTreatment(treatment: Treatment) {
  const total = treatment.shots.reduce((sum, shot) => sum + shot.durationSeconds, 0);
  return treatment.title.trim() && treatment.title.length <= 120 && treatment.purpose.trim() &&
    treatment.purpose.length <= 2000 && treatment.rationale.trim() && treatment.rationale.length <= 2000 &&
    treatment.shots.length >= 1 && treatment.shots.length <= 10 && total >= 4 && total <= 30 &&
    treatment.shots.every(shot => shot.text.trim() && shot.text.length <= 240 &&
      Number.isInteger(shot.durationSeconds) && shot.durationSeconds >= 2 && shot.durationSeconds <= 30);
}

export function VideoTreatmentPanel({ project, scene, connectionId, onRender }: {
  project: Project; scene: Scene; connectionId: string;
  onRender: (draft: { sourceRevision: number; treatment: Treatment }) => Promise<void>;
}) {
  const url = `/api/projects/${project.id}/scenes/${scene.id}/video-treatment`;
  const [state, setState] = useState<TreatmentState | null>(null);
  const [treatment, setTreatment] = useState<Treatment | null>(null);
  const [direction, setDirection] = useState("");
  const [duration, setDuration] = useState(30);
  const [includeBrief, setIncludeBrief] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [uncertain, setUncertain] = useState(false);
  const [renderAttempted, setRenderAttempted] = useState(false);
  const running = state?.operation?.status === "running";
  const stale = Boolean(state?.draft && (state.draft.sourceRevision !== state.context.sourceRevision ||
    state.draft.usesDesignBrief && state.draft.designBrief !== state.context.designBrief));
  const valid = treatment && validTreatment(treatment);
  const total = treatment?.shots.reduce((sum, shot) => sum + shot.durationSeconds, 0) || 0;
  const dirty = Boolean(treatment && JSON.stringify(treatment) !== JSON.stringify(state?.draft?.treatment));

  function receive(value: TreatmentState) {
    setState(value);
    setTreatment(value.draft?.treatment || null);
    if (value.draft && value.operation?.status !== "running") setDuration(value.draft.treatment.shots.reduce((sum, shot) => sum + shot.durationSeconds, 0));
    setUncertain(false);
  }

  useEffect(() => {
    const controller = new AbortController();
    void fetch(url, { signal: controller.signal }).then(response => responseJson<TreatmentState>(response))
      .then(value => { if (!controller.signal.aborted) receive(value); })
      .catch(issue => { if (!controller.signal.aborted) setError(issue instanceof Error ? issue.message : "Scene context is unavailable."); });
    return () => controller.abort();
  }, [url]);

  useEffect(() => {
    if (!running) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const value = await responseJson<TreatmentState>(await fetch(url, { signal: controller.signal }));
        if (controller.signal.aborted) return;
        if (value.operation?.status === "running") {
          setState(value);
          timer = setTimeout(poll, 2000);
        } else if (value.operation?.status === "failed") {
          setState(value);
          setUncertain(false);
        } else receive(value);
      } catch (issue) {
        if (!controller.signal.aborted) {
          setError(issue instanceof Error ? issue.message : "Design status unavailable. Refresh before retrying.");
          timer = setTimeout(poll, 4000);
        }
      }
    }
    timer = setTimeout(poll, 1000);
    return () => { controller.abort(); clearTimeout(timer); };
  }, [running, url]);

  async function refresh() {
    setWorking(true); setError(""); setNotice("");
    try { receive(await responseJson<TreatmentState>(await fetch(url))); }
    catch (issue) { setError(issue instanceof Error ? issue.message : "Scene context is unavailable."); }
    finally { setWorking(false); }
  }

  async function design() {
    if (!state || !direction.trim() || running || working) return;
    setWorking(true); setError(""); setNotice("");
    try {
      const response = await fetch(url, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId: crypto.randomUUID(), sourceRevision: state.context.sourceRevision, contextFingerprint: state.context.fingerprint,
          direction, durationSeconds: duration, includeDesignBrief: includeBrief, currentTreatment: valid ? treatment : null }),
      });
      if (!response.ok) {
        await responseJson<TreatmentState>(response);
        return;
      }
      setState(await responseJson<TreatmentState>(response));
    } catch (issue) {
      setUncertain(true);
      setError(`${issue instanceof Error ? issue.message : "Design request unavailable."} Refresh context and status before retrying; the request may have started.`);
    } finally { setWorking(false); }
  }

  async function save(render = false) {
    if (!state?.draft || !treatment || !valid || stale || running || working) return;
    setWorking(true); setError(""); setNotice("");
    try {
      const draft = { sourceRevision: state.draft.sourceRevision, treatment };
      receive(await responseJson<TreatmentState>(await fetch(url, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(draft),
      })));
      if (render) {
        setRenderAttempted(true);
        await onRender(draft);
        setNotice("Render submitted. Follow the generation status below; the result will be a reviewable candidate.");
      }
      else setNotice("Treatment saved. Nothing has been rendered.");
    } catch (issue) { setError(issue instanceof Error ? issue.message : "Treatment could not be saved or rendered."); }
    finally { setWorking(false); }
  }

  function editShot(index: number, patch: Partial<Shot>) {
    if (treatment) setTreatment({ ...treatment, shots: treatment.shots.map((shot, i) => i === index ? { ...shot, ...patch } : shot) });
  }

  return <section className="video-treatment" aria-label="Scene-aware video treatment">
    <h3>Design the video with Pythia</h3>
    <p className="field-hint">Design first, review together, then render. Pythia uses the scene's content, not just its title. This does not change the scene or generate media.</p>
    {state && <details>
      <summary>Context shared with Pythia when you request a treatment</summary>
      <dl className="video-context">
        <dt>Scene</dt><dd>{state.context.scene.title}</dd>
        <dt>Screen text</dt><dd>{state.context.scene.extractedText.join("\n\n") || "None"}</dd>
        <dt>Narration</dt><dd>{state.context.scene.narration || "None"}</dd>
        <dt>Production direction</dt><dd>{state.context.scene.actionDescription || "None"}</dd>
        <dt>Author notes</dt><dd>{state.context.scene.notes || "None"}</dd>
        {state.context.scene.experience && <><dt>Current native learner experience (not a video render specification)</dt><dd><pre>{JSON.stringify(state.context.scene.experience, null, 2)}</pre></dd></>}
        <dt>Agreed design brief</dt><dd>{state.context.designBrief || "No agreed brief is currently recorded. Pythia will use the scene and your direction."}</dd>
      </dl>
      <p className="field-hint">Only the displayed scene text, your direction, the optional brief and your current treatment are sent to Pythia's configured model provider. No source documents, attachments or private conversation history are sent.</p>
    </details>}
    <fieldset disabled={working || running || !state}>
      {state?.context.designBrief && <label className="video-brief-choice"><input type="checkbox" checked={includeBrief} onChange={event => setIncludeBrief(event.target.checked)} /> Include the agreed design brief in the design request</label>}
      <label>Video design direction<textarea rows={3} maxLength={2000} value={direction} onChange={event => setDirection(event.target.value)} placeholder="What should learners understand or do? What should this video emphasize, or what should Pythia revise?" /></label>
      <label>Treatment duration (seconds)<input type="number" min={4} max={30} step={1} value={duration} onChange={event => setDuration(Number(event.target.value))} /></label>
      <p className="field-hint">Requesting a treatment makes a potentially billable Pythia model call, not a Shotstack render.</p>
      <button type="button" className="button button-outline" disabled={!direction.trim() || uncertain || !Number.isInteger(duration) || duration < 4 || duration > 30 || Boolean(treatment && !valid)} onClick={() => void design()}>{treatment ? "Refine treatment with Pythia" : "Propose treatment with Pythia"}</button>
    </fieldset>
    {running && <PythiaProcessing title="Designing video treatment" detail="Pythia is proposing text shots. Nothing is being rendered." />}
    {state?.operation?.status === "failed" && <p role="alert">{state.operation.error}</p>}
    {stale && <p role="alert">The scene context or agreed brief changed. Ask Pythia to refine the treatment using the current context before rendering.</p>}
    {treatment && <fieldset disabled={working || running}>
      <legend>Review and edit the treatment</legend>
      <p className="field-hint">Save edits before leaving this form. Switching scenes or workflows reloads the last saved treatment. Rendering also saves these exact edits first.</p>
      <label>Treatment title<input maxLength={120} value={treatment.title} onChange={event => setTreatment({ ...treatment, title: event.target.value })} /></label>
      <label>Learning purpose<textarea maxLength={2000} value={treatment.purpose} onChange={event => setTreatment({ ...treatment, purpose: event.target.value })} /></label>
      <label>Design rationale<textarea maxLength={2000} value={treatment.rationale} onChange={event => setTreatment({ ...treatment, rationale: event.target.value })} /></label>
      {state?.draft?.designBrief && <details><summary>Design brief used for this treatment</summary><p className="video-context">{state.draft.designBrief}</p></details>}
      <ol className="video-shots">{treatment.shots.map((shot, index) => <li key={index}>
        <label>Shot {index + 1} text<textarea rows={3} maxLength={240} value={shot.text} onChange={event => editShot(index, { text: event.target.value })} /></label>
        <label>Shot {index + 1} seconds<input type="number" min={2} max={30} step={1} value={shot.durationSeconds} onChange={event => editShot(index, { durationSeconds: Number(event.target.value) })} /></label>
        <label>Shot {index + 1} transition<select value={shot.transition} onChange={event => editShot(index, { transition: event.target.value === "fade" ? "fade" : "none" })}><option value="fade">Fade in and out</option><option value="none">None</option></select></label>
        <button type="button" className="button button-outline" disabled={treatment.shots.length === 1} onClick={() => setTreatment({ ...treatment, shots: treatment.shots.filter((_, i) => i !== index) })}>Remove shot {index + 1}</button>
      </li>)}</ol>
      <button type="button" className="button button-outline" disabled={treatment.shots.length >= 10} onClick={() => setTreatment({ ...treatment, shots: [...treatment.shots, { text: "", durationSeconds: 4, transition: "fade" }] })}>Add text shot</button>
      <p className="field-hint">Total: {total} seconds. Use 1-10 readable shots, 2 seconds or more each, totaling 4-30 seconds. Text is limited to 240 characters per shot; preview the candidate for reading pace and layout.</p>
      {!valid && <p role="alert">Complete the treatment and correct the text or timing limits before saving, refining or rendering.</p>}
      <h4>Production needs - not implemented in this render</h4>
      {treatment.productionNeeds.length ? <ul>{treatment.productionNeeds.map((need, index) => <li key={index}>{need}</li>)}</ul> : <p className="field-hint">No additional production needs proposed.</p>}
      <p className="field-hint">Shotstack receives only the exact shot text, durations, transitions and fixed text styling. Silent landscape MP4, dark background, no footage, images or narration. Sandbox renders are watermarked. The scene, notes, brief and consultation are not sent to Shotstack.</p>
      <button type="button" className="button button-outline" disabled={!valid || stale || !dirty} onClick={() => void save()}>Save treatment edits</button>
      <p className="field-hint">Render is a separate, potentially billable action using the selected connection ({connectionId}). Cancelling locally does not cancel provider billing. The result is a candidate for review, not automatically attached to the scene.</p>
      <button type="button" className="button button-accent" disabled={!valid || stale || uncertain || renderAttempted} onClick={() => void save(true)}>Render reviewed treatment</button>
      {renderAttempted && <><p className="field-hint">A render was attempted. Check media-generation status and the provider dashboard before submitting again, even if the request failed to return a receipt.</p><button type="button" className="button button-outline" onClick={() => setRenderAttempted(false)}>Prepare another potentially billable render</button></>}
    </fieldset>}
    <button type="button" className="button button-outline" disabled={working || running} onClick={() => void refresh()}>Refresh context and status{dirty ? " (discards unsaved edits)" : ""}</button>
    {notice && <p role="status">{notice}</p>}
    {error && <p role="alert">{error}</p>}
  </section>;
}
