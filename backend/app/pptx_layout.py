import math
from typing import Any, Callable, Literal
from xml.etree import ElementTree

from pptx.opc.constants import RELATIONSHIP_TYPE as RT
from pptx.oxml.ns import qn

from .models import SceneElement, SceneLayout


def extract_slide_layout(presentation: Any, slide: Any, register_image: Callable[[Any], str]) -> SceneLayout:
    show_master = slide._element.get("showMasterSp", "1") != "0"
    owners: list[tuple[Any, Literal["master", "layout", "slide"]]] = []
    if show_master and slide.slide_layout._element.get("showMasterSp", "1") != "0":
        owners.append((slide.slide_layout.slide_master, "master"))
    if show_master:
        owners.append((slide.slide_layout, "layout"))
    owners.append((slide, "slide"))
    background_owners = [slide.slide_layout.slide_master, slide.slide_layout, slide]
    return _extract_layout(presentation, slide.slide_layout.slide_master, owners, background_owners, register_image)


def extract_master_layout(presentation: Any, master: Any, register_image: Callable[[Any], str]) -> SceneLayout:
    return _extract_layout(presentation, master, [(master, "master")], [master], register_image)


def _extract_layout(presentation: Any, master: Any, owners: list[tuple[Any, Literal["master", "layout", "slide"]]], background_owners: list[Any], register_image: Callable[[Any], str]) -> SceneLayout:
    scale = 1280 / presentation.slide_width
    layout = SceneLayout(width=1280, height=presentation.slide_height * scale)
    theme: dict[str, str] = {}
    theme_root = None
    for relationship in master.part.rels.values():
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

    def shape_style(node: Any, width: int, height: int, force_line: bool = False) -> tuple[str, bool, bool]:
        properties = node.find(qn("p:spPr"))
        geometry = properties.find(qn("a:prstGeom")) if properties is not None else None
        custom = properties.find(qn("a:custGeom")) if properties is not None else None
        line = properties.find(qn("a:ln")) if properties is not None else None
        fill_node = properties.find(qn("a:solidFill")) if properties is not None else None
        has_geometry = geometry is not None or custom is not None
        has_fill = has_geometry and properties.find(qn("a:noFill")) is None if properties is not None else False
        no_fill = not has_fill
        fill_color = color(fill_node) if fill_node is not None else "#5B9BD5" if has_fill else "none"
        stroke_node = line.find(qn("a:solidFill")) if line is not None else None
        stroke_color = color(stroke_node, "404040") if stroke_node is not None else "#404040" if line is not None or force_line else "none"
        line_width = (int(line.get("w", "12700")) / max(1, max(width, height))) * 1000 if line is not None else 0
        has_stroke = line is not None and line.find(qn("a:noFill")) is None
        if no_fill:
            fill_color = "none"
        fill = "none" if force_line else fill_color
        stroke = stroke_color if has_stroke or force_line else "none"
        style = f'fill="{fill}" stroke="{stroke}" stroke-width="{max(1, line_width):.2f}" stroke-linecap="round" stroke-linejoin="round"'

        if custom is not None:
            paths: list[str] = []
            for path_node in custom.findall(".//" + qn("a:path")):
                path_width = max(1, int(path_node.get("w", "1000")))
                path_height = max(1, int(path_node.get("h", "1000")))
                commands: list[str] = []
                for command in path_node:
                    tag = command.tag.split("}")[-1]
                    points = command.findall(qn("a:pt"))
                    if tag == "moveTo" and points:
                        commands.append(f'M {int(points[0].get("x", "0"))*1000/path_width:.3f} {int(points[0].get("y", "0"))*1000/path_height:.3f}')
                    elif tag == "lnTo" and points:
                        commands.append(f'L {int(points[0].get("x", "0"))*1000/path_width:.3f} {int(points[0].get("y", "0"))*1000/path_height:.3f}')
                    elif tag == "cubicBezTo" and len(points) == 3:
                        values = [f'{int(point.get("x", "0"))*1000/path_width:.3f} {int(point.get("y", "0"))*1000/path_height:.3f}' for point in points]
                        commands.append("C " + " ".join(values))
                    elif tag == "quadBezTo" and len(points) == 2:
                        values = [f'{int(point.get("x", "0"))*1000/path_width:.3f} {int(point.get("y", "0"))*1000/path_height:.3f}' for point in points]
                        commands.append("Q " + " ".join(values))
                    elif tag == "close":
                        commands.append("Z")
                if commands:
                    paths.append("<path d=\"" + " ".join(commands) + "\" " + style + "/>")
            if paths:
                return "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 1000 1000\" preserveAspectRatio=\"none\">" + "".join(paths) + "</svg>", True, False

        preset = geometry.get("prst", "rect") if geometry is not None else "line"
        polygon_presets = {
            "parallelogram": "200,0 1000,0 800,1000 0,1000",
            "trapezoid": "250,0 750,0 1000,1000 0,1000",
            "diamond": "500,0 1000,500 500,1000 0,500",
            "triangle": "500,0 1000,1000 0,1000",
            "rtTriangle": "0,0 0,1000 1000,1000",
            "hexagon": "250,0 750,0 1000,500 750,1000 250,1000 0,500",
            "pentagon": "500,0 1000,380 810,1000 190,1000 0,380",
            "chevron": "0,0 650,0 1000,500 650,1000 0,1000 350,500",
            "leftRightArrow": "0,500 250,0 250,300 750,300 750,0 1000,500 750,1000 750,700 250,700 250,1000",
            "octagon": "300,0 700,0 1000,300 1000,700 700,1000 300,1000 0,700 0,300",
            "heptagon": "500,0 900,180 1000,570 750,930 350,1000 50,700 100,300",
            "decagon": "350,0 650,0 900,150 1000,400 900,650 900,850 650,1000 350,1000 100,850 0,600 100,350 100,150",
            "flowChartDecision": "500,0 1000,500 500,1000 0,500",
            "flowChartData": "200,0 1000,0 800,1000 0,1000",
            "flowChartPreparation": "250,0 750,0 1000,500 750,1000 250,1000 0,500",
            "flowChartManualInput": "0,250 1000,0 1000,1000 0,1000",
            "notchedRightArrow": "0,250 650,250 650,0 1000,500 650,1000 650,750 0,750",
        }
        if preset in {"line", "lineInv"} or force_line:
            x1, y1, x2, y2 = (0, 0, 1000, 1000) if preset == "line" else (0, 1000, 1000, 0)
            transform = properties.find(qn("a:xfrm")) if properties is not None else None
            if transform is not None and transform.get("flipH") == "1":
                x1, x2 = x2, x1
            if transform is not None and transform.get("flipV") == "1":
                y1, y2 = y2, y1
            path_svg = f'<path d="M{x1},{y1} L{x2},{y2}" {style}/>'
        elif preset in {"rect", "roundRect", "ellipse"}:
            tag = "ellipse" if preset == "ellipse" else "rect"
            attrs = 'x="0" y="0" width="1000" height="1000"'
            if preset == "roundRect":
                attrs += ' rx="100" ry="100"'
            path_svg = f"<{tag} {attrs} {style}/>"
        elif preset in polygon_presets:
            path_svg = f'<polygon points="{polygon_presets[preset]}" {style}/>'
        elif preset.startswith("star"):
            digits = "".join(character for character in preset if character.isdigit())
            points_count = int(digits) if digits else 5
            points: list[str] = []
            for point_index in range(points_count * 2):
                radius = 480 if point_index % 2 == 0 else 220
                angle = -math.pi / 2 + point_index * math.pi / points_count
                points.append(f"{500 + radius * math.cos(angle):.2f},{500 + radius * math.sin(angle):.2f}")
            path_svg = f'<polygon points="{" ".join(points)}" {style}/>'
        else:
            lowered = preset.lower()
            if "arrow" in lowered:
                if "left" in lowered:
                    points = "1000,250 350,250 350,0 0,500 350,1000 350,750 1000,750"
                elif "up" in lowered:
                    points = "250,1000 250,350 0,350 500,0 1000,350 750,350 750,1000"
                elif "down" in lowered:
                    points = "250,0 750,0 750,650 1000,650 500,1000 0,650 250,650"
                else:
                    points = "0,250 650,250 650,0 1000,500 650,1000 650,750 0,750"
                path_svg = f'<polygon points="{points}" {style}/>'
            elif "flowChartConnector" in preset:
                path_svg = f'<ellipse cx="500" cy="500" rx="500" ry="500" {style}/>'
            elif "flowChartTerminator" in preset or "roundRect" in preset or "roundedRect" in preset:
                path_svg = f'<rect x="0" y="0" width="1000" height="1000" rx="240" ry="240" {style}/>'
            elif "flowChart" in preset or "callout" in lowered or "ribbon" in lowered:
                path_svg = f'<rect x="0" y="0" width="1000" height="850" {style}/>'
            else:
                path_svg = f'<rect x="0" y="0" width="1000" height="1000" {style}/>'
            svg = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000" preserveAspectRatio="none">{path_svg}</svg>'
            return svg, not no_fill or has_stroke or force_line, True
        return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000" preserveAspectRatio="none">{path_svg}</svg>', not no_fill or has_stroke or force_line, False

    for owner in reversed(background_owners):
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
                    owner = master
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
            is_line = shape.shape_type == 9
            raw_width, raw_height = shape.width or 0, shape.height or 0
            if raw_width <= 0 and not is_line or raw_height <= 0 and not is_line:
                continue
            width = max(1, raw_width) * scale * scale_x
            height = max(1, raw_height) * scale * scale_y
            common: dict[str, Any] = dict(id=identifier, x=(offset_x + (shape.left or 0) * scale_x) * scale, y=(offset_y + (shape.top or 0) * scale_y) * scale, width=width, height=height, rotation=shape.rotation, source=source, locked=source != "slide")
            asset_id = image_reference(shape._element, owner)
            if asset_id:
                crop_node = shape._element.find(".//" + qn("a:srcRect"))
                crop = [max(0.0, min(0.99, int(crop_node.get(key, "0")) / 100000)) for key in ["l", "t", "r", "b"]] if crop_node is not None else [0.0, 0.0, 0.0, 0.0]
                if crop[0] + crop[2] >= 1 or crop[1] + crop[3] >= 1:
                    crop = [0.0, 0.0, 0.0, 0.0]
                layout.elements.append(SceneElement(kind="image", assetId=asset_id, crop=crop, **common))
            else:
                shape_svg, has_shape_visual, approximate_shape = shape_style(shape._element, max(1, raw_width), max(1, raw_height), force_line=is_line)
                if has_shape_visual:
                    layout.elements.append(SceneElement(kind="shape", shapeSvg=shape_svg, shapeName=shape.name, **common))
                    if approximate_shape:
                        layout.warnings.append(f"PowerPoint shape '{shape.name}' is extracted as an editable approximation; compare with the source preview for exact geometry.")
                if getattr(shape, "has_text_frame", False) and shape.text.strip():
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
                elif not has_shape_visual and source == "slide" and not is_line:
                    layout.warnings.append(f"Unsupported object '{shape.name}' is retained in the source preview only.")

    for owner, source in owners:
        shapes(owner, owner.shapes, source, source)
    layout.warnings = list(dict.fromkeys(layout.warnings))
    return layout