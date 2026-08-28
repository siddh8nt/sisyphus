import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Built assets go to web/dist and are served statically by the orchestrator at /.
// The dev proxy lets `npm run dev` (web) talk to the orchestrator on :4100.
export default defineConfig({
  plugins: [react()],
  base: '/',
  build: { outDir: 'dist', emptyOutDir: true },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:4100',
      '/setup.sh': 'http://localhost:4100',
      '/telemetry.sh': 'http://localhost:4100',
      '/ws': { target: 'ws://localhost:4100', ws: true },
    },
  },
});
