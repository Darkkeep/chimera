import { reportOnboardingOutcome } from "./onboarding-journeys";
import { useState } from "react";
import { ArrowDown, ArrowUp, Download, Minus, Plus, Save, X } from "lucide-react";
import type { AssessmentChoice, AssessmentItem, AssessmentPair, AssessmentSettings, AssessmentType, Project, Scene } from "./App";
import { revisionConflictMessage, storyboardWriteHeaders } from "./revision";
import { QuestionMetadataFields } from "./QuestionMetadataFields";
import "./assessment-editor.css";
import "./assessment-settings.css";
import "./assessment-types.css";

type AssessmentEditorProps = {
  projectId: string;
  projectTitle: string;
  revision: number;
  scene: Scene;
  scenes: Scene[];
  onClose: () => void;
  onProjectUpdated: (project: Project) => void;
};

type ChoiceSide = "primary" | "secondary";

function createDefaultItem(type: AssessmentType, scene: Scene, identifier?: string, prompt = ""): AssessmentItem {
  const base = {
    identifier: identifier ?? `ITEM_${scene.id.replace(/[^A-Za-z0-9_-]/g, "_")}`,
    prompt,
    correctFeedback: "Correct.",
    incorrectFeedback: "Review the material and try again.",
  };
  const choices = [{ identifier: "CHOICE_A", text: "" }, { identifier: "CHOICE_B", text: "" }];
  if (type === "single-choice") return { ...base, type, choices, correctResponse: "CHOICE_A" };
  if (type === "multiple-response") return { ...base, type, choices, correctResponses: ["CHOICE_A"] };
  if (type === "true-false") return { ...base, type, correctResponse: "true" };
  if (type === "ordering") return { ...base, type, choices, correctOrder: ["CHOICE_A", "CHOICE_B"] };
  if (type === "drag-drop") return {
    ...base,
    type,
    draggables: [{ identifier: "DRAG_A", text: "" }, { identifier: "DRAG_B", text: "" }],
    targets: [{ identifier: "TARGET_A", text: "" }, { identifier: "TARGET_B", text: "" }],
    correctMatches: [
      { sourceIdentifier: "DRAG_A", targetIdentifier: "TARGET_A" },
      { sourceIdentifier: "DRAG_B", targetIdentifier: "TARGET_B" },
    ],
  };
  if (type === "matching") return {
    ...base,
    type,
    leftItems: [{ identifier: "LEFT_A", text: "" }, { identifier: "LEFT_B", text: "" }],
    rightItems: [{ identifier: "RIGHT_A", text: "" }, { identifier: "RIGHT_B", text: "" }],
    correctMatches: [
      { sourceIdentifier: "LEFT_A", targetIdentifier: "RIGHT_A" },
      { sourceIdentifier: "LEFT_B", targetIdentifier: "RIGHT_B" },
    ],
  };
  return { ...base, type: "short-answer", acceptedAnswers: [""], caseSensitive: false };
}

function choicesFor(item: AssessmentItem, side: ChoiceSide): AssessmentChoice[] {
  if (item.type === "single-choice" || item.type === "multiple-response" || item.type === "ordering") return side === "primary" ? item.choices : [];
  if (item.type === "drag-drop") return side === "primary" ? item.draggables : item.targets;
  if (item.type === "matching") return side === "primary" ? item.leftItems : item.rightItems;
  return [];
}

function withChoices(item: AssessmentItem, side: ChoiceSide, choices: AssessmentChoice[]): AssessmentItem {
  if (item.type === "single-choice" || item.type === "multiple-response" || item.type === "ordering") return { ...item, choices };
  if (item.type === "drag-drop") return side === "primary" ? { ...item, draggables: choices } : { ...item, targets: choices };
  if (item.type === "matching") return side === "primary" ? { ...item, leftItems: choices } : { ...item, rightItems: choices };
  return item;
}

function nextChoiceId(item: AssessmentItem, side: ChoiceSide): string | null {
  const prefix = item.type === "drag-drop" ? (side === "primary" ? "DRAG" : "TARGET")
    : item.type === "matching" ? (side === "primary" ? "LEFT" : "RIGHT") : "CHOICE";
  const used = new Set([...choicesFor(item, "primary"), ...choicesFor(item, "secondary")].map((choice) => choice.identifier));
  for (let index = 0; index < 10; index += 1) {
    const identifier = `${prefix}_${String.fromCharCode(65 + index)}`;
    if (!used.has(identifier)) return identifier;
  }
  return null;
}

function questionTypeName(type: AssessmentType): string {
  return ({
    "single-choice": "Multiple choice · one answer",
    "multiple-response": "Multiple choice · multiple answers",
    "true-false": "True / False",
    ordering: "Ordering",
    "drag-drop": "Drag and drop",
    matching: "Matching",
    "short-answer": "Fill-in-the-blank",
  })[type];
}

export function AssessmentEditor({ projectId, projectTitle, revision, scene, scenes, onClose, onProjectUpdated }: AssessmentEditorProps) {
  const [item, setItem] = useState<AssessmentItem>(() => scene.assessmentItem ?? createDefaultItem("single-choice", scene));
  const [settings, setSettings] = useState<AssessmentSettings>(() => scene.assessmentSettings ?? { maxAttempts: 2, passingScore: 100, scoreWeight: 1, remediationSceneId: null });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const primary = choicesFor(item, "primary");
  const secondary = choicesFor(item, "secondary");

  function markChanged() {
    setSaved(false);
  }

  function replaceChoice(side: ChoiceSide, index: number, update: Partial<AssessmentChoice>) {
    const choices = choicesFor(item, side).map((choice, choiceIndex) => choiceIndex === index ? { ...choice, ...update } : choice);
    setItem(withChoices(item, side, choices));
    markChanged();
  }

  function addChoice(side: ChoiceSide) {
    const choices = choicesFor(item, side);
    const identifier = nextChoiceId(item, side);
    if (!identifier || choices.length >= 10) return;
    const next = [...choices, { identifier, text: "" }];
    let updated = withChoices(item, side, next);
    if (updated.type === "ordering") updated = { ...updated, correctOrder: next.map((choice) => choice.identifier) };
    setItem(updated);
    markChanged();
  }

  function removeChoice(side: ChoiceSide, index: number) {
    const choices = choicesFor(item, side);
    if (choices.length <= 1) return;
    const removed = choices[index]?.identifier;
    const next = choices.filter((_, choiceIndex) => choiceIndex !== index);
    let updated = withChoices(item, side, next);
    if (updated.type === "single-choice" && updated.correctResponse === removed) updated = { ...updated, correctResponse: next[0].identifier };
    if (updated.type === "multiple-response") updated = { ...updated, correctResponses: updated.correctResponses.filter((id) => id !== removed) };
    if (updated.type === "ordering") updated = { ...updated, correctOrder: next.map((choice) => choice.identifier) };
    if ((updated.type === "drag-drop" || updated.type === "matching") && removed) updated = {
      ...updated,
      correctMatches: updated.correctMatches.filter((pair) => pair.sourceIdentifier !== removed && pair.targetIdentifier !== removed),
    };
    setItem(updated);
    markChanged();
  }

  function setPair(sourceIdentifier: string, targetIdentifier: string) {
    if (item.type !== "drag-drop" && item.type !== "matching") return;
    const matches = item.correctMatches.filter((pair) => pair.sourceIdentifier !== sourceIdentifier && pair.targetIdentifier !== targetIdentifier);
    setItem({ ...item, correctMatches: [...matches, { sourceIdentifier, targetIdentifier }] });
    markChanged();
  }

  function moveOrderedChoice(index: number, offset: -1 | 1) {
    if (item.type !== "ordering") return;
    const targetIndex = index + offset;
    if (targetIndex < 0 || targetIndex >= item.choices.length) return;
    const choices = [...item.choices];
    [choices[index], choices[targetIndex]] = [choices[targetIndex], choices[index]];
    setItem({ ...item, choices, correctOrder: choices.map((choice) => choice.identifier) });
    markChanged();
  }

  const hasChoices = item.type === "single-choice" || item.type === "multiple-response" || item.type === "ordering";
  const choiceAnswersValid = primary.length >= 2 && primary.every((choice) => choice.text.trim());
  const matchesValid = item.type !== "drag-drop" && item.type !== "matching" || item.correctMatches.length === (item.type === "drag-drop" ? item.targets.length : primary.length);
  const typeAnswersValid = item.type === "single-choice"
    ? choiceAnswersValid && primary.some((choice) => choice.identifier === item.correctResponse)
    : item.type === "multiple-response"
      ? choiceAnswersValid && item.correctResponses.length > 0 && item.correctResponses.every((id) => primary.some((choice) => choice.identifier === id))
      : item.type === "ordering"
        ? choiceAnswersValid && item.correctOrder.length === primary.length
        : item.type === "true-false"
          ? true
          : item.type === "short-answer"
            ? item.acceptedAnswers.some((answer) => answer.trim())
            : item.type === "drag-drop"
              ? choiceAnswersValid && secondary.length > 0 && secondary.every((choice) => choice.text.trim()) && matchesValid
              : choiceAnswersValid && secondary.length >= 2 && secondary.every((choice) => choice.text.trim()) && matchesValid;
  const duplicateIdentifier = scenes.some(candidate => candidate.id !== scene.id && candidate.assessmentItem?.identifier === item.identifier);
  const metadataValid = !item.metadata || /^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/.test(item.metadata.language)
    && [item.metadata.tags, item.metadata.learningObjectiveRefs].every(values => values.length <= 50 && new Set(values).size === values.length && values.every(value => value.length <= 200));
  const canSave = Boolean(/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(item.identifier) && !duplicateIdentifier && item.prompt.trim() && typeAnswersValid && metadataValid);

  async function saveQuestion() {
    if (!canSave || busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/projects/${projectId}/scenes/${scene.id}`, {
        method: "PATCH",
        headers: storyboardWriteHeaders(revision),
        body: JSON.stringify({
          assessmentSettings: settings,
          assessmentItem: {
            ...item,
            prompt: item.prompt.trim(),
            correctFeedback: item.correctFeedback.trim(),
            incorrectFeedback: item.incorrectFeedback.trim(),
            ...(item.type === "short-answer" ? { acceptedAnswers: item.acceptedAnswers.map((answer) => answer.trim()).filter(Boolean) } : {}),
          },
        }),
      });
      if (!response.ok) {
        const detail = await response.json().catch(() => null) as { detail?: unknown } | null;
        const conflictMessage = revisionConflictMessage(response.status);
        if (conflictMessage) throw new Error(conflictMessage);
        throw new Error(typeof detail?.detail === "string" ? detail.detail : "Question could not be saved.");
      }
      onProjectUpdated(await response.json() as Project);
      setSaved(true);
      reportOnboardingOutcome(`question.saved.${item.type}`, projectId, scene.id);
      reportOnboardingOutcome("question.saved", projectId, scene.id);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Question could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  async function exportQti() {
    if (!scene.assessmentItem || !saved || busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/projects/${projectId}/scenes/${scene.id}/assessment.qti.xml`);
      if (!response.ok) throw new Error("QTI 2.1 item could not be exported.");
      const downloadUrl = window.URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = `${item.identifier}.xml`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(downloadUrl);
      reportOnboardingOutcome("question.exported", projectId, scene.id);
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : "QTI 2.1 item could not be exported.");
    } finally {
      setBusy(false);
    }
  }

  async function removeQuestion() {
    if (!scene.assessmentItem || busy || !window.confirm("Remove the authored question from this question scene?")) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/projects/${projectId}/scenes/${scene.id}`, {
        method: "PATCH",
        body: JSON.stringify({ assessmentItem: null }),
        headers: storyboardWriteHeaders(revision),
      });
      if (!response.ok) throw new Error(revisionConflictMessage(response.status) || "Question could not be removed.");
      onProjectUpdated(await response.json() as Project);
      reportOnboardingOutcome("question.removed", projectId, scene.id);
      onClose();
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : "Question could not be removed.");
    } finally {
      setBusy(false);
    }
  }

  function choiceList(label: string, side: ChoiceSide) {
    const choices = choicesFor(item, side);
    const addLabel = item.type === "drag-drop" ? side === "primary" ? "draggable item" : "drop target"
      : item.type === "matching" ? side === "primary" ? "left item" : "right item"
        : item.type === "ordering" ? "step" : "answer choice";
    return <fieldset className="assessment-choices"><legend>{label}</legend>
      {choices.map((choice, index) => <div className={`assessment-choice-row${!hasChoices ? " assessment-choice-row-paired" : item.type === "ordering" ? " assessment-choice-row-ordered" : ""}`} key={choice.identifier}>
        {hasChoices && item.type !== "ordering" && <input
          type={item.type === "multiple-response" ? "checkbox" : "radio"}
          name={item.type === "multiple-response" ? `correct-${side}` : `correct-${side}-${scene.id}`}
          aria-label={`Mark ${choice.identifier} as correct`}
          checked={item.type === "single-choice" ? item.correctResponse === choice.identifier : item.type === "multiple-response" ? item.correctResponses.includes(choice.identifier) : false}
          onChange={() => {
            if (item.type === "single-choice") setItem({ ...item, correctResponse: choice.identifier });
            if (item.type === "multiple-response") setItem({ ...item, correctResponses: item.correctResponses.includes(choice.identifier) ? item.correctResponses.filter((id) => id !== choice.identifier) : [...item.correctResponses, choice.identifier] });
            markChanged();
          }}
        />}
        {item.type === "ordering" && <div className="assessment-order-actions"><button type="button" className="icon-button" aria-label={`Move ${choice.identifier} earlier`} title="Move step earlier" onClick={() => moveOrderedChoice(index, -1)} disabled={busy || index === 0}><ArrowUp size={18} /></button><button type="button" className="icon-button" aria-label={`Move ${choice.identifier} later`} title="Move step later" onClick={() => moveOrderedChoice(index, 1)} disabled={busy || index === choices.length - 1}><ArrowDown size={18} /></button></div>}
        <label className="assessment-choice-label"><span className="assessment-choice-id">{choice.identifier}</span><input value={choice.text} maxLength={1000} onChange={(event) => replaceChoice(side, index, { text: event.target.value })} aria-label={`Text for ${choice.identifier}`} placeholder={`${addLabel.charAt(0).toUpperCase()}${addLabel.slice(1)} ${index + 1}`} /></label>
        <button type="button" className="icon-button assessment-remove-choice" aria-label={`Remove ${choice.identifier}`} onClick={() => removeChoice(side, index)} disabled={busy || choices.length <= 1}><Minus size={15} /></button>
      </div>)}
      <button type="button" className="assessment-add-choice" onClick={() => addChoice(side)} disabled={busy || choices.length >= 10}><Plus size={14} /> Add {addLabel}</button>
    </fieldset>;
  }

  return <div className="assessment-editor-backdrop" onMouseDown={(event) => event.target === event.currentTarget && !busy && onClose()}>
    <section data-onboarding="assessment.editor" data-onboarding-journey={`question-${item.type}`} className="assessment-editor-dialog" role="dialog" aria-modal="true" aria-labelledby="assessment-editor-title">
      <header className="assessment-editor-header">
        <div><p className="eyebrow">VERSION-NEUTRAL ASSESSMENT</p><h2 id="assessment-editor-title">{scene.title}</h2></div>
        <button className="icon-button" onClick={onClose} disabled={busy} aria-label="Close question editor"><X size={18} /></button>
      </header>
      <div className="assessment-editor-body">
        {error && <p className="assessment-editor-error" role="alert">{error}</p>}
        {duplicateIdentifier && <p className="assessment-editor-error" role="alert">This stable identifier is already used by another question in this project.</p>}
        {!metadataValid && <p className="assessment-editor-error" role="alert">Use a language tag such as en-US and at most 50 unique tags or objective references, each up to 200 characters.</p>}
        {!/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(item.identifier) && <p className="assessment-editor-error" role="alert">The stable identifier must start with a letter and contain up to 64 letters, digits, underscores, or hyphens.</p>}
        <label className="assessment-prompt-label">Question type<select value={item.type} onChange={(event) => { setItem({ ...createDefaultItem(event.target.value as AssessmentType, scene, item.identifier, item.prompt), metadata: item.metadata }); markChanged(); }}>{(["single-choice", "multiple-response", "true-false", "ordering", "drag-drop", "matching", "short-answer"] as AssessmentType[]).map((type) => <option key={type} value={type}>{questionTypeName(type)}</option>)}</select></label>
        <label className="assessment-prompt-label">Question prompt<textarea rows={3} maxLength={5000} value={item.prompt} onChange={(event) => { setItem({ ...item, prompt: event.target.value }); markChanged(); }} placeholder="Write a clear question" /></label>
        {(item.type === "single-choice" || item.type === "multiple-response") && <p className="field-hint">{item.type === "single-choice" ? "Select one correct answer." : "Select every correct answer."}</p>}
        {item.type === "ordering" && <p className="assessment-authoring-hint">Enter each step below, then use the up and down arrows to arrange the correct sequence.</p>}
        {(item.type === "drag-drop" || item.type === "matching") && <p className="assessment-authoring-hint">Enter text in both lists below, add items as needed, then select the correct {item.type === "drag-drop" ? "placements" : "matches"}. Answer items currently support text only, not images.</p>}
        {hasChoices && choiceList(item.type === "ordering" ? "Correct sequence" : "Answer choices", "primary")}
        {item.type === "true-false" && <fieldset className="assessment-choices"><legend>Correct answer</legend>{(["true", "false"] as const).map((answer) => <label className="assessment-choice-row" key={answer}><input type="radio" name={`true-false-${scene.id}`} checked={item.correctResponse === answer} onChange={() => { setItem({ ...item, correctResponse: answer }); markChanged(); }} /><span>{answer === "true" ? "True" : "False"}</span></label>)}</fieldset>}
        {item.type === "drag-drop" && <div className="assessment-pair-lists">{choiceList("Draggable items", "primary")}{choiceList("Drop targets", "secondary")}<fieldset className="assessment-choices"><legend>Correct placement</legend>{item.draggables.map((source) => <label className="assessment-pair-row" key={source.identifier}><span>{source.text || source.identifier}</span><select value={item.correctMatches.find((pair) => pair.sourceIdentifier === source.identifier)?.targetIdentifier ?? ""} onChange={(event) => setPair(source.identifier, event.target.value)}><option value="">Choose target</option>{item.targets.map((target) => <option key={target.identifier} value={target.identifier}>{target.text || target.identifier}</option>)}</select></label>)}</fieldset></div>}
        {item.type === "matching" && <div className="assessment-pair-lists">{choiceList("Left column", "primary")}{choiceList("Right column", "secondary")}<fieldset className="assessment-choices"><legend>Correct matches</legend>{item.leftItems.map((source) => <label className="assessment-pair-row" key={source.identifier}><span>{source.text || source.identifier}</span><select value={item.correctMatches.find((pair) => pair.sourceIdentifier === source.identifier)?.targetIdentifier ?? ""} onChange={(event) => setPair(source.identifier, event.target.value)}><option value="">Choose match</option>{item.rightItems.map((target) => <option key={target.identifier} value={target.identifier}>{target.text || target.identifier}</option>)}</select></label>)}</fieldset></div>}
        {item.type === "short-answer" && <fieldset className="assessment-choices"><legend>Accepted answers for the blank</legend><p className="assessment-authoring-hint">Learners fill in one blank after the prompt. Enter a word or short phrase, with alternate spellings or equivalent answers on separate lines. Answers must match exactly, ignoring surrounding whitespace and, unless selected below, letter case. This is not a written-response or essay question.</p><label className="assessment-prompt-label">Enter one accepted answer per line<textarea rows={4} value={item.acceptedAnswers.join("\n")} onChange={(event) => { setItem({ ...item, acceptedAnswers: event.target.value.split(/\r?\n/) }); markChanged(); }} /></label><label className="assessment-toggle"><input type="checkbox" checked={item.caseSensitive} onChange={(event) => { setItem({ ...item, caseSensitive: event.target.checked }); markChanged(); }} /><span>Match letter case</span></label></fieldset>}
        <div className="assessment-feedback-fields"><label>Correct feedback<textarea rows={2} maxLength={2000} value={item.correctFeedback} onChange={(event) => { setItem({ ...item, correctFeedback: event.target.value }); markChanged(); }} /></label><label>Incorrect feedback<textarea rows={2} maxLength={2000} value={item.incorrectFeedback} onChange={(event) => { setItem({ ...item, incorrectFeedback: event.target.value }); markChanged(); }} /></label></div>
        <fieldset className="assessment-settings"><legend>Assessment rules</legend><label>Maximum attempts<select value={settings.maxAttempts} onChange={(event) => { setSettings({ ...settings, maxAttempts: Number(event.target.value) }); markChanged(); }}>{[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((attempts) => <option key={attempts} value={attempts}>{attempts} {attempts === 1 ? "attempt" : "attempts"}</option>)}</select></label><label>Passing score<select value={settings.passingScore} onChange={(event) => { setSettings({ ...settings, passingScore: Number(event.target.value) }); markChanged(); }}>{[50, 60, 70, 75, 80, 85, 90, 100].map((score) => <option key={score} value={score}>{score}%</option>)}</select></label><label>Course score weight<input type="number" min={0.1} max={10} step={0.1} value={settings.scoreWeight} onChange={(event) => { setSettings({ ...settings, scoreWeight: Number(event.target.value) }); markChanged(); }} /></label><label>Remediation scene<select value={settings.remediationSceneId ?? ""} onChange={(event) => { setSettings({ ...settings, remediationSceneId: event.target.value || null }); markChanged(); }}><option value="">No remediation</option>{scenes.filter((candidate) => candidate.id !== scene.id).map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.title}</option>)}</select></label></fieldset>
        <p className="assessment-qti-note">Question data stays version-neutral in the storyboard. Export creates a QTI 2.1 assessment item XML file.</p>
        <QuestionMetadataFields key={scene.id} item={item} sceneTitle={scene.title} scenes={scenes} disabled={busy} onChange={updated => { setItem(updated); markChanged(); }} />
      </div>
      <footer className="assessment-editor-footer"><div>{saved && <span className="assessment-saved">Saved to {projectTitle}</span>}</div><div className="assessment-editor-actions">{scene.assessmentItem && <button className="button button-outline assessment-delete" onClick={() => void removeQuestion()} disabled={busy} title="Remove this question from the scene.">Remove question</button>}<button className="button button-outline" onClick={() => void exportQti()} disabled={busy || !scene.assessmentItem || !saved} title="Download this question as a QTI 2.1 item."><Download size={14} /> Export QTI item</button><button className="button button-accent" onClick={() => void saveQuestion()} disabled={busy || !canSave} title="Save this question and its scoring rules."><Save size={14} />{busy ? "Saving" : "Save question"}</button></div></footer>
    </section>
  </div>;
}