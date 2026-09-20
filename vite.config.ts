import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Listen on all interfaces so the app is reachable over Tailscale (100.x IP or MagicDNS name).
    host: true,
    allowedHosts: ['.ts.net'],
    // API_PORT lets a second instance (e.g. a test run on a scratch database) proxy elsewhere.
    // xfwd forwards the caller's address, so the API rate-limits per client rather than per proxy.
    proxy: { '/api': { target: `http://127.0.0.1:${process.env.API_PORT ?? 5174}`, xfwd: true } },
  },
});
