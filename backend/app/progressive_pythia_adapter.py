"""Adapter for Pythia's existing bounded Chimera authoring-plan result.

Source contract: Darkkeep/Pythia service/chimera_authoring.py, AuthoringPlan,
ContentScene and ChimeraDraftProducer. This module does not invoke Pythia,
start model calls, establish source citations, or write a storyboard.
"""
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from .progressive_authoring import DraftScene, Provenance


class PythiaContentScene(BaseModel):
    model_config = ConfigDict(extra="forbid")
    title: str = Field(min_length=1, max_length=120)
    sceneType: Literal["content", "title", "summary"] = "content"
    extractedText: list[str] = Field(min_length=1, max_length=12)
    narration: str = Field(default="", max_length=10000)
    actionDescription: str = Field(default="", max_length=5000)
    notes: str = Field(default="", max_length=10000)

    @model_validator(mode="after")
    def bounded_text(self):
        if not self.title.strip() or any(not text.strip() or len(text) > 2000 for text in self.extractedText):
            raise ValueError("Pythia screen text must have 1-12 nonempty paragraphs of at most 2000 characters")
        return self


class PythiaAuthoringResult(BaseModel):
    """The completed add-scenes AuthoringPlan plus Pythia's draft-only envelope."""
    model_config = ConfigDict(extra="forbid")
    mode: Literal["add-scenes"]
    rationale: str = Field(min_length=1, max_length=2000)
    changes: list = Field(max_length=0)
    scenes: list[PythiaContentScene] = Field(min_length=1, max_length=5)
    producer_id: Literal["live-chimera-authoring-v1"]
    stopping_boundary: Literal["draft-only"]


def adapt_scene(result: dict, scene_index: int = 0) -> tuple[dict, Provenance]:
    """Map ONE verified Pythia-format scene to an existing complete DraftScene.

    Pythia's AuthoringPlan has no source IDs, locator, citation or media fields.
    Never fabricate them; later source-bound work must use a separate contract.
    """
    plan = PythiaAuthoringResult.model_validate(result)
    if not 0 <= scene_index < len(plan.scenes):
        raise ValueError("Requested Pythia scene is not in the result")
    scene = plan.scenes[scene_index]
    if scene.sceneType != "content":
        raise ValueError("Only Pythia content scenes are supported by progressive Milestone 2")
    draft = DraftScene.model_validate({
        "sceneType": "content", "layoutMode": "native",
        "title": scene.title, "extractedText": scene.extractedText,
        "narration": scene.narration,
        "actionDescription": scene.actionDescription, "notes": scene.notes,
    })
    provenance = Provenance(
        producer="pythia-authoring-fixture-v1", sourceIds=[], locators=[], rationale=plan.rationale)
    return draft.model_dump(), provenance


# Deterministic test input derived from Pythia's verified add-scenes result
# in tests/evals/test_chimera_authoring.py. Not a real provider response.
PYTHIA_AUTHORING_FIXTURE = {
    "mode": "add-scenes", "rationale": "Practice observing and responding to equipment defects.",
    "changes": [], "producer_id": "live-chimera-authoring-v1", "stopping_boundary": "draft-only",
    "scenes": [
        {"title": "Inspect before use", "extractedText": ["Examine equipment for visible damage."],
         "narration": "Look for signs of damage before continuing.",
         "actionDescription": "Invite the learner to name a defect.", "notes": "Synthetic fixture: no source citations."},
        {"title": "Respond to a defect", "extractedText": ["Stop use and report damaged equipment."],
         "narration": "Do not proceed with equipment that appears unsafe.",
         "actionDescription": "Discuss appropriate reporting.", "notes": "Synthetic fixture: no source citations."},
    ],
}
