import io
import json
import re
import stat
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from zipfile import ZIP_BZIP2, ZIP_DEFLATED, ZipFile, ZipInfo

from fastapi.testclient import TestClient

from backend.app import backup, html5_import, main, media, storage
from backend.app.models import ProjectCreate, SceneCreate
from backend.app.scorm import build_scorm_12, build_scorm_2004
from backend.app.standalone import build_standalone_course


def package(files):
    output = io.BytesIO()
    with ZipFile(output, "w", ZIP_DEFLATED) as archive:
        for name, value in files.items():
            archive.writestr(name, value)
    return output.getvalue()


def manifest(version="1.2"):
    legacy = version == "1.2"
    cp = "http://www.imsproject.org/xsd/imscp_rootv1p1p2" if legacy else "http://www.imsglobal.org/xsd/imscp_v1p1"
    adl = "http://www.adlnet.org/xsd/adlcp_rootv1p2" if legacy else "http://www.adlnet.org/xsd/adlcp_v1p3"
    kind = "scormtype" if legacy else "scormType"
    return f'''<?xml version="1.0" encoding="UTF-8"?>
<manifest xmlns="{cp}" xmlns:adlcp="{adl}" identifier="synthetic">
  <metadata><schema>ADL SCORM</schema><schemaversion>{version}</schemaversion></metadata>
  <organizations default="org"><organization identifier="org"><title>Synthetic practice</title>
    <item identifier="launch" identifierref="sco"><title>Practice</title></item>
  </organization></organizations>
  <resources><resource identifier="sco" type="webcontent" adlcp:{kind}="sco" href="lesson/start.htm">
    <file href="lesson/start.htm"/><dependency identifierref="assets"/>
  </resource><resource identifier="assets" type="webcontent" adlcp:{kind}="asset">
    <file href="lesson/run.js"/>
  </resource></resources>
</manifest>'''


def scorm_files(xml=None):
    return {"imsmanifest.xml": manifest() if xml is None else xml,
            "index.html": "<h1>Wrong entry</h1>",
            "lesson/start.htm": '<h1>Synthetic SCO</h1><script src="run.js"></script><link rel="stylesheet" href="style.css">',
            "lesson/run.js": 'document.body.dataset.loaded="yes";',
            "lesson/style.css": 'body{background:url("icon.svg")}',
            "lesson/icon.svg": '<svg xmlns="http://www.w3.org/2000/svg"/>'}


class HTML5Tests(unittest.TestCase):
    def setUp(self):
        root = Path(self.enterContext(tempfile.TemporaryDirectory()))
        self.enterContext(patch.multiple(storage, ROOT=root, PROJECTS=root / "projects"))
        self.enterContext(patch.object(main, "ROOT", root))
        self.client = self.enterContext(TestClient(main.app))
        self.project = storage.create_project(ProjectCreate(title="Imported activity"))
        self.project = storage.create_scene(self.project.id, SceneCreate(title="Practice"))
        self.url = f"/api/projects/{self.project.id}"
        self.scene_url = self.url + "/scenes/" + self.project.storyboard.scenes[0].id

    def headers(self, revision=None):
        return {"If-Match": f'"{revision or storage.read_project(self.project.id).storyboard.revision}"'}

    def upload(self, content=b"<h1>Activity</h1>", filename="activity.html", **data):
        return self.client.post(self.url + "/html5-import", files={"file": (filename, content)},
                                data={"credit": "Original synthetic activity, permission to distribute", **data},
                                headers=self.headers())

    def test_compiles_nested_assets_styles_and_classic_scripts(self):
        content = package({"lesson/index.html": '<link rel="stylesheet" href="style.css"><img src="pic.svg"><script src="run.js"></script>',
                           "lesson/style.css": 'body{background-image:url("pic.svg")}',
                           "lesson/pic.svg": '<svg xmlns="http://www.w3.org/2000/svg"/>',
                           "lesson/run.js": 'document.body.dataset.loaded="yes";'})
        value = html5_import.compile_package("activity.zip", content, "lesson/index.html")
        self.assertIn("data:text/javascript;base64,", value["html"])
        self.assertIn("data:text/css;base64,", value["html"])
        self.assertIn("data:image/svg+xml;base64,", value["html"])
        self.assertIn("connect-src 'none'", value["csp"])
        self.assertEqual(value["fileCount"], 4)

    def test_scorm_versions_resolve_manifest_launch_over_manual_entry_and_persist_detection(self):
        for version, detected in (("1.2", "scorm-1.2"), ("2004 3rd Edition", "scorm-2004"),
                                  ("2004 4th Edition", "scorm-2004")):
            with self.subTest(version=version):
                result = self.upload(package(scorm_files(manifest(version))), "synthetic.zip", entrypoint="../ignored.html")
                self.assertEqual(result.status_code, 201, result.text)
                result = result.json()
                self.assertEqual((result["format"], result["entrypoint"]), (detected, "lesson/start.htm"))
                compiled = self.client.get(self.url + "/assets/" + result["assetId"]).json()
                self.assertEqual(compiled["format"], detected)
                self.assertEqual(compiled["entrypoint"], "lesson/start.htm")
                self.assertIn("Synthetic SCO", compiled["html"])
                self.assertNotIn("Wrong entry", compiled["html"])
                self.assertIn("data:text/javascript;base64,", compiled["html"])
                self.assertIn("data:text/css;base64,", compiled["html"])
                self.assertEqual(compiled["csp"], html5_import.CSP)
                self.assertEqual(compiled["fileCount"], 5)
                self.assertIsNone(result["project"]["storyboard"]["scenes"][0]["html5Activity"])
                duplicate = self.upload(package(scorm_files(manifest(version))), "synthetic.zip").json()
                self.assertEqual(duplicate["assetId"], result["assetId"])
                self.assertEqual(duplicate["format"], detected)
                self.assertEqual(duplicate["entrypoint"], "lesson/start.htm")

    def test_plain_zip_and_html_keep_manual_entry_contract(self):
        for filename, content, entry, detected in (
            ("plain.zip", package({"nested/start.html": "<h1>Plain</h1>"}), "nested/start.html", "html5-zip"),
            ("plain.htm", b"<h1>Plain</h1>", "ignored.html", "html"),
        ):
            result = self.upload(content, filename, entrypoint=entry)
            self.assertEqual(result.status_code, 201, result.text)
            self.assertEqual(result.json()["format"], detected)
            self.assertEqual(result.json()["entrypoint"], entry if filename.endswith(".zip") else "index.html")
        with self.assertRaisesRegex(ValueError, "selected HTML entry"):
            html5_import.compile_package("missing-manifest.zip", package({"lesson/start.htm": "x"}), "index.html")

    def test_scorm_namespace_prefix_optional_default_encoded_paths_and_exact_manifest_limit(self):
        xml = manifest().replace('xmlns=', 'xmlns:cp=').replace(' default="org"', "")
        xml = re.sub(r"<(/?)([a-z]+)(?=[ >])", r"<\1cp:\2", xml)
        xml = xml.replace('identifier="synthetic"', 'identifier="synthetic" xml:lang="en" '
                          'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" '
                          'xsi:schemaLocation="urn:unused https://example.invalid/never-fetch.xsd"')
        xml = xml.replace("lesson/start.htm", "lesson/start%20here.htm")
        files = scorm_files(xml)
        files["lesson/start here.htm"] = files.pop("lesson/start.htm")
        remaining = 256 * 1024 - len(xml.encode())
        files["imsmanifest.xml"] = xml + "<!--" + " " * (remaining - 7) + "-->"
        self.assertEqual(len(files["imsmanifest.xml"].encode()), 256 * 1024)
        result = html5_import.compile_package("synthetic.zip", package(files), "")
        self.assertEqual(result["entrypoint"], "lesson/start here.htm")
        files["imsmanifest.xml"] += " "
        with self.assertRaisesRegex(ValueError, "256 KiB"):
            html5_import.compile_package("synthetic.zip", package(files), "")

    def test_scorm_rejects_malformed_hostile_and_unsupported_manifests_without_mutation(self):
        xml = manifest()
        cases = [
            ("malformed", xml[:-10], "well-formed"),
            ("dtd", '<!DOCTYPE manifest [<!ENTITY x "boom">]>' + xml.split("?>", 1)[1], "DTD/entity"),
            ("external-entity", '<!DOCTYPE manifest SYSTEM "https://example.invalid/a.dtd">' + xml.split("?>", 1)[1], "DTD/entity"),
            ("utf16", xml.encode("utf-16"), "UTF-8"),
            ("utf16-no-bom-dtd", ('<!DOCTYPE manifest [<!ENTITY x "boom">]>' +
                                  xml.split("?>", 1)[1]).encode("utf-16-le"), "UTF-8"),
            ("utf32-no-bom-dtd", ('<!DOCTYPE manifest [<!ENTITY x "boom">]>' +
                                  xml.split("?>", 1)[1]).encode("utf-32-be"), "UTF-8"),
            ("size", " " * (256 * 1024 + 1), "256 KiB"),
            ("namespace", xml.replace("imscp_rootv1p1p2", "unknown"), "namespace"),
            ("version", xml.replace(">1.2<", ">2004 4th Edition<"), "schema/version"),
            ("schema", xml.replace("ADL SCORM", "Other"), "schema/version"),
            ("missing-metadata", xml.replace("<schema>ADL SCORM</schema>", ""), "one schema"),
            ("default", xml.replace('default="org"', 'default="missing"'), "default organization"),
            ("multiple-organizations", xml.replace("</organizations>", '<organization identifier="other"/></organizations>'), "one organization"),
            ("missing-reference", xml.replace('identifierref="sco"', 'identifierref="missing"'), "reference"),
            ("duplicate-identifiers", xml.replace('identifier="assets"', 'identifier="sco"'), "unique"),
            ("two-scos", xml.replace('scormtype="asset"', 'scormtype="sco"'), "one SCO"),
            ("no-sco", xml.replace('scormtype="sco"', 'scormtype="asset"'), "one SCO"),
            ("two-launch-items", xml.replace("</organization>", '<item identifier="second" identifierref="sco"/></organization>'), "one item"),
            ("nested-items", xml.replace("</item>", '<item identifier="second" identifierref="sco"/></item>'), "structure"),
            ("asset-launch", xml.replace('scormtype="asset"', 'scormtype="asset" href="index.html"'), "launch targets"),
            ("unknown-resource-type", xml.replace('type="webcontent"', 'type="other"'), "webcontent"),
            ("wrong-adl-namespace", xml.replace("adlcp_rootv1p2", "adlcp_v1p3"), "attributes"),
            ("dependency", xml.replace('identifierref="assets"', 'identifierref="missing"'), "dependencies"),
            ("dependency-cycle", xml.replace('</resource></resources>', '<dependency identifierref="assets"/></resource></resources>'), "dependencies"),
            ("sequencing", xml.replace("</organization>", '<sequencing xmlns="http://www.imsglobal.org/xsd/imsss"/></organization>'), "sequencing/navigation"),
            ("prerequisites", xml.replace("</item>", "<adlcp:prerequisites>other</adlcp:prerequisites></item>"), "structure"),
            ("parameters", xml.replace('identifierref="sco"', 'identifierref="sco" parameters="?x=1"'), "attributes"),
            ("xml-base", xml.replace('identifier="sco"', 'identifier="sco" xml:base="lesson/"'), "attributes"),
            ("hidden", xml.replace('identifierref="sco"', 'identifierref="sco" isvisible="false"'), "Hidden"),
            ("2004-sequencing", manifest("2004 4th Edition").replace("</organization>",
                '<sequencing xmlns="http://www.imsglobal.org/xsd/imsss"/></organization>'), "sequencing/navigation"),
            ("2004-navigation", manifest("2004 3rd Edition").replace("</item>",
                '<presentation xmlns="http://www.adlnet.org/xsd/adlnav_v1p3"/></item>'), "structure"),
            ("2004-completion", manifest("2004 4th Edition").replace("</item>",
                "<adlcp:completionThreshold>1</adlcp:completionThreshold></item>"), "structure"),
        ]
        revision = storage.read_project(self.project.id).storyboard.revision
        for name, value, message in cases:
            with self.subTest(name=name):
                result = self.upload(package(scorm_files(value)), "synthetic.zip")
                self.assertEqual(result.status_code, 422, result.text)
                self.assertIn(message, result.json()["detail"])
                project = storage.read_project(self.project.id)
                self.assertEqual(project.storyboard.revision, revision)
                self.assertEqual(project.storyboard.assets, [])

    def test_scorm_rejects_unsafe_missing_or_non_html_launch_and_file_paths(self):
        for path in ("https://example.invalid/a.htm", "//example.invalid/a.htm", "/lesson/start.htm",
                     "../lesson/start.htm", "%2e%2e/lesson/start.htm", "lesson/%2e%2e/start.htm",
                     "C:/lesson/start.htm", "lesson\\start.htm", "lesson/start.htm?x=1",
                     "lesson/start.htm#page", "missing.htm", "lesson/run.js", ""):
            with self.subTest(path=path), self.assertRaises(ValueError):
                html5_import.compile_package("synthetic.zip", package(scorm_files(
                    manifest().replace('href="lesson/start.htm"', f'href="{path}"'))), "index.html")
        with self.assertRaisesRegex(ValueError, "referenced file is missing"):
            html5_import.compile_package("synthetic.zip", package(scorm_files(
                manifest().replace('href="lesson/run.js"', 'href="missing.js"'))), "")
        for name in ("IMSManifest.xml", "nested/imsmanifest.xml"):
            files = scorm_files()
            files[name] = files.pop("imsmanifest.xml")
            with self.subTest(name=name), self.assertRaisesRegex(ValueError, "root imsmanifest.xml"):
                html5_import.compile_package("synthetic.zip", package(files), "")
        files = scorm_files()
        files["lesson/run.js"] = '<not actually UTF-8>'.encode("utf-16")
        with self.assertRaisesRegex(ValueError, "UTF-8"):
            html5_import.compile_package("synthetic.zip", package(files), "")
        files = scorm_files()
        files["lesson/start.htm"] = '<script src="https://example.invalid/a.js"></script>'
        with self.assertRaisesRegex(ValueError, "External"):
            html5_import.compile_package("synthetic.zip", package(files), "")

    def test_scorm_preserves_archive_protections(self):
        output = io.BytesIO(package(scorm_files()))
        with ZipFile(output, "a") as archive:
            archive.writestr("IMSMANIFEST.XML", manifest())
        with self.assertRaisesRegex(ValueError, "duplicate paths"):
            html5_import.compile_package("synthetic.zip", output.getvalue(), "")
        encrypted = bytearray(package(scorm_files()))
        encrypted[encrypted.index(b"PK\x01\x02") + 8] |= 1
        with self.assertRaisesRegex(ValueError, "encrypted"):
            html5_import.compile_package("synthetic.zip", bytes(encrypted), "")
        for compression, symlink, message in ((ZIP_BZIP2, False, "compression"),
                                               (ZIP_DEFLATED, True, "Symlinks")):
            output = io.BytesIO()
            with ZipFile(output, "w", compression) as archive:
                for name, value in scorm_files().items():
                    info = ZipInfo(name)
                    info.compress_type = compression
                    if symlink and name == "imsmanifest.xml":
                        info.create_system = 3
                        info.external_attr = (stat.S_IFLNK | 0o777) << 16
                    archive.writestr(info, value)
            with self.subTest(message=message), self.assertRaisesRegex(ValueError, message):
                html5_import.compile_package("synthetic.zip", output.getvalue(), "")
        files = scorm_files()
        files["lesson/run.js"] = " " * 10000
        content = package(files)
        with patch.object(html5_import, "LIMIT", len(content) + 1):
            with self.assertRaisesRegex(ValueError, "Expanded"):
                html5_import.compile_package("synthetic.zip", content, "")

    def test_rejects_nonportable_or_active_container_features(self):
        for content in (
            '<script src="https://example.invalid/a.js"></script>', '<img src="missing.png">',
            '<iframe src="other.html"></iframe>', '<script type="module">import x from "./x.js"</script>',
            '<form></form>', '<meta http-equiv="refresh" content="0;url=https://example.invalid">',
            '<base href="https://example.invalid">', '<img srcset="x.png 2x">',
            '<style>body{background:url(//example.invalid/a.png)}</style>', '<a href="other.html">Next</a>',
        ):
            with self.subTest(content=content), self.assertRaises(ValueError):
                html5_import.compile_package("activity.html", content.encode(), "")

    def test_rejects_unsafe_zip_paths_duplicate_paths_limits_and_missing_entry(self):
        for files in ({"../index.html": "x"}, {"C:/index.html": "x"}, {"a\\index.html": "x"},
                      {"index.html": "x", "INDEX.HTML": "y"}, {"index.html": "x", "payload.exe": "y"},
                      {"other.html": "x"}):
            with self.subTest(files=list(files)), self.assertRaises(ValueError):
                html5_import.compile_package("activity.zip", package(files), "index.html")
        with self.assertRaises(ValueError):
            html5_import.compile_package("activity.zip", b"not a zip", "")
        with patch.object(html5_import, "LIMIT", 100):
            with self.assertRaises(ValueError):
                html5_import.compile_package("activity.html", b"x" * 101, "")
        with self.assertRaises(ValueError):
            html5_import.compile_package("activity.zip", package({f"file-{i}.js": "" for i in range(501)}), "")

    def test_import_requires_revision_and_rejects_invalid_without_mutation(self):
        response = self.client.post(self.url + "/html5-import", files={"file": ("x.html", b"<h1>x</h1>")})
        self.assertEqual(response.status_code, 428)
        revision = self.project.storyboard.revision
        self.assertEqual(self.upload(b"<iframe></iframe>").status_code, 422)
        self.assertEqual(storage.read_project(self.project.id).storyboard.revision, revision)
        imported = self.upload()
        self.assertEqual(imported.status_code, 201, imported.text)
        stale = self.client.post(self.url + "/html5-import", files={"file": ("x.html", b"<h1>x</h1>")}, headers=self.headers(revision))
        self.assertEqual(stale.status_code, 412)
        duplicate = self.upload().json()
        self.assertEqual(duplicate["assetId"], imported.json()["assetId"])
        self.assertEqual(len(duplicate["project"]["storyboard"]["assets"]), 1)

    def test_save_reopen_remove_and_all_portable_exports_preserve_package(self):
        result = self.upload().json()
        activity = {"assetId": result["assetId"], "title": "Imported exercise", "alternative": "Read and practice the task.",
                    "tracking": "scored", "scoreWeight": 2}
        self.assertEqual(self.client.patch(self.scene_url, json={"html5Activity": activity}).status_code, 428)
        response = self.client.patch(self.scene_url, headers=self.headers(), json={"html5Activity": activity})
        self.assertEqual(response.status_code, 200, response.text)
        project = storage.read_project(self.project.id)
        self.assertEqual(project.storyboard.scenes[0].html5Activity.model_dump(), activity)
        for builder in (build_scorm_12, build_scorm_2004, build_standalone_course):
            content, _ = builder(project)
            with ZipFile(io.BytesIO(content)) as archive:
                scene = json.loads(archive.read("storyboard.json"))["scenes"][0]
                self.assertEqual(scene["html5Activity"], activity)
                self.assertIn(project.storyboard.assets[0].path, archive.namelist())
                script = archive.read("player.js").decode()
                self.assertIn("globalThis.__CHIMERA_HTML5", script)
                self.assertIn('frame.setAttribute("sandbox", "allow-scripts")', script)
                self.assertIn("window.API_1484_11 =", script)
                self.assertIn("window.API =", script)
                self.assertIn("event.source !== frame.contentWindow", script)
        self.assertEqual(self.client.patch(self.scene_url, headers=self.headers(), json={"html5Activity": None}).status_code, 200)
        self.assertEqual(len(storage.read_project(self.project.id).storyboard.assets), 1)

    def test_missing_asset_invalid_tracking_and_conflicting_components_rejected(self):
        asset_id = self.upload().json()["assetId"]
        base = {"assetId": asset_id, "title": "Activity", "alternative": "Accessible description", "tracking": "view"}
        for change in ({"assetId": "html5-" + "0" * 64}, {"tracking": "magic"}, {"alternative": " "},
                       {"scoreWeight": 0}):
            response = self.client.patch(self.scene_url, headers=self.headers(), json={"html5Activity": {**base, **change}})
            self.assertEqual(response.status_code, 422, response.text)
        from backend.tests.test_experience_treatments import EXPERIENCE
        response = self.client.patch(self.scene_url, headers=self.headers(), json={"html5Activity": base, "experience": EXPERIENCE})
        self.assertEqual(response.status_code, 422, response.text)

    def test_backup_restore_preserves_activity_and_rejects_non_media_sharing(self):
        uploaded = self.upload().json()
        asset_id = uploaded["assetId"]
        response = self.client.patch(self.scene_url, headers=self.headers(), json={"html5Activity": {
            "assetId": asset_id, "title": "Portable practice", "alternative": "An original practice activity", "tracking": "scored",
        }})
        self.assertEqual(response.status_code, 200, response.text)
        archive = backup.build_project_archive(self.project.id)
        self.client.patch(self.scene_url, headers=self.headers(), json={"html5Activity": None})
        restored = backup.restore_project_archive(self.project.id, archive)
        self.assertEqual(restored.storyboard.scenes[0].html5Activity.assetId, asset_id)
        asset = next(asset for asset in restored.storyboard.assets if asset.id == asset_id)
        self.assertTrue((storage.project_path(self.project.id) / asset.path).is_file())
        with self.assertRaisesRegex(ValueError, "cannot be published as shared media"):
            media.publish_shared(self.project.id, asset_id)
        with self.assertRaisesRegex(ValueError, "Remove this media"):
            media.delete_asset(self.project.id, asset_id, restored.storyboard.revision)
        response = self.client.patch(self.url + f"/assets/{asset_id}/attribution", headers=self.headers(),
                                     json={"attributionText": "Updated original credit", "attributionStatus": "complete"})
        self.assertEqual(response.status_code, 200, response.text)
        storyboard = restored.storyboard.model_dump(mode="json")
        storyboard["scenes"][0]["html5Activity"]["assetId"] = "html5-" + "0" * 64
        response = self.client.put(self.url + "/storyboard/import", headers=self.headers(), json=storyboard)
        self.assertEqual(response.status_code, 422, response.text)

    def test_exact_package_limits_and_invalid_javascript_encoding(self):
        limit = html5_import.LIMIT
        for count in (500, 501):
            entries = {"index.html": "<p>Example</p>", **{f"item-{i}.json": "{}" for i in range(count - 1)}}
            if count == 500:
                self.assertEqual(html5_import.compile_package("activity.zip", package(entries), "index.html")["fileCount"], 500)
            else:
                with self.assertRaisesRegex(ValueError, "500"):
                    html5_import.compile_package("activity.zip", package(entries), "index.html")
        self.assertEqual(html5_import.compile_package("activity.html", b"x" * limit, "")["fileCount"], 1)
        with self.assertRaisesRegex(ValueError, "Expanded"):
            html5_import.compile_package("activity.zip", package({"index.html": "x" * (limit + 1)}), "index.html")
        with self.assertRaisesRegex(ValueError, "40 MB"):
            html5_import.compile_package("activity.zip", package({"index.html": '<img src="big.png">' * 3, "big.png": b"x" * (11 * 1024 * 1024)}), "index.html")
        with self.assertRaisesRegex(ValueError, "UTF-8"):
            html5_import.compile_package("activity.zip", package({"index.html": '<script src="run.js"></script>', "run.js": b"\xff"}), "index.html")
        response = self.upload(b"x" * (limit + 1))
        self.assertEqual(response.status_code, 413, response.text)

    def test_failed_storyboard_save_removes_only_the_new_compiled_file(self):
        with patch.object(storage, "write_storyboard", side_effect=OSError("Synthetic disk failure")):
            with self.assertRaisesRegex(OSError, "Synthetic disk failure"):
                html5_import.import_activity(self.project.id, "activity.html", b"<p>Example</p>", "", self.project.storyboard.revision)
        self.assertEqual(list((storage.project_path(self.project.id) / "assets" / "html5").glob("*.json")), [])
        self.assertEqual(storage.read_project(self.project.id).storyboard.assets, [])

    def test_word_export_renders_the_activity_alternative(self):
        uploaded = self.upload().json()
        response = self.client.patch(self.scene_url, headers=self.headers(), json={"html5Activity": {
            "assetId": uploaded["assetId"], "title": "Portable practice",
            "alternative": "An original practice activity, with an accessible explanation.", "tracking": "view",
        }})
        self.assertEqual(response.status_code, 200, response.text)
        document = self.client.get(self.url + "/storyboard-full.docx")
        self.assertEqual(document.status_code, 200, document.text if document.status_code != 200 else "")
        with ZipFile(io.BytesIO(document.content)) as archive:
            self.assertTrue(any(name.startswith("word/media/") for name in archive.namelist()))
