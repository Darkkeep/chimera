import react from '../frontend/node_modules/@vitejs/plugin-react/dist/index.js';
import { fileURLToPath } from 'node:url';
export default {
  root: fileURLToPath(new URL('../frontend', import.meta.url)),
  plugins: [react()],
  server: {
    host: '127.0.0.1', port: 5175, strictPort: true,
    proxy: { '/api': 'http://127.0.0.1:8002' },
  },
};
