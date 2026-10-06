import json
import os
from pathlib import Path
from datetime import datetime, timezone
from typing import Callable, Literal, Protocol
from uuid import uuid4
from contextvars import ContextVar

from pydantic import BaseModel, Field


DeploymentMode = Literal["single-user", "team"]
EventClass = Literal["security", "operational", "product"]
TrackingMode = Literal["disabled", "local", "centralized"]


class ActorContext(BaseModel):
    actorId: str = Field(min_length=1, max_length=120)
    actorDisplayName: str = Field(min_length=1, max_length=120)
    installationId: str = Field(min_length=1, max_length=120)
    deploymentMode: DeploymentMode


class PlatformEvent(BaseModel):
    eventId: str = Field(default_factory=lambda: f"event-{uuid4().hex}", min_length=1, max_length=120)
    eventName: str = Field(pattern=r"^[a-z][a-z0-9_.-]{1,119}$")
    eventVersion: int = Field(default=1, ge=1)
    occurredAt: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    installationId: str = Field(min_length=1, max_length=120)
    actorId: str | None = Field(default=None, max_length=120)
    projectId: str | None = Field(default=None, max_length=120)
    correlationId: str = Field(default_factory=lambda: f"correlation-{uuid4().hex}", min_length=1, max_length=120)
    deploymentMode: DeploymentMode
    eventClass: EventClass = "operational"
    metadata: dict[str, str | int | float | bool | None] = Field(default_factory=dict)


class AuditEventPage(BaseModel):
    events: list[PlatformEvent] = Field(default_factory=list)
    total: int = 0
    offset: int = 0
    limit: int = 100


def read_audit_events(root: Path, project_id: str | None = None, offset: int = 0, limit: int = 100) -> AuditEventPage:
    events: list[PlatformEvent] = []
    project_roots = [root / "projects" / project_id] if project_id else [root, *sorted((root / "projects").glob("*"))]
    for project_root in project_roots:
        path = project_root / "audit" / "events.jsonl"
        if not path.is_file():
            continue
        for line in path.read_text(encoding="utf-8").splitlines():
            try:
                events.append(PlatformEvent.model_validate(json.loads(line)))
            except (json.JSONDecodeError, ValueError):
                continue
    events.sort(key=lambda event: event.occurredAt, reverse=True)
    return AuditEventPage(events=events[offset:offset + limit], total=len(events), offset=offset, limit=limit)


class EventDeliveryPolicy(BaseModel):
    mode: TrackingMode = "local"
    endpoint: str | None = None
    maxAttempts: int = Field(default=5, ge=1, le=100)


def get_event_delivery_policy() -> EventDeliveryPolicy:
    mode = os.environ.get("CHIMERA_EVENT_TRACKING_MODE", "local")
    if mode not in {"disabled", "local", "centralized"}:
        mode = "local"
    return EventDeliveryPolicy(mode=mode, endpoint=os.environ.get("CHIMERA_EVENT_TRACKING_URL"))


class DurableEventSink:
    def __init__(self, root: Path, policy: EventDeliveryPolicy | None = None) -> None:
        self.root = root
        self.policy = policy or get_event_delivery_policy()

    def _audit_path(self) -> Path:
        return self.root / "audit" / "events.jsonl"

    def _queue_path(self) -> Path:
        return self.root / "audit" / "event-queue.jsonl"

    def record(self, event: PlatformEvent) -> None:
        if self.policy.mode == "disabled" and event.eventClass == "product":
            return
        path = self._audit_path()
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("a", encoding="utf-8") as event_file:
            event_file.write(event.model_dump_json() + "\n")
        if self.policy.mode == "centralized":
            queue_path = self._queue_path()
            with queue_path.open("a", encoding="utf-8") as queue_file:
                queue_file.write(json.dumps({"attempts": 0, "event": event.model_dump(mode="json")}) + "\n")

    def flush(self, sender: Callable[[PlatformEvent], bool]) -> int:
        queue_path = self._queue_path()
        if self.policy.mode != "centralized" or not queue_path.is_file():
            return 0
        delivered = 0
        remaining: list[str] = []
        for line in queue_path.read_text(encoding="utf-8").splitlines():
            item = json.loads(line)
            event = PlatformEvent.model_validate(item["event"])
            try:
                sent = sender(event)
            except Exception:
                sent = False
            if sent:
                delivered += 1
                continue
            item["attempts"] += 1
            if item["attempts"] < self.policy.maxAttempts:
                remaining.append(json.dumps(item))
        if remaining:
            queue_path.write_text("\n".join(remaining) + "\n", encoding="utf-8")
        else:
            queue_path.unlink(missing_ok=True)
        return delivered


class AuthorizationPolicy(Protocol):
    def allows(self, context: ActorContext, action: str, project_id: str | None = None) -> bool:
        ...


class EventSink(Protocol):
    def record(self, event: PlatformEvent) -> None:
        ...


class LocalSingleUserPolicy:
    def allows(self, context: ActorContext, action: str, project_id: str | None = None) -> bool:
        return context.deploymentMode == "single-user"


def get_authorization_policy() -> LocalSingleUserPolicy:
    return LocalSingleUserPolicy()


class LocalEventSink:
    def __init__(self) -> None:
        self.events: list[PlatformEvent] = []

    def record(self, event: PlatformEvent) -> None:
        self.events.append(event)


LOCAL_ACTOR = ActorContext(
    actorId="local-user",
    actorDisplayName="Local user",
    installationId="local-installation",
    deploymentMode="single-user",
)

REQUEST_ACTOR: ContextVar[ActorContext] = ContextVar("chimera_request_actor", default=LOCAL_ACTOR)


def get_actor_context() -> ActorContext:
    return REQUEST_ACTOR.get()
