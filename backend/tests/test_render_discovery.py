import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from backend.app.render import find_libreoffice


class LibreOfficeDiscoveryTests(unittest.TestCase):
    def test_explicit_path_takes_priority(self):
        with tempfile.TemporaryDirectory() as folder:
            executable = Path(folder) / "soffice.exe"
            executable.touch()
            with patch.dict("os.environ", {"CHIMERA_LIBREOFFICE_PATH": str(executable)}), patch(
                "backend.app.render.shutil.which"
            ) as which:
                self.assertEqual(find_libreoffice(), str(executable.resolve()))
                which.assert_not_called()

    def test_invalid_explicit_path_does_not_fall_back(self):
        with tempfile.TemporaryDirectory() as folder:
            with patch.dict("os.environ", {"CHIMERA_LIBREOFFICE_PATH": str(Path(folder) / "missing.exe")}), patch(
                "backend.app.render.shutil.which", return_value="system-soffice"
            ) as which:
                self.assertIsNone(find_libreoffice())
                which.assert_not_called()

    def test_portable_copy_is_found_independent_of_working_directory(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            executable = root / "tools/LibreOfficePortable/App/libreoffice/program/soffice.exe"
            executable.parent.mkdir(parents=True)
            executable.touch()
            with patch.dict("os.environ", {"CHIMERA_LIBREOFFICE_PATH": ""}), patch(
                "backend.app.render.__file__", str(root / "backend/app/render.py")
            ), patch("backend.app.render.shutil.which") as which:
                self.assertEqual(find_libreoffice(), str(executable.resolve()))
                which.assert_not_called()
