'use client';

import { useMemo, useState } from 'react';
import CushionBar from './CushionBar';
import type { Candidate } from '@/lib/types';
import { useLang } from '@/lib/i18n';

type SortKey =
  | 'score'
  | 'annualRocPct'
  | 'cushionPct'
  | 'delta'
  | 'capital'
  | 'dte'
  | 'ivHv'
  | 'iv'
  | 'drawdownPct';

/** Column labels are dictionary keys; the header resolves them per language. */
const COLS: { key: SortKey | null; label: string; left?: boolean }[] = [
  { key: null, label: 'res.symbol', left: true },
  { key: 'score', label: 'res.score' },
  { key: 'annualRocPct', label: 'res.roc' },
  { key: null, label: 'res.credit' },
  { key: 'capital', label: 'res.capital' },
  { key: null, label: 'res.strike' },
  { key: 'delta', label: 'Δ' },
  { key: 'dte', label: 'res.dte' },
  { key: 'cushionPct', label: 'res.cushion' },
  { key: null, label: 'res.breakeven' },
  { key: 'ivHv', label: 'res.ivhv' },
  { key: 'iv', label: 'res.iv' },
  { key: 'drawdownPct', label: 'res.drawdown' },
  { key: null, label: 'res.range52', left: true },
];

const usd = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

export default function ResultsTable({
  rows,
  onSelect,
}: {
  rows: Candidate[];
  onSelect: (r: Candidate) => void;
}) {
  const { t } = useLang();
  const [sort, setSort] = useState<SortKey>('score');

  const sorted = useMemo(
    () => [...rows].sort((a, b) => (b[sort] ?? 0) - (a[sort] ?? 0)),
    [rows, sort]
  );

  if (!rows.length) {
    return (
      <div className="empty">
        <strong>{t('res.emptyTitle')}</strong>
        {t('res.emptyBody')}
      </div>
    );
  }

  return (
    <div className="tablewrap">
      <table className="results">
        <thead>
          <tr>
            {COLS.map((c) => (
              <th
                key={c.label}
                className={c.left ? 'left' : undefined}
                onClick={() => c.key && setSort(c.key)}
                title={c.key ? t('res.sortHint') : undefined}
              >
                {c.label === 'Δ' ? c.label : t(c.label)}
                {sort === c.key ? ' ↓' : ''}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <tr
              key={r.optionSymbol}
              className="row-in clickable"
              onClick={() => onSelect(r)}
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && onSelect(r)}
            >
              <td className="left">
                <span className="sym">{r.symbol}</span>
                {r.warnings.map((w) => (
                  <span className="flag" key={w} title={w}>
                    !
                  </span>
                ))}
                <span className="sub2">{r.name}</span>
              </td>
              <td className="scorecell">{r.score}</td>
              <td className="num-key">{r.annualRocPct.toFixed(1)}%</td>
              <td>{usd(r.credit)}</td>
              <td>{usd(r.capital)}</td>
              <td>{r.strike.toFixed(2)}</td>
              <td>{r.delta.toFixed(2)}</td>
              <td>{r.dte}</td>
              <td>{(r.cushionPct * 100).toFixed(1)}%</td>
              <td className={r.breakeven < r.low52 ? 'warn' : undefined}>
                {r.breakeven.toFixed(2)}
              </td>
              <td>{r.ivHv ? r.ivHv.toFixed(2) : '—'}</td>
              <td>{(r.iv * 100).toFixed(0)}%</td>
              <td>−{r.drawdownPct.toFixed(1)}%</td>
              <td className="left">
                <CushionBar
                  low52={r.low52}
                  high52={r.high52}
                  spot={r.spot}
                  strike={r.strike}
                  breakeven={r.breakeven}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
