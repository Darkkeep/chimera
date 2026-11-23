const {defineConfig} = require('@playwright/test');
const base = require('./playwright.progressive.config.cjs');
module.exports = defineConfig({...base,
  testDir: './tests/release-candidate',
  outputDir: 'workspace/release-candidate-results',
  reporter: [['list'], ['html', {outputFolder:'workspace/release-candidate-report', open:'never'}]],
  webServer: base.webServer.map((server, index) => ({...server, env: {...server.env,
    ...(index === 0 ? {PROGRESSIVE_BACKEND_ENABLED:'false'} : {VITE_CHIMERA_PROGRESSIVE_DEMO_ENABLED:'false'})
  }})),
});
