/**
 * How the phone joins: a QR code (scan with the phone camera) plus the room code.
 * The QR is generated locally (no internet needed). It points at the public tunnel URL when
 * scripts/tunnel.mjs has registered one, otherwise at this page's own address.
 */
import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

const isLocalhost = (host: string) => ['localhost', '127.0.0.1', '[::1]'].includes(host);

export function JoinCard({ room, compact = false }: { room: string; compact?: boolean }) {
  const [publicUrl, setPublicUrl] = useState<string | null>(null);
  const [svg, setSvg] = useState('');

  // Ask the server for the tunnel URL now and every few seconds (the tunnel may start later).
  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch('/api/public-url', { cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : null))
        .then((j: { url: string | null } | null) => alive && setPublicUrl(j?.url ?? null))
        .catch(() => {});
    void load();
    const id = window.setInterval(load, 5000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, []);

  const base = publicUrl ?? location.origin;
  const joinUrl = `${base}/sensor?room=${room}`;
  const unreachable = !publicUrl && isLocalhost(location.hostname);

  useEffect(() => {
    QRCode.toString(joinUrl, {
      type: 'svg',
      margin: 1,
      errorCorrectionLevel: 'M',
      color: { dark: '#18211E', light: '#F1F3EE' },
    })
      .then(setSvg)
      .catch(() => setSvg(''));
  }, [joinUrl]);

  return (
    <section className={`join${compact ? ' join--compact' : ''}`} aria-label="Join from your phone">
      <div
        className="join__qr"
        role="img"
        aria-label={`QR code for ${joinUrl}`}
        dangerouslySetInnerHTML={{ __html: svg }}
      />
      <div className="join__text">
        <p className="join__label">Scan with the phone camera, or enter</p>
        <p className="join__code">{room}</p>
        <p className="join__url">{base.replace(/^https?:\/\//, '')}</p>
        {unreachable && (
          <p className="join__warn">
            This QR points at localhost, which a phone can't open. Run <code>npm run tunnel</code>{' '}
            (or <code>npm run tunnel:dev</code>) and it will update by itself.
          </p>
        )}
      </div>
    </section>
  );
}
