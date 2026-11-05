import type { HTML5Activity, HTML5Progress } from "../../../../frontend/src/HTML5Activity";
export function isHTML5Progress(value: unknown): value is HTML5Progress;
export function mountHTML5Activity(root: HTMLElement, activity: HTML5Activity,
  data: { html: string; csp: string }, options?: {
    progress?: HTML5Progress; onProgress?: (progress: HTML5Progress) => void;
  }): () => void;
