'use client';

import { useLang } from '@/lib/i18n';

import { useState } from 'react';

type Props = {
  symbols: string[];
  onChange: (symbols: string[]) => void;
  saving: boolean;
};

export default function WatchlistPanel({ symbols, onChange, saving }: Props) {
  const { t } = useLang();
  const [draft, setDraft] = useState('');

  const add = () => {
    if (!draft.trim()) return;
    // Accept "AAPL MSFT, NVDA" in one paste.
    const incoming = draft
      .split(/[\s,]+/)
      .map((s) => s.trim().toUpperCase().replace(/\./g, '/'))
      .filter(Boolean);
    onChange(Array.from(new Set([...symbols, ...incoming])));
    setDraft('');
  };

  return (
    <section className="panel">
      <div className="panel-head">
        Watchlist {symbols.length > 0 && `· ${symbols.length}`}
        {saving && <span className="saving">{t('common.saving')}</span>}
      </div>
      <div className="panel-body">
        <div className="addrow">
          <input
            value={draft}
            placeholder="AAPL MSFT NVDA"
            aria-label={t('wl.addAria')}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && add()}
          />
          <button onClick={add} aria-label={t('wl.addBtnAria')}>
            {t('wl.add')}
          </button>
        </div>

        {symbols.length === 0 ? (
          <p className="hint">
            {t('wl.empty')}
          </p>
        ) : (
          <ul className="chips">
            {symbols.map((s) => (
              <li key={s}>
                {s}
                <button
                  onClick={() => onChange(symbols.filter((x) => x !== s))}
                  aria-label={t('wl.remove', s)}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
