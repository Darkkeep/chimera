"""Portable validation for the versioned Pythia–Chimera handoff."""

import json
from pathlib import Path

from jsonschema import Draft202012Validator

FORMAT = "pythia-chimera-production-handoff"
VERSION = "1.0"
MAX_BYTES = 1_000_000
SCHEMA_PATH = Path(__file__).with_name("production-handoff-v1.schema.json")
VALIDATOR = Draft202012Validator(json.loads(SCHEMA_PATH.read_text(encoding="utf-8")))


def _unique_ids(items, label):
    identifiers = {item["id"] for item in items}
    if len(identifiers) != len(items):
        raise ValueError(f"Duplicate {label} IDs")
    return identifiers


def _check_refs(item, field, allowed):
    if set(item[field]) - allowed:
        raise ValueError(f"Unknown reference in {item['id']}.{field}")


def validate(document):
    error = next(VALIDATOR.iter_errors(document), None)
    if error:
        field = ".".join(map(str, error.absolute_path)) or "document"
        raise ValueError(f"Invalid handoff at {field} ({error.validator})")
    storyboard = document["storyboard"]
    source_ids = _unique_ids(document["provenance"]["sources"], "source")
    objective_ids = _unique_ids(storyboard["objectives"], "objective")
    media_ids = _unique_ids(storyboard["media"], "media")
    scenes = storyboard["scenes"]
    _unique_ids(scenes, "scene")
    _unique_ids([item for scene in scenes for item in scene["interactions"]], "interaction")
    _unique_ids([scene["assessment"] for scene in scenes if scene["assessment"]], "assessment")
    for item in [*storyboard["objectives"], *storyboard["media"], *scenes]:
        _check_refs(item, "source_ids", source_ids)
    for scene in scenes:
        _check_refs(scene, "objective_ids", objective_ids)
        _check_refs(scene, "media_ids", media_ids)
        assessment = scene["assessment"]
        if (scene["kind"] == "question") != (assessment is not None):
            raise ValueError(f"Question scene {scene['id']} must have an assessment, and other scenes cannot")
        if assessment:
            choices = _unique_ids(assessment["choices"], "choice")
            if assessment["correct_choice_id"] not in choices:
                raise ValueError(f"Unknown correct choice in {assessment['id']}")


def _unique_keys(pairs):
    obj = dict(pairs)
    if len(obj) != len(pairs):
        raise ValueError("Duplicate JSON property")
    return obj


def _invalid_constant(_):
    raise ValueError("Invalid JSON number")


def decode(raw):
    if not raw or len(raw) > MAX_BYTES:
        raise ValueError("Handoff JSON must contain between 1 and 1,000,000 bytes")
    try:
        document = json.loads(raw.decode("utf-8-sig"), object_pairs_hook=_unique_keys,
                              parse_constant=_invalid_constant)
        # Reject escaped lone surrogates before storage or response encoding.
        json.dumps(document, ensure_ascii=False).encode("utf-8")
    except (UnicodeError, RecursionError, ValueError) as error:
        raise ValueError("Handoff must be valid UTF-8 JSON with unique properties") from error
    validate(document)
    return document
