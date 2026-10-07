import hashlib
import json
import os
from contextlib import contextmanager
from contextvars import ContextVar
from pathlib import Path
from datetime import datetime, timedelta, timezone
from threading import RLock
from typing import Callable, Literal, Protocol
from uuid import uuid4

from pydantic import BaseModel, Field


DeploymentMode = Literal["single-user", "team"]
EventClass = Literal["security", "operational", "product"]
TrackingMode = Literal["disabled", "local", "centralized"]


class ActorContext(BaseModel):
    actorId: str = Field(min_length=1, max_length=120)
    actorDisplayName: str = Field(min_length=1, max_length=120)
    installationId: str = Field(min_length=1, max_length=120)
    deploymentMode: DeploymentMode


_request_actor: ContextVar[ActorContext | None] = ContextVar("request_actor", default=None)
_request_correlation: ContextVar[str | None] = ContextVar("request_correlation", default=None)


@contextmanager
def action_context(actor: ActorContext, correlation_id: str | None = None):
    actor_token = _request_actor.set(actor)
    correlation_token = _request_correlation.set(correlation_id or f"correlation-{uuid4().hex}")
    try:
        yield
    finally:
        _request_correlation.reset(correlation_token)
        _request_actor.reset(actor_token)


class PlatformEvent(BaseModel):
    eventId: str = Field(default_factory=lambda: f"event-{uuid4().hex}", min_length=1, max_length=120)
    eventName: str = Field(pattern=r"^[a-z][a-z0-9_.-]{1,119}$")
    eventVersion: int = Field(default=1, ge=1)
    occurredAt: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    installationId: str = Field(min_length=1, max_length=120)
    actorId: str | None = Field(default=None, max_length=120)
    actorDisplayName: str | None = Field(default=None, max_length=120)
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


def read_audit_events(root: Path, project_id: str | None = None, offset: int = 0, limit: int = 100, installation_id: str | None = None) -> AuditEventPage:
    events: list[PlatformEvent] = []
    if project_id and (Path(project_id).name != project_id or project_id in {".", ".."}):
        raise ValueError("Invalid project ID")
    project_roots = [root / "projects" / project_id] if project_id else sorted((root / "projects").glob("*"))
    if project_id is None:
        project_roots.append(root)
    for project_root in project_roots:
        DurableEventSink(project_root).enforce_retention()
        path = project_root / "audit" / "events.jsonl"
        if not path.is_file():
            continue
        for line in path.read_text(encoding="utf-8").splitlines():
            try:
                event = PlatformEvent.model_validate(json.loads(line))
                if installation_id is None or event.installationId == installation_id:
                    events.append(event)
            except (json.JSONDecodeError, ValueError):
                continue
    events.sort(key=lambda event: event.occurredAt, reverse=True)
    return AuditEventPage(events=events[offset:offset + limit], total=len(events), offset=offset, limit=limit)


class EventDeliveryPolicy(BaseModel):
    mode: TrackingMode = "local"
    endpoint: str | None = None
    maxAttempts: int = Field(default=5, ge=1, le=100)
    auditRetentionDays: int = Field(default=365, ge=1, le=3650)
    analyticsIdentity: Literal["project-and-user", "organization-anonymous"] = "organization-anonymous"
    retryBaseSeconds: float = Field(default=1, ge=0, le=3600)


def get_event_delivery_policy(root: Path | None = None) -> EventDeliveryPolicy:
    if root is not None:
        installation_root = root.parent.parent if root.parent.name == "projects" else root
        identity_path = installation_root / "identity" / "directory.json"
        if identity_path.is_file():
            from .identity import IdentitySnapshot
            policy = IdentitySnapshot.model_validate_json(identity_path.read_text(encoding="utf-8")).policy
            return EventDeliveryPolicy(mode=policy.trackingMode, auditRetentionDays=policy.auditRetentionDays,
                analyticsIdentity=policy.analyticsIdentity, endpoint=os.environ.get("CHIMERA_EVENT_TRACKING_URL"))
    mode = os.environ.get("CHIMERA_EVENT_TRACKING_MODE", "local")
    if mode not in {"disabled", "local", "centralized"}:
        mode = "local"
    return EventDeliveryPolicy(mode=mode, endpoint=os.environ.get("CHIMERA_EVENT_TRACKING_URL"))


_event_lock = RLock()
_event_locks: dict[str, RLock] = {}


@contextmanager
def event_transaction(root: Path):
    """Protect append/replace across threads and local worker processes."""
    with _event_lock:
        lock = _event_locks.setdefault(str(root.resolve()), RLock())
    with lock:
        root.mkdir(parents=True, exist_ok=True)
        with (root / ".events.lock").open("a+b") as lock_file:
            if os.fstat(lock_file.fileno()).st_size == 0:
                lock_file.write(b"0")
                lock_file.flush()
            lock_file.seek(0)
            if os.name == "nt":
                import msvcrt
                msvcrt.locking(lock_file.fileno(), msvcrt.LK_LOCK, 1)
            else:
                import fcntl
                fcntl.flock(lock_file.fileno(), fcntl.LOCK_EX)
            try:
                yield
            finally:
                lock_file.seek(0)
                if os.name == "nt":
                    msvcrt.locking(lock_file.fileno(), msvcrt.LK_UNLCK, 1)
                else:
                    fcntl.flock(lock_file.fileno(), fcntl.LOCK_UN)


SAFE_EVENT_METADATA = {"action", "method", "revision", "sourceRevision", "profile", "buildStatus", "decision", "role", "status", "attempts", "durationMs", "sizeBytes", "commentId", "sceneId", "replyId", "proposalId", "userId", "teamId", "assetId", "jobId"}
ANONYMOUS_EVENT_METADATA = {"action", "method", "profile", "buildStatus", "decision", "role", "status", "attempts", "durationMs", "sizeBytes"}


def _atomic_write(path: Path, content: str) -> None:
    temporary = path.with_name(f".{path.name}.{uuid4().hex}.tmp")
    try:
        with temporary.open("w", encoding="utf-8") as target:
            os.chmod(temporary, 0o600)
            target.write(content)
            target.flush()
            os.fsync(target.fileno())
        temporary.replace(path)
    finally:
        temporary.unlink(missing_ok=True)


class DurableEventSink:
    def __init__(self, root: Path, policy: EventDeliveryPolicy | None = None) -> None:
        self.root = root
        self.policy = policy or get_event_delivery_policy(root)

    def _audit_path(self) -> Path:
        return self.root / "audit" / "events.jsonl"

    def _queue_path(self) -> Path:
        return self.root / "audit" / "event-queue.jsonl"

    def record(self, event: PlatformEvent) -> None:
        if self.policy.mode == "disabled" and event.eventClass == "product":
            return
        metadata_keys = SAFE_EVENT_METADATA
        if event.eventClass == "product" and self.policy.analyticsIdentity == "organization-anonymous":
            metadata_keys = ANONYMOUS_EVENT_METADATA
            event = event.model_copy(update={"actorId": None, "actorDisplayName": None, "projectId": None, "correlationId": f"correlation-{uuid4().hex}"})
        event = event.model_copy(update={"metadata": {key: value for key, value in event.metadata.items() if key in metadata_keys}})
        with event_transaction(self.root):
            path = self._audit_path()
            path.parent.mkdir(parents=True, exist_ok=True)
            with path.open("a", encoding="utf-8") as event_file:
                os.chmod(path, 0o600)
                event_file.write(event.model_dump_json() + "\n")
                event_file.flush()
                os.fsync(event_file.fileno())
            if self.policy.mode == "centralized":
                with self._queue_path().open("a", encoding="utf-8") as queue_file:
                    os.chmod(self._queue_path(), 0o600)
                    queue_file.write(json.dumps({"attempts": 0, "event": event.model_dump(mode="json")}) + "\n")
                    queue_file.flush()
                    os.fsync(queue_file.fileno())
        self.enforce_retention()

    def enforce_retention(self, now: datetime | None = None) -> int:
        path = self._audit_path()
        if not path.is_file():
            return 0
        cutoff = (now or datetime.now(timezone.utc)) - timedelta(days=self.policy.auditRetentionDays)
        with event_transaction(self.root):
            original = path.read_text(encoding="utf-8").splitlines()
            retained = []
            for line in original:
                try:
                    if PlatformEvent.model_validate_json(line).occurredAt >= cutoff:
                        retained.append(line)
                except ValueError:
                    retained.append(line)
            if len(retained) != len(original):
                _atomic_write(path, "".join(line + "\n" for line in retained))
            return len(original) - len(retained)

    def flush(self, sender: Callable[[PlatformEvent], str | bool], now: datetime | None = None) -> int:
        queue_path = self._queue_path()
        if self.policy.mode != "centralized":
            return 0
        # Serialize flushes separately, but do not block record() during network I/O.
        with event_transaction(self.root / "audit" / "delivery"):
            claim = queue_path.with_name("event-inflight.jsonl")
            with event_transaction(self.root):
                if not claim.is_file():
                    if not queue_path.is_file():
                        return 0
                    queue_path.replace(claim)
            delivered, remaining, exhausted = 0, [], []
            current_time = now or datetime.now(timezone.utc)
            for line in claim.read_text(encoding="utf-8").splitlines():
                item = json.loads(line)
                event = PlatformEvent.model_validate(item["event"])
                if item.get("nextAttemptAt") and datetime.fromisoformat(item["nextAttemptAt"]) > current_time:
                    remaining.append(json.dumps(item))
                    continue
                try:
                    receipt = sender(event)
                except Exception:
                    receipt = False
                # Acknowledgment must identify the event, not merely report HTTP success.
                if isinstance(receipt, str) and receipt == event.eventId:
                    delivered += 1
                    continue
                item["attempts"] += 1
                item["nextAttemptAt"] = (current_time + timedelta(seconds=min(3600, self.policy.retryBaseSeconds * 2 ** (item["attempts"] - 1)))).isoformat()
                (remaining if item["attempts"] < self.policy.maxAttempts else exhausted).append(json.dumps(item))
            with event_transaction(self.root):
                existing = queue_path.read_text(encoding="utf-8") if queue_path.is_file() else ""
                if existing or remaining:
                    _atomic_write(queue_path, existing + "".join(line + "\n" for line in remaining))
                else:
                    queue_path.unlink(missing_ok=True)
                if exhausted:
                    dead = queue_path.with_name("event-dead-letter.jsonl")
                    old = dead.read_text(encoding="utf-8") if dead.is_file() else ""
                    _atomic_write(dead, old + "".join(line + "\n" for line in exhausted))
                claim.unlink(missing_ok=True)
            return delivered

    def retry_exhausted(self) -> int:
        dead = self._queue_path().with_name("event-dead-letter.jsonl")
        with event_transaction(self.root):
            if not dead.is_file():
                return 0
            items = [json.loads(line) for line in dead.read_text(encoding="utf-8").splitlines()]
            queue = self._queue_path()
            old = queue.read_text(encoding="utf-8") if queue.is_file() else ""
            _atomic_write(queue, old + "".join(json.dumps({"attempts": 0, "event": item["event"]}) + "\n" for item in items))
            dead.unlink()
            return len(items)


class IdempotentEventReceiver:
    """Durable receipt storage for a collector adapter; transport authentication is external."""
    def __init__(self, root: Path) -> None:
        self.root = root

    def accept(self, event: PlatformEvent) -> str:
        with event_transaction(self.root):
            key = hashlib.sha256(event.eventId.encode()).hexdigest()
            path = self.root / f"{key}.json"
            content = event.model_dump_json()
            if path.is_file():
                if path.read_text(encoding="utf-8") != content:
                    raise ValueError("Event ID reused with different payload")
            else:
                _atomic_write(path, content)
        return event.eventId


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
    return _request_actor.get() or LOCAL_ACTOR


def get_correlation_id() -> str:
    return _request_correlation.get() or f"correlation-{uuid4().hex}"
