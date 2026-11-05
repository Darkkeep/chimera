"""Portable native learning experiences and author-reviewed design proposals."""
import re
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StrictBool, model_serializer, model_validator


Text = Annotated[str, Field(min_length=1, max_length=2000)]
Label = Annotated[str, Field(min_length=1, max_length=120)]
ScreenshotAlt = Annotated[str, Field(min_length=1, max_length=500)]


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class FlowStep(StrictModel):
    label: Label
    description: Text


class Reveal(StrictModel):
    label: Label
    explanation: Text


Identifier = Annotated[str, Field(pattern=r"^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$")]


class BranchVariable(StrictModel):
    id: Identifier
    label: Label
    initialValue: StrictBool


class VariableAssignment(StrictModel):
    variableId: Identifier
    value: StrictBool


class VariableCondition(StrictModel):
    variableId: Identifier
    equals: StrictBool


class BranchChoice(StrictModel):
    label: Label
    feedback: Text
    nextNodeId: Identifier | None = None
    visibleWhen: VariableCondition | None = None
    setVariables: list[VariableAssignment] = Field(default_factory=list, max_length=5)

    @model_serializer(mode="wrap")
    def preserve_legacy_shape(self, handler):
        data = handler(self)
        if "visibleWhen" not in self.model_fields_set:
            data.pop("visibleWhen", None)
        if "setVariables" not in self.model_fields_set:
            data.pop("setVariables", None)
        return data


class BranchNode(StrictModel):
    id: Identifier
    prompt: Text
    choices: list[BranchChoice] = Field(min_length=2, max_length=6)


class BranchingActivity(StrictModel):
    kind: Literal["branching"]
    id: Identifier
    title: Label
    startNodeId: Identifier
    nodes: list[BranchNode] = Field(min_length=1, max_length=20)
    variables: list[BranchVariable] = Field(default_factory=list, max_length=5)

    @model_serializer(mode="wrap")
    def preserve_legacy_shape(self, handler):
        data = handler(self)
        if "variables" not in self.model_fields_set:
            data.pop("variables", None)
        return data

    @model_validator(mode="after")
    def valid_routes(self):
        nodes = {node.id: node for node in self.nodes}
        if len(nodes) != len(self.nodes) or self.startNodeId not in nodes:
            raise ValueError("Branch nodes need unique IDs and an existing start node")
        variables = {variable.id: variable for variable in self.variables}
        if len(variables) != len(self.variables):
            raise ValueError("Branch variable IDs must be unique")
        for node in self.nodes:
            for choice in node.choices:
                if choice.nextNodeId is not None and choice.nextNodeId not in nodes:
                    raise ValueError("Every branch destination must exist")
                if choice.visibleWhen and choice.visibleWhen.variableId not in variables:
                    raise ValueError("Choice visibility must reference an existing branch variable")
                assigned = [item.variableId for item in choice.setVariables]
                if len(assigned) != len(set(assigned)) or any(identifier not in variables for identifier in assigned):
                    raise ValueError("Choice assignments must reference unique existing branch variables")
        visited, active = set(), set()

        def visit(identifier):
            if identifier in active:
                raise ValueError("Branch routes must end, not cycle")
            if identifier in visited:
                return
            active.add(identifier)
            for choice in nodes[identifier].choices:
                if choice.nextNodeId is not None:
                    visit(choice.nextNodeId)
            active.remove(identifier)
            visited.add(identifier)

        visit(self.startNodeId)
        if visited != set(nodes):
            raise ValueError("Every branch node must be reachable from the start")

        initial = {variable.id: variable.initialValue for variable in self.variables}
        reachable_nodes, visited_states = set(), set()

        def visit_state(identifier, values):
            state = (identifier, tuple(values[variable.id] for variable in self.variables))
            if state in visited_states:
                return
            visited_states.add(state)
            reachable_nodes.add(identifier)
            node = nodes[identifier]
            choices = [
                choice for choice in node.choices
                if choice.visibleWhen is None or values[choice.visibleWhen.variableId] == choice.visibleWhen.equals
            ]
            if len(choices) < 2:
                raise ValueError("Every reachable decision must show at least two choices")
            for choice in choices:
                next_values = values.copy()
                for assignment in choice.setVariables:
                    next_values[assignment.variableId] = assignment.value
                if choice.nextNodeId is not None:
                    visit_state(choice.nextNodeId, next_values)

        visit_state(self.startNodeId, initial)
        if reachable_nodes != set(nodes):
            raise ValueError("Every branch node must be reachable through visible choices")
        return self


class Hotspot(StrictModel):
    id: Identifier
    label: Label
    explanation: Text
    x: float = Field(ge=5, le=95, allow_inf_nan=False)
    y: float = Field(ge=5, le=95, allow_inf_nan=False)


class HotspotActivity(StrictModel):
    kind: Literal["hotspots"]
    id: Identifier
    title: Label
    diagramDescription: Text
    imageAssetId: str | None = Field(default=None, min_length=1, max_length=120)
    hotspots: list[Hotspot] = Field(min_length=1, max_length=12)

    @model_validator(mode="after")
    def unique_points(self):
        if len({point.id for point in self.hotspots}) != len(self.hotspots):
            raise ValueError("Hotspot IDs must be unique")
        return self


class SequenceItem(StrictModel):
    id: Identifier
    label: Label


class SequencingActivity(StrictModel):
    kind: Literal["sequencing"]
    id: Identifier
    title: Label
    instruction: Text
    items: list[SequenceItem] = Field(min_length=2, max_length=10)
    feedback: Text

    @model_validator(mode="after")
    def unique_items(self):
        if len({item.id for item in self.items}) != len(self.items):
            raise ValueError("Sequence item IDs must be unique")
        return self


class PracticeChoice(StrictModel):
    id: Identifier
    label: Label
    feedback: Text


class PracticeStep(StrictModel):
    id: Identifier
    prompt: Text
    hint: Text
    choices: list[PracticeChoice] = Field(min_length=2, max_length=6)
    correctChoiceId: Identifier

    @model_validator(mode="after")
    def valid_answer(self):
        ids = {choice.id for choice in self.choices}
        if len(ids) != len(self.choices) or self.correctChoiceId not in ids:
            raise ValueError("Practice choices need unique IDs and an existing correct choice")
        return self


class GuidedPracticeActivity(StrictModel):
    kind: Literal["guided-practice"]
    id: Identifier
    title: Label
    steps: list[PracticeStep] = Field(min_length=1, max_length=10)

    @model_validator(mode="after")
    def unique_steps(self):
        if len({step.id for step in self.steps}) != len(self.steps):
            raise ValueError("Practice step IDs must be unique")
        return self


class SoftwareWalkthroughStep(StrictModel):
    id: Identifier
    label: Label
    screenshotAssetId: str = Field(min_length=1, max_length=120)
    screenshotAltText: ScreenshotAlt
    description: Text
    actionPrompt: Text


class SoftwareWalkthroughActivity(StrictModel):
    kind: Literal["software-walkthrough"]
    id: Identifier
    title: Label
    steps: list[SoftwareWalkthroughStep] = Field(min_length=1, max_length=10)

    @model_validator(mode="after")
    def unique_steps(self):
        if len({step.id for step in self.steps}) != len(self.steps):
            raise ValueError("Walkthrough step IDs must be unique")
        return self


class ComparisonImage(StrictModel):
    imageAssetId: str = Field(min_length=1, max_length=120)
    label: Label
    altText: ScreenshotAlt
    description: Text


class BeforeAfterActivity(StrictModel):
    kind: Literal["before-after"]
    id: Identifier
    title: Label
    instruction: Text
    before: ComparisonImage
    after: ComparisonImage
    explanation: Text

    @model_validator(mode="after")
    def distinct_images(self):
        if self.before.imageAssetId == self.after.imageAssetId:
            raise ValueError("Before and after must reference two distinct project images")
        return self


class ExternalLinkActivity(StrictModel):
    kind: Literal["external-link"]
    id: Identifier
    title: Label
    url: str = Field(min_length=1, max_length=2000)
    instruction: Text
    privacyNotice: Text
    offlineAlternative: Text
    authorReviewed: StrictBool = False

    @model_validator(mode="after")
    def safe_destination(self):
        # Deliberately bounded public HTTPS links: no credentials, ports, query
        # strings, fragments, encoded data, IP literals or local hostnames.
        match = re.fullmatch(r"https://([a-z0-9.-]+)(/[A-Za-z0-9/_~.-]*)?", self.url)
        if not match:
            raise ValueError("Use a public HTTPS URL with an optional plain path; no credentials, ports, query, fragment or encoding")
        host = match[1]
        labels = host.split(".")
        if (len(host) > 253 or len(labels) < 2 or not re.fullmatch(r"[a-z]{2,63}", labels[-1])
                or labels[-1] in {"localhost", "local", "internal", "lan", "home"}
                or any(not re.fullmatch(r"[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?", label) for label in labels)):
            raise ValueError("Use a public DNS hostname, not an IP address or local hostname")
        return self


class LearnerConversationActivity(StrictModel):
    kind: Literal["learner-conversation"]
    id: Identifier
    title: Label
    role: Label
    scenario: Text
    opening: Text
    responses: list[Text] = Field(min_length=1, max_length=5)
    offlineAlternative: Text


Activity = Annotated[
    BranchingActivity | HotspotActivity | SequencingActivity | GuidedPracticeActivity | SoftwareWalkthroughActivity | BeforeAfterActivity | ExternalLinkActivity | LearnerConversationActivity,
    Field(discriminator="kind"),
]


class Experience(StrictModel):
    version: Literal[1] = 1
    heading: Label
    introduction: Text
    flow: list[FlowStep] = Field(default_factory=list, max_length=5)
    reveals: list[Reveal] = Field(default_factory=list, max_length=8)
    activities: list[Activity] = Field(default_factory=list, max_length=8)
    conclusion: Text
    motion: bool = True
    background: str = Field(pattern=r"^#[0-9a-fA-F]{6}$")
    foreground: str = Field(pattern=r"^#[0-9a-fA-F]{6}$")
    accent: str = Field(pattern=r"^#[0-9a-fA-F]{6}$")
    accentText: str = Field(pattern=r"^#[0-9a-fA-F]{6}$")
    diagramAccent: str = Field(pattern=r"^#[0-9a-fA-F]{6}$")

    @model_validator(mode="after")
    def readable_colors(self):
        if len(self.flow) == 1:
            raise ValueError("A concept flow needs at least two steps")
        if not (self.flow or self.reveals or self.activities):
            raise ValueError("An experience needs a flow, reveals or activities")
        if len({activity.id for activity in self.activities}) != len(self.activities):
            raise ValueError("Activity IDs must be unique")
        def luminance(color):
            channels = [int(color[i:i + 2], 16) / 255 for i in (1, 3, 5)]
            linear = [value / 12.92 if value <= .04045 else ((value + .055) / 1.055) ** 2.4 for value in channels]
            return sum(value * weight for value, weight in zip(linear, (.2126, .7152, .0722)))

        for foreground, background in ((self.foreground, self.background), (self.accentText, self.accent)):
            a, b = luminance(foreground), luminance(background)
            if (max(a, b) + .05) / (min(a, b) + .05) < 4.5:
                raise ValueError("Experience text colors must meet 4.5:1 contrast")
        a, b = luminance(self.diagramAccent), luminance(self.background)
        if (max(a, b) + .05) / (min(a, b) + .05) < 3:
            raise ValueError("Diagram accents must meet 3:1 contrast against the background")
        return self


class ProductionNeed(StrictModel):
    description: Text
    requiredBeforeApply: bool


class ExperienceTreatment(StrictModel):
    learningIntent: Text
    rationale: Text
    experience: Experience
    productionNeeds: list[ProductionNeed] = Field(default_factory=list, max_length=12)


class ExperienceDesignRequest(StrictModel):
    requestId: str = Field(pattern=r"^[a-zA-Z0-9][a-zA-Z0-9_-]{7,79}$")
    contextFingerprint: str = Field(pattern=r"^[a-f0-9]{64}$")
    sourceIds: list[str] = Field(default_factory=list, max_length=5)
    includeDesignBrief: bool = True
    direction: str = Field(min_length=1, max_length=4000)
    currentTreatment: ExperienceTreatment | None = None


class ExperienceReview(StrictModel):
    draftId: str = Field(pattern=r"^[a-f0-9]{32}$")
    treatment: ExperienceTreatment
