import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), "CHIMERA_"), ...process.env };
  const webPort = Number(env.CHIMERA_WEB_PORT || 5173);
  const apiPort = Number(env.CHIMERA_API_PORT || 8000);
  return {
    plugins: [react()],
    server: {
      port: webPort,
      strictPort: true,
      proxy: { "/api": `http://localhost:${apiPort}` },
    },
  };
});
