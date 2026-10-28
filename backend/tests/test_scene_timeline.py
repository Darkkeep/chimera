import unittest
import io
import tempfile
from pathlib import Path
from unittest.mock import patch
from PIL import Image
from pydantic import ValidationError
from backend.app.models import SceneLayout, SceneElement, SceneTimeline, TimelineClip, ElementAppearance, Scene
from backend.app.storage import validate_visual_assets
from backend.app import storage
from backend.app.models import ProjectCreate, SceneCreate, SceneUpdate


class SceneTimelineTests(unittest.TestCase):
    def test_legacy_defaults_do_not_schedule_media_or_change_appearance(self):
        layout = SceneLayout(elements=[SceneElement(id="old", kind="text", x=0, y=0, width=100, height=100)])
        self.assertIsNone(layout.timeline)
        self.assertIsNone(layout.elements[0].appearance)
        self.assertIsNone(layout.elements[0].timing)

    def test_native_shape_effects_and_long_timing_round_trip(self):
        layout = SceneLayout(timeline={"durationMs": 120000}, elements=[dict(id="shape", kind="shape", x=0, y=0, width=300, height=200,
            nativeShape="ellipse", appearance={"opacity": .4, "bevel": {"enabled": True}}, timing={"startMs": 65000, "endMs": 100000},
            animations={"entrance": {"effect": "fade", "delayMs": 65000, "durationMs": 10000}})])
        self.assertEqual(SceneLayout.model_validate(layout.model_dump()), layout)

    def test_invalid_appearance_and_geometry_are_rejected(self):
        for patch in ({"opacity": float('nan')}, {"fill": 'red;script'}, {"strokeWidth": -1}, {"shadow": {"size": 100000}}):
            with self.subTest(patch=patch), self.assertRaises(ValidationError):
                ElementAppearance.model_validate(patch)

    def test_clip_bounds_unique_ids_and_fades_are_validated(self):
        clip = dict(id="clip", assetId="audio", kind="audio", startMs=12000, sourceInMs=3000, sourceOutMs=7000)
        self.assertEqual(SceneTimeline(durationMs=16000, clips=[clip]).clips[0].sourceInMs, 3000)
        for value in (dict(durationMs=15000, clips=[clip]), dict(clips=[clip, clip]), dict(clips=[{**clip, "sourceOutMs": 2000}]), dict(clips=[{**clip,"fadeInMs":5000}]), dict(printTimeMs=40000)):
            with self.subTest(value=value), self.assertRaises(ValidationError):
                SceneTimeline.model_validate(value)

    def test_missing_timeline_media_is_not_accepted_as_a_visual_asset(self):
        scene = Scene(id="scene", title="Timed", visualLayout={"timeline": {"clips": [dict(id="clip", assetId="missing", kind="video", sourceOutMs=1000)]}})
        with self.assertRaisesRegex(ValueError, "Timeline clips"):
            validate_visual_assets(scene, {})

    def test_object_visibility_must_fit_duration(self):
        with self.assertRaises(ValidationError):
            SceneLayout(timeline={"durationMs": 1000}, elements=[dict(id="text",kind="text",x=0,y=0,width=10,height=10,timing={"startMs":0,"endMs":2000})])

    def test_document_snapshot_uses_authored_time_instead_of_finishing_animations(self):
        from backend.app.scene_print import render_scene_images
        with tempfile.TemporaryDirectory() as folder, patch.object(storage, "ROOT", Path(folder)), patch.object(storage, "PROJECTS", Path(folder) / "projects"):
            p = storage.create_project(ProjectCreate(title="Timeline document"))
            p = storage.create_scene(p.id, SceneCreate(title="Timed print", extractedText=["Snapshot"]))
            sid = p.storyboard.scenes[0].id
            p = storage.update_scene(p.id, sid, SceneUpdate(visualLayout={"enabled":True, "elements":[
                dict(id="shape",kind="shape",nativeShape="rectangle",x=100,y=100,width=200,height=100,
                     appearance={"fill":"#ff0000"}, timing={"startMs":1000,"endMs":3000},
                     animations={"entrance":{"effect":"fade","durationMs":500,"delayMs":1000}})
            ], "timeline":{"durationMs":4000,"printTimeMs":2000}}))
            images = render_scene_images(p)
            image = Image.open(io.BytesIO(images[sid])).convert("RGB")
            scale = image.width / 1280
            r,g,b = image.getpixel((int(150*scale),int(150*scale)))
            self.assertGreater(r,240)
            self.assertLess(g,20)
            self.assertLess(b,20)
