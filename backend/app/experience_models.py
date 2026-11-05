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


class Experience(StrictModel):
    version: Literal[1] = 1
    heading: Label
    introduction: Text
    flow: list[FlowStep] = Field(min_length=2, max_length=5)
    reveals: list[Reveal] = Field(min_length=1, max_length=8)
    conclusion: Text
    motion: bool = True
    background: str = Field(pattern=r"^#[0-9a-fA-F]{6}$")
    foreground: str = Field(pattern=r"^#[0-9a-fA-F]{6}$")
    accent: str = Field(pattern=r"^#[0-9a-fA-F]{6}$")
    accentText: str = Field(pattern=r"^#[0-9a-fA-F]{6}$")
    diagramAccent: str = Field(pattern=r"^#[0-9a-fA-F]{6}$")

    @model_validator(mode="after")
    def readable_colors(self):
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
