import unittest
import json
from pathlib import Path
import shutil
import subprocess

from pydantic import ValidationError

from backend.app.models import ElementAnimations, SceneContentDraft, SceneElement


class StageAnimationTests(unittest.TestCase):
    @unittest.skipUnless(shutil.which("node"), "Node.js is required for animation runtime tests")
    def test_runtime_effects_timing_cleanup_and_reduced_motion(self):
        harness = Path(__file__).with_name("stage_animation_runtime.cjs")
        result = subprocess.run([shutil.which("node") or "node", str(harness)], check=True, capture_output=True, text=True)
        self.assertEqual(json.loads(result.stdout), {"effects": 12, "cleanup": True, "reducedMotion": True})

    def test_animation_settings_round_trip_with_element(self):
        element = SceneElement(id="paragraph", kind="text", x=10, y=20, width=300, height=100,
                               animations={"entrance": {"effect": "bounce", "delayMs": 150},
                                           "presentation": {"effect": "sway", "iterations": 2},
                                           "exit": {"effect": "fade", "delayMs": 4000}})
        self.assertEqual(SceneElement.model_validate(element.model_dump()), element)
        self.assertEqual(element.animations.entrance.effect, "bounce")

    def test_legacy_elements_remain_static(self):
        self.assertIsNone(SceneElement(id="text", kind="text", x=0, y=0, width=100, height=100).animations)

    def test_ai_scene_draft_retains_real_animation_fields(self):
        draft = SceneContentDraft.model_validate({
            "title": "Welcome", "extractedText": [],
            "visualLayout": {"enabled": True, "backgroundColor": "#224422", "elements": [
                {"id": "title", "kind": "text", "x": 64, "y": 64, "width": 1100, "height": 120,
                 "text": "Welcome", "animations": {"entrance": {"effect": "bounce", "delayMs": 150}}},
            ]},
        })
        self.assertEqual(draft.visualLayout.elements[0].animations.entrance.effect, "bounce")
        self.assertEqual(draft.model_dump()["visualLayout"]["elements"][0]["animations"]["entrance"]["delayMs"], 150)

    def test_invalid_effects_timing_and_unbounded_repetition_are_rejected(self):
        for value in ({"entrance": {"effect": "arbitrary-script"}},
                      {"entrance": {"effect": "fade", "script": "arbitrary-script"}},
                      {"entrance": {"durationMs": 0}},
                      {"exit": {"delayMs": -1}},
                      {"presentation": {"iterations": 999}},
                      {"entrance": {"effect": "bounce", "durationMs": 1000}, "exit": {"effect": "fade", "delayMs": 200}}):
            with self.subTest(value=value), self.assertRaises(ValidationError):
                ElementAnimations.model_validate(value)