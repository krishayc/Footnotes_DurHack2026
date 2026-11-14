# Getting the phone onto Footnotes over HTTPS

Phones only give web pages motion-sensor data on a **secure (HTTPS) connection**.
`http://192.168.x.x:5173` will load, but the accelerometer stays silent. Two ways round it:

## Option A (preferred): Cloudflare quick tunnel

A free, account-less public `https://…trycloudflare.com` URL that forwards to your laptop.
WebSockets work through it, and because the phone talks to Cloudflare (not directly to your
laptop) it also gets round venue WiFi that blocks device-to-device traffic.

Install once (macOS):

```bash
brew install cloudflared
```

(Windows: `winget install --id Cloudflare.cloudflared`. Linux: see
https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/)

**While developing** (hot reload):

```bash
npm run dev          # terminal 1: relay server :8787 + Vite :5173
npm run tunnel:dev   # terminal 2: prints https://<random>.trycloudflare.com
```

**For the demo** (one built, fast, offline-capable bundle on one port):

```bash
npm run demo         # builds the web app and serves it from the relay server on :8787
npm run tunnel       # tunnels :8787
```

Open the printed `https://…trycloudflare.com` URL on the phone. The URL changes every time
you restart the tunnel.

## Option B (backup): self-signed HTTPS on your local network

```bash
npm run dev:https
```

Vite prints a `Network: https://<laptop-ip>:5173` address. Open that on the phone. You'll see a
certificate warning: tap **Show details → visit this website** (iOS) or **Advanced → Proceed**
(Android). Use this when the venue internet is down or slow. Laptop and phone must be on the
same network, so if the venue WiFi isolates devices, put **both on a personal phone hotspot**.

## Which to use when

| Situation                          | Use                                                |
| ---------------------------------- | -------------------------------------------------- |
| Normal development, internet works | A (tunnel:dev)                                     |
| Demo at the table                  | A (demo + tunnel), with B on a hotspot as fallback |
| No internet at all                 | B on a phone hotspot                               |
| Phone link fails entirely          | Studio Tap mode / Simulated walker (Stage 4)       |
