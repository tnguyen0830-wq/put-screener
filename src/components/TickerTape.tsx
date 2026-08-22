'use client';

import { useEffect, useState } from 'react';
import TradingViewWidget from './TradingViewWidget';
import { resolveTheme } from './ThemeToggle';

/**
 * What a cash-secured put seller glances at before deciding whether today is a
 * day to sell: the three indices this screener draws from, the volatility
 * regime that sets how rich the premium is, and the macro row that usually
 * explains why it moved.
 *
 * VIX earns its place more than any single index here - the whole screener is a
 * bet on implied vol being generous, and VIX says whether it is.
 */
const SYMBOLS = [
  { proName: 'AMEX:SPY', title: 'S&P 500' },
  { proName: 'NASDAQ:QQQ', title: 'Nasdaq 100' },
  { proName: 'AMEX:IWM', title: 'Russell 2000' },
  { proName: 'TVC:VIX', title: 'VIX' },
  { proName: 'TVC:GOLD', title: 'Vàng' },
  { proName: 'TVC:USOIL', title: 'Dầu WTI' },
  { proName: 'BITSTAMP:BTCUSD', title: 'Bitcoin' },
];

// Dropped: TVC:US10Y and TVC:DXY. Both came back with the widget's red error
// badge and no price at all - the free tape does not serve them. Guessing at
// replacements costs a deploy per attempt and cannot be checked from here,
// so they are simply out until a working symbol is confirmed on a device.

/**
 * The app's own theme, kept current. ThemeToggle writes data-theme on <html>
 * and removes it for 'system', so both the attribute and the OS preference
 * have to be watched - neither alone tells the whole story.
 */
function useAppTheme(): 'light' | 'dark' | null {
  // null until resolved on the client. The widget must not be built before
  // then: it reads colorTheme once at construction, and building it with a
  // placeholder theme first leaves two copies racing to load, where the stale
  // light one can win and the bar ends up white inside a dark app.
  const [theme, setTheme] = useState<'light' | 'dark' | null>(null);

  useEffect(() => {
    const read = () => {
      const attr = document.documentElement.getAttribute('data-theme');
      setTheme(
        attr === 'light' || attr === 'dark' ? attr : resolveTheme('system')
      );
    };
    read();

    const obs = new MutationObserver(read);
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });

    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', read);

    return () => {
      obs.disconnect();
      mq.removeEventListener('change', read);
    };
  }, []);

  return theme;
}

export default function TickerTape() {
  const theme = useAppTheme();

  // Holds the bar's height so the page does not jump when the widget lands.
  if (!theme) return <div className="tape tape-placeholder" />;

  return (
    <div className="tape">
      <TradingViewWidget
        type="ticker-tape"
        height={46}
        config={{
          symbols: SYMBOLS,
          showSymbolLogo: true,
          isTransparent: true,
          displayMode: 'adaptive',
          colorTheme: theme,
          locale: 'en',
        }}
      />
    </div>
  );
}
