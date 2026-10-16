const { existsSync } = require('node:fs');
const path = require('node:path');
const local = path.resolve('.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
module.exports = process.env.CHIMERA_TEST_PYTHON || (existsSync(local) ? local : process.platform === 'win32' ? 'python' : 'python3');
