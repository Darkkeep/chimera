import type { Scene } from "./App";

export type DraftPayload = { title: string; extractedText: string[]; sceneType: "content"; layoutMode: "native"; narration: string; notes: string; actionDescription: string; required: boolean; audioRequired: boolean };
export type ComponentEvent = {
  schemaVersion: 1; eventId: string; jobId: string; projectId: string; sourceRevision: number;
  projectRevision: number; sequence: number; type: string; status: string;
  componentId: string | null; orderHint: number | null; payload: DraftPayload | null;
  provenance: { producer: "deterministic-fixture-v1" | "pythia-authoring-fixture-v1"; sourceIds: string[]; locators: string[]; rationale?: string };
};
const kinds: Record<string, string> = { "job.started": "running", "component.ready": "proposed", "component.failed": "failed", "component.accepted": "accepted", "component.rejected": "rejected", "job.completed": "completed", "job.cancelled": "cancelled", "job.failed": "failed" };

/** Replay is ordered and idempotent. Conflicting duplicates/gaps fail closed. */
export function mergeProgressiveEvents(previous: ComponentEvent[], incoming: ComponentEvent[], jobId: string, projectId: string): ComponentEvent[] {
  const bySequence = new Map(previous.map(event => [event.sequence, event]));
  for (const event of incoming) {
    if (event.schemaVersion !== 1 || event.jobId !== jobId || event.projectId !== projectId ||
        !Number.isSafeInteger(event.sequence) || event.sequence < 1 || event.eventId !== `${jobId}:${event.sequence}` ||
        !Number.isSafeInteger(event.sourceRevision) || event.sourceRevision < 1 ||
        !Number.isSafeInteger(event.projectRevision) || event.projectRevision < event.sourceRevision ||
        !Object.hasOwn(kinds, event.type) || kinds[event.type] !== event.status || !["deterministic-fixture-v1", "pythia-authoring-fixture-v1"].includes(event.provenance?.producer ?? "") ||
        !Array.isArray(event.provenance.sourceIds) || event.provenance.sourceIds.length !== 0 ||
        !Array.isArray(event.provenance.locators)) throw new Error("Invalid progressive scene event. Nothing was applied.");
    if (event.type === "component.ready") {
      const payload = event.payload;
      if (!event.componentId || !payload || payload.sceneType !== "content" || payload.layoutMode !== "native" ||
          typeof payload.title !== "string" || !payload.title.trim() || payload.title.length > 120 ||
          !Array.isArray(payload.extractedText) || !payload.extractedText.length || payload.extractedText.length > 20 ||
          payload.extractedText.some(text => typeof text !== "string" || !text.trim() || text.length > 5000)) {
        throw new Error("An incomplete scene was withheld. Nothing was applied.");
      }
    }
    const existing = bySequence.get(event.sequence);
    if (existing && JSON.stringify(existing) !== JSON.stringify(event)) throw new Error("Conflicting replay event. Reload the demonstration.");
    bySequence.set(event.sequence, event);
  }
  const result = [...bySequence.values()].sort((a, b) => a.sequence - b.sequence);
  if (result.length > 64 || result.some((event, index) => event.sequence !== index + 1 || event.sourceRevision !== result[0].sourceRevision)) {
    throw new Error("The event replay has a gap. Reconnect from the beginning.");
  }
  return result;
}

export function proposalScene(event: ComponentEvent): Scene {
  if (!event.payload || !event.componentId) throw new Error("No complete scene available");
  return { ...event.payload, id: event.componentId, sourceSlide: null, templateId: null,
    assessmentItem: null, assessmentSettings: null, imageAssets: [], imageAltText: {}, decorativeImages: [],
    audioAssets: [], previewImage: null, renderWarning: null, sourceAnimationXml: null, sourceTransitionXml: null };
}
