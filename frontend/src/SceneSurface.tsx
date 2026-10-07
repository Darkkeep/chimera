import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { Project, Scene } from "./App";
import "./visual-scene.css";

export type SceneElement = { id: string; kind: "text" | "image"; x: number; y: number; width: number; height: number; rotation: number; text: string; assetId: string | null; fontSize: number; fontFamily: string; color: string; bold: boolean; italic: boolean; align: "left" | "center" | "right"; crop: number[]; source: "slide" | "layout" | "master" | "manual"; locked: boolean };
export type SceneLayout = { version: 1; enabled: boolean; width: number; height: number; backgroundColor: string; backgroundAsset: string | null; elements: SceneElement[]; warnings: string[] };

export function newElement(kind: "text" | "image", changes: Partial<SceneElement> = {}): SceneElement {
  return { id: crypto.randomUUID(), kind, x: 40, y: 40, width: kind === "text" ? 400 : 240, height: kind === "text" ? 100 : 180, rotation: 0, text: kind === "text" ? "New text" : "", assetId: null, fontSize: 28, fontFamily: "sans-serif", color: "#202020", bold: false, italic: false, align: "left", crop: [0, 0, 0, 0], source: "manual", locked: false, ...changes };
}

export function initialLayout(scene: Scene): SceneLayout {
  return scene.visualLayout ? structuredClone(scene.visualLayout) : { version: 1, enabled: false, width: 1280, height: 720, backgroundColor: "#ffffff", backgroundAsset: scene.backgroundAsset ?? null, warnings: [], elements: [scene.title, ...scene.extractedText].filter(Boolean).map((text, index) => newElement("text", { text, x: 60, y: 40 + index * 110, width: 1160, height: 100, fontSize: index ? 28 : 40 })) };
}

export function ElementContent({ element, project, scene }: { element: SceneElement; project: Project; scene: Scene }) {
  if (element.kind === "text") return <div className="visual-text" style={{ fontSize: element.fontSize, fontFamily: element.fontFamily, color: element.color, fontWeight: element.bold ? 700 : 400, fontStyle: element.italic ? "italic" : "normal", textAlign: element.align }}>{element.text}</div>;
  const asset = project.storyboard.assets.find(item => item.id === element.assetId);
  const [left, top, right, bottom] = element.crop;
  return <div className="visual-image"><img draggable={false} src={`/api/projects/${project.id}/assets/${element.assetId}`} alt={scene.decorativeImages.includes(element.assetId || "") ? "" : scene.imageAltText[element.assetId || ""] || asset?.filename || "Scene image"} style={{ width: `${100 / (1 - left - right)}%`, height: `${100 / (1 - top - bottom)}%`, left: `${-left * 100 / (1 - left - right)}%`, top: `${-top * 100 / (1 - top - bottom)}%` }} /></div>;
}

export function ScaledStage({ layout, projectId, children }: { layout: SceneLayout; projectId: string; children: (scale: number) => ReactNode }) {
  const container = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const observer = new ResizeObserver(entries => setWidth(entries[0].contentRect.width));
    if (container.current) observer.observe(container.current);
    return () => observer.disconnect();
  }, []);
  const scale = width ? width / layout.width : 1;
  return <div ref={container} className="visual-stage-frame" style={{ aspectRatio: `${layout.width} / ${layout.height}` }}><div className="visual-stage" style={{ width: layout.width, height: layout.height, transform: `scale(${scale})`, backgroundColor: layout.backgroundColor, backgroundImage: layout.backgroundAsset ? `url(/api/projects/${projectId}/assets/${layout.backgroundAsset})` : undefined }}>{children(scale)}</div></div>;
}

export function SceneSurface({ project, scene }: { project: Project; scene: Scene }) {
  const layout = scene.visualLayout;
  if (!layout) return null;
  return <ScaledStage layout={layout} projectId={project.id}>{() => layout.elements.map(element => <div key={element.id} className="visual-element" style={{ position: "absolute", left: element.x, top: element.y, width: element.width, height: element.height, transform: `rotate(${element.rotation}deg)` }}><ElementContent element={element} project={project} scene={scene} /></div>)}</ScaledStage>;
}