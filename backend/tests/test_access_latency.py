import asyncio
import time
import unittest
from unittest.mock import patch
from starlette.requests import Request
from fastapi.testclient import TestClient
from backend.app import main
from backend.app.platform import LOCAL_ACTOR


class AuthorizationSchedulingTests(unittest.IsolatedAsyncioTestCase):
    async def test_slow_authority_does_not_block_other_requests_on_event_loop(self):
        request = Request({"type": "http", "method": "GET", "path": "/api/projects/example", "headers": [], "path_params": {"project_id": "example"}})
        started = time.perf_counter()
        async def heartbeat():
            await asyncio.sleep(.02)
            return time.perf_counter() - started
        with patch.object(main, "resolve_actor_context", return_value=LOCAL_ACTOR), patch.object(main, "_request_action", return_value="project.view"), patch.object(main, "_require_action", side_effect=lambda *_: time.sleep(.4)):
            guard = main._require_request_access(request, object())
            async def protected_request():
                await anext(guard)
                await guard.aclose()
            _, elapsed = await asyncio.gather(protected_request(), heartbeat())
        self.assertLess(elapsed, .25, "Blocking authority I/O stalled the API event loop")


class DiagnosticHeaderTests(unittest.TestCase):
    def test_public_health_timing_contains_only_aggregate_metrics(self):
        response = TestClient(main.app).get("/api/health")
        self.assertEqual(response.status_code, 200)
        self.assertRegex(response.headers["server-timing"], r'^chimera;dur=[0-9.]+, authority;dur=[0-9.]+;desc="[0-9]+ checks"$')
