import test from "node:test";
import assert from "node:assert/strict";
import { detectCounselCandidates, visibleCounselCandidates } from "../../frontend/src/quiet-counsel.ts";

function scene(overrides = {}) {
  return { id: "scene-alpha", experience: null, visualLayout: null, ...overrides };
}
function branch(a = "Both choices invite learners to reflect.", b = a) {
  return { kind: "branching", id: "branch-a", title: "Choice", startNodeId: "n1", nodes: [{
    id: "n1", prompt: "What would you do?", choices: [
      { label: "Proceed", feedback: a, nextNodeId: null },
      { label: "Request details", feedback: b, nextNodeId: null },
    ],
  }] };
}
function experience(activity) {
  return { activities: [activity] };
}
test("conservative detector raises a question only when distinct choices have substantively identical feedback", () => {
  const findings = detectCounselCandidates(scene({ experience: experience(branch()) }), 3);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].source, "local-heuristic");
  assert.equal(findings[0].ruleId, "branch-equivalent-feedback");
  assert.equal(findings[0].sourceRevision, 3);
  assert.match(findings[0].question, /intentional/i);
  assert.match(findings[0].limitations.join(" "), /deliberate/);
  assert.deepEqual(findings[0].evidenceRefs, ["activity:branch-a", "node:n1"]);
});
test("different feedback, whitespace-only responses, or short boilerplate do not raise observations", () => {
  assert.equal(detectCounselCandidates(scene({ experience: experience(branch("Pause and ask for clarification.", "Proceed and document your reasoning.")) }), 1).length, 0);
  assert.equal(detectCounselCandidates(scene({ experience: experience(branch("OK", "OK")) }), 1).length, 0);
  assert.equal(detectCounselCandidates(scene({ experience: experience(branch(" ", " ")) }), 1).length, 0);
  assert.equal(detectCounselCandidates(scene(), 1).length, 0);
});
test("normalization deduplicates only differences in case or whitespace", () => {
  const findings = detectCounselCandidates(scene({ experience: experience(branch("Explain your reasoning before continuing.", "  explain   YOUR reasoning before continuing. ")) }), 4);
  assert.equal(findings.length, 1);
});
test("guided practice and video pauses are separately detected without scanning unrelated content", () => {
  const pause = { id: "pause-1", timeMs: 1200, prompt: "Reflect", choices: [
    { id: "c1", label: "A", feedback: "Discuss this with the learning team." },
    { id: "c2", label: "B", feedback: "Discuss this with the learning team." },
  ] };
  const practice = { kind: "guided-practice", id: "practice-1", title: "Practice", steps: [{
    id: "step-1", prompt: "Choose", hint: "", correctChoiceId: "a",
    choices: [{ id: "a", label: "A", feedback: "Try to explain your reasoning in more detail." }, { id: "b", label: "B", feedback: "Try to explain your reasoning in more detail." }],
  }] };
  const findings = detectCounselCandidates(scene({ experience: experience(practice), visualLayout: { timeline: { pauses: [pause] } } }), 9);
  assert.deepEqual(findings.map(x => x.ruleId), ["practice-equivalent-feedback", "video-pause-equivalent-feedback"]);
  assert.deepEqual(visibleCounselCandidates(findings, [], "quiet").length, 1);
  assert.equal(visibleCounselCandidates(findings, [], "collaborative").length, 2);
  assert.equal(visibleCounselCandidates(findings, [], "silent").length, 0);
});
test("unchanged content fingerprint stays stable across unrelated revisions; material edits invalidate", () => {
  const a = detectCounselCandidates(scene({ experience: experience(branch()) }), 1)[0];
  const b = detectCounselCandidates(scene({ experience: experience(branch()) }), 10)[0];
  assert.equal(a.contentFingerprint, b.contentFingerprint);
  assert.equal(a.findingKey, b.findingKey);
  const changed = detectCounselCandidates(scene({ experience: experience(branch("Both choices invite learners to reflect and reconsider.", "Both choices invite learners to reflect and reconsider.")) }), 11)[0];
  assert.notEqual(a.contentFingerprint, changed.contentFingerprint);
  const intentional = [{ sceneId: a.sceneId, findingKey: a.findingKey, contentFingerprint: a.contentFingerprint, disposition: "intentional" }];
  assert.equal(visibleCounselCandidates([a], intentional).length, 0);
  assert.equal(visibleCounselCandidates([changed], intentional).length, 1);
});
test("not useful and snoozed decisions prevent resurfacing an unchanged finding", () => {
  const candidate = detectCounselCandidates(scene({ experience: experience(branch()) }), 7)[0];
  for (const disposition of ["intentional", "not-useful", "snoozed"]) {
    const decision = { sceneId: candidate.sceneId, findingKey: candidate.findingKey, contentFingerprint: candidate.contentFingerprint, disposition };
    assert.equal(visibleCounselCandidates([candidate], [decision]).length, 0);
  }
  assert.equal(visibleCounselCandidates([candidate], [{ sceneId: "another-scene", findingKey: candidate.findingKey, contentFingerprint: candidate.contentFingerprint, disposition: "intentional" }]).length, 1);
});
test("200-scene synthetic set remains bounded, pure and deterministic", () => {
  const input = scene({ experience: experience(branch()) });
  const before = JSON.stringify(input);
  const start = performance.now();
  for (let i = 0; i < 200; i++) assert.equal(detectCounselCandidates(input, i).length, 1);
  assert.ok(performance.now() - start < 1500, "200 small scene checks should complete in 1.5 seconds on CI");
  assert.equal(JSON.stringify(input), before);
});
