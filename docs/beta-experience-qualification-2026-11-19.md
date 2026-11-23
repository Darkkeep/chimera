# Beta qualification against Experience — November 19, 2026

## Scope and identity

The Owner selected Experience with SCORM 1.2 as the current LMS target and deferred actual screen-reader and physical touch-device checks. Those checks are deferred, not passed. Full human keyboard-only authoring remains separate from automated keyboard coverage. SCORM 2004 remains regression coverage, not the target-LMS acceptance scope.

Base source: `6ba164e3d06d048d66521bc74c03ad18cfffc2d1` in the canonical `C:/inetpub/Chimera2` checkout. The follow-up adds explicit `schemaversion` 1.2 metadata for Experience's importer and adapts the capacity/draft-dismissal fixtures to the accepted Pythia entry labels and disclosures. Missing version metadata was an Experience interoperability mismatch; this does not invalidate previous successful exports to other LMSs.

## Verification and corrections

- Full local backend: 697 tests run, 72 explicit skips; passed before the small manifest correction. The manifest regression passed after correction.
- Frontend build, nine retained qualification artifacts, pinned onboarding verification, visual/export and isolated HTTPS sign-in: passed.
- The initial local full-browser diagnostic was stopped after 69 completed cases when the Owner authorized hosted CI; it is not a full local pass.
- Hosted run [44636262990](https://github.com/Darkkeep/chimera/actions/runs/44636262990) tested the base commit. It failed three stale fixture cases in shard 2 of every engine. The revised labels/disclosures retain the capacity, delayed-response, draft-preservation and zero-unsolicited-submission assertions. All nine affected cases passed across Chromium, Firefox and WebKit without retries locally. Exact corrected-commit hosted CI is a separate final gate, recorded in PR #40.
- The existing three-scene Studio golden path passed before and after the metadata correction, producing real SCORM ZIPs through the export endpoint. It seeds synthetic scenes through the API and exercises UI edits/review/preview; it is not a full UI-only course creation or instructional-quality attestation.

## Experience interoperability

Experience base: `65feacf885b10a2094ac4b3f47f4593ac38061d6`, with the local scoped iframe correction in `C:/inetpub/darkrogue-experience-operations`. The original runtime sandbox omitted `allow-forms` at both iframe layers and blocked the question form before scoring. The correction permits form events while retaining isolated content origin, existing sandbox restrictions and CSP `form-action 'none'`. No hosted Experience code or data was changed.

The actual corrected Chimera ZIP passed Experience import, isolated Chromium launch, close/fresh-launch resume, branching, scored question, persisted 100 percent/passed/completed SCORM state, authoritative course completion and teacher gradebook result. Test setup uses real Experience services with fictional identities in a randomly named loopback-only scratch database, removed in cleanup. The full existing Experience LMS qualifier also passed after replacing its click-only SCO fixture with a real submitted form.

Package SHA-256: `0a17ea106af71f8472a64ff624dbb4af870d60ca1a1699142a371a2ed684af9c`.

Reproduction belongs to Experience: `scripts/qualify-chimera-scorm.ts <path-to-scorm-12.zip>`; optional `CHIMERA_QUALIFICATION_OUTPUT` controls ignored evidence output. It refuses non-loopback databases. The qualifier asserts actual score, completion and gradebook results and retained form-action restrictions.

A direct reload reusing the same launch token exposed an unload/save version conflict; existing stale-state rejection was retained. The passing resume check closes the activity and obtains a fresh server-issued launch, rather than bypassing concurrency checks. This same-token reload limitation remains recorded for Experience follow-up.

## Evidence and remaining gates

Detailed logs, screenshot, synthetic gradebook and result JSON are under ignored `workspace/qualification-6ba164e/`. Generated SCORM files are in its `course-artifacts-fixed/` directory. Normal Chimera authoring on 5175/8002 and its projects were preserved. No live model call, merge, deployment or production database migration occurred.

Pending: final exact-candidate hosted Chimera CI; review/CI and separately authorized release of the Experience iframe fix; hosted Experience import/launch/gradebook acceptance; full human keyboard authoring. Actual screen reader and physical touch are explicitly deferred by the Owner. Local engineering success does not close those gates or authorize a pilot/deployment.
