"""Opt-in MP4/MP3 metadata-only inspection source transfer."""
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


MEDIA_TYPES = frozenset({'video/mp4', 'audio/mpeg'})


class PublicMediaSourceCandidate:
    CONTENT_PINS = {
        'schemas/media-source-inspection-metadata.schema.json':
            '79c9d85b0ef0a82d4466e2074cb4e67362c078aaf9ff161ead30dd59911fede5',
        'schemas/media-source-inspection-manifest.schema.json':
            '736e7defe359437b408fb2871b1965b3de5ff4bf08f44d92e2572441237739d0',
        'schemas/media-inspection-document.schema.json':
            '7027ebc6a4aba84e129e44936f060c0a2886f3a97ca75d1b372045907cf8dc25',
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
                raise ValueError(f'Media inspection content pin mismatch: {relative}')
            checked[relative] = raw
        self.validators = {}
        for name in ('media-source-inspection-metadata', 'media-source-inspection-manifest',
                     'media-inspection-document'):
            schema = json.loads(checked[f'schemas/{name}.schema.json'])
            Draft202012Validator.check_schema(schema)
            self.validators[name] = Draft202012Validator(schema)
        self.semantics = ModuleType('chimera_public_inspection_semantics')

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
            raise ConversationClientError('Invalid public media inspection document') from None

    def metadata(self, value):
        metadata = self._validated('media-source-inspection-metadata', value)
        if metadata['media_type'] not in MEDIA_TYPES:
            raise ConversationClientError('Unsupported media inspection type')
        return metadata

    def original(self, metadata, raw):
        if (not isinstance(raw, bytes) or not 1 <= len(raw) <= 262144 or
                len(raw) != metadata['byte_size'] or
                hashlib.sha256(raw).hexdigest() != metadata['content_sha256']):
            raise ConversationClientError('Media original differs from authorized bytes')
        return raw

    def trusted_record(self, metadata, manifest, original_bytes):
        try:
            metadata = self.metadata(metadata)
            self.original(metadata, original_bytes)
            manifest = self._validated('media-source-inspection-manifest', manifest)
            if any(manifest[key] != metadata[key] for key in (
                    'schema_version', 'scope', 'source_id', 'version', 'content_sha256',
                    'byte_size', 'media_type')):
                raise ValueError('Manifest differs from signed media metadata')
            record = {key: manifest[key] for key in (
                'source_id', 'version', 'content_sha256', 'byte_size', 'media_type',
                'worker_provenance_id', 'inspection_sha256', 'inspection')}
            record['scope'] = {key: metadata['scope'][key]
                               for key in ('tenant_id', 'consumer_id', 'actor_id', 'session_id')}
            if self.semantics.trusted_manifest_errors(
                    manifest, record, set(self.allowed_workers())):
                raise ValueError('Manifest is not bound to trusted source bytes and worker')
            return record
        except Exception:
            raise ConversationClientError('Media inspection receipt cannot establish a qualified source record') from None

    def receipt(self, metadata, manifest, original_bytes):
        self.trusted_record(metadata, manifest, original_bytes)
        return self._validated('media-source-inspection-manifest', manifest)


class MediaSourceInspectionClient(SourceCandidateClient):
    MAX_RESPONSE_BYTES = 1048576

    def __init__(self, *, base_url, service_bearer, contract: PublicMediaSourceCandidate,
                 binding, authorize, authorize_action, current_binding,
                 current_policy_revision, issue_access, transport=None):
        self.media_contract = contract
        super().__init__(base_url=base_url, service_bearer=service_bearer,
            contract=contract.source, binding=binding, authorize=authorize,
            authorize_action=authorize_action, current_binding=current_binding,
            current_policy_revision=current_policy_revision, issue_access=issue_access,
            transport=transport)

    def _exchange(self, metadata, original_bytes, action):
        metadata = self.media_contract.metadata(metadata)
        self._bind(metadata, action)
        self.media_contract.original(metadata, original_bytes)
        digest = self.media_contract.source.semantics.metadata_digest(metadata) if action == 'source:ingest' else None
        token = _header(self.issue_access(action, dict(metadata['scope']), metadata['source_id'],
            metadata['version'], digest, [metadata['content_sha256']]))
        headers = {'Authorization': f'Bearer {self._service_bearer}',
                   'X-Pythia-Conversation-Access': token, 'Accept': 'application/json'}
        if action == 'source:ingest':
            headers.update({'Content-Type': metadata['media_type'],
                'Content-Length': str(len(original_bytes)),
                'X-Pythia-Content-SHA256': metadata['content_sha256']})
        path = f"/conversation/sources/{metadata['source_id']}/versions/{metadata['version']}"
        raw = _http_bytes(self.base_url, 'PUT' if action == 'source:ingest' else 'GET', path,
            headers, original_bytes if action == 'source:ingest' else None,
            {200, 201} if action == 'source:ingest' else {200},
            self.transport, self.MAX_RESPONSE_BYTES)
        try:
            manifest = self.contract.turn.semantics.strict_loads(raw)
        except Exception:
            raise ConversationClientError('Invalid media inspection manifest JSON') from None
        result = self.media_contract.receipt(metadata, manifest, original_bytes)
        self._bind(metadata, action)
        self.media_contract.trusted_record(metadata, result, original_bytes)
        return result
