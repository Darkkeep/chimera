"""Contract tests for the first Signal intake endpoint."""
import sqlite3
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend.app import signal


class SignalIntakeTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root_patch = patch.object(signal, "ROOT", Path(self.temp.name))
        self.root_patch.start()
        app = FastAPI()
        app.include_router(signal.router)
        self.client = TestClient(app)
        self.body = {"product": "chimera", "kind": "problem",
                     "description": "My SCORM export did not complete."}

    def tearDown(self):
        self.client.close()
        self.root_patch.stop()
        self.temp.cleanup()

    def test_submission_returns_receipt_and_persists_without_technical_context(self):
        response = self.client.post("/api/signal/reports", json={
            **self.body, "page": "/private/project", "browser": "Browser",
            "includeTechnicalContext": False,
        })
        self.assertEqual(response.status_code, 201, response.text)
        self.assertTrue(response.json()["id"].startswith("SIG-"))
        with sqlite3.connect(Path(self.temp.name) / "signal" / "signal-reports.sqlite3") as db:
            rows = db.execute("SELECT description,page,browser,status FROM reports").fetchall()
        self.assertEqual(rows, [(self.body["description"], None, None, "new")])

    def test_explicit_metadata_consent(self):
        response = self.client.post("/api/signal/reports", json={
            **self.body, "page": "/editor", "browser": "Browser",
            "includeTechnicalContext": True,
        })
        self.assertEqual(response.status_code, 201)
        with sqlite3.connect(Path(self.temp.name) / "signal" / "signal-reports.sqlite3") as db:
            stored = db.execute("SELECT page,browser FROM reports").fetchone()
        self.assertEqual(stored, ("/editor", "Browser"))

    def test_bad_payload_rejected(self):
        response = self.client.post("/api/signal/reports", json={**self.body, "description": "short"})
        self.assertEqual(response.status_code, 422)

    def test_cross_origin_rejected(self):
        response = self.client.post("/api/signal/reports", json=self.body,
                                    headers={"Origin": "https://other.example"})
        self.assertEqual(response.status_code, 403)

    def test_anonymous_rate_limit(self):
        statuses = [self.client.post("/api/signal/reports", json=self.body).status_code for _ in range(11)]
        self.assertEqual(statuses, [201] * 10 + [429])

    def test_follow_up_not_offered_until_supported(self):
        response = self.client.post("/api/signal/reports", json={
            **self.body, "followUpRequested": True,
        })
        self.assertEqual(response.status_code, 422)


if __name__ == "__main__":
    unittest.main()
