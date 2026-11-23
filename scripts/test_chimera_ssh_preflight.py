"""Offline contract checks for the read-only Chimera SSH preflight."""
from __future__ import annotations

import importlib.util
from io import StringIO
from pathlib import Path
from unittest import TestCase, main, mock
import contextlib
import subprocess
import sys

SCRIPT = Path(__file__).with_name("chimera-ssh-preflight.py")
spec = importlib.util.spec_from_file_location("chimera_ssh_preflight", SCRIPT)
probe = importlib.util.module_from_spec(spec)
assert spec and spec.loader
spec.loader.exec_module(probe)

class ChimeraPreflightTests(TestCase):
    def call(self, argv, result):
        output, errors = StringIO(), StringIO()
        with mock.patch.object(sys, "argv", ["chimera-ssh-preflight.py", *argv]), \
             mock.patch.object(probe.subprocess, "run", return_value=result) as runner, \
             contextlib.redirect_stdout(output), contextlib.redirect_stderr(errors):
            code = probe.main()
        return code, output.getvalue(), errors.getvalue(), runner

    def test_success_is_noninteractive_read_only_and_strict_host_key(self):
        response = subprocess.CompletedProcess([], 0,
            "=== CHIMERA READ-ONLY PREFLIGHT ===\nservice_active: active\ninspection_complete: yes\n", "")
        code, output, errors, runner = self.call(["chimera-prod", "--json"], response)
        self.assertEqual(code, 0)
        self.assertIn('"service_active": "active"', output)
        args, kwargs = runner.call_args
        self.assertIn("BatchMode=yes", args[0])
        self.assertIn("StrictHostKeyChecking=yes", args[0])
        self.assertIn("NumberOfPasswordPrompts=0", args[0])
        self.assertEqual(args[0][-1], "chimera-networked.service")
        self.assertIn("set -eu", kwargs["input"])
        self.assertNotIn("sudo ", kwargs["input"])
        self.assertEqual(errors, "")

    def test_error_does_not_disclose_ssh_stderr(self):
        response = subprocess.CompletedProcess([], 255, "", "operator@example: private diagnostic")
        code, output, errors, _ = self.call(["chimera-prod"], response)
        self.assertEqual(code, 2)
        self.assertEqual(output, "")
        self.assertNotIn("operator@example", errors)

    def test_incomplete_response_fails_closed(self):
        response = subprocess.CompletedProcess([], 0, "service_active: active\n", "")
        code, _, errors, _ = self.call(["chimera-prod"], response)
        self.assertEqual(code, 2)
        self.assertIn("incomplete", errors)

    def test_invalid_service_name_rejected_before_ssh(self):
        with mock.patch.object(sys, "argv",
            ["chimera-ssh-preflight.py", "chimera-prod", "--service", "other;evil.service"]), \
             mock.patch.object(probe.subprocess, "run") as runner, \
             contextlib.redirect_stderr(StringIO()):
            with self.assertRaises(SystemExit):
                probe.main()
        runner.assert_not_called()

if __name__ == "__main__":
    main()
