"""DARKROGUE Signal v0: consent-based, text-only feedback intake.

This module intentionally has no dependency on Chimera's project content.
Only allowlisted, short metadata fields are persisted. Do not send decks,
consultation text, URLs with query strings, stack traces, or credentials.
"""
import hashlib
import os
import sqlite3
import httpx
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from .storage import ROOT

router = APIRouter()
KINDS = {"problem", "confusing", "idea", "praise"}
_DB_NAME = "signal-reports.sqlite3"


class SignalReport(BaseModel):
    product: str = Field(min_length=2, max_length=32, pattern=r"^[a-zA-Z0-9_-]+$")
    kind: str = Field(pattern=r"^(problem|confusing|idea|praise)$")
    description: str = Field(min_length=10, max_length=4000)
    page: str | None = Field(default=None, max_length=160)
    version: str | None = Field(default=None, max_length=64)
    browser: str | None = Field(default=None, max_length=120)
    correlationId: str | None = Field(default=None, max_length=100)
    includeTechnicalContext: bool = False
    followUpRequested: bool = False
    # No email or free-form attachments until privacy and follow-up are implemented.


def _connection():
    root = Path(ROOT) / "signal"
    root.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(root / _DB_NAME, timeout=10)
    connection.execute("PRAGMA busy_timeout=10000")
    connection.execute("""
        CREATE TABLE IF NOT EXISTS reports (
            id TEXT PRIMARY KEY,
            created_at TEXT NOT NULL,
            product TEXT NOT NULL,
            kind TEXT NOT NULL,
            description TEXT NOT NULL,
            page TEXT,
            version TEXT,
            browser TEXT,
            correlation_id TEXT,
            follow_up_requested INTEGER NOT NULL DEFAULT 0,
            status TEXT NOT NULL DEFAULT 'new'
        )
    """)
    connection.execute("""
        CREATE TABLE IF NOT EXISTS intake_limits (
            requester_hash TEXT NOT NULL,
            hour_bucket TEXT NOT NULL,
            submissions INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY (requester_hash, hour_bucket)
        )
    """)
    return connection


@router.post("/api/signal/reports", status_code=201)
def submit_signal(report: SignalReport, request: Request):
    # JSON-only submissions plus same-origin checks limit casual cross-site abuse.
    origin = request.headers.get("origin")
    if origin:
        from urllib.parse import urlsplit
        incoming = urlsplit(origin)
        host = urlsplit(str(request.base_url))
        if incoming.netloc != request.headers.get("host", host.netloc):
            raise HTTPException(status_code=403, detail="Cross-origin feedback is not accepted")
    if report.product != "chimera":
        raise HTTPException(status_code=422, detail="Invalid reporting product")
    if report.followUpRequested:
        # Don't imply contact is possible until an authenticated reporter/consent
        # mechanism is connected.
        raise HTTPException(status_code=422, detail="Follow-up is not available yet")
    # Hosted opt-in: forward to the central DARKROGUE gateway, never from the browser.
    gateway = os.environ.get("SIGNAL_GATEWAY_URL", "").strip()
    gateway_secret = os.environ.get("SIGNAL_GATEWAY_SECRET", "")
    if gateway:
        from urllib.parse import urlsplit
        parsed = urlsplit(gateway)
        if (parsed.scheme != "https" or parsed.netloc != "darkrogue.io"
                or parsed.path != "/api/internal/signal/intake" or parsed.query or parsed.fragment
                or len(gateway_secret) < 32):
            raise HTTPException(status_code=503, detail="Signal gateway is not configured correctly")
        try:
            response = httpx.post(
                gateway,
                json=report.model_dump(exclude_none=True),
                headers={"Authorization": f"Bearer {gateway_secret}"},
                timeout=5.0,
                follow_redirects=False,
            )
            if response.status_code == 201:
                receipt = response.json()
                if isinstance(receipt, dict) and isinstance(receipt.get("id"), str):
                    return {"id": receipt["id"], "status": "received"}
            if response.status_code == 429:
                raise HTTPException(status_code=429, detail="Too many reports. Try again later.")
        except httpx.HTTPError:
            pass
        raise HTTPException(status_code=503, detail="Feedback service is unavailable; please retry later")
    now = datetime.now(timezone.utc)
    hour = now.strftime("%Y-%m-%dT%H")
    # Hash remote address with a deployment-specific secret; store no raw IP.
    # Configure SIGNAL_RATE_SALT on hosted deployments.
    salt = os.environ.get("SIGNAL_RATE_SALT", "local-signal-v0")
    remote = request.client.host if request.client else "unknown"
    requester = hashlib.sha256(f"{salt}:{remote}".encode()).hexdigest()
    record_id = "SIG-" + uuid4().hex[:12].upper()
    with _connection() as db:
        db.execute("BEGIN IMMEDIATE")
        db.execute("DELETE FROM intake_limits WHERE hour_bucket < ?", ((now.replace(hour=0).strftime("%Y-%m-%dT%H")),))
        count = db.execute(
            "SELECT submissions FROM intake_limits WHERE requester_hash=? AND hour_bucket=?",
            (requester, hour),
        ).fetchone()
        if count and count[0] >= 10:
            raise HTTPException(status_code=429, detail="Too many reports. Try again later.")
        db.execute(
            """INSERT INTO intake_limits(requester_hash,hour_bucket,submissions)
               VALUES(?,?,1) ON CONFLICT(requester_hash,hour_bucket)
               DO UPDATE SET submissions=submissions+1""",
            (requester, hour),
        )
        metadata = (report.page, report.version, report.browser, report.correlationId) if report.includeTechnicalContext else (None, None, None, None)
        db.execute(
            """INSERT INTO reports(id,created_at,product,kind,description,page,version,browser,correlation_id,follow_up_requested)
               VALUES(?,?,?,?,?,?,?,?,?,0)""",
            (record_id, now.isoformat(), report.product, report.kind,
             report.description.strip(), *metadata),
        )
    return {"id": record_id, "status": "received"}
