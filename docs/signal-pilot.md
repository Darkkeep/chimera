# DARKROGUE Signal: Chimera pilot (v0)

Signal is a user-initiated, text-only reporting channel. It is intentionally **not** a crash telemetry collector or a shared multi-product service yet.

## Pilot workflow
- Open **Help & Feedback** in Chimera, choose the category and describe the issue (at least 10 characters).
- Technical metadata is **opt-in** and limited to the pathname, browser user-agent (truncated) and declared app version.
- POST `/api/signal/reports` returns HTTP 201 with `{"id":"SIG-…","status":"received"}`. The user sees the reference.
- Records persist in `<CHIMERA_DATA_ROOT>/signal/signal-reports.sqlite3` (using the application's configured ROOT). No public listing API is provided.
- Report types: `problem`, `confusing`, `idea`, `praise`. Status begins at `new`.

## Safety and limitations
- **Not a live constellation-wide deployment.** This is the first reference integration, pending testing, administration, hosting and a standalone Signal service.
- An anonymous endpoint is limited to 10 reports per remote address per UTC hour per process-shared SQLite DB. Configure `SIGNAL_RATE_SALT` as a unique secret in hosted environments. Reverse-proxy abuse protection is still recommended.
- No uploaded files, screenshots, page query parameters, project content, emails or arbitrary metadata are accepted.
- Free-text reports may still contain data typed by users: apply restricted database access, retention and review procedures before inviting broad public traffic.
- The server refuses `followUpRequested` until reliable, consent-based contact routing is available.
- Follow-up, founder dashboard, GitHub issue automation, deduplication, and cross-product authentication are later phases.
- Ensure writable persistent storage. An ephemeral disk will lose reports on redeploy.
- For local installations, submission stays local. No external forwarding occurs.

## Developer smoke test

```bash
curl -i http://127.0.0.1:8000/api/signal/reports \
  -H 'Content-Type: application/json' \
  -d '{"product":"chimera","kind":"problem","description":"The export action failed while I was testing."}'
```

Expected: 201, a SIG-prefixed receipt. Also test invalid payload (422), invalid origin (403), and repeated submissions (429 after ten in one hour).

## Next steps
1. Add admin-only review and status transition endpoints.
2. Move the protocol and database to `Darkkeep/signal` when repo provisioning is available.
3. Add consent-based authenticated follow-up and reporting from error surfaces.
4. Package the UI client and migrate other constellation products.
