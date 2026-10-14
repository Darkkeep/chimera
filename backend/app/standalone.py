import io
from zipfile import ZIP_DEFLATED, ZipFile

from .models import ProjectDetail
from .scorm import build_scorm_2004
from .storage import slugify


def build_standalone_course(project: ProjectDetail) -> tuple[bytes, str]:
    source_package, _ = build_scorm_2004(project)
    output = io.BytesIO()
    with ZipFile(io.BytesIO(source_package)) as source, ZipFile(output, "w", ZIP_DEFLATED) as package:
        for filename in source.namelist():
            if filename == "imsmanifest.xml":
                continue
            content = source.read(filename)
            if filename == "index.html":
                content = content.replace(b'<script src="player.js">', b'<script src="course-data.js"></script><script src="player.js">')
            package.writestr(filename, content)
        package.writestr("course-data.js", b"window.__CHIMERA_STORYBOARD = " + source.read("storyboard.json") + b";\n")
        package.writestr("README.txt", (
            "Chimera standalone course\n\n"
            "Extract the entire ZIP to a folder, then open index.html in a modern browser.\n"
            "Keep all files and subfolders together. No LMS, internet connection, or local server is required.\n"
            "The same folder can also be served from a static web server.\n\n"
            "Progress and assessment attempts are kept only while the page remains open.\n"
            "Reloading or reopening starts a new session. No results are reported to an LMS.\n"
            "Do not use this package for secure testing: answer keys are included in the course files.\n"
            "Narration scripts are text; only attached audio files provide audio playback.\n"
        ))
    return output.getvalue(), f"{slugify(project.title)}-standalone.zip"