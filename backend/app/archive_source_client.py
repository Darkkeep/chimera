"""Opt-in ZIP source transfer with lineage-only archive inspection receipts."""
import builtins
from collections.abc import Callable
import hashlib
import json
from pathlib import Path
from types import ModuleType

from jsonschema import Draft202012Validator

from .conversation_client import ConversationClientError, _header, _http_bytes
from .source_client import SourceCandidateClient
from .source_provenance import PublicSourceCandidate


ZIP_TYPE = 'application/zip'


class PublicArchiveSourceCandidate:
    CONTENT_PINS = {
        'schemas/archive-source-inspection-metadata.schema.json':
            '4aa36a2c9fae387c4d8ee9ace8e7a065a2f992c962b84707c292d96bee0ef268',
        'schemas/archive-source-inspection-manifest.schema.json':
            '4d8c4a32c0d91f4da618e89943fb1630687600e0283891d8a0b13f22020d7c9f',
        'schemas/archive-inspection-document.schema.json':
            'ed45cc572242197402e3dd08423a7612347742d0c5b3922283de87ded8896f5f',
        'scripts/inspection_source_semantics.py':
            'c9cff2bbe11d272148f593121c5147641e14deba0286870e1c6cb2fc7616b0ae',
    }

    def __init__(self, root: Path, *, allowed_workers: Callable[[], set[str]]):
        if not callable(allowed_workers):
            raise ValueError('Fresh trusted worker configuration is required')
        self.root = Path(root)
        self.source = PublicSourceCandidate(self.root)
        self.turn = self.source.turn
        self.allowed_workers = allowed_workers
        checked = {}
        for relative, expected in self.CONTENT_PINS.items():
            raw = (self.root / relative).read_bytes().replace(b'\r\n', b'\n')
            if hashlib.sha256(raw).hexdigest() != expected:
                raise ValueError(f'Archive inspection content pin mismatch: {relative}')
            checked[relative] = raw
        self.validators = {}
        for name in ('archive-source-inspection-metadata', 'archive-source-inspection-manifest',
                     'archive-inspection-document'):
            schema = json.loads(checked[f'schemas/{name}.schema.json'])
            Draft202012Validator.check_schema(schema)
            self.validators[name] = Draft202012Validator(schema)
        self.semantics = ModuleType('chimera_public_archive_semantics')

        def public_import(name, globals=None, locals=None, fromlist=(), level=0):
            if name == 'conversation_semantics':
                return self.turn.semantics
            return builtins.__import__(name, globals, locals, fromlist, level)

        self.semantics.__dict__['__builtins__'] = {**vars(builtins), '__import__': public_import}
        exec(compile(checked['scripts/inspection_source_semantics.py'],
                     str(self.root / 'scripts/inspection_source_semantics.py'), 'exec'),
             self.semantics.__dict__)

    def _validated(self, name, value):
        try:
            snapshot = self.turn.semantics.strict_loads(self.turn.semantics.canonical_bytes(value))
            self.validators[name].validate(snapshot)
            return snapshot
        except Exception:
            raise ConversationClientError('Invalid public archive inspection document') from None

    def metadata(self, value):
        metadata = self._validated('archive-source-inspection-metadata', value)
        if metadata['media_type'] != ZIP_TYPE:
            raise ConversationClientError('Unsupported archive inspection type')
        return metadata

    def original(self, metadata, raw):
        if (not isinstance(raw, bytes) or not 1 <= len(raw) <= 262144 or
                len(raw) != metadata['byte_size'] or
                hashlib.sha256(raw).hexdigest() != metadata['content_sha256']):
            raise ConversationClientError('Archive original differs from authorized bytes')
        return raw

    def trusted_record(self, metadata, manifest, original_bytes):
        try:
            metadata = self.metadata(metadata)
            self.original(metadata, original_bytes)
            manifest = self._validated('archive-source-inspection-manifest', manifest)
            if any(manifest[key] != metadata[key] for key in (
                    'schema_version', 'scope', 'source_id', 'version', 'content_sha256',
                    'byte_size', 'media_type')):
                raise ValueError('Manifest differs from signed archive metadata')
            record = {key: manifest[key] for key in (
                'source_id', 'version', 'content_sha256', 'byte_size', 'media_type',
                'worker_provenance_id', 'inspection_sha256', 'inspection')}
            record['scope'] = {key: metadata['scope'][key]
                               for key in ('tenant_id', 'consumer_id', 'actor_id', 'session_id')}
            if self.semantics.trusted_manifest_errors(
                    manifest, record, set(self.allowed_workers())):
                raise ValueError('Manifest is not bound to trusted archive bytes and worker')
            return record
        except Exception:
            raise ConversationClientError('Archive receipt cannot establish a qualified lineage record') from None

    def receipt(self, metadata, manifest, original_bytes):
        self.trusted_record(metadata, manifest, original_bytes)
        return self._validated('archive-source-inspection-manifest', manifest)


class ArchiveSourceInspectionClient(SourceCandidateClient):
    MAX_RESPONSE_BYTES = 1048576

    def __init__(self, *, base_url, service_bearer, contract: PublicArchiveSourceCandidate,
                 binding, authorize, authorize_action, current_binding,
                 current_policy_revision, issue_access, transport=None):
        self.archive_contract = contract
        super().__init__(base_url=base_url, service_bearer=service_bearer,
            contract=contract.source, binding=binding, authorize=authorize,
            authorize_action=authorize_action, current_binding=current_binding,
            current_policy_revision=current_policy_revision, issue_access=issue_access,
            transport=transport)

    def _exchange(self, metadata, original_bytes, action):
        metadata = self.archive_contract.metadata(metadata)
        self._bind(metadata, action)
        self.archive_contract.original(metadata, original_bytes)
        digest = self.archive_contract.source.semantics.metadata_digest(metadata) if action == 'source:ingest' else None
        token = _header(self.issue_access(action, dict(metadata['scope']), metadata['source_id'],
            metadata['version'], digest, [metadata['content_sha256']]))
        headers = {'Authorization': f'Bearer {self._service_bearer}',
                   'X-Pythia-Conversation-Access': token, 'Accept': 'application/json'}
        if action == 'source:ingest':
            headers.update({'Content-Type': ZIP_TYPE, 'Content-Length': str(len(original_bytes)),
                'X-Pythia-Content-SHA256': metadata['content_sha256']})
        path = f"/conversation/sources/{metadata['source_id']}/versions/{metadata['version']}"
        raw = _http_bytes(self.base_url, 'PUT' if action == 'source:ingest' else 'GET', path,
            headers, original_bytes if action == 'source:ingest' else None,
            {200, 201} if action == 'source:ingest' else {200},
            self.transport, self.MAX_RESPONSE_BYTES)
        try:
            manifest = self.contract.turn.semantics.strict_loads(raw)
        except Exception:
            raise ConversationClientError('Invalid archive inspection manifest JSON') from None
        result = self.archive_contract.receipt(metadata, manifest, original_bytes)
        self._bind(metadata, action)
        self.archive_contract.trusted_record(metadata, result, original_bytes)
        return result
