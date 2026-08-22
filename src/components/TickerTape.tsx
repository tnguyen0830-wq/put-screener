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
  { proName: 'TVC:US10Y', title: 'Lợi suất 10 năm' },
  { proName: 'TVC:DXY', title: 'Chỉ số USD' },
  { proName: 'BITSTAMP:BTCUSD', title: 'Bitcoin' },
];

/**
 * The app's own theme, kept current. ThemeToggle writes data-theme on <html>
 * and removes it for 'system', so both the attribute and the OS preference
 * have to be watched - neither alone tells the whole story.
 */
function useAppTheme(): 'light' | 'dark' {
  // 'light' on the first pass so server and client agree; corrected on mount.
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

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
