"""Opt-in public conversation candidate transport; no task or live-model fallback.

All dependencies are server configuration, not values accepted from a browser.
The explicit contracts root must contain trusted, reviewed public candidate code.
"""
import hashlib
import json
from pathlib import Path
import re
from typing import Callable
from types import ModuleType
from urllib.parse import urlsplit

import httpx
from jsonschema import Draft202012Validator
from referencing import Registry, Resource

from .conversation_boundary import (
    AuthoringBinding, Authorize, validate_advice_return, validate_candidate_authoring_scope,
)


class ConversationClientError(RuntimeError):
    def __init__(self, message: str, status_code: int | None = None):
        super().__init__(message)
        self.status_code = status_code


class PublicConversationContract:
    """Load explicitly configured public schemas and executable semantics.

    No implicit sibling checkout, vendor replacement or engine-private import.
    """
    # Reviewed 1.2.0 candidate e801445. Normalize checkout CRLF only; semantic
    # whitespace/content drift still fails before loading executable public code.
    CONTENT_PINS = {
        "schemas/conversation-turn-request.schema.json": "78d4d573c59643d9d6b40832569f678dbee4f236427c8ca20dede582b798199c",
        "schemas/conversation-operation.schema.json": "76ed50a626989c8e258d108d58b9b9d9c96f21a21061871c0dd7ee54cb02c1b4",
        "scripts/conversation_semantics.py": "8da99fefa5fc77abcd4b14a305218179c442c7c81439b05f4292c26e391d3655",
    }

    def __init__(self, root: Path):
        root = Path(root)
        checked = {}
        for relative, expected in self.CONTENT_PINS.items():
            raw = (root / relative).read_bytes().replace(b"\r\n", b"\n")
            if hashlib.sha256(raw).hexdigest() != expected:
                raise ValueError("Public conversation candidate content pin mismatch")
            checked[relative] = raw
        self.validators = {}
        registry = Registry()
        schemas = {}
        for name in ("conversation-turn-request", "conversation-operation"):
            schema = json.loads(checked[f"schemas/{name}.schema.json"])
            Draft202012Validator.check_schema(schema)
            schemas[name] = schema
            registry = registry.with_resource(schema["$id"], Resource.from_contents(schema))
        self.validators = {name: Draft202012Validator(schema, registry=registry)
                           for name, schema in schemas.items()}
        self.semantics = ModuleType("chimera_public_conversation_semantics")
        # Execute verified public source bytes directly, never an unchecked .pyc.
        exec(compile(checked["scripts/conversation_semantics.py"],
                     str(root / "scripts/conversation_semantics.py"), "exec"),
             self.semantics.__dict__)

    def request(self, value: dict) -> tuple[dict, bytes]:
        try:
            raw = self.semantics.canonical_bytes(value)
            snapshot = self.semantics.strict_loads(raw)
            self.validators["conversation-turn-request"].validate(snapshot)
            if self.semantics.request_errors(snapshot):
                raise ValueError("invalid request semantics")
            return snapshot, raw
        except Exception:
            raise ConversationClientError("Invalid conversation candidate request") from None

    def operation(self, raw: bytes, request: dict) -> dict:
        try:
            value = self.semantics.strict_loads(raw)
            self.validators["conversation-operation"].validate(value)
            if self.semantics.operation_errors(value, request):
                raise ValueError("invalid operation semantics")
            return value
        except Exception:
            raise ConversationClientError("Invalid conversation candidate response") from None


# Called only after local current access checks, by trusted server-side code.
# Arguments: action, scope, request digest (submit only), operation ID (read/cancel),
# deduplicated immutable original source hashes. Returns a short-lived access JWT.
IssueAccess = Callable[[str, dict, str | None, str | None, list[str]], str]


def _header(value: str) -> str:
    if not isinstance(value, str) or not value or any(ord(c) <= 32 or ord(c) >= 127 for c in value):
        raise ValueError("Conversation credentials must be non-empty header-safe tokens")
    return value


class ConversationCandidateClient:
    MAX_REQUEST_BYTES = 1_048_576
    MAX_RESPONSE_BYTES = 2_097_152

    def __init__(
        self, *, base_url: str, service_bearer: str, contract: PublicConversationContract,
        binding: AuthoringBinding, authorize: Authorize,
        current_binding: Callable[[], AuthoringBinding], current_policy_revision: Callable[[], str],
        issue_access: IssueAccess, transport: httpx.BaseTransport | None = None,
    ):
        parsed = urlsplit(base_url)
        if (parsed.scheme not in {"http", "https"} or not parsed.netloc
                or parsed.username or parsed.password or parsed.query or parsed.fragment
                or (parsed.scheme == "http" and parsed.hostname not in {"localhost", "127.0.0.1", "::1"})):
            raise ValueError("Explicit HTTPS conversation URL required; HTTP is loopback-only")
        self.base_url = base_url.rstrip("/")
        self._service_bearer = _header(service_bearer)
        self.contract = contract
        self.binding = binding
        self.authorize = authorize
        self.current_binding = current_binding
        self.current_policy_revision = current_policy_revision
        self.issue_access = issue_access
        self.transport = transport

    def _check_authoring(self, request: dict) -> None:
        validate_candidate_authoring_scope(request, self.binding, self.authorize,
                                           policy_revision=self.current_policy_revision())
        validate_advice_return(self.binding, self.binding, self.current_binding(),
                              self.authorize, applies_storyboard_edit=False)

    def submit(self, request: dict) -> dict:
        return self._exchange("POST", "/conversation/turns", "turn:submit", request, 202)

    def read(self, request: dict, operation_id: str) -> dict:
        self._operation_id(operation_id)
        return self._exchange("GET", f"/conversation/operations/{operation_id}",
                              "operation:read", request, 200, operation_id)

    def cancel(self, request: dict, operation_id: str) -> dict:
        self._operation_id(operation_id)
        return self._exchange("POST", f"/conversation/operations/{operation_id}/cancel",
                              "operation:cancel", request, 200, operation_id)

    @staticmethod
    def _operation_id(value: str) -> None:
        if not isinstance(value, str) or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._:-]{0,127}", value):
            raise ValueError("Invalid conversation operation identity")

    def _exchange(self, method, path, action, request, expected_status, operation_id=None):
        snapshot, body = self.contract.request(request)
        if len(body) > self.MAX_REQUEST_BYTES:
            raise ConversationClientError("Conversation request exceeds transport limit")
        self._check_authoring(snapshot)
        digest = self.contract.semantics.request_digest(snapshot) if operation_id is None else None
        hashes = sorted({s["content_sha256"] for s in snapshot["context"]["source_snapshots"]})
        # A private copy prevents the issuer from changing the validated request.
        scope = dict(snapshot["scope"])
        token = _header(self.issue_access(action, scope, digest, operation_id, hashes))
        headers = {"Authorization": f"Bearer {self._service_bearer}",
                   "X-Pythia-Conversation-Access": token, "Accept": "application/json"}
        if operation_id is None:
            headers["Content-Type"] = "application/json"
        try:
            with httpx.Client(timeout=10.0, follow_redirects=False, trust_env=False,
                              transport=self.transport) as client:
                with client.stream(method, f"{self.base_url}{path}", headers=headers,
                                   content=body if operation_id is None else None) as response:
                    if response.status_code != expected_status:
                        raise ConversationClientError("Conversation service rejected the operation",
                                                      response.status_code)
                    raw = bytearray()
                    for chunk in response.iter_bytes():
                        if len(raw) + len(chunk) > self.MAX_RESPONSE_BYTES:
                            raise ConversationClientError("Conversation response exceeds transport limit")
                        raw.extend(chunk)
        except httpx.HTTPError:
            raise ConversationClientError("Conversation transport is unavailable") from None
        result = self.contract.operation(bytes(raw), snapshot)
        if operation_id is not None and result["operation_id"] != operation_id:
            raise ConversationClientError("Conversation operation identity mismatch")
        # Recheck current policy, actor/source access and scene state after I/O.
        self._check_authoring(snapshot)
        return result
