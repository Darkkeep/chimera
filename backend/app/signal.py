"""DARKROGUE Signal v0: consent-based, text-only feedback intake.

This module intentionally has no dependency on Chimera's project content.
Only allowlisted, short metadata fields are persisted. Do not send decks,
consultation text, URLs with query strings, stack traces, or credentials.
"""
import hashlib
import os
import sqlite3
from urllib.parse import urlsplit

import httpx
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field, field_validator

from .storage import ROOT

router = APIRouter()
_DB_NAME = "signal-reports.sqlite3"


class SignalReport(BaseModel):
    model_config = ConfigDict(extra="forbid")

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

    @field_validator("description")
    @classmethod
    def description_must_contain_text(cls, value: str) -> str:
        value = value.strip()
        if len(value) < 10:
            raise ValueError("Describe what happened using at least ten characters")
        return value

    @field_validator("page")
    @classmethod
    def page_is_path_only(cls, value: str | None) -> str | None:
        if value is not None and (not value.startswith("/") or "?" in value or "#" in value):
            raise ValueError("Page must be a pathname without query or fragment")
        return value


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
    # Browser Origin and Fetch Metadata checks. Native/local clients may omit Origin.
    if request.headers.get("sec-fetch-site") in {"cross-site", "same-site"}:
        raise HTTPException(status_code=403, detail="Cross-origin feedback is not accepted")
    origin = request.headers.get("origin")
    if origin:
        parsed_origin = urlsplit(origin)
        host = request.headers.get("host", "")
        if (parsed_origin.scheme not in {"https", "http"} or
                origin != f"{parsed_origin.scheme}://{host}" or
                parsed_origin.username or parsed_origin.password):
            raise HTTPException(status_code=403, detail="Cross-origin feedback is not accepted")
    if request.headers.get("content-type", "").split(";", 1)[0].strip().lower() != "application/json":
        raise HTTPException(status_code=415, detail="Feedback must be sent as JSON")
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
        parsed = urlsplit(gateway)
        # An explicitly configured DARKROGUE staging host is allowed, never arbitrary URLs.
        allowed_host = os.environ.get("SIGNAL_GATEWAY_HOST", "darkrogue.io").strip().lower()
        if (not allowed_host or
                (allowed_host != "darkrogue.io" and not allowed_host.endswith(".darkrogue.io")) or
                parsed.scheme != "https" or parsed.netloc != allowed_host
                or parsed.path != "/api/internal/signal/intake" or parsed.query or parsed.fragment
                or len(gateway_secret) < 32):
            raise HTTPException(status_code=503, detail="Signal gateway is not configured correctly")
        try:
            response = httpx.post(
                gateway,
                json={
                    **report.model_dump(exclude_none=True, exclude={
                        "followUpRequested", "page", "version", "browser", "correlationId",
                    }),
                    **(report.model_dump(
                        include={"page", "version", "browser", "correlationId"},
                        exclude_none=True,
                    ) if report.includeTechnicalContext else {}),
                },
                headers={"Authorization": f"Bearer {gateway_secret}"},
                timeout=5.0,
                follow_redirects=False,
            )
            if response.status_code == 201:
                receipt = response.json()
                if (isinstance(receipt, dict) and isinstance(receipt.get("id"), str)
                        and receipt["id"].startswith("SIG-") and len(receipt["id"]) <= 32):
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
