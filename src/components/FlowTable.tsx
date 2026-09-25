'use client';

import { useLang } from '@/lib/i18n';
import type { LiveRow } from '@/lib/liveflow';

/**
 * Bảng từng dòng flow (alert REST hoặc lệnh WebSocket) — tách khỏi
 * LiveFlowPanel để tab Analyze vẽ flow của MỘT mã bằng đúng bảng đó. Hai
 * bảng giống nhau mà cột/màu lệch nhau là thứ người dùng phát hiện trước
 * lập trình viên (lý do `ChipRow.tsx` được tách, #147).
 */

export const money = (n: number | null) => {
  if (n === null || !Number.isFinite(n)) return '—';
  const a = Math.abs(n);
  if (a >= 1_000_000) return `$${(n / 1_000_000).toFixed(a >= 10_000_000 ? 0 : 1)}M`;
  if (a >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${Math.round(n)}`;
};
const px = (n: number | null) => (n === null ? '—' : `$${n.toFixed(2)}`);
const int = (n: number | null) => (n === null ? '—' : Math.round(n).toLocaleString('en-US'));

/** Giờ New York — đúng giờ sàn, không theo múi giờ của máy đang xem. */
export function nyTime(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return iso;
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/New_York',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date(t));
}
export function nyDayShort(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(t));
}

export default function FlowTable({
  rows,
  fresh,
  showTicker = true,
}: {
  rows: LiveRow[];
  fresh?: Set<string>;
  showTicker?: boolean;
}) {
  const { t } = useLang();
  const drawn = rows;
  return (
  <div className="tablewrap">
      <table className="pftable lftable">
        <thead>
          <tr>
            <th>{t('lf.col.time')}</th>
            {showTicker && <th>{t('lf.col.ticker')}</th>}
            <th>{t('lf.col.side')}</th>
            <th className="num">Strike</th>
            <th>C/P</th>
            <th>{t('lf.col.expiry')}</th>
            <th className="num">DTE</th>
            <th className="num">{t('lf.col.spot')}</th>
            <th className="num">Bid - Ask</th>
            <th className="num">{t('lf.col.fill')}</th>
            <th>{t('lf.col.fillSpread')}</th>
            <th className="num">Size</th>
            <th className="num">Premium</th>
            <th className="num">Vol</th>
            <th className="num">OI</th>
            <th>{t('lf.col.flags')}</th>
          </tr>
        </thead>
        <tbody>
          {drawn.map((r) => (
            <tr key={r.id} className={fresh?.has(r.id) ? "lfnew" : undefined}>
              <td className="lftime">
                <span className="lfday">{nyDayShort(r.at)}</span> {nyTime(r.at)}
              </td>
              {showTicker && <td className="lftk">{r.ticker || '—'}</td>}
              <td className={`lfside lfside-${r.side}`} title={r.sideSource === 'premium' ? t('lf.sidePremium') : undefined}>
                {r.side === 'unknown' ? '?' : t(`lf.side.${r.side}`).toUpperCase()}
              </td>
              <td className="num">{r.strike ?? '—'}</td>
              <td className={`lftype lftype-${r.type}`}>{r.type === 'other' ? '?' : r.type}</td>
              <td>{r.expiry ?? '—'}</td>
              <td className="num">{r.dte === null ? '—' : `${r.dte}d`}</td>
              <td className="num">{px(r.spot)}</td>
              <td className="num">
                {r.bid === null && r.ask === null ? '—' : `${px(r.bid)} - ${px(r.ask)}`}
              </td>
              <td className="num">{px(r.price)}</td>
              <td>
                {r.fillPos === null ? (
                  <span className="hint">—</span>
                ) : (
                  <span
                    className={`lfspread${r.outside ? ' out' : ''}`}
                    title={r.outside ? t('lf.outside') : undefined}
                  >
                    <i style={{ left: `${(r.fillPos * 100).toFixed(1)}%` }} />
                  </span>
                )}
              </td>
              <td className="num">{int(r.size)}</td>
              <td className="num lfprem">{money(r.premium)}</td>
              <td className="num">{int(r.volume)}</td>
              <td className="num">{int(r.openInterest)}</td>
              <td className="lfflags">
                {[r.sweep && 'Sweep', r.floor && 'Floor', r.multileg && 'Multi-leg', r.rule, r.kind === 'alert' && r.tradeCount && r.tradeCount > 1 ? `${r.tradeCount} fills` : null]
                  .filter(Boolean)
                  .join(' · ') || '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
