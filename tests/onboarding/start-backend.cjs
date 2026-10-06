const { spawn } = require('node:child_process');
const { existsSync, mkdirSync, mkdtempSync } = require('node:fs');
const path = require('node:path');
const parent = path.resolve('workspace/onboarding-tests');
mkdirSync(parent, { recursive: true });
const workspace = mkdtempSync(path.join(parent, 'run-'));
const localPython = path.resolve('.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
const python = process.env.CHIMERA_TEST_PYTHON || (existsSync(localPython) ? localPython : process.platform === 'win32' ? 'python' : 'python3');
const child = spawn(python, ['-m', 'uvicorn', 'app.main:app', '--app-dir', 'backend', '--host', '127.0.0.1', '--port', '8027'], {
  stdio: 'inherit', env: { ...process.env, CHIMERA_WORKSPACE: workspace, CHIMERA_AI_BASE_URL: '', CHIMERA_AI_API_KEY: '', CHIMERA_AI_MODEL: '' },
});
child.on('error', error => { console.error(error.message); process.exit(1); });
child.on('exit', code => process.exit(code ?? 1));
process.on('SIGTERM', () => child.kill());
process.on('SIGINT', () => child.kill());
