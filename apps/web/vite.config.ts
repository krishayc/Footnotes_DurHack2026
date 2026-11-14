import { defineConfig, type PluginOption } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';

/**
 * Two ways to reach the dev server from a phone (motion sensors need HTTPS):
 *  - `npm run dev` + `npm run tunnel:dev`  -> Cloudflare gives a public https URL (preferred)
 *  - `npm run dev:https`                   -> self-signed https on your LAN (backup)
 * /ws and /health are proxied to the relay server on :8787, so the phone only ever
 * talks to one origin.
 */
const useHttps = process.env.HTTPS === '1';
const plugins: PluginOption[] = [react()];
if (useHttps) plugins.push(basicSsl({ name: 'footnotes-dev' }));

export default defineConfig({
  plugins,
  server: {
    host: true, // listen on the LAN so a phone can reach it
    port: 5173,
    strictPort: true,
    allowedHosts: ['.trycloudflare.com', '.local'],
    proxy: {
      '/ws': { target: 'ws://localhost:8787', ws: true },
      '/health': 'http://localhost:8787',
      '/api': 'http://localhost:8787',
    },
  },
  build: { target: 'es2022', sourcemap: true },
});
