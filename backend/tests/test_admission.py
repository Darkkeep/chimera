"""Regression checks for the fail-closed DARKROGUE admission store."""
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from app.admission import AdmissionStore
from app.password_auth import AccountStore


class AdmissionTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.store = AdmissionStore(self.root)

    def test_missing_record_denies_unapproved_user(self):
        with patch.object(AccountStore, "accounts", return_value=[
            {"id": "learner", "email": "learner@example.com", "roles": ["reviewer"], "disabled": False}
        ]):
            with patch.dict(os.environ, {"CHIMERA_FOUNDER_EMAIL": ""}):
                self.assertFalse(self.store.admitted("learner"))

    def test_allowlist_preprovision_and_revoke(self):
        self.store.set_approved("  LEARNER@example.com ", True)
        with patch.object(AccountStore, "accounts", return_value=[
            {"id": "learner", "email": "learner@example.com", "roles": ["reviewer"], "disabled": False}
        ]):
            with patch.dict(os.environ, {"CHIMERA_FOUNDER_EMAIL": ""}):
                self.assertTrue(self.store.admitted("learner"))
                self.store.set_approved("learner@example.com", False)
                self.assertFalse(self.store.admitted("learner"))

    def test_founder_requires_admin_role(self):
        with patch.dict(os.environ, {"CHIMERA_FOUNDER_EMAIL": "owner@example.com"}):
            with patch.object(AccountStore, "accounts", return_value=[
                {"id": "owner", "email": "owner@example.com", "roles": ["administrator"], "disabled": False}
            ]):
                self.assertTrue(self.store.admitted("owner"))
            with patch.object(AccountStore, "accounts", return_value=[
                {"id": "owner", "email": "owner@example.com", "roles": ["reviewer"], "disabled": False}
            ]):
                self.assertFalse(self.store.admitted("owner"))

    def test_disabled_user_denied_even_when_allowlisted(self):
        self.store.set_approved("person@example.com", True)
        with patch.object(AccountStore, "accounts", return_value=[
            {"id": "person", "email": "person@example.com", "roles": ["administrator"], "disabled": True}
        ]):
            with patch.dict(os.environ, {"CHIMERA_FOUNDER_EMAIL": "person@example.com"}):
                self.assertFalse(self.store.admitted("person"))


if __name__ == "__main__":
    unittest.main()
