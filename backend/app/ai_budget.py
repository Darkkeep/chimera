"""Bound complete provider submissions; never silently drop selected evidence."""
import json

MAX_REQUEST_BYTES = 256000


def checked_json(payload: dict) -> str:
    serialized = json.dumps(payload, ensure_ascii=False)
    size = len(serialized.encode("utf-8"))
    if size > MAX_REQUEST_BYTES:
        raise ValueError(f"AI submission is {size:,} bytes; the limit is {MAX_REQUEST_BYTES:,}. Select fewer scenes or smaller references and retry. No provider request was sent.")
    return serialized


def provider_usage(response: dict) -> dict | None:
    usage = response.get("usage")
    if not isinstance(usage, dict):
        return None
    result = {key: usage[key] for key in ("prompt_tokens", "completion_tokens", "total_tokens")
              if type(usage.get(key)) is int and 0 <= usage[key] <= 1000000000}
    return result or None
