"""Rebuild the existing metallic artwork with its editable leonine overlay."""

import argparse
import base64
import hashlib
import io
import json
from pathlib import Path
import shutil
import subprocess
import tempfile
import xml.etree.ElementTree as ET

from PIL import IcoImagePlugin, Image, ImageChops, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "frontend" / "public" / "brand"
KIT = ROOT / "docs" / "brand" / "Chimera_Production_Kit_v1"
MARKS = KIT / "assets" / "marks"
SOURCE = KIT / "assets" / "source" / "chimera-primary-creature-original.png"
SIZES = (16, 32, 48, 64, 128, 180, 192, 256, 512, 1024)
SVG = "{http://www.w3.org/2000/svg}"


def remove_background(image: Image.Image) -> Image.Image:
    red, green, blue, _ = image.split()
    brightness = ImageChops.lighter(ImageChops.lighter(red, green), blue)
    alpha = brightness.point(lambda value: min(255, max(0, (value - 30) * 12)))
    # Preserve enclosed dark facial details while removing the exterior background.
    exterior = alpha.point(lambda value: 255 if value else 0)
    ImageDraw.floodfill(exterior, (0, 0), 128)
    interior = exterior.point(lambda value: 0 if value == 128 else 255)
    result = image.copy()
    result.putalpha(ImageChops.lighter(alpha, interior))
    return result


def verify() -> None:
    master = ET.parse(PUBLIC / "chimera-mark.svg").getroot()
    children = list(master)
    wing = next(child for child in children if child.get("id") == "wings")
    original = next(child for child in children if child.get("id") == "original-creature")
    if children.index(wing) >= children.index(original):
        raise ValueError("Wings must be behind the original heads and dragon ear")
    encoded = original.get("href", "").split(",", 1)
    if len(encoded) != 2:
        raise ValueError("Original foreground artwork is missing")
    with Image.open(io.BytesIO(base64.b64decode(encoded[1]))) as foreground:
        with Image.open(SOURCE) as source:
            for point in ((267, 91), (270, 92), (264, 93)):
                if foreground.getpixel(point) != (*source.convert("RGB").getpixel(point), 255):
                    raise ValueError(f"Dragon ear foreground was altered at {point}")
    for size in SIZES:
        path = PUBLIC / "app-icons" / f"chimera-{size}.png"
        with Image.open(path) as image:
            if image.size != (size, size):
                raise ValueError(f"Wrong icon size: {path}")
    with Image.open(PUBLIC / "app-icons" / "favicon.ico") as image:
        if not isinstance(image, IcoImagePlugin.IcoImageFile) or not {
            (16, 16), (32, 32), (48, 48)
        } <= image.ico.sizes():
            raise ValueError("Favicon is missing required resolutions")
    for size, name in ((512, "chimera-trinity-transparent.png"),
                       (1024, "chimera-trinity-transparent-1024.png")):
        with Image.open(PUBLIC / "marks" / name) as image:
            if image.size != (size, size) or image.mode != "RGBA":
                raise ValueError(f"Wrong transparent treatment: {name}")
            if image.getpixel((0, 0))[3] != 0 or image.getchannel("A").getextrema() != (0, 255):
                raise ValueError(f"Missing transparency or artwork: {name}")
    for folder in ("marks", "app-icons"):
        for path in (PUBLIC / folder).iterdir():
            if path.is_file() and path.read_bytes() != (KIT / "assets" / folder / path.name).read_bytes():
                raise ValueError(f"Production kit differs: {path}")
    manifest = json.loads((KIT / "MANIFEST.json").read_text(encoding="utf-8"))
    for record in manifest["files"]:
        path = KIT / record["path"]
        if path.stat().st_size != record["bytes"] or hashlib.sha256(path.read_bytes()).hexdigest() != record["sha256"]:
            raise ValueError(f"Manifest mismatch: {path}")
    print("Verified rear wing layering, 10 icon sizes, favicon, transparency, kit parity and hashes.")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--inkscape", default=r"C:\Program Files\Inkscape\bin\inkscape.com")
    parser.add_argument("--verify", action="store_true")
    args = parser.parse_args()
    if args.verify:
        verify()
        return
    tree = ET.parse(MARKS / "leonine-refinement.svg")
    with Image.open(SOURCE) as source:
        source_art = source.convert("RGBA")
        original = remove_background(source_art)
        # Keep the original dark anatomy/shadows opaque, not just its bright facets.
        anatomy = Image.new("L", source_art.size, 0)
        ImageDraw.Draw(anatomy).polygon([
            (7, 32), (90, 68), (98, 62), (120, 43), (155, 25),
            (183, 39), (215, 53), (226, 36), (224, 55), (245, 68),
            (247, 55), (259, 71), (299, 32), (277, 65), (267, 78),
            (294, 105), (291, 119), (285, 115), (287, 131),
            (275, 140), (266, 137), (256, 153), (230, 188),
            (208, 174), (172, 191), (155, 205), (140, 190),
            (112, 190), (90, 180), (70, 170), (60, 130),
            (50, 124), (20, 122), (15, 129), (13, 112), (17, 101),
            (34, 91), (30, 88), (48, 82), (28, 79), (24, 66),
            (55, 77), (30, 58),
        ], fill=255)
        original.putalpha(ImageChops.lighter(original.getchannel("A"), anatomy))
    encoded = io.BytesIO()
    original.save(encoded, format="PNG")
    root = tree.getroot()
    wing = next(child for child in root if child.get("id") == "wings")
    root.insert(list(root).index(wing) + 1, ET.Element(f"{SVG}image", {
        "id": "original-creature",
        "width": "305", "height": "206",
        "href": "data:image/png;base64," + base64.b64encode(encoded.getvalue()).decode("ascii"),
    }))
    master = PUBLIC / "chimera-mark.svg"
    tree.write(master, encoding="utf-8", xml_declaration=True)
    with tempfile.TemporaryDirectory(prefix="chimera-refinement-") as temporary:
        output = Path(temporary) / "refined.png"
        subprocess.run([args.inkscape, str(master), "--export-type=png",
                        f"--export-filename={output}", "--export-width=1220"],
                       check=True, capture_output=True, text=True)
        with Image.open(output) as rendered:
            creature = rendered.convert("RGBA")
        silhouette = creature
        creature = Image.new("RGBA", silhouette.size, "#090F13")
        creature.alpha_composite(silhouette)
        creature.save(PUBLIC / "marks" / "chimera-primary-creature-dark.png")
        silhouette.save(PUBLIC / "chimera-mark.png")

        def tile(size: int, light: bool = False, mono: bool = False) -> Image.Image:
            canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
            draw = ImageDraw.Draw(canvas)
            draw.rounded_rectangle((0, 0, size - 1, size - 1), radius=size // 5,
                                   fill="#E6E9EC" if light else "#090F13")
            width = round(size * .92)
            art = silhouette.resize((width, round(width * 206 / 305)), Image.Resampling.LANCZOS)
            if mono:
                alpha = art.getchannel("A")
                art = art.convert("L").convert("RGBA")
                art.putalpha(alpha)
            canvas.alpha_composite(art, ((size - art.width) // 2, (size - art.height) // 2))
            return canvas
        for size in SIZES:
            tile(1024).resize((size, size), Image.Resampling.LANCZOS).save(
                PUBLIC / "app-icons" / f"chimera-{size}.png")
        tile(1024).save(PUBLIC / "app-icons" / "favicon.ico", format="ICO",
                        sizes=[(s, s) for s in SIZES if s <= 256])
        for name, light, mono in (
            ("dark", False, False), ("light", True, False),
            ("mono", False, True), ("split", False, False),
        ):
            tile(512, light, mono).save(PUBLIC / "marks" / f"chimera-trinity-{name}.png")
        transparent = Image.new("RGBA", (1024, 1024))
        art = silhouette.resize((942, 636), Image.Resampling.LANCZOS)
        transparent.alpha_composite(art, (41, 194))
        transparent.save(PUBLIC / "marks" / "chimera-trinity-transparent-1024.png")
        transparent.resize((512, 512), Image.Resampling.LANCZOS).save(
            PUBLIC / "marks" / "chimera-trinity-transparent.png")
        with Image.open(KIT / "assets" / "source" / "chimera-primary-lockup-original.png") as source:
            lockup = source.convert("RGBA").resize((1300, 1580), Image.Resampling.LANCZOS)
        # Only replace the creature region; retain the original wordmark and tagline.
        lockup.paste(creature, (40, 208))
        lockup.save(PUBLIC / "marks" / "chimera-primary-lockup-dark.png")
    for folder in ("marks", "app-icons"):
        for path in (PUBLIC / folder).iterdir():
            if path.is_file():
                shutil.copy2(path, KIT / "assets" / folder / path.name)
    shutil.copy2(master, MARKS / master.name)
    manifest = {
        "name": "CHIMERA Production Asset Kit", "version": "1.1.0",
        "files": [
            {"path": p.relative_to(KIT).as_posix(), "bytes": p.stat().st_size,
             "sha256": hashlib.sha256(p.read_bytes()).hexdigest()}
            for p in sorted(KIT.rglob("*"))
            if p.is_file() and p.name != "MANIFEST.json"
        ],
    }
    (KIT / "MANIFEST.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    verify()


if __name__ == "__main__":
    main()
