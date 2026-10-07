import unittest
import io
import tempfile
from copy import deepcopy
from pathlib import Path

from pydantic import ValidationError
from PIL import Image
from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.util import Inches
from pptx.opc.constants import RELATIONSHIP_TYPE as RT
from pptx.oxml.ns import qn
from pptx.oxml.xmlchemy import OxmlElement

from backend.app.models import Scene, SceneElement, SceneLayout
from backend.app.ingest import extract_presentation
from backend.app import main, storage
from backend.app.models import ProjectCreate, SceneUpdate
from unittest.mock import patch
from backend.app.scorm import PLAYER_JS, _scorm_12_player


class VisualLayoutTests(unittest.TestCase):
    def test_inherited_picture_background_and_slide_override(self):
        deck = Presentation()
        slide = deck.slides.add_slide(deck.slide_layouts[6])
        image = io.BytesIO()
        Image.new("RGB", (20, 20), "blue").save(image, format="PNG")
        picture = slide.shapes.add_picture(io.BytesIO(image.getvalue()), 0, 0, Inches(1))
        image_part = slide.part.rels[picture._element.find(".//" + qn("a:blip")).get(qn("r:embed"))].target_part
        picture._element.getparent().remove(picture._element)
        master = slide.slide_layout.slide_master
        background = OxmlElement("p:bg")
        properties = OxmlElement("p:bgPr")
        fill = OxmlElement("a:blipFill")
        blip = OxmlElement("a:blip")
        blip.set(qn("r:embed"), master.part.relate_to(image_part, RT.IMAGE))
        fill.append(blip)
        properties.append(fill)
        background.append(properties)
        master._element.find(qn("p:cSld")).insert(0, background)
        override = deck.slides.add_slide(deck.slide_layouts[6])
        override.background.fill.solid()
        override.background.fill.fore_color.rgb = RGBColor(1, 2, 3)
        with tempfile.TemporaryDirectory() as folder:
            source = Path(folder) / "deck.pptx"
            deck.save(source)
            scenes, assets = extract_presentation(source, Path(folder))
        self.assertIsNotNone(scenes[0].backgroundAsset)
        self.assertEqual(scenes[0].backgroundAsset, assets[0].id)
        self.assertIsNone(scenes[1].backgroundAsset)
        self.assertEqual(scenes[1].visualLayout.backgroundColor, "#010203")

    def test_import_preserves_geometry_and_master_images(self):
        deck = Presentation()
        slide = deck.slides.add_slide(deck.slide_layouts[6])
        slide.slide_layout.slide_master.background.fill.solid()
        slide.slide_layout.slide_master.background.fill.fore_color.rgb = RGBColor(12, 34, 56)
        image = io.BytesIO()
        Image.new("RGB", (30, 20), "red").save(image, format="PNG")
        master_picture = slide.shapes.add_picture(io.BytesIO(image.getvalue()), Inches(0), Inches(0), Inches(1))
        picture_xml = deepcopy(master_picture._element)
        blip = picture_xml.find(".//" + qn("a:blip"))
        image_part = slide.part.rels[blip.get(qn("r:embed"))].target_part
        blip.set(qn("r:embed"), slide.slide_layout.slide_master.part.relate_to(image_part, RT.IMAGE))
        slide.slide_layout.slide_master.shapes._spTree.append(picture_xml)
        master_picture._element.getparent().remove(master_picture._element)
        slide.shapes.add_picture(io.BytesIO(image.getvalue()), Inches(1), Inches(2), Inches(2))
        slide.shapes.add_picture(io.BytesIO(image.getvalue()), Inches(4), Inches(2), Inches(2))
        textbox = slide.shapes.add_textbox(Inches(1), Inches(1), Inches(3), Inches(1))
        textbox.text = "Editable text"
        with tempfile.TemporaryDirectory() as folder:
            source = Path(folder) / "deck.pptx"
            deck.save(source)
            scenes, assets = extract_presentation(source, Path(folder))
        layout = scenes[0].visualLayout
        self.assertEqual(layout.backgroundColor, "#0C2238")
        self.assertEqual(len(assets), 1)
        self.assertEqual(len([element for element in layout.elements if element.kind == "image"]), 3)
        self.assertTrue(layout.elements[0].locked)
        text = next(element for element in layout.elements if element.kind == "text")
        self.assertAlmostEqual(text.x, 128)
        self.assertEqual(text.text, "Editable text")
        self.assertFalse(layout.enabled)

    def test_legacy_scene_remains_unchanged(self):
        scene = Scene(id="old", title="Old scene", previewImage="renders/slide.png")
        self.assertIsNone(scene.visualLayout)
        self.assertEqual(scene.previewImage, "renders/slide.png")

    def test_legacy_extraction_preserves_edits_and_is_idempotent(self):
        with tempfile.TemporaryDirectory() as folder, patch.object(storage, "ROOT", Path(folder)), patch.object(storage, "PROJECTS", Path(folder) / "projects"):
            project = storage.create_project(ProjectCreate(title="Migration"))
            deck = Presentation()
            slide = deck.slides.add_slide(deck.slide_layouts[6])
            slide.shapes.add_textbox(Inches(1), Inches(1), Inches(4), Inches(1)).text = "Original"
            source = storage.project_path(project.id) / "original" / "source-deck.pptx"
            deck.save(source)
            storage.update_from_import(project.id, [Scene(id="retained", sourceSlide=1, title="Edited title", extractedText=["Edited body"], notes="Keep notes")], [])
            current = storage.read_project(project.id)
            updated = main.extract_scene_layout(project.id, "retained", str(current.storyboard.revision))
            scene = updated.storyboard.scenes[0]
            self.assertEqual(scene.id, "retained")
            self.assertEqual(scene.notes, "Keep notes")
            self.assertEqual(scene.extractedText, ["Edited body"])
            self.assertIn("Edited body", scene.visualLayout.elements[0].text)
            self.assertFalse(scene.visualLayout.enabled)
            again = main.extract_scene_layout(project.id, "retained", str(updated.storyboard.revision))
            self.assertEqual(again.storyboard.revision, updated.storyboard.revision)
            invalid = SceneLayout(elements=[SceneElement(id="bad", kind="image", assetId="missing", x=0, y=0, width=20, height=20)])
            with self.assertRaises(ValueError):
                storage.update_scene(project.id, "retained", SceneUpdate(visualLayout=invalid))

    def test_repeated_assets_have_independent_elements(self):
        elements = [SceneElement(id=identifier, kind="image", assetId="same-image", x=10, y=20, width=100, height=80) for identifier in ["first", "second"]]
        layout = SceneLayout(elements=elements)
        self.assertEqual(len(SceneLayout.model_validate_json(layout.model_dump_json()).elements), 2)
        with self.assertRaises(ValidationError):
            SceneLayout(elements=[elements[0], elements[0]])

    def test_both_export_runtimes_render_visual_layout(self):
        for runtime in [PLAYER_JS, _scorm_12_player()]:
            self.assertIn("if (visual) renderVisualScene(scene, body)", runtime)
            self.assertIn("if (!visual && scene.previewImage)", runtime)
            self.assertIn("node.textContent = element.text", runtime)
            self.assertIn("element.crop", runtime)
            self.assertIn('document.querySelector("#contents")', runtime)

    def test_modal_text_changes_update_enabled_layout(self):
        with tempfile.TemporaryDirectory() as folder, patch.object(storage, "ROOT", Path(folder)), patch.object(storage, "PROJECTS", Path(folder) / "projects"):
            project = storage.create_project(ProjectCreate(title="Text update"))
            layout = SceneLayout(enabled=True, elements=[SceneElement(id="text", kind="text", text="Before", x=80, y=90, width=300, height=200)])
            storage.update_from_import(project.id, [Scene(id="visual", title="Title", visualLayout=layout)], [])
            updated = storage.update_scene(project.id, "visual", SceneUpdate(extractedText=["After"]))
            self.assertEqual(updated.storyboard.scenes[0].visualLayout.elements[0].text, "After")
            self.assertEqual(updated.storyboard.scenes[0].visualLayout.elements[0].x, 80)

    def test_modal_edits_are_preserved_before_visual_activation(self):
        with tempfile.TemporaryDirectory() as folder, patch.object(storage, "ROOT", Path(folder)), patch.object(storage, "PROJECTS", Path(folder) / "projects"):
            project = storage.create_project(ProjectCreate(title="Inactive text"))
            layout = SceneLayout(elements=[SceneElement(id="title", source="slide", kind="text", text="Before title", x=10, y=10, width=100, height=50), SceneElement(id="body", source="slide", kind="text", text="Before body", x=10, y=80, width=100, height=50)])
            storage.update_from_import(project.id, [Scene(id="inactive", title="Before title", extractedText=["Before body"], visualLayout=layout)], [])
            updated = storage.update_scene(project.id, "inactive", SceneUpdate(title="After title", extractedText=["After body"]))
            self.assertEqual([element.text for element in updated.storyboard.scenes[0].visualLayout.elements], ["After title", "After body"])
            self.assertFalse(updated.storyboard.scenes[0].visualLayout.enabled)

    def test_detached_image_is_removed_from_visual_elements(self):
        from backend.app.models import ExtractedAsset

        with tempfile.TemporaryDirectory() as folder, patch.object(storage, "ROOT", Path(folder)), patch.object(storage, "PROJECTS", Path(folder) / "projects"):
            project = storage.create_project(ProjectCreate(title="Detach image"))
            asset = ExtractedAsset(id="image", kind="image", filename="image.png", contentType="image/png", sizeBytes=0, sha256="test", path="assets/images/image.png")
            layout = SceneLayout(enabled=True, elements=[SceneElement(id="placed", kind="image", assetId="image", x=10, y=10, width=100, height=100)])
            storage.update_from_import(project.id, [Scene(id="visual", title="Scene", imageAssets=["image"], visualLayout=layout)], [asset])
            updated = storage.update_scene(project.id, "visual", SceneUpdate(imageAssets=[]))
            self.assertEqual(updated.storyboard.scenes[0].visualLayout.elements, [])
            self.assertEqual(len(updated.storyboard.assets), 1)

    def test_invalid_geometry_and_asset_are_rejected(self):
        for changes in [{"width": 0}, {"x": float("nan")}, {"kind": "image"}, {"crop": [0.6, 0, 0.6, 0]}]:
            with self.assertRaises(ValidationError):
                SceneElement.model_validate({"id": "text", "kind": "text", "x": 0, "y": 0, "width": 100, "height": 100, **changes})