/**
 * Quiet Counsel QC-1. Pure, provider-free observations about narrowly verifiable
 * native interactions. An observation is a question, not a design verdict.
 *
 * No networking, localStorage, server calls, model calls, or project mutation.
 */
import type { Scene } from "./App";

export type CounselCategory = "interaction" | "feedback";
export type CounselCandidate = {
  id: string;
  ruleId: string;
  ruleVersion: "1";
  findingKey: string;
  sceneId: string;
  sourceRevision: number;
  contentFingerprint: string;
  category: CounselCategory;
  source: "local-heuristic";
  observation: string;
  question: string;
  limitations: string[];
  evidenceRefs: string[];
  priority: "ordinary";
};
export type CounselDisposition = "intentional" | "not-useful" | "snoozed";
export type CounselDecision = {
  sceneId: string;
  findingKey: string;
  contentFingerprint: string;
  disposition: CounselDisposition;
};
export type CounselMode = "silent" | "quiet" | "collaborative";

type Response = { label: string; feedback: string };
type Instance = { ruleId: string; key: string; responses: Response[]; observation: string; question: string; evidenceRefs: string[] };
const RULE_VERSION = "1" as const;
const canonical = (value: string) => value.trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US");
const responseSignature = (responses: Response[]) =>
  responses.map(item => [canonical(item.label), canonical(item.feedback)]);
const fingerprint = (data: unknown) => {
  // FNV-1a: deterministic local deduplication, NOT a security/content-integrity hash.
  const text = JSON.stringify(data);
  let value = 2166136261;
  for (let i = 0; i < text.length; i++) {
    value ^= text.charCodeAt(i);
    value = Math.imul(value, 16777619);
  }
  return (value >>> 0).toString(16).padStart(8, "0");
};
function equivalentFeedback(responses: Response[]) {
  return responses.length >= 2 && responses.every(item => canonical(item.feedback).length >= 12) &&
    new Set(responses.map(item => canonical(item.feedback))).size === 1;
}

/** The detectors never infer intent, learning quality or clinical correctness. */
export function detectCounselCandidates(scene: Scene, sourceRevision: number): CounselCandidate[] {
  const targets: Instance[] = [];
  // Branching nodes carry independently authored feedback and can be checked exactly.
  for (const activity of scene.experience?.activities ?? []) {
    if (activity.kind === "branching") {
      for (const node of activity.nodes) {
        if (equivalentFeedback(node.choices)) targets.push({
          ruleId: "branch-equivalent-feedback", key: `${activity.id}:${node.id}`,
          responses: node.choices,
          observation: "The choices in this decision currently have the same feedback.",
          question: "Is the shared feedback intentional, or would choice-specific reasoning help the learner?",
          evidenceRefs: [`activity:${activity.id}`, `node:${node.id}`],
        });
      }
    }
    if (activity.kind === "guided-practice") {
      for (const step of activity.steps) {
        if (equivalentFeedback(step.choices)) targets.push({
          ruleId: "practice-equivalent-feedback", key: `${activity.id}:${step.id}`,
          responses: step.choices,
          observation: "The options in this guided-practice step currently have the same feedback.",
          question: "Are you emphasizing reflection over the selected answer, or would distinct feedback help?",
          evidenceRefs: [`activity:${activity.id}`, `step:${step.id}`],
        });
      }
    }
  }
  // A second interaction pathway: authored formative pauses in video timelines.
  for (const pause of scene.visualLayout?.timeline?.pauses ?? []) {
    if (equivalentFeedback(pause.choices)) targets.push({
      ruleId: "video-pause-equivalent-feedback", key: pause.id,
      responses: pause.choices,
      observation: "This video reflection currently uses the same feedback for every response.",
      question: "Is that common reflection intentional, or would response-specific consequences be useful?",
      evidenceRefs: [`pause:${pause.id}`],
    });
  }
  const safeRevision = Number.isSafeInteger(sourceRevision) && sourceRevision >= 0 ? sourceRevision : 0;
  return targets.map(item => {
    const findingKey = `${item.ruleId}:${item.key}`;
    const contentFingerprint = fingerprint([RULE_VERSION, item.ruleId, item.key, responseSignature(item.responses)]);
    return {
      id: `${scene.id}:${findingKey}:${contentFingerprint}`,
      ruleId: item.ruleId, ruleVersion: RULE_VERSION, findingKey, sceneId: scene.id,
      sourceRevision: safeRevision, contentFingerprint, category: "feedback" as const,
      source: "local-heuristic" as const, observation: item.observation, question: item.question,
      limitations: ["Identical feedback can be a deliberate instructional choice; this rule does not evaluate learning effectiveness."],
      evidenceRefs: item.evidenceRefs, priority: "ordinary" as const,
    };
  });
}

/** Author dismissals are fingerprint-scoped. Edits naturally reconsider changed content. */
export function visibleCounselCandidates(
  candidates: readonly CounselCandidate[], decisions: readonly CounselDecision[],
  mode: CounselMode = "quiet",
): CounselCandidate[] {
  if (mode === "silent") return [];
  const disposed = new Set(decisions.filter(d => d.disposition === "intentional" || d.disposition === "not-useful" || d.disposition === "snoozed")
    .map(d => JSON.stringify([d.sceneId, d.findingKey, d.contentFingerprint])));
  const remaining = candidates.filter(candidate =>
    !disposed.has(JSON.stringify([candidate.sceneId, candidate.findingKey, candidate.contentFingerprint])));
  return mode === "quiet" ? remaining.slice(0, 1) : remaining;
}
