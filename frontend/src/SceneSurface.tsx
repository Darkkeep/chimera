import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { Project, Scene } from "./App";
import "./visual-scene.css";
import { AssessmentStageContent } from "./AssessmentStageContent";
import "./assessment-stage.css";
import "../../backend/app/static/assessment-surface.css";
import { playStageAnimations } from "../../backend/app/static/stage-animations.js";
import { shapeMarkup, appearanceStyle } from "../../backend/app/static/scene-appearance.js";
import type { Appearance, Timing, Timeline } from "./scene-timeline";
import { TimelinePlayback } from "./TimelinePlayback";
import type { ClipProgress } from "../../backend/app/static/scene-transport.js";
import { effectiveBackgroundAsset } from "./background";

export type AnimationStep = { effect: string; durationMs: number; delayMs: number; iterations?: number };
export type ElementAnimations = { entrance: AnimationStep; presentation: AnimationStep; exit: AnimationStep };

export type SceneElement = { id: string; kind: "text" | "image" | "shape"; x: number; y: number; width: number; height: number; rotation: number; text: string; assetId: string | null; fontSize: number; fontFamily: string; color: string; bold: boolean; italic: boolean; align: "left" | "center" | "right"; crop: number[]; shapeSvg: string | null; shapeName: string | null; source: "slide" | "layout" | "master" | "manual"; locked: boolean; animations?: ElementAnimations | null; name?: string; nativeShape?: "rectangle" | "rounded-rectangle" | "ellipse" | "line" | "arrow" | "triangle" | "diamond" | null; appearance?: Appearance | null; timing?: Timing | null; groupId?: string | null; hidden?: boolean; aspectLocked?:boolean|null };
export type AssessmentRegion = { x: number; y: number; width: number; height: number };
export type SceneLayout = { version: 1; enabled: boolean; width: number; height: number; backgroundColor: string; backgroundAsset: string | null; sourceBackgroundAsset?: string | null; backgroundMode?: "inherit" | "image" | "none" | null; elements: SceneElement[]; warnings: string[]; assessmentRegion?: AssessmentRegion | null; timeline?: Timeline | null };

export function assessmentRegion(layout: SceneLayout, title?: string): AssessmentRegion {
  const heading = layout.elements.find(element => element.kind === "text" && element.text.trim() === title?.trim());
  const x = Math.max(0, Math.min(heading?.x ?? layout.width * 0.05, layout.width * 0.9));
  const y = Math.max(0, Math.min(heading?.y ?? layout.height * 0.05, layout.height * 0.9));
  return layout.assessmentRegion || { x, y, width: Math.min(heading?.width ?? layout.width * 0.9, layout.width - x - layout.width * 0.05), height: Math.max(1, Math.min(layout.height * 0.7, layout.height - y - layout.height * 0.05)) };
}

export function visibleSceneElements(layout: SceneLayout, title: string, hasAssessment: boolean) {
  return layout.elements.filter(element => !element.hidden && !(hasAssessment && element.kind === "text" && element.text.trim() === title.trim()));
}

export function newElement(kind: "text" | "image" | "shape", changes: Partial<SceneElement> = {}): SceneElement {
  return { id: crypto.randomUUID(), kind, x: 40, y: 40, width: kind === "text" ? 400 : 240, height: kind === "text" ? 100 : 180, rotation: 0, text: kind === "text" ? "New text" : "", assetId: null, fontSize: 28, fontFamily: "sans-serif", color: "#202020", bold: false, italic: false, align: "left", crop: [0, 0, 0, 0], shapeSvg: null, shapeName: null, source: "manual", locked: false, ...changes };
}

export function initialLayout(scene: Scene): SceneLayout {
  const lines = [scene.title, ...scene.extractedText].filter(text => text.trim());
  return scene.visualLayout ? structuredClone(scene.visualLayout) : { version: 1, enabled: true, width: 1280, height: Math.min(10000, Math.max(720, 170 + lines.length * 96)), backgroundColor: "#ffffff", backgroundAsset: scene.backgroundAsset ?? null, backgroundMode: scene.backgroundAsset ? "image" : "inherit", warnings: [], elements: lines.map((text, index) => newElement("text", { id: `native-text-${index}`, text, x: 72, y: 80 + index * 96, width: 1136, height: 80, fontSize: index ? 28 : 40, fontFamily: "Aptos" })) };
}

export function resolvedSceneBackground(project: Project, scene: Scene): Scene {
  const backgroundAsset = effectiveBackgroundAsset(project, scene);
  const layout = scene.visualLayout || ((!scene.sourceSlide && !scene.previewImage || scene.assessmentItem) ? initialLayout(scene) : null);
  const masterBackground = project.storyboard.assets.some(asset => asset.id === backgroundAsset && asset.role === "background");
  return { ...scene, backgroundAsset, visualLayout: layout ? {
    ...layout, backgroundAsset, backgroundMode: backgroundAsset ? "image" : "none",
    elements: masterBackground ? layout.elements.filter(element => element.source !== "master") : layout.elements,
    enabled: true,
  } : null };
}

function RawElementContent({ element, project, scene }: { element: SceneElement; project: Project; scene: Scene }) {
  if (element.kind === "text") return <div className="visual-text" style={{ fontSize: element.fontSize, fontFamily: element.fontFamily, color: element.appearance ? `${element.color}${Math.round(element.appearance.fillOpacity*255).toString(16).padStart(2,"0")}` : element.color, fontWeight: element.bold ? 700 : 400, fontStyle: element.italic ? "italic" : "normal", textAlign: element.align }}>{element.text}</div>;
  if (element.kind === "shape") return <img className="visual-shape" src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(element.nativeShape ? shapeMarkup(element) : element.shapeSvg || "")}`} alt="" aria-hidden="true" draggable={false} />;
  const asset = project.storyboard.assets.find(item => item.id === element.assetId);
  const [left, top, right, bottom] = element.crop;
  return <div className="visual-image"><img draggable={false} src={`/api/projects/${project.id}/assets/${element.assetId}`} alt={scene.decorativeImages.includes(element.assetId || "") ? "" : scene.imageAltText[element.assetId || ""] || asset?.filename || "Scene image"} style={{ width: `${100 / (1 - left - right)}%`, height: `${100 / (1 - top - bottom)}%`, left: `${-left * 100 / (1 - left - right)}%`, top: `${-top * 100 / (1 - top - bottom)}%` }} /></div>;
}

export function ElementContent(props: { element: SceneElement; project: Project; scene: Scene }) {
  return <div style={{width:"100%",height:"100%",...appearanceStyle(props.element)}}><RawElementContent {...props} /></div>;
}

export function ScaledStage({ layout, projectId, children, assessment }: { layout: SceneLayout; projectId: string; children: (scale: number) => ReactNode; assessment?: ReactNode }) {
  const container = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const observer = new ResizeObserver(entries => setWidth(entries[0].contentRect.width));
    if (container.current) observer.observe(container.current);
    return () => observer.disconnect();
  }, []);
  const scale = width ? width / layout.width : 1;
  return <div ref={container} className={`visual-stage-frame ${assessment ? "assessment-stage-frame" : ""}`} style={{ aspectRatio: `${layout.width} / ${layout.height}` }}><div className="visual-stage" style={{ width: layout.width, height: layout.height, transform: `scale(${scale})`, backgroundColor: layout.backgroundColor, backgroundImage: layout.backgroundAsset ? `url(/api/projects/${projectId}/assets/${layout.backgroundAsset})` : undefined }}>{children(scale)}</div>{assessment}</div>;
}

export function SceneSurface({ project, scene, assessment, animate = false, timeMs, playing, onTime, onPlaying, progress, onProgress, audition }: { project: Project; scene: Scene; assessment?: ReactNode; animate?: boolean; timeMs?:number; playing?:boolean; onTime?:(n:number)=>void; onPlaying?:(b:boolean)=>void; progress?:Record<string,ClipProgress>; onProgress?:(id:string,p:ClipProgress)=>void;audition?:{muted:string[];solo:string|null} }) {
  const animationRoot = useRef<HTMLDivElement>(null);
  const animationSignature = JSON.stringify(scene.visualLayout?.elements.map(element => ({ id: element.id, animations: element.animations })) || []);
  useEffect(() => {
    if (scene.visualLayout?.timeline || !animate || !animationRoot.current) return;
    return playStageAnimations(animationRoot.current, JSON.parse(animationSignature));
  }, [scene.id, animate, animationSignature]);
  const resolved = resolvedSceneBackground(project, scene);
  const layout = scene.assessmentItem ? initialLayout(resolved) : resolved.visualLayout;
  if (!layout) return null;
  const region = assessmentRegion(scene.visualLayout || layout, scene.title);
  const question = scene.assessmentItem ? <div className="assessment-stage-region" style={{ left: `${region.x / layout.width * 100}%`, marginTop: `${region.y / layout.width * 100}%`, width: `${region.width / layout.width * 100}%` }}>{assessment ?? <AssessmentStageContent item={scene.assessmentItem} />}</div> : undefined;
  const elements = visibleSceneElements(layout, scene.title, Boolean(scene.assessmentItem));
  return <div ref={animationRoot}><ScaledStage layout={layout} projectId={project.id} assessment={question}>{() => elements.map(element => <div key={element.id} data-scene-element={element.id} aria-hidden={layout.timeline && element.timing && element.kind==="text" ? true : undefined} className="visual-element" style={{ position: "absolute", left: element.x, top: element.y, width: element.width, height: element.height, transform: `rotate(${element.rotation}deg)`, zIndex:layout.elements.indexOf(element)*2+1 }}><ElementContent element={element} project={project} scene={scene} /></div>)}</ScaledStage>{layout.timeline && <div className="sr-only">{elements.filter(e=>e.kind==="text"&&e.timing).map(e=><p key={e.id}>{e.text}</p>)}</div>}{layout.timeline && <TimelinePlayback root={animationRoot} project={project} scene={{...scene,visualLayout:layout}} controlledTime={timeMs} playing={playing} onTime={onTime} onPlaying={onPlaying} progress={progress} onProgress={onProgress} audition={audition}/>}</div>;
}
