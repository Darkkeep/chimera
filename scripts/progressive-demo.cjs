const { spawn } = require('node:child_process');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const { startBackend } = require('../tests/progressive/start-backend.cjs');
const children = [];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill();
  process.exitCode = code;
}
function watch(child) {
  children.push(child);
  child.on('error', error => { console.error(error.message); stop(1); });
  child.on('exit', code => stop(code ?? 1));
}
watch(startBackend());
watch(spawn(process.execPath, ['frontend/node_modules/vite/bin/vite.js', '--config', 'tests/progressive/vite.config.mjs'], {
  cwd:root, stdio:'inherit', windowsHide:true,
  env:{...process.env, VITE_CHIMERA_STUDIO_ENABLED:'true', VITE_CHIMERA_PROGRESSIVE_DEMO_ENABLED:'true'},
}));
console.log(`Local progressive review demo: http://127.0.0.1:${process.env.PROGRESSIVE_UI_PORT || 5191}`);
console.log('Milestone 3: Import saved Pythia artifact, then choose tests/progressive/sample-handoff.json.');
console.log('Create a synthetic course, enter Studio, then Start progressive demo.');
console.log('Accept and edit scene 1, save an improvement, and keep editing as scene 2 arrives (~20 seconds).');
console.log('Fresh isolated workspace; provider configuration is stripped. Ctrl+C stops the demo.');
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
