import type { Controller } from './core.js';
export function mountJourney(controller: Controller, options?: { root?: HTMLElement; resolveTarget?: (anchor: string) => HTMLElement | undefined; timeout?: number }): () => void;
