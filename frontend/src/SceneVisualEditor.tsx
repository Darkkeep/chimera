import { assetLabel } from "./asset-display";
import { createContext, useContext, useEffect, useRef, useState } from "react";
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
import { SceneTimeline } from "./SceneTimeline";
import { ElementAppearanceControls } from "./ElementAppearanceControls";
import { animationEndMs, defaultAppearance, withSceneTimeline } from "./scene-timeline";
import { useMediaConnections } from "./media-connections";
import { backgroundMode } from "./background";
import { GeneratedMediaPanel } from "./GeneratedMediaPanel";
import { MediaToolsPanel } from "./MediaToolsPanel";
import { StudioNaturalInspector } from "./StudioNaturalInspector";
import type { SceneNavigationState } from "./scene-navigation";
import "./scene-compact.css";
import { ProjectPalette, ColorPicker } from "./ColorPicker";
import { FloatingInspector } from "./FloatingInspector";
import { EditorDropdown } from "./EditorDropdown";

const InspectorScope = createContext<string | undefined>(undefined);
function InspectorSection({ title, children }: { title: string; children: ReactNode }) {
  const scope = useContext(InspectorScope);
  if (scope && scope !== title) return null;
  if (scope) return <section className="visual-inspector-section" data-section={title}><div className="visual-inspector-section-body">{children}</div></section>;
  return <details className="visual-inspector-section" data-section={title}>
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
  imageAltText: Record<string, string>;
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

export function SceneVisualEditor({ project, scene, templates, onClose, onSave, onExtract, onApplyTemplate, onGenerate, onProjectUpdated, canGenerate, initialPanel = "canvas", embedded = false, onNavigationState, onNavigate, onLearnerPreview, onScenePreview, onActivity, onQuestion, onHTML5 }: { project: Project; scene: Scene; templates: { id: string; title: string }[]; onClose: () => void; onSave: (layout: SceneLayout, settings: SceneEditSettings) => Promise<void>; onExtract: () => Promise<SceneLayout>; onApplyTemplate: (templateId: string, title: string, extractedText: string[]) => Promise<SceneLayout>; onGenerate: (prompt: string, currentScene: Partial<Scene>, connectionId?: string) => Promise<GeneratedSceneDraft>; onProjectUpdated: (project: Project) => void; canGenerate: boolean; initialPanel?: "canvas" | "details"; embedded?: boolean; onNavigationState?: (state: SceneNavigationState | null) => void; onNavigate?: (action: () => void) => void; onLearnerPreview?: () => void; onScenePreview?: () => void; onActivity?: (kind: string) => void; onQuestion?: (type: string) => void; onHTML5?: () => void }) {
  const { catalog: mediaCatalog, error: connectionError } = useMediaConnections();
  const [connectionId, setConnectionId] = useState("");
  const sceneConnections = mediaCatalog?.connections.filter(item => item.readyFor.includes("scene")) ?? [];
  useEffect(() => { if (!connectionId && mediaCatalog?.defaults.scene) setConnectionId(mediaCatalog.defaults.scene); }, [mediaCatalog, connectionId]);
  const selectedSceneConnection = sceneConnections.find(item => item.id === connectionId);
  const [history, setHistory] = useState<SceneLayout[]>(() => [initialLayout(scene)]);
  const [cursor, setCursor] = useState(0);
  const [multiSelection, setMultiSelection] = useState<string[]>([]);
  const [groupName, setGroupName] = useState("Group 1");
  const [selection, setFocusedElement] = useState<string | null>(null);
  function setSelection(id: string | null) {
    setFocusedElement(id);
    setMultiSelection(id ? [id] : []);
  }
  function selectObject(id: string, additive = false) {
    if (!additive) { setSelection(id); return; }
    const ids = multiSelection.includes(id) ? multiSelection.filter(item => item !== id) : [...multiSelection, id];
    setMultiSelection(ids);
    setFocusedElement(ids.includes(id) ? id : ids.at(-1) || null);
  }
  const [sourceVisible, setSourceVisible] = useState(Boolean((scene.sourceSlide || scene.previewImage) && !scene.visualLayout));
  const [motionPreview, setMotionPreview] = useState(0);
  const [audition,setAudition] = useState<{muted:string[];solo:string|null}>({muted:[],solo:null});
  const [timelineTime, setTimelineTime] = useState(0);
  const [timelinePlaying, setTimelinePlaying] = useState(false);
  const [timelinePreview, setTimelinePreview] = useState(false);
  const [durationValid, setDurationValid] = useState(true);
  const [editingText, setEditingText] = useState<string | null>(null);
  const [saving, setBusy] = useState(false);
  const [mediaWorking, setMediaWorking] = useState(false);
  const [placementWorking, setPlacementWorking] = useState(false);
  const busy = saving || mediaWorking || placementWorking;
  const [error, setError] = useState("");
  const [panel, setPanel] = useState<"details" | "canvas" | "media">(initialPanel);
  const editorRoot = useRef<HTMLElement>(null);
  const [inspectors, setInspectors] = useState<string[]>([]);
  const [pinnedInspectors, setPinnedInspectors] = useState<string[]>([]);
  const [panelReset, setPanelReset] = useState(0);
  const [motionPhase,setMotionPhase] = useState<"entrance" | "presentation" | "exit">("entrance");
  const [surfaceEffect, setSurfaceEffect] = useState<"shadow" | "bevel" | "emboss">("shadow");
  const [sceneSection, setSceneSection] = useState("Identity");
  const [navigatorHidden, setNavigatorHidden] = useState(false);
  const [menu, setMenu] = useState<string | null>(null);
  const [inspectorAdvanced, setInspectorAdvanced] = useState(false);
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
  const [imageAltText, setImageAltText] = useState<Record<string, string>>(() => ({...scene.imageAltText}));
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
  const layout = withSceneTimeline(history[cursor]);
  const mediaContextSignature = JSON.stringify({ title, sceneType, layoutMode, templateId, screenText, actionDescription, narration, notes, required, audioRequired, assessmentItem, assessmentSettings, layout });
  const [savedMediaContext, setSavedMediaContext] = useState(mediaContextSignature);
  const mediaContextDirty = savedMediaContext !== mediaContextSignature;
  const [mediaVisited, setMediaVisited] = useState(false);
  const stageLayout = resolvedSceneBackground(project, { ...scene, visualLayout: layout }).visualLayout || layout;
  const questionRegion = assessmentRegion(layout, title);
  const selected = layout.elements.find(element => element.id === selection);
  const animationTargets = layout.elements.filter(element => multiSelection.includes(element.id) && !element.locked);
  const animationReference = animationTargets.find(element => element.id === selection) || animationTargets[0] || selected;
  const images = project.storyboard.assets.filter(asset => asset.kind === "image");
  const [imageId, setImageId] = useState("");
  function restoreHistory(nextCursor: number) {
    if (busy || nextCursor < 0 || nextCursor >= history.length) return;
    setMotionPreview(0); setTimelinePlaying(false);
    setCursor(nextCursor);
    const id = templateHistory.current[nextCursor] || "";
    setTemplateId(id); setPendingTemplateId(id);
    setLayoutMode(id ? "template" : scene.sourceSlide ? "hybrid" : "native");
  }
  useEffect(() => {
    function onHistoryShortcut(event: KeyboardEvent) {
      if (event.defaultPrevented || event.isComposing || event.altKey || !(event.ctrlKey || event.metaKey)) return;
      const target = event.target;
      if (!(target instanceof HTMLElement) || !target.closest(".visual-editor")) return;
      if (target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])')) return;
      const key = event.key.toLowerCase();
      if (key !== "z" && key !== "y") return;
      event.preventDefault();
      restoreHistory(cursor + (key === "y" || event.shiftKey ? 1 : -1));
    }
    document.addEventListener("keydown", onHistoryShortcut);
    return () => document.removeEventListener("keydown", onHistoryShortcut);
  });
  function commit(next: SceneLayout, appliedTemplate = templateId, previousLayout?: SceneLayout) {
    setMotionPreview(0); setTimelinePlaying(false);
    if(next.timeline){const endpoint=Math.max(next.timeline.durationMs,...next.elements.map(e=>Math.max(e.timing?.endMs||0,animationEndMs(e.animations))));if(endpoint>3600000){setError("Keep the complete scene within one hour.");return;}next={...next,timeline:{...next.timeline,durationMs:endpoint}};}
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
  function distribute(axis:"x"|"y") {
    const size=axis==="x"?"width":"height";
    const items=layout.elements.filter(e=>multiSelection.includes(e.id)&&!e.locked).sort((a,b)=>a[axis]-b[axis]);
    if(items.length<3)return;
    const min=items[0][axis],max=Math.max(...items.map(e=>e[axis]+e[size]));
    const gap=(max-min-items.reduce((sum,e)=>sum+e[size],0))/(items.length-1);
    const positions=new Map<string,number>();let position=min;for(const e of items){positions.set(e.id,position);position+=e[size]+gap;}
    commit({...layout,elements:layout.elements.map(e=>positions.has(e.id)?{...e,[axis]:positions.get(e.id)!}:e)});
  }
  function moveElement(id:string,x:number,y:number) {
    const element=layout.elements.find(e=>e.id===id);if(!element)return;
    const dx=x-element.x,dy=y-element.y;
    commit({...layout,elements:layout.elements.map(e=>!e.locked&&(e.id===id||multiSelection.includes(id)&&multiSelection.includes(e.id)||element.groupId&&e.groupId===element.groupId)?{...e,x:e.x+dx,y:e.y+dy}:e)});
  }
  function update(changes: Partial<SceneElement>) {
    if (!selected) return;
    if(selected.aspectLocked ?? false) {if(changes.width!==undefined)changes={...changes,height:selected.height*changes.width/selected.width};else if(changes.height!==undefined)changes={...changes,width:selected.width*changes.height/selected.height};}
    const dx=changes.x!==undefined?changes.x-selected.x:0,dy=changes.y!==undefined?changes.y-selected.y:0;
    commit({ ...layout, elements: layout.elements.map(element => element.id === selected.id ? { ...element, ...changes } : selected.groupId&&element.groupId===selected.groupId&&!element.locked ? {...element,x:element.x+dx,y:element.y+dy} : element) });
  }
  function addImage(assetId: string, x = 40, y = 40) {
    if (!images.some(asset => asset.id === assetId)) return;
    const element = newElement("image", { assetId, x, y });
    commit({ ...layout, elements: [...layout.elements, element] }); setSelection(element.id);
    if (embedded) closeInspector("Insert image");
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
  async function save(closeAfterSave = true) {
    if (!durationValid) { setError("Enter a valid scene duration before saving."); return false; }
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
        imageAltText,
      });
      setSavedMediaContext(mediaContextSignature);
      baseline.current = draftSignature;
      if (closeAfterSave) onClose();
      return true;
    }
    catch (issue) { setError(issue instanceof Error ? issue.message : "Scene could not be saved."); return false; }
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
      }, connectionId);
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
  const draftSignature = JSON.stringify({ title, sceneType, layoutMode, templateId, screenText, imageAltText, actionDescription, narration, notes, required, audioRequired, assessmentItem, assessmentSettings, layout });
  const baseline = useRef(draftSignature);
  const dirty = draftSignature !== baseline.current;
  const saveDisabled = busy || !title.trim() || !durationValid || Boolean((scene.sourceSlide || scene.previewImage) && !scene.visualLayout && !canvasEdited) || layoutMode === "template" && !templateId;
  const navigationState = useRef<SceneNavigationState>({ dirty, busy, save: () => save(), discard: onClose });
  navigationState.current = { dirty, busy, save: () => save(), discard: onClose };
  useEffect(() => {
    onNavigationState?.({ get dirty() { return navigationState.current.dirty; }, get busy() { return navigationState.current.busy; }, save: () => navigationState.current.save(), discard: () => navigationState.current.discard() });
    return () => onNavigationState?.(null);
  }, [onNavigationState]);
  function cancelEditing() {
    if (busy) return;
    if (onNavigate) onNavigate(onClose);
    else if (!dirty || window.confirm("Discard unsaved scene changes?")) onClose();
  }
  function openInspector(section: string) {
    setMenu(null); setInspectorAdvanced(true);
    setInspectors(previous => [...previous.filter(name => name === section || innerWidth > 760 && pinnedInspectors.includes(name)), ...previous.includes(section) ? [] : [section]]);
  }
  useEffect(() => { function resize() { if(innerWidth<=760)setInspectors(previous=>previous.slice(-1)); } window.addEventListener("resize",resize);return()=>window.removeEventListener("resize",resize); },[]);
  function closeInspector(name: string) { setInspectors(previous => previous.filter(item => item !== name)); setPinnedInspectors(previous => previous.filter(item => item !== name)); }
  function sceneInspector(section: string) { setSceneSection(section); openInspector("Scene properties"); }
  function timelineAction() { const node=editorRoot.current?.querySelector<HTMLDetailsElement>(".scene-timeline"); if (node) {node.open = !node.open; if(node.open)node.scrollIntoView({block:"nearest"});} }
  function applyMotion(phase: "entrance" | "presentation" | "exit", effect: string) {
    if (busy || sourceVisible || !animationTargets.length) return;
    commit({...layout,elements:layout.elements.map(element => animationTargets.some(target=>target.id===element.id) ? {...element,animations:alignExitTiming({...element.animations || defaultAnimations(),[phase]:{...(element.animations || defaultAnimations())[phase],effect}})} : element)});
    setMotionPhase(phase); openInspector("Animation");
  }
  function applySurfaceEffect(effect: "shadow" | "bevel" | "emboss") { if (!selected || selected.locked || busy || sourceVisible) return; const value=selected.appearance || defaultAppearance(); update({appearance:{...value,[effect]:{...value[effect],enabled:!value[effect].enabled}}}); setSurfaceEffect(effect); openInspector("Appearance"); }
  useEffect(() => { const host=editorRoot.current?.closest(".studio-shell");host?.classList.toggle("studio-hide-navigator",navigatorHidden);return()=>host?.classList.remove("studio-hide-navigator"); },[navigatorHidden]);
  async function fitText() {
    setBusy(true); setError("");
    try {
      const current = sceneTextDirty ? syncSceneText(layout, scene, title.trim(), screenText, generatedLayoutApplied) : layout;
      const fitted = await fitLayoutText(current, true); commit(fitted.layout);
      if (fitted.issues.length) setError(textFitMessage(fitted.issues));
    } catch (issue) { setError(issue instanceof Error ? issue.message : "Text could not be measured."); }
    finally { setBusy(false); }
  }
  function insertText() { const element = newElement("text"); commit({ ...layout, elements: [...layout.elements, element] }); setSelection(element.id); }
  function insertShape(shape: SceneElement["nativeShape"]) { const element = newElement("shape", { nativeShape: shape, shapeName: shape, name: shape || "Shape", appearance: defaultAppearance() }); commit({ ...layout, elements: [...layout.elements, element] }); setSelection(element.id); }
  const renderInspector = (scope?: string) => <InspectorScope.Provider value={scope}><aside className="visual-inspector" aria-label="Element properties" hidden={embedded && !selected && !inspectorAdvanced}>
        {embedded && scope === "Properties" && <StudioNaturalInspector element={selected} layout={layout} title={title} disabled={busy || sourceVisible}
          images={images}
          imageAltText={imageAltText}
          onImageAltTextChange={(assetId, text) => setImageAltText(current => ({...current, [assetId]: text}))}
          onTitleChange={value => { setTitle(value); setSceneTextDirty(true); }}
          onChange={update}
          onStageChange={changes => commit({ ...layout, ...changes })}
        />}

        {(!embedded || inspectorAdvanced) && <>
        {selected && <InspectorSection title="Appearance"><ElementAppearanceControls compact={embedded} focusEffect={surfaceEffect} element={selected} onChange={update} disabled={busy || selected.locked || sourceVisible}/></InspectorSection>}
        {selected && <InspectorSection title="Animation">{multiSelection.length > 1 && <p className="field-hint">Animation changes apply to {animationTargets.length} selected unlocked objects. Settings shown are from {animationReference?.name || animationReference?.text.slice(0, 40) || "the active object"}.</p>}<AnimationControls focusPhase={motionPhase} gallery={embedded} animations={animationReference?.animations} onChange={animations => {
          if (busy || sourceVisible || !animationTargets.length) return;
          commit({ ...layout, elements: layout.elements.map(element => animationTargets.some(target => target.id === element.id) ? { ...element, animations: structuredClone(animations) } : element) });
        }} disabled={busy || !animationTargets.length || sourceVisible} /></InspectorSection>}
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
          <ColorPicker label="Background color" value={layout.backgroundColor} disabled={busy || sourceVisible} onChange={backgroundColor => commit({...layout,backgroundColor})}/>
          <BackgroundImagePicker project={project} label="Background image" allowInherit fallbackAsset={layout.sourceBackgroundAsset} value={backgroundMode(layout) === "inherit" ? undefined : backgroundMode(layout) === "none" ? null : layout.backgroundAsset} onChange={setBackground} disabled={busy || sourceVisible} />
          <p className="field-hint">Use the project default, choose a scene image, or select None. Set the project default in Storyboard &gt; Project background.</p>
        </fieldset></InspectorSection>
        <InspectorSection title="Layers">
        <label>Group name<input disabled={busy||sourceVisible} value={groupName} maxLength={120} onChange={e=>setGroupName(e.target.value)}/></label>
        <button type="button" className="button button-outline" disabled={busy||sourceVisible||multiSelection.length<2||!groupName.trim()} onClick={()=>{commit({...layout,elements:layout.elements.map(e=>multiSelection.includes(e.id)&&!e.locked?{...e,groupId:groupName.trim()}:e)});}}>Group checked layers</button>
        <div className="visual-layer-tools"><button type="button" className="button button-outline" disabled={busy||sourceVisible||multiSelection.length<3} onClick={()=>distribute("x")}>Distribute horizontally</button><button type="button" className="button button-outline" disabled={busy||sourceVisible||multiSelection.length<3} onClick={()=>distribute("y")}>Distribute vertically</button></div>
        <div className="visual-layer-checks">{layout.elements.map(e=><label key={e.id} className={`timeline-checkbox ${multiSelection.includes(e.id) ? "is-selected" : ""}`}><input type="checkbox" disabled={busy||sourceVisible} checked={multiSelection.includes(e.id)} onChange={event=>{const ids=event.target.checked?[...multiSelection,e.id]:multiSelection.filter(id=>id!==e.id);setMultiSelection(ids);setFocusedElement(event.target.checked?e.id:selection===e.id?ids.at(-1)||null:selection);}}/>{e.name||e.text.slice(0,25)||e.kind}</label>)}</div>
        {selected&&<><button type="button" className="button button-outline" disabled={busy||selected.locked} onClick={()=>update({hidden:!selected.hidden})}>{selected.hidden?'Show in delivery':'Hide in delivery'}</button>{selected.groupId&&<button type="button" className="button button-outline" disabled={busy} onClick={()=>commit({...layout,elements:layout.elements.map(e=>e.groupId===selected.groupId?{...e,groupId:null}:e)})}>Ungroup {selected.groupId}</button>}</>}

        <div className="visual-layers" aria-label="Layers, front to back">{sceneType === "question" && assessmentItem && <button type="button" aria-pressed={selection === "assessment-region"} disabled={busy || sourceVisible} onClick={() => setSelection("assessment-region")}><Check size={14} aria-hidden="true" style={{visibility: selection === "assessment-region" ? "visible" : "hidden"}} /><span>Question region</span></button>}{[...layout.elements].reverse().map((element, index) => <button type="button" key={element.id} draggable={!busy&&!sourceVisible&&!element.locked} onDragStart={event=>event.dataTransfer.setData("application/x-chimera-layer",element.id)} onDragOver={event=>{if(event.dataTransfer.types.includes("application/x-chimera-layer"))event.preventDefault();}} onDrop={event=>{event.preventDefault();if(busy||sourceVisible)return;const id=event.dataTransfer.getData("application/x-chimera-layer");const moving=layout.elements.find(e=>e.id===id);if(!moving||moving.locked||moving.id===element.id)return;const elements=layout.elements.filter(e=>e.id!==id);elements.splice(elements.findIndex(e=>e.id===element.id),0,moving);commit({...layout,elements});}} aria-pressed={multiSelection.includes(element.id)} disabled={busy || sourceVisible} onClick={event => selectObject(element.id, event.ctrlKey || event.metaKey)}><Check size={14} aria-hidden="true" className="visual-layer-selection-mark" style={{ visibility: multiSelection.includes(element.id) ? "visible" : "hidden" }} /><small title="Z-axis position">{layout.elements.length - index}</small>{element.locked && <Lock size={12} />}<span>{element.name || (element.kind === "text" ? element.text.slice(0, 40) || "Empty text" : element.kind === "shape" ? element.shapeName || "PowerPoint shape" : assetLabel(images.find(asset => asset.id === element.assetId), "Image"))}</span><small>{index === 0 ? "Front" : index === layout.elements.length - 1 ? "Back" : element.source}</small></button>)}</div>
        {selected && <><div className="visual-layer-tools"><button type="button" className="icon-button" title={selected.locked ? "Unlock" : "Lock"} aria-label={selected.locked ? "Unlock element" : "Lock element"} disabled={busy} onClick={() => update({ locked: !selected.locked })}>{selected.locked ? <Unlock size={16} /> : <Lock size={16} />}</button><button type="button" className="icon-button" title="Bring forward" aria-label="Bring forward" disabled={busy || selected.locked} onClick={() => reorder(1)}><ArrowUp size={16} /></button><button type="button" className="icon-button" title="Send backward" aria-label="Send backward" disabled={busy || selected.locked} onClick={() => reorder(-1)}><ArrowDown size={16} /></button><button type="button" className="icon-button" title="Duplicate" aria-label="Duplicate element" disabled={busy || selected.locked} onClick={() => { const element = { ...selected, id:crypto.randomUUID(), x:selected.x+20, y:selected.y+20 }; commit({ ...layout,elements:[...layout.elements,element] }); setSelection(element.id); }}><Copy size={16} /></button><button type="button" className="icon-button" title="Delete" aria-label="Delete element" disabled={busy || selected.locked} onClick={() => { commit({ ...layout,elements:layout.elements.filter(element => element.id !== selected.id) }); setSelection(null); }}><Trash2 size={16} /></button></div>
        </>}
        </InspectorSection>
        {selected && <InspectorSection title="Layout"><div className="visual-alignment-tools" role="toolbar" aria-label="Align content to stage">{([
            ["x", "start", "Align left", AlignHorizontalJustifyStart], ["x", "center", "Center horizontally", AlignHorizontalJustifyCenter], ["x", "end", "Align right", AlignHorizontalJustifyEnd],
            ["y", "start", "Align top", AlignVerticalJustifyStart], ["y", "center", "Center vertically", AlignVerticalJustifyCenter], ["y", "end", "Align bottom", AlignVerticalJustifyEnd],
          ] as const).map(([axis, edge, label, Icon]) => <button type="button" className="icon-button" key={label} title={label} aria-label={label} disabled={busy || selected.locked || sourceVisible} onClick={() => alignToStage(axis, edge)}><Icon size={16} /></button>)}</div>
          <fieldset disabled={busy || selected.locked || sourceVisible}><div className="visual-numbers">{(["x", "y", "width", "height", "rotation"] as const).map(field => <label key={field}>{field}<input type="number" aria-label={`Element ${field}`} min={field === "width" || field === "height" ? 20 : field === "rotation" ? -360 : -10000} max={field === "rotation" ? 360 : 10000} value={Math.round(selected[field] * 100) / 100} onChange={event => { const value = event.target.valueAsNumber; if (Number.isFinite(value) && (field !== "width" && field !== "height" || value > 0) && Math.abs(value) <= (field === "rotation" ? 360 : 10000)) update({ [field]:value }); }} /></label>)}</div>
          {selected.kind === "text" ? <><label>Text<textarea ref={textInput} aria-label="Element text" rows={5} maxLength={50000} value={selected.text} onChange={event => update({text:event.target.value})} /></label><label>Font size<input type="number" min={1} max={500} value={selected.fontSize} onChange={event => { const value=event.target.valueAsNumber; if(value>=1 && value<=500) update({fontSize:value}); }} /></label><ColorPicker label="Text color" value={selected.color} disabled={busy || selected.locked} onChange={color=>update({color})}/><label>Typeface<select value={selected.fontFamily} onChange={event => update({fontFamily:event.target.value})}>{[...new Set([selected.fontFamily,"sans-serif","serif","monospace","Manrope"])].map(font => <option key={font}>{font}</option>)}</select></label><div className="visual-formatting"><button type="button" aria-label="Bold" aria-pressed={selected.bold} onClick={() => update({bold:!selected.bold})}><b>B</b></button><button type="button" aria-label="Italic" aria-pressed={selected.italic} onClick={() => update({italic:!selected.italic})}><i>I</i></button><select aria-label="Text alignment" value={selected.align} onChange={event => update({align:event.target.value as SceneElement["align"]})}><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></div></> : selected.kind === "image" ? <><label>Image<select value={selected.assetId || ""} onChange={event => update({assetId:event.target.value})}>{images.map(asset => <option key={asset.id} value={asset.id}>{assetLabel(asset)}</option>)}</select></label><button type="button" className="button button-outline" onClick={() => update({crop:[0,0,0,0]})}>Reset crop</button></> : <p className="visual-shape-note">Extracted PowerPoint shape. Move, resize, rotate, layer, lock, or delete it on the canvas.</p>}
          </fieldset></InspectorSection>}
        </>}
      </aside></InspectorScope.Provider>;
  const detailsContent = <div className="visual-scene-details">
    {embedded && sceneSection === "Identity" && <p className="field-hint">Scene type describes its purpose. Insert adds learner activities and scored questions.</p>}
    {embedded && <div className="inspector-tabs" role="group" aria-label="Scene property sections">{["Identity","Content","Notes","Template","Requirements",...(canGenerate?["AI"]:[])].map(section=><button type="button" key={section} aria-pressed={sceneSection===section} onClick={()=>setSceneSection(section)}>{section}</button>)}</div>}
      {sceneType === "question" && assessmentItem && <AssessmentDraftPreview item={assessmentItem} settings={assessmentSettings} />}
      {canGenerate && (!embedded || sceneSection === "AI") && <details className="scene-ai-options"><summary>AI scene draft</summary><section className="scene-ai-draft" aria-label="Draft this scene with AI">
        <label>AI connection<select value={selectedSceneConnection ? connectionId : ""} onChange={event => setConnectionId(event.target.value)} disabled={busy || generatingDraft}><option value="">Select a configured connection</option>{sceneConnections.map(item => <option key={item.id} value={item.id}>{item.name} · {item.models.scene}</option>)}</select></label>{connectionError && <p role="alert">{connectionError}</p>}<label>Scene prompt<textarea aria-label="Scene prompt" rows={2} maxLength={3000} value={scenePrompt} onChange={event => setScenePrompt(event.target.value)} placeholder="Describe how this scene should change" /></label>
        <button type="button" className="button button-outline" disabled={!scenePrompt.trim() || generatingDraft || busy || !selectedSceneConnection} onClick={() => void generateSceneDraft()}><Sparkles size={14} />{generatingDraft ? "Generating draft…" : "Generate scene + layout draft"}</button>
        {draftError && <p className="visual-editor-error" role="alert">{draftError}</p>}
      </section></details>}
      <div className="visual-scene-details-grid">
        <label data-scene-field="Identity" hidden={embedded && sceneSection !== "Identity"}>Scene title<input value={title} maxLength={120} onChange={event => { setTitle(event.target.value); setSceneTextDirty(true); }} /></label>
        <label data-scene-field="Identity" hidden={embedded && sceneSection !== "Identity"}>Scene type<select aria-label="Scene type" value={sceneType} onChange={event => setSceneType(event.target.value as Scene["sceneType"])}>{[["content", "Content"], ["title", "Title"], ["question", "Question"], ["media", "Media"], ["interaction", "Interaction"], ["summary", "Summary"]].map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <div className="visual-scene-details-wide" data-scene-field="Template" hidden={embedded && sceneSection !== "Template"}><label>Template<select aria-label="Template" value={pendingTemplateId} onChange={event => setPendingTemplateId(event.target.value)}><option value="">Choose a template</option>{templates.map(template => <option value={template.id} key={template.id}>{template.title}</option>)}</select></label><button type="button" className="button button-outline" disabled={busy || !pendingTemplateId} onClick={async () => {
          setBusy(true); setError("");
          try {
            const next = await onApplyTemplate(pendingTemplateId, title.trim(), screenText.split(/\r?\n/).map(text => text.trim()).filter(Boolean));
            const previous = sceneTextDirty ? syncSceneText(layout, scene, title.trim(), screenText, generatedLayoutApplied) : layout;
            commit(next, pendingTemplateId, previous); setTemplateId(pendingTemplateId); setLayoutMode("template");
            setSceneTextDirty(false); setSourceVisible(false); setPanel("canvas");
          } catch (issue) { setError(issue instanceof Error ? issue.message : "Template could not be applied."); }
          finally { setBusy(false); }
        }}>Apply template</button><span className="field-hint">{templates.length ? "Review the result on Stage. Undo restores the previous composition; Save scene keeps the change." : "Upload a PPTX template in Templates to use it here."}</span></div>
        <label className="visual-scene-details-wide" data-scene-field="Content" hidden={embedded && sceneSection !== "Content"}>On-screen text<textarea aria-label="On-screen text" rows={5} maxLength={50000} value={screenText} onChange={event => { setScreenText(event.target.value); setSceneTextDirty(true); }} /></label>
        <label className="visual-scene-details-wide" data-scene-field="Content" hidden={embedded && sceneSection !== "Content"}>Action description<textarea aria-label="Action description" rows={3} maxLength={5000} value={actionDescription} onChange={event => setActionDescription(event.target.value)} placeholder="Describe movement, interaction, or timed actions shown in this scene" /></label>
        <label className="visual-scene-details-wide" data-scene-field="Notes" hidden={embedded && sceneSection !== "Notes"}>Narration<textarea aria-label="Narration" rows={3} maxLength={10000} value={narration} onChange={event => setNarration(event.target.value)} /></label>
        <label className="visual-scene-details-wide" data-scene-field="Notes" hidden={embedded && sceneSection !== "Notes"}>Speaker notes<textarea aria-label="Speaker notes" rows={4} value={notes} onChange={event => setNotes(event.target.value)} /></label>
        <label className="visual-scene-checkbox" data-scene-field="Requirements" hidden={embedded && sceneSection !== "Requirements"}><input type="checkbox" checked={required} onChange={event => setRequired(event.target.checked)} /><span>Required scene</span></label>
        {(scene.audioAssets.length > 0 || layout.timeline?.clips.some(c=>c.kind==="audio")) && <label className="visual-scene-checkbox" data-scene-field="Requirements" hidden={embedded && sceneSection !== "Requirements"}><input type="checkbox" checked={audioRequired} onChange={event => setAudioRequired(event.target.checked)} /><span>Require attached audio to finish</span></label>}
      </div>
    </div>;
  const mediaContent = <div className="scene-editor-media" hidden={!embedded && panel !== "media"}>
      <h3>Media for {scene.title}</h3>
      <p className="field-hint">Create image, narration, or video requests for this scene using the same workflow as Media Library. Requests may incur provider charges. Review candidates before approving; approval does not attach media.</p>
      {mediaContextDirty && <div role="status"><p>Save your scene edits before requesting media so Pythia and the selected provider use the current scene context.</p><button type="button" className="button button-accent" disabled={busy || !title.trim() || !durationValid || Boolean((scene.sourceSlide || scene.previewImage) && !scene.visualLayout && !canvasEdited)} onClick={() => void save(false)}>Save scene for media</button></div>}
      <div hidden={mediaContextDirty}>
        <GeneratedMediaPanel project={project} scene={scene} busy={busy || mediaContextDirty} onProjectUpdated={onProjectUpdated} onEditScene={() => setPanel("canvas")} onBusyChange={setMediaWorking} />
        <fieldset className="scene-editor-placement" disabled={saving || mediaWorking || mediaContextDirty}>
          <MediaToolsPanel project={project} scene={scene} onProjectUpdated={onProjectUpdated} onBusyChange={setPlacementWorking} />
        </fieldset>
      </div>
    </div>;
  const toolbarContent = <div id={embedded ? "studio-stage-extra-tools" : undefined} className="visual-editor-toolbar" role="toolbar" aria-label="Stage content tools">
      <button type="button" className="button button-outline" data-tool-group="format" disabled={busy || sourceVisible} onClick={async () => {
        setBusy(true); setError("");
        try {
          const current = sceneTextDirty ? syncSceneText(layout, scene, title.trim(), screenText, generatedLayoutApplied) : layout;
          const fitted = await fitLayoutText(current, true);
          commit(fitted.layout);
          if (fitted.issues.length) setError(textFitMessage(fitted.issues));
        } catch (issue) { setError(issue instanceof Error ? issue.message : "Text could not be measured."); }
        finally { setBusy(false); }
      }}><Check size={16} />Fit text</button>
      <button type="button" className="icon-button" data-tool-group="preview" title="Preview animations" aria-label="Preview animations" disabled={busy || sourceVisible} onClick={() => {setTimelinePreview(false);setTimelinePlaying(false);setMotionPreview(current => current + 1);}}><Play size={18} /></button>
      {motionPreview > 0 && <button type="button" className="icon-button" data-tool-group="preview" title="Stop animation preview" aria-label="Stop animation preview" onClick={() => setMotionPreview(0)}><Square size={18} /></button>}
      <button type="button" className="icon-button" data-tool-group="format" title="Stagger text entrances" aria-label="Stagger text entrances" disabled={busy || sourceVisible} onClick={() => {
        let textIndex = 0;
        const currentLayout = sceneTextDirty ? syncSceneText(layout, scene, title.trim(), screenText, generatedLayoutApplied) : layout;
        commit({ ...currentLayout, elements: currentLayout.elements.map(element => {
          if (element.kind !== "text" || element.locked) return element;
          const animations = alignExitTiming({ ...(element.animations || defaultAnimations()), entrance: { effect: "bounce", durationMs: 600, delayMs: Math.min(3590000, textIndex++ * 150) } });
          return animations.exit.delayMs > 3600000 ? element : { ...element, animations };
        }) });
      }}><Sparkles size={18} /></button>
      <div className="visual-layer-insert" role="group" aria-label="Add layers">
      <button type="button" className="button button-outline" title="Add a text layer" aria-label="Add text layer" disabled={busy || sourceVisible} onClick={() => { const element = newElement("text"); commit({ ...layout, elements: [...layout.elements, element] }); setSelection(element.id); }}><Plus size={18} aria-hidden="true" />Text layer</button>
      <select aria-label="Insert shape" value="" disabled={busy || sourceVisible} onChange={event=>{if(!event.target.value)return;const shape=event.target.value as SceneElement['nativeShape'];const element=newElement("shape",{nativeShape:shape,shapeName:shape,name:shape||"Shape",appearance:defaultAppearance()});commit({...layout,elements:[...layout.elements,element]});setSelection(element.id);}}><option value="">Insert shape?</option>{["rectangle","rounded-rectangle","ellipse","line","arrow","triangle","diamond"].map(shape=><option key={shape} value={shape}>{shape}</option>)}</select>
      </div>
      <button type="button" className="icon-button" title="Undo (Ctrl+Z)" aria-label="Undo" aria-keyshortcuts="Control+Z Meta+Z" disabled={busy || cursor === 0} onClick={() => restoreHistory(cursor - 1)}><Undo2 size={18} /></button>
      <button type="button" className="icon-button" title="Redo (Ctrl+Shift+Z / Ctrl+Y)" aria-label="Redo" aria-keyshortcuts="Control+Shift+Z Meta+Shift+Z Control+Y" disabled={busy || cursor === history.length - 1} onClick={() => restoreHistory(cursor + 1)}><Redo2 size={18} /></button>
      <span className="visual-editor-dimensions">{Math.round(layout.width)} x {Math.round(layout.height)}</span>
      {scene.previewImage && scene.visualLayout && <button type="button" className="button button-outline" data-tool-group="preview" disabled={busy} aria-pressed={sourceVisible} onClick={() => { setMotionPreview(0); setSourceVisible(!sourceVisible); }}>{sourceVisible ? "Return to scene" : "Compare with original"}</button>}
      {!scene.visualLayout && scene.sourceSlide && project.hasSourceDeck && <button type="button" className="button button-outline" disabled={busy} onClick={() => void extract()}>Prepare editable scene</button>}
    </div>;
  const imageContent = <section className="visual-attached-images" aria-label="Stage image content"><h3>Content</h3><div>{images.filter(asset => scene.imageAssets.includes(asset.id)).map(asset => <button type="button" key={asset.id} title={assetLabel(asset)} aria-label={`Add ${assetLabel(asset)}`} draggable={!busy} disabled={busy || sourceVisible} onDragStart={event => event.dataTransfer.setData("application/x-chimera-image", asset.id)} onClick={() => addImage(asset.id)}><img src={`/api/projects/${project.id}/assets/${asset.id}`} alt={assetLabel(asset)} /></button>)}</div><div className="visual-library-picker"><select aria-label="Image from media library" value={imageId} onChange={event => setImageId(event.target.value)}><option value="">Media library</option>{images.map(asset => <option key={asset.id} value={asset.id}>{assetLabel(asset)}</option>)}</select><button type="button" className="icon-button" title="Add selected image" aria-label="Add selected image" disabled={!imageId || busy || sourceVisible} onClick={() => addImage(imageId)}><ImagePlus size={18} /></button></div></section>;
  const content = <>
    {scene.experience && <p role="status">This scene delivers a native experience instead of the underlying canvas. To edit its diagram, reveals and activities, close this editor and select Design experience. Canvas edits here are retained but are not the learner-facing stage.</p>}
    <header className="visual-editor-header"><div><p className="eyebrow">SCENE EDITOR</p><h2 id="visual-editor-title">{title || scene.title}</h2></div>{embedded ? dirty && <button type="button" className="button button-accent scene-save-button" disabled={saveDisabled} onClick={() => void save()}><Check size={14}/>{saving ? "Saving…" : "Save scene"}</button> : <button type="button" className="icon-button" aria-label="Close scene editor" disabled={busy} onClick={cancelEditing}><X size={18} /></button>}</header>
    {embedded && <div className="scene-menu-bar" data-scene-menubar role="toolbar" aria-label="Scene menus" onKeyDown={event => {
      if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
      const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')).filter(button => !button.closest('.editor-menu-popup'));
      const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
      event.preventDefault(); buttons[(index + (event.key === "ArrowRight" ? 1 : buttons.length - 1)) % buttons.length]?.focus();
    }}>
      <button type="button" className="icon-button" title="Undo" aria-label="Undo canvas edit" disabled={busy || cursor === 0} onClick={() => restoreHistory(cursor - 1)}><Undo2 size={17}/></button>
      <button type="button" className="icon-button" title="Redo" aria-label="Redo canvas edit" disabled={busy || cursor === history.length - 1} onClick={() => restoreHistory(cursor + 1)}><Redo2 size={17}/></button>
      <EditorDropdown label="Scene" disabled={busy} commands={[
        {label:"Properties…",action:()=>sceneInspector("Identity")},
        {label:"Canvas size…",action:()=>openInspector("Stage")},
        {label:"Apply template…",action:()=>sceneInspector("Template")},
        {label:"Narration and notes…",action:()=>sceneInspector("Notes")},
        {label:"Scene requirements…",action:()=>sceneInspector("Requirements")},
        {label:"On-screen content…",action:()=>sceneInspector("Content")},
        {label:sourceVisible?"Return to scene":"Compare with original",disabled:!scene.previewImage,action:()=>{setMotionPreview(0);setSourceVisible(!sourceVisible);}},
        ...(canGenerate?[{label:"AI scene draft…",action:()=>sceneInspector("AI")}]:[]),
        ...(dirty?[{label:"Save scene",action:()=>void save(),disabled:saveDisabled}]:[]),
      ]}/>
      <EditorDropdown label="Insert" disabled={busy || sourceVisible} commands={[
        {label:"Text",action:insertText},{label:"Shapes…",action:()=>openInspector("Shapes")},
        {label:"Image…",action:()=>openInspector("Insert image")},
        {label:"Audio or video…",action:()=>{ const node=editorRoot.current?.querySelector<HTMLDetailsElement>(".scene-timeline");if(node){node.open=true;node.scrollIntoView({block:"nearest"});node.querySelector<HTMLSelectElement>('[aria-label="Timeline media"]')?.focus();} }},
        {label:"Learner activity…",action:()=>openInspector("Learner activities")},
        {label:scene.assessmentItem?"Edit scored question…":"Scored question…",disabled:!onQuestion,action:()=>scene.assessmentItem?onQuestion?.(scene.assessmentItem.type):openInspector("Scored questions")},
        {label:"HTML5 activity…",disabled:!onHTML5,action:()=>onHTML5?.()},
        {label:"Scene media…",action:()=>openInspector("Scene media")},
        ...(["rectangle","rounded-rectangle","ellipse","line","arrow","triangle","diamond"] as const).map(shape=>({label:shape==="rounded-rectangle"?"Rounded rectangle":shape[0].toUpperCase()+shape.slice(1),action:()=>insertShape(shape)})),
      ]}/>
      <EditorDropdown label="Format" disabled={busy || sourceVisible} commands={[
        {label:"Object properties…",action:()=>openInspector("Properties"),disabled:!selected},
        {label:"Text and geometry…",action:()=>openInspector("Layout"),disabled:!selected},
        {label:"Bold",action:()=>update({bold:!selected?.bold}),disabled:!selected||selected.kind!=="text"||selected.locked},
        {label:"Italic",action:()=>update({italic:!selected?.italic}),disabled:!selected||selected.kind!=="text"||selected.locked},
        {label:"Fit text",action:()=>void fitText()},
        {label:"Style…",action:()=>openInspector("Appearance"),disabled:!selected},
        ...(["shadow","bevel","emboss"] as const).map(effect=>({label:effect==="shadow"?"Drop shadow":effect[0].toUpperCase()+effect.slice(1),action:()=>applySurfaceEffect(effect),disabled:!selected||selected.locked})),
        {label:"Reset crop",action:()=>update({crop:[0,0,0,0]}),disabled:!selected||selected.kind!=="image"||selected.locked},
      ]}/>
      <EditorDropdown label="Animate" disabled={busy || sourceVisible} commands={[
        {label:"Motion inspector…",action:()=>openInspector("Animation"),disabled:!selected},
        ...(["fade","slide-up","slide-left","zoom","bounce"] as const).map(effect=>({label:({fade:"Fade in","slide-up":"Slide up","slide-left":"Slide from left",zoom:"Zoom in",bounce:"Bounce into place"})[effect],action:()=>applyMotion("entrance",effect),disabled:!animationTargets.length})),
        ...(["pulse","sway","highlight"] as const).map(effect=>({label:effect[0].toUpperCase()+effect.slice(1),action:()=>applyMotion("presentation",effect),disabled:!animationTargets.length})),
        {label:"Fade out",action:()=>applyMotion("exit","fade"),disabled:!animationTargets.length},
        {label:"Stagger text entrances",action:()=>{let index=0;commit({...layout,elements:layout.elements.map(element=>element.kind==="text"&&!element.locked?{...element,animations:alignExitTiming({...element.animations||defaultAnimations(),entrance:{effect:"bounce",durationMs:600,delayMs:Math.min(3590000,index++*150)}})}:element)});}},
        {label:"Replay animations",action:()=>{setTimelinePreview(false);setTimelinePlaying(false);setMotionPreview(value=>value+1);}},
        {label:"Stop animation preview",action:()=>setMotionPreview(0),disabled:motionPreview===0},
        {label:"Remove animations",action:()=>commit({...layout,elements:layout.elements.map(element=>animationTargets.some(target=>target.id===element.id)?{...element,animations:null}:element)}),disabled:!animationTargets.length},
      ]}/>
      <EditorDropdown label="Layers" disabled={busy || sourceVisible} commands={[
        {label:"Layer list and arrangement…",action:()=>openInspector("Layers")},
        {label:"Scene background…",action:()=>openInspector("Background")},
        {label:"Bring forward",action:()=>reorder(1),disabled:!selected||selected.locked},
        {label:"Send backward",action:()=>reorder(-1),disabled:!selected||selected.locked},
        ...([["x","start","Align left"],["x","center","Center horizontally"],["x","end","Align right"],["y","start","Align top"],["y","center","Center vertically"],["y","end","Align bottom"]] as const).map(([axis,edge,label])=>({label,action:()=>alignToStage(axis,edge),disabled:!selected||selected.locked})),
        {label:"Distribute horizontally",action:()=>distribute("x"),disabled:multiSelection.length<3},
        {label:"Distribute vertically",action:()=>distribute("y"),disabled:multiSelection.length<3},
        {label:selected?.locked?"Unlock":"Lock",action:()=>update({locked:!selected?.locked}),disabled:!selected},
        {label:selected?.hidden?"Show in delivery":"Hide in delivery",action:()=>update({hidden:!selected?.hidden}),disabled:!selected||selected.locked},
        {label:"Duplicate",action:()=>{if(!selected)return;const element={...selected,id:crypto.randomUUID(),x:selected.x+20,y:selected.y+20};commit({...layout,elements:[...layout.elements,element]});setSelection(element.id);},disabled:!selected||selected.locked},
        {label:"Delete",action:()=>{if(!selected)return;commit({...layout,elements:layout.elements.filter(element=>element.id!==selected.id)});setSelection(null);},disabled:!selected||selected.locked},
      ]}/>
      <EditorDropdown label="View" disabled={busy} commands={[
        {label:"Properties inspector",action:()=>openInspector("Properties")},
        {label:"Style inspector",action:()=>openInspector("Appearance")},
        {label:"Motion inspector",action:()=>openInspector("Animation")},
        {label:"Layers inspector",action:()=>openInspector("Layers")},
        {label:"Timeline and layers",action:timelineAction},
        {label:navigatorHidden?"Show scene navigator":"Hide scene navigator",action:()=>setNavigatorHidden(!navigatorHidden)},
        {label:"Close inspectors",action:()=>{setInspectors([]);setPinnedInspectors([]);}},
        {label:"Restore panel layout",action:()=>{setPanelReset(value=>value+1);setNavigatorHidden(false);}},
      ]}/>
      <EditorDropdown label="Preview" disabled={busy} commands={[
        { label: "This scene", action: () => onScenePreview?.(), disabled: !onScenePreview },
        { label: "Whole experience", action: () => onLearnerPreview?.(), disabled: !onLearnerPreview },
      ]}/>
    </div>}
    {embedded && <div className="scene-selection-tools" role="toolbar" aria-label="Selected object tools">{selected && <><span>{multiSelection.length>1?`${multiSelection.length} objects`:selected.kind}</span>{selected.kind==="text"&&<><button type="button" disabled={busy||selected.locked||sourceVisible} aria-pressed={selected.bold} onClick={()=>update({bold:!selected.bold})}><b>Bold</b></button><button type="button" disabled={busy||selected.locked||sourceVisible} aria-pressed={selected.italic} onClick={()=>update({italic:!selected.italic})}><i>Italic</i></button></>}<button type="button" onClick={()=>openInspector("Properties")}>Properties</button><button type="button" onClick={()=>openInspector("Appearance")}>Style</button><button type="button" onClick={()=>openInspector("Animation")}>Animate</button></>}</div>}
    {!embedded && <div className="visual-editor-tabs" role="tablist" aria-label="Scene editor sections">
      <button type="button" role="tab" aria-selected={panel === "canvas"} onClick={() => setPanel("canvas")}>Stage</button>
      <button type="button" role="tab" aria-selected={panel === "details"} onClick={() => setPanel("details")}>Details</button>
      <button type="button" role="tab" aria-selected={panel === "media"} onClick={() => { setMediaVisited(true); setPanel("media"); setTimelinePlaying(false); setMotionPreview(0); }}>Media</button>
    </div>}
    {mediaVisited && !embedded && mediaContent}

    {!embedded && panel === "canvas" && toolbarContent}

    {panel === "canvas" && sourceVisible && <p className="field-hint" role="status">Original slide reference. Comparing does not change your scene, preview, or exports.</p>}
    {generatedLayoutApplied && panel === "canvas" && <p className="scene-draft-unsaved" role="status">Generated scene layout · not saved</p>}
    {error && <p className="visual-editor-error" role="alert">{error}</p>}
    {panel === "canvas" && layout.warnings.length > 0 && <details className="visual-editor-warnings"><summary>{layout.warnings.length} import limitations</summary><ul>{layout.warnings.map(warning => <li key={warning}>{warning}</li>)}</ul></details>}
    {!embedded && panel === "details" && detailsContent}

    {(panel === "canvas" || embedded) ? <div className="visual-editor-workspace">
      <div className="visual-editor-canvas" onClick={event => { if (event.target instanceof HTMLElement && (event.target === event.currentTarget || event.target.classList.contains("visual-stage") || event.target.classList.contains("visual-stage-frame"))) setSelection(null); }} onDragOver={event => { if (event.dataTransfer.types.includes("application/x-chimera-image")) event.preventDefault(); }} onDrop={event => { event.preventDefault(); if (sourceVisible || busy) return; const frame = event.currentTarget.querySelector(".visual-stage-frame")?.getBoundingClientRect(); if (frame) addImage(event.dataTransfer.getData("application/x-chimera-image"), (event.clientX - frame.left) * layout.width / frame.width, (event.clientY - frame.top) * layout.height / frame.height); }}>
        {layout.timeline && timelinePreview && !sourceVisible ? <SceneSurface project={project} scene={{...scene,title,sceneType,assessmentItem,visualLayout:stageLayout}} timeMs={timelineTime} playing={timelinePlaying} onTime={setTimelineTime} onPlaying={setTimelinePlaying} audition={audition}/> : motionPreview > 0 ? <SceneSurface key={motionPreview} project={project} scene={{ ...scene, title, sceneType, assessmentItem, visualLayout: { ...(sceneTextDirty ? syncSceneText(layout, scene, title.trim(), screenText, generatedLayoutApplied) : layout), enabled: true } }} animate /> : sourceVisible ? scene.previewImage ? <img className="visual-source" src={`/api/projects/${project.id}/${scene.previewImage}`} alt={`Source slide ${scene.sourceSlide}`} /> : <p role="status">The original slide image is unavailable. Restore the retained source to prepare this scene.</p> : <ScaledStage layout={stageLayout} projectId={project.id}>{scale => <>{visibleSceneElements(stageLayout, title, Boolean(sceneType === "question" && assessmentItem)).map((element, index) => <Rnd key={element.id} scale={scale} position={{ x: element.x, y: element.y }} size={{ width: element.width, height: element.height }} lockAspectRatio={element.aspectLocked ?? false} resizeHandleClasses={{ bottomRight: "visual-resize-handle-se" }} disableDragging={busy || element.locked || editingText === element.id} enableResizing={multiSelection.includes(element.id) && !busy && !element.locked && editingText !== element.id} minWidth={20} minHeight={20} style={{ zIndex: index*2+1 }} onDragStart={event => { if (event.ctrlKey || event.metaKey) return false; if (!multiSelection.includes(element.id)) setSelection(element.id); }} onDragStop={(_, data) => {if(Math.abs(data.x-element.x)>.01||Math.abs(data.y-element.y)>.01)moveElement(element.id,data.x,data.y);}} onResizeStart={() => setFocusedElement(element.id)} onResizeStop={(_, __, reference, ___, position) => commit({ ...layout, elements: layout.elements.map(item => item.id === element.id ? { ...item, ...position, width: parseFloat(reference.style.width), height: parseFloat(reference.style.height) } : item) })}>
          <div role={editingText === element.id ? undefined : "button"} tabIndex={editingText === element.id ? undefined : 0} aria-label={`${element.kind === "text" ? element.text.slice(0, 50) || "Empty text" : element.name || element.shapeName || "Image"} element`} aria-pressed={editingText === element.id ? undefined : multiSelection.includes(element.id)} className={`visual-element visual-editable ${(multiSelection.includes(element.id)) ? "is-selected" : ""}`} style={{ transform: `rotate(${element.rotation}deg)` }} onFocus={event => { if (event.currentTarget.matches(":focus-visible") && !multiSelection.includes(element.id)) setSelection(element.id); }} onClick={event => selectObject(element.id, event.ctrlKey || event.metaKey)} onDoubleClick={() => { setSelection(element.id); if (element.kind === "text" && !element.locked && !busy) setEditingText(element.id); }} onKeyDown={event => { if (event.target instanceof HTMLTextAreaElement || !["Enter", " ", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return; if ((event.key === " " || event.key === "Enter") && (event.ctrlKey || event.metaKey)) { event.preventDefault(); selectObject(element.id, true); return; } if (!multiSelection.includes(element.id)) setSelection(element.id); if (element.locked || busy) return; if (event.key === "Enter" && element.kind === "text") { event.preventDefault(); setEditingText(element.id); return; } const step = event.shiftKey ? 10 : 1; const moves: Record<string, {x:number;y:number}> = {ArrowLeft:{x:-step,y:0},ArrowRight:{x:step,y:0},ArrowUp:{x:0,y:-step},ArrowDown:{x:0,y:step}}; if (moves[event.key]) { event.preventDefault(); moveElement(element.id,element.x+moves[event.key].x,element.y+moves[event.key].y); } }}>{editingText === element.id ? <textarea autoFocus aria-label="Edit canvas text" className="visual-inline-text" value={element.text} maxLength={50000} style={{fontSize:element.fontSize,fontFamily:element.fontFamily,color:"#202020",backgroundColor:"#fff"}} onChange={event => commit({...layout,elements:layout.elements.map(item => item.id === element.id ? {...item,text:event.target.value} : item)})} onBlur={() => setEditingText(null)} onKeyDown={event => { if(event.key === "Escape") { event.stopPropagation(); setEditingText(null); } }} /> : <ElementContent element={element} project={project} scene={scene} />}</div>
        </Rnd>)}{sceneType === "question" && assessmentItem && <Rnd scale={scale} bounds="parent" position={{ x: questionRegion.x, y: questionRegion.y }} size={{ width: questionRegion.width, height: questionRegion.height }} minWidth={120} minHeight={80} disableDragging={busy} enableResizing={!busy && selection === "assessment-region"} onMouseDown={() => setSelection("assessment-region")} style={{ zIndex: 2001 }} onDragStop={(_, data) => commit({ ...layout, assessmentRegion: { ...questionRegion, x: data.x, y: data.y } })} onResizeStop={(_, __, reference, ___, position) => commit({ ...layout, assessmentRegion: { ...position, width: parseFloat(reference.style.width), height: parseFloat(reference.style.height) } })}>
          <div className="assessment-stage-region" aria-label="Assessment component" style={{ inset: 0, width: "100%", height: "100%" }}><AssessmentStageContent item={assessmentItem} /></div>
        </Rnd>}</>}</ScaledStage>}
        {!embedded && imageContent}

        {<SceneTimeline initiallyOpen={!embedded} layout={layout} project={project} commit={commit} selection={selection} select={setSelection} time={timelineTime} setTime={setTimelineTime} playing={timelinePlaying} setPlaying={setTimelinePlaying} preview={timelinePreview} setPreview={setTimelinePreview} disabled={busy || sourceVisible} audition={audition} onAudition={setAudition} onDurationValidityChange={setDurationValid}/>}
      </div>
      {!embedded && renderInspector()}
      {embedded && inspectors.map((name,index)=><FloatingInspector key={name} title={({Appearance:"Style",Animation:"Motion",Stage:"Canvas size"} as Record<string,string>)[name] || name} index={index} reset={panelReset} pinned={pinnedInspectors.includes(name)} onPin={()=>setPinnedInspectors(previous=>previous.includes(name)?previous.filter(item=>item!==name):[...previous,name])} onClose={()=>closeInspector(name)}>
        {name==="Scene properties"?detailsContent:name==="Insert image"?imageContent:name==="Scene media"?mediaContent:name==="Shapes"?<div className="effect-gallery" role="group" aria-label="Shapes">{(["rectangle","rounded-rectangle","ellipse","line","arrow","triangle","diamond"] as const).map(shape=><button type="button" key={shape} disabled={busy||sourceVisible} onClick={()=>insertShape(shape)}>{shape.replaceAll("-"," ")}</button>)}</div>:name==="Learner activities"?<><p>Practice with feedback. Scored questions use the separate question editor.</p><div className="activity-gallery">{[["flow","Concept flow"],["reveals","Click-reveal"],["branching","Branching decisions"],["hotspots","Hotspots"],["sequencing","Sequencing"],["guided-practice","Guided practice"],["software-walkthrough","Software walkthrough"],["before-after","Before/after comparison"],["external-link","External launch link"],["learner-conversation","Scripted conversation"]].map(([kind,label])=><button type="button" key={kind} disabled={!onActivity || Boolean(scene.assessmentItem||scene.html5Activity||scene.visualLayout?.timeline)} onClick={()=>onActivity?.(kind)}>{label}<small>Open the learner activity editor</small></button>)}</div>{Boolean(scene.assessmentItem||scene.html5Activity||scene.visualLayout?.timeline)&&<p role="status">This scene has a timeline, assessment or HTML5 activity. Use a separate scene for learner activities.</p>}</>:name==="Scored questions"?<div className="activity-gallery">{[["single-choice","Single choice"],["multiple-response","Multiple response"],["true-false","True / false"],["ordering","Ordering"],["matching","Matching"],["drag-drop","Drag and drop"],["short-answer","Short answer"]].map(([type,label])=><button type="button" key={type} disabled={Boolean(scene.experience||scene.html5Activity)} onClick={()=>onQuestion?.(type)}>{label}</button>)}{Boolean(scene.experience||scene.html5Activity)&&<p role="status">Use a separate scene for a scored question. Existing activities are preserved.</p>}</div>:name==="Properties"?<>{renderInspector("Properties")}<button type="button" onClick={()=>openInspector("Layout")}>Text and geometry…</button></>:renderInspector(name)}
      </FloatingInspector>)}
    </div> : null}
    {!embedded && <footer className="modal-actions"><button type="button" className="button button-outline" disabled={busy} onClick={cancelEditing}>Cancel</button><button type="button" className="button button-accent" disabled={busy || !title.trim() || Boolean((scene.sourceSlide || scene.previewImage) && !scene.visualLayout && !canvasEdited) || layoutMode === "template" && !templateId} onClick={() => void save()}><Check size={16} />{busy ? "Saving" : "Save scene"}</button></footer>}
  </>;
  return <ProjectPalette key={project.id} projectId={project.id} value={{project,layout}}>{embedded ? <section ref={editorRoot} data-scene-menu={menu || ""} data-has-selection={Boolean(selected)} data-dirty={dirty} data-scene-id={scene.id} className="visual-editor studio-inline-editor scene-compact" aria-labelledby="visual-editor-title" data-onboarding="scene.edit">{content}</section> : <EditorDialog className="visual-editor" labelledBy="visual-editor-title" busy={busy} onClose={cancelEditing} onboardingTarget="scene.edit" onboardingJourney={panel === "canvas" ? "canvas" : "edit-scene"}>{content}</EditorDialog>}</ProjectPalette>;
}
