from typing import Any, Callable, Literal
from xml.etree import ElementTree

from pptx.opc.constants import RELATIONSHIP_TYPE as RT
from pptx.oxml.ns import qn

from .models import SceneElement, SceneLayout


def extract_slide_layout(presentation: Any, slide: Any, register_image: Callable[[Any], str]) -> SceneLayout:
    scale = 1280 / presentation.slide_width
    layout = SceneLayout(width=1280, height=presentation.slide_height * scale)
    theme: dict[str, str] = {}
    theme_root = None
    for relationship in slide.slide_layout.slide_master.part.rels.values():
        if relationship.reltype == RT.THEME and not relationship.is_external:
            theme_root = ElementTree.fromstring(relationship.target_part.blob)
            for entry in theme_root.findall(".//" + qn("a:clrScheme") + "/*"):
                value = next(iter(entry), None)
                if value is not None:
                    theme[entry.tag.split("}")[-1]] = value.get("val", "202020") if value.tag == qn("a:srgbClr") else value.get("lastClr", "202020")
    theme.update({"bg1": theme.get("lt1", "ffffff"), "tx1": theme.get("dk1", "202020"), "bg2": theme.get("lt2", "ffffff"), "tx2": theme.get("dk2", "202020")})

    def color(node: Any, fallback: str = "202020") -> str:
        if node is None:
            return "#" + fallback
        rgb = node.find(".//" + qn("a:srgbClr"))
        scheme = node.find(".//" + qn("a:schemeClr"))
        value = rgb.get("val", fallback) if rgb is not None else theme.get(scheme.get("val"), fallback) if scheme is not None else fallback
        return "#" + value if len(value) == 6 else "#" + fallback

    def image_reference(node: Any, owner: Any) -> str | None:
        blip = node.find(".//" + qn("a:blip"))
        if blip is None:
            return None
        reference = blip.get(qn("r:embed"))
        if not reference or reference not in owner.part.rels:
            layout.warnings.append("An external or missing image could not be extracted.")
            return None
        relationship = owner.part.rels[reference]
        return None if relationship.is_external else register_image(relationship)

    owners: list[tuple[Any, Literal["master", "layout", "slide"]]] = [(slide.slide_layout.slide_master, "master"), (slide.slide_layout, "layout"), (slide, "slide")]
    for owner, _ in reversed(owners):
        background = owner._element.find(qn("p:cSld") + "/" + qn("p:bg"))
        if background is None:
            continue
        properties = background.find(qn("p:bgPr"))
        if properties is None:
            reference = background.find(qn("p:bgRef"))
            if reference is not None:
                layout.backgroundColor = color(reference, "ffffff")
                fills = theme_root.find(".//" + qn("a:bgFillStyleLst")) if theme_root is not None else None
                fill_index = int(reference.get("idx", "0")) - 1001
                if fills is not None and 0 <= fill_index < len(fills):
                    properties = fills[fill_index]
                    owner = slide.slide_layout.slide_master
        if properties is not None:
            layout.backgroundAsset = image_reference(properties, owner)
            if properties.find(qn("a:solidFill")) is not None or properties.tag == qn("a:solidFill"):
                scheme_color = properties.find(".//" + qn("a:schemeClr"))
                if scheme_color is None or scheme_color.get("val") != "phClr":
                    layout.backgroundColor = color(properties, "ffffff")
            elif properties.find(qn("a:gradFill")) is not None or properties.tag == qn("a:gradFill"):
                layout.warnings.append("Gradient background is approximated; the source preview remains available.")
        break

    def shapes(owner: Any, collection: Any, source: str, prefix: str, offset_x: float = 0, offset_y: float = 0, scale_x: float = 1, scale_y: float = 1) -> None:
        for shape in collection:
            if source != "slide" and shape.is_placeholder:
                continue
            identifier = f"{prefix}-{shape.shape_id}"
            if shape._element.tag == qn("p:grpSp"):
                transform = shape._element.find(qn("p:grpSpPr") + "/" + qn("a:xfrm"))
                if shape.rotation:
                    layout.warnings.append("Group rotation is approximated in the editable layout.")
                child_offset = transform.find(qn("a:chOff"))
                child_extent = transform.find(qn("a:chExt"))
                group_x = scale_x * shape.width / max(1, int(child_extent.get("cx")))
                group_y = scale_y * shape.height / max(1, int(child_extent.get("cy")))
                shapes(owner, shape.shapes, source, identifier, offset_x + shape.left * scale_x - int(child_offset.get("x")) * group_x, offset_y + shape.top * scale_y - int(child_offset.get("y")) * group_y, group_x, group_y)
                continue
            width, height = (shape.width or 0) * scale * scale_x, (shape.height or 0) * scale * scale_y
            if width <= 0 or height <= 0:
                continue
            common: dict[str, Any] = dict(id=identifier, x=(offset_x + (shape.left or 0) * scale_x) * scale, y=(offset_y + (shape.top or 0) * scale_y) * scale, width=width, height=height, rotation=shape.rotation, source=source, locked=source != "slide")
            asset_id = image_reference(shape._element, owner)
            if asset_id:
                crop_node = shape._element.find(".//" + qn("a:srcRect"))
                crop = [max(0.0, min(0.99, int(crop_node.get(key, "0")) / 100000)) for key in ["l", "t", "r", "b"]] if crop_node is not None else [0.0, 0.0, 0.0, 0.0]
                if crop[0] + crop[2] >= 1 or crop[1] + crop[3] >= 1:
                    crop = [0.0, 0.0, 0.0, 0.0]
                layout.elements.append(SceneElement(kind="image", assetId=asset_id, crop=crop, **common))
            elif getattr(shape, "has_text_frame", False) and shape.text.strip():
                paragraph = shape.text_frame.paragraphs[0]
                font = paragraph.runs[0].font if paragraph.runs else paragraph.font
                size = font.size or paragraph.font.size
                properties = paragraph.runs[0]._r.find(qn("a:rPr")) if paragraph.runs else None
                alignment: Literal["left", "center", "right"] = "center" if paragraph.alignment == 2 else "right" if paragraph.alignment == 3 else "left"
                layout.elements.append(SceneElement(kind="text", text=shape.text, fontSize=float(size) * scale if size else 24, fontFamily=font.name or "sans-serif", bold=bool(font.bold), italic=bool(font.italic), align=alignment, color=color(properties), **common))
                if size is None:
                    layout.warnings.append("Inherited text formatting uses editable default styles where no explicit style is available.")
                if len(shape.text_frame.paragraphs) > 1 or len(paragraph.runs) > 1:
                    layout.warnings.append("Mixed text formatting and bullets are simplified to one style per text box.")
                geometry = shape._element.find(".//" + qn("a:prstGeom"))
                if shape._element.tag != qn("p:sp") or geometry is not None and geometry.get("prst") != "rect":
                    layout.warnings.append("Shape styling is not editable; text was extracted without its shape decoration.")
            elif source == "slide" or not shape.is_placeholder:
                layout.warnings.append(f"Unsupported object '{shape.name}' is retained in the source preview only.")

    show_master = slide._element.get("showMasterSp", "1") != "0"
    for owner, source in owners:
        if source == "master" and (not show_master or slide.slide_layout._element.get("showMasterSp", "1") == "0"):
            continue
        if source == "layout" and not show_master:
            continue
        shapes(owner, owner.shapes, source, source)
    layout.warnings = list(dict.fromkeys(layout.warnings))
    return layout