'use client';

import type { Filters } from '@/lib/types';

const SECTORS = [
  'Communication Services',
  'Consumer Discretionary',
  'Consumer Staples',
  'Energy',
  'Financials',
  'Health Care',
  'Industrials',
  'Information Technology',
  'Materials',
  'Real Estate',
  'Utilities',
];

type Props = {
  value: Filters;
  onChange: (f: Filters) => void;
  onRun: () => void;
  running: boolean;
  watchlistCount: number;
};

export default function FilterPanel({
  value,
  onChange,
  onRun,
  running,
  watchlistCount,
}: Props) {
  const set = <K extends keyof Filters>(k: K, v: Filters[K]) =>
    onChange({ ...value, [k]: v });

  const num = (k: keyof Filters) => ({
    type: 'number' as const,
    value: value[k] as number,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
      set(k, Number(e.target.value) as any),
  });

  return (
    <section className="panel">
      <div className="panel-head">Tiêu chí lọc</div>
      <div className="panel-body">
        <div className="segmented" role="group" aria-label="Phạm vi quét">
          <button
            className={value.universe === 'sp500' ? 'on' : ''}
            onClick={() => set('universe', 'sp500')}
          >
            Cả S&amp;P 500
          </button>
          <button
            className={value.universe === 'watchlist' ? 'on' : ''}
            onClick={() => set('universe', 'watchlist')}
          >
            Watchlist{watchlistCount ? ` (${watchlistCount})` : ''}
          </button>
        </div>

        <div className="field">
          <label htmlFor="cap">Vốn tối đa mỗi vị thế (USD)</label>
          <input id="cap" step={1000} {...num('maxCapital')} />
        </div>

        <div className="field">
          <label>Delta (tuyệt đối)</label>
          <div className="pair">
            <input step={0.01} {...num('minDelta')} aria-label="Delta tối thiểu" />
            <input step={0.01} {...num('maxDelta')} aria-label="Delta tối đa" />
          </div>
        </div>

        <div className="field">
          <label>Số ngày đến đáo hạn</label>
          <div className="pair">
            <input {...num('minDte')} aria-label="DTE tối thiểu" />
            <input {...num('maxDte')} aria-label="DTE tối đa" />
          </div>
        </div>

        <div className="field">
          <label htmlFor="roc">Lợi suất quy năm tối thiểu (%)</label>
          <input id="roc" {...num('minAnnualRoc')} />
        </div>

        <div className="field">
          <label>Thanh khoản</label>
          <div className="pair">
            <input
              {...num('minOpenInterest')}
              aria-label="Open interest tối thiểu"
            />
            <input
              step={0.5}
              {...num('maxSpreadPct')}
              aria-label="Spread tối đa phần trăm"
            />
          </div>
          <p className="hint">Trái: OI tối thiểu. Phải: spread tối đa (% của mid).</p>
        </div>

        <div className="field">
          <label htmlFor="ivhv">IV / HV20 tối thiểu</label>
          <input id="ivhv" step={0.05} {...num('minIvHv')} />
        </div>

        <div
          className="field"
          hidden={value.universe === 'watchlist'}
        >
          <label htmlFor="sector">Ngành</label>
          <select
            id="sector"
            value={value.sectors[0] ?? ''}
            onChange={(e) =>
              set('sectors', e.target.value ? [e.target.value] : [])
            }
          >
            <option value="">Tất cả</option>
            {SECTORS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        <label className="check">
          <input
            type="checkbox"
            checked={value.requireAboveSma200}
            onChange={(e) => set('requireAboveSma200', e.target.checked)}
          />
          Chỉ lấy mã trên SMA200
        </label>

        <label className="check">
          <input
            type="checkbox"
            checked={value.excludeEarnings}
            onChange={(e) => set('excludeEarnings', e.target.checked)}
          />
          Loại hợp đồng vắt qua earnings
        </label>

        <button className="run" onClick={onRun} disabled={running}>
          {running
            ? 'Đang quét…'
            : value.universe === 'watchlist'
              ? 'Quét watchlist'
              : 'Quét S&P 500'}
        </button>

        <p className="hint">
          {value.universe === 'watchlist'
            ? 'Quét watchlist mất vài chục giây, chạy lại thoải mái trong phiên.'
            : 'Quét toàn rổ mất khoảng 4–8 phút vì Schwab giới hạn 120 request/phút. Đặt vốn thấp hơn để loại bớt mã đắt và chạy nhanh hơn.'}
        </p>
      </div>
    </section>
  );
}
