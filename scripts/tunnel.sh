#!/usr/bin/env bash
# Start a Cloudflare quick tunnel to a local port, retrying if Cloudflare's free
# quick-tunnel service is slow to hand out an address (it sometimes times out).
#
# Usage: scripts/tunnel.sh [port]   (default 5173 = Vite dev server; 8787 = demo build)

PORT="${1:-5173}"
ATTEMPTS=6

if ! command -v cloudflared >/dev/null 2>&1; then
  echo "cloudflared is not installed. Install it with: brew install cloudflared"
  exit 1
fi

# Ctrl+C should stop everything, not trigger another retry.
trap 'echo; echo "Tunnel stopped."; exit 0' INT TERM

for i in $(seq 1 "$ATTEMPTS"); do
  echo "Starting tunnel to http://localhost:$PORT (attempt $i of $ATTEMPTS)..."
  # --protocol http2 uses ordinary HTTPS traffic, which networks block less often than QUIC.
  cloudflared tunnel --protocol http2 --url "http://localhost:$PORT"
  echo "Cloudflare did not give us a tunnel. Trying again in 3 seconds..."
  sleep 3
done

echo "Could not start a tunnel after $ATTEMPTS attempts."
echo "Use the backup instead: npm run dev:https  (see docs/https-setup.md)"
exit 1
