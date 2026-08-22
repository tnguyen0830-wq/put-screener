'use client';

import { useCallback, useEffect, useState } from 'react';
import FilterPanel from '@/components/FilterPanel';
import TickerTape from '@/components/TickerTape';
import ResultsTable from '@/components/ResultsTable';
import DetailDrawer from '@/components/DetailDrawer';
import WatchlistPanel from '@/components/WatchlistPanel';
import AnalysisPanel from '@/components/AnalysisPanel';
import HeatmapPanel from '@/components/HeatmapPanel';
import SettingsMenu from '@/components/SettingsMenu';
import { useLang } from '@/lib/i18n';
import Logo from '@/components/Logo';
import ColorLegend from '@/components/ColorLegend';
import { DEFAULT_OFF, type Candidate, type Filters, type StreamEvent } from '@/lib/types';

const DEFAULTS: Filters = {
  universe: 'sp500',
  maxCapital: 50000,
  minDelta: 0.15,
  maxDelta: 0.3,
  minDte: 25,
  maxDte: 50,
  minAnnualRoc: 15,
  minOpenInterest: 500,
  maxSpreadPct: 5,
  minIvHv: 1.0,
  minDrawdownPct: 10,
  minIv: 35,
  requireAboveSma200: true,
  excludeEarnings: true,
  sectors: [],
  limit: 0,
  off: [...DEFAULT_OFF],
};

type Status = {
  configured: boolean;
  connected: boolean;
  daysLeft?: number;
};

type Tab = 'screener' | 'analyze' | 'heatmap';

export default function Page() {
  const { t } = useLang();
  const [tab, setTab] = useState<Tab>('screener');
  const [focusSymbol, setFocusSymbol] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>(DEFAULTS);
  const [rows, setRows] = useState<Candidate[]>([]);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [phase, setPhase] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [selected, setSelected] = useState<Candidate | null>(null);
  const [watchlist, setWatchlist] = useState<string[]>([]);
  const [savingList, setSavingList] = useState(false);

  useEffect(() => {
    fetch('/api/watchlist')
      .then((r) => r.json())
      .then((j) => setWatchlist(j.symbols ?? []))
      .catch(() => {});
  }, []);

  const saveWatchlist = useCallback(async (symbols: string[]) => {
    setWatchlist(symbols); // optimistic: the list is small and the write is local
    setSavingList(true);
    try {
      const res = await fetch('/api/watchlist', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbols }),
      });
      const j = await res.json();
      if (Array.isArray(j.symbols)) setWatchlist(j.symbols);
    } finally {
      setSavingList(false);
    }
  }, []);

  useEffect(() => {
    fetch('/api/auth/status')
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => setStatus({ configured: false, connected: false }));
  }, []);

  const run = useCallback(async () => {
    setRunning(true);
    setRows([]);
    setError(null);
    setProgress({ done: 0, total: 0 });
    setPhase(t('phase.quotes'));

    try {
      const res = await fetch('/api/screen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(filters),
      });
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buf = '';

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.trim()) continue;
          const ev = JSON.parse(line) as StreamEvent;
          if (ev.type === 'candidate') {
            setRows((prev) => [...prev, ev.data]);
          } else if (ev.type === 'progress') {
            setProgress({ done: ev.done, total: ev.total });
          } else if (ev.type === 'phase') {
            setPhase(
              ev.phase === 'quotes'
                ? `Đang lấy báo giá — ${ev.detail}`
                : `Đang đọc chuỗi quyền chọn — ${ev.detail}`
            );
          } else if (ev.type === 'error') {
            setError(ev.message);
          } else if (ev.type === 'done') {
            setPhase(
              `Xong: ${ev.found} cơ hội trong ${ev.scanned} mã, ${(
                ev.ms / 1000
              ).toFixed(0)} giây`
            );
          }
        }
      }
    } catch (e: any) {
      setError(e.message ?? 'Quét thất bại');
    } finally {
      setRunning(false);
    }
  }, [filters]);

  const toggleWatchlist = useCallback(
    (sym: string) =>
      saveWatchlist(
        watchlist.includes(sym)
          ? watchlist.filter((s) => s !== sym)
          : [...watchlist, sym]
      ),
    [watchlist, saveWatchlist]
  );

  const pct = progress.total
    ? Math.round((progress.done / progress.total) * 100)
    : 0;

  return (
    <>
      <div className="topstack">
      <header className="rail">
        <a className="brand" href="/" aria-label={t('brand.home')}>
          <Logo height={32} />
          <span className="brandtext">
            <span className="wordmark">
              <span className="wm-name">tyler</span>
              <span className="wm-dot" aria-hidden="true" />
              <span className="wm-tag">INVESTMENT TOOL</span>
            </span>
            <span className="brandsub">{t('brand.sub')}</span>
          </span>
        </a>
        <nav className="segmented tabs">
          <button
            className={tab === 'screener' ? 'on' : undefined}
            onClick={() => setTab('screener')}
          >
            {t('tab.screener')}
          </button>
          <button
            className={tab === 'analyze' ? 'on' : undefined}
            onClick={() => setTab('analyze')}
          >
            {t('tab.analyze')}
          </button>
          <button
            className={tab === 'heatmap' ? 'on' : undefined}
            onClick={() => setTab('heatmap')}
          >
            {t('tab.heatmap')}
          </button>
        </nav>
        <span className="spacer" />
        <SettingsMenu status={status} />
      </header>

      <TickerTape />
      </div>

      {running && (
        <div className="bar">
          <i style={{ width: `${pct}%` }} />
        </div>
      )}

      {tab === 'screener' ? (
        <div className="shell">
          <div className="leftcol sticky-col">
            <FilterPanel
              value={filters}
              onChange={setFilters}
              onRun={run}
              running={running}
              watchlistCount={watchlist.length}
            />
            <WatchlistPanel
              symbols={watchlist}
              onChange={saveWatchlist}
              saving={savingList}
            />
          </div>

          <section className="panel">
            <div className="panel-head">
              {error
                ? error
                : phase || t('res.count', rows.length)}
            </div>
            <div className="panel-body" style={{ paddingBottom: 0 }}>
              <ColorLegend />
            </div>
            <ResultsTable rows={rows} onSelect={setSelected} />
          </section>
        </div>
      ) : tab === 'analyze' ? (
        <div className="shell solo">
          <AnalysisPanel
            watchlist={watchlist}
            onToggleWatchlist={toggleWatchlist}
            focusSymbol={focusSymbol}
          />
        </div>
      ) : (
        <div className="shell solo">
          <HeatmapPanel
            onSelectSymbol={(sym) => {
              setFocusSymbol(sym);
              setTab('analyze');
            }}
          />
        </div>
      )}

      <DetailDrawer
        row={selected}
        onClose={() => setSelected(null)}
        inWatchlist={selected ? watchlist.includes(selected.symbol) : false}
        onToggleWatchlist={toggleWatchlist}
      />

      <p className="disclaimer">
        {t('disclaimer')}
      </p>
    </>
  );
}
