"""Hosted Pythia consultation transport for team deployments.

Implements the consumer side of Pythia's hosted conversation-candidate
contract: canonical safe-integer JSON, SHA-256 request binding, short-lived
Ed25519-signed access proofs, and exact durable-context continuation. The
hosted engine projects only completed exchanges to its model producer; the
durable wire context still records every accepted turn. Service credentials
live in backend environment variables and never reach the browser, project
archives, or conversation records.
"""
import base64
import hashlib
import hmac
import json
import os
import re
import time
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urlsplit
from uuid import uuid4
from .consultation_capacity import negotiate

import httpx
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.serialization import load_pem_private_key

CONSUMER_ID = "chimera"
AUDIENCE = "pythia-conversation"
_CAPACITY_CACHE = {}
ENTITLED_ROLES = frozenset({"author", "instructional-designer", "administrator"})
POLL_SECONDS = 1.0
DEADLINE_SECONDS = 150
MAX_INTEGER = 9007199254740991
MAX_RESPONSE_BYTES = 1_048_576
_IDENTITY = re.compile(r"[A-Za-z0-9][A-Za-z0-9._:-]{0,127}")
SETTINGS = ("CHIMERA_PYTHIA_BASE_URL", "CHIMERA_PYTHIA_SERVICE_TOKEN", "CHIMERA_PYTHIA_SIGNING_KEY",
            "CHIMERA_PYTHIA_KEY_ID", "CHIMERA_PYTHIA_TENANT_ID", "CHIMERA_PYTHIA_CALLBACK_TOKEN")


class HostedError(ValueError):
    def __init__(self, message, status=503):
        super().__init__(message)
        self.status = status


# Canonicalization mirrors Pythia's hosted-text-package conversation semantics
# (RFC 8785 restricted to safe-integer JSON); keep byte-for-byte compatible.
def canonical_bytes(value):
    if value is None:
        return b"null"
    if isinstance(value, bool):
        return b"true" if value else b"false"
    if isinstance(value, int):
        if abs(value) > MAX_INTEGER:
            raise ValueError("integer outside interoperable range")
        return str(value).encode("ascii")
    if isinstance(value, str):
        value.encode("utf-8", errors="strict")
        return json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    if isinstance(value, list):
        return b"[" + b",".join(canonical_bytes(v) for v in value) + b"]"
    if isinstance(value, dict) and all(isinstance(k, str) for k in value):
        keys = sorted(value, key=lambda k: k.encode("utf-16-be", errors="strict"))
        return b"{" + b",".join(canonical_bytes(k) + b":" + canonical_bytes(value[k]) for k in keys) + b"}"
    raise ValueError("only null, booleans, safe integers, strings, lists and objects allowed")


def digest(value):
    return hashlib.sha256(canonical_bytes(value)).hexdigest()


def request_digest(request):
    return digest({"canonicalization": "conversation-safe-integer-jcs-v1",
                   "operation_kind": "turn", "request": request})


def active() -> bool:
    """Hosted intent is any hosted credential setting; partial setup fails closed."""
    return any(os.environ.get(name, "").strip() for name in SETTINGS[1:])


@dataclass(frozen=True)
class HostedConfiguration:
    base_url: str
    service_token: str
    key: Ed25519PrivateKey
    key_id: str
    tenant_id: str
    callback_token: str


def _exact_origin(value):
    try:
        parsed = urlsplit(value)
    except ValueError:
        return False
    if parsed.username or parsed.password or parsed.path not in {"", "/"} or parsed.query or parsed.fragment:
        return False
    if parsed.scheme == "https" and parsed.hostname:
        return True
    return parsed.scheme == "http" and parsed.hostname in {"127.0.0.1", "localhost", "::1"} and bool(parsed.port)


def _signing_key(value):
    """Accept inline PEM or an absolute path to a PEM file (systemd env files
    cannot hold multiline values)."""
    material = value
    if "-----BEGIN" not in value:
        path = Path(value)
        if not path.is_absolute():
            raise HostedError("CHIMERA_PYTHIA_SIGNING_KEY must contain a PEM private key or an "
                              "absolute path to one.")
        try:
            material = path.read_text(encoding="utf-8")
        except OSError:
            raise HostedError("The CHIMERA_PYTHIA_SIGNING_KEY file could not be read. Check its "
                              "path and permissions.") from None
    try:
        key = load_pem_private_key(material.encode(), password=None)
    except (ValueError, TypeError):
        key = None
    if not isinstance(key, Ed25519PrivateKey):
        raise HostedError("CHIMERA_PYTHIA_SIGNING_KEY must be an Ed25519 private key in PEM format.")
    return key


def configuration() -> HostedConfiguration:
    values = {name: os.environ.get(name, "").strip() for name in SETTINGS}
    missing = [name for name, value in values.items() if not value]
    if missing:
        raise HostedError("Hosted Pythia consultation is partially configured. Set "
                          + ", ".join(missing) + " in the backend environment.")
    if not _exact_origin(values["CHIMERA_PYTHIA_BASE_URL"]):
        raise HostedError("CHIMERA_PYTHIA_BASE_URL must be an exact HTTPS origin, or an HTTP "
                          "loopback address with a port for local evaluation.")
    service_token, callback_token = values["CHIMERA_PYTHIA_SERVICE_TOKEN"], values["CHIMERA_PYTHIA_CALLBACK_TOKEN"]
    if len(service_token) < 32 or len(callback_token) < 32 or service_token == callback_token:
        raise HostedError("Distinct hosted Pythia service and callback tokens of at least 32 characters are required.")
    key = _signing_key(values["CHIMERA_PYTHIA_SIGNING_KEY"])
    if any(not _IDENTITY.fullmatch(values[name]) for name in ("CHIMERA_PYTHIA_KEY_ID", "CHIMERA_PYTHIA_TENANT_ID")):
        raise HostedError("Hosted Pythia key and tenant identifiers must use letters, digits, '. _ : -' only.")
    return HostedConfiguration(values["CHIMERA_PYTHIA_BASE_URL"].rstrip("/"), service_token,
                               key, values["CHIMERA_PYTHIA_KEY_ID"], values["CHIMERA_PYTHIA_TENANT_ID"],
                               callback_token)


def account_roles(actor_id):
    """Current hosted account roles; None when the actor has no enabled account."""
    from .password_auth import AccountStore
    from .storage import ROOT
    for account in AccountStore(ROOT).accounts():
        if account["id"] == actor_id:
            return None if account["disabled"] else set(account["roles"])
    return None


def policy_revision(roles) -> str:
    return digest({"consumer": CONSUMER_ID, "entitled": sorted(set(roles) & ENTITLED_ROLES)})


def conversation_scope(config, actor_id, session_id):
    roles = account_roles(actor_id)
    if roles is None or not roles & ENTITLED_ROLES:
        raise HostedError("Hosted Pythia consultation requires an active account with the author, "
                          "instructional-designer or administrator role.", 403)
    if not _IDENTITY.fullmatch(actor_id) or not _IDENTITY.fullmatch(session_id):
        raise HostedError("This account or conversation identity cannot be used for hosted consultation.", 403)
    return {"tenant_id": config.tenant_id, "consumer_id": CONSUMER_ID, "actor_id": actor_id,
            "session_id": session_id, "policy_revision": policy_revision(roles)}


def _b64url(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")


def _proof(config, scope, action, *, request_sha256=None, operation_id=None):
    now = int(time.time())
    claims = {"iss": CONSUMER_ID, "aud": AUDIENCE, "sub": scope["actor_id"], "iat": now - 1,
              "exp": now + 120, "jti": uuid4().hex, "scope": scope, "action": action,
              "request_sha256": request_sha256, "operation_id": operation_id, "source_sha256": []}
    signing = _b64url(canonical_bytes({"alg": "EdDSA", "kid": config.key_id, "typ": "JWT"})) \
        + "." + _b64url(canonical_bytes(claims))
    return signing + "." + _b64url(config.key.sign(signing.encode("ascii")))


def _failure(response):
    if response.status_code in {401, 403}:
        return HostedError("Pythia declined this installation's hosted credentials or this user's "
                           "current access. Check with your administrator.", 403)
    if response.status_code == 409:
        return HostedError("The hosted conversation is out of step, usually because a previous "
                           "consultation is still finishing or was interrupted. Retry shortly or "
                           "start a new conversation.", 409)
    if response.status_code == 429:
        return HostedError("The hosted Pythia consultation allowance for this installation is "
                           "exhausted. Contact your operator.", 429)
    if response.status_code in {413, 422}:
        try:
            error = response.json().get('error', {}) if len(response.content) <= MAX_RESPONSE_BYTES else {}
        except (ValueError, AttributeError):
            error = {}
        if isinstance(error, dict) and error.get('code') == 'consultation_capacity_exceeded':
            return HostedError("Pythia's configured model or conversation capacity would be exceeded. "
                "Select fewer sources, shorten the message, or start a new conversation. "
                "No model call was made and the saved history is unchanged.", 422)
        if isinstance(error, dict) and error.get('code') == 'authoring_capacity_exceeded':
            return HostedError('The selected draft context is invalid or exceeds the hosted model budget. Select fewer sources or a smaller section. No model call was made and nothing was applied.', 422)
        return HostedError("Pythia rejected this consultation request. Shorten the question or "
                           "start a new conversation.", 422)
    return HostedError("The hosted Pythia engine is unavailable. Retry explicitly; no failed turn "
                       "joins follow-up context.", 503)


def _operation(response, expected_status, scope, message_id, bound_digest, revision, operation_id=None):
    if response.status_code != expected_status:
        raise _failure(response)
    if len(response.content) > MAX_RESPONSE_BYTES:
        raise HostedError("The hosted Pythia engine returned an oversized response.", 502)
    try:
        operation = response.json()
    except ValueError:
        raise HostedError("The hosted Pythia engine returned an unreadable response.", 502) from None
    if (not isinstance(operation, dict) or operation.get("scope") != scope
            or operation.get("message_id") != message_id
            or operation.get("request_sha256") != bound_digest
            or operation.get("context_revision") != revision + 1
            or (operation_id is not None and operation.get("operation_id") != operation_id)
            or operation.get("status") not in {"accepted", "running", "completed", "failed",
                                               "cancelled", "interrupted"}):
        raise HostedError("The hosted Pythia engine returned a response that does not match this "
                          "consultation request.", 502)
    return operation


def _headers(config, proof):
    return {"Authorization": "Bearer " + config.service_token,
            "X-Pythia-Conversation-Access": proof, "Accept": "application/json"}


def consult(config, scope, *, message_id, idempotency_key, revision, messages, question,
            deadline_seconds=DEADLINE_SECONDS):
    """Submit one hosted turn and poll it to a terminal state.

    Returns an outcome dict once the turn is durably accepted: advice or error,
    plus the exact wire messages to append and the new context revision. Raises
    HostedError before acceptance; the durable context is unchanged then.
    """
    context = {"messages": [{"message_id": m["message_id"], "role": m["role"], "content": m["content"]}
                            for m in messages], "source_snapshots": []}
    request = {"schema_version": "1.0", "scope": scope, "message_id": message_id,
               "idempotency_key": idempotency_key, "expected_context_revision": revision,
               "context": context, "context_sha256": digest(context),
               "message": question, "requested_outputs": []}
    bound = request_digest(request)
    allowance = limits(config)
    usage = measure(allowance, scope, revision, messages, question)
    if usage['exceeded']:
        raise HostedError(capacity_error(usage), 422)
    try:
        with httpx.Client(base_url=config.base_url, timeout=20, trust_env=False,
                          follow_redirects=False) as client:
            proof = _proof(config, scope, "turn:submit", request_sha256=bound)
            response = client.post("/conversation/turns", content=canonical_bytes(request),
                                   headers={**_headers(config, proof), "Content-Type": "application/json"})
            operation = _operation(response, 202, scope, message_id, bound, revision)
            operation_id = operation["operation_id"]

            def read(cancel=False):
                action = "operation:cancel" if cancel else "operation:read"
                proof = _proof(config, scope, action, operation_id=operation_id)
                path = f"/conversation/operations/{operation_id}" + ("/cancel" if cancel else "")
                method = client.post if cancel else client.get
                return _operation(method(path, headers=_headers(config, proof)),
                                  200, scope, message_id, bound, revision, operation_id)

            deadline = time.monotonic() + deadline_seconds
            while operation["status"] in {"accepted", "running"}:
                if time.monotonic() > deadline:
                    try:
                        operation = read(cancel=True)
                    except HostedError:
                        operation = read()
                    if operation["status"] in {"accepted", "running"}:
                        raise HostedError("Pythia did not finish in time and could not be cancelled. "
                                          "If follow-up consultations conflict, start a new "
                                          "conversation.", 504)
                    break
                time.sleep(POLL_SECONDS)
                operation = read()
    except httpx.HTTPError:
        raise HostedError("The hosted Pythia engine could not be reached. Retry explicitly; no "
                          "failed turn joins follow-up context.", 503) from None
    appended = [{"message_id": message_id, "role": "user", "content": question}]
    if operation["status"] == "completed":
        result = operation.get("result")
        if not isinstance(result, dict) or not isinstance(result.get("content"), str):
            raise HostedError("The hosted Pythia engine returned an invalid consultation result.", 502)
        appended.append({"message_id": operation["operation_id"], "role": "assistant",
                         "content": result["content"]})
        return {"advice": result, "error": None, "appended": appended, "revision": revision + 1}
    message = {"failed": "Pythia could not complete this consultation. Retry explicitly; the failed "
                         "turn never joins the advice context.",
               "cancelled": "This consultation was cancelled before Pythia answered. Retry explicitly.",
               "interrupted": "Pythia was interrupted before the response was saved. Retry explicitly."
               }[operation["status"]]
    return {"advice": None, "error": message, "appended": appended, "revision": revision + 1}


def _capabilities(config):
    """Verify the hosted engine answers with engine capabilities for our credentials."""
    try:
        with httpx.Client(base_url=config.base_url, timeout=10, trust_env=False,
                          follow_redirects=False) as client:
            response = client.get("/capabilities",
                                  headers={"Authorization": "Bearer " + config.service_token})
    except httpx.HTTPError:
        raise HostedError("The hosted Pythia engine could not be reached. Check the configured "
                          "address and service credentials.", 503) from None
    if response.status_code != 200 or len(response.content) > MAX_RESPONSE_BYTES:
        raise HostedError("The hosted Pythia engine did not accept this installation's credentials.", 503)
    try:
        value = response.json()
    except ValueError:
        raise HostedError("The hosted Pythia engine returned an unreadable response.", 502) from None
    if not isinstance(value, dict) or not isinstance(value.get("capabilities"), dict):
        raise HostedError("The configured address did not identify a compatible Pythia Engine.", 503)
    return value


def limits(config, *, refresh=False):
    key = (config.base_url, hashlib.sha256(config.service_token.encode()).hexdigest())
    cached = _CAPACITY_CACHE.get(key)
    if refresh or cached is None or time.monotonic() - cached[0] >= 60:
        advertised = _capabilities(config).get('consultationLimits')
        _CAPACITY_CACHE[key] = (time.monotonic(), advertised)
    try:
        return negotiate(_CAPACITY_CACHE[key][1])
    except ValueError as error:
        raise HostedError(str(error), 503) from None


def measure(allowance, scope, revision, messages, question):
    context = {'messages': messages, 'source_snapshots': []}
    # Fixed-length identifiers match submit's UUID and SHA-256 identifiers.
    request = {'schema_version': '1.0', 'scope': scope, 'message_id': 'm' * 32,
               'idempotency_key': 'k' * 64, 'expected_context_revision': revision,
               'context': context, 'context_sha256': digest(context),
               'message': question, 'requested_outputs': []}
    usage = {'contextChars': sum(len(m['content']) for m in messages) + len(question),
             'messageChars': max([len(question), *(len(m['content']) for m in messages)]),
             'historyMessages': len(messages), 'requestBytes': len(canonical_bytes(request))}
    if allowance.get('tokenCounting') == 'conservative-utf8-bytes':
        model_input = {'conversation': messages, 'current_question': question}
        usage['modelInputTokens'] = allowance['modelFixedInputBytes'] + len(json.dumps(model_input, ensure_ascii=False).encode('utf-8'))
    exceeded = [name for name, used in usage.items() if used > allowance[name]]
    warning = any(used >= allowance[name] * .8 for name, used in usage.items())
    return {'used': usage, 'limits': allowance, 'exceeded': exceeded,
            'status': 'full' if exceeded else 'warning' if warning else 'available'}


def capacity_error(usage):
    labels = {'contextChars': 'conversation text', 'messageChars': 'one message or its selected sources',
              'historyMessages': 'saved conversation messages', 'requestBytes': 'request size',
              'modelInputTokens': 'the conservative model input estimate'}
    names = ', '.join(labels[name] for name in usage['exceeded'])
    return (f'This request exceeds the connection capacity for {names}. '
            'Select fewer sources, shorten the message, or start a new conversation. '
            'Your draft and saved history are unchanged; no model call was made.')


def check(config):
    metadata = _capabilities(config)
    key = (config.base_url, hashlib.sha256(config.service_token.encode()).hexdigest())
    _CAPACITY_CACHE[key] = (time.monotonic(), metadata.get('consultationLimits'))
    allowance = limits(config)
    authoring = metadata.get('authoring', {})
    if not isinstance(authoring, dict):
        raise HostedError('Pythia advertised invalid authoring capabilities.', 503)
    return {"mode": "hosted-text", "consultation": True, "authoring_drafts": authoring.get('contentDrafts') is True,
            'storyboard_enhancements': authoring.get('storyboardEnhancements') is True,
            'authoring_orchestration': False, 'web_research': False,
            'consultationLimits': allowance,
            "attachments": False, "private_history_access": False, "exports": False,
            "media_tools": False, "approval_authority": False,
            "context": "Explicit text supplied with each call; the hosted engine keeps only this "
                       "conversation's durable context",
            "data_flow": "Consultation text is sent to the operator-configured hosted Pythia engine"}


def turn_access_allowed(claims) -> bool:
    """Current-access decision for Pythia's per-turn callback; deny on any doubt."""
    if not isinstance(claims, dict) or not isinstance(claims.get("scope"), dict):
        return False
    scope = claims["scope"]
    values = {key: scope.get(key) for key in
              ("tenant_id", "consumer_id", "actor_id", "session_id", "policy_revision")}
    if any(not isinstance(value, str) or not _IDENTITY.fullmatch(value) for value in values.values()):
        return False
    try:
        config = configuration()
    except HostedError:
        return False
    if values["consumer_id"] != CONSUMER_ID or values["tenant_id"] != config.tenant_id:
        return False
    roles = account_roles(values["actor_id"])
    if roles is None or not roles & ENTITLED_ROLES:
        return False
    if not hmac.compare_digest(values["policy_revision"], policy_revision(roles)):
        return False
    if claims.get('aud') == 'pythia-authoring':
        return authoring_access_allowed(claims)
    return True


def authoring_bytes(document):
    return json.dumps(document, ensure_ascii=False, allow_nan=False, sort_keys=True, separators=(',', ':')).encode('utf-8')


def authoring_digest(document):
    return hashlib.sha256(authoring_bytes(document)).hexdigest()


def _authoring_proof(config, document, action, operation_id=None):
    now = int(time.time())
    claims = {'iss': CONSUMER_ID, 'aud': 'pythia-authoring', 'sub': document['scope']['actor_id'],
        'iat': now - 1, 'exp': now + 120, 'jti': uuid4().hex, 'scope': document['scope'],
        'action': action, 'request_sha256': authoring_digest(document) if action == 'draft:submit' else None,
        'operation_id': operation_id, 'source_sha256': [],
        **{k: document[k] for k in ('project_id', 'source_revision', 'request_id', 'kind')}}
    signing = _b64url(authoring_bytes({'alg': 'EdDSA', 'kid': config.key_id, 'typ': 'JWT'})) + '.' + _b64url(authoring_bytes(claims))
    return signing + '.' + _b64url(config.key.sign(signing.encode('ascii')))


def author(config, actor, project_id, revision, request_id, kind, payload):
    """One durable, idempotent hosted draft; no scene is applied here."""
    scope = conversation_scope(config, actor.actorId, 'draft-' + authoring_digest([project_id, request_id]))
    document = {'version': 1, 'scope': scope, 'project_id': project_id, 'source_revision': revision,
                'request_id': request_id, 'kind': kind, 'payload': payload}
    raw = authoring_bytes(document)
    if len(raw) > 1048576:
        raise HostedError('The selected draft context exceeds 1 MiB. Select fewer sources; no text was removed.', 422)
    capability = 'contentDrafts' if kind == 'content' else 'storyboardEnhancements'
    metadata = _capabilities(config).get('authoring', {})
    if not isinstance(metadata, dict) or metadata.get(capability) is not True:
        raise HostedError('This hosted Pythia engine does not yet support the requested storyboard drafting. Update the engine first.', 503)
    advertised_bytes = metadata.get('requestBytes', 1048576)
    if type(advertised_bytes) is not int or advertised_bytes < 4096:
        raise HostedError('Pythia advertised invalid authoring capacity.', 503)
    if len(raw) > min(1048576, advertised_bytes):
        raise HostedError('The selected draft exceeds the hosted request allowance. Select fewer sources; no text was removed.', 422)
    expected = authoring_digest(document)

    def validate(response, status, operation_id=None):
        if response.status_code != status:
            raise _failure(response)
        if len(response.content) > MAX_RESPONSE_BYTES:
            raise HostedError('Pythia returned an oversized draft.', 502)
        result = response.json()
        if (not isinstance(result, dict) or result.get('request_sha256') != expected or
                not isinstance(result.get('operation_id'), str) or
                not _IDENTITY.fullmatch(result['operation_id']) or
                (operation_id is not None and result['operation_id'] != operation_id) or
                result.get('status') not in {'accepted', 'completed', 'failed', 'cancelled'}):
            raise HostedError('Pythia returned a draft for a different request.', 502)
        return result

    try:
        with httpx.Client(base_url=config.base_url, timeout=20, trust_env=False, follow_redirects=False) as client:
            def headers(action, operation=None):
                return {'Authorization': 'Bearer ' + config.service_token,
                        'X-Pythia-Authoring-Access': _authoring_proof(config, document, action, operation),
                        'Content-Type': 'application/json'}
            result = validate(client.post('/authoring/drafts', content=raw, headers=headers('draft:submit')), 202)
            operation = result['operation_id']
            deadline = time.monotonic() + DEADLINE_SECONDS
            while result['status'] == 'accepted':
                if time.monotonic() > deadline:
                    validate(client.post(f'/authoring/operations/{operation}/cancel', headers=headers('draft:cancel', operation)), 200, operation)
                    raise HostedError('Drafting timed out. Nothing was applied; retry explicitly.', 503)
                time.sleep(POLL_SECONDS)
                result = validate(client.get('/authoring/operations/' + operation, headers=headers('draft:read', operation)), 200, operation)
            if result['status'] != 'completed':
                raise HostedError('Pythia could not complete this draft. Nothing was applied; retry explicitly.', 503)
            if not isinstance(result.get('result'), dict) or authoring_digest(result['result']) != result.get('result_sha256'):
                raise HostedError('Pythia returned an unverified draft. Nothing was applied.', 502)
            return result['result']
    except HostedError:
        raise
    except (httpx.HTTPError, ValueError, KeyError, TypeError):
        raise HostedError('Hosted drafting was interrupted. No automatic retry was made and nothing was applied.', 503) from None


def authoring_access_allowed(claims):
    """Recheck project membership, revision and source access on every draft call."""
    from . import storage, pythia_talk as talk
    from .identity import LocalIdentityDirectory
    from .main import get_authorization_policy
    from .password_auth import HostedAuthorizationPolicy, public_origin
    from .platform import ActorContext
    try:
        project_id = claims['project_id']
        if not isinstance(project_id, str) or not _IDENTITY.fullmatch(project_id):
            return False
        policy = get_authorization_policy()
        if isinstance(policy, HostedAuthorizationPolicy):
            installation, mode = public_origin(), 'team'
        else:
            snapshot = LocalIdentityDirectory(storage.ROOT).snapshot()
            installation, mode = snapshot.actor.installationId, snapshot.policy.deploymentMode
        actor = ActorContext(actorId=claims['scope']['actor_id'], actorDisplayName='Hosted author',
            installationId=installation, deploymentMode=mode)
        if any(not policy.allows(actor, action, project_id) for action in ('project.view', 'enhancement.job.create')):
            return False
        if storage.read_project(project_id).storyboard.revision != claims['source_revision']:
            return False
        if claims['kind'] == 'enhancement':
            job = storage.read_enhancement_job(project_id, claims['request_id'])
            if job.actorId != actor.actorId or job.sourceRevision != claims['source_revision']:
                return False
            if job.cancelRequested:
                return claims['action'] == 'draft:cancel'
            if job.status not in {'queued', 'running', 'completed'}:
                return False
            from .enhancement_jobs import _load_job_context
            _load_job_context(job)  # Selected immutable source versions must still exist/read.
        elif claims['kind'] == 'content':
            state = talk.read_state(talk.state_path(project_id, actor))
            action_id = claims['request_id'].split('.')[0]
            action = next(a for a in state.get('actions', []) if a['id'] == action_id)
            if action['status'] not in {'drafting', 'pending'} or action['sourceRevision'] != claims['source_revision']:
                return False
            if state.get('planning', {}).get('stage') != 'designing':
                return False
            talk.check_binding(project_id, action['binding'])
        else:
            return False
        return True
    except (ValueError, KeyError, TypeError, FileNotFoundError, StopIteration, OSError):
        return False
