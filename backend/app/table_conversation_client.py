"""Additive CSV1.1 candidate; existing text-only client and pins remain unchanged."""
import builtins
import hashlib
import json
from pathlib import Path
from types import ModuleType
from typing import Callable

from jsonschema import Draft202012Validator

from .conversation_boundary import SourceIdentity, authorize_binding, validate_advice_return
from .conversation_client import (
    ConversationCandidateClient, ConversationClientError, PublicConversationContract,
)


class PublicTableConversationContract:
    CONTENT_PINS = {
        "schemas/conversation-table-turn-request.schema.json": "1903faeefdd974e386077e5a24f21c8a0322be4fc0e414a9de2e50ec67cde327",
        "schemas/conversation-table-operation.schema.json": "d5306a35e72e10417ab4bb6d0b721cfe5d54482d64e7a8d2a3749d3fa3aa8644",
        "schemas/csv-extraction-document.schema.json": "523071ea91bfa023fa86d083b190fe23d02e5c981d75a5c9d71b9050d64c9a83",
        "schemas/csv-source-snapshot.schema.json": "c2c4a98bfe777e8a6b9be3c264f9ecb30a89533640b29e04135a4d7cc3ad67e8",
        "schemas/csv-qualified-citation.schema.json": "9dc18e061f28fbe7e5dcc27e4a0fdd7d99bf8c52036c6ebceaf1002e53e9e778",
        "scripts/conversation_table_semantics.py": "ae38e3fc1635cebea054332b0b9f683024f47511b733c4410a0f894cdb791397",
    }

    def __init__(self, root: Path):
        self.original = PublicConversationContract(root)
        self.canonical = self.original.semantics
        checked = {}
        for relative, expected in self.CONTENT_PINS.items():
            raw = (Path(root) / relative).read_bytes().replace(b"\r\n", b"\n")
            if hashlib.sha256(raw).hexdigest() != expected:
                raise ValueError("Public table conversation content pin mismatch")
            checked[relative] = raw
        self.validators = {}
        for path, raw in checked.items():
            if path.startswith("schemas/"):
                schema = json.loads(raw)
                Draft202012Validator.check_schema(schema)
                self.validators[Path(path).name] = Draft202012Validator(schema)
        self.semantics = ModuleType("chimera_public_table_semantics")
        def public_import(name, globals=None, locals=None, fromlist=(), level=0):
            if name == "conversation_semantics":
                return self.canonical
            return builtins.__import__(name, globals, locals, fromlist, level)
        self.semantics.__dict__["__builtins__"] = {**vars(builtins), "__import__": public_import}
        exec(compile(checked["scripts/conversation_table_semantics.py"],
                     str(Path(root) / "scripts/conversation_table_semantics.py"), "exec"),
             self.semantics.__dict__)

    def request(self, value: dict) -> tuple[dict, bytes]:
        try:
            raw = self.canonical.canonical_bytes(value)
            snapshot = self.canonical.strict_loads(raw)
            self.validators["conversation-table-turn-request.schema.json"].validate(snapshot)
            if self.semantics.request_errors(snapshot):
                raise ValueError("Invalid table request semantics")
            return snapshot, raw
        except Exception:
            raise ConversationClientError("Invalid table conversation request") from None

    def operation(self, raw: bytes, request: dict) -> dict:
        try:
            operation = self.canonical.strict_loads(raw)
            self.validators["conversation-table-operation.schema.json"].validate(operation)
            if self.semantics.operation_errors(operation, request):
                raise ValueError("Invalid table operation semantics")
            return operation
        except Exception:
            raise ConversationClientError("Invalid table conversation response") from None

    def trusted_request(self, request: dict, trusted_records: dict, allowed_workers: set[str]) -> None:
        """Records/workers must come from fresh trusted server storage/configuration."""
        try:
            records = {}
            for source in request["context"]["source_snapshots"]:
                if source["media_type"] != "text/csv":
                    continue
                key = (source["source_id"], source["version"])
                # Snapshot caller-owned records before validating executable semantics.
                record = self.canonical.strict_loads(self.canonical.canonical_bytes(trusted_records[key]))
                self.validators["csv-extraction-document.schema.json"].validate(record["document"])
                records[key] = record
            if self.semantics.trusted_request_errors(request, records, set(allowed_workers)):
                raise ValueError("Untrusted CSV source projection")
        except Exception:
            raise ConversationClientError("CSV projection is not authorized authoritative source data") from None


class TableConversationClient(ConversationCandidateClient):
    """Public candidate HTTP with fresh authoring and authoritative CSV checks.

    Server callbacks are required even when the input hashes are self-consistent.
    No CSV upload, parser worker, session store or permissive issuer is configured.
    """
    def __init__(self, *, trusted_csv_records: Callable[[], dict],
                 allowed_workers: Callable[[], set[str]], **kwargs):
        super().__init__(**kwargs)
        self.trusted_csv_records = trusted_csv_records
        self.allowed_workers = allowed_workers

    def _check_authoring(self, request: dict) -> None:
        authorize_binding(self.binding, self.authorize)
        scope = dict(tenant_id=self.binding.tenant_id, consumer_id=self.binding.consumer,
                     actor_id=self.binding.actor_id, session_id=self.binding.session_id,
                     policy_revision=self.current_policy_revision())
        if request["scope"] != scope:
            raise ValueError("Table conversation differs from current authoring scope")
        sources = request["context"]["source_snapshots"]
        identities = tuple(SourceIdentity(s["source_id"], s["version"], s["content_sha256"])
                           for s in sources)
        if (len({s.source_id for s in identities}) != len(identities) or
                set(identities) != set(self.binding.sources)):
            raise PermissionError("Table sources differ from authorized authoring identities")
        self.contract.trusted_request(request, self.trusted_csv_records(), self.allowed_workers())
        validate_advice_return(self.binding, self.binding, self.current_binding(),
                              self.authorize, applies_storyboard_edit=False)
