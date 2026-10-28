import { useRef, useState } from "react";
import type { ReactNode } from "react";
import { Rnd } from "react-rnd";
import { AlignHorizontalJustifyCenter, AlignHorizontalJustifyEnd, AlignHorizontalJustifyStart, AlignVerticalJustifyCenter, AlignVerticalJustifyEnd, AlignVerticalJustifyStart, ArrowDown, ArrowUp, Check, ChevronRight, Copy, ImagePlus, Lock, Play, Plus, Redo2, Sparkles, Square, Trash2, Undo2, Unlock, X } from "lucide-react";
import type { Project, Scene } from "./App";
import { EditorDialog } from "./EditorDialog";
import { AssessmentDraftPreview } from "./AssessmentDraftPreview";
import { assessmentRegion, ElementContent, initialLayout, newElement, resolvedSceneBackground, ScaledStage, SceneSurface, visibleSceneElements } from "./SceneSurface";
import { alignExitTiming, AnimationControls, defaultAnimations } from "./AnimationControls";
import { fitLayoutText, textFitMessage } from "./text-fit";
import { AssessmentStageContent } from "./AssessmentStageContent";
import type { SceneElement, SceneLayout } from "./SceneSurface";
import { BackgroundImagePicker } from "./BackgroundImagePicker";
import { backgroundMode } from "./background";

function InspectorSection({ title, children }: { title: string; children: ReactNode }) {
  return <details className="visual-inspector-section">
    <summary><ChevronRight size={16} aria-hidden="true" /><span>{title}</span></summary>
    <div className="visual-inspector-section-body">{children}</div>
  </details>;
}

export type SceneEditSettings = {
  title: string;
  sceneType: Scene["sceneType"];
  layoutMode: Scene["layoutMode"];
  templateId: string;
  extractedText: string[];
  actionDescription: string;
  narration: string;
  notes: string;
  required: boolean;
  audioRequired: boolean;
  assessmentItem: Scene["assessmentItem"];
  assessmentSettings: Scene["assessmentSettings"];
  canvasEdited: boolean;
};

export type GeneratedSceneDraft = {
  title: string;
  sceneType: Scene["sceneType"];
  extractedText: string[];
  actionDescription: string;
  narration: string;
  notes: string;
  required: boolean;
  assessmentItem?: Scene["assessmentItem"];
  assessmentSettings?: Scene["assessmentSettings"];
  visualLayout: SceneLayout;
};
function syncSceneText(layout: SceneLayout, scene: Scene, title: string, screenText: string, generatedLayout = false): SceneLayout {
  const next = structuredClone(layout);
  const previousText = new Set([scene.title, ...scene.extractedText]);
  const editable = next.elements.filter(element => element.kind === "text" && (element.source === "slide" || generatedLayout || element.source === "manual" && previousText.has(element.text)));
  const content = [title, ...screenText.split(/\r?\n/).map(text => text.trim()).filter(Boolean)];
  content.forEach((text, index) => {
    const element = editable[index];
    if (element) {
      element.text = text;
    } else {
      next.elements.push(newElement("text", { text, source: "manual", x: 64, y: 64 + index * 100, width: next.width - 128, height: 84, fontSize: index === 0 ? 40 : 28 }));
    }
  });
  const staleIds = new Set(editable.slice(content.length).map(element => element.id));
  next.elements = next.elements.filter(element => !staleIds.has(element.id));
  return next;
}

export function SceneVisualEditor({ project, scene, templates, onClose, onSave, onExtract, onApplyTemplate, onGenerate, canGenerate, initialPanel = "canvas" }: { project: Project; scene: Scene; templates: { id: string; title: string }[]; onClose: () => void; onSave: (layout: SceneLayout, settings: SceneEditSettings) => Promise<void>; onExtract: () => Promise<SceneLayout>; onApplyTemplate: (templateId: string, title: string, extractedText: string[]) => Promise<SceneLayout>; onGenerate: (prompt: string, currentScene: Partial<Scene>) => Promise<GeneratedSceneDraft>; canGenerate: boolean; initialPanel?: "canvas" | "details" }) {
  const [history, setHistory] = useState<SceneLayout[]>(() => [initialLayout(scene)]);
  const [cursor, setCursor] = useState(0);
  const [selection, setSelection] = useState<string | null>(null);
  const [sourceVisible, setSourceVisible] = useState(Boolean((scene.sourceSlide || scene.previewImage) && !scene.visualLayout));
  const [motionPreview, setMotionPreview] = useState(0);
  const [editingText, setEditingText] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [panel, setPanel] = useState<"details" | "canvas">(initialPanel);
  const [canvasEdited, setCanvasEdited] = useState(false);
  const [sceneTextDirty, setSceneTextDirty] = useState(false);
  const [generatedLayoutApplied, setGeneratedLayoutApplied] = useState(false);
  const [title, setTitle] = useState(scene.title);
  const [sceneType, setSceneType] = useState<Scene["sceneType"]>(scene.sceneType);
  const [layoutMode, setLayoutMode] = useState<Scene["layoutMode"]>(scene.layoutMode);
  const [templateId, setTemplateId] = useState(scene.templateId || "");
  const [pendingTemplateId, setPendingTemplateId] = useState(scene.templateId || "");
  const templateHistory = useRef([scene.templateId || ""]);
  const [screenText, setScreenText] = useState(scene.extractedText.join("\n"));
  const [actionDescription, setActionDescription] = useState(scene.actionDescription);
  const [narration, setNarration] = useState(scene.narration);
  const [notes, setNotes] = useState(scene.notes);
  const [required, setRequired] = useState(scene.required);
  const [audioRequired, setAudioRequired] = useState(scene.audioRequired);
  const [assessmentItem, setAssessmentItem] = useState(scene.assessmentItem);
  const [assessmentSettings, setAssessmentSettings] = useState(scene.assessmentSettings);
  const [scenePrompt, setScenePrompt] = useState("");
  const [generatingDraft, setGeneratingDraft] = useState(false);
  const [draftError, setDraftError] = useState("");
  const textInput = useRef<HTMLTextAreaElement>(null);
  const layout = history[cursor];
  const stageLayout = resolvedSceneBackground(project, { ...scene, visualLayout: layout }).visualLayout || layout;
  const questionRegion = assessmentRegion(layout, title);
  const selected = layout.elements.find(element => element.id === selection);
  const images = project.storyboard.assets.filter(asset => asset.kind === "image");
  const [imageId, setImageId] = useState("");
  function commit(next: SceneLayout, appliedTemplate = templateId, previousLayout?: SceneLayout) {
    setMotionPreview(0);
    if (next.assessmentRegion) {
      const region = next.assessmentRegion;
      const width = Math.min(region.width, next.width);
      const height = Math.min(region.height, next.height);
      next = { ...next, assessmentRegion: { width, height, x: Math.max(0, Math.min(region.x, next.width - width)), y: Math.max(0, Math.min(region.y, next.height - height)) } };
    }
    setCanvasEdited(true);
    const previousHistory = history.slice(0, cursor + 1);
    if (previousLayout) previousHistory[cursor] = previousLayout;
    const nextHistory = [...previousHistory, next].slice(-100);
    templateHistory.current = [...templateHistory.current.slice(0, cursor + 1), appliedTemplate].slice(-100);
    setHistory(nextHistory); setCursor(nextHistory.length - 1);
  }
  function update(changes: Partial<SceneElement>) {
    if (!selected) return;
    commit({ ...layout, elements: layout.elements.map(element => element.id === selected.id ? { ...element, ...changes } : element) });
  }
  function addImage(assetId: string, x = 40, y = 40) {
    if (!images.some(asset => asset.id === assetId)) return;
    const element = newElement("image", { assetId, x, y });
    commit({ ...layout, elements: [...layout.elements, element] }); setSelection(element.id);
  }
  function setBackground(assetId: string | null | undefined) {
    const masterBackground = images.some(asset => asset.id === assetId && asset.role === "background");
    const elements = masterBackground ? layout.elements.filter(element => element.source !== "master") : layout.elements;
    commit({ ...layout, backgroundAsset: assetId ?? null, backgroundMode: assetId === undefined ? "inherit" : assetId === null ? "none" : "image", elements });
    if (selection && !elements.some(element => element.id === selection)) setSelection(null);
  }
  function reorder(direction: number) {
    if (!selected) return;
    const index = layout.elements.indexOf(selected), target = index + direction;
    if (target < 0 || target >= layout.elements.length) return;
    const elements = [...layout.elements]; [elements[index], elements[target]] = [elements[target], elements[index]];
    commit({ ...layout, elements });
  }
  function alignToStage(axis: "x" | "y", edge: "start" | "center" | "end") {
    if (!selected || selected.locked || busy || sourceVisible) return;
    const remaining = axis === "x" ? layout.width - selected.width : layout.height - selected.height;
    update({ [axis]: edge === "start" ? 0 : edge === "center" ? remaining / 2 : remaining });
  }
  async function extract() {
    setBusy(true); setError("");
    try { const next = await onExtract(); setHistory([next]); setCursor(0); setSelection(null); setSourceVisible(false); }
    catch (issue) { setError(issue instanceof Error ? issue.message : "Source extraction failed."); }
    finally { setBusy(false); }
  }
  async function save() {
    setBusy(true); setError("");
    try {
      const savedMode = layoutMode === "template" ? "template" : scene.sourceSlide ? "hybrid" : "native";
      const updatedLayout = sceneTextDirty ? syncSceneText(layout, scene, title.trim(), screenText, generatedLayoutApplied) : structuredClone(layout);
      updatedLayout.enabled = true;
      if (updatedLayout.enabled) {
        const checked = await fitLayoutText(updatedLayout);
        if (checked.issues.length) throw new Error(textFitMessage(checked.issues));
      }
      await onSave(updatedLayout, {
        title: title.trim(), sceneType, layoutMode: savedMode, templateId,
        extractedText: screenText.split(/\r?\n/).map(text => text.trim()).filter(Boolean),
        actionDescription: actionDescription.trim(), narration, notes, required, audioRequired,
        assessmentItem: sceneType === "question" ? assessmentItem : null,
        assessmentSettings: sceneType === "question" ? assessmentSettings : null,
        canvasEdited: canvasEdited || JSON.stringify(layout) !== JSON.stringify(initialLayout(scene)),
      });
      onClose();
    }
    catch (issue) { setError(issue instanceof Error ? issue.message : "Scene could not be saved."); }
    finally { setBusy(false); }
  }
  async function generateSceneDraft() {
    if (!scenePrompt.trim() || generatingDraft || busy) return;
    setGeneratingDraft(true);
    setDraftError("");
    try {
      const draft = await onGenerate(scenePrompt.trim(), {
        title: title.trim(), sceneType, layoutMode, templateId: templateId || null,
        extractedText: screenText.split(/\r?\n/).map(text => text.trim()).filter(Boolean),
        actionDescription, narration, notes, required, audioRequired,
        assessmentItem, assessmentSettings,
        visualLayout: sceneTextDirty ? syncSceneText(layout, scene, title.trim(), screenText, generatedLayoutApplied) : layout,
      });
      const fitted = await fitLayoutText(draft.visualLayout, true);
      applyGeneratedDraft({ ...draft, visualLayout: fitted.layout });
      if (fitted.issues.length) setError(textFitMessage(fitted.issues));
    }
    catch (issue) { setDraftError(issue instanceof Error ? issue.message : "Scene draft could not be generated."); }
    finally { setGeneratingDraft(false); }
  }
  function applyGeneratedDraft(draft: GeneratedSceneDraft) {
    const generatedLayout = structuredClone(draft.visualLayout);
    generatedLayout.enabled = true;
    setHistory([generatedLayout]);
    templateHistory.current = [""];
    setCursor(0);
    setSelection(null);
    setCanvasEdited(true);
    setGeneratedLayoutApplied(true);
    setTitle(draft.title);
    setSceneType(draft.sceneType);
    setScreenText(draft.extractedText.join("\n"));
    setActionDescription(draft.actionDescription);
    setNarration(draft.narration);
    setNotes(draft.notes);
    setRequired(draft.required);
    setAssessmentItem(draft.assessmentItem === undefined ? assessmentItem : draft.assessmentItem);
    setAssessmentSettings(draft.assessmentSettings === undefined ? assessmentSettings : draft.assessmentSettings);
    setSceneTextDirty(true);
    setLayoutMode("native");
    setTemplateId("");
    setPendingTemplateId("");
    setSourceVisible(false);
    setPanel("canvas");
  }
  return <EditorDialog className="visual-editor" labelledBy="visual-editor-title" busy={busy} onClose={onClose} onboardingTarget="scene.edit" onboardingJourney={panel === "canvas" ? "canvas" : "edit-scene"}>
    <header className="visual-editor-header"><div><p className="eyebrow">SCENE EDITOR</p><h2 id="visual-editor-title">{title || scene.title}</h2></div><button type="button" className="icon-button" aria-label="Close scene editor" disabled={busy} onClick={onClose}><X size={18} /></button></header>
    <div className="visual-editor-tabs" role="tablist" aria-label="Scene editor sections">
      <button type="button" role="tab" aria-selected={panel === "canvas"} onClick={() => setPanel("canvas")}>Stage</button>
      <button type="button" role="tab" aria-selected={panel === "details"} onClick={() => setPanel("details")}>Details</button>
    </div>
    {panel === "canvas" && <div className="visual-editor-toolbar" role="toolbar" aria-label="Stage content tools">
      <button type="button" className="button button-outline" disabled={busy || sourceVisible} onClick={async () => {
        setBusy(true); setError("");
        try {
          const current = sceneTextDirty ? syncSceneText(layout, scene, title.trim(), screenText, generatedLayoutApplied) : layout;
          const fitted = await fitLayoutText(current, true);
          commit(fitted.layout);
          if (fitted.issues.length) setError(textFitMessage(fitted.issues));
        } catch (issue) { setError(issue instanceof Error ? issue.message : "Text could not be measured."); }
        finally { setBusy(false); }
      }}><Check size={16} />Fit text</button>
      <button type="button" className="icon-button" title="Preview animations" aria-label="Preview animations" disabled={busy || sourceVisible} onClick={() => setMotionPreview(current => current + 1)}><Play size={18} /></button>
      {motionPreview > 0 && <button type="button" className="icon-button" title="Stop animation preview" aria-label="Stop animation preview" onClick={() => setMotionPreview(0)}><Square size={18} /></button>}
      <button type="button" className="icon-button" title="Stagger text entrances" aria-label="Stagger text entrances" disabled={busy || sourceVisible} onClick={() => {
        let textIndex = 0;
        const currentLayout = sceneTextDirty ? syncSceneText(layout, scene, title.trim(), screenText, generatedLayoutApplied) : layout;
        commit({ ...currentLayout, elements: currentLayout.elements.map(element => {
          if (element.kind !== "text" || element.locked) return element;
          const animations = alignExitTiming({ ...(element.animations || defaultAnimations()), entrance: { effect: "bounce", durationMs: 600, delayMs: Math.min(59000, textIndex++ * 150) } });
          return animations.exit.delayMs > 60000 ? element : { ...element, animations };
        }) });
      }}><Sparkles size={18} /></button>
      <button type="button" className="icon-button" title="Add text" aria-label="Add text" disabled={busy || sourceVisible} onClick={() => { const element = newElement("text"); commit({ ...layout, elements: [...layout.elements, element] }); setSelection(element.id); }}><Plus size={18} /></button>
      <button type="button" className="icon-button" title="Undo" aria-label="Undo" disabled={busy || cursor === 0} onClick={() => { setCursor(cursor - 1); const id = templateHistory.current[cursor - 1] || ""; setTemplateId(id); setPendingTemplateId(id); setLayoutMode(id ? "template" : scene.sourceSlide ? "hybrid" : "native"); }}><Undo2 size={18} /></button>
      <button type="button" className="icon-button" title="Redo" aria-label="Redo" disabled={busy || cursor === history.length - 1} onClick={() => { setCursor(cursor + 1); const id = templateHistory.current[cursor + 1] || ""; setTemplateId(id); setPendingTemplateId(id); setLayoutMode(id ? "template" : scene.sourceSlide ? "hybrid" : "native"); }}><Redo2 size={18} /></button>
      <span className="visual-editor-dimensions">{Math.round(layout.width)} x {Math.round(layout.height)}</span>
      {scene.previewImage && scene.visualLayout && <button type="button" className="button button-outline" disabled={busy} aria-pressed={sourceVisible} onClick={() => { setMotionPreview(0); setSourceVisible(!sourceVisible); }}>{sourceVisible ? "Return to scene" : "Compare with original"}</button>}
      {!scene.visualLayout && scene.sourceSlide && project.hasSourceDeck && <button type="button" className="button button-outline" disabled={busy} onClick={() => void extract()}>Prepare editable scene</button>}
    </div>}
    {panel === "canvas" && sourceVisible && <p className="field-hint" role="status">Original slide reference. Comparing does not change your scene, preview, or exports.</p>}
    {generatedLayoutApplied && panel === "canvas" && <p className="scene-draft-unsaved" role="status">Generated scene layout · not saved</p>}
    {error && <p className="visual-editor-error" role="alert">{error}</p>}
    {panel === "canvas" && layout.warnings.length > 0 && <details className="visual-editor-warnings"><summary>{layout.warnings.length} import limitations</summary><ul>{layout.warnings.map(warning => <li key={warning}>{warning}</li>)}</ul></details>}
    {panel === "details" ? <div className="visual-scene-details">
      {sceneType === "question" && assessmentItem && <AssessmentDraftPreview item={assessmentItem} settings={assessmentSettings} />}
      {canGenerate && <section className="scene-ai-draft" aria-label="Draft this scene with AI">
        <label>Scene prompt<textarea aria-label="Scene prompt" rows={2} maxLength={3000} value={scenePrompt} onChange={event => setScenePrompt(event.target.value)} placeholder="Describe how this scene should change" /></label>
        <button type="button" className="button button-outline" disabled={!scenePrompt.trim() || generatingDraft || busy} onClick={() => void generateSceneDraft()}><Sparkles size={14} />{generatingDraft ? "Generating draft…" : "Generate scene + layout draft"}</button>
        {draftError && <p className="visual-editor-error" role="alert">{draftError}</p>}
      </section>}
      <div className="visual-scene-details-grid">
        <label>Scene title<input value={title} maxLength={120} onChange={event => { setTitle(event.target.value); setSceneTextDirty(true); }} /></label>
        <label>Scene type<select value={sceneType} onChange={event => setSceneType(event.target.value as Scene["sceneType"])}>{[["content", "Content"], ["title", "Title"], ["question", "Question"], ["media", "Media"], ["interaction", "Interaction"], ["summary", "Summary"]].map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <div className="visual-scene-details-wide"><label>Template<select value={pendingTemplateId} onChange={event => setPendingTemplateId(event.target.value)}><option value="">Choose a template</option>{templates.map(template => <option value={template.id} key={template.id}>{template.title}</option>)}</select></label><button type="button" className="button button-outline" disabled={busy || !pendingTemplateId} onClick={async () => {
          setBusy(true); setError("");
          try {
            const next = await onApplyTemplate(pendingTemplateId, title.trim(), screenText.split(/\r?\n/).map(text => text.trim()).filter(Boolean));
            const previous = sceneTextDirty ? syncSceneText(layout, scene, title.trim(), screenText, generatedLayoutApplied) : layout;
            commit(next, pendingTemplateId, previous); setTemplateId(pendingTemplateId); setLayoutMode("template");
            setSceneTextDirty(false); setSourceVisible(false); setPanel("canvas");
          } catch (issue) { setError(issue instanceof Error ? issue.message : "Template could not be applied."); }
          finally { setBusy(false); }
        }}>Apply template</button><span className="field-hint">{templates.length ? "Review the result on Stage. Undo restores the previous composition; Save scene keeps the change." : "Upload a PPTX template in Templates to use it here."}</span></div>
        <label className="visual-scene-details-wide">On-screen text<textarea rows={5} maxLength={50000} value={screenText} onChange={event => { setScreenText(event.target.value); setSceneTextDirty(true); }} /></label>
        <label className="visual-scene-details-wide">Action description<textarea rows={3} maxLength={5000} value={actionDescription} onChange={event => setActionDescription(event.target.value)} placeholder="Describe movement, interaction, or timed actions shown in this scene" /></label>
        <label className="visual-scene-details-wide">Narration<textarea rows={3} maxLength={10000} value={narration} onChange={event => setNarration(event.target.value)} /></label>
        <label className="visual-scene-details-wide">Speaker notes<textarea rows={4} value={notes} onChange={event => setNotes(event.target.value)} /></label>
        <label className="visual-scene-checkbox"><input type="checkbox" checked={required} onChange={event => setRequired(event.target.checked)} /><span>Required scene</span></label>
        {scene.audioAssets.length > 0 && <label className="visual-scene-checkbox"><input type="checkbox" checked={audioRequired} onChange={event => setAudioRequired(event.target.checked)} /><span>Require attached audio to finish</span></label>}
      </div>
    </div> : <div className="visual-editor-workspace">
      <div className="visual-editor-canvas" onDragOver={event => { if (event.dataTransfer.types.includes("application/x-chimera-image")) event.preventDefault(); }} onDrop={event => { event.preventDefault(); if (sourceVisible || busy) return; const frame = event.currentTarget.querySelector(".visual-stage-frame")?.getBoundingClientRect(); if (frame) addImage(event.dataTransfer.getData("application/x-chimera-image"), (event.clientX - frame.left) * layout.width / frame.width, (event.clientY - frame.top) * layout.height / frame.height); }}>
        {motionPreview > 0 ? <SceneSurface key={motionPreview} project={project} scene={{ ...scene, title, sceneType, assessmentItem, visualLayout: { ...(sceneTextDirty ? syncSceneText(layout, scene, title.trim(), screenText, generatedLayoutApplied) : layout), enabled: true } }} animate /> : sourceVisible ? scene.previewImage ? <img className="visual-source" src={`/api/projects/${project.id}/${scene.previewImage}`} alt={`Source slide ${scene.sourceSlide}`} /> : <p role="status">The original slide image is unavailable. Restore the retained source to prepare this scene.</p> : <ScaledStage layout={stageLayout} projectId={project.id}>{scale => <>{visibleSceneElements(stageLayout, title, Boolean(sceneType === "question" && assessmentItem)).map((element, index) => <Rnd key={element.id} scale={scale} position={{ x: element.x, y: element.y }} size={{ width: element.width, height: element.height }} lockAspectRatio={element.kind === "text"} resizeHandleClasses={{ bottomRight: "visual-resize-handle-se" }} disableDragging={busy || element.locked || editingText === element.id} enableResizing={!busy && !element.locked && editingText !== element.id} minWidth={20} minHeight={20} style={{ zIndex: index }} onDragStart={() => setSelection(element.id)} onDragStop={(_, data) => commit({ ...layout, elements: layout.elements.map(item => item.id === element.id ? { ...item, x: data.x, y: data.y } : item) })} onResizeStart={() => setSelection(element.id)} onResizeStop={(_, __, reference, ___, position) => commit({ ...layout, elements: layout.elements.map(item => item.id === element.id ? { ...item, ...position, width: parseFloat(reference.style.width), height: parseFloat(reference.style.height) } : item) })}>
          <div role={editingText === element.id ? undefined : "button"} tabIndex={editingText === element.id ? undefined : 0} aria-label={`${element.kind === "text" ? element.text.slice(0, 50) || "Empty text" : "Image"} element`} aria-pressed={editingText === element.id ? undefined : selection === element.id} className={`visual-element visual-editable ${selection === element.id ? "is-selected" : ""}`} style={{ transform: `rotate(${element.rotation}deg)` }} onClick={() => setSelection(element.id)} onDoubleClick={() => { setSelection(element.id); if (element.kind === "text" && !element.locked && !busy) setEditingText(element.id); }} onKeyDown={event => { if (event.target instanceof HTMLTextAreaElement) return; setSelection(element.id); if (element.locked || busy) return; if (event.key === "Enter" && element.kind === "text") { event.preventDefault(); setEditingText(element.id); return; } const step = event.shiftKey ? 10 : 1; const moves: Record<string, {x:number;y:number}> = {ArrowLeft:{x:-step,y:0},ArrowRight:{x:step,y:0},ArrowUp:{x:0,y:-step},ArrowDown:{x:0,y:step}}; if (moves[event.key]) { event.preventDefault(); commit({ ...layout, elements: layout.elements.map(item => item.id === element.id ? { ...item, x:item.x+moves[event.key].x, y:item.y+moves[event.key].y } : item) }); } }}>{editingText === element.id ? <textarea autoFocus aria-label="Edit canvas text" className="visual-inline-text" value={element.text} maxLength={50000} style={{fontSize:element.fontSize,fontFamily:element.fontFamily,color:"#202020",backgroundColor:"#fff"}} onChange={event => commit({...layout,elements:layout.elements.map(item => item.id === element.id ? {...item,text:event.target.value} : item)})} onBlur={() => setEditingText(null)} onKeyDown={event => { if(event.key === "Escape") { event.stopPropagation(); setEditingText(null); } }} /> : <ElementContent element={element} project={project} scene={scene} />}</div>
        </Rnd>)}{sceneType === "question" && assessmentItem && <Rnd scale={scale} bounds="parent" position={{ x: questionRegion.x, y: questionRegion.y }} size={{ width: questionRegion.width, height: questionRegion.height }} minWidth={120} minHeight={80} disableDragging={busy} enableResizing={!busy} style={{ zIndex: 2001 }} onDragStop={(_, data) => commit({ ...layout, assessmentRegion: { ...questionRegion, x: data.x, y: data.y } })} onResizeStop={(_, __, reference, ___, position) => commit({ ...layout, assessmentRegion: { ...position, width: parseFloat(reference.style.width), height: parseFloat(reference.style.height) } })}>
          <div className="assessment-stage-region" aria-label="Assessment component" style={{ inset: 0, width: "100%", height: "100%" }}><AssessmentStageContent item={assessmentItem} /></div>
        </Rnd>}</>}</ScaledStage>}
        <section className="visual-attached-images" aria-label="Stage image content"><h3>Content</h3><div>{images.filter(asset => scene.imageAssets.includes(asset.id)).map(asset => <button type="button" key={asset.id} title={asset.filename} aria-label={`Add ${asset.filename}`} draggable={!busy} disabled={busy || sourceVisible} onDragStart={event => event.dataTransfer.setData("application/x-chimera-image", asset.id)} onClick={() => addImage(asset.id)}><img src={`/api/projects/${project.id}/assets/${asset.id}`} alt={asset.filename} /></button>)}</div><div className="visual-library-picker"><select aria-label="Image from media library" value={imageId} onChange={event => setImageId(event.target.value)}><option value="">Media library</option>{images.map(asset => <option key={asset.id} value={asset.id}>{asset.filename}</option>)}</select><button type="button" className="icon-button" title="Add selected image" aria-label="Add selected image" disabled={!imageId || busy || sourceVisible} onClick={() => addImage(imageId)}><ImagePlus size={18} /></button></div></section>
      </div>
      <aside className="visual-inspector" aria-label="Element properties">
        {selected && <InspectorSection title="Animation"><AnimationControls animations={selected.animations} onChange={animations => update({ animations })} disabled={busy || selected.locked || sourceVisible} /></InspectorSection>}
        {sceneType === "question" && assessmentItem && <InspectorSection title="Question"><fieldset disabled={busy || sourceVisible}><div className="visual-numbers">{(["x", "y", "width", "height"] as const).map(field => <label key={field}>{field}<input type="number" aria-label={`Question ${field}`} min={field === "width" || field === "height" ? 1 : 0} value={Math.round(questionRegion[field])} onChange={event => {
          const value = event.target.valueAsNumber;
          const next = { ...questionRegion, [field]: value };
          if (Number.isFinite(value) && next.x >= 0 && next.y >= 0 && next.width > 0 && next.height > 0 && next.x + next.width <= layout.width && next.y + next.height <= layout.height) commit({ ...layout, assessmentRegion: next });
        }} /></label>)}</div></fieldset></InspectorSection>}
        <InspectorSection title="Stage"><fieldset disabled={busy || sourceVisible}>
          <label>Stage size<select aria-label="Stage size" value={layout.width === 1280 && layout.height === 720 ? "wide" : layout.width === 960 && layout.height === 720 ? "standard" : layout.width === 720 && layout.height === 720 ? "square" : "custom"} onChange={event => { const sizes: Record<string, [number, number]> = { wide: [1280, 720], standard: [960, 720], square: [720, 720] }; const size = sizes[event.target.value]; if (size) commit({ ...layout, width: size[0], height: size[1] }); }}><option value="wide">Widescreen (16:9)</option><option value="standard">Standard (4:3)</option><option value="square">Square (1:1)</option><option value="custom" disabled>Custom</option></select></label>
          <div className="visual-numbers">{(["width", "height"] as const).map(field => <label key={field}>Stage {field}<input type="number" required aria-label={`Stage ${field}`} min={1} max={10000} value={layout[field]} onChange={event => { const value = event.target.valueAsNumber; if (Number.isFinite(value) && value >= 1 && value <= 10000) commit({ ...layout, [field]: value }); }} /></label>)}</div>
        </fieldset></InspectorSection>
        <InspectorSection title="Background"><fieldset disabled={busy || sourceVisible}>
          <label>Background color<input type="color" value={layout.backgroundColor} onChange={event => commit({ ...layout, backgroundColor:event.target.value })} /></label>
          <BackgroundImagePicker project={project} label="Background image" allowInherit fallbackAsset={layout.sourceBackgroundAsset} value={backgroundMode(layout) === "inherit" ? undefined : backgroundMode(layout) === "none" ? null : layout.backgroundAsset} onChange={setBackground} disabled={busy || sourceVisible} />
          <p className="field-hint">Use the project default, choose a scene image, or select None. Set the project default in Storyboard &gt; Project background.</p>
        </fieldset></InspectorSection>
        <InspectorSection title="Layers">
        <div className="visual-layers" aria-label="Layers, front to back">{[...layout.elements].reverse().map((element, index) => <button type="button" key={element.id} aria-pressed={selection === element.id} disabled={busy || sourceVisible} onClick={() => setSelection(element.id)}><small title="Z-axis position">{layout.elements.length - index}</small>{element.locked && <Lock size={12} />}<span>{element.kind === "text" ? element.text.slice(0, 40) || "Empty text" : element.kind === "shape" ? element.shapeName || "PowerPoint shape" : images.find(asset => asset.id === element.assetId)?.filename || "Image"}</span><small>{index === 0 ? "Front" : index === layout.elements.length - 1 ? "Back" : element.source}</small></button>)}</div>
        {selected && <><div className="visual-layer-tools"><button type="button" className="icon-button" title={selected.locked ? "Unlock" : "Lock"} aria-label={selected.locked ? "Unlock element" : "Lock element"} disabled={busy} onClick={() => update({ locked: !selected.locked })}>{selected.locked ? <Unlock size={16} /> : <Lock size={16} />}</button><button type="button" className="icon-button" title="Bring forward" aria-label="Bring forward" disabled={busy || selected.locked} onClick={() => reorder(1)}><ArrowUp size={16} /></button><button type="button" className="icon-button" title="Send backward" aria-label="Send backward" disabled={busy || selected.locked} onClick={() => reorder(-1)}><ArrowDown size={16} /></button><button type="button" className="icon-button" title="Duplicate" aria-label="Duplicate element" disabled={busy || selected.locked} onClick={() => { const element = { ...selected, id:crypto.randomUUID(), x:selected.x+20, y:selected.y+20 }; commit({ ...layout,elements:[...layout.elements,element] }); setSelection(element.id); }}><Copy size={16} /></button><button type="button" className="icon-button" title="Delete" aria-label="Delete element" disabled={busy || selected.locked} onClick={() => { commit({ ...layout,elements:layout.elements.filter(element => element.id !== selected.id) }); setSelection(null); }}><Trash2 size={16} /></button></div>
        </>}
        </InspectorSection>
        {selected && <InspectorSection title="Layout"><div className="visual-alignment-tools" role="toolbar" aria-label="Align content to stage">{([
            ["x", "start", "Align left", AlignHorizontalJustifyStart], ["x", "center", "Center horizontally", AlignHorizontalJustifyCenter], ["x", "end", "Align right", AlignHorizontalJustifyEnd],
            ["y", "start", "Align top", AlignVerticalJustifyStart], ["y", "center", "Center vertically", AlignVerticalJustifyCenter], ["y", "end", "Align bottom", AlignVerticalJustifyEnd],
          ] as const).map(([axis, edge, label, Icon]) => <button type="button" className="icon-button" key={label} title={label} aria-label={label} disabled={busy || selected.locked || sourceVisible} onClick={() => alignToStage(axis, edge)}><Icon size={16} /></button>)}</div>
          <fieldset disabled={busy || selected.locked || sourceVisible}><div className="visual-numbers">{(["x", "y", "width", "height", "rotation"] as const).map(field => <label key={field}>{field}<input type="number" aria-label={`Element ${field}`} min={field === "width" || field === "height" ? 20 : field === "rotation" ? -360 : -10000} max={field === "rotation" ? 360 : 10000} value={Math.round(selected[field] * 100) / 100} onChange={event => { const value = event.target.valueAsNumber; if (Number.isFinite(value) && (field !== "width" && field !== "height" || value > 0) && Math.abs(value) <= (field === "rotation" ? 360 : 10000)) update({ [field]:value }); }} /></label>)}</div>
          {selected.kind === "text" ? <><label>Text<textarea ref={textInput} aria-label="Element text" rows={5} maxLength={50000} value={selected.text} onChange={event => update({text:event.target.value})} /></label><label>Font size<input type="number" min={1} max={500} value={selected.fontSize} onChange={event => { const value=event.target.valueAsNumber; if(value>=1 && value<=500) update({fontSize:value}); }} /></label><label>Text color<input type="color" value={selected.color} onChange={event => update({color:event.target.value})} /></label><label>Typeface<select value={selected.fontFamily} onChange={event => update({fontFamily:event.target.value})}>{[...new Set([selected.fontFamily,"sans-serif","serif","monospace","Manrope"])].map(font => <option key={font}>{font}</option>)}</select></label><div className="visual-formatting"><button type="button" aria-label="Bold" aria-pressed={selected.bold} onClick={() => update({bold:!selected.bold})}><b>B</b></button><button type="button" aria-label="Italic" aria-pressed={selected.italic} onClick={() => update({italic:!selected.italic})}><i>I</i></button><select aria-label="Text alignment" value={selected.align} onChange={event => update({align:event.target.value as SceneElement["align"]})}><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></div></> : selected.kind === "image" ? <><label>Image<select value={selected.assetId || ""} onChange={event => update({assetId:event.target.value})}>{images.map(asset => <option key={asset.id} value={asset.id}>{asset.filename}</option>)}</select></label><button type="button" className="button button-outline" onClick={() => update({crop:[0,0,0,0]})}>Reset crop</button></> : <p className="visual-shape-note">Extracted PowerPoint shape. Move, resize, rotate, layer, lock, or delete it on the canvas.</p>}
          </fieldset></InspectorSection>}
      </aside>
    </div>}
    <footer className="modal-actions"><button type="button" className="button button-outline" disabled={busy} onClick={onClose}>Cancel</button><button type="button" className="button button-accent" disabled={busy || !title.trim() || Boolean((scene.sourceSlide || scene.previewImage) && !scene.visualLayout && !canvasEdited) || layoutMode === "template" && !templateId} onClick={() => void save()}><Check size={16} />{busy ? "Saving" : "Save scene"}</button></footer>
  </EditorDialog>;
}
