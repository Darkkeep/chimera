"""Explicit plain-UTF8 source candidate transport, independent of task APIs."""
from typing import Callable

import httpx

from .conversation_boundary import AuthoringBinding, Authorize, SourceIdentity
from .conversation_client import ConversationClientError, _base_url, _header, _http_bytes
from .source_provenance import PublicSourceCandidate, bind_source_transfer


# action, scope, source ID/version, PUT metadata digest (GET null), source hashes.
IssueSourceAccess = Callable[[str, dict, str, str, str | None, list[str]], str]


class SourceCandidateClient:
    MAX_RESPONSE_BYTES = 262144

    def __init__(
        self, *, base_url: str, service_bearer: str, contract: PublicSourceCandidate,
        binding: AuthoringBinding, authorize: Authorize,
        authorize_action: Callable[[AuthoringBinding, SourceIdentity, str], bool],
        current_binding: Callable[[], AuthoringBinding], current_policy_revision: Callable[[], str],
        issue_access: IssueSourceAccess, transport: httpx.BaseTransport | None = None,
    ):
        self.base_url = _base_url(base_url)
        self._service_bearer = _header(service_bearer)
        self.contract, self.binding = contract, binding
        self.authorize, self.authorize_action = authorize, authorize_action
        self.current_binding, self.current_policy_revision = current_binding, current_policy_revision
        self.issue_access, self.transport = issue_access, transport

    def _bind(self, metadata, action):
        bind_source_transfer(metadata, self.binding, self.current_binding(), self.authorize,
                             self.authorize_action, policy_revision=self.current_policy_revision(),
                             action=action)

    def ingest(self, metadata: dict, original_bytes: bytes) -> dict:
        return self._exchange(metadata, original_bytes, "source:ingest")

    def read_manifest(self, metadata: dict, original_bytes: bytes) -> dict:
        """GET returns no source bytes; compare receipt to retained trusted originals."""
        return self._exchange(metadata, original_bytes, "source:read")

    def _exchange(self, metadata, original_bytes, action):
        metadata = self.contract.metadata(metadata)
        self._bind(metadata, action)
        # Check retained exact bytes before issuing credentials or consuming HTTP.
        if not isinstance(original_bytes, bytes) or not 1 <= len(original_bytes) <= 262144:
            raise ConversationClientError("Bounded original UTF8 source bytes are required")
        # A locally constructed full snapshot checks actual eligibility/hash/count;
        # it is never returned as if the engine had accepted the source.
        try:
            text = original_bytes.decode("utf-8", errors="strict")
        except UnicodeError:
            raise ConversationClientError("Source is not strict UTF8 text") from None
        candidate = {**metadata, "status": "ready", "error_code": None, "snapshot": {
            **{k: metadata[k] for k in ("source_id", "version", "content_sha256", "media_type")},
            "extraction_sha256": metadata["content_sha256"], "status": "ready",
            "coverage": [{"start": 0, "end": len(text)}]}}
        self.contract.receipt(metadata, candidate, original_bytes)
        digest = self.contract.semantics.metadata_digest(metadata) if action == "source:ingest" else None
        token = _header(self.issue_access(action, dict(metadata["scope"]), metadata["source_id"],
                       metadata["version"], digest, [metadata["content_sha256"]]))
        headers = {"Authorization": f"Bearer {self._service_bearer}",
                   "X-Pythia-Conversation-Access": token, "Accept": "application/json"}
        if action == "source:ingest":
            headers.update({"Content-Type": "text/plain", "Content-Length": str(len(original_bytes)),
                            "X-Pythia-Content-SHA256": metadata["content_sha256"]})
        path = f"/conversation/sources/{metadata['source_id']}/versions/{metadata['version']}"
        raw = _http_bytes(self.base_url, "PUT" if action == "source:ingest" else "GET", path,
                          headers, original_bytes if action == "source:ingest" else None,
                          {200, 201} if action == "source:ingest" else {200},
                          self.transport, self.MAX_RESPONSE_BYTES)
        try:
            manifest = self.contract.turn.semantics.strict_loads(raw)
        except Exception:
            raise ConversationClientError("Invalid source manifest JSON") from None
        result = self.contract.receipt(metadata, manifest, original_bytes)
        self._bind(metadata, action)
        return result
