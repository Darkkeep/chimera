"""Opt-in, personless usage events for successful hosted SCORM exports."""

import hashlib
import hmac
import json
import logging
import os
from typing import Literal
from urllib.request import HTTPRedirectHandler, Request, build_opener

from .platform import ActorContext

logger = logging.getLogger(__name__)


class _NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


def capture_scorm_export(actor: ActorContext, export_format: Literal["scorm12", "scorm2004"]) -> None:
    if actor.deploymentMode != "team" or os.environ.get("CHIMERA_POSTHOG_ENABLED") != "true":
        return
    token = os.environ.get("CHIMERA_POSTHOG_PROJECT_TOKEN", "")
    secret = os.environ.get("CHIMERA_POSTHOG_PSEUDONYM_SECRET", "")
    if not token or len(secret) < 32:
        logger.warning("Chimera SCORM analytics configuration is incomplete")
        return
    identity = hmac.new(secret.encode(), f"chimera-scorm:{actor.actorId}".encode(), hashlib.sha256).hexdigest()
    body = {
        "api_key": token,
        "event": "chimera_scorm_export_generated",
        "distinct_id": identity,
        "properties": {"export_format": export_format, "$process_person_profile": False, "$geoip_disable": True},
    }
    request = Request("https://us.i.posthog.com/i/v0/e/", data=json.dumps(body).encode(), headers={"Content-Type": "application/json"}, method="POST")
    try:
        with build_opener(_NoRedirect()).open(request, timeout=2) as response:
            result = json.loads(response.read(4096))
            if not isinstance(result, dict) or result.get("quota_limited"):
                logger.warning("Chimera SCORM analytics event acceptance is unverified")
    except (OSError, ValueError):
        logger.warning("Chimera SCORM analytics event could not be delivered")
