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
// Where the relay server is (override with SERVER_PORT / WEB_PORT to run a second copy).
const serverPort = Number(process.env.SERVER_PORT ?? 8787);
const webPort = Number(process.env.WEB_PORT ?? 5173);
const plugins: PluginOption[] = [react()];
if (useHttps) plugins.push(basicSsl({ name: 'footnotes-dev' }));

export default defineConfig({
  plugins,
  server: {
    host: true, // listen on the LAN so a phone can reach it
    port: webPort,
    strictPort: true,
    allowedHosts: ['.trycloudflare.com', '.local'],
    proxy: {
      '/ws': { target: `ws://127.0.0.1:${serverPort}`, ws: true },
      '/health': `http://127.0.0.1:${serverPort}`,
      '/api': `http://127.0.0.1:${serverPort}`,
    },
  },
  // Pre-bundle these up front. Otherwise Vite may discover one while the app is running,
  // re-bundle, and force-refresh every open page (which would stop the Studio's music).
  optimizeDeps: {
    include: ['react', 'react-dom', 'react-dom/client', 'react-router-dom', 'tone', 'qrcode'],
  },
  build: { target: 'es2022', sourcemap: true },
});
