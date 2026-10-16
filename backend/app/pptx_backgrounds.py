import base64
import textwrap
from pathlib import Path
from xml.etree import ElementTree

from .models import ExtractedAsset, SceneLayout


def render_master_background(layout: SceneLayout, assets: dict[str, ExtractedAsset], output_root: Path) -> bytes:
    namespace = "http://www.w3.org/2000/svg"

    def node(parent: ElementTree.Element, tag: str, **attributes: str) -> ElementTree.Element:
        return ElementTree.SubElement(parent, f"{{{namespace}}}{tag}", attributes)

    def image_uri(asset_id: str) -> str:
        asset = assets[asset_id]
        content = (output_root / asset.path).read_bytes()
        return f"data:{asset.contentType};base64,{base64.b64encode(content).decode('ascii')}"

    root = ElementTree.Element(f"{{{namespace}}}svg", {
        "width": str(layout.width), "height": str(layout.height),
        "viewBox": f"0 0 {layout.width} {layout.height}",
    })
    node(root, "rect", width="100%", height="100%", fill=layout.backgroundColor)
    if layout.backgroundAsset:
        node(root, "image", width="100%", height="100%", href=image_uri(layout.backgroundAsset), preserveAspectRatio="none")
    for element in layout.elements:
        group = node(root, "g", transform=f"translate({element.x} {element.y}) rotate({element.rotation} {element.width / 2} {element.height / 2})")
        viewport = node(group, "svg", width=str(element.width), height=str(element.height), overflow="hidden")
        if element.kind == "shape" and element.shapeSvg:
            shape = ElementTree.fromstring(element.shapeSvg)
            shape.set("width", str(element.width))
            shape.set("height", str(element.height))
            viewport.append(shape)
        elif element.kind == "image" and element.assetId:
            left, top, right, bottom = element.crop
            width = element.width / (1 - left - right)
            height = element.height / (1 - top - bottom)
            node(viewport, "image", x=str(-left * width), y=str(-top * height), width=str(width), height=str(height), href=image_uri(element.assetId), preserveAspectRatio="none")
        elif element.kind == "text":
            text = node(viewport, "text", **{
                "x": str(element.width / 2 if element.align == "center" else element.width if element.align == "right" else 0),
                "y": str(element.fontSize), "fill": element.color, "font-size": str(element.fontSize),
                "font-family": element.fontFamily, "font-weight": "700" if element.bold else "400",
                "font-style": "italic" if element.italic else "normal",
                "text-anchor": "middle" if element.align == "center" else "end" if element.align == "right" else "start",
                "xml:space": "preserve",
            })
            line_width = max(1, int(element.width / (element.fontSize * 0.55)))
            lines = [line for paragraph in element.text.split("\n") for line in textwrap.wrap(paragraph, width=line_width) or [""]]
            for index, line in enumerate(lines):
                span = node(text, "tspan", x=text.get("x", "0"), dy="0" if index == 0 else str(element.fontSize * 1.2))
                span.text = line
    return ElementTree.tostring(root, encoding="utf-8", xml_declaration=True)