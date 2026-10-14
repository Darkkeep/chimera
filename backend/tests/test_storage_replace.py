import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from backend.app import storage


class StorageReplaceTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.source = Path(temporary.name) / "draft.tmp"
        self.target = Path(temporary.name) / "storyboard.json"
        self.source.write_text("new")
        self.target.write_text("existing")

    def windows_error(self):
        error = PermissionError("temporarily busy")
        error.winerror = 32
        return error

    def test_transient_windows_lock_retries_atomic_replacement(self):
        original = Path.replace
        calls = []

        def replace(source, target):
            calls.append(source)
            if len(calls) < 3:
                self.assertEqual(self.target.read_text(), "existing")
                raise self.windows_error()
            return original(source, target)

        with patch.object(Path, "replace", replace), patch.object(storage.time, "sleep") as sleep:
            storage.replace_project_file(self.source, self.target)
        self.assertEqual(self.target.read_text(), "new")
        self.assertFalse(self.source.exists())
        self.assertEqual(sleep.call_count, 2)

    def test_persistent_windows_lock_is_bounded_and_preserves_files(self):
        with patch.object(Path, "replace", side_effect=self.windows_error()) as replace, patch.object(storage.time, "sleep"):
            with self.assertRaises(PermissionError):
                storage.replace_project_file(self.source, self.target)
        self.assertEqual(replace.call_count, 6)
        self.assertEqual(self.target.read_text(), "existing")
        self.assertEqual(self.source.read_text(), "new")

    def test_other_permission_errors_are_not_retried(self):
        with patch.object(Path, "replace", side_effect=PermissionError("denied")) as replace, patch.object(storage.time, "sleep") as sleep:
            with self.assertRaises(PermissionError):
                storage.replace_project_file(self.source, self.target)
        self.assertEqual(replace.call_count, 1)
        sleep.assert_not_called()
        self.assertEqual(self.target.read_text(), "existing")
