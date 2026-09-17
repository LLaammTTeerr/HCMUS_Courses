import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Listen on all interfaces so the app is reachable over Tailscale (100.x IP or MagicDNS name).
    host: true,
    allowedHosts: ['.ts.net'],
    proxy: { '/api': 'http://127.0.0.1:5174' },
  },
});
