'use client';

import { useMemo, useState } from 'react';
import CushionBar from './CushionBar';
import type { Candidate } from '@/lib/types';

type SortKey =
  | 'score'
  | 'annualRocPct'
  | 'cushionPct'
  | 'delta'
  | 'capital'
  | 'dte'
  | 'ivHv';

const COLS: { key: SortKey | null; label: string; left?: boolean }[] = [
  { key: null, label: 'Mã', left: true },
  { key: 'score', label: 'Điểm' },
  { key: 'annualRocPct', label: 'LS/năm' },
  { key: null, label: 'Credit' },
  { key: 'capital', label: 'Vốn' },
  { key: null, label: 'Strike' },
  { key: 'delta', label: 'Δ' },
  { key: 'dte', label: 'DTE' },
  { key: 'cushionPct', label: 'Đệm' },
  { key: null, label: 'Break-even' },
  { key: 'ivHv', label: 'IV/HV' },
  { key: null, label: 'Biên độ 52T', left: true },
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
  const [sort, setSort] = useState<SortKey>('score');

  const sorted = useMemo(
    () => [...rows].sort((a, b) => (b[sort] ?? 0) - (a[sort] ?? 0)),
    [rows, sort]
  );

  if (!rows.length) {
    return (
      <div className="empty">
        <strong>Chưa có kết quả</strong>
        Chỉnh tiêu chí bên trái rồi bấm Quét. Kết quả hiện dần theo từng mã.
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
                title={c.key ? 'Bấm để sắp xếp' : undefined}
              >
                {c.label}
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
