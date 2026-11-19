import { useState } from "react";
import type { ReactNode } from "react";
import { BookOpen, ChevronRight, ClipboardCheck, Download, Layers3, Maximize2, Pencil, Play, Plus, Sparkles, X } from "lucide-react";
import type { Project, Scene } from "./App";
import { SceneSurface, resolvedSceneBackground } from "./SceneSurface";
import { PythiaTalkPanel } from "./PythiaTalkPanel";
import "./studio-shell.css";
import { EditorDropdown, PreviewMenu } from "./EditorDropdown";

type StudioShellProps = {
  courseCommands?: {label:string;action:()=>void;disabled?:boolean}[];
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
  onEditHTML5: () => void;
  interactionEditing?: boolean;
  onOpenSources: () => void;
  onOpenMedia: () => void;
  onPreview: () => void;
  onScenePreview: () => void;
  onValidate: () => void;
  onExport: () => void;
  onProjectUpdated: (project: Project) => void;
  editor?: ReactNode;
  editingSceneId?: string | null;
};

export function StudioShell({
  courseCommands = [], project, selectedScene, busy, canEdit, canEnhance, onSelectScene, onCreateScene, onEditScene,
  onEditQuestion, onDesignExperience, onEditHTML5, interactionEditing = false, onOpenSources, onOpenMedia, onPreview, onScenePreview, onValidate, onExport, onProjectUpdated,
  editor, editingSceneId,
}: StudioShellProps) {
  const [pythiaOpen, setPythiaOpen] = useState(false);
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
      <div className="studio-command-actions" role="group" aria-label="Course tools">
        <EditorDropdown label="Course" commands={courseCommands} disabled={busy}/>
        <button type="button" onClick={onOpenSources} disabled={!project.id || busy}><BookOpen size={16} /> Sources</button>
        <button type="button" onClick={onOpenMedia} disabled={!project.id || busy}><Layers3 size={16} /> Media library</button>
        <button type="button" onClick={onPreview} disabled={!scenes.length || busy}><Play size={16} /> Learner preview</button>
        <button type="button" onClick={onValidate} disabled={!scenes.length || busy}><ClipboardCheck size={16} /> Validate</button>
        <button type="button" className="studio-primary" onClick={onExport} disabled={!scenes.length || busy}><Download size={16} /> Publish / export</button>
      </div>
    </header>

    <div className={"studio-columns" + (pythiaOpen ? " studio-with-pythia" : "") + (scene && canEdit ? " studio-editing" : "")}>
      <nav className="studio-scenes" aria-label="Studio scenes">
        <div className="studio-section-heading"><span><Layers3 size={16} /> Scenes</span><button type="button" onClick={onCreateScene} disabled={!canEdit || busy || !project.id} aria-label="Add a scene" title="Add a scene"><Plus size={17} /></button></div>
        <div className="studio-scenes-list">
          {inlineEditing && <p className="studio-scene-editing-note" role="status">Editing this scene. Navigation protects unsaved changes.</p>}
          {scenes.length ? scenes.map((item, index) => <button
            type="button" key={item.id} className={"studio-scene" + (index === selectedScene ? " is-active" : "")}
            aria-current={index === selectedScene ? "true" : undefined}
            onClick={() => onSelectScene(index)}
            disabled={busy}
          >
            <span className="studio-scene-index">{String(index + 1).padStart(2, "0")}</span>
            <span className="studio-scene-label"><strong>{item.title}</strong><small>{item.sceneType}{item.sourceSlide ? ` · PPT ${item.sourceSlide}` : ""}</small></span>
            <ChevronRight size={14} aria-hidden="true" />
          </button>) : <p className="studio-empty-small">Start with a scene, or import a PowerPoint through the existing Storyboard workspace.</p>}
        </div>
      </nav>

      <section className="studio-stage" aria-label="Studio stage">
        <div className="studio-stage-toolbar">
          <span>{scene ? `SCENE ${selectedScene + 1} / ${scenes.length}` : "NO SCENE SELECTED"}</span>
          <div>
            {scene && <>
              <button type="button" aria-pressed={inlineEditing && !interactionEditing} onClick={() => { if (!inlineEditing || interactionEditing) onEditScene(scene); }} disabled={busy || !canEdit || Boolean(scene.html5Activity)}><Pencil size={15} /> Stage</button>
              <button type="button" aria-label={pythiaOpen ? "Close Pythia" : "Pythia"} aria-expanded={pythiaOpen} aria-controls="studio-pythia-panel" onClick={() => setPythiaOpen(open => !open)} disabled={busy || !canEnhance}><Sparkles size={15} /> Pythia</button>
              <button type="button" aria-pressed={interactionEditing} onClick={() => { if (!interactionEditing) onDesignExperience(); }} disabled={busy || !canEdit || nativeBlocked || scene.sceneType === "question"} title={nativeBlocked ? "A saved timeline, assessment or HTML5 activity must be preserved. Use a separate interaction scene." : "Build or edit a learner interaction without Pythia"}>Interaction</button>
              {scene.sceneType === "question" && <button type="button" onClick={onEditQuestion} disabled={busy || !canEdit}>Edit knowledge check</button>}
              {scene.html5Activity && <button type="button" onClick={onEditHTML5} disabled={busy || !canEdit}>HTML5 activity</button>}
            </>}
            <PreviewMenu onScene={onScenePreview} onExperience={onPreview} disabled={!scenes.length || busy}/>
          </div>
        </div>
        {inlineEditing ? <div className="studio-editor-host">{editor}</div> : stageScene && previewReady
          ? <div className="studio-stage-surface"><SceneSurface project={project} scene={stageScene} /></div>
          : <div className="studio-stage-empty"><Layers3 size={34} /><h3>{scene?.title || "Your learning experience begins here"}</h3><p>{scene ? "Preparing the editing stage. Your saved scene remains intact." : "Create a scene to begin authoring. Every scene remains editable without Pythia."}</p><button type="button" disabled={!canEdit || busy} onClick={() => scene ? onEditScene(scene) : onCreateScene()}><Plus size={16} /> {scene ? "Edit scene" : "Create first scene"}</button></div>}
      </section>

      {pythiaOpen && canEnhance && <aside className="studio-pythia" id="studio-pythia-panel" aria-label="Pythia consultation">
        <div className="studio-section-heading"><span><Sparkles size={16} /> Pythia</span><button type="button" aria-label="Close Pythia panel" onClick={() => setPythiaOpen(false)}><X size={16} /></button></div>
        <PythiaTalkPanel key={project.id} project={project} scene={scene} embedded onClose={() => setPythiaOpen(false)} onProjectUpdated={onProjectUpdated} />
      </aside>}
    </div>
  </section>;
}
