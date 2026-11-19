import { FloatingInspector } from "./FloatingInspector";
import { ProjectPalette } from "./ColorPicker";
import { useEffect, useRef, useState } from "react";
import type { Project, Scene } from "./App";
import { ExperienceEditor } from "./ExperienceEditor";
import { newActivity } from "./ExperienceActivityEditor";
import { NativeExperience, experienceImagesForProject } from "./NativeExperience";
import type { Experience } from "./NativeExperience";
import type { SceneNavigationState } from "./scene-navigation";

/**
 * Author-owned native interaction workspace: no consultation, provider request,
 * external tool, treatment record, or model entitlement required.
 */
export function StudioNativeExperienceEditor({ project, scene, onProjectUpdated, onClose, onNavigationState, onNavigate, initialKind = "branching" }: {
  initialKind?: string;
  project: Project;
  scene: Scene;
  onProjectUpdated: (project: Project) => void;
  onClose: () => void;
  onNavigationState?: (state: SceneNavigationState | null) => void;
  onNavigate?: (action: () => void) => void;
}) {
  const openingRevision = useRef(project.storyboard.revision);
  const original = useRef(JSON.stringify(scene.experience));
  const [value, setValue] = useState<Experience>(() => scene.experience ? structuredClone(scene.experience) : ({
    version: 1, heading: scene.title.slice(0, 120), introduction: "Explore and practice this scene.",
    flow: initialKind === "flow" ? [{label:"First step",description:"Explain the first step."},{label:"Next step",description:"Explain what follows."}] : [], reveals: initialKind === "reveals" ? [{label:"Explore",explanation:"Add an explanation."}] : [], activities: initialKind === "flow" || initialKind === "reveals" ? [] : [newActivity(initialKind as Parameters<typeof newActivity>[0])],
    conclusion: "Reflect on your decision.", motion: false,
    background: "#100818", foreground: "#E8E5EA", accent: "#FF32AA",
    accentText: "#100818", diagramAccent: "#8542E8",
  }));
  const [propertiesOpen,setPropertiesOpen] = useState(true);
  const [reviewed, setReviewed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const blocked = Boolean(scene.assessmentItem || scene.html5Activity || scene.visualLayout?.timeline);
  const unreviewedExternalLink = value.activities?.some(activity => activity.kind === "external-link" && !activity.authorReviewed);
  const dirty = JSON.stringify(value) !== original.current;

  function close() {
    if (saving) return;
    if (onNavigate) { onNavigate(onClose); return; }
    if (dirty && !window.confirm("Discard unsaved interaction edits?")) return;
    onClose();
  }
  async function save() {
    if (saving || blocked || !reviewed || unreviewedExternalLink) { setError("Review the interaction and any external links before saving."); return false; }
    setSaving(true); setError("");
    try {
      const response = await fetch(`/api/projects/${project.id}/scenes/${scene.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "If-Match": `"${openingRevision.current}"` },
        body: JSON.stringify({ experience: value }),
      });
      const payload = await response.json();
      if (!response.ok) {
        const detail = payload?.detail;
        const reason = typeof detail === "string" ? detail :
          Array.isArray(detail) ? detail.map((issue: { msg?: string }) => issue.msg ?? "Invalid experience").join("; ") :
          `Scene save failed (${response.status}).`;
        throw new Error(response.status === 409 ? "This scene changed in another session. Close and reopen before saving." : reason);
      }
      onProjectUpdated(payload as Project);
      onClose();
      return true;
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : "Could not save the native interaction.");
      return false;
    } finally {
      setSaving(false);
    }
  }
  const navigation = useRef<SceneNavigationState>({ dirty, busy: saving, save, discard: onClose });
  navigation.current = { dirty, busy: saving, save, discard: onClose };
  useEffect(() => {
    onNavigationState?.({ get dirty() { return navigation.current.dirty; }, get busy() { return navigation.current.busy; }, save: () => navigation.current.save(), discard: () => navigation.current.discard() });
    return () => onNavigationState?.(null);
  }, [onNavigationState]);
  const actions = <footer className="studio-native-actions">
      <label><input type="checkbox" checked={reviewed} disabled={saving || blocked} onChange={event => setReviewed(event.target.checked)} /> I reviewed the learning experience, feedback and accessibility of this interaction.</label>
      <div>
        <button type="button" onClick={() => void save()} disabled={saving || blocked || !reviewed || unreviewedExternalLink}>{saving ? "Saving…" : "Save learner interaction"}</button>
      </div>
      {unreviewedExternalLink && <p role="alert">Review external URLs, privacy notice and offline alternative before saving.</p>}
    </footer>;
  return <ProjectPalette key={project.id} projectId={project.id} value={{project,value}}><section className="studio-native-editor" aria-label="Manual learner interaction editor">
    <div className="studio-native-heading">
      <div>
        <span className="studio-natural-kicker">MANUAL LEARNING EXPERIENCE</span>
        <h3>{scene.experience ? "Edit learner interaction" : "Build learner interaction"}</h3>
        <p>Design a branching decision, hotspot, sequence or guided practice. The learner preview below runs the actual player. No Pythia request is made.</p>
      </div>
    </div>
    {blocked && <p role="alert" className="studio-native-alert">This scene already has an assessment, HTML5 activity, or timeline. Native interactions cannot replace those components. Choose another content scene, or remove the conflicting component explicitly.</p>}
    {error && <p role="alert" className="studio-native-alert">{error}</p>}
    <button type="button" onClick={()=>setPropertiesOpen(true)}>Activity properties</button>
    <div className="studio-native-columns studio-native-stage">
      {propertiesOpen && <FloatingInspector footer={actions} title="Activity" onClose={()=>setPropertiesOpen(false)}><div className="studio-native-authoring">
        <ExperienceEditor compact value={value} imageAssets={project.storyboard.assets} disabled={saving || blocked}
          onChange={next => { setValue(next); setReviewed(false); }} />
      </div></FloatingInspector>}
      <div className="studio-native-learner">
        <h4>Actual learner preview</h4>
        <NativeExperience experience={value}
          imageAssets={experienceImagesForProject(project.id, project.storyboard.assets)} />
      </div>
    </div>

  </section></ProjectPalette>;
}
