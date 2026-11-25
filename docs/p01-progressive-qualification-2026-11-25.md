# P-01 progressive authoring qualification — 25 November 2026

Provider-free engineering: PASS. Founder acceptance: NOT PERFORMED. No merge, deployment, credential change or paid inference occurred.

Canonical Chimera checkout is `C:\inetpub\Chimera2`. Existing unrelated release/Experience modifications remain preserved. Pythia work is isolated in `C:\inetpub\Pythia-p01`, on PR #52's existing branch, based on revision `448bd50107110199c9c7cbc67d3101b632c48e9f`; the original dirty `C:\inetpub\Pythia` is untouched.

## Implementation and charter

This extends Issue #43's proposal journal and existing Studio editor. Findings remain reviewable proposals; only explicit acceptance writes a scene, with current project authorization, revision and structural-source guards. Author edits and unsaved drafts remain owned by the existing editor. This supports the charter's familiar, uninterrupted authoring and explicit author control.

Opt-in Pythia incremental mode performs independent bounded finding calls, persisting each complete, exact-source-bound finding before requesting the next. It does not split a finished answer. Default behavior remains unchanged. `PYTHIA_SHOWCASE_INCREMENTAL=1` enables this runtime path; it can issue up to six finding calls plus the existing final call. No model quality, paid latency or cost acceptance is claimed.

The existing private native bridge transports read-only findings with a revocable source-owner grant bound to one Chimera author and project. Existing service authentication, current source account status and target project permissions are checked. Reads cannot submit inference or resolve uncertain admission. Grant secrets stay in private runtime state outside exported projects; event payloads contain provenance, not grants. `CHIMERA_PROGRESSIVE_HANDOFF_ENABLED=true` and `VITE_CHIMERA_PROGRESSIVE_HANDOFF_ENABLED=true` explicitly enable the companion feature. Demo producers remain separately gated.

## Findings corrected

- Page-hint ranking selected Page 17 correctly, but a subsequent document-order sort put Page 170 first. Preserve relevance order when explicit page hints exist.
- Initial handoff used the serialized request rather than its SHA-256. A real cross-product run found this; regression now checks the exact request digest.
- Browser acceptance must wait for the scene save and leave its editing controls before another guarded action. The harness uses the real Stage action and awaits mutation responses; assertions remain intact.

## Evidence

The loopback harness uses real OAuth authorization-code/PKCE, Gateway SQLite, authenticated Engine HTTP, authenticated Chimera API, built Studio UI, private grant creation/revocation and actual process restarts. Producers are hardwired controlled responses. Source intake uses a synthetic reviewed-source fixture, not a new browser PDF extraction qualification; previously completed large-source qualification is retained.

Eight browser/integration checks passed: first finding durable before later work; real source consent and project-bound connection; accept/save/restart/continue with the same editor DOM, focus and unsaved draft; later acceptance preserving author text/citations; deduplicated connection replay; foreign authenticated author denied; source revocation fences even repeated acceptance; Engine process restart retains findings and repeated reads make no new calls. Counts: three controlled finding invocations, one controlled final answer, zero paid invocations.

Local evidence: `workspace/p01-cross-product/result.json`, `studio-retained.png`, `source-grant-revoked.png`. Exact-head reruns identify both commits in the JSON. Focused suites cover source selection, citation tampering, stale writes, target revocation, restart fencing and replay. Human acceptance and production/hosted operation remain distinct and unperformed.

## Consolidated Founder procedure

Run from PowerShell on this laptop, after the engineer records exact heads:

```powershell
Set-Location C:\inetpub\Chimera2
$env:VITE_CHIMERA_STUDIO_ENABLED='true'
$env:VITE_CHIMERA_STUDIO_DEFAULT='true'
$env:VITE_CHIMERA_PROGRESSIVE_HANDOFF_ENABLED='true'
npm --prefix frontend run build
node C:\inetpub\Pythia-p01\gateway\scripts\qualify-p01-chimera.mjs C:\inetpub\Chimera2 C:\inetpub\Pythia\.venv\Scripts\python.exe --founder
```

This creates disposable loopback services and two headed browser windows, signs in synthetic accounts, opens a controlled consultation, creates a private source grant, and connects the first finding to a fresh authenticated Chimera project. No production configuration or accounts are used. It stops before author acceptance. The previous automated PASS does not count as Founder acceptance.

1. Inspect the first proposal: source, Page 17, exact quote, finding and consultation identities. Distinguish the exact quote from advisory content.
2. Choose Accept and edit. Select the scene text, open Properties, change it and save. Open Properties again and leave another edit unsaved.
3. At the harness console enter `restart`; in Chimera use Resume live connection. Enter `next` to allow the independent second finding to run. Confirm the same editor remains focused and the unsaved text is intact.
4. Save the draft, select Stage and accept the second proposal. Confirm both scenes and the first author's saved changes. Reopen the first scene to verify persistence.
5. In the Pythia window revoke the handoff. In Chimera retry Resume live connection: it must report denial while authored scenes remain intact.
6. Record PASS/FAIL and observations for each step separately. Enter `stop` to close only the disposable services. Generated test data is retained locally; private grant material must not be copied into reports.

Founder mode provides a review session, not an automated acceptance verdict. Paid-model rehearsal remains separately unauthorized. No production enablement is requested by this procedure.
