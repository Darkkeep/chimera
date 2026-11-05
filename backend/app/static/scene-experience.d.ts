import type { Experience } from "../../../../frontend/src/NativeExperience";
export function mountExperience(root: HTMLElement, experience: Experience, options?: {
  progress?: Record<string, unknown>; onProgress?: (progress: Record<string, unknown>) => void;
}): () => void;
