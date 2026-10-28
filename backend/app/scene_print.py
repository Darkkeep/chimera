"""Static views of the authored composition, rendered by the delivery player."""
import io
import shutil
import subprocess
import tempfile
from contextvars import ContextVar
from functools import wraps
from pathlib import Path
from zipfile import ZipFile

from .models import ProjectDetail

_images: ContextVar[dict[str, bytes] | None] = ContextVar("authored_scene_images", default=None)


def scene_image(scene_id: str):
    images = _images.get()
    return io.BytesIO(images[scene_id]) if images is not None and scene_id in images else None


def render_scene_images(project: ProjectDetail) -> dict[str, bytes]:
    if not project.storyboard.scenes:
        return {}
    from .standalone import build_standalone_course
    node = shutil.which("node")
    if not node:
        raise RuntimeError("Document visuals require Node.js and the Playwright Chromium browser. Original source images will not be substituted for authored scenes.")
    script = Path(__file__).resolve().parents[2] / "scripts" / "render-authored-scenes.cjs"
    with tempfile.TemporaryDirectory(prefix="chimera-print-") as directory:
        root = Path(directory)
        package = root / "package"
        package.mkdir()
        content, _ = build_standalone_course(project)
        with ZipFile(io.BytesIO(content)) as archive:
            # The package is generated locally, but enforce containment here too.
            for entry in archive.infolist():
                if not (package / entry.filename).resolve().is_relative_to(package.resolve()):
                    raise ValueError("Invalid authored scene package path")
            archive.extractall(package)
        try:
            result = subprocess.run([node, str(script), str(package), str(root / "images")],
                capture_output=True, text=True, timeout=max(90, len(project.storyboard.scenes) * 15))
        except (OSError, subprocess.TimeoutExpired) as error:
            raise RuntimeError("Authored scene visuals could not be prepared. Ask the operator to check the document renderer.") from error
        if result.returncode:
            raise RuntimeError("Authored scene visuals could not be rendered. Check Playwright Chromium installation and referenced images. " + result.stderr[-1200:])
        return {scene.id: (root / "images" / f"{index}.png").read_bytes()
                for index, scene in enumerate(project.storyboard.scenes)}


def with_scene_images(builder):
    @wraps(builder)
    def build(project, *args, **kwargs):
        token = _images.set(render_scene_images(project))
        try:
            return builder(project, *args, **kwargs)
        finally:
            _images.reset(token)
    return build
