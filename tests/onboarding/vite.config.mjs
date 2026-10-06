import react from '../../frontend/node_modules/@vitejs/plugin-react/dist/index.js';
export default { root: 'frontend', plugins: [react()], server: { host: '127.0.0.1', port: 5187, strictPort: true, proxy: { '/api': 'http://127.0.0.1:8027' } } };
