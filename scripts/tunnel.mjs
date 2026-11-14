#!/usr/bin/env node
/**
 * Start a Cloudflare quick tunnel and tell the Footnotes server its public URL, so the Studio's
 * QR code points somewhere a phone can open.
 *
 *   node scripts/tunnel.mjs 8787   # demo build served by the relay
 *   node scripts/tunnel.mjs 5173   # Vite dev server
 *
 * The relay server always listens on 8787, which is where the URL is registered.
 */
import { spawn } from 'node:child_process';

const port = Number(process.argv[2] ?? 8787);
const SERVER = 'http://localhost:8787/api/public-url';

async function register(url) {
  try {
    await fetch(SERVER, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url }),
    });
    return true;
  } catch {
    return false;
  }
}

const child = spawn(
  'cloudflared',
  ['tunnel', '--no-autoupdate', '--url', `http://localhost:${port}`],
  {
    stdio: ['ignore', 'pipe', 'pipe'],
  },
);

child.on('error', (err) => {
  if (err.code === 'ENOENT') {
    console.error('\ncloudflared is not installed.');
    console.error('  macOS:   brew install cloudflared');
    console.error('  Windows: winget install --id Cloudflare.cloudflared');
    console.error(
      '  Linux:   https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/\n',
    );
  } else console.error(err);
  process.exit(1);
});

let found = null;
const onData = async (buf) => {
  const text = buf.toString();
  if (process.env.VERBOSE) process.stderr.write(text);
  const m = !found && text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i);
  if (!m) return;
  found = m[0];
  const line = '─'.repeat(found.length + 4);
  console.log(`\n┌${line}┐\n│  ${found}  │\n└${line}┘`);
  console.log(`Phone: open ${found}  (tunnelling localhost:${port})`);
  // The tunnel takes a few seconds to become reachable; the server can register straight away.
  if (await register(found)) console.log('Studio QR code updated to this address.');
  else console.log('(Footnotes server on :8787 not reachable yet; will keep trying.)');
  // Re-register every few seconds: the server forgets the URL whenever it restarts
  // (e.g. tsx watch reloading after a code change).
  const url = found;
  setInterval(() => void register(url), 5000);
};
child.stdout.on('data', onData);
child.stderr.on('data', onData);

const shutdown = async () => {
  if (found) await register(null);
  child.kill('SIGINT');
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
