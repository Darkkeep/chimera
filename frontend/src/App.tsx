import { ChangeEvent, useEffect, useState } from "react";
import { Accessibility, ArrowDown, ArrowUp, BookOpen, Check, ChevronDown, ChevronRight, ClipboardList, Download, FileUp, GripVertical, Layers3, Pencil, Play, Plus, Route, Settings2, ShieldCheck, Sparkles, Upload, X } from "lucide-react";
import { ValidationView } from "./ValidationView";
import { AccessibilityView } from "./AccessibilityView";
import { GoldenPathView } from "./GoldenPathView";
import { CoursePreview } from "./CoursePreview";
import { AssessmentEditor } from "./AssessmentEditor";
import { MediaAttributionEditor } from "./MediaAttributionEditor";
import { CompletionSettingsEditor } from "./CompletionSettingsEditor";
import { EnhancementReviewView } from "./EnhancementReviewView";
import { EditorDialog } from "./EditorDialog";
import { AppearanceSelector } from "./AppearanceSelector";
import { BrandMark } from "./BrandMark";
import restoreIcon from "./assets/cutout-56-a86a43163042.png";
import "./audio-requirement.css";
import "./assessment-editor.css";

type LayoutMode = "fidelity" | "hybrid" | "native" | "template";
type SceneType = "content" | "title" | "assessment" | "media" | "interaction" | "summary";
export type AssessmentChoice = { identifier: string; text: string };
export type AssessmentPair = { sourceIdentifier: string; targetIdentifier: string };
type AssessmentBase = { identifier: string; prompt: string; correctFeedback: string; incorrectFeedback: string };
export type AssessmentItem =
  | (AssessmentBase & { type: "single-choice"; choices: AssessmentChoice[]; correctResponse: string })
  | (AssessmentBase & { type: "multiple-response"; choices: AssessmentChoice[]; correctResponses: string[] })
  | (AssessmentBase & { type: "true-false"; correctResponse: "true" | "false" })
  | (AssessmentBase & { type: "ordering"; choices: AssessmentChoice[]; correctOrder: string[] })
  | (AssessmentBase & { type: "drag-drop"; draggables: AssessmentChoice[]; targets: AssessmentChoice[]; correctMatches: AssessmentPair[] })
  | (AssessmentBase & { type: "matching"; leftItems: AssessmentChoice[]; rightItems: AssessmentChoice[]; correctMatches: AssessmentPair[] })
  | (AssessmentBase & { type: "short-answer"; acceptedAnswers: string[]; caseSensitive: boolean });
export type AssessmentType = AssessmentItem["type"];
export type AssessmentSettings = { maxAttempts: number; passingScore: number; scoreWeight: number; remediationSceneId: string | null };
export type CourseCompletionSettings = { passingScore: number; includeOptionalAssessments: boolean };
export type ExportSettings = { packageWarningThresholdMB: number };
export type Scene = { id: string; sourceSlide: number | null; title: string; sceneType: SceneType; layoutMode: LayoutMode; templateId: string | null; required: boolean; audioRequired: boolean; assessmentItem: AssessmentItem | null; assessmentSettings: AssessmentSettings | null; extractedText: string[]; actionDescription: string; imageAssets: string[]; imageAltText: Record<string, string>; decorativeImages: string[]; audioAssets: string[]; previewImage: string | null; renderWarning: string | null; sourceAnimationXml: string | null; sourceTransitionXml: string | null; notes: string };
export type Asset = { id: string; kind: "image" | "audio"; filename: string; contentType: string; sizeBytes: number; sha256: string; path: string; attributionText: string; attributionStatus: "draft" | "complete" };
export type ProjectSummary = { id: string; title: string; sceneCount: number; updatedAt: string; hasSourceDeck: boolean };
export type Project = ProjectSummary & { storyboard: { scenes: Scene[]; assets: Asset[]; completionSettings: CourseCompletionSettings; exportSettings: ExportSettings } };
type SceneDraft = { id: string | null; title: string; screenText: string; actionDescription: string; notes: string; required: boolean; audioRequired: boolean; sceneType: SceneType; layoutMode: LayoutMode; templateId: string };
type Template = { id: string; title: string; description: string; filename: string; sizeBytes: number; updatedAt: string };
type TemplateDraft = { id: string; title: string; description: string };

const emptyProject: Project = { id: "", title: "", sceneCount: 0, updatedAt: "", hasSourceDeck: false, storyboard: { scenes: [], assets: [], completionSettings: { passingScore: 80, includeOptionalAssessments: false }, exportSettings: { packageWarningThresholdMB: 200 } } };
const MAX_STORYBOARD_JSON_BYTES = 25 * 1024 * 1024;

export function App() {
  const [project, setProject] = useState<Project>(emptyProject);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [selectedScene, setSelectedScene] = useState(0);
  const [isCreating, setIsCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [sceneDraft, setSceneDraft] = useState<SceneDraft | null>(null);
  const [templateDraft, setTemplateDraft] = useState<TemplateDraft | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [activeView, setActiveView] = useState<"storyboard" | "media" | "templates">("storyboard");
  const [showValidation, setShowValidation] = useState(false);
  const [showAccessibility, setShowAccessibility] = useState(false);
  const [showGoldenPath, setShowGoldenPath] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [showAssessmentEditor, setShowAssessmentEditor] = useState(false);
  const [showCompletionSettings, setShowCompletionSettings] = useState(false);
  const [showEnhancementReview, setShowEnhancementReview] = useState(false);
  const [showReviewTools, setShowReviewTools] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [draggingSceneId, setDraggingSceneId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");

  function applyProject(updatedProject: Project) {
    setProject(updatedProject);
    if (!updatedProject.id) return;
    window.localStorage.setItem("chimera.activeProjectId", updatedProject.id);
    const summary: ProjectSummary = {
      id: updatedProject.id,
      title: updatedProject.title,
      sceneCount: updatedProject.sceneCount,
      updatedAt: updatedProject.updatedAt,
      hasSourceDeck: updatedProject.hasSourceDeck,
    };
    setProjects((current) => [summary, ...current.filter((item) => item.id !== summary.id)]);
  }

  useEffect(() => {
    fetch("/api/projects").then(async (response) => {
      if (!response.ok) throw new Error("Project list could not be loaded.");
      return response.json() as Promise<ProjectSummary[]>;
    }).then(async (availableProjects) => {
      setProjects(availableProjects);
      if (availableProjects.length === 0) return;
      const rememberedId = window.localStorage.getItem("chimera.activeProjectId");
      const selectedProject = availableProjects.find((item) => item.id === rememberedId)
        ?? [...availableProjects].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];
      const response = await fetch(`/api/projects/${selectedProject.id}`);
      if (!response.ok) throw new Error("Selected project could not be loaded.");
      applyProject(await response.json() as Project);
    }).catch(() => setError("Start the API to connect project storage."));
    fetch("/api/templates").then((response) => response.ok ? response.json() : []).then(setTemplates).catch(() => setError("Template library could not be loaded."));
  }, []);

  async function switchProject(projectId: string) {
    if (!projectId || projectId === project.id || busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/projects/${projectId}`);
      if (!response.ok) throw new Error("Project could not be opened.");
      applyProject(await response.json() as Project);
      setSelectedScene(0);
      setActiveView("storyboard");
      setSceneDraft(null);
      setTemplateDraft(null);
      setShowValidation(false);
      setShowAccessibility(false);
      setShowPreview(false);
      setShowAssessmentEditor(false);
    } catch {
      setError("Project could not be opened. Check that the API is running and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function createProject() {
    if (!title.trim() || busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title }) });
      if (!response.ok) throw new Error("Project could not be created.");
      applyProject(await response.json() as Project);
      setIsCreating(false);
      setSelectedScene(0);
      setActiveView("storyboard");
      setTitle("");
    } catch {
      setError("Project could not be created. Check that the API is running and try again.");
    } finally {
      setBusy(false);
    }
  }

  function beginSceneCreate() {
    setError("");
    setSceneDraft({ id: null, title: "New scene", screenText: "", actionDescription: "", notes: "", required: true, audioRequired: false, sceneType: "content", layoutMode: "native", templateId: "" });
  }

  async function uploadTemplate(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    setBusy(true);
    setError("");
    const form = new FormData();
    form.append("file", file);
    try {
      const response = await fetch("/api/templates", { method: "POST", body: form });
      if (!response.ok) {
        const detail = await response.json().catch(() => null) as { detail?: string } | null;
        throw new Error(detail?.detail || "Template could not be uploaded.");
      }
      const template: Template = await response.json();
      setTemplates((current) => [...current, template]);
    } catch {
      setError("Template could not be uploaded. Check that it is a readable PPTX file and try again.");
    } finally {
      input.value = "";
      setBusy(false);
    }
  }

  async function replaceTemplateSource(event: ChangeEvent<HTMLInputElement>, templateId: string) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    setBusy(true);
    setError("");
    const form = new FormData();
    form.append("file", file);
    try {
      const response = await fetch(`/api/templates/${templateId}/source`, { method: "PUT", body: form });
      if (!response.ok) {
        const detail = await response.json().catch(() => null) as { detail?: string } | null;
        throw new Error(detail?.detail || "Template file could not be replaced.");
      }
      const updatedTemplate: Template = await response.json();
      setTemplates((current) => current.map((template) => template.id === updatedTemplate.id ? updatedTemplate : template));
    } catch {
      setError("Template file could not be replaced. Check that it is a readable PPTX file and try again.");
    } finally {
      input.value = "";
      setBusy(false);
    }
  }

  async function saveTemplate() {
    if (!templateDraft) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/templates/${templateDraft.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: templateDraft.title.trim(), description: templateDraft.description }),
      });
      if (!response.ok) throw new Error("Template changes could not be saved.");
      const savedTemplate: Template = await response.json();
      setTemplates((current) => current.map((template) => template.id === savedTemplate.id ? savedTemplate : template));
      setTemplateDraft(null);
    } catch {
      setError("Template changes could not be saved. Check that the API is running and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function reorderScenes(draggedId: string, targetId: string) {
    if (!project.id || draggedId === targetId || busy) return;
    const sceneIds = scenes.map((item) => item.id);
    const from = sceneIds.indexOf(draggedId);
    const to = sceneIds.indexOf(targetId);
    if (from < 0 || to < 0) return;
    sceneIds.splice(to, 0, ...sceneIds.splice(from, 1));
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/projects/${project.id}/scenes/order`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sceneIds }),
      });
      if (!response.ok) throw new Error("Scene order could not be saved.");
      const updatedProject: Project = await response.json();
      const selectedId = scene?.id;
      applyProject(updatedProject);
      setSelectedScene(Math.max(0, updatedProject.storyboard.scenes.findIndex((item) => item.id === selectedId)));
    } catch {
      setError("Scene order could not be saved. Check that the API is running and try again.");
    } finally {
      setDraggingSceneId(null);
      setBusy(false);
    }
  }

  async function uploadDeck(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file || !project.id) return;
    setBusy(true);
    setError("");
    const form = new FormData();
    form.append("file", file);
    try {
      const response = await fetch(`/api/projects/${project.id}/source`, { method: "POST", body: form });
      if (!response.ok) {
        const detail = await response.json().catch(() => null) as { detail?: string } | null;
        throw new Error(detail?.detail || "This presentation could not be read.");
      }
      applyProject(await response.json() as Project);
      setSelectedScene(0);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "This presentation could not be read.");
    } finally {
      input.value = "";
      setBusy(false);
    }
  }

  async function exportStoryboard() {
    if (!project.id || busy) return;
    setBusy(true);
    setError("");
    setFeedback("");
    try {
      const response = await fetch(`/api/projects/${project.id}/storyboard/export`);
      if (!response.ok) throw new Error("Storyboard JSON could not be exported.");
      const downloadUrl = window.URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = `${project.id}-storyboard.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(downloadUrl);
      setFeedback("Storyboard JSON downloaded. Media files are stored separately.");
    } catch {
      setError("Storyboard JSON could not be exported. Check that the API is running and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function exportAssessmentTest() {
    if (!project.id || busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/projects/${project.id}/assessment.qti.zip`);
      if (!response.ok) {
        const detail = await response.json().catch(() => null) as { detail?: string } | null;
        throw new Error(detail?.detail || "QTI 2.1 assessment test could not be exported.");
      }
      const downloadUrl = window.URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = `${project.id}-assessment.qti.zip`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(downloadUrl);
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : "QTI 2.1 assessment test could not be exported.");
    } finally {
      setBusy(false);
    }
  }

  async function exportScorm2004() {
    if (!project.id || busy) return;
    setBusy(true);
    setError("");
    setFeedback("");
    try {
      const response = await fetch(`/api/projects/${project.id}/scorm-2004.zip`);
      if (!response.ok) {
        const detail = await response.json().catch(() => null) as { detail?: string } | null;
        throw new Error(detail?.detail || "SCORM 2004 package could not be built.");
      }
      const downloadUrl = window.URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = `${project.id}-scorm2004.zip`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(downloadUrl);
      setFeedback("SCORM 2004 package built and downloaded.");
    } catch (buildError) {
      setError(buildError instanceof Error ? buildError.message : "SCORM 2004 package could not be built.");
    } finally {
      setBusy(false);
    }
  }

  async function exportScorm12() {
    if (!project.id || busy) return;
    setBusy(true);
    setError("");
    setFeedback("");
    try {
      const response = await fetch(`/api/projects/${project.id}/scorm-12.zip`);
      if (!response.ok) {
        const detail = await response.json().catch(() => null) as { detail?: string } | null;
        throw new Error(detail?.detail || "SCORM 1.2 package could not be built.");
      }
      const downloadUrl = window.URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = `${project.id}-scorm12.zip`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(downloadUrl);
      setFeedback("SCORM 1.2 compatibility package built and downloaded.");
    } catch (buildError) {
      setError(buildError instanceof Error ? buildError.message : "SCORM 1.2 package could not be built.");
    } finally {
      setBusy(false);
    }
  }

  async function downloadScormReport(profile: "scorm2004" | "scorm12") {
    if (!project.id || busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/projects/${project.id}/scorm-report/${profile}`);
      if (!response.ok) throw new Error("Build report is not available yet. Build the package first.");
      const downloadUrl = window.URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = `${project.id}-${profile}-build-report.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(downloadUrl);
      setFeedback("Build report downloaded.");
    } catch (reportError) {
      setError(reportError instanceof Error ? reportError.message : "Build report could not be downloaded.");
    } finally {
      setBusy(false);
    }
  }

  async function updatePackageWarningThreshold(packageWarningThresholdMB: number) {
    if (!project.id || busy || !Number.isFinite(packageWarningThresholdMB)) return;
    const threshold = Math.round(packageWarningThresholdMB);
    if (threshold < 1 || threshold > 4096 || threshold === project.storyboard.exportSettings.packageWarningThresholdMB) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/projects/${project.id}/export-settings`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ packageWarningThresholdMB: threshold }) });
      if (!response.ok) throw new Error("Export settings could not be saved.");
      applyProject(await response.json() as Project);
      setFeedback("Package warning threshold saved.");
    } catch {
      setError("Export settings could not be saved. Check that the API is running and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function importStoryboard(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file || !project.id) return;
    if (file.size > MAX_STORYBOARD_JSON_BYTES) {
      setError("Storyboard JSON must be 25 MB or smaller.");
      input.value = "";
      return;
    }
    const confirmed = window.confirm(`Replace the storyboard for "${project.title}"? The current version will be saved to history. JSON does not contain media files; all referenced assets and templates must already be available in this project.`);
    if (!confirmed) {
      input.value = "";
      return;
    }
    setBusy(true);
    setError("");
    setFeedback("");
    try {
      let storyboard: unknown;
      try {
        storyboard = JSON.parse(await file.text());
      } catch {
        throw new Error("The selected file is not valid JSON.");
      }
      const response = await fetch(`/api/projects/${project.id}/storyboard/import`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(storyboard),
      });
      if (!response.ok) {
        const detail = await response.json().catch(() => null) as { detail?: unknown } | null;
        throw new Error(typeof detail?.detail === "string" ? detail.detail : "Import failed. Check the storyboard schema and referenced assets.");
      }
      const updatedProject: Project = await response.json();
      applyProject(updatedProject);
      setSelectedScene(0);
      setActiveView("storyboard");
      setFeedback(`Storyboard imported. The previous version was saved to history.`);
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : "Storyboard JSON could not be imported.");
    } finally {
      input.value = "";
      setBusy(false);
    }
  }

  async function uploadMedia(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file || !project.id) return;
    setBusy(true);
    setError("");
    const form = new FormData();
    form.append("file", file);
    try {
      const response = await fetch(`/api/projects/${project.id}/assets`, { method: "POST", body: form });
      if (!response.ok) {
        const detail = await response.json().catch(() => null) as { detail?: string } | null;
        throw new Error(detail?.detail || "Media could not be uploaded.");
      }
      applyProject(await response.json() as Project);
    } catch {
      setError("Media could not be uploaded. Use a supported image or audio format and try again.");
    } finally {
      input.value = "";
      setBusy(false);
    }
  }

  async function attachAsset(asset: Asset) {
    if (!project.id || !scene || busy) return;
    const field = asset.kind === "image" ? "imageAssets" : "audioAssets";
    const currentAssetIds = scene[field];
    const updatedAssetIds = currentAssetIds.includes(asset.id) ? currentAssetIds.filter((id) => id !== asset.id) : [...currentAssetIds, asset.id];
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/projects/${project.id}/scenes/${scene.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: updatedAssetIds }),
      });
      if (!response.ok) throw new Error("Media assignment could not be saved.");
      applyProject(await response.json() as Project);
    } catch {
      setError("Media assignment could not be saved. Check that the API is running and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function setSceneAudioRequired(audioRequired: boolean) {
    if (!project.id || !scene || busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/projects/${project.id}/scenes/${scene.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audioRequired }),
      });
      if (!response.ok) throw new Error("Audio completion setting could not be saved.");
      applyProject(await response.json() as Project);
    } catch {
      setError("Audio completion setting could not be saved. Check that the API is running and try again.");
    } finally {
      setBusy(false);
    }
  }

  function beginSceneEdit(sceneToEdit: Scene | undefined = scene) {
    if (!sceneToEdit || busy) return;
    setError("");
    setSelectedScene(scenes.findIndex((item) => item.id === sceneToEdit.id));
    setSceneDraft({ id: sceneToEdit.id, title: sceneToEdit.title, screenText: sceneToEdit.extractedText.join("\n"), actionDescription: sceneToEdit.actionDescription, notes: sceneToEdit.notes, required: sceneToEdit.required, audioRequired: sceneToEdit.audioRequired, sceneType: sceneToEdit.sceneType, layoutMode: sceneToEdit.layoutMode, templateId: sceneToEdit.templateId || "" });
  }

  async function saveScene() {
    if (!project.id || !sceneDraft) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(sceneDraft.id ? `/api/projects/${project.id}/scenes/${sceneDraft.id}` : `/api/projects/${project.id}/scenes`, {
        method: sceneDraft.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: sceneDraft.title.trim(),
          sceneType: sceneDraft.sceneType,
          extractedText: sceneDraft.screenText.split(/\r?\n/).map((text) => text.trim()).filter(Boolean),
          actionDescription: sceneDraft.actionDescription.trim(),
          notes: sceneDraft.notes,
          required: sceneDraft.required,
          audioRequired: sceneDraft.audioRequired,
          layoutMode: sceneDraft.layoutMode,
          templateId: sceneDraft.templateId || null,
        }),
      });
      if (!response.ok) throw new Error("Scene changes could not be saved.");
      const updatedProject: Project = await response.json();
      applyProject(updatedProject);
      if (!sceneDraft.id) setSelectedScene(updatedProject.storyboard.scenes.length - 1);
      setSceneDraft(null);
    } catch {
      setError("Scene changes could not be saved. Check that the API is running and try again.");
    } finally {
      setBusy(false);
    }
  }

  const scenes = project.storyboard.scenes;
  const assessmentItemCount = scenes.filter((item) => item.assessmentItem !== null).length;
  const scene = scenes[selectedScene];

  return <div className="app-shell">
    <a className="skip-link" href="#workspace-content">Skip to workspace</a>
    <aside className="sidebar" aria-label="Workspace navigation">
      <div className="brand"><BrandMark /><div className="brand-wordmark"><span>CHIMERA</span></div></div>
      <div className="sidebar-project">
        <label className="project-switcher"><span>PROJECT</span><select value={project.id} onChange={(event) => void switchProject(event.target.value)} disabled={busy || projects.length === 0} aria-label="Switch project"><option value="" disabled>Select a project</option>{[...projects].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)).map((item) => <option key={item.id} value={item.id}>{item.title} · {item.sceneCount} scenes</option>)}</select></label>
        <button className="new-project-button" onClick={() => setIsCreating(true)} disabled={busy}><Plus size={15} /> Create project</button>
      </div>
      <div className="workspace-label">WORKSPACE</div>
      <nav aria-label="Authoring">
        <button className={`nav-item ${activeView === "storyboard" ? "active" : ""}`} aria-current={activeView === "storyboard" ? "page" : undefined} onClick={() => setActiveView("storyboard")}><Layers3 size={18} /><span>Storyboard</span></button>
        <button className={`nav-item ${activeView === "media" ? "active" : ""}`} aria-current={activeView === "media" ? "page" : undefined} onClick={() => setActiveView("media")}><FileUp size={18} /><span>Media library</span></button>
        <button className={`nav-item ${activeView === "templates" ? "active" : ""}`} aria-current={activeView === "templates" ? "page" : undefined} onClick={() => setActiveView("templates")}><BookOpen size={18} /><span>Templates</span></button>
      </nav>
      <div className="sidebar-review">
        <button className="nav-item review-toggle" aria-expanded={showReviewTools} aria-controls="review-tools" onClick={() => setShowReviewTools(!showReviewTools)}><ShieldCheck size={18} /><span>Review tools</span><ChevronDown size={15} className={showReviewTools ? "expanded" : ""} /></button>
        {showReviewTools && <div id="review-tools" className="review-tools">
          <button onClick={() => setShowGoldenPath(true)}><Route size={16} /> Guided review</button>
          <button onClick={() => setShowAccessibility(true)} disabled={!project.id || busy}><Accessibility size={16} /> Check image descriptions</button>
          <button onClick={() => setShowValidation(true)} disabled={!project.id || busy}><ShieldCheck size={16} /> Validate storyboard</button>
          <button onClick={() => setShowCompletionSettings(true)} disabled={!project.id || busy}><Settings2 size={16} /> Completion rules</button>
          <button onClick={() => setShowEnhancementReview(true)} disabled={!project.id || busy}><Sparkles size={16} /> Review suggestions</button>
        </div>}
      </div>
      <div className="sidebar-bottom"><AppearanceSelector /><div className="sidebar-footer"><span className="status-dot" />Local workspace</div></div>
    </aside>
    <main className="main-content" id="workspace-content" tabIndex={-1}>
      <header className="topbar">
        <div className="project-heading"><p className="eyebrow">COURSE AUTHORING / {activeView === "storyboard" ? "STORYBOARD" : activeView === "media" ? "MEDIA LIBRARY" : "TEMPLATES"}</p><h1 title={project.title}>{project.title || "Your workspace"}</h1></div>
        <div className="top-actions"><span className="save-state" role="status">{busy ? "Working…" : project.id ? <><Check size={14} /> Saved locally</> : "Local authoring"}</span><button className="button button-outline" onClick={() => setShowPreview(true)} disabled={!project.id || !scenes.length || busy}><Play size={15} /> Preview course</button><button className="button button-accent" onClick={() => setShowExport(true)} disabled={!project.id || busy}><Download size={15} /> Export</button></div>
      </header>
      {error && <div className="notice" role="alert"><span>{error}</span><button className="icon-button" onClick={() => setError("")} aria-label="Dismiss error"><X size={16} /></button></div>}
      {feedback && <div className="notice success-notice" role="status"><span>{feedback}</span><button className="icon-button" onClick={() => setFeedback("")} aria-label="Dismiss message"><X size={16} /></button></div>}
      {activeView === "storyboard" ? <><div className="work-area">
        <section className="scene-list" aria-label="Scene sequence">
          <div className="scene-list-tools"><div className="scene-list-title"><h2>Scenes <span className="count">{scenes.length}</span></h2><button className="icon-button" title="Add scene" aria-label="Add scene" onClick={beginSceneCreate} disabled={!project.id || busy}><Plus size={19} /></button></div>
            <label className={`button button-outline upload-control ${!project.id || busy ? "disabled" : ""}`}><FileUp size={15} /> Import PowerPoint<input type="file" aria-label="Import PowerPoint" accept=".pptx" onChange={uploadDeck} disabled={!project.id || busy} /></label>
          </div>
          <div className="scene-sequence">
            {scenes.length === 0 ? <div className="empty-list"><div className="empty-icon"><Layers3 size={22} /></div><strong>{project.id ? "A fresh start" : "No project selected"}</strong><p>{project.id ? "Your scenes will appear here. Drag to reorder, or use the arrow buttons." : "Create a project to start your storyboard."}</p></div> : scenes.map((item, index) => <div className={`scene-row-wrap ${selectedScene === index ? "is-selected" : ""} ${draggingSceneId === item.id ? "dragging" : ""}`} key={item.id} draggable={!busy} onDragStart={(event) => { setDraggingSceneId(item.id); event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", item.id); }} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); const draggedId = event.dataTransfer.getData("text/plain") || draggingSceneId; if (draggedId) void reorderScenes(draggedId, item.id); }} onDragEnd={() => setDraggingSceneId(null)}>
              <span className="scene-drag-handle" title="Drag to change scene order"><GripVertical size={14} /></span>
              <button className={`scene-row ${selectedScene === index ? "selected" : ""}`} aria-current={selectedScene === index ? "true" : undefined} onClick={() => setSelectedScene(index)}>
                <span className="scene-number">{String(index + 1).padStart(2, "0")}</span><span className="scene-copy"><strong>{item.title}</strong><small><span className="scene-signifier">{item.sceneType}</span><span className="scene-signifier">{item.required ? "Required" : "Optional"}</span></small></span>
              </button>
              <div className="scene-order-actions"><button className="icon-button scene-edit-button" title={`Edit ${item.title}`} aria-label={`Edit ${item.title}`} onClick={() => beginSceneEdit(item)} disabled={busy}><Pencil size={15} /></button><div><button className="icon-button" title="Move scene up" aria-label={`Move ${item.title} up`} disabled={busy || index === 0} onClick={() => void reorderScenes(item.id, scenes[index - 1]?.id || item.id)}><ArrowUp size={13} /></button><button className="icon-button" title="Move scene down" aria-label={`Move ${item.title} down`} disabled={busy || index === scenes.length - 1} onClick={() => void reorderScenes(item.id, scenes[index + 1]?.id || item.id)}><ArrowDown size={13} /></button></div></div>
            </div>)}
          </div>
          <div className="sequence-hint"><GripVertical size={14} /> Drag scenes to reorder</div>
        </section>
        <section className="canvas-panel" aria-label="Selected scene">{scene ? <>
          <div className="scene-context-header">
            <button className="button button-accent" onClick={() => beginSceneEdit()} disabled={busy}><Pencil size={16} /> Edit scene</button>
            <div className="scene-context-title"><h2>{scene.title}</h2><span>Scene {selectedScene + 1} of {scenes.length} · {scene.required ? "Required" : "Optional"}</span></div>
          </div>
          <div className="canvas-body"><div className="canvas-meta"><span>SCENE {String(selectedScene + 1).padStart(2, "0")} · {scene.sceneType.toUpperCase()}</span><span>{scene.layoutMode === "template" ? templates.find((template) => template.id === scene.templateId)?.title || "TEMPLATE LAYOUT" : `${scene.layoutMode.toUpperCase()} LAYOUT`}{scene.sourceSlide ? ` · SOURCE SLIDE ${scene.sourceSlide}` : " · NEW SCENE"}</span></div><div className="slide-canvas">{scene.previewImage ? <img className="slide-preview" src={`/api/projects/${project.id}/${scene.previewImage}`} alt={scene.sourceSlide ? `Rendered source slide ${scene.sourceSlide}` : scene.title} /> : <><div className="canvas-grid" /><div className="slide-label">{scene.title}</div><div className="slide-subtitle">{scene.extractedText.join(" · ") || "No additional slide text extracted"}</div></>}<div className="canvas-chip">{scene.previewImage ? "SOURCE SLIDE PREVIEW" : `${scene.layoutMode.toUpperCase()} LAYOUT`}</div></div><div className="canvas-footer"><div><strong>{scene.title}</strong><span>Speaker notes: {scene.notes || "None extracted"}</span><span>{scene.imageAssets.length} images / {scene.audioAssets.length} audio files{scene.sourceAnimationXml ? " / Native animation captured" : ""}{scene.sourceTransitionXml ? " / Transition captured" : ""}</span>{scene.renderWarning && <span className="render-warning">{scene.renderWarning}</span>}</div></div>{(scene.imageAssets.length > 0 || scene.audioAssets.length > 0) && <div className="scene-media-strip">{scene.imageAssets.map((assetId) => { const asset = project.storyboard.assets.find((item) => item.id === assetId); return asset ? <img key={assetId} src={`/api/projects/${project.id}/assets/${assetId}`} alt={asset.filename} title={asset.filename} /> : null; })}{scene.audioAssets.map((assetId) => { const asset = project.storyboard.assets.find((item) => item.id === assetId); return asset ? <div className="scene-audio" key={assetId}><span>{asset.filename}</span><audio controls preload="metadata" src={`/api/projects/${project.id}/assets/${assetId}`} /></div> : null; })}</div>}{scene.sceneType === "assessment" && <section className="assessment-authoring-launch" aria-label="Scene assessment">
            <div><strong>{scene.assessmentItem ? "Question authored" : "Add a knowledge check"}</strong><span>Author a question and set its scoring rules.</span></div>
            <button className="button button-outline" onClick={() => setShowAssessmentEditor(true)} disabled={busy}><ClipboardList size={15} />{scene.assessmentItem ? "Edit question" : "Create question"}</button>
          </section>}
          {scene.audioAssets.length > 0 && <section className="audio-requirement-setting"><label><input type="checkbox" checked={scene.audioRequired} onChange={(event) => void setSceneAudioRequired(event.target.checked)} disabled={busy} /><span><strong>Require attached audio to finish</strong><small>Learners must play every attached track to the end.</small></span></label></section>}
          </div></> : <div className="canvas-empty"><div className="brand-emblem"><BrandMark /></div><span className="brand-signature">Distinct parts. Deliberate design. Powerful learning.</span><strong>{project.id ? "Your storyboard starts here" : "Build your next learning experience"}</strong><span>{project.id ? "Bring in a PowerPoint or start with a blank scene." : "Create a project to organize scenes, media, and assessments."}</span>
          <div className="empty-start-actions">{project.id ? <><label className={`button button-accent upload-control ${busy ? "disabled" : ""}`}><FileUp size={16} /> Import PowerPoint<input type="file" aria-label="Import PowerPoint" accept=".pptx" onChange={uploadDeck} disabled={busy} /></label><button className="button button-outline" onClick={beginSceneCreate} disabled={busy}><Plus size={16} /> Add scene</button></> : <button className="button button-accent" onClick={() => setIsCreating(true)}><Plus size={16} /> Create project</button>}</div></div>}</section>
      </div></> : activeView === "media" ? <section className="template-library media-library"><div className="template-toolbar"><div><p className="eyebrow">PROJECT ASSETS</p><h2>Media library</h2><span className="field-hint">{scene ? `Selected scene: ${scene.title}` : "Select a scene to attach media"}</span></div><label className={`button button-accent upload-control ${!project.id || busy ? "disabled" : ""}`} title="Upload an image or audio file to this project."><Upload size={15} /> Upload media<input type="file" accept="image/jpeg,image/png,image/gif,image/webp,audio/mpeg,audio/mp4,audio/aac,audio/wav,audio/ogg,.jpg,.jpeg,.png,.gif,.webp,.mp3,.m4a,.aac,.wav,.ogg" aria-label="Upload media" onChange={uploadMedia} disabled={!project.id || busy} /></label></div>{project.storyboard.assets.length ? <div className="media-grid">{project.storyboard.assets.map((asset) => { const attached = scene ? (asset.kind === "image" ? scene.imageAssets : scene.audioAssets).includes(asset.id) : false; return <article className="media-item" key={asset.id}><div className="media-preview">{asset.kind === "image" ? <img src={`/api/projects/${project.id}/assets/${asset.id}`} alt={asset.filename} loading="lazy" /> : <audio controls preload="metadata" src={`/api/projects/${project.id}/assets/${asset.id}`} />}</div><div className="media-item-info"><strong title={asset.filename}>{asset.filename}</strong><small>{asset.kind} · {(asset.sizeBytes / 1024 / 1024).toFixed(2)} MB</small></div><MediaAttributionEditor projectId={project.id} asset={asset} onProjectUpdated={applyProject} /><button className={`button ${attached ? "button-dark" : "button-outline"}`} onClick={() => void attachAsset(asset)} disabled={!scene || busy}>{attached ? "Detach media" : "Attach to scene"}</button></article>; })}</div> : <div className="template-empty"><strong>No media in this project</strong><span>Upload images or audio, then attach them to the selected scene.</span></div>}</section> : <section className="template-library"><div className="template-toolbar"><div><p className="eyebrow">AUTHORING LIBRARY</p><h2>Scene templates</h2></div><label className={`button button-accent upload-control ${busy ? "disabled" : ""}`} title="Upload a PowerPoint template."><Upload size={15} /> Upload PPTX template<input type="file" accept=".pptx" aria-label="Upload PPTX template" onChange={uploadTemplate} disabled={busy} /></label></div>{templates.length ? <div className="template-list">{templates.map((template) => <article className="template-row" key={template.id}><div className="template-info"><strong>{template.title}</strong><span>{template.description || "No description"}</span><small>{template.filename} · {(template.sizeBytes / 1024 / 1024).toFixed(1)} MB</small></div><div className="template-actions"><label className={`button button-outline upload-control ${busy ? "disabled" : ""}`} title="Replace this template from a PPTX file."><FileUp size={14} /> Replace PPTX<input type="file" accept=".pptx" aria-label="Replace template PowerPoint" onChange={(event) => replaceTemplateSource(event, template.id)} disabled={busy} /></label><button className="button button-outline" onClick={() => setTemplateDraft({ id: template.id, title: template.title, description: template.description })} disabled={busy}>Edit details</button></div></article>)}</div> : <div className="template-empty"><strong>No templates yet</strong><span>Upload a PowerPoint template to use it when creating scenes.</span></div>}</section>}

    </main>

    {showExport && <EditorDialog labelledBy="export-title" className="export-dialog" onClose={() => setShowExport(false)} busy={busy}>
      <div className="modal-head"><div><p className="eyebrow">DELIVER & BACK UP</p><h2 id="export-title">Export course</h2></div><button className="icon-button" onClick={() => setShowExport(false)} disabled={busy} aria-label="Close export"><X size={19} /></button></div>
      <p className="export-project-name">{project.title}</p>
      <section className="export-section"><h3>Learning management system</h3><p>Build a portable course package for your LMS.</p><div className="export-actions"><button className="button button-accent" onClick={() => void exportScorm2004()} disabled={busy}><Download size={16} /> Build SCORM 2004</button><button className="button button-outline" onClick={() => void exportScorm12()} disabled={busy}>Build SCORM 1.2</button></div>
        <label className="package-threshold"><span>Warn when a package exceeds</span><input aria-label="Package warning threshold in MB" type="number" min="1" max="4096" key={`${project.id}-${project.storyboard.exportSettings.packageWarningThresholdMB}`} defaultValue={project.storyboard.exportSettings.packageWarningThresholdMB} onBlur={(event) => { if (event.currentTarget.validity.valid && event.currentTarget.value !== "") void updatePackageWarningThreshold(Number(event.currentTarget.value)); else event.currentTarget.value = String(project.storyboard.exportSettings.packageWarningThresholdMB); }} disabled={busy} /><span>MB</span></label>
        <div className="export-actions report-actions"><button className="button button-outline" onClick={() => void downloadScormReport("scorm2004")} disabled={busy}>Report 2004 <Download size={14} /></button><button className="button button-outline" onClick={() => void downloadScormReport("scorm12")} disabled={busy}>Report 1.2 <Download size={14} /></button></div>
      </section>
      <section className="export-section"><h3>Storyboard backup</h3><p>Save or restore storyboard data and asset references. Media files are stored separately.</p><div className="export-actions"><button className="button button-outline" onClick={() => void exportStoryboard()} disabled={busy}><Download size={15} /> Download JSON</button><label className={`button button-outline upload-control ${busy ? "disabled" : ""}`}><img src={restoreIcon} alt="" width="16" height="16" /> Restore JSON<input type="file" aria-label="Restore JSON" accept="application/json,.json" onChange={importStoryboard} disabled={busy} /></label></div></section>
      {assessmentItemCount >= 2 && <section className="export-section"><h3>Assessment test</h3><p>Export all authored questions together as a QTI 2.1 test.</p><button className="button button-outline" onClick={() => void exportAssessmentTest()} disabled={busy}><ClipboardList size={15} /> Download QTI test</button></section>}
      {error && <p className="export-error" role="alert">{error}</p>}{feedback && <p className="export-feedback" role="status">{feedback}</p>}{busy && <p role="status">Working…</p>}
    </EditorDialog>}
    {showCompletionSettings && <CompletionSettingsEditor project={project} onClose={() => setShowCompletionSettings(false)} onProjectUpdated={applyProject} />}
    {showEnhancementReview && <EnhancementReviewView project={project} onClose={() => setShowEnhancementReview(false)} onProjectUpdated={applyProject} />}
    {showValidation && <ValidationView projectId={project.id} onClose={() => setShowValidation(false)} onOpenScene={(sceneId, issueCode) => { const index = scenes.findIndex((item) => item.id === sceneId); setShowValidation(false); if (index >= 0) setSelectedScene(index); if (issueCode === "missing-image-alt-text") setShowAccessibility(true); else if (issueCode === "missing-assessment-item") setShowAssessmentEditor(true); else setActiveView("storyboard"); }} />}
    {showAccessibility && <AccessibilityView projectId={project.id} scenes={scenes} assets={project.storyboard.assets} onClose={() => setShowAccessibility(false)} onProjectUpdated={applyProject} />}
    {showGoldenPath && <GoldenPathView project={project} onClose={() => setShowGoldenPath(false)} onCreateProject={() => { setShowGoldenPath(false); setIsCreating(true); }} onOpenStoryboard={() => { setShowGoldenPath(false); setActiveView("storyboard"); }} onOpenMedia={() => { setShowGoldenPath(false); setActiveView("media"); }} onOpenAccessibility={() => { setShowGoldenPath(false); setShowAccessibility(true); }} onOpenPreview={() => { setShowGoldenPath(false); if (project.id) setShowPreview(true); }} onRunValidation={() => { setShowGoldenPath(false); setShowValidation(true); }} />}
    {showPreview && project.id && <CoursePreview project={project} onClose={() => setShowPreview(false)} />}
    {showAssessmentEditor && project.id && scene?.sceneType === "assessment" && <AssessmentEditor projectId={project.id} projectTitle={project.title} scene={scene} scenes={scenes}
      onClose={() => setShowAssessmentEditor(false)}
      onProjectUpdated={applyProject}
    />}
    {isCreating && <EditorDialog labelledBy="create-project-title" onClose={() => setIsCreating(false)} busy={busy}><div className="modal-head"><div><p className="eyebrow">NEW PROJECT</p><h2 id="create-project-title">Name your course</h2></div><button className="icon-button" onClick={() => setIsCreating(false)} disabled={busy} aria-label="Close new project"><X size={18} /></button></div><input aria-label="Course name" value={title} onChange={(event) => setTitle(event.target.value)} onKeyDown={(event) => event.key === "Enter" && createProject()} placeholder="e.g. Equipment Inspection Fundamentals" /><button className="button button-accent modal-submit" disabled={busy || !title.trim()} onClick={createProject}>Create project <ChevronRight size={16} /></button>{error && <p role="alert">{error}</p>}</EditorDialog>}
    {sceneDraft && <EditorDialog className="scene-editor" labelledBy="scene-editor-title" onClose={() => setSceneDraft(null)} busy={busy}><div className="modal-head"><div><p className="eyebrow">SCENE SETTINGS</p><h2 id="scene-editor-title">{sceneDraft.id ? "Edit scene" : "New scene"}</h2></div><button className="icon-button" onClick={() => setSceneDraft(null)} disabled={busy} aria-label="Close scene editor"><X size={18} /></button></div><label>Scene title<input value={sceneDraft.title} maxLength={120} onChange={(event) => setSceneDraft({ ...sceneDraft, title: event.target.value })} /></label><label>Scene type<select value={sceneDraft.sceneType} onChange={(event) => setSceneDraft({ ...sceneDraft, sceneType: event.target.value as SceneType })}><option value="content">Content</option><option value="title">Title</option><option value="assessment">Assessment</option><option value="media">Media</option><option value="interaction">Interaction</option><option value="summary">Summary</option></select></label><label>Scene layout<select value={sceneDraft.layoutMode} onChange={(event) => setSceneDraft({ ...sceneDraft, layoutMode: event.target.value as LayoutMode, templateId: event.target.value === "template" ? sceneDraft.templateId : "" })}><option value="fidelity">Fidelity</option><option value="hybrid">Hybrid</option><option value="native">Native</option><option value="template">Template</option></select></label>{sceneDraft.layoutMode === "template" && <label>Template<select value={sceneDraft.templateId} onChange={(event) => setSceneDraft({ ...sceneDraft, templateId: event.target.value })}><option value="">Choose a template</option>{templates.map((template) => <option value={template.id} key={template.id}>{template.title}</option>)}</select>{templates.length === 0 && <span className="field-hint">Upload a PPTX template in the Templates section first.</span>}</label>}<label>On-screen text<textarea rows={5} value={sceneDraft.screenText} onChange={(event) => setSceneDraft({ ...sceneDraft, screenText: event.target.value })} /></label><label>Action description<textarea rows={3} maxLength={5000} value={sceneDraft.actionDescription} onChange={(event) => setSceneDraft({ ...sceneDraft, actionDescription: event.target.value })} placeholder="Describe movement, interaction, or timed actions shown in this scene" /></label><label>Speaker notes<textarea rows={4} value={sceneDraft.notes} onChange={(event) => setSceneDraft({ ...sceneDraft, notes: event.target.value })} /></label>
      <label className="required-toggle"><input type="checkbox" checked={sceneDraft.required} onChange={(event) => setSceneDraft({ ...sceneDraft, required: event.target.checked })} /> Required scene</label>
      {error && <p className="export-error" role="alert">{error}</p>}<div className="modal-actions"><button className="button button-outline" onClick={() => setSceneDraft(null)} disabled={busy}>Cancel</button><button className="button button-accent" onClick={saveScene} disabled={busy || !sceneDraft.title.trim() || (sceneDraft.layoutMode === "template" && !sceneDraft.templateId)}>{sceneDraft.id ? "Save changes" : "Create scene"} <Check size={15} /></button></div></EditorDialog>}
      {templateDraft && <EditorDialog className="scene-editor" labelledBy="template-editor-title" onClose={() => setTemplateDraft(null)} busy={busy}><div className="modal-head"><div><p className="eyebrow">TEMPLATE LIBRARY</p><h2 id="template-editor-title">Edit template</h2></div><button className="icon-button" onClick={() => setTemplateDraft(null)} disabled={busy} aria-label="Close template editor"><X size={18} /></button></div><label>Template name<input value={templateDraft.title} maxLength={120} onChange={(event) => setTemplateDraft({ ...templateDraft, title: event.target.value })} /></label><label>Description<textarea rows={4} value={templateDraft.description} maxLength={1000} onChange={(event) => setTemplateDraft({ ...templateDraft, description: event.target.value })} /></label>
      {error && <p className="export-error" role="alert">{error}</p>}<div className="modal-actions"><button className="button button-outline" onClick={() => setTemplateDraft(null)} disabled={busy}>Cancel</button><button className="button button-accent" onClick={saveTemplate} disabled={busy || !templateDraft.title.trim()}>Save template <Check size={15} /></button></div></EditorDialog>}
    </div>;
}
