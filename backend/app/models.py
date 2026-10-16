from typing import Annotated, Any, Literal

from pydantic import BaseModel, Field, model_validator


class ProjectCreate(BaseModel):
    title: str = Field(min_length=1, max_length=120)


class SceneElement(BaseModel):
    id: str = Field(min_length=1, max_length=120)
    kind: Literal["text", "image", "shape"]
    x: float = Field(ge=-10000, le=10000, allow_inf_nan=False)
    y: float = Field(ge=-10000, le=10000, allow_inf_nan=False)
    width: float = Field(gt=0, le=10000, allow_inf_nan=False)
    height: float = Field(gt=0, le=10000, allow_inf_nan=False)
    rotation: float = Field(default=0, ge=-360, le=360, allow_inf_nan=False)
    text: str = Field(default="", max_length=50000)
    assetId: str | None = None
    fontSize: float = Field(default=24, ge=1, le=500, allow_inf_nan=False)
    fontFamily: str = Field(default="sans-serif", max_length=200)
    color: str = Field(default="#202020", pattern=r"^#[0-9a-fA-F]{6}$")
    bold: bool = False
    italic: bool = False
    align: Literal["left", "center", "right"] = "left"
    crop: list[float] = Field(default_factory=lambda: [0, 0, 0, 0], min_length=4, max_length=4)
    shapeSvg: str | None = Field(default=None, max_length=100000)
    shapeName: str | None = Field(default=None, max_length=100)
    source: Literal["slide", "layout", "master", "manual"] = "manual"
    locked: bool = False

    @model_validator(mode="after")
    def validate_element(self) -> "SceneElement":
        if self.kind == "image" and not self.assetId:
            raise ValueError("Image elements require an asset reference")
        if self.kind == "shape" and not self.shapeSvg:
            raise ValueError("Shape elements require vector geometry")
        if any(not 0 <= value < 1 for value in self.crop) or self.crop[0] + self.crop[2] >= 1 or self.crop[1] + self.crop[3] >= 1:
            raise ValueError("Image crop must leave a visible image")
        return self


class SceneLayout(BaseModel):
    version: Literal[1] = 1
    enabled: bool = False
    width: float = Field(default=1280, gt=0, le=10000, allow_inf_nan=False)
    height: float = Field(default=720, gt=0, le=10000, allow_inf_nan=False)
    backgroundColor: str = Field(default="#ffffff", pattern=r"^#[0-9a-fA-F]{6}$")
    backgroundAsset: str | None = None
    elements: list[SceneElement] = Field(default_factory=list, max_length=2000)
    warnings: list[str] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_identifiers(self) -> "SceneLayout":
        if len({element.id for element in self.elements}) != len(self.elements):
            raise ValueError("Scene element identifiers must be unique")
        return self


class SceneCreate(BaseModel):
    title: str = Field(default="New scene", min_length=1, max_length=120)
    sceneType: Literal["content", "title", "assessment", "media", "interaction", "summary"] = "content"
    layoutMode: Literal["fidelity", "hybrid", "native", "template"] = "native"
    templateId: str | None = None
    extractedText: list[str] = Field(default_factory=list)
    actionDescription: str = Field(default="", max_length=5000)
    narration: str = Field(default="", max_length=10000)
    notes: str = ""
    required: bool = True
    audioRequired: bool = False


def normalize_assessment_item_type(data: object) -> object:
    if not isinstance(data, dict):
        return data
    assessment_item = data.get("assessmentItem")
    if isinstance(assessment_item, dict) and "type" not in assessment_item:
        normalized_item = {**assessment_item, "type": "single-choice"}
        return {**data, "assessmentItem": normalized_item}
    return data


class SceneUpdate(BaseModel):
    visualLayout: SceneLayout | None = None
    backgroundAsset: str | None = None
    title: str | None = Field(default=None, min_length=1, max_length=120)
    extractedText: list[str] | None = None
    actionDescription: str | None = Field(default=None, max_length=5000)
    narration: str | None = Field(default=None, max_length=10000)
    sceneType: Literal["content", "title", "assessment", "media", "interaction", "summary"] | None = None
    layoutMode: Literal["fidelity", "hybrid", "native", "template"] | None = None
    templateId: str | None = None
    imageAssets: list[str] | None = None
    imageAltText: dict[str, str] | None = None
    decorativeImages: list[str] | None = None
    audioAssets: list[str] | None = None
    required: bool | None = None
    audioRequired: bool | None = None
    assessmentItem: "AssessmentItem | None" = None
    assessmentSettings: "AssessmentSettings | None" = None
    notes: str | None = None

    @model_validator(mode="before")
    @classmethod
    def normalize_legacy_assessment_item(cls, data: object) -> object:
        return normalize_assessment_item_type(data)


class AssessmentChoice(BaseModel):
    identifier: str = Field(pattern=r"^[A-Za-z][A-Za-z0-9_-]{0,63}$")
    text: str = Field(min_length=1, max_length=1000)


class AssessmentBase(BaseModel):
    identifier: str = Field(pattern=r"^[A-Za-z][A-Za-z0-9_-]{0,63}$")
    prompt: str = Field(min_length=1, max_length=5000)
    correctFeedback: str = Field(default="Correct.", max_length=2000)
    incorrectFeedback: str = Field(default="Review the material and try again.", max_length=2000)


class SingleChoiceAssessment(AssessmentBase):
    type: Literal["single-choice"] = "single-choice"
    choices: list[AssessmentChoice] = Field(min_length=2, max_length=10)
    correctResponse: str = Field(pattern=r"^[A-Za-z][A-Za-z0-9_-]{0,63}$")

    @model_validator(mode="after")
    def validate_choices(self) -> "SingleChoiceAssessment":
        identifiers = [choice.identifier for choice in self.choices]
        if len(set(identifiers)) != len(identifiers):
            raise ValueError("Assessment choice identifiers must be unique")
        if self.correctResponse not in identifiers:
            raise ValueError("Correct response must match one of the choice identifiers")
        return self


class MultipleResponseAssessment(AssessmentBase):
    type: Literal["multiple-response"] = "multiple-response"
    choices: list[AssessmentChoice] = Field(min_length=2, max_length=10)
    correctResponses: list[str] = Field(min_length=1, max_length=10)

    @model_validator(mode="after")
    def validate_responses(self) -> "MultipleResponseAssessment":
        identifiers = [choice.identifier for choice in self.choices]
        if len(set(identifiers)) != len(identifiers):
            raise ValueError("Assessment choice identifiers must be unique")
        if len(set(self.correctResponses)) != len(self.correctResponses):
            raise ValueError("Correct response identifiers must be unique")
        if not set(self.correctResponses).issubset(identifiers):
            raise ValueError("Correct responses must match choice identifiers")
        return self


class TrueFalseAssessment(AssessmentBase):
    type: Literal["true-false"] = "true-false"
    correctResponse: Literal["true", "false"]


class OrderingAssessment(AssessmentBase):
    type: Literal["ordering"] = "ordering"
    choices: list[AssessmentChoice] = Field(min_length=2, max_length=10)
    correctOrder: list[str] = Field(min_length=2, max_length=10)

    @model_validator(mode="after")
    def validate_order(self) -> "OrderingAssessment":
        identifiers = [choice.identifier for choice in self.choices]
        if len(set(identifiers)) != len(identifiers):
            raise ValueError("Assessment choice identifiers must be unique")
        if len(set(self.correctOrder)) != len(self.correctOrder) or set(self.correctOrder) != set(identifiers):
            raise ValueError("Correct order must include each choice identifier exactly once")
        return self


class AssessmentPair(BaseModel):
    sourceIdentifier: str = Field(pattern=r"^[A-Za-z][A-Za-z0-9_-]{0,63}$")
    targetIdentifier: str = Field(pattern=r"^[A-Za-z][A-Za-z0-9_-]{0,63}$")


class DragDropAssessment(AssessmentBase):
    type: Literal["drag-drop"] = "drag-drop"
    draggables: list[AssessmentChoice] = Field(min_length=2, max_length=10)
    targets: list[AssessmentChoice] = Field(min_length=1, max_length=10)
    correctMatches: list[AssessmentPair] = Field(min_length=1, max_length=10)

    @model_validator(mode="after")
    def validate_matches(self) -> "DragDropAssessment":
        draggable_ids = [choice.identifier for choice in self.draggables]
        target_ids = [choice.identifier for choice in self.targets]
        if len(set(draggable_ids)) != len(draggable_ids) or len(set(target_ids)) != len(target_ids):
            raise ValueError("Drag-and-drop identifiers must be unique within each list")
        if set(draggable_ids) & set(target_ids):
            raise ValueError("Draggable and target identifiers must be distinct")
        sources = [pair.sourceIdentifier for pair in self.correctMatches]
        matched_targets = [pair.targetIdentifier for pair in self.correctMatches]
        if len(set(sources)) != len(sources) or len(set(matched_targets)) != len(matched_targets):
            raise ValueError("Each draggable and target can be used only once")
        if not set(sources).issubset(draggable_ids) or set(matched_targets) != set(target_ids):
            raise ValueError("Correct matches must use valid draggables and every target")
        return self


class MatchingAssessment(AssessmentBase):
    type: Literal["matching"] = "matching"
    leftItems: list[AssessmentChoice] = Field(min_length=2, max_length=10)
    rightItems: list[AssessmentChoice] = Field(min_length=2, max_length=10)
    correctMatches: list[AssessmentPair] = Field(min_length=2, max_length=10)

    @model_validator(mode="after")
    def validate_matches(self) -> "MatchingAssessment":
        left_ids = [choice.identifier for choice in self.leftItems]
        right_ids = [choice.identifier for choice in self.rightItems]
        if len(set(left_ids)) != len(left_ids) or len(set(right_ids)) != len(right_ids):
            raise ValueError("Matching identifiers must be unique within each list")
        if set(left_ids) & set(right_ids):
            raise ValueError("Left and right identifiers must be distinct")
        sources = [pair.sourceIdentifier for pair in self.correctMatches]
        targets = [pair.targetIdentifier for pair in self.correctMatches]
        if len(set(sources)) != len(sources) or len(set(targets)) != len(targets):
            raise ValueError("Each matching item can be matched only once")
        if not set(sources).issubset(left_ids) or any(pair.targetIdentifier not in right_ids for pair in self.correctMatches):
            raise ValueError("Correct matches must reference valid items")
        return self


class ShortAnswerAssessment(AssessmentBase):
    type: Literal["short-answer"] = "short-answer"
    acceptedAnswers: list[str] = Field(min_length=1, max_length=20)
    caseSensitive: bool = False

    @model_validator(mode="after")
    def validate_answers(self) -> "ShortAnswerAssessment":
        if any(not answer.strip() for answer in self.acceptedAnswers):
            raise ValueError("Accepted answers cannot be blank")
        return self


AssessmentItem = Annotated[
    SingleChoiceAssessment
    | MultipleResponseAssessment
    | TrueFalseAssessment
    | OrderingAssessment
    | DragDropAssessment
    | MatchingAssessment
    | ShortAnswerAssessment,
    Field(discriminator="type"),
]


class AssessmentSettings(BaseModel):
    maxAttempts: int = Field(default=2, ge=1, le=10)
    passingScore: int = Field(default=100, ge=1, le=100)
    scoreWeight: float = Field(default=1, ge=0.1, le=10)
    remediationSceneId: str | None = None


class CourseCompletionSettings(BaseModel):
    passingScore: int = Field(default=80, ge=1, le=100)
    includeOptionalAssessments: bool = False


class ExportSettings(BaseModel):
    packageWarningThresholdMB: int = Field(default=200, ge=1, le=4096)


EnhancementField = Literal[
    "title", "extractedText", "actionDescription", "narration", "assessmentItem",
    "assessmentSettings", "imageAssets", "imageAltText", "decorativeImages", "audioAssets",
    "required", "audioRequired", "sceneType", "layoutMode", "templateId", "notes",
    "sceneOrder", "storyboardTitle", "completionSettings",
]


class EnhancementProposalChangeCreate(BaseModel):
    targetSceneId: str | None = None
    field: EnhancementField
    proposedValue: Any


class EnhancementProposalChange(EnhancementProposalChangeCreate):
    beforeValue: Any


class EnhancementReferenceCitation(BaseModel):
    resourceId: str
    version: str | None = None
    locator: str | None = None
    excerpt: str | None = Field(default=None, max_length=2000)


class EnhancementProposalCreate(BaseModel):
    targetSceneId: str | None = None
    field: EnhancementField = "actionDescription"
    proposedValue: Any = None
    changes: list[EnhancementProposalChangeCreate] = Field(default_factory=list, min_length=0, max_length=100)
    rationale: str = Field(min_length=1, max_length=2000)
    origin: Literal["ai", "author"] = "ai"
    provider: str | None = Field(default=None, max_length=120)
    model: str | None = Field(default=None, max_length=120)
    affectedIds: list[str] = Field(default_factory=list, max_length=100)
    dependencyGroupId: str | None = None
    referenceCitations: list[EnhancementReferenceCitation] = Field(default_factory=list, max_length=100)
    jobId: str | None = None
    sourceRevision: int | None = Field(default=None, ge=1)
    sourceTaskId: str | None = Field(default=None, max_length=200)
    sourceArtifactId: str | None = Field(default=None, max_length=200)
    sourceCapability: str | None = Field(default=None, max_length=120)
    sourceArtifact: dict[str, Any] | None = None

    @model_validator(mode="after")
    def validate_changes(self) -> "EnhancementProposalCreate":
        if not self.changes and (self.targetSceneId is None or self.proposedValue is None):
            raise ValueError("Provide a target scene and proposed value, or one or more changes")
        return self


class EnhancementProposal(BaseModel):
    id: str
    targetSceneId: str | None = None
    field: EnhancementField = "actionDescription"
    beforeValue: Any = None
    proposedValue: Any = None
    changes: list[EnhancementProposalChange] = Field(default_factory=list)
    sourceRevision: int = 1
    affectedIds: list[str] = Field(default_factory=list)
    dependencyGroupId: str | None = None
    referenceCitations: list[EnhancementReferenceCitation] = Field(default_factory=list)
    jobId: str | None = None
    sourceTaskId: str | None = None
    sourceArtifactId: str | None = None
    sourceCapability: str | None = None
    sourceArtifact: dict[str, Any] | None = None
    rationale: str
    origin: Literal["ai", "author"]
    provider: str | None = None
    model: str | None = None
    status: Literal["pending", "accepted", "rejected", "stale", "superseded", "reversed"] = "pending"
    createdAt: str
    decidedAt: str | None = None
    decisionHistory: list["EnhancementProposalDecisionRecord"] = Field(default_factory=list)


class EnhancementProposalDecisionRecord(BaseModel):
    decision: Literal["accept", "reject", "superseded", "reverse"]
    decidedAt: str
    expectedRevision: int
    actorId: str | None = None
    actorDisplayName: str | None = None
    installationId: str | None = None
    correlationId: str | None = None
    originalChanges: list[EnhancementProposalChange] = Field(default_factory=list)
    appliedChanges: list[EnhancementProposalChange] = Field(default_factory=list)


class EnhancementProposalDecision(BaseModel):
    decision: Literal["accept", "reject", "reverse"]
    changes: list[EnhancementProposalChangeCreate] | None = None


class PythiaAnalysisProposalCreate(BaseModel):
    taskId: str = Field(min_length=1, max_length=200)
    artifactId: str = Field(min_length=1, max_length=200)
    sceneId: str = Field(min_length=1, max_length=120)
    sourceRevision: int = Field(ge=1)


class PythiaTransformRequest(BaseModel):
    sceneIds: list[str] = Field(min_length=1, max_length=100)
    constraints: dict[str, Any] = Field(default_factory=dict)

    @model_validator(mode="after")
    def validate_unique_scenes(self) -> "PythiaTransformRequest":
        if len(set(self.sceneIds)) != len(self.sceneIds):
            raise ValueError("Transform scene IDs must be unique")
        return self


class PythiaTransformProposalCreate(BaseModel):
    taskId: str = Field(min_length=1, max_length=200)
    artifactId: str = Field(min_length=1, max_length=200)
    sourceSceneIds: list[str] = Field(min_length=1, max_length=100)
    sourceRevision: int = Field(ge=1)


class PythiaTransformProposalDecision(BaseModel):
    decision: Literal["accept", "reject"]
    proposedScenes: list[dict[str, Any]] | None = None


class PythiaTransformProposalDecisionRecord(BaseModel):
    decision: Literal["accept", "reject"]
    decidedAt: str
    expectedRevision: int
    actorId: str | None = None
    actorDisplayName: str | None = None
    installationId: str | None = None
    correlationId: str | None = None
    acceptedScenes: list[dict[str, Any]] = Field(default_factory=list)


class PythiaTransformProposal(BaseModel):
    id: str
    taskId: str
    artifactId: str
    sourceSceneIds: list[str] = Field(min_length=1, max_length=100)
    sourceRevision: int = Field(ge=1)
    artifact: dict[str, Any]
    status: Literal["pending", "accepted", "rejected", "stale"] = "pending"
    createdAt: str
    decidedAt: str | None = None
    decisionHistory: list[PythiaTransformProposalDecisionRecord] = Field(default_factory=list)


class PythiaTransformProposalResult(BaseModel):
    proposal: PythiaTransformProposal
    project: "ProjectDetail | None" = None


class PythiaAssessmentObjective(BaseModel):
    id: str = Field(min_length=1, max_length=120)
    statement: str = Field(min_length=1, max_length=2000)
    sceneIds: list[str] = Field(min_length=1, max_length=100)


class PythiaAssessmentDesignRequest(BaseModel):
    sceneIds: list[str] = Field(min_length=1, max_length=100)
    objectives: list[PythiaAssessmentObjective] = Field(min_length=1, max_length=100)
    audience: str = Field(min_length=1, max_length=500)
    desiredDifficulty: str = Field(min_length=1, max_length=80)
    completionRules: str = Field(min_length=1, max_length=2000)
    constraints: dict[str, Any] = Field(default_factory=dict)

    @model_validator(mode="after")
    def validate_unique_assessment_inputs(self) -> "PythiaAssessmentDesignRequest":
        if len(set(self.sceneIds)) != len(self.sceneIds):
            raise ValueError("Assessment design scene IDs must be unique")
        objective_ids = [objective.id for objective in self.objectives]
        if len(set(objective_ids)) != len(objective_ids):
            raise ValueError("Assessment objective IDs must be unique")
        selected_scene_ids = set(self.sceneIds)
        for objective in self.objectives:
            if len(set(objective.sceneIds)) != len(objective.sceneIds):
                raise ValueError("Assessment objective scene mappings must be unique")
            if not set(objective.sceneIds).issubset(selected_scene_ids):
                raise ValueError("Assessment objectives can only map to selected scenes")
        return self


class PythiaAssessmentProposalCreate(BaseModel):
    taskId: str = Field(min_length=1, max_length=200)
    artifactId: str = Field(min_length=1, max_length=200)
    sourceSceneIds: list[str] = Field(min_length=1, max_length=100)
    objectiveIds: list[str] = Field(min_length=1, max_length=100)
    sourceRevision: int = Field(ge=1)

    @model_validator(mode="after")
    def validate_unique_assessment_scope(self) -> "PythiaAssessmentProposalCreate":
        if len(set(self.sourceSceneIds)) != len(self.sourceSceneIds):
            raise ValueError("Assessment proposal source scene IDs must be unique")
        if len(set(self.objectiveIds)) != len(self.objectiveIds):
            raise ValueError("Assessment proposal objective IDs must be unique")
        return self


class PythiaAnalysisProposalDecision(BaseModel):
    decision: Literal["accept", "reject"]


class PythiaAnalysisProposalDecisionRecord(BaseModel):
    decision: Literal["accept", "reject"]
    decidedAt: str
    storyboardRevision: int
    actorId: str | None = None
    actorDisplayName: str | None = None
    installationId: str | None = None
    correlationId: str | None = None


class PythiaAnalysisProposal(BaseModel):
    id: str
    taskId: str
    artifactId: str
    sceneId: str
    sourceRevision: int
    artifact: dict[str, Any]
    status: Literal["pending", "accepted", "rejected"] = "pending"
    createdAt: str
    decidedAt: str | None = None
    decisionHistory: list[PythiaAnalysisProposalDecisionRecord] = Field(default_factory=list)


class PythiaCourseReviewCreate(BaseModel):
    taskId: str = Field(min_length=1, max_length=200)
    artifactId: str = Field(min_length=1, max_length=200)
    sourceRevision: int = Field(ge=1)


class PythiaCourseFindingDecision(BaseModel):
    status: Literal["open", "resolved", "dismissed"]
    resolutionNote: str | None = Field(default=None, max_length=2000)

    @model_validator(mode="after")
    def validate_resolution(self) -> "PythiaCourseFindingDecision":
        if self.status == "resolved" and not (self.resolutionNote or "").strip():
            raise ValueError("A resolution note is required to resolve a course finding")
        return self


class PythiaCourseFindingDecisionRecord(BaseModel):
    previousStatus: Literal["open", "resolved", "dismissed"]
    status: Literal["open", "resolved", "dismissed"]
    resolutionNote: str | None = None
    decidedAt: str
    actorId: str | None = None
    actorDisplayName: str | None = None
    installationId: str | None = None
    correlationId: str | None = None


class PythiaCourseFindingReview(BaseModel):
    findingId: str
    status: Literal["open", "resolved", "dismissed"] = "open"
    resolutionNote: str | None = None
    decisionHistory: list[PythiaCourseFindingDecisionRecord] = Field(default_factory=list)


class PythiaCourseReview(BaseModel):
    id: str
    taskId: str
    artifactId: str
    sourceRevision: int = Field(ge=1)
    artifact: dict[str, Any]
    findings: list[PythiaCourseFindingReview] = Field(default_factory=list)
    createdAt: str
    updatedAt: str


class ReferencePassage(BaseModel):
    locator: str
    text: str = Field(min_length=1, max_length=50000)


class ReferenceResourceVersion(BaseModel):
    version: str
    filename: str
    contentType: str
    sizeBytes: int
    sha256: str
    originalPath: str
    passages: list[ReferencePassage] = Field(default_factory=list)
    extractionStatus: Literal["complete", "partial", "failed"] = "complete"
    extractionMessage: str | None = None
    createdAt: str


class ReferenceResource(BaseModel):
    id: str
    title: str
    classification: Literal["study-guide", "supporting-document", "policy", "other"] = "supporting-document"
    authoritative: bool = False
    sceneIds: list[str] = Field(default_factory=list)
    currentVersion: str
    versions: list[ReferenceResourceVersion]


class EnhancementJobCreate(BaseModel):
    scope: Literal["selected-scenes", "whole-course"]
    sceneIds: list[str] = Field(default_factory=list, max_length=500)
    goal: str = Field(min_length=1, max_length=2000)
    resourceIds: list[str] = Field(default_factory=list, max_length=100)
    commentId: str | None = None

    @model_validator(mode="after")
    def validate_scope(self) -> "EnhancementJobCreate":
        if self.scope == "selected-scenes" and not self.sceneIds:
            raise ValueError("Select at least one scene for a selected-scenes run")
        if self.scope == "whole-course" and self.sceneIds:
            raise ValueError("Whole-course runs must not include a scene subset")
        if len(set(self.sceneIds)) != len(self.sceneIds):
            raise ValueError("Scene IDs must be unique")
        if len(set(self.resourceIds)) != len(self.resourceIds):
            raise ValueError("Reference resource IDs must be unique")
        return self


class EnhancementResourceConflict(BaseModel):
    explanation: str = Field(min_length=1, max_length=2000)
    citations: list[EnhancementReferenceCitation] = Field(min_length=2, max_length=10)


class EnhancementJob(BaseModel):
    id: str
    projectId: str
    sourceRevision: int
    aiConnectionRevision: str | None = None
    scope: Literal["selected-scenes", "whole-course"]
    sceneIds: list[str]
    goal: str
    resourceIds: list[str]
    commentId: str | None = None
    resourceVersions: dict[str, str] = Field(default_factory=dict)
    status: Literal["queued", "running", "completed", "cancelled", "failed"] = "queued"
    progress: int = Field(default=0, ge=0, le=100)
    message: str = "Queued"
    provider: str | None = None
    model: str | None = None
    estimatedInputTokens: int | None = None
    estimatedCostUsd: float | None = None
    proposalIds: list[str] = Field(default_factory=list)
    resourceConflicts: list[EnhancementResourceConflict] = Field(default_factory=list)
    error: str | None = None
    retryOf: str | None = None
    cancelRequested: bool = False
    createdAt: str
    updatedAt: str


class ReviewCommentCreate(BaseModel):
    sceneId: str
    authorLabel: str = Field(min_length=1, max_length=120)
    body: str = Field(min_length=1, max_length=5000)
    assetId: str | None = None
    timeSeconds: float | None = Field(default=None, ge=0)


class ReviewReplyCreate(BaseModel):
    authorLabel: str = Field(min_length=1, max_length=120)
    body: str = Field(min_length=1, max_length=5000)


class ReviewCommentReply(BaseModel):
    id: str
    actorId: str = "local-user"
    authorLabel: str
    body: str
    createdAt: str


class ReviewComment(BaseModel):
    id: str
    projectId: str
    sceneId: str
    sceneTitle: str
    revision: int
    actorId: str = "local-user"
    authorLabel: str
    body: str
    assetId: str | None = None
    timeSeconds: float | None = None
    replies: list[ReviewCommentReply] = Field(default_factory=list)
    resolved: bool = False
    resolvedAt: str | None = None
    createdAt: str
    updatedAt: str
    outdated: bool = False
    sceneDeleted: bool = False


class ReviewCommentDecision(BaseModel):
    resolved: bool


class MediaGenerationJobCreate(BaseModel):
    kind: Literal["image", "narration"]
    sceneId: str
    purpose: str = Field(min_length=1, max_length=2000)
    style: str = Field(default="", max_length=2000)
    width: int | None = Field(default=None, ge=64, le=4096)
    height: int | None = Field(default=None, ge=64, le=4096)
    prompt: str = Field(default="", max_length=10000)
    script: str = Field(default="", max_length=10000)
    voice: str | None = Field(default=None, max_length=200)
    language: str | None = Field(default=None, max_length=40)
    altText: str = Field(default="", max_length=2000)
    captions: str = Field(default="", max_length=20000)

    @model_validator(mode="after")
    def validate_kind(self) -> "MediaGenerationJobCreate":
        if self.kind == "narration" and not self.script.strip():
            raise ValueError("Narration generation requires a script")
        if self.kind == "image" and not self.prompt.strip():
            raise ValueError("Image generation requires a prompt")
        return self


class MediaGenerationJob(BaseModel):
    id: str
    projectId: str
    sourceRevision: int
    aiConnectionRevision: str | None = None
    sceneId: str
    kind: Literal["image", "narration"]
    purpose: str
    style: str = ""
    width: int | None = None
    height: int | None = None
    prompt: str
    script: str = ""
    voice: str | None = None
    language: str | None = None
    altText: str = ""
    captions: str = ""
    status: Literal["queued", "running", "completed", "cancelled", "failed"] = "queued"
    progress: int = Field(default=0, ge=0, le=100)
    message: str = "Queued"
    provider: str | None = None
    model: str | None = None
    estimatedCostUsd: float | None = None
    candidateIds: list[str] = Field(default_factory=list)
    error: str | None = None
    retryOf: str | None = None
    cancelRequested: bool = False
    createdAt: str
    updatedAt: str


class GeneratedAssetCandidate(BaseModel):
    id: str
    projectId: str
    jobId: str
    sourceRevision: int
    sceneId: str
    kind: Literal["image", "audio"]
    status: Literal["pending", "approved", "rejected"] = "pending"
    filename: str
    contentType: str
    sizeBytes: int
    sha256: str
    path: str
    purpose: str
    prompt: str
    style: str = ""
    width: int | None = None
    height: int | None = None
    script: str = ""
    voice: str | None = None
    language: str | None = None
    altText: str = ""
    captions: str = ""
    provider: str | None = None
    model: str | None = None
    createdAt: str
    approvedAssetId: str | None = None


class EnhancementProposalResult(BaseModel):
    proposal: EnhancementProposal
    project: "ProjectDetail | None" = None


SceneUpdate.model_rebuild()


class ExtractedAsset(BaseModel):
    id: str
    kind: Literal["image", "audio"]
    filename: str
    contentType: str
    sizeBytes: int
    sha256: str
    path: str
    attributionText: str = Field(default="", max_length=2000)
    attributionStatus: Literal["draft", "complete"] = "draft"


class AssetAttributionUpdate(BaseModel):
    attributionText: str = Field(default="", max_length=2000)
    attributionStatus: Literal["draft", "complete"] = "draft"


class Scene(BaseModel):
    id: str
    visualLayout: SceneLayout | None = None
    sourceSlide: int | None = None
    title: str
    sceneType: Literal["content", "title", "assessment", "media", "interaction", "summary"] = "content"
    extractedText: list[str] = Field(default_factory=list)
    actionDescription: str = Field(default="", max_length=5000)
    narration: str = Field(default="", max_length=10000)
    layoutMode: Literal["fidelity", "hybrid", "native", "template"] = "fidelity"
    required: bool = True
    audioRequired: bool = False
    assessmentItem: AssessmentItem | None = None
    assessmentSettings: AssessmentSettings | None = None
    backgroundAsset: str | None = None
    templateId: str | None = None
    imageAssets: list[str] = Field(default_factory=list)
    imageAltText: dict[str, str] = Field(default_factory=dict)
    decorativeImages: list[str] = Field(default_factory=list)
    audioAssets: list[str] = Field(default_factory=list)
    previewImage: str | None = None
    renderWarning: str | None = None
    notes: str = ""
    sourceAnimationXml: str | None = None
    sourceTransitionXml: str | None = None

    @model_validator(mode="before")
    @classmethod
    def normalize_legacy_assessment_item(cls, data: object) -> object:
        return normalize_assessment_item_type(data)


class TemplateCreate(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    description: str = Field(default="", max_length=1000)


class TemplateUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=1000)


class TemplateRecord(BaseModel):
    id: str
    title: str
    description: str = ""
    filename: str
    sizeBytes: int
    updatedAt: str


class SceneOrder(BaseModel):
    sceneIds: list[str] = Field(min_length=1)


class Storyboard(BaseModel):
    schemaVersion: str = "1.0"
    revision: int = Field(default=1, ge=1)
    projectId: str
    title: str
    description: str = ""
    completionSettings: CourseCompletionSettings = Field(default_factory=CourseCompletionSettings)
    exportSettings: ExportSettings = Field(default_factory=ExportSettings)
    scenes: list[Scene] = Field(default_factory=list)
    assets: list[ExtractedAsset] = Field(default_factory=list)


ProductionStage = Literal["not-set", "draft", "in-production", "in-review", "approved", "published"]


class ProductionStageUpdate(BaseModel):
    productionStage: ProductionStage


class ProjectSummary(BaseModel):
    id: str
    title: str
    sceneCount: int
    updatedAt: str
    hasSourceDeck: bool
    installationId: str = "local-installation"
    ownerId: str = "local-user"
    productionStage: ProductionStage = "not-set"


class ProjectDetail(ProjectSummary):
    storyboard: Storyboard


class TrashedProject(ProjectSummary):
    trashedAt: str
    expiresAt: str


EnhancementProposalResult.model_rebuild()
PythiaTransformProposalResult.model_rebuild()


class ValidationIssue(BaseModel):
    severity: Literal["error", "warning"]
    code: str
    message: str
    sceneId: str | None = None
    sceneTitle: str | None = None


class ValidationReport(BaseModel):
    projectId: str
    passed: bool
    issues: list[ValidationIssue] = Field(default_factory=list)
