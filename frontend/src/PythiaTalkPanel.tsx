import { useEffect, useRef, useState } from "react";
import { RefreshCw, Send, Upload, X } from "lucide-react";
import type { Project, Scene } from "./App";
import { EditorDialog } from "./EditorDialog";
import { PythiaActionReview } from "./PythiaActionReview";
import { PythiaProcessing } from "./PythiaProcessing";
import { ConsultationArtifacts } from "./ConsultationArtifacts";
import type { PythiaAction } from "./PythiaActionReview";
import pythiaIcon from "./assets/pythia-talk/pythia.png";
import userIcon from "./assets/pythia-talk/user.png";
import "./pythia-talk.css";

type Advice = { content: string; kind: "answer" | "clarification"; rationale: string; limits: string[]; producer_id: string; stopping_boundary: "advisory-only" };
type Turn = { id: string; question: string; direction?: string; outlineItemCount?: number; status: "running" | "completed" | "failed" | "interrupted"; result: Advice | null; error: string | null; context: { sceneId: string | null; sourceIds: string[] } };
type Planning = { stage: "consulting" | "designing"; brief: string; turnId: string | null };
type Capacity = { used: { contextChars: number; messageChars: number; historyMessages: number; requestBytes: number; modelInputTokens?: number }; limits: { contextChars: number; messageChars: number; historyMessages: number; requestBytes: number; modelInputTokens?: number; verified: boolean }; status: "available" | "warning" | "full"; exceeded: string[] };
type Conversation = { sessionId: string; turns: Turn[]; authorDirection?: string; actions?: PythiaAction[]; configured?: boolean; mode?: string; capacity?: Capacity; message?: string; planning?: Planning };
type Source = { id: string; title: string; currentVersion: string; versions: { version: string; extractionStatus: string; passages: { locator: string; text: string }[] }[] };
type Payload = { sessionId: string; message: string; direction: string; sceneId: string | null; sourceIds: string[] };

const roughDraftDirection = "Design a learner-sized scene sequence covering every topic in the agreed expanded outline. Split topics or source slides into multiple scenes where needed for pacing, explanation, examples, practice, and reflection. Use learner-facing scene titles, not planning-section headings. Preserve the agreed content and logical order; do not omit topics. Explain the scene boundaries and describe proposed interactions and media as production notes, not completed features.";
const restoreDirection = (value: string) => [
  "Create a concise rough sequence of up to five content scenes from the agreed conversation.",
  "Create one starting content scene for every top-level item in the agreed expanded outline, preserving its titles and order. Include every item; do not merge or omit items.",
].includes(value) ? roughDraftDirection : value;

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
  const [view, setView] = useState<'conversation' | 'brief' | 'files'>('conversation');
  const [attachments, setAttachments] = useState<File[]>([]);
  const [dragging, setDragging] = useState(false);
  const [uploadNotice, setUploadNotice] = useState('');
  const attachmentInput = useRef<HTMLInputElement>(null);
  const uploadedAttachments = useRef(new Map<File, Source>());
  const messageInput = useRef<HTMLTextAreaElement>(null);
  const [direction, setDirection] = useState("");
  const [selectedAdvice, setSelectedAdvice] = useState<string | null>(null);
  const [actionMode, setActionMode] = useState<"update-scene" | "add-scenes">(!planning && scene ? "update-scene" : "add-scenes");
  const [targetSceneId, setTargetSceneId] = useState(scene?.id || "");
  const [includeScene, setIncludeScene] = useState(false);
  const [sourceIds, setSourceIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [mutating, setMutating] = useState(false);
  const [checking, setChecking] = useState(false);
  const [capacityPreview, setCapacityPreview] = useState<Capacity | null>(null);
  const [capacityPending, setCapacityPending] = useState(false);
  const [capacityError, setCapacityError] = useState("");
  const [capacityCheck, setCapacityCheck] = useState(0);
  const [connection, setConnection] = useState("");
  const [error, setError] = useState("");
  const [brief, setBrief] = useState("");
  const [editingBrief, setEditingBrief] = useState(false);
  const [expandedTurns, setExpandedTurns] = useState<Record<string, boolean>>({});
  const retry = useRef<{ signature: string; id: string } | null>(null);
  const draftRetry = useRef<{ signature: string; id: string } | null>(null);
  const sourceVersion = useRef(sourcesVersion);
  const requestedDraft = useRef<string | null>(null);
  const pending = Boolean(conversation?.turns.some(turn => turn.status === "running") || conversation?.actions?.some(action => action.status === "drafting"));
  const readyDrafts = conversation?.actions?.filter(action => action.status === "pending") || [];
  const latestAnswer = conversation?.turns.filter(turn => turn.status === "completed").at(-1);
  const designing = conversation?.planning?.stage === "designing";
  function revealDraft(action: PythiaAction) {
    setView("conversation");
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
    ]).then(([state, resources]) => { setConversation(state); setDirection(restoreDirection(state.authorDirection || "")); setBrief(state.planning?.brief || ""); setSources(resources); })
      .catch(issue => { if (issue.name !== "AbortError") setError(issue.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [base, project.id]);

  useEffect(() => {
    if (!conversation || conversation.capacity || conversation.configured === false) return;
    const controller = new AbortController();
    fetch(base, { signal: controller.signal }).then(readJson).then(setConversation).catch(() => {});
    return () => controller.abort();
  }, [base, conversation?.sessionId, Boolean(conversation?.capacity), conversation?.configured]);

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

  useEffect(() => {
    if (!conversation?.capacity || !draft.trim() || pending) {
      setCapacityPreview(null); setCapacityPending(false); setCapacityError(""); return;
    }
    let active = true;
    const controller = new AbortController();
    setCapacityPending(true); setCapacityError("");
    const timer = setTimeout(() => {
      fetch(base + "/capacity", { method: "POST", signal: controller.signal,
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({
          requestId: "capacity-preview", sessionId: conversation.sessionId,
          message: draft, direction, sceneId: includeScene ? scene?.id || null : null, sourceIds,
        }) }).then(readJson).then(result => { if (active) setCapacityPreview(result); })
        .catch(issue => { if (active && issue.name !== "AbortError") setCapacityError("Could not check conversation capacity. Check the connection or try the capacity check again."); })
        .finally(() => { if (active) setCapacityPending(false); });
    }, 400);
    return () => { active = false; clearTimeout(timer); controller.abort(); };
  }, [base, conversation?.sessionId, conversation?.capacity, draft, direction, includeScene, scene?.id, sourceIds, sourcesVersion, project.storyboard.revision, pending, capacityCheck]);

  function attachFiles(files: File[]) {
    if (disabled) return;
    setError('');
    const valid = files.filter(file => /\.(pdf|docx|pptx|txt|md)$/i.test(file.name) && file.size <= 100 * 1024 * 1024);
    if (valid.length !== files.length) setError('Choose PDF, DOCX, PPTX, TXT or Markdown files up to 100 MB each. Unsupported files were not attached.');
    setAttachments(current => {
      const next = [...current];
      for (const file of valid) if (!next.some(item => item.name === file.name && item.size === file.size && item.lastModified === file.lastModified)) next.push(file);
      if (next.length + sourceIds.length > 20) setError('Use up to 20 sources per message. Extra files were not attached.');
      return next.slice(0, Math.max(0, 20 - sourceIds.length));
    });
  }

  async function startFromWork() {
    if (disabled || !draft.trim()) return;
    if (sourceIds.length + attachments.length > 20) {
      setError('Use up to 20 sources per message. Remove a file or deselect a source before starting.'); return;
    }
    setMutating(true); setError(''); setUploadNotice('');
    const selected = [...sourceIds];
    try {
      for (const file of attachments) {
        setUploadNotice('Reading ' + file.name + '…');
        const form = new FormData();
        form.append('file', file); form.append('title', file.name); form.append('source_kind', 'document');
        const source: Source = uploadedAttachments.current.get(file) ?? await fetch('/api/projects/' + project.id + '/reference-resources', { method: 'POST', body: form }).then(readJson);
        uploadedAttachments.current.set(file, source);
        setSources(current => [...current.filter(item => item.id !== source.id), source]);
        const version = source.versions.find(item => item.version === source.currentVersion);
        if (version?.extractionStatus !== 'complete' || !version.passages.length) {
          throw new Error(file.name + ' was saved, but has no readable text. Inspect it in Sources or supply a readable copy before continuing. Your prompt is preserved.');
        }
        selected.push(source.id);
        setSourceIds([...selected]);
        setAttachments(current => current.filter(item => item !== file));
      }
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : 'Could not read the attached source. Your prompt is preserved.');
      setUploadNotice(''); setMutating(false); return;
    }
    setMutating(false); setUploadNotice('');
    if (conversation) await send({ sessionId: conversation.sessionId, message: draft, direction, sceneId: includeScene && scene ? scene.id : null, sourceIds: selected });
  }

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
      setConnection(`${result.mode === "hosted-text" ? "Hosted" : "Local"} Pythia consultation tools verified. Sending a question calls its configured model provider.`);
      setConversation(await fetch(base).then(readJson));
    } catch (issue) { setError(issue instanceof Error ? issue.message : "Could not check Pythia."); }
    finally { setChecking(false); }
  }

  async function reset() {
    if (!window.confirm("Clear this project's saved Pythia conversation and content drafts for your account, and start a new one? Applied scene changes and sources are preserved.")) return;
    setMutating(true); setError("");
    try {
      setConversation(await fetch(base + "/reset", { method: "POST" }).then(readJson));
      retry.current = null; draftRetry.current = null; setDraft(""); setDirection(""); setSelectedAdvice(null); setSourceIds([]); setIncludeScene(false); setBrief(""); setEditingBrief(false);
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
    setView("conversation");
    setSelectedAdvice(turnId);
    setDirection(current => current.trim() || (planning || actionMode === "add-scenes" ? roughDraftDirection : "Update the selected scene from the agreed design and advice. Preserve unrelated content and media."));
    if (planning) {
      setActionMode("add-scenes");
      setDirection(current => restoreDirection(current.trim()) || roughDraftDirection);
    }
    requestAnimationFrame(() => {
      const controls = document.getElementById('pythia-draft-controls');
      controls?.scrollIntoView({ block: 'nearest' });
      controls?.focus({ preventScroll: true });
    });
  }

  async function savePlanning(stage: Planning["stage"]) {
    if (!conversation || pending || mutating || locked) return;
    setMutating(true); setError("");
    try {
      const state: Conversation = await fetch(base + "/planning", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: conversation.sessionId, stage, brief: stage === "designing" ? brief : conversation.planning?.brief || "", turnId: latestAnswer?.id || null }),
      }).then(readJson);
      setConversation(state);
      setBrief(state.planning?.brief || "");
      setEditingBrief(false); setSelectedAdvice(null); draftRetry.current = null; setView("conversation");
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : "Could not save your design brief. The consultation stage has not been confirmed.");
    } finally { setMutating(false); }
  }

  async function prepareDraft() {
    const turnId = selectedAdvice;
    const mode = actionMode;
    const draftDirection = direction.trim();
    if (!conversation || !designing || editingBrief || pending || mutating || locked || !turnId || !draftDirection) return;
    if (draftDirection.length > 4000) { setError("Shorten the additional author direction to leave room for the outline instructions within 4,000 characters."); return; }
    setMutating(true); setError("");
    const payload = { sessionId: conversation.sessionId, turnId, mode,
      sceneId: mode === "update-scene" ? targetSceneId : null, direction: draftDirection, expectedRevision: project.storyboard.revision,
      followOutline: mode === "add-scenes" && Boolean(conversation.turns.find(turn => turn.id === turnId)?.outlineItemCount) };
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
  const capacity = capacityPreview || conversation?.capacity;
  const draftChars = [...draft].length;
  const content = <>
    <header className="pythia-talk-heading"><img src={pythiaIcon} alt="" width={56} height={56} /><div><h2 id="pythia-talk-title">{planning ? "Plan with Pythia" : "Consult Pythia"}</h2><p>Direct advice from {conversation?.mode === "hosted-text" ? "hosted" : "your local"} Pythia · {project.title}</p></div>{!embedded && <button type="button" className="icon-button" aria-label="Close Pythia conversation" disabled={mutating} onClick={onClose}><X size={18} /></button>}</header>
    <nav className="pythia-workspace-views" aria-label="Pythia workspace">
      <button type="button" aria-pressed={view === 'conversation'} onClick={() => setView('conversation')}>Conversation</button>
      <button type="button" aria-pressed={view === 'brief'} onClick={() => setView('brief')}>Design brief</button>
      <button type="button" aria-pressed={view === 'files'} onClick={() => setView('files')}>Files</button>
    </nav>
    {readyDrafts.length > 0 && <section className="pythia-ready-draft" aria-label="Drafts ready for review"><strong>Your content draft is ready.</strong><p>Review the proposed content, then accept it to continue editing in Chimera.</p>{readyDrafts.map((action, index) => <button key={action.id} type="button" className="button button-accent" onClick={() => revealDraft(action)}>{readyDrafts.length === 1 ? "Review my draft" : `Review draft ${index + 1}`}</button>)}</section>}
    {loading && <p role="status">Loading your Pythia conversation.</p>}
    {conversation?.configured === false && <p role="alert">{conversation.message}</p>}
    {error && <p role="alert" className="pythia-talk-failure">{error}</p>}
    <div className="pythia-workspace-view" hidden={view !== 'conversation'}>
    <section className="pythia-talk-history" aria-label="Pythia conversation history">
      {(conversation?.turns.length || 0) > 1 && <div className="pythia-history-controls"><button type="button" className="button button-outline" onClick={() => setExpandedTurns(Object.fromEntries(conversation!.turns.map(turn => [turn.id, true])))}>Expand all exchanges</button><button type="button" className="button button-outline" onClick={() => setExpandedTurns({})}>Roll up prior exchanges</button></div>}
      {!loading && conversation?.turns.length === 0 && <p>Drop your source material below and say what you want to accomplish. Pythia can ask for any missing detail as you work.</p>}
      {conversation?.turns.map((turn, index) => {
        const hasActiveDraft = conversation.actions?.some(action => action.turnId === turn.id && (action.status === "drafting" || action.status === "pending"));
        const expanded = expandedTurns[turn.id] ?? (index === conversation.turns.length - 1 || turn.status === "running" || Boolean(hasActiveDraft));
        return <details className="pythia-talk-turn" key={turn.id} open={expanded}>
        <summary onClick={event => { event.preventDefault(); setExpandedTurns(current => ({ ...current, [turn.id]: !expanded })); }}><span>Exchange {index + 1} · {turn.question.slice(0, 100)}{turn.question.length > 100 ? "…" : ""}</span><small>{turn.status === "running" || hasActiveDraft && pending ? "Processing" : turn.status}</small></summary>
        <div className="pythia-talk-exchange">
        <div className="pythia-talk-message"><img src={userIcon} alt="" width={36} height={36} /><div><strong>You</strong><p>{turn.question}</p>{turn.direction && <details><summary>Author direction for this message</summary><p>{turn.direction}</p></details>}{(turn.context?.sceneId || turn.context?.sourceIds.length > 0) && <small>Shared: {turn.context.sceneId ? "selected scene" : ""}{turn.context.sceneId && turn.context.sourceIds.length > 0 ? " and " : ""}{turn.context.sourceIds.length > 0 ? `${turn.context.sourceIds.length} source(s)` : ""}</small>}</div></div>
        {turn.status === "running" && <PythiaProcessing detail="Working through your question and selected sources." />}
        {turn.result && <div className="pythia-talk-message pythia-talk-answer"><img src={pythiaIcon} alt="" width={36} height={36} /><div><div className="pythia-talk-answer-label"><strong>Pythia</strong><span>Live model via Pythia</span></div><p>{turn.result.content}</p>
          <details><summary>Explanation and limits</summary>{turn.result.rationale && <p>{turn.result.rationale}</p>}{turn.result.limits.length > 0 && <ul>{turn.result.limits.map((limit, index) => <li key={index}>{limit}</li>)}</ul>}<small>Producer: {turn.result.producer_id} · Advisory only</small></details>
        </div></div>}
        {turn.status === "completed" && designing && <button type="button" className="button button-outline pythia-draft-from-advice" disabled={disabled || editingBrief} aria-pressed={selectedAdvice === turn.id} onClick={() => selectAdvice(turn.id)}>Prepare a content draft from this advice</button>}
        {conversation.actions?.filter(action => action.turnId === turn.id).map(action => <PythiaActionReview key={action.id} action={action} revision={project.storyboard.revision} disabled={disabled} onOpenSlides={!embedded ? onClose : undefined} onDecision={(item, decision) => void decideAction(item, decision)} onRedraft={item => {
          if (!designing) { setView("brief"); setEditingBrief(true); setError("Review and agree the design brief before preparing another content draft."); return; }
          setDirection(restoreDirection(item.direction)); setActionMode(item.mode); setTargetSceneId(item.sceneId || scene?.id || ""); draftRetry.current = null; selectAdvice(item.turnId);
        }} />)}
        {(turn.status === "failed" || turn.status === "interrupted") && <div className="pythia-talk-failure"><p role="alert">{turn.error}</p><button type="button" className="button button-outline" disabled={disabled} onClick={() => { retry.current = null; void send({ sessionId: conversation.sessionId, message: turn.question, direction: turn.direction || "", sceneId: turn.context?.sceneId || null, sourceIds: turn.context?.sourceIds || [] }); }}>Retry this question</button></div>}
        </div></details>;
      })}
    </section>
    {latestAnswer && !designing && readyDrafts.length === 0 && <button type="button" className="button button-outline" disabled={disabled} onClick={() => { setView('brief'); setEditingBrief(true); }}>Review brief for content drafting</button>}
    {selectedAdvice && designing && readyDrafts.length === 0 && <section id="pythia-draft-controls" tabIndex={-1} className="pythia-action-builder" aria-label="Prepare content changes"><h3>Prepare changes from the agreed design</h3><p>This is a separate production request, not another consultation reply. Choose what Chimera should draft. You will review the exact changes before applying them.</p><label>Action<select aria-label="Content action" value={actionMode} disabled={disabled} onChange={event => setActionMode(event.target.value as "update-scene" | "add-scenes")}><option value="update-scene" disabled={project.storyboard.scenes.length === 0}>Update selected scene</option><option value="add-scenes">Add new content scenes</option></select></label>
      {actionMode === "update-scene" && <label>Target scene<select aria-label="Target scene" value={targetSceneId} disabled={disabled} onChange={event => setTargetSceneId(event.target.value)}><option value="" disabled>Choose a scene</option>{project.storyboard.scenes.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>}
      <p className="field-hint">Supports titles, screen text, narration, author notes, and new content scenes. Planning topics are coverage requirements, not scene boundaries: Pythia may split each into several learner-sized scenes. Review the complete sequence before applying. Add new content scenes appends; it does not split or replace saved scenes. Drafting shares the agreed design brief, selected advice, its conversation context, your direction, and the update target's text.</p><button className="button button-accent" type="button" disabled={disabled || editingBrief || !direction.trim() || (actionMode === "update-scene" && !targetSceneId)} onClick={() => void prepareDraft()}>Generate content draft</button><button className="button button-outline" type="button" disabled={mutating} onClick={() => setSelectedAdvice(null)}>Close draft controls</button>
    </section>}
    <form className="pythia-talk-compose" onSubmit={event => { event.preventDefault(); void startFromWork(); }}>
      <div className={'pythia-source-drop ' + (dragging ? 'is-dragging' : '')} onDragOver={event => { event.preventDefault(); if (!disabled) setDragging(true); }} onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false); }} onDrop={event => { event.preventDefault(); setDragging(false); attachFiles(Array.from(event.dataTransfer.files)); }}>
        <Upload size={20} aria-hidden="true" />
        <div><strong>Drop your files here</strong><span>PDF, Word, PowerPoint, text or Markdown · optional</span></div>
        <button type="button" className="button button-outline" disabled={disabled} onClick={() => attachmentInput.current?.click()}>Choose files</button>
        <input ref={attachmentInput} type="file" multiple accept=".pdf,.docx,.pptx,.txt,.md" aria-label="Attach source files" hidden disabled={disabled} onChange={event => { attachFiles(Array.from(event.target.files || [])); event.target.value = ''; }} />
      </div>
      {attachments.length > 0 && <ul className="pythia-attachments" aria-label="Files to read">{attachments.map((file, index) => <li key={file.name + ':' + file.size + ':' + file.lastModified}><span>{file.name}</span><button type="button" className="icon-button" aria-label={'Remove ' + file.name} disabled={mutating} onClick={() => setAttachments(current => current.filter((_, i) => i !== index))}><X size={16} /></button></li>)}</ul>}
      <div className="pythia-talk-question"><label htmlFor="pythia-talk-message">What would you like to do?</label><textarea ref={messageInput} id="pythia-talk-message" rows={3} maxLength={8000000} value={draft} disabled={disabled} required placeholder="Tell Pythia what you want to create, change, or figure out…" onChange={event => setDraft(event.target.value)} /></div>
      <div className="pythia-talk-send"><small>{sourceIds.length ? sourceIds.length + ' source(s) included · ' : ''}{draftChars.toLocaleString()} characters</small><button type="submit" className="button button-accent" disabled={disabled || !draft.trim() || capacityPending || Boolean(capacityError) || capacity?.status === 'full'}><Send size={16} />{mutating ? 'Working…' : conversation?.turns.length ? 'Send to Pythia' : 'Start with Pythia'}</button></div>
      {uploadNotice && <p role="status">{uploadNotice}</p>}
      <details className="pythia-context-options"><summary>Sources and instructions{sourceIds.length ? ' · ' + sourceIds.length + ' selected' : ''}</summary>
      <div className="pythia-talk-options"><label><input type="checkbox" checked={includeScene} disabled={disabled || !scene} onChange={event => setIncludeScene(event.target.checked)} /> Include current scene text{scene ? `: ${scene.title}` : " (select a scene first)"}</label></div>
      {includeScene && <p className="field-hint">Shares the course and scene titles, screen text, narration, and notes with Pythia.</p>}
      <section className="pythia-talk-sources"><h3>Select source text · {sourceIds.length} selected</h3><p>Only selected readable text is included. Files, images, audio, and links without captured text are not sent.</p>{onManageSources && <button type="button" className="button button-outline" disabled={mutating || locked} onClick={onManageSources}>Add or inspect sources</button>}{sources.length === 0 ? <p>Add documents or text in Sources first.</p> : sources.map(source => {
        const version = source.versions.find(item => item.version === source.currentVersion);
        const readable = version?.extractionStatus === "complete" && version.passages.length > 0;
        return <label key={source.id}><input type="checkbox" disabled={disabled || !readable} checked={sourceIds.includes(source.id)} onChange={event => setSourceIds(current => event.target.checked ? [...current, source.id] : current.filter(id => id !== source.id))} />{source.title}{readable ? "" : " · no usable text"}</label>;
      })}</section>
    <section className="pythia-author-direction"><label htmlFor="pythia-author-direction">Author direction</label><textarea id="pythia-author-direction" rows={3} maxLength={4000} value={direction} disabled={disabled} placeholder="For example: Keep this under five minutes, use plain language, and preserve existing narration." onChange={event => setDirection(event.target.value)} /><p>Used for your next question or content draft, and saved when you send it. You can change this direction as the conversation develops.</p></section>
      </details>
      <details className="pythia-conversation-options"><summary>Connection and conversation details</summary>
    <div className="pythia-talk-connection"><button className="button button-outline" type="button" disabled={checking || loading || mutating || pending} onClick={() => void checkConnection()}>{checking ? "Checking local Pythia…" : "Check connection"}</button>{connection && <p role="status">{connection}</p>}</div>
<button type="button" className="button button-outline" disabled={disabled || !conversation?.turns.length} onClick={() => void reset()}><RefreshCw size={15} /> New conversation</button>
      {capacity && <section className="pythia-capacity" aria-label="Conversation capacity">
        <p className="field-hint">Conversation text: {capacity.used.contextChars.toLocaleString()} / {capacity.limits.contextChars.toLocaleString()} characters. Earlier messages: {capacity.used.historyMessages} / {capacity.limits.historyMessages}.</p>
        {capacity.used.modelInputTokens !== undefined && capacity.limits.modelInputTokens !== undefined && <p className="field-hint">Estimated model capacity: {Math.ceil(100 * capacity.used.modelInputTokens / capacity.limits.modelInputTokens)}% of the configured input budget. This cautious estimate includes instructions and formatting; different kinds of text can use more space.</p>}
        <p className="field-hint">Includes your draft, selected source text, author direction and saved conversation. Pythia also checks its configured model budget before making a model call. History is never silently removed.</p>
        {!capacity.limits.verified && <p className="field-hint">This older engine uses the original pilot allowance. The larger capacity requires the coordinated Pythia update.</p>}
        {capacityPending && <p role="status">Checking capacity…</p>}
      </section>}
      </details>
      {capacity?.status === 'full' && <p role="alert">This request exceeds the connection capacity. Reduce its size; your prompt is preserved.</p>}
      {capacity?.status === 'warning' && <p role="status">This conversation is nearing its capacity.</p>}
      {capacityError && <p role="alert">{capacityError} <button type="button" className="button button-outline" onClick={() => setCapacityCheck(value => value + 1)}>Check capacity again</button></p>}
    </form>
    <footer className="pythia-talk-note">Your message, author direction, selected text, and successful prior exchanges go to Pythia's configured model provider. Calls may incur its normal API charges. Content drafts become editable slides only when you accept the reviewed draft. This conversation is separate from ChatGPT and Manteion history.</footer>
    </div>
    <div className="pythia-workspace-view" hidden={view !== 'brief'}>
    <section className="pythia-action-builder" aria-label="Consultation and design brief">
      <h3>{designing ? "Explore the learning design" : "Build from where you are."}</h3>
      <p>{designing ? "Your brief is agreed for exploration, not final approval. Discuss the learner experience, sequence, pacing, and scene boundaries with Pythia. Only request a content draft when the design feels right." : "Bring the decisions and materials you already have. Record a brief when it helps production; start the conversation without completing this form."}</p>
      {conversation?.planning?.brief && <details><summary>Your recorded design brief</summary><p className="pythia-design-brief">{conversation.planning.brief}</p></details>}
      {latestAnswer && !editingBrief && <button type="button" className="button button-outline" disabled={disabled} onClick={() => setEditingBrief(true)}>{designing ? "Revisit the design brief" : "Review our design brief"}</button>}
      {editingBrief && <>
        <label htmlFor="pythia-design-brief">Design brief<textarea id="pythia-design-brief" rows={6} maxLength={8000} value={brief} disabled={disabled} onChange={event => setBrief(event.target.value)} placeholder="Record the audience, purpose, outcomes, approach, constraints, and open questions you have discussed. Mark assumptions and undecided ideas explicitly." /></label>
        <p>Ask Pythia to summarize the brief in the conversation if helpful. Review and edit it here: you decide what is agreed, what is assumed, and what is still open. Saving this brief makes no model call and creates no scenes.</p>
        <button type="button" className="button button-outline" disabled={disabled || !latestAnswer?.result} onClick={() => setBrief(latestAnswer?.result?.content || "")}>Use latest reply as a starting point</button>
        {brief.length > 8000 && <p role="alert">The design brief is {brief.length.toLocaleString()} characters. Edit it to at most 8,000 characters; nothing has been truncated or saved.</p>}
        <button type="button" className="button button-accent" disabled={disabled || !brief.trim() || brief.length > 8000} onClick={() => void savePlanning("designing")}>Agree brief and explore scene design</button>
        <button type="button" className="button button-outline" disabled={mutating} onClick={() => { setBrief(conversation?.planning?.brief || ""); setEditingBrief(false); }}>Keep consulting without changing the brief</button>
      </>}
      {designing && <button type="button" className="button button-outline" disabled={disabled} onClick={() => void savePlanning("consulting")}>Return to consultation</button>}
    </section>
    </div>
    <div className="pythia-workspace-view" hidden={view !== 'files'}>
    {conversation && <ConsultationArtifacts projectId={project.id} sessionId={conversation.sessionId} refreshKey={JSON.stringify([conversation.turns.map(t => [t.id, t.status]), conversation.actions?.map(a => [a.id, a.status])])} />}
    </div>
  </>;
  return embedded ? <section className="pythia-talk-embedded" aria-labelledby="pythia-talk-title">{content}</section> : <EditorDialog labelledBy="pythia-talk-title" onClose={onClose} busy={mutating} className="pythia-talk-dialog">{content}</EditorDialog>;
}
