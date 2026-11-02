import json
from pathlib import Path
import shutil
import subprocess
import unittest

from backend.app.scorm import PLAYER_JS, _scorm_12_player


class ScormTrackingTests(unittest.TestCase):
    def test_scaled_score_is_only_written_in_scorm_2004(self):
        self.assertIn('call("SetValue", ["cmi.score.scaled"', PLAYER_JS)
        self.assertNotIn('cmi.score.scaled', _scorm_12_player())
        self.assertNotIn('cmi.core.score.scaled', _scorm_12_player())

    @unittest.skipUnless(shutil.which("node"), "Node.js required")
    def test_popup_tracking_resume_and_rejected_calls(self):
        result = subprocess.run(
            [shutil.which("node") or "node", str(Path(__file__).with_name("scorm_tracking_runtime.cjs"))],
            input=json.dumps({"2004": PLAYER_JS, "12": _scorm_12_player()}),
            text=True, capture_output=True, check=True,
        )
        self.assertIn("Both profiles", result.stdout)