"""Portable native learning experiences and author-reviewed design proposals."""
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


Text = Annotated[str, Field(min_length=1, max_length=2000)]
Label = Annotated[str, Field(min_length=1, max_length=120)]


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class FlowStep(StrictModel):
    label: Label
    description: Text


class Reveal(StrictModel):
    label: Label
    explanation: Text


Identifier = Annotated[str, Field(pattern=r"^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$")]


class BranchChoice(StrictModel):
    label: Label
    feedback: Text
    nextNodeId: Identifier | None = None


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

    @model_validator(mode="after")
    def valid_routes(self):
        nodes = {node.id: node for node in self.nodes}
        if len(nodes) != len(self.nodes) or self.startNodeId not in nodes:
            raise ValueError("Branch nodes need unique IDs and an existing start node")
        for node in self.nodes:
            if any(choice.nextNodeId is not None and choice.nextNodeId not in nodes for choice in node.choices):
                raise ValueError("Every branch destination must exist")
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


Activity = Annotated[
    BranchingActivity | HotspotActivity | SequencingActivity | GuidedPracticeActivity,
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
