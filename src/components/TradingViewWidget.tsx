'use client';

import { useEffect, useRef } from 'react';

type Props = {
  /** Widget slug, e.g. 'advanced-chart', 'technical-analysis'. */
  type: string;
  config: Record<string, unknown>;
  height: number;
  /**
   * Attribution link required by the free tier. Optional only for widgets that
   * already render TradingView's own branded link inside themselves, such as
   * the ticker tape - a second credit line under those is duplicate, and on a
   * compact bar it costs more height than the widget itself.
   */
  attributionHref?: string;
  attributionLabel?: string;
};

export default function TradingViewWidget({
  type,
  config,
  height,
  attributionHref,
  attributionLabel,
}: Props) {
  const host = useRef<HTMLDivElement>(null);
  const key = JSON.stringify(config);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    el.innerHTML = '';

    const inner = document.createElement('div');
    inner.className = 'tradingview-widget-container__widget';
    inner.style.height = `${height}px`;
    el.appendChild(inner);

    const script = document.createElement('script');
    script.src = `https://s3.tradingview.com/external-embedding/embed-widget-${type}.js`;
    script.async = true;
    script.innerHTML = key;
    el.appendChild(script);

    return () => {
      el.innerHTML = '';
    };
  }, [type, key, height]);

  return (
    <div className="tv-wrap">
      <div ref={host} className="tradingview-widget-container" />
      {attributionHref && (
        <a
          className="tv-credit"
          href={attributionHref}
          target="_blank"
          rel="noopener nofollow"
        >
          {attributionLabel} · TradingView
        </a>
      )}
    </div>
  );
}
