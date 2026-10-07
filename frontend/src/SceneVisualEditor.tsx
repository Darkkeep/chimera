import { useRef, useState } from "react";
import { Rnd } from "react-rnd";
import { ArrowDown, ArrowUp, Check, Copy, ImagePlus, Lock, Plus, Redo2, Trash2, Undo2, Unlock, X } from "lucide-react";
import type { Project, Scene } from "./App";
import { EditorDialog } from "./EditorDialog";
import { ElementContent, initialLayout, newElement, ScaledStage } from "./SceneSurface";
import type { SceneElement, SceneLayout } from "./SceneSurface";

export function SceneVisualEditor({ project, scene, onClose, onSave, onExtract }: { project: Project; scene: Scene; onClose: () => void; onSave: (layout: SceneLayout) => Promise<void>; onExtract: () => Promise<SceneLayout> }) {
  const [history, setHistory] = useState<SceneLayout[]>(() => [initialLayout(scene)]);
  const [cursor, setCursor] = useState(0);
  const [selection, setSelection] = useState<string | null>(null);
  const [sourceVisible, setSourceVisible] = useState(false);
  const [editingText, setEditingText] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const textInput = useRef<HTMLTextAreaElement>(null);
  const layout = history[cursor];
  const selected = layout.elements.find(element => element.id === selection);
  const images = project.storyboard.assets.filter(asset => asset.kind === "image");
  const [imageId, setImageId] = useState("");
  function commit(next: SceneLayout) {
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
  function reorder(direction: number) {
    if (!selected) return;
    const index = layout.elements.indexOf(selected), target = index + direction;
    if (target < 0 || target >= layout.elements.length) return;
    const elements = [...layout.elements]; [elements[index], elements[target]] = [elements[target], elements[index]];
    commit({ ...layout, elements });
  }
  async function extract() {
    setBusy(true); setError("");
    try { const next = await onExtract(); setHistory([next]); setCursor(0); setSelection(null); }
    catch (issue) { setError(issue instanceof Error ? issue.message : "Source extraction failed."); }
    finally { setBusy(false); }
  }
  async function save() {
    setBusy(true); setError("");
    try { await onSave({ ...layout, enabled: true }); onClose(); }
    catch (issue) { setError(issue instanceof Error ? issue.message : "Scene could not be saved."); }
    finally { setBusy(false); }
  }
  return <EditorDialog className="visual-editor" labelledBy="visual-editor-title" busy={busy} onClose={onClose}>
    <header className="visual-editor-header"><h2 id="visual-editor-title">{scene.title}</h2><button type="button" className="icon-button" aria-label="Close visual editor" disabled={busy} onClick={onClose}><X size={18} /></button></header>
    <div className="visual-editor-toolbar" role="toolbar" aria-label="Scene editing tools">
      <button type="button" className="icon-button" title="Add text" aria-label="Add text" disabled={busy || sourceVisible} onClick={() => { const element = newElement("text"); commit({ ...layout, elements: [...layout.elements, element] }); setSelection(element.id); }}><Plus size={18} /></button>
      <button type="button" className="icon-button" title="Undo" aria-label="Undo" disabled={busy || cursor === 0} onClick={() => setCursor(cursor - 1)}><Undo2 size={18} /></button>
      <button type="button" className="icon-button" title="Redo" aria-label="Redo" disabled={busy || cursor === history.length - 1} onClick={() => setCursor(cursor + 1)}><Redo2 size={18} /></button>
      <span className="visual-editor-dimensions">{Math.round(layout.width)} x {Math.round(layout.height)}</span>
      {scene.previewImage && <button type="button" className="button button-outline" aria-pressed={sourceVisible} onClick={() => setSourceVisible(!sourceVisible)}>Source slide</button>}
      {!scene.visualLayout && scene.sourceSlide && project.hasSourceDeck && <button type="button" className="button button-outline" disabled={busy} onClick={() => void extract()}>Extract source layout</button>}
    </div>
    {error && <p className="visual-editor-error" role="alert">{error}</p>}
    {layout.warnings.length > 0 && <details className="visual-editor-warnings"><summary>{layout.warnings.length} import limitations</summary><ul>{layout.warnings.map(warning => <li key={warning}>{warning}</li>)}</ul></details>}
    <div className="visual-editor-workspace">
      <div className="visual-editor-canvas" onDragOver={event => { if (event.dataTransfer.types.includes("application/x-chimera-image")) event.preventDefault(); }} onDrop={event => { event.preventDefault(); if (sourceVisible || busy) return; const frame = event.currentTarget.querySelector(".visual-stage-frame")?.getBoundingClientRect(); if (frame) addImage(event.dataTransfer.getData("application/x-chimera-image"), (event.clientX - frame.left) * layout.width / frame.width, (event.clientY - frame.top) * layout.height / frame.height); }}>
        {sourceVisible ? <img className="visual-source" src={`/api/projects/${project.id}/${scene.previewImage}`} alt={`Source slide ${scene.sourceSlide}`} /> : <ScaledStage layout={layout} projectId={project.id}>{scale => layout.elements.map((element, index) => <Rnd key={element.id} scale={scale} position={{ x: element.x, y: element.y }} size={{ width: element.width, height: element.height }} disableDragging={busy || element.locked || editingText === element.id} enableResizing={!busy && !element.locked && editingText !== element.id} minWidth={20} minHeight={20} style={{ zIndex: index }} onDragStart={() => setSelection(element.id)} onDragStop={(_, data) => commit({ ...layout, elements: layout.elements.map(item => item.id === element.id ? { ...item, x: data.x, y: data.y } : item) })} onResizeStart={() => setSelection(element.id)} onResizeStop={(_, __, reference, ___, position) => commit({ ...layout, elements: layout.elements.map(item => item.id === element.id ? { ...item, ...position, width: parseFloat(reference.style.width), height: parseFloat(reference.style.height) } : item) })}>
          <div role={editingText === element.id ? undefined : "button"} tabIndex={editingText === element.id ? undefined : 0} aria-label={`${element.kind === "text" ? element.text.slice(0, 50) || "Empty text" : "Image"} element`} aria-pressed={editingText === element.id ? undefined : selection === element.id} className={`visual-element visual-editable ${selection === element.id ? "is-selected" : ""}`} style={{ transform: `rotate(${element.rotation}deg)` }} onClick={() => setSelection(element.id)} onDoubleClick={() => { setSelection(element.id); if (element.kind === "text" && !element.locked && !busy) setEditingText(element.id); }} onKeyDown={event => { if (event.target instanceof HTMLTextAreaElement) return; setSelection(element.id); if (element.locked || busy) return; if (event.key === "Enter" && element.kind === "text") { event.preventDefault(); setEditingText(element.id); return; } const step = event.shiftKey ? 10 : 1; const moves: Record<string, {x:number;y:number}> = {ArrowLeft:{x:-step,y:0},ArrowRight:{x:step,y:0},ArrowUp:{x:0,y:-step},ArrowDown:{x:0,y:step}}; if (moves[event.key]) { event.preventDefault(); commit({ ...layout, elements: layout.elements.map(item => item.id === element.id ? { ...item, x:item.x+moves[event.key].x, y:item.y+moves[event.key].y } : item) }); } }}>{editingText === element.id ? <textarea autoFocus aria-label="Edit canvas text" className="visual-inline-text" value={element.text} maxLength={50000} style={{fontSize:element.fontSize,fontFamily:element.fontFamily,color:element.color}} onChange={event => commit({...layout,elements:layout.elements.map(item => item.id === element.id ? {...item,text:event.target.value} : item)})} onBlur={() => setEditingText(null)} onKeyDown={event => { if(event.key === "Escape") { event.stopPropagation(); setEditingText(null); } }} /> : <ElementContent element={element} project={project} scene={scene} />}</div>
        </Rnd>)}</ScaledStage>}
        <section className="visual-attached-images" aria-label="Attached images"><h3>Attached images</h3><div>{images.filter(asset => scene.imageAssets.includes(asset.id)).map(asset => <button type="button" key={asset.id} title={asset.filename} aria-label={`Add ${asset.filename}`} draggable={!busy} disabled={busy || sourceVisible} onDragStart={event => event.dataTransfer.setData("application/x-chimera-image", asset.id)} onClick={() => addImage(asset.id)}><img src={`/api/projects/${project.id}/assets/${asset.id}`} alt={asset.filename} /></button>)}</div><div className="visual-library-picker"><select aria-label="Image from media library" value={imageId} onChange={event => setImageId(event.target.value)}><option value="">Media library</option>{images.map(asset => <option key={asset.id} value={asset.id}>{asset.filename}</option>)}</select><button type="button" className="icon-button" title="Add selected image" aria-label="Add selected image" disabled={!imageId || busy || sourceVisible} onClick={() => addImage(imageId)}><ImagePlus size={18} /></button></div></section>
      </div>
      <aside className="visual-inspector" aria-label="Element properties">
        <label>Background color<input type="color" value={layout.backgroundColor} disabled={busy} onChange={event => commit({ ...layout, backgroundColor:event.target.value })} /></label>
        <label>Background image<select value={layout.backgroundAsset || ""} disabled={busy} onChange={event => commit({ ...layout, backgroundAsset:event.target.value || null })}><option value="">None</option>{images.map(asset => <option key={asset.id} value={asset.id}>{asset.filename}</option>)}</select></label>
        <h3>Layers</h3><div className="visual-layers">{[...layout.elements].reverse().map(element => <button type="button" key={element.id} aria-pressed={selection === element.id} onClick={() => setSelection(element.id)}>{element.locked && <Lock size={12} />}<span>{element.kind === "text" ? element.text.slice(0, 40) || "Empty text" : images.find(asset => asset.id === element.assetId)?.filename || "Image"}</span><small>{element.source}</small></button>)}</div>
        {selected && <><div className="visual-layer-tools"><button type="button" className="icon-button" title={selected.locked ? "Unlock" : "Lock"} aria-label={selected.locked ? "Unlock element" : "Lock element"} disabled={busy} onClick={() => update({ locked: !selected.locked })}>{selected.locked ? <Unlock size={16} /> : <Lock size={16} />}</button><button type="button" className="icon-button" title="Bring forward" aria-label="Bring forward" disabled={busy || selected.locked} onClick={() => reorder(1)}><ArrowUp size={16} /></button><button type="button" className="icon-button" title="Send backward" aria-label="Send backward" disabled={busy || selected.locked} onClick={() => reorder(-1)}><ArrowDown size={16} /></button><button type="button" className="icon-button" title="Duplicate" aria-label="Duplicate element" disabled={busy || selected.locked} onClick={() => { const element = { ...selected, id:crypto.randomUUID(), x:selected.x+20, y:selected.y+20 }; commit({ ...layout,elements:[...layout.elements,element] }); setSelection(element.id); }}><Copy size={16} /></button><button type="button" className="icon-button" title="Delete" aria-label="Delete element" disabled={busy || selected.locked} onClick={() => { commit({ ...layout,elements:layout.elements.filter(element => element.id !== selected.id) }); setSelection(null); }}><Trash2 size={16} /></button></div>
          <fieldset disabled={busy || selected.locked}><div className="visual-numbers">{(["x", "y", "width", "height", "rotation"] as const).map(field => <label key={field}>{field}<input type="number" aria-label={`Element ${field}`} min={field === "width" || field === "height" ? 20 : field === "rotation" ? -360 : -10000} max={field === "rotation" ? 360 : 10000} value={Math.round(selected[field] * 100) / 100} onChange={event => { const value = event.target.valueAsNumber; if (Number.isFinite(value) && (field !== "width" && field !== "height" || value > 0) && Math.abs(value) <= (field === "rotation" ? 360 : 10000)) update({ [field]:value }); }} /></label>)}</div>
          {selected.kind === "text" ? <><label>Text<textarea ref={textInput} aria-label="Element text" rows={5} maxLength={50000} value={selected.text} onChange={event => update({text:event.target.value})} /></label><label>Font size<input type="number" min={1} max={500} value={selected.fontSize} onChange={event => { const value=event.target.valueAsNumber; if(value>=1 && value<=500) update({fontSize:value}); }} /></label><label>Text color<input type="color" value={selected.color} onChange={event => update({color:event.target.value})} /></label><label>Typeface<select value={selected.fontFamily} onChange={event => update({fontFamily:event.target.value})}>{[...new Set([selected.fontFamily,"sans-serif","serif","monospace","Manrope"])].map(font => <option key={font}>{font}</option>)}</select></label><div className="visual-formatting"><button type="button" aria-label="Bold" aria-pressed={selected.bold} onClick={() => update({bold:!selected.bold})}><b>B</b></button><button type="button" aria-label="Italic" aria-pressed={selected.italic} onClick={() => update({italic:!selected.italic})}><i>I</i></button><select aria-label="Text alignment" value={selected.align} onChange={event => update({align:event.target.value as SceneElement["align"]})}><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></div></> : <><label>Image<select value={selected.assetId || ""} onChange={event => update({assetId:event.target.value})}>{images.map(asset => <option key={asset.id} value={asset.id}>{asset.filename}</option>)}</select></label><button type="button" className="button button-outline" onClick={() => update({crop:[0,0,0,0]})}>Reset crop</button></>}
          </fieldset></>}
      </aside>
    </div>
    <footer className="modal-actions"><button type="button" className="button button-outline" disabled={busy} onClick={onClose}>Cancel</button><button type="button" className="button button-accent" disabled={busy} onClick={() => void save()}><Check size={16} />{busy ? "Saving" : "Save scene"}</button></footer>
  </EditorDialog>;
}