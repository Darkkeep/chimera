const { spawn } = require('node:child_process');
const { mkdirSync, mkdtempSync } = require('node:fs');
const path = require('node:path');
function startBackend() {
const parent = path.resolve('workspace/progressive-tests');
mkdirSync(parent, {recursive: true});
const workspace = mkdtempSync(path.join(parent, 'run-'));
const python = process.env.CHIMERA_TEST_PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
const env = {...process.env};
// Tests cannot inherit provider settings or hosted access from the parent shell.
for (const name of Object.keys(env)) if (/^(CHIMERA_|PYTHIA_|OPENAI_|ANTHROPIC_)/.test(name)) delete env[name];
Object.assign(env, {CHIMERA_WORKSPACE: workspace, CHIMERA_PROGRESSIVE_DEMO: process.env.PROGRESSIVE_BACKEND_ENABLED === 'false' ? 'false' : 'true'});
return spawn(python, ['-m', 'uvicorn', 'app.main:app', '--app-dir', 'backend', '--host', '127.0.0.1', '--port', process.env.PROGRESSIVE_API_PORT || '8031'], {stdio: 'inherit', env, windowsHide:true});
}
exports.startBackend = startBackend;
if (require.main === module) {
const child = startBackend();
child.on('error', error => { console.error(error.message); process.exit(1); });
child.on('exit', code => process.exit(code ?? 1));
process.on('SIGTERM', () => child.kill());
process.on('SIGINT', () => child.kill());
}
