import { useRef, useState } from "react";
import type { Project, Scene } from "./App";
import { ExperienceEditor } from "./ExperienceEditor";
import { newActivity } from "./ExperienceActivityEditor";
import { NativeExperience, experienceImagesForProject } from "./NativeExperience";
import type { Experience } from "./NativeExperience";

/**
 * Author-owned native interaction workspace: no consultation, provider request,
 * external tool, treatment record, or model entitlement required.
 */
export function StudioNativeExperienceEditor({ project, scene, onProjectUpdated, onClose }: {
  project: Project;
  scene: Scene;
  onProjectUpdated: (project: Project) => void;
  onClose: () => void;
}) {
  const openingRevision = useRef(project.storyboard.revision);
  const original = useRef(JSON.stringify(scene.experience));
  const [value, setValue] = useState<Experience>(() => scene.experience ? structuredClone(scene.experience) : ({
    version: 1, heading: scene.title.slice(0, 120), introduction: "Explore and practice this scene.",
    flow: [], reveals: [], activities: [newActivity("branching")],
    conclusion: "Reflect on your decision.", motion: false,
    background: "#100818", foreground: "#E8E5EA", accent: "#FF32AA",
    accentText: "#100818", diagramAccent: "#8542E8",
  }));
  const [reviewed, setReviewed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const blocked = Boolean(scene.assessmentItem || scene.html5Activity || scene.visualLayout?.timeline);
  const unreviewedExternalLink = value.activities?.some(activity => activity.kind === "external-link" && !activity.authorReviewed);
  const dirty = JSON.stringify(value) !== original.current;

  function close() {
    if (saving) return;
    if (dirty && !window.confirm("Discard unsaved interaction edits?")) return;
    onClose();
  }
  async function save() {
    if (saving || blocked || !reviewed || unreviewedExternalLink) return;
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
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : "Could not save the native interaction.");
    } finally {
      setSaving(false);
    }
  }
  return <section className="studio-native-editor" aria-label="Manual learner interaction editor">
    <div className="studio-native-heading">
      <div>
        <span className="studio-natural-kicker">MANUAL LEARNING EXPERIENCE</span>
        <h3>{scene.experience ? "Edit learner interaction" : "Build learner interaction"}</h3>
        <p>Design a branching decision, hotspot, sequence or guided practice. The learner preview below runs the actual player. No Pythia request is made.</p>
      </div>
      <button type="button" onClick={close} disabled={saving}>Close editor</button>
    </div>
    {blocked && <p role="alert" className="studio-native-alert">This scene already has an assessment, HTML5 activity, or timeline. Native interactions cannot replace those components. Choose another content scene, or remove the conflicting component explicitly.</p>}
    {error && <p role="alert" className="studio-native-alert">{error}</p>}
    <div className="studio-native-columns">
      <div className="studio-native-authoring">
        <ExperienceEditor value={value} imageAssets={project.storyboard.assets} disabled={saving || blocked}
          onChange={next => { setValue(next); setReviewed(false); }} />
      </div>
      <div className="studio-native-learner">
        <h4>Actual learner preview</h4>
        <NativeExperience experience={value}
          imageAssets={experienceImagesForProject(project.id, project.storyboard.assets)} />
      </div>
    </div>
    <footer className="studio-native-actions">
      <label><input type="checkbox" checked={reviewed} disabled={saving || blocked} onChange={event => setReviewed(event.target.checked)} /> I reviewed the learning experience, feedback and accessibility of this interaction.</label>
      <div>
        <button type="button" onClick={close} disabled={saving}>Cancel</button>
        <button type="button" onClick={() => void save()} disabled={saving || blocked || !reviewed || unreviewedExternalLink}>{saving ? "Saving…" : "Save learner interaction"}</button>
      </div>
      {unreviewedExternalLink && <p role="alert">Review external URLs, privacy notice and offline alternative before saving.</p>}
    </footer>
  </section>;
}
