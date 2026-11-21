const { defineConfig, devices } = require('@playwright/test');
module.exports = defineConfig({
  testDir: './tests/progressive', testMatch: '*.spec.cjs', workers: 1, retries: 0,
  reporter: [['list']],
  use: { baseURL: 'http://127.0.0.1:5191', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: ['chromium', 'firefox', 'webkit'].map(name => ({name, use: devices[name === 'chromium' ? 'Desktop Chrome' : name === 'firefox' ? 'Desktop Firefox' : 'Desktop Safari']})),
  webServer: [
    { command: 'node tests/progressive/start-backend.cjs', url: 'http://127.0.0.1:8031/api/health', reuseExistingServer: false, timeout: 60000 },
    { command: 'node frontend/node_modules/vite/bin/vite.js --config tests/progressive/vite.config.mjs', url: 'http://127.0.0.1:5191', reuseExistingServer: false,
      env: {VITE_CHIMERA_STUDIO_ENABLED: 'true', VITE_CHIMERA_PROGRESSIVE_DEMO_ENABLED: 'true'} },
  ],
});
