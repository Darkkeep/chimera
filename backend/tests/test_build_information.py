"""Build provenance must be explicit, validated and free of hidden repo/runtime inference."""
import os
from unittest import TestCase
from unittest.mock import patch

from backend.app.build_information import runtime_build_information


class BuildInformationTests(TestCase):
    def test_missing_deployment_metadata_is_unknown(self):
        with patch.dict(os.environ, {
            "CHIMERA_BUILD_SHA": "",
            "CHIMERA_BUILD_TIMESTAMP": "",
            "CHIMERA_FRONTEND_BUILD_SHA": "",
            "CHIMERA_FRONTEND_BUILD_TIMESTAMP": "",
            "CHIMERA_BUILD_ENVIRONMENT": "",
            "CHIMERA_PYTHIA_CONTRACT_VERSION": "",
        }):
            result = runtime_build_information()
        self.assertEqual(result["version"], "1.2.0")
        self.assertIsNone(result["backend"]["gitSha"])
        self.assertIsNone(result["frontend"]["gitSha"])
        self.assertIsNone(result["environment"])

    def test_supplied_build_identifiers_are_preserved(self):
        values = {
            "CHIMERA_BUILD_SHA": "AaBbCcD1234",
            "CHIMERA_BUILD_TIMESTAMP": "2026-11-17T18:30:00Z",
            "CHIMERA_FRONTEND_BUILD_SHA": "aabbccd1234",
            "CHIMERA_FRONTEND_BUILD_TIMESTAMP": "2026-11-17T18:32:00+00:00",
            "CHIMERA_BUILD_ENVIRONMENT": "staging",
            "CHIMERA_PYTHIA_CONTRACT_VERSION": "1.1.0",
        }
        with patch.dict(os.environ, values):
            result = runtime_build_information()
        self.assertEqual(result["backend"]["gitSha"], "aabbccd1234")
        self.assertEqual(result["backend"]["builtAt"], values["CHIMERA_BUILD_TIMESTAMP"])
        self.assertEqual(result["frontend"]["gitSha"], "aabbccd1234")
        self.assertEqual(result["environment"], "staging")

    def test_untrusted_values_are_never_reported(self):
        with patch.dict(os.environ, {
            "CHIMERA_BUILD_SHA": "not-a-git-hash",
            "CHIMERA_BUILD_TIMESTAMP": "yesterday",
            "CHIMERA_FRONTEND_BUILD_SHA": "secret=abcdef",
            "CHIMERA_FRONTEND_BUILD_TIMESTAMP": "2026-19-40T00:00:00Z",
            "CHIMERA_BUILD_ENVIRONMENT": "production\nTOKEN=secret",
            "CHIMERA_PYTHIA_CONTRACT_VERSION": "bad value",
        }):
            result = runtime_build_information()
        self.assertIsNone(result["backend"]["gitSha"])
        self.assertIsNone(result["backend"]["builtAt"])
        self.assertIsNone(result["frontend"]["gitSha"])
        self.assertIsNone(result["frontend"]["builtAt"])
        self.assertIsNone(result["environment"])
        self.assertIsNone(result["pythiaContractVersion"])
