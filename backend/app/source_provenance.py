"""Opt-in source candidate validation; no upload route or CSV parser is supplied."""
import builtins
import hashlib
import json
from pathlib import Path
from types import ModuleType
from typing import Callable

from jsonschema import Draft202012Validator

from .conversation_boundary import (
    AuthoringBinding, Authorize, SourceIdentity, authorize_binding, validate_advice_return,
)
from .conversation_client import ConversationClientError, PublicConversationContract


class PublicSourceCandidate:
    CONTENT_PINS = {
        "schemas/source-ingestion-metadata.schema.json": "94d9636cd93c8c8c5cffd0630cf50d6c06f96cd4ed1fba5c821813127ce7d25a",
        "schemas/source-ingestion-manifest.schema.json": "1a8e42f32e2c08c8b4b0f97ffe3010559dc9c4b3f64631513190530294717d71",
        "schemas/csv-source-anchor.schema.json": "2d57ca992ed11aaa67aa759a24f7369d05fca7d26f0aca7c2ef4086e81f50b88",
        "scripts/source_ingestion_semantics.py": "42a30c1c6d444de1973f6dc811bbb01bb3147ec80921384695d47d49e07a9b7b",
    }

    def __init__(self, root: Path):
        self.turn = PublicConversationContract(root)
        checked = {}
        for relative, expected in self.CONTENT_PINS.items():
            raw = (Path(root) / relative).read_bytes().replace(b"\r\n", b"\n")
            if hashlib.sha256(raw).hexdigest() != expected:
                raise ValueError("Public source candidate content pin mismatch")
            checked[relative] = raw
        self.validators = {}
        for name in ("source-ingestion-metadata", "source-ingestion-manifest", "csv-source-anchor"):
            schema = json.loads(checked[f"schemas/{name}.schema.json"])
            Draft202012Validator.check_schema(schema)
            self.validators[name] = Draft202012Validator(schema)
        self.semantics = ModuleType("chimera_public_source_semantics")
        # Scope imports to the already-pinned public helper, without changing
        # process-wide sys.path/sys.modules or importing private engine code.
        def public_import(name, globals=None, locals=None, fromlist=(), level=0):
            if name == "conversation_semantics":
                return self.turn.semantics
            return builtins.__import__(name, globals, locals, fromlist, level)
        self.semantics.__dict__["__builtins__"] = {**vars(builtins), "__import__": public_import}
        exec(compile(checked["scripts/source_ingestion_semantics.py"],
                     str(Path(root) / "scripts/source_ingestion_semantics.py"), "exec"),
             self.semantics.__dict__)

    def _validated(self, name, value):
        try:
            snapshot = self.turn.semantics.strict_loads(self.turn.semantics.canonical_bytes(value))
            self.validators[name].validate(snapshot)
            return snapshot
        except Exception:
            raise ConversationClientError("Invalid public source candidate document") from None

    def metadata(self, value: dict) -> dict:
        return self._validated("source-ingestion-metadata", value)

    def receipt(self, metadata: dict, manifest: dict, original_bytes: bytes) -> dict:
        if not isinstance(original_bytes, bytes):
            raise ConversationClientError("Exact original source bytes are required")
        metadata = self.metadata(metadata)
        manifest = self._validated("source-ingestion-manifest", manifest)
        if self.semantics.manifest_errors(manifest, metadata, original_bytes):
            raise ConversationClientError("Source receipt differs from exact authorized bytes")
        return manifest

    def csv_anchor(self, anchor: dict, trusted_parsed_table: dict) -> dict:
        """Design-only check against trusted parser output, never client claims.

        This function supplies no parser and does not enable CSV turn citations.
        """
        anchor = self._validated("csv-source-anchor", anchor)
        if self.semantics.csv_anchor_errors(anchor, trusted_parsed_table):
            raise ConversationClientError("CSV anchor differs from exact parsed source coverage")
        return anchor


def bind_source_transfer(
    metadata: dict, binding: AuthoringBinding, current: AuthoringBinding,
    authorize: Authorize,
    authorize_action: Callable[[AuthoringBinding, SourceIdentity, str], bool],
    *, policy_revision: str, action: str,
) -> None:
    """Bind schema-qualified metadata to server-local scene and action authority.

    Call before signing/transfer and again before attaching any returned receipt.
    `current` and all callbacks must come from trusted server state. This is not
    a JWT signer or a replacement for engine-side authorization/byte checks.
    """
    authorize_binding(binding, authorize)
    if action not in {"source:ingest", "source:read"}:
        raise ValueError("Unsupported source transfer action")
    expected = dict(tenant_id=binding.tenant_id, consumer_id=binding.consumer,
                    actor_id=binding.actor_id, session_id=binding.session_id,
                    policy_revision=policy_revision)
    if metadata.get("scope") != expected:
        raise ValueError("Source metadata scope differs from current authoring scope")
    source = SourceIdentity(metadata.get("source_id"), metadata.get("version"),
                            metadata.get("content_sha256"))
    if source not in binding.sources or authorize_action(binding, source, action) is not True:
        raise PermissionError("Source transfer is unavailable")
    validate_advice_return(binding, binding, current, authorize, applies_storyboard_edit=False)
