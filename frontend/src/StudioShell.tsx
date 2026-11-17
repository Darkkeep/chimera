import { useState } from "react";
import type { ReactNode } from "react";
import { BookOpen, ChevronDown, ChevronRight, ClipboardCheck, Download, Layers3, Maximize2, Pencil, Play, Plus, Sparkles, X } from "lucide-react";
import type { Project, Scene } from "./App";
import { SceneSurface, resolvedSceneBackground } from "./SceneSurface";
import { PythiaTalkPanel } from "./PythiaTalkPanel";
import "./studio-shell.css";

type StudioShellProps = {
  project: Project;
  selectedScene: number;
  busy: boolean;
  canEdit: boolean;
  canEnhance: boolean;
  onSelectScene: (index: number) => void;
  onCreateScene: () => void;
  onEditScene: (scene: Scene) => void;
  onEditQuestion: () => void;
  onDesignExperience: () => void;
  onOpenSources: () => void;
  onOpenMedia: () => void;
  onPreview: () => void;
  onValidate: () => void;
  onExport: () => void;
  onProjectUpdated: (project: Project) => void;
  editor?: ReactNode;
  editingSceneId?: string | null;
};

export function StudioShell({
  project, selectedScene, busy, canEdit, canEnhance, onSelectScene, onCreateScene, onEditScene,
  onEditQuestion, onDesignExperience, onOpenSources, onOpenMedia, onPreview, onValidate, onExport, onProjectUpdated,
  editor, editingSceneId,
}: StudioShellProps) {
  const [pythiaOpen, setPythiaOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(true);
  const [timelineOpen, setTimelineOpen] = useState(false);
  const scenes = project.storyboard.scenes;
  const scene = scenes[selectedScene];
  const stageScene = scene ? resolvedSceneBackground(project, scene) : null;
  const previewReady = Boolean(stageScene && (stageScene.visualLayout || stageScene.experience || stageScene.html5Activity || stageScene.assessmentItem));
  const inlineEditing = Boolean(editor && scene?.id === editingSceneId);
  const nativeBlocked = Boolean(scene?.assessmentItem || scene?.html5Activity || scene?.visualLayout?.timeline);

  return <section className="studio-shell" aria-label="Chimera 2.0 Authoring Studio">
    <header className="studio-command">
      <div className="studio-command-title">
        <span className="studio-kicker">STUDIO 2.0 · DEVELOPMENT PREVIEW</span>
        <h2>{project.title || "Untitled learning experience"}</h2>
        <span className="studio-command-subtitle">{scenes.length} scene{scenes.length === 1 ? "" : "s"} · Revision {project.storyboard.revision}</span>
      </div>
      <div className="studio-command-actions">
        <button type="button" onClick={onPreview} disabled={!scenes.length || busy}><Play size={16} /> Learner preview</button>
        <button type="button" onClick={onValidate} disabled={!scenes.length || busy}><ClipboardCheck size={16} /> Validate</button>
        <button type="button" className="studio-primary" onClick={onExport} disabled={!scenes.length || busy}><Download size={16} /> Publish / export</button>
      </div>
    </header>

    <div className={"studio-columns" + (pythiaOpen ? " studio-with-pythia" : "") + (inlineEditing ? " studio-editing" : "")}>
      <nav className="studio-scenes" aria-label="Studio scenes">
        <div className="studio-section-heading"><span><Layers3 size={16} /> Scenes</span><button type="button" onClick={onCreateScene} disabled={!canEdit || busy || !project.id} aria-label="Add a scene" title="Add a scene"><Plus size={17} /></button></div>
        <div className="studio-scenes-list">
          {inlineEditing && <p className="studio-scene-editing-note" role="status">Editing this scene. Save or cancel to switch scenes.</p>}
          {scenes.length ? scenes.map((item, index) => <button
            type="button" key={item.id} className={"studio-scene" + (index === selectedScene ? " is-active" : "")}
            aria-current={index === selectedScene ? "true" : undefined}
            onClick={() => onSelectScene(index)}
            disabled={busy || inlineEditing}
          >
            <span className="studio-scene-index">{String(index + 1).padStart(2, "0")}</span>
            <span className="studio-scene-label"><strong>{item.title}</strong><small>{item.sceneType}{item.sourceSlide ? ` · PPT ${item.sourceSlide}` : ""}</small></span>
            <ChevronRight size={14} aria-hidden="true" />
          </button>) : <p className="studio-empty-small">Start with a scene, or import a PowerPoint through the existing Storyboard workspace.</p>}
        </div>
        <div className="studio-scene-footer">
          <button type="button" onClick={onOpenSources} disabled={!project.id || busy}><BookOpen size={15} /> Sources</button>
          <button type="button" onClick={onOpenMedia} disabled={!project.id || busy}><Layers3 size={15} /> Media library</button>
        </div>
      </nav>

      <section className="studio-stage" aria-label="Studio stage">
        <div className="studio-stage-toolbar">
          <span>{scene ? `SCENE ${selectedScene + 1} / ${scenes.length}` : "NO SCENE SELECTED"}</span>
          <div>
            {!inlineEditing && scene && <button type="button" onClick={() => onEditScene(scene)} disabled={busy || !canEdit}><Pencil size={15} /> Edit on stage</button>}
            <button type="button" onClick={onPreview} disabled={!scenes.length || busy || inlineEditing} title="Open actual course player"><Maximize2 size={15} /> Preview</button>
          </div>
        </div>
        {inlineEditing ? <div className="studio-editor-host">{editor}</div> : stageScene && previewReady
          ? <div className="studio-stage-surface"><SceneSurface project={project} scene={stageScene} /></div>
          : <div className="studio-stage-empty"><Layers3 size={34} /><h3>{scene?.title || "Your learning experience begins here"}</h3><p>{scene ? "Open the stage editor to prepare a live scene. The saved source and content remain intact." : "Create a scene to begin authoring. Every scene remains editable without Pythia."}</p><button type="button" disabled={!canEdit || busy} onClick={() => scene ? onEditScene(scene) : onCreateScene()}><Plus size={16} /> {scene ? "Edit scene" : "Create first scene"}</button></div>}
        {!inlineEditing && scene && <div className="studio-stage-notes"><strong>Authoring note</strong><p>{scene.actionDescription || "No production directions yet. Use Edit on stage to add them."}</p></div>}
        {!inlineEditing && <div className="studio-timeline">
          <button type="button" className="studio-timeline-toggle" aria-expanded={timelineOpen} onClick={() => setTimelineOpen(open => !open)}>
            <span><ChevronDown size={16} aria-hidden="true" /> Timeline & narration</span><span>{timelineOpen ? "Hide" : "Show"}</span>
          </button>
          {timelineOpen && <div className="studio-timeline-content">
            <p>{scene?.visualLayout?.timeline ? "This scene has a saved timeline. Use the existing stage editor to adjust its clips, object lifetimes and motion." : "This scene has no authored timeline. Scheduling remains optional."}</p>
            {scene && <button type="button" onClick={() => onEditScene(scene)} disabled={!canEdit || busy}>Open timeline in stage editor</button>}
          </div>}
        </div>}
      </section>

      {!inlineEditing && <aside className="studio-inspector" aria-label="Scene inspector">
        <div className="studio-section-heading"><span>Inspector</span><button type="button" aria-label={detailsOpen ? "Collapse inspector" : "Expand inspector"} aria-expanded={detailsOpen} onClick={() => setDetailsOpen(v => !v)}><ChevronDown size={16} /></button></div>
        {detailsOpen && (scene ? <>
          <span className="studio-inspector-eyebrow">SELECTED SCENE</span>
          <h3>{scene.title}</h3>
          <dl>
            <dt>Type</dt><dd>{scene.sceneType}</dd>
            <dt>Publication</dt><dd>{scene.required ? "Required" : "Optional"}</dd>
            <dt>Media</dt><dd>{scene.imageAssets.length} images, {scene.audioAssets.length} audio</dd>
            <dt>Source</dt><dd>{scene.sourceSlide ? `PowerPoint slide ${scene.sourceSlide}` : "Authored natively"}</dd>
          </dl>
          <button type="button" className="studio-inspector-action" onClick={() => onEditScene(scene)} disabled={!canEdit || busy}><Pencil size={15} /> Edit scene properties</button>
          <div className="studio-authoring-task"><strong>Make it interactive</strong><p>Create branching decisions, hotspots, sequencing and guided practice. Start manually, without Pythia.</p><button type="button" className="studio-inspector-action" onClick={onDesignExperience} disabled={!canEdit || busy || nativeBlocked || scene.sceneType === "question"}>{scene.experience ? "Edit learner interaction" : "Build learner interaction"}</button>{nativeBlocked && <small>Native interactions cannot replace a saved assessment, HTML5 activity, or timeline. Create a separate interaction scene to preserve that work.</small>}{scene.sceneType === "question" && <small>Knowledge checks use the question editor below.</small>}</div>
          {scene.sceneType === "question" && <button type="button" className="studio-inspector-action" onClick={onEditQuestion} disabled={!canEdit || busy}>Edit knowledge check</button>}
        </> : <p className="studio-empty-small">Select a scene to inspect its properties and editing options.</p>)}
        <div className="studio-intelligence-entry">
          <div><Sparkles size={18} /><strong>Consult Pythia</strong></div>
          <p>Ask questions freely. Scene context is shared only when you explicitly select it during consultation.</p>
          <button type="button" disabled={!project.id || !canEnhance || busy} onClick={() => setPythiaOpen(open => !open)} aria-expanded={pythiaOpen} aria-controls="studio-pythia-panel">
            {pythiaOpen ? "Close consultation" : "Open consultation"} <ChevronRight size={15} />
          </button>
          {!canEnhance && <small>Consultation is unavailable for this account. Manual authoring remains available.</small>}
        </div>
      </aside>}

      {pythiaOpen && canEnhance && <aside className="studio-pythia" id="studio-pythia-panel" aria-label="Pythia consultation">
        <div className="studio-section-heading"><span><Sparkles size={16} /> Pythia</span><button type="button" aria-label="Close Pythia panel" onClick={() => setPythiaOpen(false)}><X size={16} /></button></div>
        <PythiaTalkPanel key={project.id} project={project} scene={scene} embedded onClose={() => setPythiaOpen(false)} onProjectUpdated={onProjectUpdated} />
      </aside>}
    </div>
  </section>;
}
