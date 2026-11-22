# Studio process blurbs — Issue #48

Based on Milestone 2 head `a76116bf189aa3c7d32f9b0c6e96090a552db068` on PR #45.

The existing progressive panel now reuses the enhancement working indicator beside
one compact, polite, atomic status line. Labels come from validated v1 events and
actual request lifetimes. Neither backend protocol nor producer behavior changes.
Both deterministic and Pythia-format paths say demonstration; neither invokes an
upstream model. No timers invent stages, percentages or instructional analysis.

Requesting, adding and reconnecting labels last only while those operations are
in flight. Scene-ready, added, rejected, completed, stopped and failed labels
reflect event/page results. Poll interruption stops the indicator and offers the
existing explicit Reconnect proposals action; it does not claim automatic retry.
Diagnostics remain visible. Reconnect retains proposal DOM while replaying.
Repeated polls with unchanged text do not mutate the live announcement.

The pure `progressiveProcess` projection exposes `operationKey` as a presentation
extension seam for optional insights later. No insight UI, teaching subsystem,
new form, editor mount key, selection change or focus effect is introduced.
Existing acceptance, revision, permissions and unsaved-draft gates remain.

Verification: `node --test tests/progressive/events.test.cjs`, frontend build,
and the progressive Playwright suite. Browser cases cover request/accept states,
editing through Scene 2 arrival, completed/cancelled/failed preparation, explicit
reconnect, duplicate announcement suppression, reduced motion and responsive axe
checks. Screenshots and recordings are retained in the progressive CI artifact;
`npm run demo:progressive` starts the provider-free local demonstration.

Machine evidence does not establish founder usability acceptance. This increment
does not authorize merging, deployment or live model calls.
