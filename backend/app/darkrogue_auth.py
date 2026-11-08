"""Verify DARKROGUE's short-lived SSO handoff tokens; sessions stay Chimera-owned.

DARKROGUE (the sibling Next.js platform) authenticates the browser with its
own Supabase-backed session and mints a short-lived HS256 handoff token for
this exact Chimera origin. Chimera verifies the shared-secret signature,
issuer, audience, expiry and one-time token ID server-side, then issues its
own normal revocable session cookie. DARKROGUE roles map to Chimera roles on
every sign-in; Supabase credentials are never shared with Chimera.
"""
import base64
import hashlib
import hmac
import json
import os
import time

from .deployment import darkrogue_origin, public_origin

MAX_TOKEN_CHARS = 4096
TOKEN_SECONDS = 90
ROLE_MAP = {
    "ADMIN": ["administrator", "author", "instructional-designer"],
    "INSTRUCTOR": ["author", "instructional-designer"],
    "LEARNER": ["reviewer"],
}


class HandoffError(ValueError):
    pass


def sso_secret() -> str:
    secret = os.environ.get("CHIMERA_DARKROGUE_SSO_SECRET", "")
    if len(secret) < 32:
        raise HandoffError("DARKROGUE sign-in is not configured on this server")
    return secret


def _b64url_decode(value: str) -> bytes:
    if any(c not in "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_" for c in value):
        raise HandoffError("Sign-in token is invalid")
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


def verify_handoff(token: str, *, secret: str | None = None, now: float | None = None) -> dict:
    """Validate signature, issuer, audience, lifetime and claim shapes.

    One-time token-ID replay enforcement happens in the account store under
    its filesystem transaction; this function is pure verification.
    """
    secret = secret if secret is not None else sso_secret()
    now = time.time() if now is None else now
    if not isinstance(token, str) or not 1 <= len(token) <= MAX_TOKEN_CHARS or token.count(".") != 2:
        raise HandoffError("Sign-in token is invalid")
    header_part, payload_part, signature_part = token.split(".")
    expected = hmac.new(secret.encode(), f"{header_part}.{payload_part}".encode(), hashlib.sha256).digest()
    if not hmac.compare_digest(expected, _b64url_decode(signature_part)):
        raise HandoffError("Sign-in token is invalid")
    try:
        header = json.loads(_b64url_decode(header_part))
        claims = json.loads(_b64url_decode(payload_part))
    except (ValueError, UnicodeDecodeError):
        raise HandoffError("Sign-in token is invalid") from None
    if not isinstance(header, dict) or header.get("alg") != "HS256" or header.get("typ") != "JWT":
        raise HandoffError("Sign-in token is invalid")
    if not isinstance(claims, dict):
        raise HandoffError("Sign-in token is invalid")
    if claims.get("iss") != darkrogue_origin() or claims.get("aud") != public_origin():
        raise HandoffError("Sign-in token was not issued for this installation")
    expires = claims.get("exp")
    issued = claims.get("iat")
    if not isinstance(expires, (int, float)) or not isinstance(issued, (int, float)) or expires <= now or issued > now + 30 or expires - issued > 15 * 60:
        raise HandoffError("Sign-in token expired. Try signing in again.")
    subject, name, email, role, token_id = (claims.get(key) for key in ("sub", "name", "email", "role", "jti"))
    if not all(isinstance(value, str) and 0 < len(value) <= 254 for value in (subject, name, email, role, token_id)):
        raise HandoffError("Sign-in token is invalid")
    if role not in ROLE_MAP:
        raise HandoffError("Sign-in token is invalid")
    return {"sub": subject, "name": name[:120], "email": email, "role": role, "jti": token_id, "exp": float(expires)}
