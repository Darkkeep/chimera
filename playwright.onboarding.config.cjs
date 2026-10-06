const { defineConfig, devices } = require('@playwright/test');
module.exports = defineConfig({
  testDir: './tests/onboarding', testMatch: '*.spec.cjs', fullyParallel: true, workers: process.env.CI ? 1 : 3,
  forbidOnly: !!process.env.CI, retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { baseURL: 'http://127.0.0.1:5187', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], ...(process.env.ONBOARDING_BROWSER_CHANNEL ? { channel: process.env.ONBOARDING_BROWSER_CHANNEL } : {}) } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
  webServer: [
    { command: 'node tests/onboarding/start-backend.cjs', url: 'http://127.0.0.1:8027/api/projects', reuseExistingServer: false, timeout: 60000 },
    { command: 'node frontend/node_modules/vite/bin/vite.js --config tests/onboarding/vite.config.mjs', url: 'http://127.0.0.1:5187', reuseExistingServer: false },
  ],
});
