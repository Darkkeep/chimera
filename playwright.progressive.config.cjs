const { defineConfig, devices } = require('@playwright/test');
const ui = `http://127.0.0.1:${process.env.PROGRESSIVE_UI_PORT || 5191}`;
const api = `http://127.0.0.1:${process.env.PROGRESSIVE_API_PORT || 8031}`;
module.exports = defineConfig({
  testDir: './tests/progressive', testMatch: '*.spec.cjs', workers: 1, retries: 0,
  outputDir: 'workspace/progressive-results',
  reporter: [['list'], ['html', {outputFolder:'workspace/progressive-report', open:'never'}]],
  use: { baseURL: ui, trace: 'retain-on-failure', screenshot: 'only-on-failure', video:'on' },
  projects: ['chromium', 'firefox', 'webkit'].map(name => ({name, use: devices[name === 'chromium' ? 'Desktop Chrome' : name === 'firefox' ? 'Desktop Firefox' : 'Desktop Safari']})),
  webServer: [
    { command: 'node tests/progressive/start-backend.cjs', url: `${api}/api/health`, reuseExistingServer: false, timeout: 60000 },
    { command: 'node frontend/node_modules/vite/bin/vite.js --config tests/progressive/vite.config.mjs', url: ui, reuseExistingServer: false,
      env: {VITE_CHIMERA_STUDIO_ENABLED: 'true', VITE_CHIMERA_PROGRESSIVE_DEMO_ENABLED: 'true'} },
  ],
});
