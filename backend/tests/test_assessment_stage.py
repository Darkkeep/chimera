import unittest

from pydantic import ValidationError

from backend.app.models import SceneLayout


class AssessmentStageTests(unittest.TestCase):
    def test_region_round_trips_without_question_duplication(self):
        region = {"x": 64, "y": 180, "width": 1100, "height": 480}
        layout = SceneLayout(assessmentRegion=region)
        self.assertEqual(layout.model_dump()["assessmentRegion"], region)
        self.assertNotIn("assessmentItem", layout.model_dump())
        self.assertEqual(SceneLayout.model_validate(layout.model_dump()), layout)

    def test_region_requires_finite_positive_in_bounds_geometry(self):
        for region in ({"x": -1, "y": 0, "width": 100, "height": 100},
                       {"x": 1200, "y": 0, "width": 100, "height": 100},
                       {"x": 0, "y": 700, "width": 100, "height": 100},
                       {"x": 0, "y": 0, "width": 0, "height": 100},
                       {"x": 0, "y": 0, "width": float("inf"), "height": 100}):
            with self.subTest(region=region), self.assertRaises(ValidationError):
                SceneLayout(assessmentRegion=region)

    def test_legacy_layouts_accept_default_region(self):
        self.assertIsNone(SceneLayout.model_validate({"width": 1280, "height": 720}).assessmentRegion)