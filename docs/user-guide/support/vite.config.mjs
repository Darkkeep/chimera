import { fileURLToPath } from 'node:url';

export default {
  root: fileURLToPath(new URL('../../../frontend/', import.meta.url)),
  server: {
    host: '127.0.0.1',
    port: 5178,
    strictPort: true,
    proxy: { '/api': 'http://127.0.0.1:8017' },
  },
  esbuild: { jsx: 'automatic' },
};
