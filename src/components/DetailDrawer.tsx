'use client';

import { useEffect } from 'react';
import TradingViewWidget from './TradingViewWidget';
import { useLang } from '@/lib/i18n';
import GexChart from './GexChart';
import {
  tvSymbol,
  tradingViewChartUrl,
  tcpwGexUrl,
  tcpwGexUrlEn,
} from '@/lib/links';
import type { Candidate } from '@/lib/types';

const usd = (n: number) =>
  n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  });

const sc = (n: number) => (n >= 0 ? 'good' : 'bad');

export default function DetailDrawer({
  row,
  onClose,
  inWatchlist,
  onToggleWatchlist,
}: {
  row: Candidate | null;
  onClose: () => void;
  inWatchlist: boolean;
  onToggleWatchlist: (symbol: string) => void;
}) {
  const { t } = useLang();

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);

  if (!row) return null;
  const tv = tvSymbol(row.symbol, row.exchange);

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-label={t('dd.aria', row.symbol)}>
        <div className="drawer-head">
          <div>
            <span className="sym">{row.symbol}</span>
            <span className="sub2">{row.name}</span>
          </div>
          <div className="headacts">
            <button
              className={inWatchlist ? 'wl on' : 'wl'}
              title={t(inWatchlist ? 'wl.removeTitle' : 'wl.addTitle')}
              onClick={() => onToggleWatchlist(row.symbol)}
            >
              {inWatchlist ? t('dd.inWatchlist') : t('dd.saveWatchlist')}
            </button>
            <button className="x" onClick={onClose} aria-label={t('dd.close')}>
              ✕
            </button>
          </div>
        </div>

        <div className="drawer-body">
          <dl className="stats">
            <div>
              <dt>{t('dd.strike')}</dt>
              <dd>{usd(row.strike)}</dd>
            </div>
            <div>
              <dt>{t('dd.expiry')}</dt>
              <dd>
                {row.expiration} · {row.dte}d
              </dd>
            </div>
            <div>
              <dt>{t('dd.credit')}</dt>
              <dd className={`num-key ${sc(row.credit)}`}>{usd(row.credit)}</dd>
            </div>
            <div>
              <dt>{t('dd.capital')}</dt>
              <dd className={sc(row.capital)}>{usd(row.capital)}</dd>
            </div>
            <div>
              <dt>{t('dd.breakeven')}</dt>
              <dd className={row.breakeven < row.low52 ? 'warn' : sc(row.breakeven)}>
                {usd(row.breakeven)}
              </dd>
            </div>
            <div>
              <dt>{t('dd.annual')}</dt>
              <dd className={`num-key ${sc(row.annualRocPct)}`}>
                {row.annualRocPct.toFixed(1)}%
              </dd>
            </div>
            <div>
              <dt>{t('dd.roiExpired')}</dt>
              <dd className={`num-key ${sc(row.rocPct)}`}>{row.rocPct.toFixed(1)}%</dd>
            </div>
            <div>
              <dt>{t('dd.roiAssigned')}</dt>
              <dd className={`num-key ${sc(row.returnIfAssignedPct)}`}>
                {row.returnIfAssignedPct.toFixed(1)}%
              </dd>
            </div>
            <div>
              <dt>{t('dd.maxLoss')}</dt>
              <dd className="bad">{usd(row.maxLoss)}</dd>
            </div>
          </dl>
          <p className="dd-note">{t('dd.yieldNote')}</p>

          <p className="assigned">
            {t('dd.assigned', {
              symbol: row.symbol,
              be: usd(row.breakeven),
              pct: (((row.spot - row.breakeven) / row.spot) * 100).toFixed(1),
            })}
          </p>

          {row.warnings.length > 0 && (
            <ul className="warnlist">
              {row.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          )}

          <h3 className="dsec">{t('dd.chart')}</h3>
          <TradingViewWidget
            type="advanced-chart"
            height={320}
            attributionHref={`https://www.tradingview.com/symbols/${tv.replace(
              ':',
              '-'
            )}/`}
            attributionLabel={`${row.symbol} chart`}
            config={{
              width: '100%',
              height: 320,
              symbol: tv,
              interval: 'D',
              range: '6M',
              timezone: 'America/New_York',
              theme: 'light',
              style: '1',
              locale: 'en',
              hide_side_toolbar: true,
              allow_symbol_change: false,
              save_image: false,
              studies: ['MASimple@tv-basicstudies'],
              support_host: 'https://www.tradingview.com',
            }}
          />
          <p className="cap">
            {t('dd.chartNote', {
              strike: usd(row.strike),
              be: usd(row.breakeven),
            })}
          </p>

          <h3 className="dsec">{t('dd.technicals')}</h3>
          <TradingViewWidget
            type="technical-analysis"
            height={400}
            attributionHref={`https://www.tradingview.com/symbols/${tv.replace(
              ':',
              '-'
            )}/technicals/`}
            attributionLabel={`${row.symbol} technicals`}
            config={{
              interval: '1D',
              width: '100%',
              height: 400,
              isTransparent: true,
              symbol: tv,
              showIntervalTabs: true,
              displayMode: 'single',
              locale: 'en',
              colorTheme: 'light',
            }}
          />

          <h3 className="dsec">Gamma theo strike</h3>
          <GexChart symbol={row.symbol} strike={row.strike} />
          <p className="cap">
            {t('dd.gexNote')}
          </p>

          <h3 className="dsec">{t('dd.external')}</h3>
          <div className="linkrow">
            <a href={tcpwGexUrl(row.symbol)} target="_blank" rel="noopener">
              {t('dd.gexTcpw')}
            </a>
            <a href={tcpwGexUrlEn(row.symbol)} target="_blank" rel="noopener">
              {t('dd.gexTcpwEn')}
            </a>
            <a
              href={tradingViewChartUrl(row.symbol, row.exchange)}
              target="_blank"
              rel="noopener"
            >
              {t('dd.fullChart')}
            </a>
          </div>
          <p className="cap">
            {t('dd.externalNote')}
          </p>
        </div>
      </aside>
    </>
  );
}
