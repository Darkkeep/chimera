import { reportOnboardingOutcome } from "./onboarding-journeys";
import { BrandMark } from "./BrandMark";
import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Check, List, MessageCircle, Send, X } from "lucide-react";
import type { AssessmentItem, AssessmentSettings, Project, Scene } from "./App";
import { evaluateCourseCompletion, type AssessmentOutcome } from "./completion";
import "./course-preview.css";
import "./course-preview-overrides.css";
import "./course-preview-review.css";
import "./scene-navigation.css";
import "./assessment-types.css";
import { useSession } from "./AuthGate";
import { SceneSurface } from "./SceneSurface";

type CoursePreviewProps = {
  project: Project;
  onClose: () => void;
  canEnhance?: boolean;
};

type AssessmentResult = AssessmentOutcome & { response: string[]; matches: Record<string, string>; textResponse: string; assessmentSignature: string };
type RemediationRoute = { assessmentSceneId: string; remediationSceneId: string };
type ResumeState = { sceneIndex: number; visitedSceneIds: string[]; completedAudioKeys: string[]; assessmentResults: Record<string, AssessmentResult>; remediationRoute: RemediationRoute | null };
type ReviewReply = { id: string; authorLabel: string; body: string; createdAt: string };
type ReviewComment = { id: string; sceneId: string; sceneTitle: string; revision: number; authorLabel: string; body: string; replies: ReviewReply[]; resolved: boolean; outdated: boolean; sceneDeleted: boolean };

function audioCompletionKey(sceneId: string, audioId: string): string {
  return `${sceneId}:${audioId}`;
}

function assessmentSettings(scene: Scene): AssessmentSettings {
  return scene.assessmentSettings ?? { maxAttempts: 2, passingScore: 100, scoreWeight: 1, remediationSceneId: null };
}

function assessmentSignature(item: AssessmentItem, settings: AssessmentSettings): string {
  return JSON.stringify({ item, settings });
}

function legacyAssessmentSignature(item: AssessmentItem, settings: AssessmentSettings): string | null {
  if (item.type !== "single-choice") return null;
  return JSON.stringify({
    item: {
      identifier: item.identifier,
      prompt: item.prompt,
      choices: item.choices,
      correctResponse: item.correctResponse,
      correctFeedback: item.correctFeedback,
      incorrectFeedback: item.incorrectFeedback,
    },
    settings: { maxAttempts: settings.maxAttempts, passingScore: settings.passingScore },
  });
}

function previousSettingsSignature(item: AssessmentItem, settings: AssessmentSettings): string {
  return JSON.stringify({ item, settings: { maxAttempts: settings.maxAttempts, passingScore: settings.passingScore } });
}

function assessmentIdentifiers(item: AssessmentItem): string[] {
  if (item.type === "single-choice" || item.type === "multiple-response" || item.type === "ordering") return item.choices.map((choice) => choice.identifier);
  if (item.type === "true-false") return ["true", "false"];
  if (item.type === "drag-drop") return [...item.draggables, ...item.targets].map((choice) => choice.identifier);
  if (item.type === "matching") return [...item.leftItems, ...item.rightItems].map((choice) => choice.identifier);
  return [];
}

function assessmentResponseIsCorrect(item: AssessmentItem, result: AssessmentResult): boolean {
  if (item.type === "single-choice" || item.type === "true-false") return result.response.length === 1 && result.response[0] === item.correctResponse;
  if (item.type === "multiple-response") return [...result.response].sort().join("|") === [...item.correctResponses].sort().join("|");
  if (item.type === "ordering") return result.response.join("|") === item.correctOrder.join("|");
  if (item.type === "drag-drop" || item.type === "matching") return item.correctMatches.every((pair) => result.matches[pair.sourceIdentifier] === pair.targetIdentifier)
    && Object.keys(result.matches).length === item.correctMatches.length;
  const response = item.caseSensitive ? result.textResponse.trim() : result.textResponse.trim().toLocaleLowerCase();
  return item.acceptedAnswers.some((answer) => response === (item.caseSensitive ? answer.trim() : answer.trim().toLocaleLowerCase()));
}

function readResumeState(projectId: string, scenes: Scene[]): ResumeState {
  try {
    const stored = window.localStorage.getItem(`chimera.preview.${projectId}`);
    if (!stored) return { sceneIndex: 0, visitedSceneIds: [], completedAudioKeys: [], assessmentResults: {}, remediationRoute: null };
    const parsed = JSON.parse(stored) as Partial<ResumeState>;
    const sceneIndex = typeof parsed.sceneIndex === "number" && Number.isInteger(parsed.sceneIndex)
      ? Math.min(Math.max(parsed.sceneIndex, 0), Math.max(scenes.length - 1, 0))
      : 0;
    const visitedSceneIds = Array.isArray(parsed.visitedSceneIds)
      ? parsed.visitedSceneIds.filter((id): id is string => typeof id === "string" && scenes.some((scene) => scene.id === id))
      : [];
    const requiredAudioKeys = new Set(scenes.flatMap((scene) => scene.audioRequired
      ? scene.audioAssets.map((audioId) => audioCompletionKey(scene.id, audioId))
      : []));
    const completedAudioKeys = Array.isArray(parsed.completedAudioKeys)
      ? parsed.completedAudioKeys.filter((key): key is string => typeof key === "string" && requiredAudioKeys.has(key))
      : [];
    const assessmentResults = Object.fromEntries(Object.entries(parsed.assessmentResults ?? {}).flatMap(([sceneId, value]) => {
      const assessment = scenes.find((scene) => scene.id === sceneId)?.assessmentItem;
      const scene = scenes.find((item) => item.id === sceneId);
      if (!assessment || !value || typeof value !== "object") return [];
      const result = value as Partial<AssessmentResult> & { selectedIdentifier?: string | null };
      const response = Array.isArray(result.response)
        ? result.response
        : typeof result.selectedIdentifier === "string" ? [result.selectedIdentifier] : [];
      const validResponse = response.every((identifier) => assessmentIdentifiers(assessment).includes(identifier));
      const matches = result.matches && typeof result.matches === "object" ? result.matches : {};
      const validMatches = Object.entries(matches).every(([source, target]) => typeof target === "string" && assessmentIdentifiers(assessment).includes(source) && assessmentIdentifiers(assessment).includes(target));
      const textResponse = typeof result.textResponse === "string" ? result.textResponse : "";
      const validAttempts = typeof result.attempts === "number" && Number.isInteger(result.attempts) && result.attempts >= 0;
      const validOutcome = result.isCorrect === null || result.isCorrect === undefined || typeof result.isCorrect === "boolean";
      const settings = scene ? assessmentSettings(scene) : null;
      const validAssessment = scene !== undefined && settings !== null && (result.assessmentSignature === assessmentSignature(assessment, settings)
        || result.assessmentSignature === previousSettingsSignature(assessment, settings)
        || (result.selectedIdentifier !== undefined && result.assessmentSignature === legacyAssessmentSignature(assessment, settings)));
      return validResponse && validMatches && validAttempts && validOutcome && validAssessment
        ? [[sceneId, { ...result, response, matches, textResponse } as AssessmentResult]]
        : [];
    }));
    const route = parsed.remediationRoute;
    const remediationRoute = route && scenes.some((scene) => scene.id === route.assessmentSceneId)
      && scenes.some((scene) => scene.id === route.remediationSceneId)
      && route.assessmentSceneId !== route.remediationSceneId
      ? route
      : null;
    return { sceneIndex, visitedSceneIds, completedAudioKeys, assessmentResults, remediationRoute };
  } catch {
    return { sceneIndex: 0, visitedSceneIds: [], completedAudioKeys: [], assessmentResults: {}, remediationRoute: null };
  }
}

function createEmptyAssessmentResult(item: AssessmentItem, settings: AssessmentSettings): AssessmentResult {
  return { response: [], matches: {}, textResponse: "", attempts: 0, isCorrect: null, assessmentSignature: assessmentSignature(item, settings) };
}

export function CoursePreview({ project, onClose, canEnhance = true }: CoursePreviewProps) {
  const { session } = useSession();
  const resumeProjectId = session ? `${session.actor.actorId}.${project.id}` : project.id;
  const scenes = project.storyboard.scenes;
  const [resumeState] = useState(() => readResumeState(resumeProjectId, scenes));
  const [sceneIndex, setSceneIndex] = useState(resumeState.sceneIndex);
  const [contentsOpen, setContentsOpen] = useState(false);
  const [visitedSceneIds, setVisitedSceneIds] = useState(resumeState.visitedSceneIds);
  const [completedAudioKeys, setCompletedAudioKeys] = useState(resumeState.completedAudioKeys);
  const [assessmentResults, setAssessmentResults] = useState(resumeState.assessmentResults);
  const [remediationRoute, setRemediationRoute] = useState(resumeState.remediationRoute);
  const [comments, setComments] = useState<ReviewComment[]>([]);
  const [commentAuthor, setCommentAuthor] = useState(session?.actor.actorDisplayName || "Reviewer");
  const [commentBody, setCommentBody] = useState("");
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [commentFilter, setCommentFilter] = useState<"all" | "unresolved" | "outdated">("all");
  const [commentBusy, setCommentBusy] = useState(false);
  const [commentError, setCommentError] = useState("");
  const dotsContainerRef = useRef<HTMLDivElement | null>(null);
  const activeDotRef = useRef<HTMLButtonElement | null>(null);
  const scene = scenes[sceneIndex];
  const evaluation = evaluateCourseCompletion(
    scenes,
    project.storyboard.completionSettings,
    visitedSceneIds,
    completedAudioKeys,
    assessmentResults,
  );
  const {
    courseComplete,
    coursePassed,
    weightedScore,
    completedRequiredSceneCount,
    requiredSceneCount,
    completedRequiredAudioCount,
    requiredAudioTrackCount,
    requiredAudioSetupMissingCount,
  } = evaluation;

  useEffect(() => {
    if (!scene) return;
    setVisitedSceneIds((current) => current.includes(scene.id) ? current : [...current, scene.id]);
  }, [scene]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  useEffect(() => {
    const container = dotsContainerRef.current;
    const activeDot = activeDotRef.current;
    if (!container || !activeDot) return;
    container.scrollTo({
      left: activeDot.offsetLeft - (container.clientWidth - activeDot.clientWidth) / 2,
      behavior: "auto",
    });
  }, [sceneIndex]);

  useEffect(() => {
    try {
      window.localStorage.setItem(`chimera.preview.${resumeProjectId}`, JSON.stringify({ sceneIndex, visitedSceneIds, completedAudioKeys, assessmentResults, remediationRoute }));
    } catch {
      // Preview remains usable if browser storage is unavailable.
    }
  }, [resumeProjectId, sceneIndex, visitedSceneIds, completedAudioKeys, assessmentResults, remediationRoute]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
      if (event.target instanceof HTMLElement && ["INPUT", "TEXTAREA", "SELECT", "AUDIO"].includes(event.target.tagName)) return;
      if (event.key === "ArrowLeft") setSceneIndex((current) => Math.max(0, current - 1));
      if (event.key === "ArrowRight") setSceneIndex((current) => Math.min(scenes.length - 1, current + 1));
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, scenes.length]);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/projects/${project.id}/review-comments`, { signal: controller.signal })
      .then((response) => response.ok ? response.json() as Promise<ReviewComment[]> : Promise.reject(new Error("Review comments could not be loaded.")))
      .then(setComments)
      .catch((error: unknown) => { if (error instanceof DOMException && error.name === "AbortError") return; setCommentError(error instanceof Error ? error.message : "Review comments could not be loaded."); });
    return () => controller.abort();
  }, [project.id]);

  const assetById = new Map(project.storyboard.assets.map((asset) => [asset.id, asset]));

  function renderImage(imageId: string, className: string) {
    const asset = assetById.get(imageId);
    if (!asset || asset.kind !== "image") return null;
    const decorative = scene?.decorativeImages.includes(imageId) ?? false;
    return <figure className={className} key={imageId}>
      <img src={`/api/projects/${project.id}/assets/${imageId}`} alt={decorative ? "" : scene?.imageAltText[imageId] ?? ""} />
      {!decorative && scene?.imageAltText[imageId]?.trim() && <figcaption>{scene.imageAltText[imageId]}</figcaption>}
    </figure>;
  }

  function submitAssessment(item: AssessmentItem) {
    if (!scene) return;
    const settings = assessmentSettings(scene);
    const current = assessmentResults[scene.id] ?? createEmptyAssessmentResult(item, settings);
    const hasResponse = current.response.length > 0 || Object.keys(current.matches).length > 0 || current.textResponse.trim().length > 0;
    if (!hasResponse || current.isCorrect === true || current.attempts >= settings.maxAttempts) return;
    setAssessmentResults((results) => ({
      ...results,
      [scene.id]: {
        ...current,
        attempts: current.attempts + 1,
        isCorrect: assessmentResponseIsCorrect(item, current),
      },
    }));
  }

  function openRemediation(assessmentSceneId: string, remediationSceneId: string) {
    const targetIndex = scenes.findIndex((item) => item.id === remediationSceneId);
    if (targetIndex < 0) return;
    setRemediationRoute({ assessmentSceneId, remediationSceneId });
    setSceneIndex(targetIndex);
  }

  function returnToAssessment() {
    if (!remediationRoute) return;
    const assessmentIndex = scenes.findIndex((item) => item.id === remediationRoute.assessmentSceneId);
    if (assessmentIndex >= 0) setSceneIndex(assessmentIndex);
    setRemediationRoute(null);
  }

  async function postComment() {
    if (!scene || !commentAuthor.trim() || !commentBody.trim() || commentBusy) return;
    setCommentBusy(true); setCommentError("");
    try {
      const response = await fetch(`/api/projects/${project.id}/review-comments`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sceneId: scene.id, authorLabel: commentAuthor, body: commentBody }) });
      if (!response.ok) throw new Error("Comment could not be saved.");
      const created = await response.json() as ReviewComment;
      setComments((current) => [...current, created]); setCommentBody("");
      reportOnboardingOutcome("comment.saved", project.id, scene.id);
    } catch (error: unknown) { setCommentError(error instanceof Error ? error.message : "Comment could not be saved."); }
    finally { setCommentBusy(false); }
  }

  async function updateComment(commentId: string, action: "decision" | "replies", body: object) {
    setCommentBusy(true); setCommentError("");
    try {
      const response = await fetch(`/api/projects/${project.id}/review-comments/${commentId}/${action}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!response.ok) throw new Error("Review update could not be saved.");
      const updated = await response.json() as ReviewComment;
      setComments((current) => current.map((comment) => comment.id === updated.id ? updated : comment));
      reportOnboardingOutcome("comment.updated", project.id, updated.sceneId);
      if (action === "replies") setReplyDrafts((current) => ({ ...current, [commentId]: "" }));
    } catch (error: unknown) { setCommentError(error instanceof Error ? error.message : "Review update could not be saved."); }
    finally { setCommentBusy(false); }
  }

  async function enhanceComment(comment: ReviewComment) {
    setCommentBusy(true); setCommentError("");
    try {
      const response = await fetch(`/api/projects/${project.id}/enhancement-jobs`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scope: "selected-scenes", sceneIds: [comment.sceneId], goal: comment.body, resourceIds: [], commentId: comment.id }) });
      if (!response.ok) throw new Error("Enhancement request could not be started.");
    } catch (error: unknown) { setCommentError(error instanceof Error ? error.message : "Enhancement request could not be started."); }
    finally { setCommentBusy(false); }
  }

  return <section data-onboarding="preview.content" className="course-preview-shell" role="dialog" aria-modal="true" aria-label={`${project.title} course preview`}>
    <header className="course-preview-header">
      <div className="preview-brand-lockup"><BrandMark /><div className="course-preview-brand"><span>CHIMERA PREVIEW</span><strong>{project.title}</strong></div></div>
      <div className={`course-preview-progress ${coursePassed ? "course-complete" : ""}`}><span>{courseComplete ? coursePassed ? `Course passed · Score ${weightedScore ?? 100}%` : `Course complete · Score ${weightedScore ?? 0}% · Pass ${project.storyboard.completionSettings.passingScore}%` : requiredAudioSetupMissingCount ? `${requiredAudioSetupMissingCount} required-audio ${requiredAudioSetupMissingCount === 1 ? "scene has" : "scenes have"} no audio attached` : `${completedRequiredSceneCount} of ${requiredSceneCount} required scenes · ${completedRequiredAudioCount} of ${requiredAudioTrackCount} required audio tracks`}</span><div className="course-preview-progress-track" role="progressbar" aria-label="Required scenes completed" aria-valuemin={0} aria-valuemax={Math.max(requiredSceneCount, 1)} aria-valuenow={completedRequiredSceneCount}><span style={{ width: `${requiredSceneCount ? Math.round(completedRequiredSceneCount / requiredSceneCount * 100) : 0}%` }} /></div></div>
      <button type="button" className="course-preview-close" onClick={onClose} aria-label="Close course preview"><X size={18} /><span>Exit preview</span></button>
    </header>
    <button type="button" className="course-preview-contents-toggle course-preview-nav-button" aria-expanded={contentsOpen} aria-controls="preview-contents" onClick={() => setContentsOpen(!contentsOpen)}><List size={17} /> Contents</button>
    {contentsOpen && <nav id="preview-contents" className="course-preview-contents" aria-label="Table of contents"><div className="course-preview-contents-heading"><strong>Contents</strong><button type="button" className="icon-button" aria-label="Close contents" onClick={() => setContentsOpen(false)}><X size={18} /></button></div>{scenes.map((item, index) => <button type="button" key={item.id} aria-current={index === sceneIndex ? "step" : undefined} onClick={() => { setSceneIndex(index); setRemediationRoute(null); setContentsOpen(false); }}><span>{index + 1}</span><span>{item.title || "Untitled scene"}</span>{visitedSceneIds.includes(item.id) && <Check size={14} aria-label="Visited" />}</button>)}</nav>}
    {scene ? <main className="course-preview-main">
      <div className="course-preview-scene-meta"><span>SCENE {String(sceneIndex + 1).padStart(2, "0")} / {String(scenes.length).padStart(2, "0")}</span><span>{scene.sceneType}</span></div>
      <article className="course-preview-content" aria-labelledby="course-preview-scene-title">
        {remediationRoute?.remediationSceneId === scene.id && <button type="button" className="course-preview-nav-button previous" onClick={returnToAssessment}><ArrowLeft size={16} /><span>Return to question</span></button>}
        <h1 id="course-preview-scene-title">{scene.title || "Untitled scene"}</h1>
        {scene.visualLayout?.enabled ? <SceneSurface project={project} scene={scene} /> : scene.previewImage ? <div className="course-preview-slide"><img src={`/api/projects/${project.id}/${scene.previewImage}`} alt={`Slide ${scene.sourceSlide ?? sceneIndex + 1}: ${scene.title}`} /></div> : scene.extractedText.length > 0 ? <div className="course-preview-text">{scene.extractedText.map((text, index) => <p key={`${index}-${text}`}>{text}</p>)}</div> : <p className="course-preview-empty">This scene has no learner-facing content yet.</p>}
        {!scene.visualLayout?.enabled && scene.previewImage && scene.extractedText.length > 0 && <details className="course-preview-transcript"><summary>Read slide text</summary><div>{scene.extractedText.map((text, index) => <p key={`${index}-${text}`}>{text}</p>)}</div></details>}
        {!scene.visualLayout?.enabled && scene.imageAssets.length > 0 && <div className="course-preview-images" aria-label="Scene images">{scene.imageAssets.map((imageId) => renderImage(imageId, "course-preview-image"))}</div>}
        {scene.assessmentItem && (() => {
          const item = scene.assessmentItem;
          const settings = assessmentSettings(scene);
          const result = assessmentResults[scene.id] ?? createEmptyAssessmentResult(item, settings);
          const attemptsExhausted = result.isCorrect !== true && result.attempts >= settings.maxAttempts;
          const resultScore = result.isCorrect === true ? 100 : 0;
          const assessmentPassed = result.attempts > 0 && resultScore >= settings.passingScore;
          const disabled = result.isCorrect === true || attemptsExhausted;
          const setResponse = (response: string[]) => setAssessmentResults((current) => ({
            ...current,
            [scene.id]: { ...(current[scene.id] ?? createEmptyAssessmentResult(item, settings)), response, isCorrect: null },
          }));
          const setMatch = (source: string, target: string) => setAssessmentResults((current) => {
            const currentResult = current[scene.id] ?? createEmptyAssessmentResult(item, settings);
            const matches = Object.fromEntries(Object.entries(currentResult.matches).filter(([key, value]) => key !== source && value !== target));
            return { ...current, [scene.id]: { ...currentResult, matches: target ? { ...matches, [source]: target } : matches, isCorrect: null } };
          });
          const choiceList = item.type === "single-choice" || item.type === "multiple-response" || item.type === "ordering"
            ? item.choices
            : item.type === "true-false"
              ? [{ identifier: "true", text: "True" }, { identifier: "false", text: "False" }]
              : [];
          const orderedChoices = item.type === "ordering" && result.response.length
            ? [...result.response.map((id) => item.choices.find((choice) => choice.identifier === id)).filter((choice): choice is (typeof item.choices)[number] => Boolean(choice)), ...item.choices.filter((choice) => !result.response.includes(choice.identifier))]
            : item.type === "ordering" ? item.choices : [];
          return <section className="course-preview-assessment" aria-labelledby="assessment-prompt">
            <div className="course-preview-assessment-kicker">KNOWLEDGE CHECK · {item.type.replaceAll("-", " ").toUpperCase()}</div>
            <h2 id="assessment-prompt">{item.prompt}</h2>
            <fieldset disabled={disabled}>
              {item.type === "single-choice" && <><legend>Choose one answer</legend>{choiceList.map((choice) => <label className={`course-preview-answer ${result.response.includes(choice.identifier) ? "selected" : ""}`} key={choice.identifier}><input type="radio" name={`response-${scene.id}`} value={choice.identifier} checked={result.response[0] === choice.identifier} onChange={() => setResponse([choice.identifier])} /><span>{choice.text}</span></label>)}</>}
              {item.type === "true-false" && <><legend>Choose true or false</legend>{choiceList.map((choice) => <label className={`course-preview-answer ${result.response.includes(choice.identifier) ? "selected" : ""}`} key={choice.identifier}><input type="radio" name={`response-${scene.id}`} value={choice.identifier} checked={result.response[0] === choice.identifier} onChange={() => setResponse([choice.identifier])} /><span>{choice.text}</span></label>)}</>}
              {item.type === "multiple-response" && <><legend>Choose all that apply</legend>{choiceList.map((choice) => <label className={`course-preview-answer ${result.response.includes(choice.identifier) ? "selected" : ""}`} key={choice.identifier}><input type="checkbox" value={choice.identifier} checked={result.response.includes(choice.identifier)} onChange={() => setResponse(result.response.includes(choice.identifier) ? result.response.filter((id) => id !== choice.identifier) : [...result.response, choice.identifier])} /><span>{choice.text}</span></label>)}</>}
              {item.type === "ordering" && <><legend>Arrange in the correct order</legend>{orderedChoices.map((choice, index) => <div className="course-preview-order-row" key={choice.identifier}><span>{index + 1}.</span><strong>{choice.text}</strong><button type="button" className="icon-button" aria-label={`Move ${choice.text} earlier`} disabled={index === 0} onClick={() => { const next = [...orderedChoices]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; setResponse(next.map((entry) => entry.identifier)); }}><ArrowUp size={14} /></button><button type="button" className="icon-button" aria-label={`Move ${choice.text} later`} disabled={index === orderedChoices.length - 1} onClick={() => { const next = [...orderedChoices]; [next[index], next[index + 1]] = [next[index + 1], next[index]]; setResponse(next.map((entry) => entry.identifier)); }}><ArrowDown size={14} /></button></div>)}</>}
              {(item.type === "matching" || item.type === "drag-drop") && (() => {
                const sources = item.type === "matching" ? item.leftItems : item.draggables;
                const targets = item.type === "matching" ? item.rightItems : item.targets;
                return <><legend>{item.type === "matching" ? "Match each item" : "Drag each item to a target, or choose a target"}</legend>
                  {item.type === "drag-drop" && <div className="course-preview-draggables" aria-label="Draggable answers">{sources.map((source) => <button type="button" className="course-preview-drag-chip" draggable={!disabled} key={source.identifier} onDragStart={(event) => event.dataTransfer.setData("text/plain", source.identifier)}>{source.text}</button>)}</div>}
                  <div className="course-preview-match-list">{sources.map((source) => <label className="course-preview-match-row" key={source.identifier}><span>{source.text}</span><select aria-label={`Match for ${source.text}`} value={result.matches[source.identifier] ?? ""} onChange={(event) => setMatch(source.identifier, event.target.value)}><option value="">Choose a match</option>{targets.map((target) => <option key={target.identifier} value={target.identifier}>{target.text}</option>)}</select></label>)}</div>
                  {item.type === "drag-drop" && <div className="course-preview-drop-targets" aria-label="Drop targets">{targets.map((target) => <div className="course-preview-drop-target" key={target.identifier} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); const source = event.dataTransfer.getData("text/plain"); if (source) setMatch(source, target.identifier); }}><strong>{target.text}</strong><span>{Object.entries(result.matches).find(([, targetId]) => targetId === target.identifier)?.[0] ? sources.find((source) => source.identifier === Object.entries(result.matches).find(([, targetId]) => targetId === target.identifier)?.[0])?.text : "Drop an item here"}</span></div>)}</div>}
                </>;
              })()}
              {item.type === "short-answer" && <label className="course-preview-short-answer">Your answer<input type="text" maxLength={1000} value={result.textResponse} onChange={(event) => setAssessmentResults((current) => ({ ...current, [scene.id]: { ...(current[scene.id] ?? createEmptyAssessmentResult(item, settings)), textResponse: event.target.value, isCorrect: null } }))} /></label>}
            </fieldset>
            <div className="course-preview-assessment-actions"><button type="button" className="course-preview-nav-button next" onClick={() => submitAssessment(item)} disabled={!(result.response.length || Object.keys(result.matches).length || result.textResponse.trim()) || assessmentPassed || attemptsExhausted}>{attemptsExhausted ? "Attempts used" : result.attempts ? "Try again" : "Check answer"}</button>{result.attempts > 0 && <span className={`course-preview-assessment-score ${assessmentPassed ? "correct" : "incorrect"}`}>{assessmentPassed ? `Passed · Score ${resultScore}% · ${result.attempts}/${settings.maxAttempts} attempts · Pass ${settings.passingScore}%` : `${attemptsExhausted ? "Attempts exhausted" : "Not correct"} · Score ${resultScore}% · ${result.attempts}/${settings.maxAttempts} attempts · Pass ${settings.passingScore}%`}</span>}</div>
            {result.isCorrect === true && <p className="course-preview-assessment-feedback correct" role="status">{item.correctFeedback}</p>}
            {result.isCorrect === false && <p className="course-preview-assessment-feedback incorrect" role="status">{item.incorrectFeedback}</p>}
            {result.isCorrect === false && settings.remediationSceneId && <button type="button" className="course-preview-nav-button previous" onClick={() => openRemediation(scene.id, settings.remediationSceneId!)}><ArrowRight size={16} /><span>Review lesson</span></button>}
          </section>;
        })()}
        {scene.audioAssets.map((audioId) => {
          const asset = assetById.get(audioId);
          if (asset?.kind !== "audio") return null;
          const isRequired = scene.audioRequired;
          const isComplete = completedAudioKeys.includes(audioCompletionKey(scene.id, audioId));
          return <section className={`course-preview-audio ${isRequired ? "required-audio" : ""}`} key={audioId}><span>{asset.filename}{isRequired ? ` · ${isComplete ? "Complete" : "Required"}` : ""}</span><audio controls preload="metadata" src={`/api/projects/${project.id}/assets/${audioId}`} aria-label={`Audio: ${asset.filename}${isRequired ? ", required" : ""}`} onEnded={() => { if (isRequired) setCompletedAudioKeys((current) => current.includes(audioCompletionKey(scene.id, audioId)) ? current : [...current, audioCompletionKey(scene.id, audioId)]); }} /></section>;
        })}
        <section data-onboarding="preview.comments" className="course-preview-review" aria-labelledby="course-preview-review-title">
          <div className="course-preview-review-heading"><div><span className="course-preview-assessment-kicker">IN-APP REVIEW · REVISION {project.storyboard.revision}</span><h2 id="course-preview-review-title"><MessageCircle size={17} /> Scene discussion</h2></div><label className="course-preview-comment-filter">Show<select value={commentFilter} onChange={(event) => setCommentFilter(event.target.value as "all" | "unresolved" | "outdated")}><option value="all">All threads</option><option value="unresolved">Unresolved</option><option value="outdated">Outdated</option></select></label></div>
          <div className="course-preview-comment-form"><label>Reviewer<input value={commentAuthor} readOnly={Boolean(session)} onChange={(event) => setCommentAuthor(event.target.value)} /></label><label>Comment<textarea rows={2} value={commentBody} onChange={(event) => setCommentBody(event.target.value)} placeholder="Leave feedback on this scene" /></label><button type="button" className="course-preview-nav-button next" onClick={() => void postComment()} disabled={commentBusy || !commentBody.trim()}><Send size={14} /> Add comment</button></div>
          {commentError && <p className="course-preview-comment-error" role="alert">{commentError}</p>}
          <div className="course-preview-comment-list">{comments.filter((comment) => comment.sceneId === scene.id && (commentFilter === "all" || (commentFilter === "unresolved" && !comment.resolved) || (commentFilter === "outdated" && comment.outdated))).map((comment) => <article className={`course-preview-comment ${comment.resolved ? "resolved" : ""}`} key={comment.id}><div className="course-preview-comment-meta"><strong>{comment.authorLabel}</strong><span>{comment.outdated ? "Outdated context" : comment.resolved ? "Resolved" : `Revision ${comment.revision}`}</span></div><p>{comment.body}</p>{comment.replies.map((reply) => <div className="course-preview-reply" key={reply.id}><strong>{reply.authorLabel}</strong><span>{reply.body}</span></div>)}<div className="course-preview-comment-actions">{!comment.resolved && <button type="button" onClick={() => void updateComment(comment.id, "decision", { resolved: true })}>Resolve</button>}{comment.resolved && <button type="button" onClick={() => void updateComment(comment.id, "decision", { resolved: false })}>Reopen</button>}{canEnhance && <button type="button" onClick={() => void enhanceComment(comment)} disabled={commentBusy}>Enhance</button>}<input aria-label={`Reply to ${comment.authorLabel}`} value={replyDrafts[comment.id] ?? ""} onChange={(event) => setReplyDrafts((current) => ({ ...current, [comment.id]: event.target.value }))} placeholder="Reply" /><button type="button" onClick={() => void updateComment(comment.id, "replies", { authorLabel: commentAuthor, body: replyDrafts[comment.id] ?? "" })} disabled={commentBusy || !(replyDrafts[comment.id] ?? "").trim()}>Reply</button></div></article>)}</div>
        </section>
      </article>
      <footer className="course-preview-navigation"><button type="button" className="course-preview-nav-button previous" onClick={() => setSceneIndex((current) => Math.max(0, current - 1))} disabled={sceneIndex === 0}><ArrowLeft size={17} /><span>Previous</span></button><div className="course-preview-dots" ref={dotsContainerRef} role="group" aria-label="Scene navigation">{scenes.map((item, index) => <button type="button" key={item.id} ref={index === sceneIndex ? activeDotRef : null} className={`${index === sceneIndex ? "active" : ""} ${visitedSceneIds.includes(item.id) ? "visited" : ""}`} aria-label={`Go to scene ${index + 1}: ${item.title}`} aria-current={index === sceneIndex ? "step" : undefined} onClick={() => setSceneIndex(index)} />)}</div><button type="button" className="course-preview-nav-button next" onClick={() => setSceneIndex((current) => Math.min(scenes.length - 1, current + 1))} disabled={sceneIndex === scenes.length - 1}><span>{sceneIndex === scenes.length - 1 ? "End" : "Next"}</span>{sceneIndex === scenes.length - 1 ? <Check size={17} /> : <ArrowRight size={17} />}</button></footer>
    </main> : <main className="course-preview-no-scenes"><h1>This course has no scenes yet.</h1><p>Add or import scenes in the storyboard to preview the learner experience.</p><button type="button" className="course-preview-nav-button" onClick={onClose}>Return to authoring</button></main>}
  </section>;
}
