import { ChangeEvent, useEffect, useState } from "react";
import { Accessibility, ArrowDown, ArrowUp, BookOpen, Check, ChevronRight, ClipboardList, Download, FileJson, FileUp, GripVertical, Layers3, Plus, Route, Settings2, ShieldCheck, Sparkles, Upload, X } from "lucide-react";
import { ValidationView } from "./ValidationView";
import { AccessibilityView } from "./AccessibilityView";
import { GoldenPathView } from "./GoldenPathView";
import { CoursePreview } from "./CoursePreview";
import { AssessmentEditor } from "./AssessmentEditor";
import { MediaAttributionEditor } from "./MediaAttributionEditor";
import { CompletionSettingsEditor } from "./CompletionSettingsEditor";
import { EnhancementReviewView } from "./EnhancementReviewView";
import "./project-switcher.css";
import "./storyboard-transfer.css";
import "./audio-requirement.css";
import "./assessment-editor.css";
import "./project-actions.css";

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
    if (!title.trim()) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title }) });
      if (!response.ok) throw new Error("Project could not be created.");
      applyProject(await response.json() as Project);
      setIsCreating(false);
      setTitle("");
    } catch {
      setError("Project could not be created. Check that the API is running and try again.");
    } finally {
      setBusy(false);
    }
  }

  function beginSceneCreate() {
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

  function beginSceneEdit() {
    if (!scene) return;
    setSceneDraft({ id: scene.id, title: scene.title, screenText: scene.extractedText.join("\n"), actionDescription: scene.actionDescription, notes: scene.notes, required: scene.required, audioRequired: scene.audioRequired, sceneType: scene.sceneType, layoutMode: scene.layoutMode, templateId: scene.templateId || "" });
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
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark"><Sparkles size={17} /></div><span>CHIMERA</span></div>
      <div className="workspace-label">WORKSPACE <button className="icon-button" title="Workspace settings"><Settings2 size={15} /></button></div>
      <nav><button className={`nav-item ${activeView === "storyboard" ? "active" : ""}`} onClick={() => setActiveView("storyboard")}><Layers3 size={17} /> Storyboard</button><button className={`nav-item ${activeView === "media" ? "active" : ""}`} onClick={() => setActiveView("media")}><FileUp size={17} /> Media library</button><button className={`nav-item ${activeView === "templates" ? "active" : ""}`} onClick={() => setActiveView("templates")}><BookOpen size={17} /> Templates</button></nav>
      <div className="sidebar-footer"><div className="status-dot" /> Local workspace <span className="online">●</span></div>
    </aside>
    <main className="main-content">
      <header className="topbar"><div><p className="eyebrow">COURSE AUTHORING / STORYBOARD</p><h1>{project.title || "Untitled course"}</h1></div><div className="top-actions"><button className="button button-outline" onClick={() => setIsCreating(true)} title="Start a new project and storyboard."><Plus size={15} /> Create project</button><span className="save-state" title="Your latest edits are stored locally."><Check size={14} /> Saved locally</span></div></header>
      {error && <div className="notice"><span>{error}</span><button className="icon-button" onClick={() => setError("")}><X size={16} /></button></div>}
      {feedback && <div className="notice success-notice" role="status"><span>{feedback}</span><button className="icon-button" onClick={() => setFeedback("")} aria-label="Dismiss message"><X size={16} /></button></div>}
      <div className="project-controls-row"><label className="project-switcher"><span>PROJECT</span><select value={project.id} onChange={(event) => void switchProject(event.target.value)} disabled={busy || projects.length === 0} aria-label="Switch project"><option value="" disabled>Select a project</option>{[...projects].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)).map((item) => <option key={item.id} value={item.id}>{item.title} · {item.sceneCount} scenes</option>)}</select></label></div>
      {activeView === "storyboard" ? <><section className="toolbar"><div className="toolbar-title"><span className="section-kicker">01 PREPARE</span> Scenes <span className="count">{scenes.length}</span></div><div className="toolbar-actions"><label className={`button button-outline ${!project.id || busy ? "disabled" : ""}`} title="Start a storyboard from PowerPoint slides."><FileUp size={15} /> Import PowerPoint<input type="file" accept=".pptx" onChange={uploadDeck} disabled={!project.id || busy} hidden /></label><button className="button button-outline" onClick={beginSceneCreate} disabled={!project.id || busy} title="Add a new editable scene to this storyboard."><Plus size={16} /> Add scene</button></div>
      </section>
      {activeView === "storyboard" && <section className="project-phase-review" aria-label="Review phase"><span className="phase-group-label">02 REVIEW</span><div className="validation-launch-actions"><button className="button button-outline" onClick={() => setShowGoldenPath(true)} title="Follow the recommended project review sequence."><Route size={15} /> Guided review</button><button className="button button-outline" onClick={() => setShowAccessibility(true)} disabled={!project.id} title="Review descriptions for images used in scenes."><Accessibility size={15} /> Check image descriptions</button><button className="button button-outline" onClick={() => setShowValidation(true)} disabled={!project.id} title="Find missing content and setup issues."><ShieldCheck size={15} /> Validate storyboard</button><button className="button button-dark" onClick={() => setShowPreview(true)} disabled={!project.id || busy} title="Preview the course as a learner."><Upload size={15} /> Preview course</button><button className="button button-outline" onClick={() => setShowCompletionSettings(true)} disabled={!project.id || busy} title="Set the weighted course passing score."><Settings2 size={15} /> Completion rules</button><button className="button button-outline" onClick={() => setShowEnhancementReview(true)} disabled={!project.id || busy} title="Review each proposed storyboard change before applying it."><Sparkles size={15} /> Review suggestions</button></div></section>}
      {activeView === "storyboard" && <section className="storyboard-transfer-bar" aria-label="Storyboard backup and export"><div className="storyboard-transfer-copy"><span className="phase-group-label">03 EXPORT</span><strong>Storyboard backup</strong><span>Save or restore storyboard data and asset references.</span></div><div className="storyboard-transfer-actions"><label className="package-threshold" title="Warn when a compressed package exceeds this size."><span>WARN ABOVE</span><input type="number" min="1" max="4096" value={project.storyboard.exportSettings.packageWarningThresholdMB} onChange={(event) => { const value = Number(event.target.value); if (Number.isFinite(value)) applyProject({ ...project, storyboard: { ...project.storyboard, exportSettings: { packageWarningThresholdMB: value } } }); }} onBlur={(event) => void updatePackageWarningThreshold(Number(event.currentTarget.value))} disabled={!project.id || busy} /><span>MB</span></label><button className="button button-outline" onClick={() => void exportStoryboard()} disabled={!project.id || busy} title="Download a JSON backup of this storyboard."><Download size={15} /> Download JSON</button><label className={`button button-outline ${!project.id || busy ? "disabled" : ""}`} title="Replace this storyboard from a JSON backup."><FileJson size={15} /> Restore JSON<input type="file" accept="application/json,.json" onChange={importStoryboard} disabled={!project.id || busy} hidden /></label><button className="button button-accent" onClick={() => void exportScorm2004()} disabled={!project.id || busy} title="Build a SCORM 2004 4th Edition package for Blackboard Learn.">Build SCORM 2004 <ChevronRight size={16} /></button><button className="button button-outline" onClick={() => void exportScorm12()} disabled={!project.id || busy} title="Build a SCORM 1.2 compatibility package.">Build SCORM 1.2 <ChevronRight size={16} /></button><button className="button button-outline" onClick={() => void downloadScormReport("scorm2004")} disabled={!project.id || busy} title="Download the latest SCORM 2004 build diagnostics.">Report 2004 <Download size={15} /></button><button className="button button-outline" onClick={() => void downloadScormReport("scorm12")} disabled={!project.id || busy} title="Download the latest SCORM 1.2 build diagnostics.">Report 1.2 <Download size={15} /></button></div></section>}
      {activeView === "storyboard" && scene?.sceneType === "assessment" ? <section className="assessment-authoring-launch"><div><strong>{scene.assessmentItem ? "Question authored" : "No question authored"}</strong><span>Seven question formats · QTI 2.1 item export</span></div>{assessmentItemCount >= 2 && <button className="button button-outline" onClick={() => void exportAssessmentTest()} disabled={busy} title="Download all authored questions as a QTI 2.1 test."><Download size={15} /> Download QTI test</button>}<button className="button button-outline" onClick={() => setShowAssessmentEditor(true)} disabled={busy} title={scene.assessmentItem ? "Edit this scene's question and scoring rules." : "Create a scored question for this scene."}><ClipboardList size={15} />{scene.assessmentItem ? "Edit question" : "Create question"}</button></section> : null}
      <div className="work-area">
        <section className="scene-list"><div className="list-header"><span>SEQUENCE</span><span>STATUS</span></div>{scenes.length === 0 ? <div className="empty-list"><div className="empty-icon"><FileUp size={22} /></div><strong>{project.id ? "Start your storyboard" : "Create a project to begin"}</strong><p>{project.id ? "Import a PowerPoint or add a scene." : "Create a project, then import a presentation or add a scene."}</p>{project.id && <label className="text-link">Choose a .pptx file<input type="file" accept=".pptx" onChange={uploadDeck} disabled={busy} hidden /></label>}</div> : scenes.map((item, index) => <div className={`scene-row-wrap ${draggingSceneId === item.id ? "dragging" : ""}`} key={item.id} draggable={!busy} onDragStart={(event) => { setDraggingSceneId(item.id); event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", item.id); }} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); const draggedId = event.dataTransfer.getData("text/plain") || draggingSceneId; if (draggedId) void reorderScenes(draggedId, item.id); }} onDragEnd={() => setDraggingSceneId(null)}><span className="scene-drag-handle" title="Drag to change scene order"><GripVertical size={16} /></span><button className={`scene-row ${selectedScene === index ? "selected" : ""}`} onClick={() => setSelectedScene(index)}><span className="scene-number">{String(index + 1).padStart(2, "0")}</span><span className="scene-copy"><strong>{item.title}</strong><small><span className="scene-signifier">{item.sceneType}</span><span className="scene-signifier">{item.layoutMode === "template" ? templates.find((template) => template.id === item.templateId)?.title || "template layout" : `${item.layoutMode} layout`}</span></small></span><span className={`scene-status ${item.required ? "required" : ""}`}>{item.required ? "Required" : "Optional"}</span></button><div className="scene-order-actions"><button type="button" className="icon-button" title="Move scene up" aria-label={`Move ${item.title} up`} disabled={busy || index === 0} onClick={() => void reorderScenes(item.id, scenes[index - 1]?.id || item.id)}><ArrowUp size={14} /></button><button type="button" className="icon-button" title="Move scene down" aria-label={`Move ${item.title} down`} disabled={busy || index === scenes.length - 1} onClick={() => void reorderScenes(item.id, scenes[index + 1]?.id || item.id)}><ArrowDown size={14} /></button></div></div>)}</section>
        <section className="canvas-panel">{scene ? <><div className="canvas-meta"><span>SCENE {String(selectedScene + 1).padStart(2, "0")} · {scene.sceneType.toUpperCase()}</span><span>{scene.layoutMode === "template" ? templates.find((template) => template.id === scene.templateId)?.title || "TEMPLATE LAYOUT" : `${scene.layoutMode.toUpperCase()} LAYOUT`}{scene.sourceSlide ? ` · SOURCE SLIDE ${scene.sourceSlide}` : " · NEW SCENE"}</span></div><div className="slide-canvas">{scene.previewImage ? <img className="slide-preview" src={`/api/projects/${project.id}/${scene.previewImage}`} alt={scene.sourceSlide ? `Rendered source slide ${scene.sourceSlide}` : scene.title} /> : <><div className="canvas-grid" /><div className="slide-label">{scene.title}</div><div className="slide-subtitle">{scene.extractedText.join(" · ") || "No additional slide text extracted"}</div></>}<div className="canvas-chip">{scene.previewImage ? "SOURCE SLIDE PREVIEW" : `${scene.layoutMode.toUpperCase()} LAYOUT`}</div></div><div className="canvas-footer"><div><strong>{scene.title}</strong><span>Speaker notes: {scene.notes || "None extracted"}</span><span>{scene.imageAssets.length} images / {scene.audioAssets.length} audio files{scene.sourceAnimationXml ? " / Native animation captured" : ""}{scene.sourceTransitionXml ? " / Transition captured" : ""}</span>{scene.renderWarning && <span className="render-warning">{scene.renderWarning}</span>}</div><button className="button button-outline" onClick={beginSceneEdit} disabled={busy}><ChevronRight size={15} /> Edit scene</button></div>{(scene.imageAssets.length > 0 || scene.audioAssets.length > 0) && <div className="scene-media-strip">{scene.imageAssets.map((assetId) => { const asset = project.storyboard.assets.find((item) => item.id === assetId); return asset ? <img key={assetId} src={`/api/projects/${project.id}/assets/${assetId}`} alt={asset.filename} title={asset.filename} /> : null; })}{scene.audioAssets.map((assetId) => { const asset = project.storyboard.assets.find((item) => item.id === assetId); return asset ? <div className="scene-audio" key={assetId}><span>{asset.filename}</span><audio controls preload="metadata" src={`/api/projects/${project.id}/assets/${assetId}`} /></div> : null; })}</div>}</> : <div className="canvas-empty"><Sparkles size={30} /><strong>Your storyboard starts here</strong><span>Import a presentation or create a scene.</span></div>}</section>
      </div></> : activeView === "media" ? <section className="template-library media-library"><div className="template-toolbar"><div><p className="eyebrow">PROJECT ASSETS</p><h2>Media library</h2><span className="field-hint">{scene ? `Selected scene: ${scene.title}` : "Select a scene to attach media"}</span></div><label className={`button button-accent ${!project.id || busy ? "disabled" : ""}`} title="Upload an image or audio file to this project."><Upload size={15} /> Upload media<input type="file" accept="image/jpeg,image/png,image/gif,image/webp,audio/mpeg,audio/mp4,audio/aac,audio/wav,audio/ogg,.jpg,.jpeg,.png,.gif,.webp,.mp3,.m4a,.aac,.wav,.ogg" onChange={uploadMedia} disabled={!project.id || busy} hidden /></label></div>{project.storyboard.assets.length ? <div className="media-grid">{project.storyboard.assets.map((asset) => { const attached = scene ? (asset.kind === "image" ? scene.imageAssets : scene.audioAssets).includes(asset.id) : false; return <article className="media-item" key={asset.id}><div className="media-preview">{asset.kind === "image" ? <img src={`/api/projects/${project.id}/assets/${asset.id}`} alt={asset.filename} loading="lazy" /> : <audio controls preload="metadata" src={`/api/projects/${project.id}/assets/${asset.id}`} />}</div><div className="media-item-info"><strong title={asset.filename}>{asset.filename}</strong><small>{asset.kind} · {(asset.sizeBytes / 1024 / 1024).toFixed(2)} MB</small></div><MediaAttributionEditor projectId={project.id} asset={asset} onProjectUpdated={applyProject} /><button className={`button ${attached ? "button-dark" : "button-outline"}`} onClick={() => void attachAsset(asset)} disabled={!scene || busy}>{attached ? "Detach media" : "Attach to scene"}</button></article>; })}</div> : <div className="template-empty"><strong>No media in this project</strong><span>Upload images or audio, then attach them to the selected scene.</span></div>}</section> : <section className="template-library"><div className="template-toolbar"><div><p className="eyebrow">AUTHORING LIBRARY</p><h2>Scene templates</h2></div><label className={`button button-accent ${busy ? "disabled" : ""}`} title="Upload an image or audio file to this project."><Upload size={15} /> Upload PPTX template<input type="file" accept=".pptx" onChange={uploadTemplate} disabled={busy} hidden /></label></div>{templates.length ? <div className="template-list">{templates.map((template) => <article className="template-row" key={template.id}><div className="template-info"><strong>{template.title}</strong><span>{template.description || "No description"}</span><small>{template.filename} · {(template.sizeBytes / 1024 / 1024).toFixed(1)} MB</small></div><div className="template-actions"><label className={`button button-outline ${busy ? "disabled" : ""}`} title="Replace this template from a PPTX file."><FileUp size={14} /> Replace PPTX<input type="file" accept=".pptx" onChange={(event) => replaceTemplateSource(event, template.id)} disabled={busy} hidden /></label><button className="button button-outline" onClick={() => setTemplateDraft({ id: template.id, title: template.title, description: template.description })} disabled={busy}>Edit details</button></div></article>)}</div> : <div className="template-empty"><strong>No templates yet</strong><span>Upload a PowerPoint template to use it when creating scenes.</span></div>}</section>}
      {activeView === "storyboard" && scene?.audioAssets.length ? <section className="audio-requirement-setting"><label><input type="checkbox" checked={scene.audioRequired} onChange={(event) => void setSceneAudioRequired(event.target.checked)} disabled={busy} /><span><strong>Require attached audio to finish</strong><small>Scene completion waits for every attached audio track to play to the end in Preview.</small></span></label></section> : null}
    </main>
    {showCompletionSettings && <CompletionSettingsEditor project={project} onClose={() => setShowCompletionSettings(false)} onProjectUpdated={applyProject} />}
    {showEnhancementReview && <EnhancementReviewView project={project} onClose={() => setShowEnhancementReview(false)} onProjectUpdated={applyProject} />}
    {showValidation && <ValidationView projectId={project.id} onClose={() => setShowValidation(false)} onOpenScene={(sceneId, issueCode) => { const index = scenes.findIndex((item) => item.id === sceneId); setShowValidation(false); if (index >= 0) setSelectedScene(index); if (issueCode === "missing-image-alt-text") setShowAccessibility(true); else if (issueCode === "missing-assessment-item") setShowAssessmentEditor(true); else setActiveView("storyboard"); }} />}
    {showAccessibility && <AccessibilityView projectId={project.id} scenes={scenes} assets={project.storyboard.assets} onClose={() => setShowAccessibility(false)} onProjectUpdated={setProject} />}
    {showGoldenPath && <GoldenPathView project={project} onClose={() => setShowGoldenPath(false)} onCreateProject={() => { setShowGoldenPath(false); setIsCreating(true); }} onOpenStoryboard={() => { setShowGoldenPath(false); setActiveView("storyboard"); }} onOpenMedia={() => { setShowGoldenPath(false); setActiveView("media"); }} onOpenAccessibility={() => { setShowGoldenPath(false); setShowAccessibility(true); }} onOpenPreview={() => { setShowGoldenPath(false); if (project.id) setShowPreview(true); }} onRunValidation={() => { setShowGoldenPath(false); setShowValidation(true); }} />}
    {showPreview && project.id && <CoursePreview project={project} onClose={() => setShowPreview(false)} />}
    {showAssessmentEditor && project.id && scene?.sceneType === "assessment" && <AssessmentEditor projectId={project.id} projectTitle={project.title} scene={scene} scenes={scenes}
      onClose={() => setShowAssessmentEditor(false)}
      onProjectUpdated={applyProject}
    />}
    {isCreating && <div className="modal-backdrop" onClick={() => setIsCreating(false)}><div className="modal" onClick={(event) => event.stopPropagation()}><div className="modal-head"><div><p className="eyebrow">NEW PROJECT</p><h2>Name your course</h2></div><button className="icon-button" onClick={() => setIsCreating(false)}><X size={18} /></button></div><input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} onKeyDown={(event) => event.key === "Enter" && createProject()} placeholder="e.g. Equipment Inspection Fundamentals" /><button className="button button-accent modal-submit" disabled={busy || !title.trim()} onClick={createProject}>Create project <ChevronRight size={16} /></button></div></div>}
    {sceneDraft && <div className="modal-backdrop" onClick={() => !busy && setSceneDraft(null)}><section className="modal scene-editor" role="dialog" aria-modal="true" aria-labelledby="scene-editor-title" onClick={(event) => event.stopPropagation()}><div className="modal-head"><div><p className="eyebrow">SCENE SETTINGS</p><h2 id="scene-editor-title">{sceneDraft.id ? "Edit scene" : "New scene"}</h2></div><button className="icon-button" onClick={() => setSceneDraft(null)} disabled={busy} aria-label="Close scene editor"><X size={18} /></button></div><label>Scene title<input value={sceneDraft.title} maxLength={120} onChange={(event) => setSceneDraft({ ...sceneDraft, title: event.target.value })} /></label><label>Scene type<select value={sceneDraft.sceneType} onChange={(event) => setSceneDraft({ ...sceneDraft, sceneType: event.target.value as SceneType })}><option value="content">Content</option><option value="title">Title</option><option value="assessment">Assessment</option><option value="media">Media</option><option value="interaction">Interaction</option><option value="summary">Summary</option></select></label><label>Scene layout<select value={sceneDraft.layoutMode} onChange={(event) => setSceneDraft({ ...sceneDraft, layoutMode: event.target.value as LayoutMode, templateId: event.target.value === "template" ? sceneDraft.templateId : "" })}><option value="fidelity">Fidelity</option><option value="hybrid">Hybrid</option><option value="native">Native</option><option value="template">Template</option></select></label>{sceneDraft.layoutMode === "template" && <label>Template<select value={sceneDraft.templateId} onChange={(event) => setSceneDraft({ ...sceneDraft, templateId: event.target.value })}><option value="">Choose a template</option>{templates.map((template) => <option value={template.id} key={template.id}>{template.title}</option>)}</select>{templates.length === 0 && <span className="field-hint">Upload a PPTX template in the Templates section first.</span>}</label>}<label>On-screen text<textarea rows={5} value={sceneDraft.screenText} onChange={(event) => setSceneDraft({ ...sceneDraft, screenText: event.target.value })} /></label><label>Action description<textarea rows={3} maxLength={5000} value={sceneDraft.actionDescription} onChange={(event) => setSceneDraft({ ...sceneDraft, actionDescription: event.target.value })} placeholder="Describe movement, interaction, or timed actions shown in this scene" /></label><label>Speaker notes<textarea rows={4} value={sceneDraft.notes} onChange={(event) => setSceneDraft({ ...sceneDraft, notes: event.target.value })} /></label>
      <label className="required-toggle"><input type="checkbox" checked={sceneDraft.required} onChange={(event) => setSceneDraft({ ...sceneDraft, required: event.target.checked })} /> Required scene</label>
      <div className="modal-actions"><button className="button button-outline" onClick={() => setSceneDraft(null)} disabled={busy}>Cancel</button><button className="button button-accent" onClick={saveScene} disabled={busy || !sceneDraft.title.trim() || (sceneDraft.layoutMode === "template" && !sceneDraft.templateId)}>{sceneDraft.id ? "Save changes" : "Create scene"} <Check size={15} /></button></div></section></div>}
      {templateDraft && <div className="modal-backdrop" onClick={() => !busy && setTemplateDraft(null)}><section className="modal scene-editor" role="dialog" aria-modal="true" aria-labelledby="template-editor-title" onClick={(event) => event.stopPropagation()}><div className="modal-head"><div><p className="eyebrow">TEMPLATE LIBRARY</p><h2 id="template-editor-title">Edit template</h2></div><button className="icon-button" onClick={() => setTemplateDraft(null)} disabled={busy} aria-label="Close template editor"><X size={18} /></button></div><label>Template name<input value={templateDraft.title} maxLength={120} onChange={(event) => setTemplateDraft({ ...templateDraft, title: event.target.value })} /></label><label>Description<textarea rows={4} value={templateDraft.description} maxLength={1000} onChange={(event) => setTemplateDraft({ ...templateDraft, description: event.target.value })} /></label>
      <div className="modal-actions"><button className="button button-outline" onClick={() => setTemplateDraft(null)} disabled={busy}>Cancel</button><button className="button button-accent" onClick={saveTemplate} disabled={busy || !templateDraft.title.trim()}>Save template <Check size={15} /></button></div></section></div>}
    </div>;
}
