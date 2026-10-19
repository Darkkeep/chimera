"""Opt-in CSV source transport and authenticated full-receipt reconstruction."""
import hashlib
import json
from pathlib import Path

from jsonschema import Draft202012Validator

from .conversation_client import ConversationClientError, _header, _http_bytes
from .source_client import SourceCandidateClient
from .source_provenance import PublicSourceCandidate
from .table_conversation_client import PublicTableConversationContract


class PublicCsvSourceCandidate:
    CONTENT_PINS = {
        'csv-source-ingestion-metadata': 'fa145ef2b1996c2f722f4edc2b6843a994ed713807bd1ec98791c4917815fb02',
        'csv-source-ingestion-manifest': '3e634bffbe1ef40e33caf100ea727471068b3464c4e7dec5f40442e5f9df3513',
    }

    def __init__(self, root: Path, *, allowed_workers):
        if not callable(allowed_workers):
            raise ValueError('Fresh trusted worker configuration is required')
        self.allowed_workers = allowed_workers
        self.table = PublicTableConversationContract(root)
        self.turn = self.table.original
        self.semantics = PublicSourceCandidate(root).semantics
        self.validators = {}
        for name, expected in self.CONTENT_PINS.items():
            raw = (Path(root) / 'schemas' / (name + '.schema.json')).read_bytes().replace(b'\r\n', b'\n')
            if hashlib.sha256(raw).hexdigest() != expected:
                raise ValueError('CSV source candidate content pin mismatch')
            schema = json.loads(raw)
            Draft202012Validator.check_schema(schema)
            self.validators[name] = Draft202012Validator(schema)

    def _validated(self, name, value):
        snapshot = self.table.canonical.strict_loads(self.table.canonical.canonical_bytes(value))
        self.validators[name].validate(snapshot)
        return snapshot

    def metadata(self, value):
        try:
            return self._validated('csv-source-ingestion-metadata', value)
        except Exception:
            raise ConversationClientError('Invalid CSV source metadata') from None

    def original(self, metadata, raw):
        if (not isinstance(raw, bytes) or not 1 <= len(raw) <= 262144 or
                len(raw) != metadata['byte_size'] or hashlib.sha256(raw).hexdigest() != metadata['content_sha256']):
            raise ConversationClientError('CSV original differs from authorized bytes')
        try:
            text = raw.decode('utf-8', errors='strict')
            if '\x00' in text:
                raise ValueError()
            return text
        except (UnicodeError, ValueError):
            raise ConversationClientError('CSV requires exact strict UTF8 original') from None

    def trusted_record(self, metadata, receipt, raw):
        """Only call with an authenticated server receipt, never actor-supplied JSON."""
        try:
            metadata = self.metadata(metadata)
            text = self.original(metadata, raw)
            receipt = self._validated('csv-source-ingestion-manifest', receipt)
            if any(receipt[k] != v for k, v in metadata.items()) or receipt['error_code'] is not None:
                raise ValueError()
            source = receipt['snapshot']
            if receipt['status'] not in {'ready', 'no_data_rows'} or source['status'] != receipt['status']:
                raise ValueError()
            if any(source[k] != metadata[k] for k in ('source_id', 'version', 'content_sha256', 'media_type')):
                raise ValueError()
            self.table.validators['csv-source-snapshot.schema.json'].validate(source)
            headers, rows = source['headers'], source['rows']
            document = dict(schema_version='1.0', parser_revision=source['parser_revision'],
                headers=headers, rows=rows,
                header_span={'start': 0, 'end': rows[0]['span']['start'] if rows else len(text)},
                duplicate_headers=list(dict.fromkeys(h for h in headers if headers.count(h) > 1)))
            self.table.validators['csv-extraction-document.schema.json'].validate(document)
            if (self.table.semantics.extraction_errors(document) or
                    any(row['span']['end'] > len(text) for row in rows) or
                    (rows and rows[-1]['span']['end'] != len(text)) or
                    self.table.semantics.extraction_digest(document) != source['extraction_sha256']):
                raise ValueError()
            record = dict(scope={k: metadata['scope'][k] for k in
                ('tenant_id', 'consumer_id', 'actor_id', 'session_id')},
                source_id=metadata['source_id'], version=metadata['version'],
                content_sha256=metadata['content_sha256'], worker_provenance_id=source['worker_provenance_id'],
                document=document)
            if self.table.semantics.trusted_snapshot_errors(source, record,
                    record['scope'], set(self.allowed_workers())):
                raise ValueError()
            return record
        except Exception:
            raise ConversationClientError('CSV receipt cannot establish a qualified full source record') from None

    def receipt(self, metadata, manifest, raw):
        self.trusted_record(metadata, manifest, raw)
        return self._validated('csv-source-ingestion-manifest', manifest)


class CsvSourceCandidateClient(SourceCandidateClient):
    MAX_RESPONSE_BYTES = 1048576

    def _exchange(self, metadata, original_bytes, action):
        metadata = self.contract.metadata(metadata)
        self._bind(metadata, action)
        self.contract.original(metadata, original_bytes)
        digest = self.contract.semantics.metadata_digest(metadata) if action == 'source:ingest' else None
        token = _header(self.issue_access(action, dict(metadata['scope']), metadata['source_id'],
            metadata['version'], digest, [metadata['content_sha256']]))
        headers = {'Authorization': f'Bearer {self._service_bearer}',
            'X-Pythia-Conversation-Access': token, 'Accept': 'application/json'}
        if action == 'source:ingest':
            headers.update({'Content-Type': 'text/csv', 'Content-Length': str(len(original_bytes)),
                'X-Pythia-Content-SHA256': metadata['content_sha256']})
        raw = _http_bytes(self.base_url, 'PUT' if action == 'source:ingest' else 'GET',
            f"/conversation/sources/{metadata['source_id']}/versions/{metadata['version']}", headers,
            original_bytes if action == 'source:ingest' else None,
            {200, 201} if action == 'source:ingest' else {200}, self.transport, self.MAX_RESPONSE_BYTES)
        try:
            receipt = self.contract.turn.semantics.strict_loads(raw)
        except Exception:
            raise ConversationClientError('Invalid CSV receipt JSON') from None
        result = self.contract.receipt(metadata, receipt, original_bytes)
        self._bind(metadata, action)
        # Recheck dynamic workers after authorization callbacks as well.
        self.contract.trusted_record(metadata, result, original_bytes)
        return result
