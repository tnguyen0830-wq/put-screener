'use client';

import { useEffect, useState } from 'react';

type Vix = { last: number; change: number; changePercent: number };

/**
 * VIX in the header, from Schwab rather than the ticker tape.
 *
 * The tape does not serve VIX on the free tier - it renders an error badge and
 * no price. Substituting a VIX-futures ETF would put a number there that looks
 * like VIX and is not one; for deciding whether to sell puts today the level is
 * the whole point, so a wrong level is worse than an absent one.
 *
 * Renders nothing at all when the quote is unavailable, which is mostly when
 * the Schwab session has lapsed. The reconnect prompt sitting beside it in the
 * header already says so, and a second broken-looking chip would only add
 * noise.
 */
export default function VixPill() {
  const [vix, setVix] = useState<Vix | null>(null);

  useEffect(() => {
    let alive = true;

    const load = async () => {
      try {
        const res = await fetch('/api/vix');
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as Vix;
        if (alive) setVix(data);
      } catch {
        if (alive) setVix(null);
      }
    };

    load();
    // VIX moves slowly enough that a minute is plenty, and this shares the
    // Schwab session with the scans, which are what the quota is for.
    const timer = setInterval(load, 60_000);

    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  if (!vix) return null;

  const up = vix.change >= 0;

  return (
    <span
      className="pill vix"
      title="VIX từ Schwab, real-time. IV cao thì bán put được giá hơn."
    >
      VIX {vix.last.toFixed(2)}
      {/* House rule (globals.css): green means up, red means down, direction
          only. Resisting the urge to paint a VIX spike green-as-in-good keeps
          the colour meaning one thing everywhere. */}
      <span className={up ? 'good' : 'bad'}>
        {up ? '▲' : '▼'} {Math.abs(vix.changePercent).toFixed(1)}%
      </span>
    </span>
  );
}
