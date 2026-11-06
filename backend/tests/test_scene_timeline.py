import unittest
import io
import tempfile
import json
import shutil
import subprocess
from zipfile import ZipFile
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

    def test_video_pauses_are_bounded_formative_and_legacy_compatible(self):
        clip = dict(id="video", assetId="asset", kind="video", startMs=1000, sourceInMs=500, sourceOutMs=3500)
        point = dict(id="pause", timeMs=2000, prompt="Decide", choices=[
            dict(id="a", label="First", feedback="Consider the first consequence"),
            dict(id="b", label="Second", feedback="Consider the alternative"),
        ])
        timeline = SceneTimeline(clips=[clip], pauses=[point])
        self.assertEqual(SceneTimeline.model_validate(timeline.model_dump()), timeline)
        self.assertEqual(SceneTimeline(clips=[clip]).pauses, [])
        self.assertEqual(SceneTimeline(clips=[clip], pauses=[{**point, "timeMs": 1000}]).pauses[0].timeMs, 1000)
        invalid = [
            dict(clips=[], pauses=[point]),
            dict(clips=[{**clip, "kind": "audio"}], pauses=[point]),
            dict(clips=[clip], pauses=[point, point]),
            dict(clips=[clip], pauses=[point, {**point, "id": "other"}]),
            dict(clips=[clip], pauses=[{**point, "choices": [point["choices"][0]]}]),
            dict(clips=[clip], pauses=[{**point, "choices": [point["choices"][0]] * 2}]),
            dict(clips=[clip], pauses=[{**point, "choices": point["choices"] * 3}]),
            dict(clips=[clip], pauses=[{**point, "required": True}]),
            dict(clips=[clip], pauses=[{**point, "prompt": " "}]),
            dict(clips=[clip], pauses=[{**point, "choices": [{**point["choices"][0], "score": 1}, point["choices"][1]]}]),
            dict(clips=[clip], pauses=[{**point, "prompt": "x" * 1001}]),
        ]
        invalid.extend(dict(clips=[clip], pauses=[{**point, "timeMs": time}]) for time in (999, 4000, -1))
        invalid.append(dict(clips=[clip], pauses=[{**point, "id": str(i), "timeMs": 1000 + i} for i in range(9)]))
        for value in invalid:
            with self.subTest(value=value), self.assertRaises(ValidationError):
                SceneTimeline.model_validate(value)
        eight = SceneTimeline(clips=[clip], pauses=[{**point, "id": str(i), "timeMs": 1000 + i} for i in range(8)])
        self.assertEqual(len(eight.pauses), 8)

    def test_video_pause_word_alternative_includes_every_response_without_grading(self):
        from backend.app.word_export import _timeline_description
        scene = Scene(id="scene", title="Video", visualLayout={"timeline": {
            "clips": [dict(id="v", assetId="asset", kind="video", sourceOutMs=3000)],
            "pauses": [dict(id="p", timeMs=1000, prompt="What next?", choices=[
                dict(id="a", label="Inspect", feedback="Observe first."),
                dict(id="b", label="Proceed", feedback="Consider the risk."),
            ])],
        }})
        description = _timeline_description(scene)
        self.assertIn("Optional video reflection at 1 s (formative; skippable): What next?", description)
        self.assertIn("Inspect: Observe first.", description)
        self.assertIn("Proceed: Consider the risk.", description)

    @unittest.skipUnless(shutil.which("node"), "Node.js required")
    def test_restored_pause_clock_accepts_only_minimal_current_timeline_state(self):
        source = (Path(__file__).parents[1] / "app" / "static" / "timeline-policy.js").read_text()
        script = """
const assert = require('node:assert/strict');
let input = '';
process.stdin.on('data', chunk => input += chunk);
process.stdin.on('end', () => {
  const normalize = new Function(JSON.parse(input).replaceAll('export function ', 'function ') + ';return normalizeTimelineClock')();
  const timeline = {durationMs: 3000};
  const state = {position: 0.5, duration: 3, watchedRanges: []};
  assert.deepEqual(normalize(timeline, state), state);
  for (const position of [0, 3]) assert.equal(normalize(timeline, {...state, position}).position, position);
  for (const position of [-1, 3.001, NaN, Infinity, '0.5', null])
    assert.equal(normalize(timeline, {...state, position}), null);
  for (const duration of [0, 2, 4, Infinity, '3'])
    assert.equal(normalize(timeline, {...state, duration}), null);
  for (const watchedRanges of [null, {}, [[0, 1]]])
    assert.equal(normalize(timeline, {...state, watchedRanges}), null);
  assert.deepEqual(normalize(timeline, {...state, answer: 'ignored'}), state);
});
"""
        subprocess.run([shutil.which("node"), "-e", script], input=json.dumps(source), text=True, capture_output=True, check=True)

    def test_pause_backups_media_retention_exports_word_and_resume_budget(self):
        from backend.app.backup import build_project_archive, restore_project_archive
        from backend.app.media import asset_usage, delete_asset, update_metadata
        from backend.app.models import AssetAttributionUpdate, AssetMetadataUpdate
        from backend.app.scorm import build_scorm_12, build_scorm_2004, _resume_budget_report
        from backend.app.standalone import build_standalone_course
        from backend.app.word_export import build_storyboard_docx, build_sme_storyboard_docx
        with tempfile.TemporaryDirectory() as folder, patch.multiple(storage, ROOT=Path(folder), PROJECTS=Path(folder) / "projects"):
            project = storage.create_project(ProjectCreate(title="Pause lifecycle"))
            project = storage.create_scene(project.id, SceneCreate(title="Reflect"))
            project = storage.add_project_asset(project.id, "video.mp4",
                (Path(__file__).parents[2] / "tests" / "fixtures" / "timeline-qualification.mp4").read_bytes(),
                "video", project.storyboard.revision)
            asset = project.storyboard.assets[0]
            project = update_metadata(project.id, asset.id, AssetMetadataUpdate(
                transcript="Synthetic silent test pattern.",
                captionsVtt="WEBVTT\n\n00:00:00.000 --> 00:00:03.000\nTest pattern."),
                project.storyboard.revision)
            project = storage.update_project_asset_attribution(project.id, asset.id, AssetAttributionUpdate(
                attributionText="Synthetic test fixture.", attributionStatus="complete"),
                project.storyboard.revision)
            scene_id = project.storyboard.scenes[0].id
            project = storage.update_scene(project.id, scene_id, SceneUpdate(visualLayout={
                "enabled": True, "timeline": {"durationMs": 3000, "clips": [
                    dict(id="v", assetId=asset.id, kind="video", sourceOutMs=3000)],
                    "pauses": [dict(id="p", timeMs=500, prompt="Inspect or proceed?", choices=[
                        dict(id="a", label="Inspect", feedback="Observe first."),
                        dict(id="b", label="Proceed", feedback="Consider the risk."),
                    ])]},
            }), project.storyboard.revision)
            scene = project.storyboard.scenes[0]
            self.assertEqual(asset_usage(project, asset.id)["scenes"][0]["id"], scene_id)
            with self.assertRaisesRegex(ValueError, "Remove this media"):
                delete_asset(project.id, asset.id, project.storyboard.revision)
            for builder in (build_scorm_12, build_scorm_2004, build_standalone_course):
                content, _ = builder(project)
                with ZipFile(io.BytesIO(content)) as archive:
                    self.assertIn(asset.path, archive.namelist())
                    published = json.loads(archive.read("storyboard.json"))
                    self.assertEqual(published["scenes"][0]["visualLayout"]["timeline"]["pauses"],
                        [pause.model_dump() for pause in scene.visualLayout.timeline.pauses])
                    self.assertIn("Video reflections: text alternative and replay", archive.read("player.js").decode())
            budget = _resume_budget_report(project, "SCORM 1.2")
            for builder in (build_storyboard_docx, build_sme_storyboard_docx):
                with self.subTest(builder=builder.__name__), ZipFile(io.BytesIO(builder(project))) as archive:
                    xml = archive.read("word/document.xml").decode()
                    self.assertIn("Inspect or proceed?", xml)
                    self.assertIn("Inspect: Observe first.", xml)
                    self.assertIn("Proceed: Consider the risk.", xml)
            archive = build_project_archive(project.id)
            project = storage.update_scene(project.id, scene_id, SceneUpdate(visualLayout=None), project.storyboard.revision)
            delete_asset(project.id, asset.id, project.storyboard.revision)
            restore_project_archive(project.id, archive)
            restored = storage.read_project(project.id)
            self.assertEqual(restored.storyboard.scenes[0].visualLayout, scene.visualLayout)
            self.assertTrue((Path(folder) / "projects" / project.id / asset.path).is_file())
            restored.storyboard.scenes[0].visualLayout.timeline.pauses = []
            self.assertEqual(budget, _resume_budget_report(restored, "SCORM 1.2"))

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
