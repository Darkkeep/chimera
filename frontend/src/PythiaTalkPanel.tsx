import { useEffect, useRef, useState } from "react";
import { RefreshCw, Send, X } from "lucide-react";
import type { Project, Scene } from "./App";
import { EditorDialog } from "./EditorDialog";
import { PythiaActionReview } from "./PythiaActionReview";
import { PythiaProcessing } from "./PythiaProcessing";
import type { PythiaAction } from "./PythiaActionReview";
import pythiaIcon from "./assets/pythia-talk/pythia.png";
import userIcon from "./assets/pythia-talk/user.png";
import "./pythia-talk.css";

type Advice = { content: string; kind: "answer" | "clarification"; rationale: string; limits: string[]; producer_id: string; stopping_boundary: "advisory-only" };
type Turn = { id: string; question: string; direction?: string; outlineItemCount?: number; status: "running" | "completed" | "failed" | "interrupted"; result: Advice | null; error: string | null; context: { sceneId: string | null; sourceIds: string[] } };
type Conversation = { sessionId: string; turns: Turn[]; authorDirection?: string; actions?: PythiaAction[]; configured?: boolean; message?: string };
type Source = { id: string; title: string; currentVersion: string; versions: { version: string; extractionStatus: string; passages: { locator: string; text: string }[] }[] };
type Payload = { sessionId: string; message: string; direction: string; sceneId: string | null; sourceIds: string[] };

const roughDraftDirection = "Create one starting content scene for every top-level item in the agreed expanded outline, preserving its titles and order. Include every item; do not merge or omit items.";
const restoreDirection = (value: string) => value === "Create a concise rough sequence of up to five content scenes from the agreed conversation." ? roughDraftDirection : value;

async function readJson(response: Response) {
  const data = await response.json().catch(() => null);
  if (!response.ok || !data) throw new Error(typeof data?.detail === "string" ? data.detail : "Chimera could not complete the request. Refresh the conversation and check the draft status before retrying.");
  return data;
}

export function PythiaTalkPanel({ project, scene, onClose, onProjectUpdated, embedded = false, planning = false, initialMessage = "", sourcesVersion = 0, locked = false, onBusyChange, onManageSources }: {
  project: Project; scene?: Scene; onClose: () => void; onProjectUpdated: (project: Project) => void;
  embedded?: boolean; planning?: boolean; initialMessage?: string; sourcesVersion?: number; locked?: boolean;
  onBusyChange?: (busy: boolean) => void; onManageSources?: () => void;
}) {
  const base = `/api/projects/${project.id}/pythia-conversation`;
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [sources, setSources] = useState<Source[]>([]);
  const draftKey = `chimera:pythia-unsent:${project.id}`;
  const [draft, setDraft] = useState(() => {
    try { return sessionStorage.getItem(draftKey) ?? initialMessage; } catch { return initialMessage; }
  });
  useEffect(() => {
    try { sessionStorage.setItem(draftKey, draft); } catch { /* Keep editing if browser storage is unavailable. */ }
  }, [draftKey, draft]);
  const [direction, setDirection] = useState("");
  const [selectedAdvice, setSelectedAdvice] = useState<string | null>(null);
  const [actionMode, setActionMode] = useState<"update-scene" | "add-scenes">(!planning && scene ? "update-scene" : "add-scenes");
  const [targetSceneId, setTargetSceneId] = useState(scene?.id || "");
  const [includeScene, setIncludeScene] = useState(false);
  const [sourceIds, setSourceIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [mutating, setMutating] = useState(false);
  const [checking, setChecking] = useState(false);
  const [connection, setConnection] = useState("");
  const [error, setError] = useState("");
  const [expandedTurns, setExpandedTurns] = useState<Record<string, boolean>>({});
  const retry = useRef<{ signature: string; id: string } | null>(null);
  const draftRetry = useRef<{ signature: string; id: string } | null>(null);
  const sourceVersion = useRef(sourcesVersion);
  const requestedDraft = useRef<string | null>(null);
  const pending = Boolean(conversation?.turns.some(turn => turn.status === "running") || conversation?.actions?.some(action => action.status === "drafting"));
  const latestOutline = conversation?.turns.filter(turn => turn.status === "completed" && (turn.outlineItemCount || 0) > 0).at(-1);
  const outlineDraft = conversation?.actions?.filter(action => action.turnId === latestOutline?.id && action.mode === "add-scenes" && action.status === "pending").at(-1);
  function revealDraft(action: PythiaAction) {
    setExpandedTurns(current => ({ ...current, [action.turnId]: true }));
    requestAnimationFrame(() => {
      const element = document.getElementById(`pythia-action-${action.id}`);
      element?.scrollIntoView({ block: "start", behavior: "smooth" });
      element?.focus({ preventScroll: true });
    });
  }
  useEffect(() => {
    const action = conversation?.actions?.find(item => item.id === requestedDraft.current && (item.status === "pending" || item.status === "failed"));
    if (action) { requestedDraft.current = null; revealDraft(action); }
  }, [conversation]);
  useEffect(() => { onBusyChange?.(mutating); return () => onBusyChange?.(false); }, [mutating, onBusyChange]);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      fetch(base, { signal: controller.signal }).then(readJson),
      fetch(`/api/projects/${project.id}/reference-resources`, { signal: controller.signal }).then(readJson),
    ]).then(([state, resources]) => { setConversation(state); setDirection(restoreDirection(state.authorDirection || "")); setSources(resources); })
      .catch(issue => { if (issue.name !== "AbortError") setError(issue.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [base, project.id]);

  useEffect(() => {
    if (sourceVersion.current === sourcesVersion) return;
    sourceVersion.current = sourcesVersion;
    const controller = new AbortController();
    fetch(`/api/projects/${project.id}/reference-resources`, { signal: controller.signal }).then(readJson).then(setSources)
      .catch(issue => { if (issue.name !== "AbortError") setError(issue.message); });
    return () => controller.abort();
  }, [project.id, sourcesVersion]);

  useEffect(() => {
    if (!pending) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const controller = new AbortController();
    async function poll() {
      try {
        const state = await fetch(base, { signal: controller.signal }).then(readJson);
        if (active) setConversation(state);
      } catch (issue) {
        if (active) setError(issue instanceof Error ? issue.message : "Could not refresh Pythia's response. Reopen this conversation to recover it.");
      } finally { if (active) timer = setTimeout(() => void poll(), 1500); }
    }
    timer = setTimeout(() => void poll(), 700);
    return () => { active = false; clearTimeout(timer); controller.abort(); };
  }, [base, pending]);

  async function send(payload: Payload) {
    if (pending || mutating || locked || !payload.message.trim()) return;
    setMutating(true); setError("");
    const signature = JSON.stringify(payload);
    if (retry.current?.signature !== signature) retry.current = { signature, id: crypto.randomUUID() };
    try {
      const state = await fetch(base, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...payload, requestId: retry.current.id }) }).then(readJson);
      setConversation(state); setDraft(""); retry.current = null;
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : "Could not send to Pythia. Retry explicitly.");
      // Refresh read-only state after an uncertain submit; never automatically
      // repeat a model request. A retry of the same payload keeps its ID.
      try { setConversation(await fetch(base).then(readJson)); } catch { /* The original error remains visible. */ }
    } finally { setMutating(false); }
  }

  async function checkConnection() {
    setChecking(true); setError(""); setConnection("");
    try {
      const result = await fetch(base + "/check", { method: "POST" }).then(readJson);
      if (result.consultation !== true) throw new Error("This Pythia connection does not advertise consultation.");
      setConnection("Local Pythia consultation tools verified. Sending a question calls its configured model provider.");
    } catch (issue) { setError(issue instanceof Error ? issue.message : "Could not check Pythia."); }
    finally { setChecking(false); }
  }

  async function reset() {
    if (!window.confirm("Clear this project's saved Pythia conversation and content drafts for your account, and start a new one? Applied scene changes and sources are preserved.")) return;
    setMutating(true); setError("");
    try {
      setConversation(await fetch(base + "/reset", { method: "POST" }).then(readJson));
      retry.current = null; draftRetry.current = null; setDraft(""); setDirection(""); setSelectedAdvice(null); setSourceIds([]); setIncludeScene(false);
    } catch (issue) { setError(issue instanceof Error ? issue.message : "Could not start a new conversation."); }
    finally { setMutating(false); }
  }

  async function refreshProjectAndConversation() {
    try {
      const [current, state] = await Promise.all([fetch(`/api/projects/${project.id}`).then(readJson), fetch(base).then(readJson)]);
      onProjectUpdated(current); setConversation(state);
    } catch { /* Keep the original action error visible. */ }
  }

  function selectAdvice(turnId: string) {
    setSelectedAdvice(turnId);
    if (planning) {
      setActionMode("add-scenes");
      setDirection(current => restoreDirection(current.trim()) || roughDraftDirection);
    }
    requestAnimationFrame(() => document.getElementById("pythia-author-direction")?.focus());
  }

  async function prepareDraft(outline?: Turn) {
    const turnId = outline?.id || selectedAdvice;
    const mode = outline ? "add-scenes" : actionMode;
    const draftDirection = outline ? roughDraftDirection + (direction.trim() ? `\n\nAdditional author direction:\n${restoreDirection(direction.trim())}` : "") : direction.trim();
    if (!conversation || pending || mutating || locked || !turnId || !draftDirection) return;
    if (draftDirection.length > 4000) { setError("Shorten the additional author direction to leave room for the outline instructions within 4,000 characters."); return; }
    setMutating(true); setError("");
    const payload = { sessionId: conversation.sessionId, turnId, mode,
      sceneId: mode === "update-scene" ? targetSceneId : null, direction: draftDirection, expectedRevision: project.storyboard.revision,
      followOutline: mode === "add-scenes" && (Boolean(outline) || planning || project.storyboard.scenes.length === 0) };
    const signature = JSON.stringify(payload);
    if (draftRetry.current?.signature !== signature) draftRetry.current = { signature, id: crypto.randomUUID() };
    requestedDraft.current = draftRetry.current.id;
    try {
      setConversation(await fetch(base + "/actions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...payload, requestId: draftRetry.current.id }) }).then(readJson));
      draftRetry.current = null;
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : "Could not prepare a content draft. Nothing was applied.");
      await refreshProjectAndConversation();
    } finally { setMutating(false); }
  }

  async function decideAction(action: PythiaAction, decision: "apply" | "discard") {
    if (!conversation || pending || mutating || locked) return;
    setMutating(true); setError("");
    try {
      const result = await fetch(`${base}/actions/${action.id}/decision`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId: conversation.sessionId, decision, expectedRevision: project.storyboard.revision }) }).then(readJson);
      setConversation(result.conversation);
      if (result.project) onProjectUpdated(result.project);
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : "Could not decide this draft. Check the current storyboard before retrying.");
      await refreshProjectAndConversation();
    } finally { setMutating(false); }
  }

  const disabled = loading || mutating || locked || pending || conversation?.configured === false || !conversation;
  const content = <>
    <header className="pythia-talk-heading"><img src={pythiaIcon} alt="" width={56} height={56} /><div><h2 id="pythia-talk-title">{planning ? "Plan with Pythia" : "Talk to Pythia"}</h2><p>Direct advice from your local Pythia · {project.title}</p></div>{!embedded && <button type="button" className="icon-button" aria-label="Close Pythia conversation" disabled={mutating} onClick={onClose}><X size={18} /></button>}</header>
    {planning && <p className="field-hint">Discuss the audience, goals, and source material here. Your sent conversation is saved with this project. Choose Draft rough scenes when you are ready; no scenes are added until you apply a reviewed draft.</p>}
    {loading && <p role="status">Loading your Pythia conversation…</p>}
    {conversation?.configured === false && <p role="alert">{conversation.message}</p>}
    <div className="pythia-talk-connection"><button className="button button-outline" type="button" disabled={checking || loading || mutating || pending} onClick={() => void checkConnection()}>{checking ? "Checking local Pythia…" : "Check connection"}</button>{connection && <p role="status">{connection}</p>}</div>
    {latestOutline && <section className="pythia-action-builder" aria-label="Turn outline into scenes"><h3>Turn your outline into scenes</h3><p>{latestOutline.outlineItemCount} top-level items → {latestOutline.outlineItemCount} new scenes. Create the draft, review it, then choose Apply changes. Existing scenes stay in the project.</p>
      {outlineDraft ? <button type="button" className="button button-accent" disabled={mutating} onClick={() => revealDraft(outlineDraft)}>Review draft and apply {outlineDraft.result?.scenes.length} scenes</button>
        : <button type="button" className="button button-accent" disabled={disabled} onClick={() => void prepareDraft(latestOutline)}>{pending ? "Preparing scenes…" : "Create scene draft from outline"}</button>}
    </section>}
    <section className="pythia-talk-history" aria-label="Pythia conversation history">
      {(conversation?.turns.length || 0) > 1 && <div className="pythia-history-controls"><button type="button" className="button button-outline" onClick={() => setExpandedTurns(Object.fromEntries(conversation!.turns.map(turn => [turn.id, true])))}>Expand all exchanges</button><button type="button" className="button button-outline" onClick={() => setExpandedTurns({})}>Roll up prior exchanges</button></div>}
      {!loading && conversation?.turns.length === 0 && <p>Ask a question, discuss an idea, or challenge Pythia's advice. Your conversation is saved privately in this local Chimera installation.</p>}
      {conversation?.turns.map((turn, index) => {
        const hasActiveDraft = conversation.actions?.some(action => action.turnId === turn.id && (action.status === "drafting" || action.status === "pending"));
        const expanded = expandedTurns[turn.id] ?? (index === conversation.turns.length - 1 || turn.status === "running" || Boolean(hasActiveDraft));
        return <details className="pythia-talk-turn" key={turn.id} open={expanded}>
        <summary onClick={event => { event.preventDefault(); setExpandedTurns(current => ({ ...current, [turn.id]: !expanded })); }}><span>Exchange {index + 1} · {turn.question.slice(0, 100)}{turn.question.length > 100 ? "…" : ""}</span><small>{turn.status === "running" || hasActiveDraft && pending ? "Processing" : turn.status}</small></summary>
        <div className="pythia-talk-exchange">
        <div className="pythia-talk-message"><img src={userIcon} alt="" width={36} height={36} /><div><strong>You</strong><p>{turn.question}</p>{turn.direction && <details><summary>Author direction for this message</summary><p>{turn.direction}</p></details>}{(turn.context?.sceneId || turn.context?.sourceIds.length > 0) && <small>Shared: {turn.context.sceneId ? "selected scene" : ""}{turn.context.sceneId && turn.context.sourceIds.length > 0 ? " and " : ""}{turn.context.sourceIds.length > 0 ? `${turn.context.sourceIds.length} source(s)` : ""}</small>}</div></div>
        {turn.status === "running" && <PythiaProcessing detail="Working through your question and selected sources." />}
        {turn.result && <div className="pythia-talk-message pythia-talk-answer"><img src={pythiaIcon} alt="" width={36} height={36} /><div><div className="pythia-talk-answer-label"><strong>Pythia</strong><span>Live model via local Pythia</span></div><p>{turn.result.content}</p>
          <details><summary>Explanation and limits</summary>{turn.result.rationale && <p>{turn.result.rationale}</p>}{turn.result.limits.length > 0 && <ul>{turn.result.limits.map((limit, index) => <li key={index}>{limit}</li>)}</ul>}<small>Producer: {turn.result.producer_id} · Advisory only</small></details>
        </div></div>}
        {turn.status === "completed" && <button type="button" className="button button-outline pythia-draft-from-advice" disabled={disabled} aria-pressed={selectedAdvice === turn.id} onClick={() => selectAdvice(turn.id)}>{planning ? "Draft rough scenes from this advice" : "Draft changes from this advice"}</button>}
        {conversation.actions?.filter(action => action.turnId === turn.id).map(action => <PythiaActionReview key={action.id} action={action} revision={project.storyboard.revision} disabled={disabled} onDecision={(item, decision) => void decideAction(item, decision)} onRedraft={item => { setDirection(item.direction); setActionMode(item.mode); setTargetSceneId(item.sceneId || scene?.id || ""); draftRetry.current = null; selectAdvice(item.turnId); }} />)}
        {(turn.status === "failed" || turn.status === "interrupted") && <div className="pythia-talk-failure"><p role="alert">{turn.error}</p><button type="button" className="button button-outline" disabled={disabled} onClick={() => { retry.current = null; void send({ sessionId: conversation.sessionId, message: turn.question, direction: turn.direction || "", sceneId: turn.context?.sceneId || null, sourceIds: turn.context?.sourceIds || [] }); }}>Retry this question</button></div>}
        </div></details>;
      })}
    </section>
    {error && <p role="alert" className="pythia-talk-failure">{error}</p>}
    <section className="pythia-author-direction"><label htmlFor="pythia-author-direction">Author direction</label><textarea id="pythia-author-direction" rows={3} maxLength={4000} value={direction} disabled={disabled} placeholder="For example: Keep this under five minutes, use plain language, and preserve existing narration." onChange={event => setDirection(event.target.value)} /><p>Used for your next question or content draft, and saved when you send it. You can change this direction as the conversation develops.</p></section>
    {selectedAdvice && <section className="pythia-action-builder" aria-label="Prepare content changes"><h3>{planning ? "Prepare a rough scene draft" : "Prepare changes from selected advice"}</h3><p>Choose what Chimera should draft. You will review the exact changes before applying them.</p><label>Action<select aria-label="Content action" value={actionMode} disabled={disabled} onChange={event => setActionMode(event.target.value as "update-scene" | "add-scenes")}><option value="update-scene" disabled={project.storyboard.scenes.length === 0}>Update selected scene</option><option value="add-scenes">Add new content scenes</option></select></label>
      {actionMode === "update-scene" && <label>Target scene<select aria-label="Target scene" value={targetSceneId} disabled={disabled} onChange={event => setTargetSceneId(event.target.value)}><option value="" disabled>Choose a scene</option>{project.storyboard.scenes.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>}
      <p className="field-hint">Supports titles, screen text, narration, author notes, and new content scenes. Course planning creates one scene per top-level outline item, preserving every title and its order. Drafting shares the selected advice, its conversation context, your direction, and the update target's text.</p><button className="button button-accent" type="button" disabled={disabled || !direction.trim() || (actionMode === "update-scene" && !targetSceneId)} onClick={() => void prepareDraft()}>Generate content draft</button><button className="button button-outline" type="button" disabled={mutating} onClick={() => setSelectedAdvice(null)}>Close draft controls</button>
    </section>}
    <form className="pythia-talk-compose" onSubmit={event => { event.preventDefault(); if (conversation) void send({ sessionId: conversation.sessionId, message: draft, direction, sceneId: includeScene && scene ? scene.id : null, sourceIds }); }}>
      <div className="pythia-talk-options"><button type="button" className="button button-outline" disabled={disabled || conversation.turns.length === 0} onClick={() => void reset()}><RefreshCw size={15} /> New conversation</button><label><input type="checkbox" checked={includeScene} disabled={disabled || !scene} onChange={event => setIncludeScene(event.target.checked)} /> Include current scene text{scene ? `: ${scene.title}` : " (select a scene first)"}</label></div>
      {includeScene && <p className="field-hint">Shares the course and scene titles, screen text, narration, and notes with Pythia.</p>}
      <details className="pythia-talk-sources" open={planning ? true : undefined}><summary>Select source text · {sourceIds.length} selected</summary><p>Only selected readable text is included. Files, images, audio, and links without captured text are not sent.</p>{onManageSources && <button type="button" className="button button-outline" disabled={mutating || locked} onClick={onManageSources}>Add or inspect sources</button>}{sources.length === 0 ? <p>Add documents or text in Sources first.</p> : sources.map(source => {
        const version = source.versions.find(item => item.version === source.currentVersion);
        const readable = version?.extractionStatus === "complete" && version.passages.length > 0;
        return <label key={source.id}><input type="checkbox" disabled={disabled || !readable} checked={sourceIds.includes(source.id)} onChange={event => setSourceIds(current => event.target.checked ? [...current, source.id] : current.filter(id => id !== source.id))} />{source.title}{readable ? "" : " · no usable text"}</label>;
      })}</details>
      <div className="pythia-talk-question"><label htmlFor="pythia-talk-message">Your message</label><textarea id="pythia-talk-message" rows={4} maxLength={8000000} value={draft} disabled={disabled} required placeholder="Ask Pythia a question…" onChange={event => setDraft(event.target.value)} /></div>
      <div className="pythia-talk-send"><small>{draft.length.toLocaleString()} / 8,000,000 characters</small><button type="submit" className="button button-accent" disabled={disabled || !draft.trim()}><Send size={16} />{mutating ? "Sending…" : "Send to Pythia"}</button></div>
    </form>
    <footer className="pythia-talk-note">Your message, author direction, selected text, and successful prior exchanges go to Pythia's configured model provider. Calls may incur its normal API charges. Content drafts change scenes only when you choose Apply changes. This conversation is separate from ChatGPT and Manteion history.</footer>
  </>;
  return embedded ? <section className="pythia-talk-embedded" aria-labelledby="pythia-talk-title">{content}</section> : <EditorDialog labelledBy="pythia-talk-title" onClose={onClose} busy={mutating} className="pythia-talk-dialog">{content}</EditorDialog>;
}
