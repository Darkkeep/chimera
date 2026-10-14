import { useRef, useState } from "react";
import { Rnd } from "react-rnd";
import { AlignHorizontalJustifyCenter, AlignHorizontalJustifyEnd, AlignHorizontalJustifyStart, AlignVerticalJustifyCenter, AlignVerticalJustifyEnd, AlignVerticalJustifyStart, ArrowDown, ArrowUp, Check, Copy, ImagePlus, Lock, Plus, Redo2, Sparkles, Trash2, Undo2, Unlock, X } from "lucide-react";
import type { Project, Scene } from "./App";
import { EditorDialog } from "./EditorDialog";
import { ElementContent, initialLayout, newElement, ScaledStage } from "./SceneSurface";
import type { SceneElement, SceneLayout } from "./SceneSurface";

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

export function SceneVisualEditor({ project, scene, templates, onClose, onSave, onExtract, onGenerate, canGenerate, initialPanel = "canvas" }: { project: Project; scene: Scene; templates: { id: string; title: string }[]; onClose: () => void; onSave: (layout: SceneLayout, settings: SceneEditSettings) => Promise<void>; onExtract: () => Promise<SceneLayout>; onGenerate: (prompt: string) => Promise<GeneratedSceneDraft>; canGenerate: boolean; initialPanel?: "canvas" | "details" }) {
  const [history, setHistory] = useState<SceneLayout[]>(() => [initialLayout(scene)]);
  const [cursor, setCursor] = useState(0);
  const [selection, setSelection] = useState<string | null>(null);
  const [sourceVisible, setSourceVisible] = useState(false);
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
  const [screenText, setScreenText] = useState(scene.extractedText.join("\n"));
  const [actionDescription, setActionDescription] = useState(scene.actionDescription);
  const [narration, setNarration] = useState(scene.narration);
  const [notes, setNotes] = useState(scene.notes);
  const [required, setRequired] = useState(scene.required);
  const [audioRequired, setAudioRequired] = useState(scene.audioRequired);
  const [scenePrompt, setScenePrompt] = useState("");
  const [generatingDraft, setGeneratingDraft] = useState(false);
  const [draftError, setDraftError] = useState("");
  const textInput = useRef<HTMLTextAreaElement>(null);
  const layout = history[cursor];
  const selected = layout.elements.find(element => element.id === selection);
  const images = project.storyboard.assets.filter(asset => asset.kind === "image");
  const [imageId, setImageId] = useState("");
  function commit(next: SceneLayout) {
    setCanvasEdited(true);
    const nextHistory = [...history.slice(0, cursor + 1), next].slice(-100);
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
  function setBackground(assetId: string) {
    const masterBackground = images.some(asset => asset.id === assetId && asset.role === "background");
    const elements = masterBackground ? layout.elements.filter(element => element.source !== "master") : layout.elements;
    commit({ ...layout, backgroundAsset: assetId || null, elements });
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
    try { const next = await onExtract(); setHistory([next]); setCursor(0); setSelection(null); }
    catch (issue) { setError(issue instanceof Error ? issue.message : "Source extraction failed."); }
    finally { setBusy(false); }
  }
  async function save() {
    setBusy(true); setError("");
    try {
      const savedMode = layoutMode === "fidelity" && canvasEdited ? "hybrid" : layoutMode;
      const updatedLayout = sceneTextDirty ? syncSceneText(layout, scene, title.trim(), screenText, generatedLayoutApplied) : structuredClone(layout);
      updatedLayout.enabled = savedMode !== "fidelity";
      await onSave(updatedLayout, {
        title: title.trim(), sceneType, layoutMode: savedMode, templateId,
        extractedText: screenText.split(/\r?\n/).map(text => text.trim()).filter(Boolean),
        actionDescription: actionDescription.trim(), narration, notes, required, audioRequired,
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
    try { applyGeneratedDraft(await onGenerate(scenePrompt.trim())); }
    catch (issue) { setDraftError(issue instanceof Error ? issue.message : "Scene draft could not be generated."); }
    finally { setGeneratingDraft(false); }
  }
  function applyGeneratedDraft(draft: GeneratedSceneDraft) {
    const generatedLayout = structuredClone(draft.visualLayout);
    generatedLayout.enabled = true;
    setHistory([generatedLayout]);
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
    setSceneTextDirty(true);
    setLayoutMode("native");
    setTemplateId("");
    setPanel("canvas");
  }
  return <EditorDialog className="visual-editor" labelledBy="visual-editor-title" busy={busy} onClose={onClose}>
    <header className="visual-editor-header"><div><p className="eyebrow">SCENE EDITOR</p><h2 id="visual-editor-title">{title || scene.title}</h2></div><button type="button" className="icon-button" aria-label="Close scene editor" disabled={busy} onClick={onClose}><X size={18} /></button></header>
    <div className="visual-editor-tabs" role="tablist" aria-label="Scene editor sections">
      <button type="button" role="tab" aria-selected={panel === "canvas"} onClick={() => setPanel("canvas")}>Stage</button>
      <button type="button" role="tab" aria-selected={panel === "details"} onClick={() => setPanel("details")}>Details</button>
    </div>
    {panel === "canvas" && <div className="visual-editor-toolbar" role="toolbar" aria-label="Stage content tools">
      <button type="button" className="icon-button" title="Add text" aria-label="Add text" disabled={busy || sourceVisible} onClick={() => { const element = newElement("text"); commit({ ...layout, elements: [...layout.elements, element] }); setSelection(element.id); }}><Plus size={18} /></button>
      <button type="button" className="icon-button" title="Undo" aria-label="Undo" disabled={busy || cursor === 0} onClick={() => setCursor(cursor - 1)}><Undo2 size={18} /></button>
      <button type="button" className="icon-button" title="Redo" aria-label="Redo" disabled={busy || cursor === history.length - 1} onClick={() => setCursor(cursor + 1)}><Redo2 size={18} /></button>
      <span className="visual-editor-dimensions">{Math.round(layout.width)} x {Math.round(layout.height)}</span>
      {scene.previewImage && <button type="button" className="button button-outline" aria-pressed={sourceVisible} onClick={() => setSourceVisible(!sourceVisible)}>Source slide</button>}
      {!scene.visualLayout && scene.sourceSlide && project.hasSourceDeck && <button type="button" className="button button-outline" disabled={busy} onClick={() => void extract()}>Extract source layout</button>}
    </div>}
    {generatedLayoutApplied && panel === "canvas" && <p className="scene-draft-unsaved" role="status">Generated scene layout · not saved</p>}
    {error && <p className="visual-editor-error" role="alert">{error}</p>}
    {panel === "canvas" && layout.warnings.length > 0 && <details className="visual-editor-warnings"><summary>{layout.warnings.length} import limitations</summary><ul>{layout.warnings.map(warning => <li key={warning}>{warning}</li>)}</ul></details>}
    {panel === "details" ? <div className="visual-scene-details">
      {canGenerate && <section className="scene-ai-draft" aria-label="Draft this scene with AI">
        <label>Scene prompt<textarea aria-label="Scene prompt" rows={2} maxLength={3000} value={scenePrompt} onChange={event => setScenePrompt(event.target.value)} placeholder="Describe how this scene should change" /></label>
        <button type="button" className="button button-outline" disabled={!scenePrompt.trim() || generatingDraft || busy} onClick={() => void generateSceneDraft()}><Sparkles size={14} />{generatingDraft ? "Generating draft…" : "Generate scene + layout draft"}</button>
        {draftError && <p className="visual-editor-error" role="alert">{draftError}</p>}
      </section>}
      <div className="visual-scene-details-grid">
        <label data-onboarding="scene.edit">Scene title<input value={title} maxLength={120} onChange={event => { setTitle(event.target.value); setSceneTextDirty(true); }} /></label>
        <label>Scene type<select value={sceneType} onChange={event => setSceneType(event.target.value as Scene["sceneType"])}>{[["content", "Content"], ["title", "Title"], ["assessment", "Assessment"], ["media", "Media"], ["interaction", "Interaction"], ["summary", "Summary"]].map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label>Rendering mode<select aria-label="Rendering mode" value={layoutMode} onChange={event => { const value = event.target.value as Scene["layoutMode"]; setLayoutMode(value); if (value !== "template") setTemplateId(""); }}>{[["fidelity", "Fidelity"], ["hybrid", "Hybrid"], ["native", "Native"], ["template", "Template"]].map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        {layoutMode === "template" && <label>Template<select value={templateId} onChange={event => setTemplateId(event.target.value)}><option value="">Choose a template</option>{templates.map(template => <option value={template.id} key={template.id}>{template.title}</option>)}</select>{templates.length === 0 && <span className="field-hint">Upload a PPTX template in Templates before assigning one.</span>}</label>}
        <label className="visual-scene-details-wide">On-screen text<textarea rows={5} maxLength={50000} value={screenText} onChange={event => { setScreenText(event.target.value); setSceneTextDirty(true); }} /></label>
        <label className="visual-scene-details-wide">Action description<textarea rows={3} maxLength={5000} value={actionDescription} onChange={event => setActionDescription(event.target.value)} placeholder="Describe movement, interaction, or timed actions shown in this scene" /></label>
        <label className="visual-scene-details-wide">Narration<textarea rows={3} maxLength={10000} value={narration} onChange={event => setNarration(event.target.value)} /></label>
        <label className="visual-scene-details-wide">Speaker notes<textarea rows={4} value={notes} onChange={event => setNotes(event.target.value)} /></label>
        <label className="visual-scene-checkbox"><input type="checkbox" checked={required} onChange={event => setRequired(event.target.checked)} /><span>Required scene</span></label>
        {scene.audioAssets.length > 0 && <label className="visual-scene-checkbox"><input type="checkbox" checked={audioRequired} onChange={event => setAudioRequired(event.target.checked)} /><span>Require attached audio to finish</span></label>}
      </div>
    </div> : <div className="visual-editor-workspace">
      <div className="visual-editor-canvas" onDragOver={event => { if (event.dataTransfer.types.includes("application/x-chimera-image")) event.preventDefault(); }} onDrop={event => { event.preventDefault(); if (sourceVisible || busy) return; const frame = event.currentTarget.querySelector(".visual-stage-frame")?.getBoundingClientRect(); if (frame) addImage(event.dataTransfer.getData("application/x-chimera-image"), (event.clientX - frame.left) * layout.width / frame.width, (event.clientY - frame.top) * layout.height / frame.height); }}>
        {sourceVisible ? <img className="visual-source" src={`/api/projects/${project.id}/${scene.previewImage}`} alt={`Source slide ${scene.sourceSlide}`} /> : <ScaledStage layout={layout} projectId={project.id}>{scale => layout.elements.map((element, index) => <Rnd key={element.id} scale={scale} position={{ x: element.x, y: element.y }} size={{ width: element.width, height: element.height }} lockAspectRatio={element.kind === "text"} resizeHandleClasses={{ bottomRight: "visual-resize-handle-se" }} disableDragging={busy || element.locked || editingText === element.id} enableResizing={!busy && !element.locked && editingText !== element.id} minWidth={20} minHeight={20} style={{ zIndex: index }} onDragStart={() => setSelection(element.id)} onDragStop={(_, data) => commit({ ...layout, elements: layout.elements.map(item => item.id === element.id ? { ...item, x: data.x, y: data.y } : item) })} onResizeStart={() => setSelection(element.id)} onResizeStop={(_, __, reference, ___, position) => commit({ ...layout, elements: layout.elements.map(item => item.id === element.id ? { ...item, ...position, width: parseFloat(reference.style.width), height: parseFloat(reference.style.height) } : item) })}>
          <div role={editingText === element.id ? undefined : "button"} tabIndex={editingText === element.id ? undefined : 0} aria-label={`${element.kind === "text" ? element.text.slice(0, 50) || "Empty text" : "Image"} element`} aria-pressed={editingText === element.id ? undefined : selection === element.id} className={`visual-element visual-editable ${selection === element.id ? "is-selected" : ""}`} style={{ transform: `rotate(${element.rotation}deg)` }} onClick={() => setSelection(element.id)} onDoubleClick={() => { setSelection(element.id); if (element.kind === "text" && !element.locked && !busy) setEditingText(element.id); }} onKeyDown={event => { if (event.target instanceof HTMLTextAreaElement) return; setSelection(element.id); if (element.locked || busy) return; if (event.key === "Enter" && element.kind === "text") { event.preventDefault(); setEditingText(element.id); return; } const step = event.shiftKey ? 10 : 1; const moves: Record<string, {x:number;y:number}> = {ArrowLeft:{x:-step,y:0},ArrowRight:{x:step,y:0},ArrowUp:{x:0,y:-step},ArrowDown:{x:0,y:step}}; if (moves[event.key]) { event.preventDefault(); commit({ ...layout, elements: layout.elements.map(item => item.id === element.id ? { ...item, x:item.x+moves[event.key].x, y:item.y+moves[event.key].y } : item) }); } }}>{editingText === element.id ? <textarea autoFocus aria-label="Edit canvas text" className="visual-inline-text" value={element.text} maxLength={50000} style={{fontSize:element.fontSize,fontFamily:element.fontFamily,color:"#202020",backgroundColor:"#fff"}} onChange={event => commit({...layout,elements:layout.elements.map(item => item.id === element.id ? {...item,text:event.target.value} : item)})} onBlur={() => setEditingText(null)} onKeyDown={event => { if(event.key === "Escape") { event.stopPropagation(); setEditingText(null); } }} /> : <ElementContent element={element} project={project} scene={scene} />}</div>
        </Rnd>)}</ScaledStage>}
        <section className="visual-attached-images" aria-label="Stage image content"><h3>Content</h3><div>{images.filter(asset => scene.imageAssets.includes(asset.id)).map(asset => <button type="button" key={asset.id} title={asset.filename} aria-label={`Add ${asset.filename}`} draggable={!busy} disabled={busy || sourceVisible} onDragStart={event => event.dataTransfer.setData("application/x-chimera-image", asset.id)} onClick={() => addImage(asset.id)}><img src={`/api/projects/${project.id}/assets/${asset.id}`} alt={asset.filename} /></button>)}</div><div className="visual-library-picker"><select aria-label="Image from media library" value={imageId} onChange={event => setImageId(event.target.value)}><option value="">Media library</option>{images.map(asset => <option key={asset.id} value={asset.id}>{asset.filename}</option>)}</select><button type="button" className="icon-button" title="Add selected image" aria-label="Add selected image" disabled={!imageId || busy || sourceVisible} onClick={() => addImage(imageId)}><ImagePlus size={18} /></button></div></section>
      </div>
      <aside className="visual-inspector" aria-label="Element properties">
        <section aria-label="Stage settings"><h3>Stage</h3><fieldset disabled={busy || sourceVisible}>
          <label>Stage size<select aria-label="Stage size" value={layout.width === 1280 && layout.height === 720 ? "wide" : layout.width === 960 && layout.height === 720 ? "standard" : layout.width === 720 && layout.height === 720 ? "square" : "custom"} onChange={event => { const sizes: Record<string, [number, number]> = { wide: [1280, 720], standard: [960, 720], square: [720, 720] }; const size = sizes[event.target.value]; if (size) commit({ ...layout, width: size[0], height: size[1] }); }}><option value="wide">Widescreen (16:9)</option><option value="standard">Standard (4:3)</option><option value="square">Square (1:1)</option><option value="custom" disabled>Custom</option></select></label>
          <div className="visual-numbers">{(["width", "height"] as const).map(field => <label key={field}>Stage {field}<input type="number" required aria-label={`Stage ${field}`} min={1} max={10000} value={layout[field]} onChange={event => { const value = event.target.valueAsNumber; if (Number.isFinite(value) && value >= 1 && value <= 10000) commit({ ...layout, [field]: value }); }} /></label>)}</div>
        </fieldset></section>
        <section aria-label="Stage background"><h3>Background</h3><fieldset disabled={busy || sourceVisible}>
          <label>Background color<input type="color" value={layout.backgroundColor} onChange={event => commit({ ...layout, backgroundColor:event.target.value })} /></label>
          <label>Background image<select aria-label="Background image" value={layout.backgroundAsset || ""} onChange={event => setBackground(event.target.value)}><option value="">None</option>{images.some(asset => asset.role === "background") && <optgroup label="PowerPoint masters">{images.filter(asset => asset.role === "background").map(asset => <option key={asset.id} value={asset.id}>{asset.filename}</option>)}</optgroup>}<optgroup label="Images">{images.filter(asset => asset.role !== "background").map(asset => <option key={asset.id} value={asset.id}>{asset.filename}</option>)}</optgroup></select></label>
        </fieldset></section>
        <h3>Layers</h3><div className="visual-layers" aria-label="Layers, front to back">{[...layout.elements].reverse().map((element, index) => <button type="button" key={element.id} aria-pressed={selection === element.id} disabled={busy || sourceVisible} onClick={() => setSelection(element.id)}><small title="Z-axis position">{layout.elements.length - index}</small>{element.locked && <Lock size={12} />}<span>{element.kind === "text" ? element.text.slice(0, 40) || "Empty text" : element.kind === "shape" ? element.shapeName || "PowerPoint shape" : images.find(asset => asset.id === element.assetId)?.filename || "Image"}</span><small>{index === 0 ? "Front" : index === layout.elements.length - 1 ? "Back" : element.source}</small></button>)}</div>
        {selected && <><div className="visual-layer-tools"><button type="button" className="icon-button" title={selected.locked ? "Unlock" : "Lock"} aria-label={selected.locked ? "Unlock element" : "Lock element"} disabled={busy} onClick={() => update({ locked: !selected.locked })}>{selected.locked ? <Unlock size={16} /> : <Lock size={16} />}</button><button type="button" className="icon-button" title="Bring forward" aria-label="Bring forward" disabled={busy || selected.locked} onClick={() => reorder(1)}><ArrowUp size={16} /></button><button type="button" className="icon-button" title="Send backward" aria-label="Send backward" disabled={busy || selected.locked} onClick={() => reorder(-1)}><ArrowDown size={16} /></button><button type="button" className="icon-button" title="Duplicate" aria-label="Duplicate element" disabled={busy || selected.locked} onClick={() => { const element = { ...selected, id:crypto.randomUUID(), x:selected.x+20, y:selected.y+20 }; commit({ ...layout,elements:[...layout.elements,element] }); setSelection(element.id); }}><Copy size={16} /></button><button type="button" className="icon-button" title="Delete" aria-label="Delete element" disabled={busy || selected.locked} onClick={() => { commit({ ...layout,elements:layout.elements.filter(element => element.id !== selected.id) }); setSelection(null); }}><Trash2 size={16} /></button></div>
          <h3>Layout</h3><div className="visual-alignment-tools" role="toolbar" aria-label="Align content to stage">{([
            ["x", "start", "Align left", AlignHorizontalJustifyStart], ["x", "center", "Center horizontally", AlignHorizontalJustifyCenter], ["x", "end", "Align right", AlignHorizontalJustifyEnd],
            ["y", "start", "Align top", AlignVerticalJustifyStart], ["y", "center", "Center vertically", AlignVerticalJustifyCenter], ["y", "end", "Align bottom", AlignVerticalJustifyEnd],
          ] as const).map(([axis, edge, label, Icon]) => <button type="button" className="icon-button" key={label} title={label} aria-label={label} disabled={busy || selected.locked || sourceVisible} onClick={() => alignToStage(axis, edge)}><Icon size={16} /></button>)}</div>
          <fieldset disabled={busy || selected.locked || sourceVisible}><div className="visual-numbers">{(["x", "y", "width", "height", "rotation"] as const).map(field => <label key={field}>{field}<input type="number" aria-label={`Element ${field}`} min={field === "width" || field === "height" ? 20 : field === "rotation" ? -360 : -10000} max={field === "rotation" ? 360 : 10000} value={Math.round(selected[field] * 100) / 100} onChange={event => { const value = event.target.valueAsNumber; if (Number.isFinite(value) && (field !== "width" && field !== "height" || value > 0) && Math.abs(value) <= (field === "rotation" ? 360 : 10000)) update({ [field]:value }); }} /></label>)}</div>
          {selected.kind === "text" ? <><label>Text<textarea ref={textInput} aria-label="Element text" rows={5} maxLength={50000} value={selected.text} onChange={event => update({text:event.target.value})} /></label><label>Font size<input type="number" min={1} max={500} value={selected.fontSize} onChange={event => { const value=event.target.valueAsNumber; if(value>=1 && value<=500) update({fontSize:value}); }} /></label><label>Text color<input type="color" value={selected.color} onChange={event => update({color:event.target.value})} /></label><label>Typeface<select value={selected.fontFamily} onChange={event => update({fontFamily:event.target.value})}>{[...new Set([selected.fontFamily,"sans-serif","serif","monospace","Manrope"])].map(font => <option key={font}>{font}</option>)}</select></label><div className="visual-formatting"><button type="button" aria-label="Bold" aria-pressed={selected.bold} onClick={() => update({bold:!selected.bold})}><b>B</b></button><button type="button" aria-label="Italic" aria-pressed={selected.italic} onClick={() => update({italic:!selected.italic})}><i>I</i></button><select aria-label="Text alignment" value={selected.align} onChange={event => update({align:event.target.value as SceneElement["align"]})}><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></div></> : selected.kind === "image" ? <><label>Image<select value={selected.assetId || ""} onChange={event => update({assetId:event.target.value})}>{images.map(asset => <option key={asset.id} value={asset.id}>{asset.filename}</option>)}</select></label><button type="button" className="button button-outline" onClick={() => update({crop:[0,0,0,0]})}>Reset crop</button></> : <p className="visual-shape-note">Extracted PowerPoint shape. Move, resize, rotate, layer, lock, or delete it on the canvas.</p>}
          </fieldset></>}
      </aside>
    </div>}
    <footer className="modal-actions"><button type="button" className="button button-outline" disabled={busy} onClick={onClose}>Cancel</button><button type="button" className="button button-accent" disabled={busy || !title.trim() || layoutMode === "template" && !templateId} onClick={() => void save()}><Check size={16} />{busy ? "Saving" : "Save scene"}</button></footer>
  </EditorDialog>;
}