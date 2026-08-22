'use client';

import { useEffect, useState } from 'react';

type Item = {
  key: string;
  /** The row's name: SPX, GC, BTC. */
  symbol: string;
  /** The contract that price came from - GCZ26 where the row says GC. */
  contract?: string;
  last: number;
  change: number;
  changePercent: number;
};

/**
 * The scrolling market bar, quoted from Schwab rather than embedded from
 * TradingView.
 *
 * The embed had to go once VIX needed to be in it: the free tier serves no VIX
 * symbol at all, the same way it served no US10Y and no DXY. Quoting Schwab
 * instead carries VIX, drops the 15-minute delay on the equity lines, and ends
 * the colour mismatch, since the bar is now the app's own markup.
 *
 * What it costs: the bar is empty while the Schwab session is lapsed, where the
 * embed kept running. The screener cannot scan in that state either, and the
 * settings dot says so, so the bar is not where that news should break.
 */
export default function TickerTape() {
  const [items, setItems] = useState<Item[] | null>(null);

  useEffect(() => {
    let alive = true;

    const load = async () => {
      try {
        const res = await fetch('/api/tape');
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as { items: Item[] };
        if (alive && data.items?.length) setItems(data.items);
      } catch {
        // Keep whatever is already on screen. A blink to empty on one failed
        // poll is worse than a price that is a minute stale.
        if (alive) setItems((prev) => prev);
      }
    };

    load();
    const timer = setInterval(load, 60_000);

    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  // Holds the strip's height so the page does not jump when quotes land.
  if (!items) return <div className="tape tape-placeholder" />;

  const row = items.map((it) => {
    const up = it.change >= 0;
    return (
      <span className="tapeitem" key={it.key}>
        {/* The symbol itself, not a translated name: SPX and CL read the same
            in either language, and the bar has no room for both. The delivery
            month rides in the tooltip, since GC is the name but GCZ26 is the
            thing actually quoted. */}
        <b title={it.contract && it.contract !== it.symbol ? it.contract : undefined}>
          {it.symbol}
        </b>
        <span className="tapelast">
          {it.last.toLocaleString('en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}
        </span>
        {/* House rule (globals.css): green is up, red is down, direction only. */}
        <span className={up ? 'good' : 'bad'}>
          {up ? '▲' : '▼'} {Math.abs(it.changePercent).toFixed(2)}%
        </span>
      </span>
    );
  });

  return (
    <div className="tape">
      {/* Rendered twice so the loop has an identical second copy to slide into
          as the first leaves - a single copy would visibly snap back. */}
      <div className="tapeline">
        <div className="tapeset">{row}</div>
        <div className="tapeset" aria-hidden="true">
          {row}
        </div>
      </div>
    </div>
  );
}
