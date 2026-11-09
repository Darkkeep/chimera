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

import httpx
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.serialization import load_pem_private_key

CONSUMER_ID = "chimera"
AUDIENCE = "pythia-conversation"
HOSTED_CONTEXT_CHARS = 24_000
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


def check(config):
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
    return {"mode": "hosted-text", "consultation": True, "authoring_drafts": False,
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
    return hmac.compare_digest(values["policy_revision"], policy_revision(roles))
