"""Compile a bounded, offline HTML package into an isolated portable document."""
import base64
import hashlib
import io
import json
import mimetypes
import posixpath
import re
import stat
from html import escape
from html.parser import HTMLParser
from pathlib import Path, PurePosixPath
from urllib.parse import unquote, urlsplit
from zipfile import ZIP_DEFLATED, ZIP_STORED, BadZipFile, ZipFile

from . import storage
from .models import ExtractedAsset

LIMIT = 20 * 1024 * 1024
ALLOWED = {".html", ".htm", ".js", ".css", ".json", ".png", ".jpg", ".jpeg", ".gif",
           ".webp", ".svg", ".mp3", ".wav", ".ogg", ".mp4", ".webm", ".woff", ".woff2", ".ttf", ".vtt"}
CSP = ("default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval' data: blob:; "
       "style-src 'unsafe-inline' data:; img-src data: blob:; media-src data: blob:; "
       "font-src data:; connect-src 'none'; frame-src 'none'; object-src 'none'; "
       "base-uri 'none'; form-action 'none'")


def safe_path(name: str) -> str:
    path = PurePosixPath(name)
    if "\\" in name or ":" in name or name.startswith("/") or any(part in {"", ".", ".."} for part in name.split("/")):
        raise ValueError("Package paths must be relative, without traversal, backslashes or drive names")
    return path.as_posix()


def compile_package(filename: str, content: bytes, entrypoint: str) -> dict[str, str | int]:
    if len(content) > LIMIT:
        raise ValueError("HTML5 upload exceeds 20 MB")
    files = {}
    if Path(filename).suffix.lower() == ".zip":
        try:
            with ZipFile(io.BytesIO(content)) as archive:
                total = 0
                if len(archive.infolist()) > 500:
                    raise ValueError("HTML5 packages support at most 500 entries")
                for item in archive.infolist():
                    if item.is_dir():
                        safe_path(item.filename.rstrip("/"))
                        continue
                    name = safe_path(item.filename)
                    if name.casefold() in {key.casefold() for key in files}:
                        raise ValueError("Package contains duplicate paths")
                    if stat.S_ISLNK(item.external_attr >> 16) or item.flag_bits & 1:
                        raise ValueError("Symlinks and encrypted entries are not supported")
                    if item.compress_type not in {ZIP_STORED, ZIP_DEFLATED}:
                        raise ValueError("HTML5 ZIP entries must use stored or deflate compression")
                    total += item.file_size
                    if total > LIMIT:
                        raise ValueError("Expanded HTML5 package exceeds 20 MB")
                    if Path(name).suffix.lower() not in ALLOWED and name != "imsmanifest.xml":
                        raise ValueError(f"Unsupported package file: {name}")
                    if name == "imsmanifest.xml":
                        continue
                    files[name] = archive.read(item)
        except BadZipFile as error:
            raise ValueError("Invalid HTML5 ZIP") from error
        entry = safe_path(entrypoint or "index.html")
    elif Path(filename).suffix.lower() in {".html", ".htm"}:
        entry = "index.html"
        files[entry] = content
    else:
        raise ValueError("Upload an HTML file or an HTML5 ZIP")
    if entry not in files or Path(entry).suffix.lower() not in {".html", ".htm"}:
        raise ValueError("The selected HTML entry point is not in this package")
    active = set()

    def resource(value, relative):
        if not value or value.startswith("#"):
            return value
        if value.startswith("data:"):
            return value
        parsed = urlsplit(value)
        if parsed.scheme or parsed.netloc or value.startswith("/"):
            raise ValueError(f"External or absolute resource is not portable: {value[:160]}")
        name = posixpath.normpath(posixpath.join(posixpath.dirname(relative), unquote(parsed.path)))
        safe_path(name)
        if name not in files:
            raise ValueError(f"Referenced file is missing: {name}")
        if name in active:
            raise ValueError("Cyclic CSS imports are not supported")
        data = files[name]
        extension = Path(name).suffix.lower()
        if extension in {".html", ".htm"}:
            raise ValueError("Nested HTML navigation/frames are not supported; use one activity entry point")
        if extension == ".css":
            active.add(name)
            data = css(data.decode("utf-8-sig"), name).encode()
            active.remove(name)
        if extension == ".js":
            data.decode("utf-8-sig")
        mime = {".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml"}.get(extension) or mimetypes.guess_type(name)[0] or "application/octet-stream"
        return "data:" + mime + ";base64," + base64.b64encode(data).decode() + (("#" + parsed.fragment) if parsed.fragment else "")

    def bounded_sub(pattern, replacement, value):
        parts, size, offset = [], 0, 0
        for match in re.finditer(pattern, value, flags=re.I):
            part = value[offset:match.start()] + replacement(match)
            size += len(part.encode())
            if size > LIMIT * 2:
                raise ValueError("Compiled HTML5 activity exceeds 40 MB")
            parts.append(part)
            offset = match.end()
        tail = value[offset:]
        if size + len(tail.encode()) > LIMIT * 2:
            raise ValueError("Compiled HTML5 activity exceeds 40 MB")
        return "".join(parts) + tail

    def css(value, relative):
        value = bounded_sub(r"""@import\s+(['"])(.*?)\1\s*;""",
                            lambda m: '@import url("' + resource(m[2], relative) + '");', value)
        return bounded_sub(r"""url\(\s*(['"]?)(.*?)\1\s*\)""",
                           lambda m: 'url("' + resource(m[2], relative) + '")', value)

    class Compiler(HTMLParser):
        def __init__(self):
            super().__init__(convert_charrefs=False)
            self.parts = []
            self.in_style = False
            self.size = 0

        def append(self, value):
            self.size += len(value.encode())
            if self.size > LIMIT * 2:
                raise ValueError("Compiled HTML5 activity exceeds 40 MB")
            self.parts.append(value)

        def handle_starttag(self, tag, attrs):
            values = dict(attrs)
            if tag in {"base", "iframe", "frame", "object", "embed", "form"}:
                raise ValueError(f"Unsupported HTML element: {tag}")
            if tag == "meta" and "http-equiv" in values:
                raise ValueError("HTTP-equiv metadata must be removed before import")
            if tag == "script" and values.get("type") == "module":
                raise ValueError("Bundle JavaScript modules into a classic script before import")
            if "srcset" in values:
                raise ValueError("Use src instead of srcset before importing")
            self.append("<" + tag)
            for key, value in attrs:
                if value is not None:
                    if key in {"src", "poster"} or key == "href" and tag == "link":
                        value = resource(value, entry)
                    elif key == "href" and not value.startswith("#"):
                        raise ValueError("Activity links must stay within the document")
                    elif key == "style":
                        value = css(value, entry)
                self.append(" " + key + (f'="{escape(value, quote=True)}"' if value is not None else ""))
            self.append(">")
            self.in_style = tag == "style" or self.in_style

        def handle_endtag(self, tag):
            self.append("</" + tag + ">")
            if tag == "style":
                self.in_style = False

        def handle_data(self, data):
            self.append(css(data, entry) if self.in_style else data)

        def handle_entityref(self, name):
            self.append("&" + name + ";")

        def handle_charref(self, name):
            self.append("&#" + name + ";")

    parser = Compiler()
    try:
        parser.feed(files[entry].decode("utf-8-sig"))
        parser.close()
    except UnicodeError as error:
        raise ValueError("HTML, CSS and JavaScript must be UTF-8") from error
    document = "".join(parser.parts)
    if len(document.encode()) > LIMIT * 2:
        raise ValueError("Compiled HTML5 activity exceeds 40 MB")
    return {"html": document, "csp": CSP, "entrypoint": entry, "fileCount": len(files)}


def import_activity(project_id, filename, content, entrypoint, expected_revision, credit=""):
    compiled = compile_package(filename, content, entrypoint)
    payload = json.dumps(compiled).encode()
    digest = hashlib.sha256(payload).hexdigest()
    asset_id = "html5-" + digest
    with storage.storyboard_transaction():
        project = storage.read_project(project_id)
        if project.storyboard.revision != expected_revision:
            raise storage.StoryboardRevisionConflict(expected_revision, project.storyboard.revision)
        if any(asset.id == asset_id for asset in project.storyboard.assets):
            return {"project": project, "assetId": asset_id}
        relative = f"assets/html5/{asset_id}.json"
        destination = storage.project_path(project_id) / relative
        destination.parent.mkdir(parents=True, exist_ok=True)
        asset = ExtractedAsset(id=asset_id, kind="html5", filename=Path(filename).name,
                               contentType="application/json", sizeBytes=len(payload), sha256=digest, path=relative,
                               attributionText=credit.strip(), attributionStatus="complete" if credit.strip() else "draft")
        storyboard = project.storyboard.model_copy(update={"assets": [*project.storyboard.assets, asset]})
        existed, saved = destination.exists(), False
        try:
            destination.write_bytes(payload)
            storage.write_storyboard(storage.project_path(project_id), storyboard, expected_revision)
            saved = True
        finally:
            if not saved and not existed:
                destination.unlink(missing_ok=True)
        return {"project": storage.read_project(project_id), "assetId": asset_id}
