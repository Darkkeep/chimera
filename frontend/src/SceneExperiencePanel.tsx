import { useCallback, useEffect, useRef, useState } from "react";
import type { Project, Scene } from "./App";
import { EditorDialog } from "./EditorDialog";
import { ExperienceEditor } from "./ExperienceEditor";
import { newActivity } from "./ExperienceActivityEditor";
import { NativeExperience, experienceImagesForProject } from "./NativeExperience";
import type { Experience } from "./NativeExperience";
import "./scene-experience.css";

type Treatment = {
  learningIntent: string; rationale: string; experience: Experience;
  productionNeeds: { description: string; requiredBeforeApply: boolean }[];
};
type Context = {
  revision: number; fingerprint: string; scene: Scene; designBrief: string; assemblyBlocked: boolean;
  sources: { id: string; title: string; version: string; sha256: string; authoritative: boolean }[];
  selectedSources: { id: string; title: string; version: string; passages: { locator: string; text: string }[] }[];
};
type State = {
  context: Context;
  draft: { id: string; status: string; treatment: Treatment; sourceIds: string[]; contextFingerprint: string;
    provenance: { direction: string; revision: number; sources: { title: string; version: string; sha256: string }[]; designBrief: string } } | null;
  operation: { status: string; error: string | null } | null;
  project?: Project;
};
async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const value = await response.json();
  if (!response.ok) throw new Error(typeof value.detail === "string" ? value.detail : Array.isArray(value.detail)
    ? value.detail.map((issue: { loc: (string | number)[]; msg: string }) => `${issue.loc.join(".")}: ${issue.msg}`).join("; ")
    : `Request failed (${response.status}). Check all required fields and color contrast.`);
  return value;
}

export function SceneExperiencePanel({ project, scene, onClose, onProjectUpdated }: {
  project: Project; scene: Scene; onClose: () => void; onProjectUpdated: (project: Project) => void;
}) {
  const url = `/api/projects/${project.id}/scenes/${scene.id}/experience-treatment`;
  const [state, setState] = useState<State | null>(null);
  const [treatment, setTreatment] = useState<Treatment | null>(null);
  const [sourceIds, setSourceIds] = useState<string[]>([]);
  const [loadedIds, setLoadedIds] = useState<string[]>([]);
  const [direction, setDirection] = useState("");
  const [includeBrief, setIncludeBrief] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [editingApplied, setEditingApplied] = useState(false);
  const [discardConfirm, setDiscardConfirm] = useState(false);
  const [restoreConfirm, setRestoreConfirm] = useState(false);
  const [saved, setSaved] = useState("");
  const mounted = useRef(true);
  const running = state?.operation?.status === "running";
  const pending = busy || Boolean(running);
  const query = useCallback((ids: string[]) => ids.length ? "?" + new URLSearchParams(ids.map(id => ["source_ids", id])).toString() : "", []);
  useEffect(() => {
    mounted.current = true;
    json<State>(url).then(async initial => {
      const savedIds = initial.draft?.sourceIds ?? [];
      const ids = savedIds.filter(id => initial.context.sources.some(source => source.id === id));
      let value = initial;
      let loaded: string[] = [];
      let contextError = ids.length !== savedIds.length ? "A previously selected source is no longer available. Your draft is preserved; review current context before refining." : "";
      if (ids.length) {
        try { value = await json<State>(url + query(ids)); loaded = ids; }
        catch (issue) { contextError = `${issue instanceof Error ? issue.message : "Source context could not load."} Your draft is preserved. Deselect unavailable sources and load current context before refining.`; }
      }
      if (!mounted.current) return;
      setState(value);
      setLoadedIds(loaded); setSourceIds(ids); setError(contextError);
      if (value.draft) {
        const current = value.draft.status === "applied" && value.context.scene.experience
          ? { ...value.draft.treatment, experience: value.context.scene.experience } : value.draft.treatment;
        setTreatment(current); setSaved(JSON.stringify(current));
        setDirection(value.draft.provenance.direction);
      } else if (value.context.scene.experience) {
        const current = { learningIntent: "Existing authored native scene", rationale: "Edit the existing learner experience without a model call.",
          experience: value.context.scene.experience, productionNeeds: [] };
        setTreatment(current); setSaved(JSON.stringify(current));
      }
    }).catch(issue => { if (mounted.current) setError(issue.message); });
    return () => { mounted.current = false; };
  }, [url, query]);
  useEffect(() => {
    if (!running) return;
    const timer = setTimeout(() => {
      json<State>(url + query(loadedIds)).then(async initial => {
        const ids = initial.operation?.status === "completed" && initial.draft ? initial.draft.sourceIds : loadedIds;
        const value = JSON.stringify(ids) !== JSON.stringify(loadedIds) ? await json<State>(url + query(ids)) : initial;
        if (!mounted.current) return;
        setState(value);
        if (value.operation?.status === "completed" && value.draft) {
          setLoadedIds(ids); setSourceIds(ids);
          setTreatment(value.draft.treatment); setSaved(JSON.stringify(value.draft.treatment));
          setAcknowledged(false); setEditingApplied(false);
          setNotice("Proposal ready. Nothing has been applied.");
        }
      }).catch(issue => {
        if (!mounted.current) return;
        setError(issue.message);
        setState(previous => previous ? { ...previous, operation: null } : previous);
      });
    }, 750);
    return () => clearTimeout(timer);
  }, [running, state, url, loadedIds, query]);
  const contextDirty = JSON.stringify(sourceIds) !== JSON.stringify(loadedIds);
  const dirty = Boolean(treatment && JSON.stringify(treatment) !== saved);
  const stale = state?.draft && state.draft.status !== "applied" && state.draft.contextFingerprint !== state.context.fingerprint;
  function edit(value: Treatment) { setTreatment(value); setAcknowledged(false); setNotice(""); }
  async function act(action: () => Promise<void>) {
    setBusy(true); setError(""); setNotice("");
    try { await action(); } catch (issue) { setError(issue instanceof Error ? issue.message : "The request failed. Nothing further was started."); }
    finally { setBusy(false); }
  }
  function close() {
    if (dirty) { setDiscardConfirm(true); return; }
    onClose();
  }
  async function design() {
    if (!state) return;
    const value = await json<State>(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
      requestId: crypto.randomUUID(), contextFingerprint: state.context.fingerprint, direction,
      sourceIds: loadedIds, includeDesignBrief: includeBrief, currentTreatment: treatment,
    }) });
    setState(value); setAcknowledged(false);
  }
  async function review(apply: boolean) {
    if (!state?.draft || !treatment) return;
    const value = await json<State>(url + (apply ? "/apply" : ""), {
      method: apply ? "POST" : "PUT", headers: { "Content-Type": "application/json", "If-Match": `"${state.context.revision}"` },
      body: JSON.stringify({ draftId: state.draft.id, treatment }),
    });
    setState(value); setSaved(JSON.stringify(treatment)); setAcknowledged(false);
    if (value.project) onProjectUpdated(value.project);
    setNotice(apply ? "Experience applied. No media generation or video render was started." : "Private treatment saved. The scene is unchanged.");
  }
  async function saveApplied() {
    if (!treatment || !state) return;
    const value = await json<Project>(`/api/projects/${project.id}/scenes/${scene.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json", "If-Match": `"${state.context.revision}"` },
      body: JSON.stringify({ experience: treatment.experience }),
    });
    onProjectUpdated(value); setSaved(JSON.stringify(treatment)); setEditingApplied(false);
    setAcknowledged(false); setNotice("Native scene edits saved. No model or media provider was called.");
    setState(await json<State>(url + query(loadedIds)));
  }
  const blocked = treatment?.productionNeeds.some(need => need.requiredBeforeApply);
  const externalReviewNeeded = treatment?.experience.activities?.some(activity => activity.kind === "external-link" && !activity.authorReviewed);
  const applied = Boolean(scene.experience && (!state?.draft || state.draft.status === "applied"));
  return <EditorDialog className="experience-dialog" labelledBy="experience-title" busy={pending} onClose={close}>
    <header className="modal-head"><div><p className="eyebrow">PYTHIA / SCENE EXPERIENCE</p><h2 id="experience-title">Design the whole scene</h2></div><button type="button" disabled={pending} onClick={close}>Close</button></header>
    <p>Create concept flows, reveals, branching decisions, hotspots, sequencing, guided practice, screenshot-based software walkthroughs, before/after image comparisons and scripted learner roleplays. Walkthroughs display project screenshots and learner-confirmed instructions. Comparisons show two full project images with text alternatives. Roleplays are fixed scripts; learner responses stay in tab memory and are never sent to AI or saved. External launch links require separate author review and learner consent, internet access and an offline alternative. Activities are formative. Design calls use your configured model and may incur charges. Authoring, preview and save do not call a provider.</p>
    {error && <p role="alert">{error}</p>}
    {state?.operation?.error && <p role="alert">{state.operation.error}</p>}
    {notice && <p role="status">{notice}</p>}
    {discardConfirm && <div role="alert"><p>Your treatment has unsaved edits.</p><button onClick={onClose}>Discard edits and close</button><button onClick={() => setDiscardConfirm(false)}>Keep editing</button></div>}
    {!state ? <p role="status">{error ? "Context unavailable. Close and reopen to retry." : "Loading scene context…"}</p> : <>
      <details><summary>Context shared only when you request a design</summary>
        <p>Storyboard revision {state.context.revision}. Scene content, notes, narration, current experience and layout are shared. Narration text is context, not authorization to generate audio. Other scenes and consultation history are not shared.</p>
        <pre>{JSON.stringify(state.context.scene, null, 2)}</pre>
        <label className="experience-check"><input type="checkbox" checked={includeBrief} disabled={pending} onChange={event => setIncludeBrief(event.target.checked)} />Include agreed design brief</label>
        <p>{state.context.designBrief || "No agreed design brief is available. You can return to Consult Pythia to agree one first."}</p>
        <fieldset disabled={pending}><legend>Select reference sources explicitly</legend>
          {state.context.sources.map(source => <label className="experience-check" key={source.id}><input type="checkbox" checked={sourceIds.includes(source.id)} onChange={event => setSourceIds(event.target.checked ? [...sourceIds, source.id] : sourceIds.filter(id => id !== source.id))} />{source.title} (v{source.version}; {source.authoritative ? "authoritative" : "supporting source"})</label>)}
        </fieldset>
        <button type="button" disabled={pending || sourceIds.length > 5} onClick={() => void act(async () => {
          const value = await json<State>(url + query(sourceIds)); setState(value); setLoadedIds([...sourceIds]);
        })}>Load selected context</button>
        <p>Load selections to inspect exactly what will be shared. No source text is silently truncated.</p>
        {state.context.selectedSources.map(source => <details key={source.id}><summary>{source.title} v{source.version}</summary>{source.passages.map((passage, i) => <p key={i}><strong>{passage.locator}</strong> {passage.text}</p>)}</details>)}
      </details>
      {contextDirty && <p role="status">Source selections changed. Load selected context before requesting a design.</p>}
      {state.context.assemblyBlocked && <p role="alert">Native authoring cannot replace an existing HTML5 activity, assessment or timeline. Remove those components explicitly first, or choose another content scene.</p>}
      {!treatment && <button type="button" disabled={pending || state.context.assemblyBlocked} onClick={() => {
        setEditingApplied(true);
        edit({ learningIntent: "Author a native learning activity.", rationale: "Manually authored without a provider.",
          productionNeeds: [], experience: { version: 1, heading: scene.title.slice(0, 120), introduction: "Explore and practice the ideas in this scene.",
            flow: [], reveals: [], activities: [newActivity("branching")], conclusion: "Reflect on what you learned.", motion: false,
            background: "#100818", foreground: "#E8E5EA", accent: "#FF32AA", accentText: "#100818", diagramAccent: "#8542E8" } });
      }}>Start native experience without Pythia</button>}
      <label>Direction for Pythia<textarea rows={4} maxLength={4000} value={direction} disabled={pending} onChange={event => setDirection(event.target.value)} placeholder="Describe the learning experience, audience, visual relationship, interactions, branding and what must or must not be produced." /></label>
      <button type="button" disabled={pending || contextDirty || !direction.trim() || state.context.assemblyBlocked} onClick={() => void act(design)}>{running ? "Pythia is designing…" : treatment ? "Refine experience with Pythia" : "Ask Pythia for a scene experience"}</button>
      {stale && <p role="alert">The scene, brief or sources changed. Your edits are preserved; load current context and refine before applying.</p>}
      {treatment && <>
        <p>This native composition takes over the learner-facing stage. Existing canvas, source text, attachments and history remain in the project; attached media still plays separately. It does not create music, narration or video.</p>
        <fieldset disabled={pending || editingApplied || applied}><legend>Design reasoning</legend>
          <label>Learning intent<textarea maxLength={2000} value={treatment.learningIntent} onChange={event => edit({ ...treatment, learningIntent: event.target.value })} /></label>
          <label>Rationale and assumptions<textarea maxLength={2000} value={treatment.rationale} onChange={event => edit({ ...treatment, rationale: event.target.value })} /></label>
        </fieldset>
        <ExperienceEditor value={treatment.experience} imageAssets={project.storyboard.assets}
          disabled={pending || applied && !editingApplied} onChange={experience => edit({ ...treatment, experience })} />
        <fieldset disabled={pending || editingApplied || applied}><legend>Outstanding production work</legend>
          {treatment.productionNeeds.length === 0 && <p>No outstanding dependencies proposed. Verify against your direction before applying.</p>}
          {treatment.productionNeeds.map((need, index) => <div key={index}>
            <label>Production need {index + 1}<textarea maxLength={2000} value={need.description} onChange={event => edit({ ...treatment, productionNeeds: treatment.productionNeeds.map((item, i) => i === index ? { ...item, description: event.target.value } : item) })} /></label>
            <label className="experience-check"><input type="checkbox" checked={need.requiredBeforeApply} onChange={event => edit({ ...treatment, productionNeeds: treatment.productionNeeds.map((item, i) => i === index ? { ...item, requiredBeforeApply: event.target.checked } : item) })} />Required before applying</label>
            <button type="button" onClick={() => edit({ ...treatment, productionNeeds: treatment.productionNeeds.filter((_, i) => i !== index) })}>Remove production need {index + 1}</button>
          </div>)}
          <button type="button" disabled={treatment.productionNeeds.length >= 12} onClick={() => edit({ ...treatment, productionNeeds: [...treatment.productionNeeds, { description: "", requiredBeforeApply: true }] })}>Add production need</button>
        </fieldset>
        {state.draft && <details><summary>Treatment provenance</summary><p>Source revision {state.draft.provenance.revision}. Author direction: {state.draft.provenance.direction}</p><p>{state.draft.provenance.designBrief}</p>{state.draft.provenance.sources.map((source, i) => <p key={i}>{source.title} v{source.version} · SHA256 {source.sha256}</p>)}</details>}
        <section aria-label="Executable experience preview"><h3>Actual learner experience preview</h3><NativeExperience experience={treatment.experience}
          imageAssets={experienceImagesForProject(project.id, project.storyboard.assets)} /></section>
        {blocked && <p role="alert">Required production needs remain. Applying is blocked until you explicitly resolve or defer them.</p>}
        {externalReviewNeeded && <p role="alert">Review each external destination, its privacy/accessibility terms and offline alternative before saving or applying.</p>}
        <label className="experience-check"><input type="checkbox" checked={acknowledged} disabled={pending} onChange={event => setAcknowledged(event.target.checked)} />I reviewed the actual preview, content, branding and outstanding work. Apply only this native composition.</label>
        <div className="experience-actions">
          {applied || editingApplied ? <>
            <button type="button" disabled={pending || editingApplied || !scene.experience} onClick={() => {
              setEditingApplied(true); setAcknowledged(false);
              edit({ ...treatment, experience: scene.experience! });
              setState({ ...state, context: { ...state.context, revision: project.storyboard.revision } });
            }}>Edit applied scene without Pythia</button>
            {editingApplied && <button type="button" disabled={pending || externalReviewNeeded || !acknowledged} onClick={() => void act(saveApplied)}>Save reviewed native scene edits</button>}
            <button type="button" disabled={pending || !scene.experience} onClick={() => setRestoreConfirm(true)}>Restore underlying canvas</button>
            {restoreConfirm && <div role="alert"><p>Remove the native experience from this scene and restore its retained canvas? Project history and attached media remain.</p>
              <button type="button" disabled={pending} onClick={() => void act(async () => {
                if (!state) return;
                const value = await json<Project>(`/api/projects/${project.id}/scenes/${scene.id}`, {
                  method: "PATCH", headers: { "Content-Type": "application/json", "If-Match": `"${state.context.revision}"` },
                  body: JSON.stringify({ experience: null }),
                });
                onProjectUpdated(value); onClose();
              })}>Remove native experience and restore canvas</button>
              <button type="button" disabled={pending} onClick={() => setRestoreConfirm(false)}>Keep native experience</button>
            </div>}
          </> : <>
            <button type="button" disabled={pending || Boolean(stale)} onClick={() => void act(() => review(false))}>Save treatment privately</button>
            <button type="button" disabled={pending || Boolean(stale) || blocked || externalReviewNeeded || !acknowledged} onClick={() => void act(() => review(true))}>Apply reviewed experience to scene</button>
          </>}
        </div>
      </>}
    </>}
  </EditorDialog>;
}
