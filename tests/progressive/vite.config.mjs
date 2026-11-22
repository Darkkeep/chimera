import react from '../../frontend/node_modules/@vitejs/plugin-react/dist/index.js';
export default { root: 'frontend', plugins: [react()], server: {host: '127.0.0.1', port: Number(process.env.PROGRESSIVE_UI_PORT || 5191), strictPort: true, proxy: {'/api': `http://127.0.0.1:${process.env.PROGRESSIVE_API_PORT || 8031}`}} };
