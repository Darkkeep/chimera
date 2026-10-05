import type { Page, Locator } from '@playwright/test';
export function guide(page: Page): Locator;
export function expectStep(page: Page, title: string): Promise<void>;
