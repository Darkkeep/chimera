#!/usr/bin/env python3
"""Check read-only release endpoints without following redirects."""
import argparse
import json
import re
from urllib.parse import urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener


class RejectRedirects(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("origin")
    parser.add_argument("--sha", help="Expected frontend artifact commit SHA")
    args = parser.parse_args()
    origin = urlsplit(args.origin)
    if (origin.scheme != "https" or not origin.hostname or origin.username is not None
            or origin.path not in ("", "/") or origin.query or origin.fragment):
        parser.error("origin must be an HTTPS origin")
    if args.sha and not re.fullmatch(r"[0-9a-f]{40}", args.sha):
        parser.error("--sha requires a full commit SHA")
    opener = build_opener(RejectRedirects())

    def get(path):
        headers = {"Accept": "application/json", "Cache-Control": "no-cache"}
        request = Request(args.origin.rstrip("/") + path, headers=headers)
        with opener.open(request, timeout=10) as response:
            return json.loads(response.read(65536))

    try:
        if get("/api/health") != {"status": "ok"}:
            raise ValueError("Unexpected health response")
        print("Health OK")
        if args.sha:
            identity = get("/release-version.json")
            if not isinstance(identity, dict) or identity.get("sourceSha") != args.sha:
                raise ValueError("Release SHA mismatch")
            print(f"Frontend artifact matches {args.sha}")
    except (OSError, ValueError) as error:
        parser.exit(1, f"Release smoke failed ({type(error).__name__}).\n")


if __name__ == "__main__":
    main()
