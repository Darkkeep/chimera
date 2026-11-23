import os
import unittest
from unittest.mock import patch

from backend.app.deployment import cors_origins


class LocalOriginTests(unittest.TestCase):
    def test_canonical_frontend_is_allowed_only_in_explicit_local_profile(self):
        with patch.dict(os.environ, {"CHIMERA_DEPLOYMENT_PROFILE": "local"}):
            self.assertIn("http://127.0.0.1:5175", cors_origins())
            self.assertIn("http://localhost:5175", cors_origins())
            self.assertNotIn("http://untrusted.example:5175", cors_origins())
            self.assertNotIn("http://127.0.0.1:5187", cors_origins())
        with patch.dict(os.environ, {}, clear=True):
            self.assertNotIn("http://127.0.0.1:5175", cors_origins())

    def test_hosted_profiles_do_not_inherit_local_origins(self):
        for profile in ("networked", "darkrogue"):
            with self.subTest(profile=profile), patch.dict(os.environ, {
                "CHIMERA_DEPLOYMENT_PROFILE": profile,
                "CHIMERA_PUBLIC_ORIGIN": "https://chimera.example",
            }):
                self.assertEqual(cors_origins(), ["https://chimera.example"])
