from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class HTML5Activity(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    assetId: str = Field(pattern=r"^html5-[a-f0-9]{64}$")
    title: str = Field(min_length=1, max_length=120)
    alternative: str = Field(min_length=1, max_length=10000)
    tracking: Literal["view", "completion", "scored"]
    scoreWeight: float = Field(default=1, gt=0, le=100, allow_inf_nan=False)
