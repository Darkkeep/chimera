const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;

for (const theme of ['light', 'dark']) {
  for (const width of [1440, 390]) {
    test(`bundled user guide is available without a project in ${theme} at ${width}px`, async ({ page, request }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript(theme => localStorage.setItem('chimera.appearance', theme), theme);
      await page.route('**/api/projects', route => route.fulfill({ json: [] }));
      await page.goto('/');
      const nav = page.getByRole('navigation', { name: 'Workspace', exact: true });
      const guide = nav.getByRole('link', { name: 'User guide (PDF, opens in a new tab)', exact: true });
      await expect(guide).toBeVisible();
      await expect(guide).toHaveAttribute('target', '_blank');
      await expect(guide).toHaveAttribute('rel', 'noopener noreferrer');
      expect(await guide.evaluate(node => node.previousElementSibling.textContent)).toBe('Templates');
      await guide.focus();
      await expect(guide).toBeFocused();
      expect((await new AxeBuilder({ page }).include('a.nav-item').withRules(['color-contrast']).analyze()).violations).toEqual([]);
      const response = await request.get(await guide.getAttribute('href'));
      expect(response.status()).toBe(200);
      expect(response.headers()['content-type']).toContain('application/pdf');
      expect((await response.body()).subarray(0, 5).toString()).toBe('%PDF-');
    });
  }
}
