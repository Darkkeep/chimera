from typing import Annotated, Literal

from pydantic import BaseModel, Field, model_validator


class ProjectCreate(BaseModel):
    title: str = Field(min_length=1, max_length=120)


class SceneCreate(BaseModel):
    title: str = Field(default="New scene", min_length=1, max_length=120)
    sceneType: Literal["content", "title", "assessment", "media", "interaction", "summary"] = "content"
    layoutMode: Literal["fidelity", "hybrid", "native", "template"] = "native"
    templateId: str | None = None
    extractedText: list[str] = Field(default_factory=list)
    actionDescription: str = Field(default="", max_length=5000)
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
    title: str | None = Field(default=None, min_length=1, max_length=120)
    extractedText: list[str] | None = None
    actionDescription: str | None = Field(default=None, max_length=5000)
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


class EnhancementProposalCreate(BaseModel):
    targetSceneId: str
    field: Literal["actionDescription"] = "actionDescription"
    proposedValue: str = Field(max_length=5000)
    rationale: str = Field(min_length=1, max_length=2000)
    origin: Literal["ai", "author"] = "ai"
    provider: str | None = Field(default=None, max_length=120)
    model: str | None = Field(default=None, max_length=120)


class EnhancementProposal(BaseModel):
    id: str
    targetSceneId: str
    field: Literal["actionDescription"]
    beforeValue: str
    proposedValue: str
    rationale: str
    origin: Literal["ai", "author"]
    provider: str | None = None
    model: str | None = None
    status: Literal["pending", "accepted", "rejected", "stale"] = "pending"
    createdAt: str
    decidedAt: str | None = None


class EnhancementProposalDecision(BaseModel):
    decision: Literal["accept", "reject"]


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
    sourceSlide: int | None = None
    title: str
    sceneType: Literal["content", "title", "assessment", "media", "interaction", "summary"] = "content"
    extractedText: list[str] = Field(default_factory=list)
    actionDescription: str = Field(default="", max_length=5000)
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
    projectId: str
    title: str
    description: str = ""
    completionSettings: CourseCompletionSettings = Field(default_factory=CourseCompletionSettings)
    exportSettings: ExportSettings = Field(default_factory=ExportSettings)
    scenes: list[Scene] = Field(default_factory=list)
    assets: list[ExtractedAsset] = Field(default_factory=list)


class ProjectSummary(BaseModel):
    id: str
    title: str
    sceneCount: int
    updatedAt: str
    hasSourceDeck: bool


class ProjectDetail(ProjectSummary):
    storyboard: Storyboard


EnhancementProposalResult.model_rebuild()


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
