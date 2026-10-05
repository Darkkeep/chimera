export type Context = Record<string, unknown>;
export type JourneyEvent = { type: string; scope: string; entityId?: string };
export type Step = {
  id: string; target?: string; title: string; instruction: string; event?: string; helpUrl?: string;
  prerequisite?: (context: Context) => boolean; unavailable?: string;
  isComplete?: (context: Context) => boolean;
  accept?: (event: JourneyEvent, context: Context) => boolean;
};
export type Journey = { id: string; version: number; title: string; steps: Step[] };
export type Snapshot = {
  status: 'idle' | 'preparing' | 'active' | 'blocked' | 'paused' | 'finished' | 'complete';
  index: number; scope: string; message: string; completed: string[]; skipped: string[];
  step: Step; total: number; title: string;
};
export type Controller = {
  snapshot(): Snapshot; subscribe(listener: (state: Snapshot) => void): () => void;
  start(options?: { restart?: boolean }): void; signal(event: JourneyEvent): void;
  next(): void; skip(): void; block(message: string): void; pause(): void;
  setScope(scope: string, options?: { carry?: boolean }): void; dispose(): void;
};
export function createJourney(options: {
  journey: Journey; adapter: { context(): Context; prepare?(step: Step, context: Context, options: { signal: AbortSignal }): void | Promise<void> };
  storage?: Pick<Storage, 'getItem' | 'setItem'>; namespace: string; scope: string; timeout?: number;
}): Controller;
