'use client';

import { DEFAULT_OFF, isOn, type FilterKey, type Filters } from '@/lib/types';

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

  const on = (k: FilterKey) => isOn(value, k);

  const toggle = (k: FilterKey, checked: boolean) => {
    const off = new Set(value.off ?? []);
    if (checked) off.delete(k);
    else off.add(k);
    set('off', [...off]);
  };

  /**
   * Inputs of a switched-off criterion stay filled but go disabled: the typed
   * numbers survive the round trip, and nothing looks like it is still being
   * applied when it is not.
   */
  const num = (k: keyof Filters, group: FilterKey) => ({
    type: 'number' as const,
    value: value[k] as number,
    disabled: !on(group),
    onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
      set(k, Number(e.target.value) as any),
  });

  const field = (group: FilterKey) => `field${on(group) ? '' : ' field-off'}`;

  const head = (group: FilterKey, text: string) => (
    <label className="field-toggle">
      <input
        type="checkbox"
        checked={on(group)}
        onChange={(e) => toggle(group, e.target.checked)}
      />
      <span>{text}</span>
    </label>
  );

  // Only criteria that normally apply count as "loosened"; the ones that ship
  // switched off are the baseline, so having them off is not worth a warning.
  const loosened = (value.off ?? []).filter(
    (k) => !DEFAULT_OFF.includes(k)
  ).length;

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

        <p className="hint hint-lead">
          Bỏ tick một tiêu chí để <strong>không áp dụng</strong> tiêu chí đó. Số đã
          nhập vẫn được giữ, tick lại là dùng nguyên như cũ.
        </p>

        <div className={field('capital')}>
          {head('capital', 'Vốn tối đa mỗi vị thế (USD)')}
          <input step={1000} {...num('maxCapital', 'capital')} />
          {!on('capital') && (
            <p className="hint hint-warn">
              Không loại mã đắt trước khi tải chuỗi quyền chọn, nên quét sẽ lâu hơn
              đáng kể.
            </p>
          )}
        </div>

        <div className={field('delta')}>
          {head('delta', 'Delta (tuyệt đối)')}
          <div className="pair">
            <input
              step={0.01}
              {...num('minDelta', 'delta')}
              aria-label="Delta tối thiểu"
            />
            <input
              step={0.01}
              {...num('maxDelta', 'delta')}
              aria-label="Delta tối đa"
            />
          </div>
        </div>

        <div className={field('dte')}>
          {head('dte', 'Số ngày đến đáo hạn')}
          <div className="pair">
            <input {...num('minDte', 'dte')} aria-label="DTE tối thiểu" />
            <input {...num('maxDte', 'dte')} aria-label="DTE tối đa" />
          </div>
          {!on('dte') && (
            <p className="hint hint-warn">
              Vẫn giới hạn 180 ngày tới — quét mọi đáo hạn xa hơn thì chuỗi quyền
              chọn phình quá to mà không dùng để bán put.
            </p>
          )}
        </div>

        <div className={field('roc')}>
          {head('roc', 'Lợi suất quy năm tối thiểu (%)')}
          <input {...num('minAnnualRoc', 'roc')} />
        </div>

        <div className={field('liquidity')}>
          {head('liquidity', 'Thanh khoản')}
          <div className="pair">
            <input
              {...num('minOpenInterest', 'liquidity')}
              aria-label="Open interest tối thiểu"
            />
            <input
              step={0.5}
              {...num('maxSpreadPct', 'liquidity')}
              aria-label="Spread tối đa phần trăm"
            />
          </div>
          <p className="hint">Trái: OI tối thiểu. Phải: spread tối đa (% của mid).</p>
        </div>

        <div className={field('drawdown')}>
          {head('drawdown', 'Rớt từ đỉnh 52 tuần tối thiểu (%)')}
          <input {...num('minDrawdownPct', 'drawdown')} />
          <p className="hint">
            Chỉ lấy mã đã rớt ít nhất bấy nhiêu % so với đỉnh 52 tuần. Gõ 10 hoặc
            20 tuỳ mức chiết khấu bạn muốn.
          </p>
        </div>

        <div className={field('ivhv')}>
          {head('ivhv', 'IV / HV20 tối thiểu')}
          <input step={0.05} {...num('minIvHv', 'ivhv')} />
          <p className="hint">
            IV cao so với biến động thực tế 20 phiên. 1.0 = quyền chọn đang được
            trả đúng bằng mức dao động thật.
          </p>
        </div>

        <div className={field('iv')}>
          {head('iv', 'IV tối thiểu (%)')}
          <input {...num('minIv', 'iv')} />
          <p className="hint">
            IV tuyệt đối của chính hợp đồng. Khác ô trên: ô trên so IV với biến
            động thật, ô này chỉ hỏi IV có cao hay không.
          </p>
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

        {loosened > 0 && (
          <p className="hint hint-warn">
            Đang tắt {loosened} tiêu chí — kết quả sẽ nhiều và lỏng hơn bình thường.
          </p>
        )}

        <p className="hint">
          {value.universe === 'watchlist'
            ? 'Quét watchlist mất vài chục giây, chạy lại thoải mái trong phiên.'
            : 'Quét toàn rổ mất khoảng 4–8 phút vì Schwab giới hạn 120 request/phút. Đặt vốn thấp hơn để loại bớt mã đắt và chạy nhanh hơn.'}
        </p>
      </div>
    </section>
  );
}
