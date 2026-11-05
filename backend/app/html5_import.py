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
from xml.etree import ElementTree as ET
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


def manifest_entrypoint(content: bytes, files: dict[str, bytes]) -> tuple[str, str]:
    if len(content) > 256 * 1024:
        raise ValueError("SCORM manifest exceeds 256 KiB; use a single-SCO package")
    try:
        text = content.decode("utf-8-sig")
        if "\x00" in text:
            raise ValueError("SCORM manifest must be well-formed UTF-8 XML without NUL characters")
        if re.search(r"<!\s*(DOCTYPE|ENTITY)\b", text, re.I):
            raise ValueError("SCORM manifest DTD/entity declarations are not supported")
        root = ET.fromstring(text)
    except (UnicodeError, ET.ParseError) as error:
        raise ValueError("SCORM manifest must be well-formed UTF-8 XML") from error
    versions = {
        "{http://www.imsproject.org/xsd/imscp_rootv1p1p2}manifest":
            ("http://www.imsproject.org/xsd/imscp_rootv1p1p2",
             "http://www.adlnet.org/xsd/adlcp_rootv1p2", "scorm-1.2", {"1.2"}, "scormtype"),
        "{http://www.imsglobal.org/xsd/imscp_v1p1}manifest":
            ("http://www.imsglobal.org/xsd/imscp_v1p1",
             "http://www.adlnet.org/xsd/adlcp_v1p3", "scorm-2004",
             {"2004 3rd Edition", "2004 4th Edition"}, "scormType"),
    }
    if root.tag not in versions:
        raise ValueError("Unsupported SCORM manifest namespace; use SCORM 1.2 or 2004 3rd/4th Edition")
    cp, adl, detected, supported, scorm_type = versions[root.tag]
    def q(name):
        return f"{{{cp}}}{name}"

    type_attr = f"{{{adl}}}{scorm_type}"
    language = "{http://www.w3.org/XML/1998/namespace}lang"
    rules = {
        "manifest": ({"identifier", "version", language,
                      "{http://www.w3.org/2001/XMLSchema-instance}schemaLocation"},
                     {"metadata", "organizations", "resources"}),
        "metadata": (set(), {"schema", "schemaversion"}),
        "schema": (set(), set()), "schemaversion": (set(), set()),
        "organizations": ({"default"}, {"organization"}),
        "organization": ({"identifier", "structure", language}, {"title", "item"}),
        "title": ({language}, set()),
        "item": ({"identifier", "identifierref", "isvisible", language}, {"title"}),
        "resources": (set(), {"resource"}),
        "resource": ({"identifier", "type", "href", type_attr}, {"file", "dependency"}),
        "file": ({"href"}, set()), "dependency": ({"identifierref"}, set()),
    }
    identifiers = set()
    for node in root.iter():
        local = node.tag.removeprefix(f"{{{cp}}}")
        if local not in rules or node.tag != q(local):
            raise ValueError(f"Unsupported SCORM manifest element: {node.tag}; sequencing/navigation and extended semantics are not supported")
        attrs, children = rules[local]
        if set(node.attrib) - attrs or any(child.tag not in {q(name) for name in children} for child in node):
            raise ValueError(f"Unsupported SCORM manifest attributes or structure in {local}; use one flat SCO without sequencing/navigation")
        if local not in {"title", "schema", "schemaversion"} and node.text and node.text.strip():
            raise ValueError(f"Unexpected SCORM manifest text in {local}")
        if node.tail and node.tail.strip():
            raise ValueError("Unexpected SCORM manifest text between elements")
        if local in {"manifest", "organization", "item", "resource"}:
            identifier = node.get("identifier", "")
            if not identifier.strip() or identifier in identifiers:
                raise ValueError("SCORM manifest identifiers must be present and unique")
            identifiers.add(identifier)

    def one(parent, name):
        matches = parent.findall(q(name))
        if len(matches) != 1:
            raise ValueError(f"SCORM manifest requires exactly one {name}")
        return matches[0]

    metadata = one(root, "metadata")
    if one(metadata, "schema").text != "ADL SCORM" or one(metadata, "schemaversion").text not in supported:
        raise ValueError("Unsupported SCORM schema/version metadata for this manifest namespace")
    organizations = one(root, "organizations")
    organization = one(organizations, "organization")
    if organizations.get("default", organization.get("identifier")) != organization.get("identifier"):
        raise ValueError("SCORM default organization reference is unresolved")
    if organization.get("structure", "hierarchical") != "hierarchical":
        raise ValueError("Unsupported SCORM organization structure")
    item = one(organization, "item")
    if item.get("isvisible", "true") != "true":
        raise ValueError("Hidden SCORM launch items are not supported")
    resources = one(root, "resources").findall(q("resource"))
    by_id = {node.get("identifier"): node for node in resources}
    scos = [node for node in resources if node.get(type_attr) == "sco"]
    if len(scos) != 1:
        raise ValueError("SCORM package requires exactly one SCO")
    sco = scos[0]
    if item.get("identifierref") != sco.get("identifier"):
        raise ValueError("SCORM launch item must reference the single SCO resource")

    def package_path(value):
        parsed = urlsplit(value)
        if not value or parsed.scheme or parsed.netloc or parsed.query or parsed.fragment:
            raise ValueError("SCORM paths must be local relative files without URLs, launch parameters or fragments")
        name = safe_path(unquote(parsed.path))
        if name not in files:
            raise ValueError(f"SCORM referenced file is missing: {name}")
        return name

    for node in resources:
        if node.get("type") != "webcontent" or node.get(type_attr) not in {"sco", "asset"}:
            raise ValueError("SCORM resources must be webcontent with a supported SCO/asset type")
        if node is not sco and node.get("href") is not None:
            raise ValueError("Multiple SCORM launch targets are not supported; asset resources cannot have href")
        for file in node.findall(q("file")):
            package_path(file.get("href", ""))
        for dependency in node.findall(q("dependency")):
            target = by_id.get(dependency.get("identifierref"))
            if target is None or target.get(type_attr) != "asset" or target.findall(q("dependency")):
                raise ValueError("SCORM dependencies must reference existing terminal asset resources")
    entry = package_path(sco.get("href", ""))
    if Path(entry).suffix.lower() not in {".html", ".htm"}:
        raise ValueError("SCORM launch file must be HTML/HTM")
    return detected, entry


def compile_package(filename: str, content: bytes, entrypoint: str) -> dict[str, str | int]:
    if len(content) > LIMIT:
        raise ValueError("HTML5 upload exceeds 20 MB")
    files = {}
    detected = "html"
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
                    if PurePosixPath(name).name.casefold() == "imsmanifest.xml" and name != "imsmanifest.xml":
                        raise ValueError("SCORM requires one root imsmanifest.xml with exact casing")
                    if Path(name).suffix.lower() not in ALLOWED and name != "imsmanifest.xml":
                        raise ValueError(f"Unsupported package file: {name}")
                    files[name] = archive.read(item)
        except BadZipFile as error:
            raise ValueError("Invalid HTML5 ZIP") from error
        if "imsmanifest.xml" in files:
            detected, entry = manifest_entrypoint(files["imsmanifest.xml"], files)
            del files["imsmanifest.xml"]
        else:
            detected, entry = "html5-zip", safe_path(entrypoint or "index.html")
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
    return {"html": document, "csp": CSP, "entrypoint": entry, "fileCount": len(files), "format": detected}


def import_activity(project_id, filename, content, entrypoint, expected_revision, credit=""):
    compiled = compile_package(filename, content, entrypoint)
    payload = json.dumps(compiled).encode()
    digest = hashlib.sha256(payload).hexdigest()
    asset_id = "html5-" + digest
    detection = {"format": compiled["format"], "entrypoint": compiled["entrypoint"]}
    with storage.storyboard_transaction():
        project = storage.read_project(project_id)
        if project.storyboard.revision != expected_revision:
            raise storage.StoryboardRevisionConflict(expected_revision, project.storyboard.revision)
        if any(asset.id == asset_id for asset in project.storyboard.assets):
            return {"project": project, "assetId": asset_id, **detection}
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
        return {"project": storage.read_project(project_id), "assetId": asset_id, **detection}
