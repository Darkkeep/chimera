"""Local, no-billing progressive producer. Never calls a Pythia provider.

The durable proposal/event document is separate from storyboard.json. Polling
only reads it; it never advances the producer or reissues generation.
"""
from contextvars import copy_context
import hashlib
import json
import os
from pathlib import Path
import re
import threading
import time
from typing import Literal
from uuid import uuid4

from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict, Field, ValidationError, model_validator

from . import storage
from .models import Scene, SceneCreate
from .authoring import native_layout
from .platform import get_actor_context

MAX_JOBS = 8
MAX_EVENTS = 64
RUN_ID = uuid4().hex


class DraftScene(SceneCreate):
    model_config = ConfigDict(extra="forbid")
    sceneType: Literal["content"] = "content"
    layoutMode: Literal["native"] = "native"
    extractedText: list[str] = Field(min_length=1, max_length=20)
    templateId: None = None
    assessmentItem: None = None
    assessmentSettings: None = None

    @model_validator(mode="after")
    def complete_scene(self):
        if not self.title.strip() or any(not text.strip() or len(text) > 5000 for text in self.extractedText):
            raise ValueError("A complete content scene is required")
        Scene.model_validate({**self.model_dump(), "id": "validated-draft"})
        return self


class Provenance(BaseModel):
    model_config = ConfigDict(extra="forbid")
    producer: Literal["deterministic-fixture-v1"] = "deterministic-fixture-v1"
    sourceIds: list[str] = Field(default_factory=list, max_length=0)
    locators: list[str] = Field(default_factory=lambda: ["synthetic:inspection-basics"])


class ComponentEvent(BaseModel):
    model_config = ConfigDict(extra="forbid")
    schemaVersion: Literal[1] = 1
    eventId: str
    jobId: str
    projectId: str
    sourceRevision: int = Field(ge=1)
    projectRevision: int = Field(ge=1)
    sequence: int = Field(ge=1)
    type: Literal["job.started", "component.ready", "component.failed", "component.accepted",
                  "component.rejected", "job.completed", "job.cancelled", "job.failed"]
    status: Literal["running", "proposed", "failed", "accepted", "rejected", "completed", "cancelled"]
    componentId: str | None = None
    componentRevision: int = 1
    orderHint: int | None = None
    payload: DraftScene | None = None
    provenance: Provenance = Field(default_factory=Provenance)

    @model_validator(mode="after")
    def envelope(self):
        if self.eventId != f"{self.jobId}:{self.sequence}":
            raise ValueError("Event cursor does not match its sequence")
        if self.type == "component.ready" and (not self.componentId or self.payload is None or self.status != "proposed"):
            raise ValueError("Ready event requires a validated proposal")
        return self


class Decision(BaseModel):
    model_config = ConfigDict(extra="forbid")
    decision: Literal["accept", "reject"]


def require_demo():
    if os.environ.get("CHIMERA_PROGRESSIVE_DEMO") != "true" or get_actor_context().deploymentMode != "single-user":
        raise HTTPException(404, "Local progressive demonstration is disabled")


def _directory(project_id):
    if not re.fullmatch(r"[a-zA-Z0-9_-]{1,120}", project_id):
        raise HTTPException(404, "Project not found")
    storage.read_project(project_id)
    return storage.project_path(project_id) / "progressive-proposals"


def _path(project_id, job_id):
    if not re.fullmatch(r"[a-f0-9]{32}", job_id):
        raise HTTPException(404, "Job not found")
    return _directory(project_id) / f"{job_id}.json"


def _read(project_id, job_id, actor_id):
    path = _path(project_id, job_id)
    if not path.is_file():
        raise HTTPException(404, "Job not found")
    job = json.loads(path.read_text(encoding="utf-8"))
    if job["actorId"] != actor_id:
        raise HTTPException(403, "This proposal belongs to another author")
    return job


def _write(job):
    path = _path(job["projectId"], job["jobId"])
    path.parent.mkdir(parents=True, exist_ok=True)
    pending = path.with_suffix(".tmp")
    pending.write_text(json.dumps(job, ensure_ascii=False), encoding="utf-8")
    pending.replace(path)


def _event(job, event_type, status, component_id=None, payload=None, order=None):
    sequence = len(job["events"]) + 1
    if sequence > MAX_EVENTS:
        raise ValueError("Event retention limit reached")
    event = ComponentEvent(jobId=job["jobId"], projectId=job["projectId"],
        sourceRevision=job["sourceRevision"], projectRevision=job["projectRevision"],
        eventId=f'{job["jobId"]}:{sequence}', sequence=sequence, type=event_type,
        status=status, componentId=component_id, payload=payload, orderHint=order)
    job["events"].append(event.model_dump())


def _check_revision(job):
    actual = storage.read_project(job["projectId"]).storyboard.revision
    if actual != job["projectRevision"]:
        raise storage.StoryboardRevisionConflict(job["projectRevision"], actual)


def submit(project_id, revision, actor_id):
    with storage.storyboard_transaction():
        directory = _directory(project_id)
        if len(list(directory.glob("*.json"))) >= MAX_JOBS:
            raise HTTPException(429, "Local demo retains at most eight jobs per project; use a new synthetic project")
        current = storage.read_project(project_id).storyboard.revision
        if current != revision:
            raise storage.StoryboardRevisionConflict(revision, current)
        job = {"jobId": uuid4().hex, "projectId": project_id, "actorId": actor_id, "runId": RUN_ID,
               "sourceRevision": revision, "projectRevision": revision, "status": "running",
               "components": {}, "events": []}
        _event(job, "job.started", "running")
        _write(job)
        return job


def emit_scene(project_id, job_id, actor_id, component_id, payload, order, authorize):
    with storage.storyboard_transaction():
        authorize()
        job = _read(project_id, job_id, actor_id)
        if job["status"] != "running":
            return False
        _check_revision(job)
        # An event retry is idempotent; a different payload cannot revise a reviewed draft.
        digest = hashlib.sha256(json.dumps(payload, sort_keys=True).encode()).hexdigest()
        previous = job["components"].get(component_id)
        if previous:
            if previous["digest"] != digest:
                raise ValueError("A delivered component cannot be overwritten")
            return True
        try:
            scene = DraftScene.model_validate(payload)
        except ValidationError:
            job["components"][component_id] = {"status": "failed", "digest": digest, "orderHint": order}
            _event(job, "component.failed", "failed", component_id, order=order)
        else:
            job["components"][component_id] = {"status": "proposed", "payload": scene.model_dump(),
                                               "digest": digest, "orderHint": order}
            _event(job, "component.ready", "proposed", component_id, scene, order)
        _write(job)
        return True


def finish(project_id, job_id, actor_id, status, authorize):
    with storage.storyboard_transaction():
        authorize()
        job = _read(project_id, job_id, actor_id)
        if job["status"] == "running":
            job["status"] = status
            _event(job, f"job.{status}", status)
            _write(job)
        return job


def page(project_id, job_id, actor_id, cursor=0):
    with storage.storyboard_transaction():
        job = _read(project_id, job_id, actor_id)
        if cursor < 0 or cursor > len(job["events"]):
            raise HTTPException(409, "Invalid resume cursor")
        return {"schemaVersion": 1, "jobId": job_id, "projectId": project_id,
                "sourceRevision": job["sourceRevision"], "projectRevision": job["projectRevision"],
                "status": job["status"], "cursor": len(job["events"]),
                "events": job["events"][cursor:], "pollAfterMs": 500}


def decide(project_id, job_id, component_id, actor_id, decision, revision):
    with storage.storyboard_transaction():
        job = _read(project_id, job_id, actor_id)
        component = job["components"].get(component_id)
        if not component:
            raise HTTPException(404, "Component not found")
        target = "accepted" if decision == "accept" else "rejected"
        if component["status"] == target:
            return storage.read_project(project_id)  # duplicate delivery/decision is safe
        if component["status"] != "proposed":
            raise HTTPException(409, "This component has already been reviewed or failed")
        project = storage.read_project(project_id)
        if decision == "accept":
            if job["status"] in {"cancelled", "failed"}:
                raise HTTPException(409, "This job is no longer eligible for acceptance")
            # Stable canonical identity recovers an interrupted accept without a second
            # insertion or rewriting a scene the author subsequently edited.
            scene_id = f"progressive-{job_id}-{component_id}"
            if not any(scene.id == scene_id for scene in project.storyboard.scenes):
                _check_revision(job)
                if revision != project.storyboard.revision:
                    raise storage.StoryboardRevisionConflict(revision, project.storyboard.revision)
                draft = DraftScene.model_validate(component["payload"])
                scene = Scene(id=scene_id, **draft.model_dump())
                scene.visualLayout = native_layout(scene)
                storage.write_storyboard(storage.project_path(project_id), project.storyboard.model_copy(
                    update={"scenes": [*project.storyboard.scenes, scene]}), revision)
                project = storage.read_project(project_id)
            storage.write_project_metadata(storage.project_path(project_id),
                {"id": project_id, "title": project.title, "updatedAt": storage.now_iso()})
            project = storage.read_project(project_id)
            job["projectRevision"] = project.storyboard.revision
        component["status"] = target
        _event(job, f"component.{target}", target, component_id)
        _write(job)
        return project


def start(project_id, job_id, actor_id, authorize, wait=None):
    # A complete fixture scene is produced first; there is no completed batch to split.
    # The interruptible pause makes the early-result state inspectable in Studio.
    def run():
        try:
            for index, (title, text) in enumerate([
                ("Inspect before use", "Check the equipment for visible damage before use."),
                ("Respond to a defect", "Stop and report damaged equipment before continuing."),
            ]):
                if not emit_scene(project_id, job_id, actor_id, f"scene-{index + 1}",
                                  {"title": title, "extractedText": [text]}, index, authorize):
                    return
                if index == 0:
                    if wait:
                        wait()
                    else:
                        deadline = time.monotonic() + 10
                        while time.monotonic() < deadline:
                            threading.Event().wait(min(0.25, max(0, deadline - time.monotonic())))
                            authorize()
                            if page(project_id, job_id, actor_id)["status"] != "running":
                                return
            finish(project_id, job_id, actor_id, "completed", authorize)
        except Exception:
            # A failed permission check must not permit another component delivery.
            # Record terminal failure without leaking remote errors or content.
            with storage.storyboard_transaction():
                job = _read(project_id, job_id, actor_id)
                if job["status"] == "running":
                    job["status"] = "failed"
                    _event(job, "job.failed", "failed")
                    _write(job)
    thread = threading.Thread(target=copy_context().run, args=(run,), daemon=True)
    thread.start()
    return thread


def recover():
    """A process restart terminates unfinished fixture jobs; never restarts generation."""
    if os.environ.get("CHIMERA_PROGRESSIVE_DEMO") != "true":
        return
    with storage.storyboard_transaction():
        for path in storage.PROJECTS.glob("*/progressive-proposals/*.json"):
            try:
                job = json.loads(path.read_text(encoding="utf-8"))
                if job["status"] == "running" and job.get("runId") != RUN_ID:
                    job["status"] = "failed"
                    _event(job, "job.failed", "failed")
                    _write(job)
            except (OSError, ValueError, KeyError, TypeError):
                # One corrupt local demonstration must not prevent ordinary authoring.
                # It remains unavailable; do not regenerate or silently replace it.
                continue
