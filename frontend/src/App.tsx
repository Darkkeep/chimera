import { createPortal } from "react-dom";
import { ChangeEvent, useEffect, useRef, useState } from "react";
import { Accessibility, ArrowDown, ArrowUp, BookOpen, Check, ChevronDown, ChevronRight, ClipboardList, Download, FileText, FileUp, GripVertical, Layers3, Pencil, Play, Plus, Route, Settings2, ShieldCheck, Sparkles, Trash2, Upload, X } from "lucide-react";
import { ValidationView } from "./ValidationView";
import { AccessibilityView } from "./AccessibilityView";
import { GoldenPathView } from "./GoldenPathView";
import { CoursePreview } from "./CoursePreview";
import { AssessmentEditor } from "./AssessmentEditor";
import type { MediaPlacement } from "./media";
import { MediaToolsPanel } from "./MediaToolsPanel";
import { MediaLibraryItem } from "./MediaLibraryItem";
import { GeneratedMediaPanel } from "./GeneratedMediaPanel";
import { ManagementView } from "./ManagementView";
import { ProjectOptions } from "./ProjectOptions";
import { AIConnectionPanel } from "./AIConnectionPanel";
import { IntelligenceEnginePanel } from "./IntelligenceEnginePanel";
import "./readiness.css";
import { CompletionSettingsEditor } from "./CompletionSettingsEditor";
import { EnhancementReviewView } from "./EnhancementReviewView";
import { EditorDialog } from "./EditorDialog";
import { AppearanceSelector } from "./AppearanceSelector";
import { BrandMark } from "./BrandMark";
import { revisionConflictMessage, storyboardWriteHeaders } from "./revision";
import restoreIcon from "./assets/cutout-56-a86a43163042.png";
import "./audio-requirement.css";
import "./assessment-editor.css";
import { createChimeraOnboarding } from "./onboarding";
import { chimeraJourneys, reportOnboardingOutcome } from "./onboarding-journeys";
import type { Step } from "@guided-workflows/onboarding";
import { useSession } from "./AuthGate";
import { ProjectAccessPanel } from "./ProjectAccessPanel";
import { ReviewLinkView } from "./ReviewLinkView";
import { SceneVisualEditor } from "./SceneVisualEditor";
import type { GeneratedSceneDraft, SceneEditSettings } from "./SceneVisualEditor";
import { AssessmentDraftPreview } from "./AssessmentDraftPreview";
import { AssessmentsEditor } from "./AssessmentsEditor";
import { SceneSurface } from "./SceneSurface";
import type { SceneLayout } from "./SceneSurface";
import { PythiaAnalysisView } from "./PythiaAnalysisView";
import { PythiaTransformView } from "./PythiaTransformView";
import { PythiaAssessmentDesignView } from "./PythiaAssessmentDesignView";
import { PythiaCourseReviewView } from "./PythiaCourseReviewView";
import { PythiaSceneActions } from "./PythiaSceneActions";
import { ProjectBackgroundPanel } from "./ProjectBackgroundPanel";
import { effectiveBackgroundAsset } from "./background";

type LayoutMode = "fidelity" | "hybrid" | "native" | "template";
type SceneType = "content" | "title" | "question" | "media" | "interaction" | "summary";
export type AssessmentChoice = { identifier: string; text: string };
export type AssessmentPair = { sourceIdentifier: string; targetIdentifier: string };
export type QuestionMetadata = { title: string; description: string; tags: string[]; author: string; source: string; language: string; difficulty: "" | "easy" | "medium" | "hard"; learningObjectiveRefs: string[] };
type AssessmentBase = { identifier: string; prompt: string; correctFeedback: string; incorrectFeedback: string; metadata?: QuestionMetadata };
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
export type Scene = { videoAssets?: string[]; mediaPlacements?: MediaPlacement[]; excludedCourseMedia?: string[]; visualLayout?: SceneLayout | null; backgroundAsset?: string | null; id: string; sourceSlide: number | null; title: string; sceneType: SceneType; layoutMode: LayoutMode; templateId: string | null; required: boolean; audioRequired: boolean; assessmentItem: AssessmentItem | null; assessmentSettings: AssessmentSettings | null; extractedText: string[]; actionDescription: string; narration: string; imageAssets: string[]; imageAltText: Record<string, string>; decorativeImages: string[]; audioAssets: string[]; previewImage: string | null; renderWarning: string | null; sourceAnimationXml: string | null; sourceTransitionXml: string | null; notes: string };
export type Asset = { id: string; kind: "image" | "audio" | "video"; transcript?: string; captionsVtt?: string; language?: string; sharedSourceId?: string | null; role?: "content" | "background"; filename: string; contentType: string; sizeBytes: number; sha256: string; path: string; attributionText: string; attributionStatus: "draft" | "complete" };
export type ProjectSummary = { id: string; title: string; sceneCount: number; updatedAt: string; hasSourceDeck: boolean; parentProjectId?: string | null; siblingOrder?: number; metadataRevision?: number };
export type Assessment = { id: string; title: string; questionSceneIds: string[] };
export type Project = ProjectSummary & { storyboard: { backgroundAsset?: string | null; courseMedia?: MediaPlacement[]; revision: number; scenes: Scene[]; assets: Asset[]; assessments?: Assessment[]; completionSettings: CourseCompletionSettings; exportSettings: ExportSettings } };
type SceneDraft = { id: string | null; title: string; screenText: string; actionDescription: string; notes: string; required: boolean; audioRequired: boolean; sceneType: SceneType; layoutMode: LayoutMode; templateId: string };
type Template = { id: string; title: string; description: string; filename: string; sizeBytes: number; updatedAt: string };
type TemplateDraft = { id: string; title: string; description: string };
type Readiness = { pendingProposals: number; unresolvedComments: number; outdatedComments: number; missingMedia: number; publicationBlockers: number };
type CourseSceneDraft = GeneratedSceneDraft & { included: boolean };

const emptyProject: Project = { id: "", title: "", sceneCount: 0, updatedAt: "", hasSourceDeck: false, storyboard: { revision: 1, scenes: [], assets: [], completionSettings: { passingScore: 80, includeOptionalAssessments: false }, exportSettings: { packageWarningThresholdMB: 200 } } };
const MAX_STORYBOARD_JSON_BYTES = 25 * 1024 * 1024;

export function App() {
  const { session, logout } = useSession();
  const [reviewToken, setReviewToken] = useState(() => location.hash.startsWith("#review=") ? location.hash.slice(8) : "");
  const [showProjectAccess, setShowProjectAccess] = useState(false);
  const [permissions, setPermissions] = useState({ canEdit: !session, canExport: !session, canManageMembers: false, canEnhance: !session });
  const [project, setProject] = useState<Project>(emptyProject);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [restoringProject, setRestoringProject] = useState(true);
  const [selectedScene, setSelectedScene] = useState(0);
  const [isCreating, setIsCreating] = useState(false);
  const [creatingParent, setCreatingParent] = useState<{ id: string; title: string } | null>(null);
  useEffect(() => { if (!isCreating) setCreatingParent(null); }, [isCreating]);
  const [title, setTitle] = useState("");
  const [aiConfiguredForProject, setAiConfiguredForProject] = useState<boolean | null>(null);
  const [courseDesignFiles, setCourseDesignFiles] = useState<File[]>([]);
  const [coursePrompt, setCoursePrompt] = useState("");
  const [courseResourceIds, setCourseResourceIds] = useState<string[]>([]);
  const [courseDraft, setCourseDraft] = useState<CourseSceneDraft[] | null>(null);
  const [courseDraftError, setCourseDraftError] = useState("");
  const [createdCourseForDraft, setCreatedCourseForDraft] = useState(false);
  const [sceneDraft, setSceneDraft] = useState<SceneDraft | null>(null);
  const [visualSceneId, setVisualSceneId] = useState<string | null>(null);
  const [sceneEditorPanel, setSceneEditorPanel] = useState<"canvas" | "details">("canvas");
  const [templateDraft, setTemplateDraft] = useState<TemplateDraft | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [activeView, setActiveView] = useState<"storyboard" | "media" | "templates">("storyboard");
  const [showValidation, setShowValidation] = useState(false);
  const [showAccessibility, setShowAccessibility] = useState(false);
  const [showGoldenPath, setShowGoldenPath] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [showAssessmentEditor, setShowAssessmentEditor] = useState(false);
  const [showCompletionSettings, setShowCompletionSettings] = useState(false);
  const [showAssessments, setShowAssessments] = useState(false);
  const [showEnhancementReview, setShowEnhancementReview] = useState(false);
  const [showPythiaAnalysis, setShowPythiaAnalysis] = useState(false);
  const [showPythiaTransform, setShowPythiaTransform] = useState(false);
  const [showPythiaAssessmentDesign, setShowPythiaAssessmentDesign] = useState(false);
  const [showPythiaCourseReview, setShowPythiaCourseReview] = useState(false);
  const [showReviewTools, setShowReviewTools] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showAIConnection, setShowAIConnection] = useState(false);
  const [showIntelligenceEngine, setShowIntelligenceEngine] = useState(false);
  const [showProjectBackground, setShowProjectBackground] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [showManagement, setShowManagement] = useState(true);
  const managementButtonRef = useRef<HTMLButtonElement>(null);
  const [includeWordAnswerKey, setIncludeWordAnswerKey] = useState(false);
  const [includeWordComments, setIncludeWordComments] = useState(false);
  const [wordExportFormat, setWordExportFormat] = useState<"sme" | "full">("sme");
  const [draggingSceneId, setDraggingSceneId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [readiness, setReadiness] = useState<Readiness | null>(null);
  useEffect(() => {
    if (!session || !project.id) return;
    let alive = true;
    setPermissions({ canEdit: false, canExport: false, canManageMembers: false, canEnhance: false });
    fetch(`/api/projects/${project.id}/permissions`).then(async response => { if (!response.ok) throw new Error("Project permissions could not be loaded."); return response.json() as Promise<typeof permissions>; }).then(next => { if (alive) setPermissions(next); }).catch(issue => { if (alive) setError(issue instanceof Error ? issue.message : "Project access unavailable."); });
    return () => { alive = false; };
  }, [session, project.id]);
  useEffect(() => {
    if (!isCreating) return;
    let alive = true;
    setAiConfiguredForProject(null);
    fetch("/api/ai-connection").then(async response => {
      if (!response.ok) throw new Error("AI status unavailable");
      return response.json() as Promise<{ configured: boolean }>;
    }).then(status => { if (alive) setAiConfiguredForProject(status.configured); }).catch(() => { if (alive) setAiConfiguredForProject(false); });
    return () => { alive = false; };
  }, [isCreating]);
  useEffect(() => {
    const update = () => setReviewToken(location.hash.startsWith("#review=") ? location.hash.slice(8) : "");
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);
  const guideContext = useRef<Record<string, unknown>>({});
  const guideNavigate = useRef<(step: Step) => void>(() => {});
  const [guideId, setGuideId] = useState(() => {
    try { return localStorage.getItem("chimera.onboarding.selected") || "first-scene"; } catch { return "first-scene"; }
  });
  const [guides] = useState(() => Object.fromEntries(chimeraJourneys.map(journey => [journey.id, createChimeraOnboarding(() => guideContext.current, step => guideNavigate.current(step), journey)])));
  const onboarding = guides[guideId] || guides["first-scene"];
  const pendingGuideStart = useRef(false);
  const [guidePaused, setGuidePaused] = useState(false);
  const [resumeHost, setResumeHost] = useState<Element | null>(null);
  guideContext.current = { ...guideContext.current, projectId: project.id, sceneCount: project.storyboard.scenes.length,
    assetCount: project.storyboard.assets.length, templateCount: templates.length,
    selectedSceneId: project.storyboard.scenes[selectedScene]?.id,
    assessmentSceneId: project.storyboard.scenes[selectedScene]?.sceneType === "question" ? project.storyboard.scenes[selectedScene].id : project.storyboard.scenes.find(s => s.sceneType === "question")?.id,
    questionCount: project.storyboard.scenes.filter(s => s.assessmentItem).length,
    hasImages: project.storyboard.scenes.some(s => s.imageAssets.length > 0),
    hasAudio: Boolean(project.storyboard.scenes[selectedScene]?.audioAssets.length) };
  const currentSurface = visualSceneId || sceneDraft ? "scene.edit" : isCreating ? "project.name" : templateDraft ? "templates.edit" :
    showExport ? "export.panel" : showPreview ? "preview.content" : showAssessmentEditor ? "assessment.editor" :
    showAssessments ? "review.assessments" : showCompletionSettings ? "review.completion" : showEnhancementReview ? "review.enhancement" :
    showPythiaCourseReview ? "review.course" : showPythiaAnalysis ? "pythia.analysis" : showPythiaTransform ? "pythia.transform" :
    showPythiaAssessmentDesign ? "pythia.assessment" : showIntelligenceEngine ? "settings.engine" :
    showAccessibility ? "review.accessibility" : showValidation ? "review.validation" :
    showGoldenPath ? "catalog" : showManagement ? "workspace.management" : activeView;
  const hasOpenForm = Boolean(visualSceneId || sceneDraft || isCreating || templateDraft || showExport || showPreview || showAssessmentEditor || showAssessments || showCompletionSettings || showEnhancementReview || showPythiaAnalysis || showPythiaTransform || showPythiaAssessmentDesign || showPythiaCourseReview || showIntelligenceEngine || showAIConnection || showProjectBackground || showAccessibility || showValidation);
  guideNavigate.current = (step) => {
    const target = step.target;
    if (!target) return;
    if (step.id === "review") return;
    if (step.id === "project") { beginProjectCreate(); return; }
    if (step.id === "scene") { setShowManagement(false); setActiveView("storyboard"); if (!sceneDraft) beginSceneCreate(); return; }
    // Keep the same form mounted across steps/resume so application drafts survive.
    if (target === currentSurface || (target === "preview.comments" && showPreview)) return;
    if (hasOpenForm) throw new Error("Close the current task before continuing. Your draft is preserved. Then Retry.");
    setShowManagement(false);
    if (target === "scene.edit") { setActiveView("storyboard"); beginSceneEdit(scene, "details"); }
    else if (target === "scene.audio") setActiveView("storyboard");
    else if (target?.startsWith("storyboard.") || target === "scene.saved") setActiveView("storyboard");
    else if (target?.startsWith("media.")) setActiveView("media");
    else if (target === "templates.library") setActiveView("templates");
    else if (target === "templates.edit") { const t = templates[0]; if (t) setTemplateDraft({ id: t.id, title: t.title, description: t.description }); }
    else if (target === "assessment.editor") { const index = project.storyboard.scenes.findIndex(s => s.id === guideContext.current.assessmentSceneId); if (index >= 0) { setSelectedScene(index); setShowAssessmentEditor(true); } }
    else if (target?.startsWith("preview.")) setShowPreview(true);
    else if (target === "review.completion") setShowCompletionSettings(true);
    else if (target === "review.enhancement") setShowEnhancementReview(true);
    else if (target === "pythia.analysis") { setActiveView("storyboard"); setShowPythiaAnalysis(true); }
    else if (target === "pythia.transform") { setActiveView("storyboard"); setShowPythiaTransform(true); }
    else if (target === "pythia.assessment") { setActiveView("storyboard"); setShowPythiaAssessmentDesign(true); }
    else if (target === "review.course") setShowPythiaCourseReview(true);
    else if (target === "settings.engine") setShowIntelligenceEngine(true);
    else if (target === "settings.media") setShowAIConnection(true);
    else if (target === "review.accessibility") setShowAccessibility(true);
    else if (target === "review.validation") setShowValidation(true);
    else if (target === "export.panel") setShowExport(true);
    else if (target === "workspace.appearance") setShowSettings(true);
    else if (target === "workspace.management") setShowManagement(true);
  };
  useEffect(() => onboarding.controller.subscribe(state => setGuidePaused(state.status === "paused")), [onboarding]);
  useEffect(() => {
    const unmount = onboarding.mount();
    if (pendingGuideStart.current) {
      pendingGuideStart.current = false;
      onboarding.controller.setScope(project.id || "workspace");
      onboarding.controller.start({ restart: ["complete", "finished"].includes(onboarding.controller.snapshot().status) });
    }
    return unmount;
  }, [onboarding]);
  useEffect(() => { for (const guide of Object.values(guides)) guide.controller.setScope(project.id || "workspace"); }, [project.id, guides]);
  useEffect(() => {
    const receive = (event: Event) => {
      const outcome = (event as CustomEvent).detail;
      if (outcome.type === "validation.loaded") guideContext.current.validationReady = outcome.scope;
      onboarding.controller.signal(outcome);
    };
    window.addEventListener("chimera:onboarding-outcome", receive);
    return () => window.removeEventListener("chimera:onboarding-outcome", receive);
  }, [onboarding]);
  useEffect(() => { if (!showValidation) guideContext.current.validationReady = undefined; }, [showValidation]);
  useEffect(() => {
    const state = onboarding.controller.snapshot();
    if (state.status !== "active") return;
    const target = state.step.target || "";
    const expected = target === "project.name" ? "project.name" : target === "scene.form" ? "scene.edit" :
      target.startsWith("storyboard.") || target === "scene.saved" || target === "scene.audio" ? "storyboard" :
      target.startsWith("media.") ? "media" : target.startsWith("templates.") ? target === "templates.edit" ? target : "templates" :
      target === "preview.comments" ? "preview.content" : target;
    if (target && expected !== currentSurface && !target.startsWith("workspace.project") && !target.startsWith("workspace.appearance")) onboarding.controller.pause();
  }, [currentSurface, onboarding]);
  useEffect(() => { setResumeHost(guidePaused ? document.querySelector('[role="dialog"][aria-modal="true"]') : null); }, [guidePaused, currentSurface]);
  function startOnboarding(id = guideId) {
    const requested = guides[id] || guides["first-scene"];
    const progress = requested.controller.snapshot();
    const ownForm = id === guideId && progress.status === "paused" && (progress.step.target === currentSurface || (progress.step.id === "scene" && sceneDraft) || (progress.step.id === "project" && isCreating) || (progress.step.target === "preview.comments" && showPreview));
    if (busy || (hasOpenForm && !ownForm)) { setFeedback("Finish or close your current form before starting a walkthrough. Your edits are preserved."); return; }
    setShowGoldenPath(false);
    try { localStorage.setItem("chimera.onboarding.selected", id); } catch { /* In-memory selection remains available. */ }
    if (id !== guideId) { onboarding.controller.pause(); pendingGuideStart.current = true; setGuideId(id); }
    else requested.controller.start({ restart: ["complete", "finished"].includes(progress.status) });
  }

  function applyProject(updatedProject: Project) {
    setProject({ ...updatedProject, storyboard: { ...updatedProject.storyboard, scenes: updatedProject.storyboard.scenes.map(scene => String(scene.sceneType) === "assessment" ? { ...scene, sceneType: "question" } : scene) } });
    if (!updatedProject.id) return;
    window.localStorage.setItem("chimera.activeProjectId", updatedProject.id);
    const summary: ProjectSummary = {
      id: updatedProject.id,
      title: updatedProject.title,
      sceneCount: updatedProject.sceneCount,
      updatedAt: updatedProject.updatedAt,
      hasSourceDeck: updatedProject.hasSourceDeck,
      parentProjectId: updatedProject.parentProjectId,
      siblingOrder: updatedProject.siblingOrder,
      metadataRevision: updatedProject.metadataRevision,
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
    }).catch(() => setError("Start the API to connect project storage.")).finally(() => setRestoringProject(false));
    fetch("/api/templates").then((response) => response.ok ? response.json() : []).then(setTemplates).catch(() => setError("Template library could not be loaded."));
  }, []);

  useEffect(() => {
    if (!project.id) { setReadiness(null); return; }
    fetch(`/api/projects/${project.id}/readiness`).then((response) => response.ok ? response.json() as Promise<Readiness> : Promise.reject(new Error("Readiness unavailable"))).then(setReadiness).catch(() => setReadiness(null));
  }, [project.id, project.storyboard.revision]);

  async function switchProject(projectId: string, openAuthoring = false, destination: "storyboard" | "media" = "storyboard"): Promise<boolean> {
    if (!projectId || (projectId === project.id && !openAuthoring) || busy) return false;
    if (hasOpenForm) { setFeedback("Finish or close your current form before switching projects. Your edits are preserved."); return false; }
    onboarding.controller.pause();
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/projects/${projectId}`);
      if (!response.ok) throw new Error("Project could not be opened.");
      applyProject(await response.json() as Project);
      setSelectedScene(0);
      setActiveView(destination);
      setSceneDraft(null);
      setTemplateDraft(null);
      setShowValidation(false);
      setShowAccessibility(false);
      setShowPreview(false);
      setShowAssessmentEditor(false);
      setVisualSceneId(null);
      setShowCompletionSettings(false);
      setShowAssessments(false);
      setShowEnhancementReview(false);
      setShowExport(false);
      setShowProjectAccess(false);
      if (openAuthoring) setShowManagement(false);
      return true;
    } catch {
      setError("Project could not be opened. Check that the API is running and try again.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function handleProjectTrashed(projectId: string) {
    const response = await fetch("/api/projects");
    if (!response.ok) throw new Error("Project list could not be refreshed.");
    const availableProjects = await response.json() as ProjectSummary[];
    setProjects(availableProjects);
    if (project.id !== projectId) return;
    window.localStorage.removeItem("chimera.activeProjectId");
    setProject(emptyProject);
    setSelectedScene(0);
    setPermissions({ canEdit: !session, canExport: !session, canManageMembers: false, canEnhance: !session });
    setReadiness(null);
    if (availableProjects.length) {
      const next = [...availableProjects].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];
      const nextResponse = await fetch(`/api/projects/${next.id}`);
      if (!nextResponse.ok) throw new Error("Another project could not be opened.");
      applyProject(await nextResponse.json() as Project);
    }
  }

  async function handleProjectsRestored(projectId: string) {
    const response = await fetch("/api/projects");
    if (!response.ok) throw new Error("Project list could not be refreshed.");
    const availableProjects = await response.json() as ProjectSummary[];
    setProjects(availableProjects);
    if (!project.id) {
      const restoredResponse = await fetch(`/api/projects/${projectId}`);
      if (!restoredResponse.ok) throw new Error("Restored project could not be opened.");
      applyProject(await restoredResponse.json() as Project);
    }
  }

  async function handleRelationshipUpdated(updatedProject: Project) {
    const response = await fetch("/api/projects");
    if (!response.ok) throw new Error("Relationship saved, but the project list could not be refreshed. Reload My Work.");
    setProjects(await response.json() as ProjectSummary[]);
    if (updatedProject.id === project.id) applyProject(updatedProject);
  }

  function beginProjectCreate(parent?: { id: string; title: string }) {
    setCreatingParent(parent ?? null);
    setError("");
    setIsCreating(true);
  }

  async function createProject() {
    if (!title.trim() || busy) return;
    const designFiles = aiConfiguredForProject ? courseDesignFiles : [];
    const oversizedFile = designFiles.find(file => file.size > 25 * 1024 * 1024);
    if (oversizedFile) {
      setError(`${oversizedFile.name} is larger than the 25 MB reference limit.`);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, parentProjectId: creatingParent?.id ?? null }) });
      if (!response.ok) {
        const body = await response.json() as { detail?: string };
        throw new Error(body.detail || "Project could not be created.");
      }
      const createdProject = await response.json() as Project;
      const failedAttachments: string[] = [];
      const attachedResourceIds: string[] = [];
      for (const file of designFiles) {
        const form = new FormData();
        form.append("file", file);
        form.append("title", file.name.replace(/\.[^.]+$/, ""));
        form.append("classification", "study-guide");
        try {
          const uploadResponse = await fetch(`/api/projects/${createdProject.id}/reference-resources`, { method: "POST", body: form });
          if (!uploadResponse.ok) {
            const detail = await uploadResponse.json().catch(() => null) as { detail?: string } | null;
            throw new Error(detail?.detail || "Upload failed");
          }
          const resource = await uploadResponse.json() as { id: string };
          attachedResourceIds.push(resource.id);
        } catch {
          failedAttachments.push(file.name);
        }
      }
      applyProject(createdProject);
      setCourseResourceIds(attachedResourceIds);
      setCourseDraft(null);
      setCourseDraftError("");
      guideContext.current.projectId = createdProject.id;
      const guideState = onboarding.controller.snapshot();
      onboarding.controller.setScope(createdProject.id, { carry: guideState.status === "active" && guideState.step.id === "project" });
      onboarding.controller.signal({ type: "project.created", scope: createdProject.id });
      setSelectedScene(0);
      setActiveView("storyboard");
      setShowManagement(false);
      setCourseDesignFiles([]);
      setCreatedCourseForDraft(Boolean(aiConfiguredForProject));
      if (!aiConfiguredForProject) {
        setIsCreating(false);
        setTitle("");
        setAiConfiguredForProject(null);
      }
      setFeedback(designFiles.length > 0 && failedAttachments.length === 0 ? "Course design documents added as references. Select them in an enhancement prompt." : "");
      if (failedAttachments.length > 0) setError(`Project created, but these documents could not be attached: ${failedAttachments.join(", ")}. Add them from Storyboard suggestions.`);
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : "Project could not be created. Check that the API is running and try again.");
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
      reportOnboardingOutcome("template.uploaded", project.id || "workspace");
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
      reportOnboardingOutcome("template.replaced", project.id || "workspace");
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
      reportOnboardingOutcome("template.saved", project.id || "workspace");
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
        headers: storyboardWriteHeaders(project.storyboard.revision),
        body: JSON.stringify({ sceneIds }),
      });
      if (!response.ok) throw new Error(revisionConflictMessage(response.status) || "Scene order could not be saved.");
      const updatedProject: Project = await response.json();
      const selectedId = scene?.id;
      applyProject(updatedProject);
      setSelectedScene(Math.max(0, updatedProject.storyboard.scenes.findIndex((item) => item.id === selectedId)));
      reportOnboardingOutcome("scene.reordered", project.id);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Scene order could not be saved. Check that the API is running and try again.");
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
      const response = await fetch(`/api/projects/${project.id}/source`, { method: "POST", headers: storyboardWriteHeaders(project.storyboard.revision, false), body: form });
      if (!response.ok) {
        const detail = await response.json().catch(() => null) as { detail?: string } | null;
        throw new Error(detail?.detail || "This presentation could not be read.");
      }
      applyProject(await response.json() as Project);
      setSelectedScene(0);
      reportOnboardingOutcome("deck.imported", project.id);
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
      reportOnboardingOutcome("export.json", project.id);
    } catch {
      setError("Storyboard JSON could not be exported. Check that the API is running and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function exportProjectBackup() {
    if (!project.id || busy) return;
    setBusy(true); setError(""); setFeedback("");
    try {
      const response = await fetch(`/api/projects/${project.id}/backup.zip`);
      if (!response.ok) throw new Error("Chimera storyboard could not be exported.");
      const downloadUrl = window.URL.createObjectURL(await response.blob());
      const link = document.createElement("a"); link.href = downloadUrl; link.download = `${project.id}-backup.zip`; document.body.appendChild(link); link.click(); link.remove(); window.URL.revokeObjectURL(downloadUrl);
      setFeedback("Chimera storyboard downloaded.");
      reportOnboardingOutcome("export.backup", project.id);
    } catch (backupError) { setError(backupError instanceof Error ? backupError.message : "Chimera storyboard could not be exported."); }
    finally { setBusy(false); }
  }

  async function exportWordStoryboard() {
    if (!project.id || busy) return;
    setBusy(true);
    setError("");
    setFeedback("");
    try {
      const params = new URLSearchParams();
      if (includeWordAnswerKey) params.set("include_answer_key", "true");
      if (includeWordComments) params.set("include_review_comments", "true");
      const query = params.size ? `?${params}` : "";
      const response = await fetch(`/api/projects/${project.id}/storyboard-${wordExportFormat}.docx${query}`);
      if (!response.ok) {
        const detail = await response.json().catch(() => null) as { detail?: string } | null;
        throw new Error(detail?.detail || "Word storyboard could not be exported.");
      }
      const downloadUrl = window.URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = `${project.id}-${wordExportFormat === "sme" ? "sme-master" : "full-storyboard"}.docx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(downloadUrl);
      setFeedback(`${wordExportFormat === "sme" ? "SME Master" : "Full storyboard"} downloaded.`);
      reportOnboardingOutcome("export.word", project.id);
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : "Word storyboard could not be exported.");
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
      reportOnboardingOutcome("export.qti-test", project.id);
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : "QTI 2.1 assessment test could not be exported.");
    } finally {
      setBusy(false);
    }
  }

  async function exportStandalone() {
    if (!project.id || busy) return;
    setBusy(true);
    setError("");
    setFeedback("");
    try {
      const response = await fetch(`/api/projects/${project.id}/standalone.zip`);
      if (!response.ok) {
        const detail = await response.json().catch(() => null) as { detail?: string } | null;
        throw new Error(detail?.detail || "Standalone course could not be built.");
      }
      const downloadUrl = window.URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = `${project.id}-standalone.zip`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(downloadUrl);
      setFeedback("Standalone course built and downloaded.");
    } catch (buildError) {
      setError(buildError instanceof Error ? buildError.message : "Standalone course could not be built.");
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
      reportOnboardingOutcome("export.scorm2004", project.id);
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
      reportOnboardingOutcome("export.scorm12", project.id);
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
      reportOnboardingOutcome("export.report", project.id);
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
      const response = await fetch(`/api/projects/${project.id}/export-settings`, { method: "PATCH", headers: storyboardWriteHeaders(project.storyboard.revision), body: JSON.stringify({ packageWarningThresholdMB: threshold }) });
      if (!response.ok) throw new Error(revisionConflictMessage(response.status) || "Export settings could not be saved.");
      applyProject(await response.json() as Project);
      setFeedback("Package warning threshold saved.");
      reportOnboardingOutcome("export.threshold", project.id);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Export settings could not be saved. Check that the API is running and try again.");
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
        headers: storyboardWriteHeaders(project.storyboard.revision),
        body: JSON.stringify(storyboard),
      });
      if (!response.ok) {
        const detail = await response.json().catch(() => null) as { detail?: unknown } | null;
        const conflictMessage = revisionConflictMessage(response.status);
        if (conflictMessage) throw new Error(conflictMessage);
        throw new Error(typeof detail?.detail === "string" ? detail.detail : "Import failed. Check the storyboard schema and referenced assets.");
      }
      const updatedProject: Project = await response.json();
      applyProject(updatedProject);
      setSelectedScene(0);
      setActiveView("storyboard");
      setFeedback(`Storyboard imported. The previous version was saved to history.`);
      reportOnboardingOutcome("export.restore-json", project.id);
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : "Storyboard JSON could not be imported.");
    } finally {
      input.value = "";
      setBusy(false);
    }
  }

  async function importProjectBackup(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file || !project.id || busy) return;
    if (!window.confirm(`Restore the Chimera storyboard into "${project.title}"? The current project is preserved only after the archive passes validation.`)) { input.value = ""; return; }
    setBusy(true); setError(""); setFeedback("");
    try {
      const form = new FormData(); form.append("file", file);
      const response = await fetch(`/api/projects/${project.id}/backup/restore`, { method: "POST", body: form });
      const detail = await response.json().catch(() => null) as Project & { detail?: string } | null;
      if (!response.ok) throw new Error(detail?.detail || "Chimera storyboard could not be restored.");
      applyProject(detail as Project); setFeedback("Chimera storyboard restored.");
      reportOnboardingOutcome("export.restore-backup", project.id);
    } catch (restoreError) { setError(restoreError instanceof Error ? restoreError.message : "Chimera storyboard could not be restored."); }
    finally { input.value = ""; setBusy(false); }
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
      const response = await fetch(`/api/projects/${project.id}/assets`, { method: "POST", headers: storyboardWriteHeaders(project.storyboard.revision, false), body: form });
      if (!response.ok) {
        const detail = await response.json().catch(() => null) as { detail?: string } | null;
        throw new Error(detail?.detail || "Media could not be added.");
      }
      applyProject(await response.json() as Project);
      reportOnboardingOutcome("media.uploaded", project.id);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Media could not be added. Use a supported image or audio format and try again.");
    } finally {
      input.value = "";
      setBusy(false);
    }
  }

  async function attachAsset(asset: Asset) {
    if (!project.id || !scene || busy) return;
    const field = asset.kind === "image" ? "imageAssets" : asset.kind === "video" ? "videoAssets" : "audioAssets";
    const currentAssetIds = scene[field] ?? [];
    const updatedAssetIds = currentAssetIds.includes(asset.id) ? currentAssetIds.filter((id) => id !== asset.id) : [...currentAssetIds, asset.id];
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/projects/${project.id}/scenes/${scene.id}`, {
        method: "PATCH",
        headers: storyboardWriteHeaders(project.storyboard.revision),
        body: JSON.stringify({ [field]: updatedAssetIds, ...(currentAssetIds.includes(asset.id) ? { mediaPlacements: (scene.mediaPlacements ?? []).filter(p => p.assetId !== asset.id) } : {}) }),
      });
      if (!response.ok) throw new Error(revisionConflictMessage(response.status) || "Media assignment could not be saved.");
      applyProject(await response.json() as Project);
      reportOnboardingOutcome("media.assigned", project.id, scene.id);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Media assignment could not be saved. Check that the API is running and try again.");
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
        headers: storyboardWriteHeaders(project.storyboard.revision),
        body: JSON.stringify({ audioRequired }),
      });
      if (!response.ok) throw new Error(revisionConflictMessage(response.status) || "Audio completion setting could not be saved.");
      applyProject(await response.json() as Project);
      reportOnboardingOutcome("audio.rules-saved", project.id, scene.id);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Audio completion setting could not be saved. Check that the API is running and try again.");
    } finally {
      setBusy(false);
    }
  }

  function beginSceneEdit(sceneToEdit: Scene | undefined = scene, initialPanel: "canvas" | "details" = "canvas") {
    if (!sceneToEdit || busy) return;
    setError("");
    setSelectedScene(scenes.findIndex((item) => item.id === sceneToEdit.id));
    setSceneEditorPanel(initialPanel);
    setVisualSceneId(sceneToEdit.id);
  }

  async function saveScene() {
    if (!project.id || !sceneDraft) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(sceneDraft.id ? `/api/projects/${project.id}/scenes/${sceneDraft.id}` : `/api/projects/${project.id}/scenes`, {
        method: sceneDraft.id ? "PATCH" : "POST",
        headers: storyboardWriteHeaders(project.storyboard.revision),
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
      if (!response.ok) throw new Error(revisionConflictMessage(response.status) || "Scene changes could not be saved.");
      const updatedProject: Project = await response.json();
      applyProject(updatedProject);
      if (!sceneDraft.id) setSelectedScene(updatedProject.storyboard.scenes.length - 1);
      setSceneDraft(null);
      if (sceneDraft.id) {
        reportOnboardingOutcome("scene.updated", updatedProject.id, sceneDraft.id);
        if (sceneDraft.layoutMode === "template") reportOnboardingOutcome("scene.template-saved", updatedProject.id, sceneDraft.id);
      }
      if (!sceneDraft.id) {
        const savedScene = updatedProject.storyboard.scenes.at(-1);
        guideContext.current.savedSceneId = savedScene?.id || "";
        onboarding.controller.signal({ type: "scene.created", scope: updatedProject.id, entityId: savedScene?.id });
      }
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Scene changes could not be saved. Check that the API is running and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function saveVisualScene(layout: SceneLayout, settings: SceneEditSettings) {
    const sourceScene = scenes.find(item => item.id === visualSceneId);
    const { canvasEdited, ...sceneSettings } = settings;
    const refreshSourceLayout = !canvasEdited && settings.layoutMode === "hybrid" && Boolean(sourceScene?.sourceSlide) && sourceScene?.layoutMode !== "hybrid";
    const sceneUpdate: Record<string, unknown> = {
      ...sceneSettings,
      templateId: settings.templateId || null,
      visualLayout: layout,
    };
    if (refreshSourceLayout) delete sceneUpdate.visualLayout;
    const response = await fetch(`/api/projects/${project.id}/scenes/${visualSceneId}`, { method: "PATCH", headers: storyboardWriteHeaders(project.storyboard.revision), body: JSON.stringify(sceneUpdate) });
    if (!response.ok) throw new Error(revisionConflictMessage(response.status) || "Visual scene could not be saved.");
    applyProject(await response.json() as Project);
    reportOnboardingOutcome("scene.updated", project.id, visualSceneId || undefined);
    if (settings.layoutMode === "template") reportOnboardingOutcome("scene.template-saved", project.id, visualSceneId || undefined);
  }

  async function generateSceneContentDraft(prompt: string, currentScene: Partial<Scene>): Promise<GeneratedSceneDraft> {
    const response = await fetch(`/api/projects/${project.id}/scenes/${visualSceneId}/content-draft`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, currentScene }),
    });
    const result = await response.json().catch(() => null) as (GeneratedSceneDraft & { detail?: string }) | null;
    if (!response.ok || !result) throw new Error(result?.detail || "Scene draft could not be generated.");
    return result;
  }

  async function generateCourseContentDraft() {
    if (!project.id || !coursePrompt.trim() || busy) return;
    setBusy(true);
    setCourseDraftError("");
    try {
      const response = await fetch(`/api/projects/${project.id}/content-drafts/course`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: coursePrompt.trim(), resourceIds: courseResourceIds }),
      });
      const result = await response.json().catch(() => null) as { scenes?: GeneratedSceneDraft[]; detail?: string } | null;
      if (!response.ok || !result?.scenes) throw new Error(result?.detail || "Course draft could not be generated.");
      setCourseDraft(result.scenes.map(scene => ({ ...scene, included: true })));
    } catch (issue) {
      setCourseDraftError(issue instanceof Error ? issue.message : "Course draft could not be generated.");
    } finally {
      setBusy(false);
    }
  }

  async function applyCourseContentDraft() {
    if (!project.id || !courseDraft || busy) return;
    const selectedScenes = courseDraft.filter(scene => scene.included).map(({ included: _included, ...scene }) => scene);
    if (!selectedScenes.length) return;
    setBusy(true);
    setCourseDraftError("");
    try {
      const response = await fetch(`/api/projects/${project.id}/content-drafts/course/apply`, {
        method: "POST",
        headers: storyboardWriteHeaders(project.storyboard.revision),
        body: JSON.stringify({ scenes: selectedScenes }),
      });
      const result = await response.json().catch(() => null) as (Project & { detail?: string }) | null;
      if (!response.ok || !result) throw new Error(revisionConflictMessage(response.status) || result?.detail || "Course scenes could not be added.");
      applyProject(result);
      setIsCreating(false);
      setCreatedCourseForDraft(false);
      setTitle("");
      setCoursePrompt("");
      setCourseResourceIds([]);
      setCourseDraft(null);
      setAiConfiguredForProject(null);
      setFeedback(`${selectedScenes.length} reviewed scene${selectedScenes.length === 1 ? "" : "s"} added to the course.`);
    } catch (issue) {
      setCourseDraftError(issue instanceof Error ? issue.message : "Course scenes could not be added.");
    } finally {
      setBusy(false);
    }
  }

  async function extractVisualScene(): Promise<SceneLayout> {
    const response = await fetch(`/api/projects/${project.id}/scenes/${visualSceneId}/extract-layout`, { method: "POST", headers: storyboardWriteHeaders(project.storyboard.revision) });
    if (!response.ok) { const issue = await response.json(); throw new Error(revisionConflictMessage(response.status) || issue.detail || "Source layout could not be extracted."); }
    const updated = await response.json() as Project;
    const layout = updated.storyboard.scenes.find(item => item.id === visualSceneId)?.visualLayout;
    if (!layout) throw new Error("No source layout is available.");
    applyProject(updated);
    return layout;
  }

  async function deleteScene(sceneToDelete: Scene, index: number) {
    if (!project.id || busy) return;
    const clearsRemediation = scenes.some((item) => item.assessmentSettings?.remediationSceneId === sceneToDelete.id);
    const consequence = clearsRemediation ? " Any assessment remediation links to this scene will also be cleared." : "";
    if (!window.confirm(`Delete scene "${sceneToDelete.title}"? The previous storyboard will be saved to history.${consequence}`)) return;

    const selectedSceneId = scenes[selectedScene]?.id;
    setBusy(true);
    setError("");
    setFeedback("");
    try {
      const response = await fetch(`/api/projects/${project.id}/scenes/${sceneToDelete.id}`, {
        method: "DELETE",
        headers: storyboardWriteHeaders(project.storyboard.revision, false),
      });
      if (!response.ok) {
        const detail = await response.json().catch(() => null) as { detail?: string } | null;
        const conflictMessage = revisionConflictMessage(response.status);
        if (conflictMessage) throw new Error(conflictMessage);
        throw new Error(detail?.detail || "Scene could not be deleted.");
      }
      const updatedProject = await response.json() as Project;
      applyProject(updatedProject);
      if (sceneDraft?.id === sceneToDelete.id) setSceneDraft(null);
      const retainedSelection = updatedProject.storyboard.scenes.findIndex((item) => item.id === selectedSceneId);
      setSelectedScene(retainedSelection >= 0 ? retainedSelection : Math.max(0, Math.min(index, updatedProject.storyboard.scenes.length - 1)));
      setFeedback(`Scene "${sceneToDelete.title}" deleted. The previous storyboard was saved to history.`);
      reportOnboardingOutcome("scene.deleted", project.id);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Scene could not be deleted.");
    } finally {
      setBusy(false);
    }
  }

  const scenes = project.storyboard.scenes;
  const assessmentItemCount = scenes.filter((item) => item.assessmentItem !== null).length;
  const scene = scenes[selectedScene];
  const hasSceneStage = Boolean(scene && (scene.visualLayout?.enabled || scene.assessmentItem || scene.layoutMode === "native" && effectiveBackgroundAsset(project, scene)));
  const canCreateProject = !session || session.memberships.some(item => ["author", "instructional-designer", "administrator"].includes(item.role));
  const parentProject = projects.find(parent => parent.id === project.parentProjectId);

  function openCourseReviewObject(objectType: "course" | "scene" | "objective" | "assessment" | "asset", objectId: string) {
    setShowPythiaCourseReview(false);
    setShowManagement(false);
    if (objectType === "course") { setActiveView("storyboard"); return; }
    if (objectType === "scene") {
      const sceneIndex = scenes.findIndex(item => item.id === objectId);
      setActiveView("storyboard");
      if (sceneIndex >= 0) setSelectedScene(sceneIndex);
      return;
    }
    if (objectType === "assessment") {
      const separator = objectId.indexOf(":");
      const targetSceneId = separator >= 0 ? objectId.slice(0, separator) : scenes.find(item => item.assessmentItem?.identifier === objectId)?.id;
      const sceneIndex = scenes.findIndex(item => item.id === targetSceneId);
      setActiveView("storyboard");
      if (sceneIndex >= 0) { setSelectedScene(sceneIndex); if (scenes[sceneIndex].assessmentItem) setShowAssessmentEditor(true); }
      return;
    }
    if (objectType === "asset") {
      const sceneIndex = scenes.findIndex(item => item.imageAssets.includes(objectId) || item.audioAssets.includes(objectId) || item.videoAssets?.includes(objectId));
      if (sceneIndex >= 0) setSelectedScene(sceneIndex);
      setActiveView("media");
    }
  }

  if (reviewToken && session) return <ReviewLinkView token={reviewToken} onClose={() => { history.replaceState(null, "", location.pathname+location.search); setReviewToken(""); }} />;

  return <div className="app-shell">
    <a className="skip-link" href="#workspace-content">Skip to workspace</a>
    <aside className="sidebar" aria-label="Workspace navigation">
      <div className="brand"><BrandMark /><div className="brand-wordmark"><span>CHIMERA</span></div></div>
      <div className="sidebar-project">
        <label data-onboarding="workspace.project" className="project-switcher"><span>PROJECT</span><select value={project.id} onChange={(event) => void switchProject(event.target.value)} disabled={busy || hasOpenForm || projects.length === 0} aria-label="Switch project"><option value="" disabled>Select a project</option><ProjectOptions projects={projects} sceneCounts recentFirst /></select></label>
        <button className="new-project-button" onClick={() => beginProjectCreate()} disabled={busy || hasOpenForm || !canCreateProject}><Plus size={15} /> Create project</button>
        <button className="new-project-button" onClick={() => startOnboarding()} disabled={busy}><Route size={15} /> Start / resume walkthrough</button>
      </div>
      <div className="workspace-label">WORKSPACE</div>
      <nav aria-label="Workspace">
        <button ref={managementButtonRef} className={`nav-item management-nav-item ${showManagement ? "active" : ""}`} aria-current={showManagement ? "page" : undefined} onClick={() => setShowManagement(true)}><ClipboardList size={18} /><span>My Work</span></button>
        <button className={`nav-item ${!showManagement && activeView === "storyboard" ? "active" : ""}`} aria-current={!showManagement && activeView === "storyboard" ? "page" : undefined} onClick={() => { setShowManagement(false); setActiveView("storyboard"); }}><Layers3 size={18} /><span>Storyboard</span></button>
        <button className={`nav-item ${!showManagement && activeView === "media" ? "active" : ""}`} aria-current={!showManagement && activeView === "media" ? "page" : undefined} onClick={() => { setShowManagement(false); setActiveView("media"); }}><FileUp size={18} /><span>Media library</span></button>
        <button className={`nav-item ${!showManagement && activeView === "templates" ? "active" : ""}`} aria-current={!showManagement && activeView === "templates" ? "page" : undefined} onClick={() => { setShowManagement(false); setActiveView("templates"); }}><BookOpen size={18} /><span>Templates</span></button>
      </nav>
      <div className="sidebar-review">
        <button className="nav-item review-toggle" aria-expanded={showReviewTools} aria-controls="review-tools" onClick={() => setShowReviewTools(!showReviewTools)}><ShieldCheck size={18} /><span>Review tools</span><ChevronDown size={15} className={showReviewTools ? "expanded" : ""} /></button>
        {showReviewTools && <div id="review-tools" className="review-tools">
          <button onClick={() => { setShowGoldenPath(true); setShowReviewTools(false); }}><Route size={16} /> Guided review</button>
          <button onClick={() => { setShowAccessibility(true); setShowReviewTools(false); }} disabled={!project.id || busy}><Accessibility size={16} /> Check image descriptions</button>
          <button onClick={() => { setShowValidation(true); setShowReviewTools(false); }} disabled={!project.id || busy}><ShieldCheck size={16} /> Validate storyboard</button>
          <button onClick={() => { setShowCompletionSettings(true); setShowReviewTools(false); }} disabled={!project.id || busy}><Settings2 size={16} /> Completion rules</button>
          <button onClick={() => { setShowAssessments(true); setShowReviewTools(false); }} disabled={!project.id || busy || !permissions.canEdit}><ClipboardList size={16} /> Assessments</button>
          <button onClick={() => { setShowEnhancementReview(true); setShowReviewTools(false); }} disabled={!project.id || busy}><Sparkles size={16} /> Review suggestions</button>
          <button onClick={() => { setShowPythiaCourseReview(true); setShowReviewTools(false); }} disabled={!project.id || busy}><Sparkles size={16} /> Review course with Pythia</button>
        </div>}
      </div>
      <div className="sidebar-bottom">
        <button className="nav-item settings-toggle" aria-expanded={showSettings} aria-controls="workspace-settings" onClick={() => setShowSettings((open) => !open)}><Settings2 size={18} /><span>Settings</span><ChevronDown size={15} className={showSettings ? "expanded" : ""} /></button>
        {showSettings && <div id="workspace-settings" className="workspace-settings">
          <AppearanceSelector />
          <button type="button" className="nav-item" disabled={busy || !project.id || !permissions.canEdit} onClick={() => setShowProjectBackground(true)}>Project background</button>
          <button type="button" className="nav-item" disabled={busy} onClick={() => setShowIntelligenceEngine(true)}><Sparkles size={16} />Intelligence Engine</button>
          <button type="button" className="nav-item" disabled={busy} onClick={event => { event.currentTarget.focus(); setShowAIConnection(true); }}><Sparkles size={16} />AI connection</button>
          {session && permissions.canManageMembers && <button className="nav-item" disabled={!project.id} onClick={() => setShowProjectAccess(true)}>Project access</button>}
        </div>}
        {session && <div className="hosted-session"><span>{session.actor.actorDisplayName}</span><button onClick={() => { if (window.confirm("Sign out? Unsaved changes will be discarded.")) void logout().catch(issue => setError(issue instanceof Error ? issue.message : "Sign-out failed.")); }}>Sign out</button></div>}
        <div className="sidebar-footer"><span className="status-dot" />{session ? "Hosted workspace" : "Local workspace"}</div>
      </div>
    </aside>
    {showAIConnection && <AIConnectionPanel onboardingScope={project.id || "workspace"} onClose={() => setShowAIConnection(false)} />}
    {showIntelligenceEngine && <IntelligenceEnginePanel onClose={() => setShowIntelligenceEngine(false)} />}
    {showProjectBackground && <ProjectBackgroundPanel key={project.id} project={project} onClose={() => setShowProjectBackground(false)} onProjectUpdated={applyProject} />}
    <main className="main-content" id="workspace-content" tabIndex={-1}>
      {showManagement ? <ManagementView busy={busy || restoringProject || hasOpenForm} canCreateProject={canCreateProject} onCreateProject={beginProjectCreate} canResume={Boolean(project.id)} onOpenProject={(projectId) => switchProject(projectId, true)} onProjectTrashed={handleProjectTrashed} onProjectsRestored={handleProjectsRestored} onRelationshipUpdated={handleRelationshipUpdated} onClose={() => { setShowManagement(false); managementButtonRef.current?.focus(); }} /> : showProjectAccess ? <ProjectAccessPanel project={project} onClose={() => setShowProjectAccess(false)} /> : !permissions.canEdit && session && project.id ? <section className="project-access-panel"><h1>{project.title}</h1><p>You have review access to this project.</p><button className="button button-dark" onClick={() => setShowPreview(true)}>Open course review</button></section> : <>
      <header className="topbar">
        <div className="project-heading">{project.parentProjectId && <nav className="project-breadcrumb" aria-label="Project hierarchy">{parentProject ? <button type="button" disabled={busy || hasOpenForm} onClick={() => void switchProject(parentProject.id, true)}>{parentProject.title}</button> : <span>Parent project unavailable</span>}<span aria-hidden="true"> / </span><span aria-current="page">{project.title}</span></nav>}<p className="eyebrow">COURSE AUTHORING / {activeView === "storyboard" ? "STORYBOARD" : activeView === "media" ? "MEDIA LIBRARY" : "TEMPLATES"}</p><h1 title={project.title}>{project.title || "Your workspace"}</h1></div>
        <div className="top-actions"><span className="save-state" role="status">{busy ? "Working…" : project.id ? <><Check size={14} /> Saved locally</> : "Local authoring"}</span><button className="button button-outline" onClick={() => setShowPreview(true)} disabled={!project.id || !scenes.length || busy}><Play size={15} /> Preview course</button><button className="button button-accent" onClick={() => setShowExport(true)} disabled={!project.id || busy}><Download size={15} /> Export</button></div>
      </header>
      <nav className="production-workflow" aria-label="Authoring workflow">
        <button onClick={() => { setActiveView("storyboard"); requestAnimationFrame(() => document.querySelector<HTMLInputElement>('[data-onboarding="storyboard.import"] input')?.click()); }} disabled={!project.id || busy || !permissions.canEdit}><span>01</span> Source</button>
        <button aria-current={activeView === "storyboard" ? "step" : undefined} onClick={() => setActiveView("storyboard")}><span>02</span> Storyboard</button>
        <button onClick={() => setShowEnhancementReview(true)} disabled={!project.id || busy}><span>03</span> Enhance</button>
        <button onClick={() => setShowValidation(true)} disabled={!project.id || busy}><span>04</span> Verify</button>
        <button onClick={() => setShowExport(true)} disabled={!project.id || busy}><span>05</span> Deploy</button>
      </nav>
      {error && <div className="notice" role="alert"><span>{error}</span><button className="icon-button" onClick={() => setError("")} aria-label="Dismiss error"><X size={16} /></button></div>}
      {feedback && <div className="notice success-notice" role="status"><span>{feedback}</span><button className="icon-button" onClick={() => setFeedback("")} aria-label="Dismiss message"><X size={16} /></button></div>}
      {readiness && <div className="readiness-strip" aria-label="Project readiness"><span className={readiness.publicationBlockers ? "blocked" : "clear"}>{readiness.publicationBlockers ? `${readiness.publicationBlockers} publication blocker${readiness.publicationBlockers === 1 ? "" : "s"}` : "Ready for publication checks"}</span><span>{readiness.pendingProposals} pending suggestion{readiness.pendingProposals === 1 ? "" : "s"}</span><span>{readiness.unresolvedComments} unresolved comment{readiness.unresolvedComments === 1 ? "" : "s"}</span>{readiness.outdatedComments > 0 && <span>{readiness.outdatedComments} outdated thread{readiness.outdatedComments === 1 ? "" : "s"}</span>}{readiness.missingMedia > 0 && <span>{readiness.missingMedia} missing media reference{readiness.missingMedia === 1 ? "" : "s"}</span>}</div>}
      {activeView === "media" && <GeneratedMediaPanel key={project.id} project={project} scene={scene} busy={busy} onProjectUpdated={applyProject} />}
      {activeView === "storyboard" ? <><div className="work-area">
        <section data-onboarding="storyboard.list" className="scene-list" aria-label="Scene sequence">
          <div className="scene-list-tools"><div className="scene-list-title"><h2>Scenes <span className="count">{scenes.length}</span></h2><button className="icon-button" title="Add scene" aria-label="Add scene" onClick={beginSceneCreate} disabled={!project.id || busy}><Plus size={19} /></button></div>
            <label data-onboarding="storyboard.import" className={`button button-outline upload-control ${!project.id || busy ? "disabled" : ""}`}><FileUp size={15} /> Import PowerPoint<input type="file" aria-label="Import PowerPoint" accept=".pptx" onChange={uploadDeck} disabled={!project.id || busy} /></label>
          </div>
          <div className="scene-sequence">
            {scenes.length === 0 ? <div className="empty-list"><div className="empty-icon"><Layers3 size={22} /></div><strong>{project.id ? "A fresh start" : "No project selected"}</strong><p>{project.id ? "Your scenes will appear here. Drag to reorder, or use the arrow buttons." : "Create a project to start your storyboard."}</p></div> : scenes.map((item, index) => <div className={`scene-row-wrap ${selectedScene === index ? "is-selected" : ""} ${draggingSceneId === item.id ? "dragging" : ""}`} key={item.id} draggable={!busy} onDragStart={(event) => { setDraggingSceneId(item.id); event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", item.id); }} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); const draggedId = event.dataTransfer.getData("text/plain") || draggingSceneId; if (draggedId) void reorderScenes(draggedId, item.id); }} onDragEnd={() => setDraggingSceneId(null)}>
              <span className="scene-drag-handle" title="Drag to change scene order"><GripVertical size={14} /></span>
              <button className={`scene-row ${selectedScene === index ? "selected" : ""}`} aria-current={selectedScene === index ? "true" : undefined} onClick={() => setSelectedScene(index)}>
                <span className="scene-number">{String(index + 1).padStart(2, "0")}</span><span className="scene-copy"><strong>{item.title}</strong><small><span className="scene-signifier">{item.sceneType}</span><span className="scene-signifier">{item.required ? "Required" : "Optional"}</span></small></span>
              </button>
              <div className="scene-order-actions"><div className="scene-row-primary-actions"><button className="icon-button scene-edit-button" title={`Edit ${item.title}`} aria-label={`Edit ${item.title}`} onClick={() => beginSceneEdit(item)} disabled={busy}><Pencil size={15} /></button><button className="icon-button scene-delete-button" title={`Delete ${item.title}`} aria-label={`Delete ${item.title}`} onClick={() => void deleteScene(item, index)} disabled={busy}><Trash2 size={14} /></button></div><div><button className="icon-button" title="Move scene up" aria-label={`Move ${item.title} up`} disabled={busy || index === 0} onClick={() => void reorderScenes(item.id, scenes[index - 1]?.id || item.id)}><ArrowUp size={13} /></button><button className="icon-button" title="Move scene down" aria-label={`Move ${item.title} down`} disabled={busy || index === scenes.length - 1} onClick={() => void reorderScenes(item.id, scenes[index + 1]?.id || item.id)}><ArrowDown size={13} /></button></div></div>
            </div>)}
          </div>
          <div className="sequence-hint"><GripVertical size={14} /> Drag scenes to reorder</div>
        </section>
        <section data-onboarding="scene.saved" className={`canvas-panel ${hasSceneStage ? "visual-active" : ""}`} aria-label="Selected scene">{scene ? <>
          <div className="scene-context-header">
            <div className="scene-context-actions">
              <button className="button button-accent" onClick={() => beginSceneEdit()} disabled={busy || !permissions.canEdit}><Pencil size={16} /> Edit scene</button>
              <PythiaSceneActions key={`${project.id}-${scene.id}`} projectId={project.id} disabled={busy || !permissions.canEnhance} onAnalyze={() => setShowPythiaAnalysis(true)} onTransform={() => setShowPythiaTransform(true)} onDesignAssessment={() => setShowPythiaAssessmentDesign(true)} />
            </div>
            <div className="scene-context-title"><h2>{scene.title}</h2><span>Scene {selectedScene + 1} of {scenes.length} · {scene.required ? "Required" : "Optional"}</span></div>
          </div>
          {scene.sceneType === "question" && <section className="assessment-authoring-launch" aria-label="Scene question">
            <div><strong>{scene.assessmentItem ? "Question authored" : "Add a knowledge check"}</strong><span>Author a question and set its scoring rules.</span></div>
            <button className="button button-outline" onClick={() => setShowAssessmentEditor(true)} disabled={busy}><ClipboardList size={15} />{scene.assessmentItem ? "Edit question" : "Create question"}</button>
          </section>}
          {hasSceneStage && <div className="visual-authoring-surface"><SceneSurface project={project} scene={scene} /></div>}
          <div className="canvas-body"><div className="canvas-meta"><span>SCENE {String(selectedScene + 1).padStart(2, "0")} · {scene.sceneType.toUpperCase()}</span><span>{scene.layoutMode === "template" ? templates.find((template) => template.id === scene.templateId)?.title || "TEMPLATE LAYOUT" : `${scene.layoutMode.toUpperCase()} LAYOUT`}{scene.sourceSlide ? ` · SOURCE SLIDE ${scene.sourceSlide}` : " · NEW SCENE"}</span></div><div className="slide-canvas">{scene.previewImage ? <img className="slide-preview" src={`/api/projects/${project.id}/${scene.previewImage}`} alt={scene.sourceSlide ? `Rendered source slide ${scene.sourceSlide}` : scene.title} /> : <><div className="canvas-grid" /><div className="slide-label">{scene.title}</div><div className="slide-subtitle">{scene.extractedText.join(" · ") || "No additional slide text extracted"}</div></>}<div className="canvas-chip">{scene.previewImage ? "SOURCE SLIDE PREVIEW" : `${scene.layoutMode.toUpperCase()} LAYOUT`}</div></div><div className="canvas-footer"><div><strong>{scene.title}</strong><span>Speaker notes: {scene.notes || "None extracted"}</span><span>{scene.imageAssets.length} images / {scene.audioAssets.length} audio files{scene.sourceAnimationXml ? " / Native animation captured" : ""}{scene.sourceTransitionXml ? " / Transition captured" : ""}</span>{scene.renderWarning && <span className="render-warning">{scene.renderWarning}</span>}</div></div>{(scene.imageAssets.length > 0 || scene.audioAssets.length > 0) && <div className="scene-media-strip">{scene.imageAssets.map((assetId) => { const asset = project.storyboard.assets.find((item) => item.id === assetId); return asset ? <img key={assetId} src={`/api/projects/${project.id}/assets/${assetId}`} alt={asset.filename} title={asset.filename} /> : null; })}{scene.audioAssets.map((assetId) => { const asset = project.storyboard.assets.find((item) => item.id === assetId); return asset ? <div className="scene-audio" key={assetId}><span>{asset.filename}</span><audio controls preload="metadata" src={`/api/projects/${project.id}/assets/${assetId}`} /></div> : null; })}</div>}
          {scene.audioAssets.length > 0 && <section data-onboarding="scene.audio" className="audio-requirement-setting"><label><input type="checkbox" checked={scene.audioRequired} onChange={(event) => void setSceneAudioRequired(event.target.checked)} disabled={busy} /><span><strong>Require attached audio to finish</strong><small>Learners must play every attached track to the end.</small></span></label></section>}
          </div></> : <div className="canvas-empty"><div className="brand-emblem"><BrandMark /></div><span className="brand-signature">Distinct parts. Deliberate design. Powerful learning.</span><strong>{project.id ? "Your storyboard starts here" : "Build your next learning experience"}</strong><span>{project.id ? "Bring in a PowerPoint or start with a blank scene." : "Create a project to organize scenes, media, and assessments."}</span>
          <div className="empty-start-actions">{project.id ? <><label className={`button button-accent upload-control ${busy ? "disabled" : ""}`}><FileUp size={16} /> Import PowerPoint<input type="file" aria-label="Import PowerPoint" accept=".pptx" onChange={uploadDeck} disabled={busy} /></label><button className="button button-outline" onClick={beginSceneCreate} disabled={busy}><Plus size={16} /> Add scene</button></> : <button className="button button-accent" onClick={() => setIsCreating(true)}><Plus size={16} /> Create project</button>}</div></div>}</section>
      </div></> : activeView === "media" ? <section data-onboarding="media.library" className="template-library media-library">
        <div className="template-toolbar">
          <div><p className="eyebrow">PROJECT ASSETS</p><h2>Media library</h2><span className="field-hint">{scene ? `Selected scene: ${scene.title}` : "Select a scene to attach media"}</span></div>
          <label className="media-project-filter">Project<select aria-label="Media library project" value={project.id} disabled={busy || restoringProject || hasOpenForm || projects.length === 0} onChange={(event) => void switchProject(event.target.value, false, "media")}><option value="" disabled>Select a project</option><ProjectOptions projects={projects} /></select></label>
          <label className={`button button-accent upload-control ${!project.id || busy ? "disabled" : ""}`} title="Add an image, audio, MP4, or WebM file to this project."><Plus size={15} /> Add media<input type="file" accept="image/jpeg,image/png,image/gif,image/webp,audio/mpeg,audio/mp4,audio/aac,audio/wav,audio/ogg,video/mp4,video/webm,.mp4,.webm,.jpg,.jpeg,.png,.gif,.webp,.mp3,.m4a,.aac,.wav,.ogg" aria-label="Add media" onChange={uploadMedia} disabled={!project.id || busy} /></label>
        </div>{project.id && permissions.canEdit && <MediaToolsPanel project={project} scene={scene ?? undefined} onProjectUpdated={applyProject} />}{project.storyboard.assets.length ? <div className="media-grid">{project.storyboard.assets.map((asset) => <MediaLibraryItem project={project} key={`${project.id}:${asset.id}`} projectId={project.id} revision={project.storyboard.revision} asset={asset} scenes={scenes} selectedScene={scene ?? undefined} attached={Boolean(scene && (asset.kind === "image" ? scene.imageAssets : asset.kind === "video" ? scene.videoAssets ?? [] : scene.audioAssets).includes(asset.id))} canAttach={permissions.canEdit && Boolean(scene) && !busy} onAttach={() => void attachAsset(asset)} onProjectUpdated={applyProject} />)}</div> : <div className="template-empty"><strong>No media in this project</strong><span>No images, audio, or video added yet.</span></div>}</section> : <section data-onboarding="templates.library" className="template-library"><div className="template-toolbar"><div><p className="eyebrow">AUTHORING LIBRARY</p><h2>Scene templates</h2></div><label className={`button button-accent upload-control ${busy ? "disabled" : ""}`} title="Upload a PowerPoint template."><Upload size={15} /> Upload PPTX template<input type="file" accept=".pptx" aria-label="Upload PPTX template" onChange={uploadTemplate} disabled={busy} /></label></div>{templates.length ? <div className="template-list">{templates.map((template) => <article className="template-row" key={template.id}><div className="template-info"><strong>{template.title}</strong><span>{template.description || "No description"}</span><small>{template.filename} · {(template.sizeBytes / 1024 / 1024).toFixed(1)} MB</small></div><div className="template-actions"><label className={`button button-outline upload-control ${busy ? "disabled" : ""}`} title="Replace this template from a PPTX file."><FileUp size={14} /> Replace PPTX<input type="file" accept=".pptx" aria-label="Replace template PowerPoint" onChange={(event) => replaceTemplateSource(event, template.id)} disabled={busy} /></label><button className="button button-outline" onClick={() => setTemplateDraft({ id: template.id, title: template.title, description: template.description })} disabled={busy}>Edit details</button></div></article>)}</div> : <div className="template-empty"><strong>No templates yet</strong><span>Upload a PowerPoint template to use it when creating scenes.</span></div>}</section>}

      </>}
    </main>

    {showExport && <EditorDialog labelledBy="export-title" className="export-dialog" onClose={() => setShowExport(false)} busy={busy}>
      <div data-onboarding="export.panel" className="modal-head"><div><p className="eyebrow">DELIVER & EXPORT</p><h2 id="export-title">Export course</h2></div><button className="icon-button" onClick={() => setShowExport(false)} disabled={busy} aria-label="Close export"><X size={19} /></button></div>
      <p className="export-project-name">{project.title}</p>
      <p className="field-hint">Exports and archives include only this project's content, not its parent or subprojects. Archive restore preserves the current project attachment.</p>
      <section className="export-section"><h3>Learning management system</h3><p>Build a portable course package for your LMS.</p><div className="export-actions"><button className="button button-accent" onClick={() => void exportScorm2004()} disabled={busy}><Download size={16} /> Build SCORM 2004</button><button className="button button-outline" onClick={() => void exportScorm12()} disabled={busy}>Build SCORM 1.2</button></div>
        <label className="package-threshold"><span>Warn when a package exceeds</span><input aria-label="Package warning threshold in MB" type="number" min="1" max="4096" key={`${project.id}-${project.storyboard.exportSettings.packageWarningThresholdMB}`} defaultValue={project.storyboard.exportSettings.packageWarningThresholdMB} onBlur={(event) => { if (event.currentTarget.validity.valid && event.currentTarget.value !== "") void updatePackageWarningThreshold(Number(event.currentTarget.value)); else event.currentTarget.value = String(project.storyboard.exportSettings.packageWarningThresholdMB); }} disabled={busy} /><span>MB</span></label>
        <div className="export-actions report-actions"><button className="button button-outline" onClick={() => void downloadScormReport("scorm2004")} disabled={busy}>Report 2004 <Download size={14} /></button><button className="button button-outline" onClick={() => void downloadScormReport("scorm12")} disabled={busy}>Report 1.2 <Download size={14} /></button></div>
      </section>
      <section className="export-section"><h3>Standalone course</h3><div className="export-actions"><button className="button button-outline" onClick={() => void exportStandalone()} disabled={busy}><Download size={15} /> Download standalone ZIP</button></div></section>
      <section className="export-section"><h3>Chimera storyboard</h3><p>Save or restore the complete project, including media, review records, and history.</p><div className="export-actions"><button className="button button-outline" onClick={() => void exportStoryboard()} disabled={busy}><Download size={15} /> Download JSON</button><label className={`button button-outline upload-control ${busy ? "disabled" : ""}`}><img src={restoreIcon} alt="" width="16" height="16" /> Restore JSON<input type="file" aria-label="Restore JSON" accept="application/json,.json" onChange={importStoryboard} disabled={busy} /></label></div><div className="export-actions"><button className="button button-accent" onClick={() => void exportProjectBackup()} disabled={busy}><Download size={15} /> Download Chimera storyboard</button><label className={`button button-outline upload-control ${busy ? "disabled" : ""}`}><Upload size={15} /> Restore Chimera storyboard<input type="file" aria-label="Restore Chimera storyboard" accept="application/zip,.zip" onChange={importProjectBackup} disabled={busy} /></label></div></section>
      <section className="export-section"><h3>Editable Word storyboard</h3><p>Choose a slide-like SME Master or the integrated Full storyboard.</p><label className="word-answer-key word-format-select"><span>Format</span><select aria-label="Word storyboard format" value={wordExportFormat} onChange={(event) => setWordExportFormat(event.target.value as "sme" | "full")} disabled={busy}><option value="sme">SME Master</option><option value="full">Full storyboard</option></select></label><label className="word-answer-key"><input type="checkbox" checked={includeWordAnswerKey} onChange={(event) => setIncludeWordAnswerKey(event.target.checked)} disabled={busy} /><span>Include answer keys (authoring material)</span></label><label className="word-answer-key"><input type="checkbox" checked={includeWordComments} onChange={(event) => setIncludeWordComments(event.target.checked)} disabled={busy} /><span>Include review discussion (authoring material)</span></label><button className="button button-outline" onClick={() => void exportWordStoryboard()} disabled={busy}><FileText size={15} /> Download Word document</button></section>
      {assessmentItemCount >= 2 && <section className="export-section"><h3>Assessment test</h3><p>Export all authored questions together as a QTI 2.1 test.</p><button className="button button-outline" onClick={() => void exportAssessmentTest()} disabled={busy}><ClipboardList size={15} /> Download QTI test</button></section>}
      {error && <p className="export-error" role="alert">{error}</p>}{feedback && <p className="export-feedback" role="status">{feedback}</p>}{busy && <p role="status">Working…</p>}
    </EditorDialog>}
    {showCompletionSettings && <CompletionSettingsEditor project={project} onClose={() => setShowCompletionSettings(false)} onProjectUpdated={applyProject} />}
    {showPythiaAnalysis && scene && <PythiaAnalysisView key={`${project.id}-${scene.id}`} projectId={project.id} scene={scene} onClose={() => setShowPythiaAnalysis(false)} />}
    {showPythiaTransform && scene && <PythiaTransformView key={`${project.id}-${scene.id}`} projectId={project.id} scene={scene} scenes={scenes} onClose={() => setShowPythiaTransform(false)} />}
    {showPythiaAssessmentDesign && scene && <PythiaAssessmentDesignView key={`${project.id}-${scene.id}`} projectId={project.id} scene={scene} scenes={scenes} onClose={() => setShowPythiaAssessmentDesign(false)} />}
    {showPythiaCourseReview && <PythiaCourseReviewView project={project} onClose={() => setShowPythiaCourseReview(false)} onNavigateToObject={reference => openCourseReviewObject(reference.object_type, reference.object_id)} />}
    {showAssessments && permissions.canEdit && <AssessmentsEditor key={project.id} project={project} canExport={permissions.canExport} onClose={() => setShowAssessments(false)} onProjectUpdated={applyProject} onEditQuestion={(sceneId, updatedProject) => {
      const index = (updatedProject ?? project).storyboard.scenes.findIndex(candidate => candidate.id === sceneId);
      if (index >= 0) { setSelectedScene(index); setShowAssessments(false); setShowAssessmentEditor(true); }
    }} />}
    {showEnhancementReview && <EnhancementReviewView project={project} onClose={() => setShowEnhancementReview(false)} onProjectUpdated={applyProject} />}
    {showValidation && <ValidationView projectId={project.id} onClose={() => setShowValidation(false)} onOpenScene={(sceneId, issueCode) => { const index = scenes.findIndex((item) => item.id === sceneId); setShowValidation(false); if (index >= 0) setSelectedScene(index); if (issueCode === "missing-image-alt-text") setShowAccessibility(true); else if (issueCode === "missing-assessment-item") setShowAssessmentEditor(true); else setActiveView("storyboard"); }} />}
    {showAccessibility && <AccessibilityView projectId={project.id} revision={project.storyboard.revision} scenes={scenes} assets={project.storyboard.assets} onClose={() => setShowAccessibility(false)} onProjectUpdated={applyProject} />}
    {showGoldenPath && <GoldenPathView walkthroughStatuses={Object.fromEntries(Object.entries(guides).map(([id, guide]) => [id, guide.controller.snapshot().status]))} onStartWalkthrough={() => startOnboarding()} onSelectWalkthrough={id => startOnboarding(id)} project={project} onClose={() => setShowGoldenPath(false)} onCreateProject={() => { setShowGoldenPath(false); setIsCreating(true); }} onOpenStoryboard={() => { setShowGoldenPath(false); setActiveView("storyboard"); }} onOpenMedia={() => { setShowGoldenPath(false); setActiveView("media"); }} onOpenAccessibility={() => { setShowGoldenPath(false); setShowAccessibility(true); }} onOpenPreview={() => { setShowGoldenPath(false); if (project.id) setShowPreview(true); }} onRunValidation={() => { setShowGoldenPath(false); setShowValidation(true); }} onOpenPythiaAnalysis={() => { setShowGoldenPath(false); setShowManagement(false); setActiveView("storyboard"); setShowPythiaAnalysis(true); }} onOpenPythiaTransform={() => { setShowGoldenPath(false); setShowManagement(false); setActiveView("storyboard"); setShowPythiaTransform(true); }} onOpenPythiaAssessment={() => { setShowGoldenPath(false); setShowManagement(false); setActiveView("storyboard"); setShowPythiaAssessmentDesign(true); }} onOpenSuggestions={() => { setShowGoldenPath(false); setShowManagement(false); setShowEnhancementReview(true); }} onOpenCourseReview={() => { setShowGoldenPath(false); setShowManagement(false); setShowPythiaCourseReview(true); }} onOpenManagement={() => { setShowGoldenPath(false); setShowManagement(true); }} onOpenExport={() => { setShowGoldenPath(false); setShowManagement(false); setShowExport(true); }} />}
    {showPreview && project.id && <CoursePreview project={project} onClose={() => setShowPreview(false)} canEnhance={permissions.canEnhance} />}
    {visualSceneId && scenes.find(item => item.id === visualSceneId) && <SceneVisualEditor key={`${project.id}:${visualSceneId}`} initialPanel={sceneEditorPanel} project={project} scene={scenes.find(item => item.id === visualSceneId)!} templates={templates} onClose={() => setVisualSceneId(null)} onSave={saveVisualScene} onExtract={extractVisualScene} onGenerate={generateSceneContentDraft} canGenerate={permissions.canEnhance} />}
    {showAssessmentEditor && project.id && scene?.sceneType === "question" && <AssessmentEditor projectId={project.id} projectTitle={project.title} revision={project.storyboard.revision} scene={scene} scenes={scenes}
      onClose={() => setShowAssessmentEditor(false)}
      onProjectUpdated={applyProject}
    />}
    {isCreating && <EditorDialog onResumeWalkthrough={guidePaused ? () => onboarding.controller.start() : undefined} labelledBy="create-project-title" onClose={() => { if (createdCourseForDraft) setTitle(""); setIsCreating(false); setCourseDesignFiles([]); setCourseResourceIds([]); setCreatedCourseForDraft(false); setCourseDraft(null); setCourseDraftError(""); setCoursePrompt(""); }} busy={busy}>
      <div className="modal-head"><div><p className="eyebrow">{createdCourseForDraft ? "COURSE DRAFTING" : "NEW PROJECT"}</p><h2 id="create-project-title">{createdCourseForDraft ? "Draft course scenes" : "Name your course"}</h2></div><button className="icon-button" onClick={() => { if (createdCourseForDraft) setTitle(""); setIsCreating(false); setCourseDesignFiles([]); setCourseResourceIds([]); setCreatedCourseForDraft(false); setCourseDraft(null); setCourseDraftError(""); setCoursePrompt(""); }} disabled={busy} aria-label={createdCourseForDraft ? "Close course drafting" : "Close new project"}><X size={18} /></button></div>
      {!createdCourseForDraft ? <>
        {creatingParent && <p className="field-hint">Creating a subproject of <strong>{creatingParent.title}</strong>. Content, settings, permissions, and exports are independent.</p>}
        <input data-onboarding="project.name" aria-label="Course name" value={title} onChange={(event) => setTitle(event.target.value)} onKeyDown={(event) => event.key === "Enter" && createProject()} placeholder="e.g. Equipment Inspection Fundamentals" />
        {aiConfiguredForProject && <section className="project-design-documents" aria-label="Course design documents">
          <div><strong>Course design documents</strong><span>Upload source material and add a course-level prompt. PDF, DOCX, PPTX, TXT, or Markdown, up to 25 MB each.</span></div>
          <label className="button button-outline upload-control"><FileUp size={15} /> Attach documents<input type="file" aria-label="Attach course design documents" accept=".pdf,.docx,.pptx,.txt,.md" multiple onChange={(event) => { const added = Array.from(event.currentTarget.files || []); setCourseDesignFiles(current => [...current, ...added.filter(file => !current.some(existing => existing.name === file.name && existing.size === file.size && existing.lastModified === file.lastModified))]); event.currentTarget.value = ""; }} disabled={busy} /></label>
          {courseDesignFiles.length > 0 && <ul aria-label="Selected course design documents">{courseDesignFiles.map((file, index) => <li key={`${file.name}:${file.lastModified}:${index}`}><span>{file.name} · {(file.size / 1024 / 1024).toFixed(1)} MB</span><button type="button" className="icon-button" aria-label={`Remove ${file.name}`} onClick={() => setCourseDesignFiles(current => current.filter((_, fileIndex) => fileIndex !== index))} disabled={busy}><X size={14} /></button></li>)}</ul>}
          <label className="course-draft-prompt">Course prompt<textarea aria-label="Course prompt" rows={4} maxLength={4000} value={coursePrompt} onChange={event => setCoursePrompt(event.target.value)} placeholder="Describe the audience, learning goals, and scenes to create" /></label>
        </section>}
        {aiConfiguredForProject === false && <p className="project-design-documents-status">Connect an AI provider in Settings to use course prompts and design documents.</p>}
        <button className="button button-accent modal-submit" disabled={busy || !title.trim()} onClick={createProject}>Create project <ChevronRight size={16} /></button>{error && <p role="alert">{error}</p>}
      </> : <section className="course-draft-review" aria-label="Review course scene draft">
        <p className="field-hint">Project created: <strong>{project.title}</strong>. {courseResourceIds.length} reference{courseResourceIds.length === 1 ? "" : "s"} available for grounding.</p>
          {error && <p className="visual-editor-error" role="alert">{error}</p>}
        <label className="course-draft-prompt">Course prompt<textarea aria-label="Course prompt" rows={4} maxLength={4000} value={coursePrompt} onChange={event => setCoursePrompt(event.target.value)} /></label>
        {permissions.canEnhance ? <button type="button" className="button button-outline" disabled={busy || !coursePrompt.trim()} onClick={() => void generateCourseContentDraft()}><Sparkles size={15} />{busy ? "Generating…" : "Generate course draft"}</button> : <p className="project-design-documents-status">Your project role does not allow AI draft generation.</p>}
        {courseDraftError && <p className="visual-editor-error" role="alert">{courseDraftError}</p>}
        {courseDraft && <div className="course-draft-scenes" aria-label="Generated scenes for review">{courseDraft.map((draft, index) => <article className="course-draft-scene" key={`${index}:${draft.title}`}><label className="course-draft-include"><input type="checkbox" checked={draft.included} onChange={event => setCourseDraft(current => current?.map((item, itemIndex) => itemIndex === index ? { ...item, included: event.target.checked } : item) || null)} /><span>Include scene {index + 1}</span></label><label>Title<input maxLength={120} value={draft.title} onChange={event => setCourseDraft(current => current?.map((item, itemIndex) => itemIndex === index ? { ...item, title: event.target.value } : item) || null)} /></label><label>On-screen text<textarea rows={4} value={draft.extractedText.join("\n")} onChange={event => setCourseDraft(current => current?.map((item, itemIndex) => itemIndex === index ? { ...item, extractedText: event.target.value.split(/\r?\n/) } : item) || null)} /></label><label>Action description<textarea rows={2} value={draft.actionDescription} onChange={event => setCourseDraft(current => current?.map((item, itemIndex) => itemIndex === index ? { ...item, actionDescription: event.target.value } : item) || null)} /></label><label>Narration<textarea rows={2} value={draft.narration} onChange={event => setCourseDraft(current => current?.map((item, itemIndex) => itemIndex === index ? { ...item, narration: event.target.value } : item) || null)} /></label><label>Speaker notes<textarea rows={2} value={draft.notes} onChange={event => setCourseDraft(current => current?.map((item, itemIndex) => itemIndex === index ? { ...item, notes: event.target.value } : item) || null)} /></label></article>)}</div>}
        {courseDraft?.map((draft, index) => draft.assessmentItem && <AssessmentDraftPreview key={index} item={draft.assessmentItem} settings={draft.assessmentSettings} label={`Scene ${index + 1} assessment`} />)}
        <div className="modal-actions"><button type="button" className="button button-outline" disabled={busy} onClick={() => { setIsCreating(false); setTitle(""); setCreatedCourseForDraft(false); setCourseResourceIds([]); setCourseDraftError(""); setCoursePrompt(""); setCourseDraft(null); }}>Done</button>{courseDraft && <button type="button" className="button button-accent" disabled={busy || !courseDraft.some(item => item.included)} onClick={() => void applyCourseContentDraft()}><Check size={15} /> Add selected scenes</button>}</div>
      </section>}
    </EditorDialog>}
    {sceneDraft && <EditorDialog onResumeWalkthrough={guidePaused ? () => onboarding.controller.start() : undefined} className="scene-editor" labelledBy="scene-editor-title" onClose={() => setSceneDraft(null)} busy={busy}><div className="modal-head"><div><p className="eyebrow">SCENE SETTINGS</p><h2 id="scene-editor-title">{sceneDraft.id ? "Edit scene" : "New scene"}</h2></div><button className="icon-button" onClick={() => setSceneDraft(null)} disabled={busy} aria-label="Close scene editor"><X size={18} /></button></div><label data-onboarding={sceneDraft.id ? "scene.edit" : "scene.form"}>Scene title<input value={sceneDraft.title} maxLength={120} onChange={(event) => setSceneDraft({ ...sceneDraft, title: event.target.value })} /></label><label>Scene type<select value={sceneDraft.sceneType} onChange={(event) => setSceneDraft({ ...sceneDraft, sceneType: event.target.value as SceneType })}><option value="content">Content</option><option value="title">Title</option><option value="question">Question</option><option value="media">Media</option><option value="interaction">Interaction</option><option value="summary">Summary</option></select></label><label>Scene layout<select value={sceneDraft.layoutMode} onChange={(event) => setSceneDraft({ ...sceneDraft, layoutMode: event.target.value as LayoutMode, templateId: event.target.value === "template" ? sceneDraft.templateId : "" })}><option value="fidelity">Fidelity</option><option value="hybrid">Hybrid</option><option value="native">Native</option><option value="template">Template</option></select></label>{sceneDraft.layoutMode === "template" && <label>Template<select value={sceneDraft.templateId} onChange={(event) => setSceneDraft({ ...sceneDraft, templateId: event.target.value })}><option value="">Choose a template</option>{templates.map((template) => <option value={template.id} key={template.id}>{template.title}</option>)}</select>{templates.length === 0 && <span className="field-hint">Upload a PPTX template in the Templates section first.</span>}</label>}<label>On-screen text<textarea rows={5} value={sceneDraft.screenText} onChange={(event) => setSceneDraft({ ...sceneDraft, screenText: event.target.value })} /></label><label>Action description<textarea rows={3} maxLength={5000} value={sceneDraft.actionDescription} onChange={(event) => setSceneDraft({ ...sceneDraft, actionDescription: event.target.value })} placeholder="Describe movement, interaction, or timed actions shown in this scene" /></label><label>Speaker notes<textarea rows={4} value={sceneDraft.notes} onChange={(event) => setSceneDraft({ ...sceneDraft, notes: event.target.value })} /></label>
      <label className="required-toggle"><input type="checkbox" checked={sceneDraft.required} onChange={(event) => setSceneDraft({ ...sceneDraft, required: event.target.checked })} /> Required scene</label>
      {error && <p className="export-error" role="alert">{error}</p>}<div className="modal-actions"><button className="button button-outline" onClick={() => setSceneDraft(null)} disabled={busy}>Cancel</button><button className="button button-accent" onClick={saveScene} disabled={busy || !sceneDraft.title.trim() || (sceneDraft.layoutMode === "template" && !sceneDraft.templateId)}>{sceneDraft.id ? "Save changes" : "Create scene"} <Check size={15} /></button></div></EditorDialog>}
      {templateDraft && <EditorDialog className="scene-editor" labelledBy="template-editor-title" onClose={() => setTemplateDraft(null)} busy={busy}><div data-onboarding="templates.edit" className="modal-head"><div><p className="eyebrow">TEMPLATE LIBRARY</p><h2 id="template-editor-title">Edit template</h2></div><button className="icon-button" onClick={() => setTemplateDraft(null)} disabled={busy} aria-label="Close template editor"><X size={18} /></button></div><label>Template name<input value={templateDraft.title} maxLength={120} onChange={(event) => setTemplateDraft({ ...templateDraft, title: event.target.value })} /></label><label>Description<textarea rows={4} value={templateDraft.description} maxLength={1000} onChange={(event) => setTemplateDraft({ ...templateDraft, description: event.target.value })} /></label>
      {error && <p className="export-error" role="alert">{error}</p>}<div className="modal-actions"><button className="button button-outline" onClick={() => setTemplateDraft(null)} disabled={busy}>Cancel</button><button className="button button-accent" onClick={saveTemplate} disabled={busy || !templateDraft.title.trim()}>Save template <Check size={15} /></button></div></EditorDialog>}
    {guidePaused && resumeHost && !sceneDraft && !isCreating && createPortal(<button type="button" className="button button-outline" disabled={busy} onClick={() => onboarding.controller.start()}>Resume walkthrough</button>, resumeHost)}
    </div>;
}
