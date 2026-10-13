import { Check, ChevronRight, CircleHelp, X } from "lucide-react";
import { useState } from "react";
import { chimeraJourneys } from "./onboarding-journeys";
import type { Project } from "./App";
import "./golden-path.css";

type GoldenPathViewProps = {
  onStartWalkthrough: () => void;
  onSelectWalkthrough: (id: string) => void;
  walkthroughStatuses: Record<string, string>;
  project: Project;
  onClose: () => void;
  onCreateProject: () => void;
  onOpenStoryboard: () => void;
  onOpenMedia: () => void;
  onOpenAccessibility: () => void;
  onOpenPreview: () => void;
  onRunValidation: () => void;
};

type StepStatus = "done" | "next" | "waiting" | "optional" | "review";

type GuideStep = {
  title: string;
  instructions: string;
  status: StepStatus;
  statusLabel: string;
  actionLabel: string;
  action?: () => void;
};

export function GoldenPathView({ onStartWalkthrough, onSelectWalkthrough, walkthroughStatuses, project, onClose, onCreateProject, onOpenStoryboard, onOpenMedia, onOpenAccessibility, onOpenPreview, onRunValidation }: GoldenPathViewProps) {
  const [walkthroughQuery, setWalkthroughQuery] = useState("");
  const visibleJourneys = chimeraJourneys.filter(journey => `${journey.title} ${journey.steps[0].instruction}`.toLowerCase().includes(walkthroughQuery.trim().toLowerCase()));
  const scenes = project.storyboard.scenes;
  const imageCount = scenes.reduce((count, scene) => count + scene.imageAssets.length, 0);
  const imagesNeedingDescriptions = scenes.reduce((count, scene) => count + scene.imageAssets.filter((assetId) => !scene.decorativeImages.includes(assetId) && !scene.imageAltText[assetId]?.trim()).length, 0);
  const hasContent = project.hasSourceDeck || scenes.length > 0;

  const steps: GuideStep[] = [
    {
      title: "Choose or create a project",
      instructions: project.id ? `You are working in ${project.title}. Use the project selector to switch courses, or create another project.` : "Create a project before importing a presentation or authoring scenes.",
      status: project.id ? "done" : "next",
      statusLabel: project.id ? "Ready" : "Start here",
      actionLabel: "Create project",
      action: onCreateProject,
    },
    {
      title: "Bring in course content",
      instructions: "Import a PowerPoint to seed scenes, or start with a blank scene in the storyboard.",
      status: hasContent ? "done" : project.id ? "next" : "waiting",
      statusLabel: hasContent ? "Content added" : project.id ? "Next" : "After project setup",
      actionLabel: "Open storyboard",
      action: project.id ? onOpenStoryboard : undefined,
    },
    {
      title: "Review and refine scenes",
      instructions: "Check each scene's title, extracted text, notes, purpose, required status, and order.",
      status: scenes.length > 0 ? "next" : "waiting",
      statusLabel: scenes.length > 0 ? `${scenes.length} scenes to review` : "After adding content",
      actionLabel: "Review scenes",
      action: scenes.length > 0 ? onOpenStoryboard : undefined,
    },
    {
      title: "Add supporting media",
      instructions: "Upload images or audio in the media library, then attach assets to the scenes where they belong.",
      status: project.storyboard.assets.length > 0 ? "done" : "optional",
      statusLabel: project.storyboard.assets.length > 0 ? `${project.storyboard.assets.length} assets available` : "Optional",
      actionLabel: "Open media library",
      action: project.id ? onOpenMedia : undefined,
    },
    {
      title: "Review image accessibility",
      instructions: imageCount === 0 ? "No images are attached to scenes yet. When you add images, provide alt text or mark decorative images explicitly." : imagesNeedingDescriptions > 0 ? `${imagesNeedingDescriptions} attached ${imagesNeedingDescriptions === 1 ? "image needs" : "images need"} alt text or a decorative designation.` : "Every attached image has alt text or is marked decorative.",
      status: imageCount === 0 ? "optional" : imagesNeedingDescriptions > 0 ? "review" : "done",
      statusLabel: imageCount === 0 ? "When images are added" : imagesNeedingDescriptions > 0 ? "Needs attention" : "Complete",
      actionLabel: "Edit image descriptions",
      action: project.id ? onOpenAccessibility : undefined,
    },
    {
      title: "Preview as a learner",
      instructions: "Navigate scenes, review attached media, and resume at the last scene previewed in this browser.",
      status: scenes.length > 0 ? "next" : "waiting",
      statusLabel: scenes.length > 0 ? "Available" : "After adding scenes",
      actionLabel: "Open course preview",
      action: scenes.length > 0 ? onOpenPreview : undefined,
    },
    {
      title: "Run validation",
      instructions: "Review blocking errors and warnings before using the course. Follow each scene-specific finding back to its editor.",
      status: project.id ? "next" : "waiting",
      statusLabel: project.id ? "Final check" : "After project setup",
      actionLabel: "Run validation",
      action: project.id ? onRunValidation : undefined,
    },
  ];

  return <div className="golden-path-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section className="golden-path-dialog" role="dialog" aria-modal="true" aria-labelledby="golden-path-title">
      <header className="golden-path-header">
        <div className="golden-path-title-mark"><CircleHelp size={19} /><div><p className="eyebrow">CHIMERA WORKFLOW</p><h2 id="golden-path-title">Golden Path</h2></div></div>
        <button className="icon-button" onClick={onClose} aria-label="Close Golden Path"><X size={18} /></button>
      </header>
      <p className="golden-path-intro">A practical route from a new project to a reviewed storyboard.</p>
      <button type="button" className="button button-accent" onClick={onStartWalkthrough}>Start / resume walkthrough</button>
      <details><summary>All functionality walkthroughs ({chimeraJourneys.length})</summary>
        <p>Choose a task. Saves and downloads advance only on success; review steps need acknowledgment. Pause preserves forms. Some tasks require existing content or a configured provider.</p>
        <label>Find a walkthrough<input type="search" value={walkthroughQuery} onChange={event => setWalkthroughQuery(event.target.value)} placeholder="e.g. audio, questions, storyboard" /></label>
        {visibleJourneys.length === 0 && <p role="status">No matching walkthroughs. Try a different task name.</p>}
        <ol className="golden-path-steps">{visibleJourneys.map((journey, index) => <li className="golden-path-step" key={journey.id}>
          <span className="golden-path-number">{index + 1}</span>
          <div className="golden-path-step-copy"><div className="golden-path-step-heading"><h3>{journey.title}</h3><span>{walkthroughStatuses[journey.id] === "complete" ? "Practiced" : walkthroughStatuses[journey.id] === "finished" ? "Ended with skips" : walkthroughStatuses[journey.id] === "paused" ? "Paused" : "Ready to start"}</span></div><p>{journey.steps[0].instruction}</p>
            <button type="button" className="golden-path-action" onClick={() => onSelectWalkthrough(journey.id)}>Start {journey.title}<ChevronRight size={15} /></button>
          </div>
        </li>)}</ol>
      </details>
      <ol className="golden-path-steps">
        {steps.map((step, index) => <li className={`golden-path-step ${step.status}`} key={step.title}>
          <span className="golden-path-number">{step.status === "done" ? <Check size={15} /> : String(index + 1).padStart(2, "0")}</span>
          <div className="golden-path-step-copy"><div className="golden-path-step-heading"><h3>{step.title}</h3><span>{step.statusLabel}</span></div><p>{step.instructions}</p>{step.action && <button type="button" className="golden-path-action" onClick={step.action}>{step.actionLabel}<ChevronRight size={15} /></button>}</div>
        </li>)}
      </ol>
      <footer className="golden-path-footer"><span>SCORM 2004 and 1.2 packages can be built. Blackboard verification is documented for SCORM 2004 only.</span></footer>
    </section>
  </div>;
}
