"""Opt-in PDF/DOCX source transfer with authenticated manifest reconstruction."""
import builtins
import hashlib
import json
from pathlib import Path
from types import ModuleType

from jsonschema import Draft202012Validator

from .conversation_client import ConversationClientError, _header, _http_bytes
from .source_client import SourceCandidateClient
from .source_provenance import PublicSourceCandidate


PDF = 'application/pdf'
DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
DOCUMENT_TYPES = frozenset({PDF, DOCX})


class PublicDocumentSourceCandidate:
    """Validate exact candidate manifests, source bytes and current worker trust."""
    CONTENT_PINS = {
        'schemas/document-source-ingestion-metadata.schema.json':
            '9ed42383f6fdf05d8322b2f6b9dfaabf0a5c64b3c66821525f84b65640f5d0ed',
        'schemas/document-extraction-document.schema.json':
            '718d49977d80938da0ff26c94579c5ece531d5f82d225a3b6f248ddc30579b5c',
        'schemas/document-source-manifest.schema.json':
            'f64957928e15737fd02004add5ad16b0845626a811e3747a33add7080c06f8c3',
        'schemas/document-text-citation.schema.json':
            '6b80128d9e28131460a24488cd2b465cdfe39d1047506e18ec03f6f015aa0076',
        'scripts/document_source_semantics.py':
            '367cf38a133a6d82020eaa4c296777f65f066d88aa096afad79cd28e464ba3bc',
    }

    def __init__(self, root: Path, *, allowed_workers):
        if not callable(allowed_workers):
            raise ValueError('Fresh trusted worker configuration is required')
        self.root = Path(root)
        self.turn = PublicSourceCandidate(self.root).turn
        self.source = PublicSourceCandidate(self.root)
        self.allowed_workers = allowed_workers
        checked = {}
        for relative, expected in self.CONTENT_PINS.items():
            raw = (self.root / relative).read_bytes().replace(b'\r\n', b'\n')
            actual = hashlib.sha256(raw).hexdigest()
            if actual != expected:
                raise ValueError(f'Public document candidate content pin mismatch: {relative} ({actual})')
            checked[relative] = raw
        self.validators = {}
        for name in ('document-source-ingestion-metadata', 'document-extraction-document',
                 'document-source-manifest', 'document-text-citation'):
            schema = json.loads(checked[f'schemas/{name}.schema.json'])
            Draft202012Validator.check_schema(schema)
            self.validators[name] = Draft202012Validator(schema)
        self.semantics = ModuleType('chimera_public_document_semantics')

        def public_import(name, globals=None, locals=None, fromlist=(), level=0):
            if name == 'conversation_semantics':
                return self.turn.semantics
            return builtins.__import__(name, globals, locals, fromlist, level)

        self.semantics.__dict__['__builtins__'] = {**vars(builtins), '__import__': public_import}
        exec(compile(checked['scripts/document_source_semantics.py'],
                     str(self.root / 'scripts/document_source_semantics.py'), 'exec'),
             self.semantics.__dict__)

    def _validated(self, name, value):
        try:
            raw = self.turn.semantics.canonical_bytes(value)
            snapshot = self.turn.semantics.strict_loads(raw)
            self.validators[name].validate(snapshot)
            return snapshot
        except Exception:
            raise ConversationClientError('Invalid public document candidate manifest') from None

    def metadata(self, value):
        try:
            return self._validated('document-source-ingestion-metadata', value)
        except Exception:
            raise ConversationClientError('Invalid document source metadata') from None

    def original(self, metadata, raw):
        if (not isinstance(raw, bytes) or not 1 <= len(raw) <= 262144 or
                len(raw) != metadata['byte_size'] or
                hashlib.sha256(raw).hexdigest() != metadata['content_sha256']):
            raise ConversationClientError('Document original differs from authorized bytes')
        return raw

    def trusted_record(self, metadata, manifest, original_bytes):
        """Only call with an authenticated engine receipt, never actor JSON."""
        try:
            metadata = self.metadata(metadata)
            self.original(metadata, original_bytes)
            manifest = self._validated('document-source-manifest', manifest)
            if any(manifest[key] != metadata[key] for key in (
                    'schema_version', 'scope', 'source_id', 'version', 'content_sha256',
                    'byte_size', 'media_type')):
                raise ValueError('Manifest differs from signed source metadata')
            record = {key: manifest[key] for key in (
                'source_id', 'version', 'content_sha256', 'byte_size', 'media_type',
                'extraction_sha256', 'worker_provenance_id', 'document')}
            record['scope'] = {key: metadata['scope'][key]
                               for key in ('tenant_id', 'consumer_id', 'actor_id', 'session_id')}
            if self.semantics.trusted_manifest_errors(
                    manifest, record, set(self.allowed_workers())):
                raise ValueError('Manifest is not bound to trusted source bytes and worker')
            return record
        except Exception:
            raise ConversationClientError('Document receipt cannot establish a qualified source record') from None

    def receipt(self, metadata, manifest, original_bytes):
        self.trusted_record(metadata, manifest, original_bytes)
        return self._validated('document-source-manifest', manifest)


class DocumentSourceCandidateClient(SourceCandidateClient):
    """Signed source transport for document manifests; no document turns."""
    MAX_RESPONSE_BYTES = 1048576

    def _exchange(self, metadata, original_bytes, action):
        metadata = self.contract.metadata(metadata)
        self._bind(metadata, action)
        self.contract.original(metadata, original_bytes)
        digest = self.contract.source.semantics.metadata_digest(metadata) if action == 'source:ingest' else None
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
            raise ConversationClientError('Invalid document manifest JSON') from None
        result = self.contract.receipt(metadata, manifest, original_bytes)
        self._bind(metadata, action)
        self.contract.trusted_record(metadata, result, original_bytes)
        return result