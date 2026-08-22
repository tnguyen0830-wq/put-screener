'use client';

import { DEFAULT_OFF, isOn, type FilterKey, type Filters } from '@/lib/types';
import { useLang } from '@/lib/i18n';

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
  const { t } = useLang();
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
      <div className="panel-head">{t('filters.head')}</div>
      <div className="panel-body">
        <div className="segmented" role="group" aria-label={t('filters.scope')}>
          <button
            className={value.universe === 'sp500' ? 'on' : ''}
            onClick={() => set('universe', 'sp500')}
          >
            {t('filters.sp500')}
          </button>
          <button
            className={value.universe === 'watchlist' ? 'on' : ''}
            onClick={() => set('universe', 'watchlist')}
          >
            {t('filters.watchlist')}
            {watchlistCount ? ` (${watchlistCount})` : ''}
          </button>
        </div>

        <p className="hint hint-lead">
          {t('filters.lead')}
        </p>

        <div className={field('capital')}>
          {head('capital', t('filters.capital'))}
          <input step={1000} {...num('maxCapital', 'capital')} />
          {!on('capital') && (
            <p className="hint hint-warn">
              {t('filters.capitalOff')}
            </p>
          )}
        </div>

        <div className={field('delta')}>
          {head('delta', t('filters.delta'))}
          <div className="pair">
            <input
              step={0.01}
              {...num('minDelta', 'delta')}
              aria-label={t('filters.deltaMin')}
            />
            <input
              step={0.01}
              {...num('maxDelta', 'delta')}
              aria-label={t('filters.deltaMax')}
            />
          </div>
        </div>

        <div className={field('dte')}>
          {head('dte', t('filters.dte'))}
          <div className="pair">
            <input {...num('minDte', 'dte')} aria-label={t('filters.dteMin')} />
            <input {...num('maxDte', 'dte')} aria-label={t('filters.dteMax')} />
          </div>
          {!on('dte') && (
            <p className="hint hint-warn">
              {t('filters.dteOff')}
            </p>
          )}
        </div>

        <div className={field('roc')}>
          {head('roc', t('filters.roc'))}
          <input {...num('minAnnualRoc', 'roc')} />
        </div>

        <div className={field('liquidity')}>
          {head('liquidity', t('filters.liquidity'))}
          <div className="pair">
            <input
              {...num('minOpenInterest', 'liquidity')}
              aria-label={t('filters.oiMin')}
            />
            <input
              step={0.5}
              {...num('maxSpreadPct', 'liquidity')}
              aria-label={t('filters.spreadMax')}
            />
          </div>
          <p className="hint">{t('filters.liquidityHint')}</p>
        </div>

        <div className={field('drawdown')}>
          {head('drawdown', t('filters.drawdown'))}
          <input {...num('minDrawdownPct', 'drawdown')} />
          <p className="hint">
            {t('filters.drawdownHint')}
          </p>
        </div>

        <div className={field('ivhv')}>
          {head('ivhv', t('filters.ivhv'))}
          <input step={0.05} {...num('minIvHv', 'ivhv')} />
          <p className="hint">
            {t('filters.ivhvHint')}
          </p>
        </div>

        <div className={field('iv')}>
          {head('iv', t('filters.iv'))}
          <input {...num('minIv', 'iv')} />
          <p className="hint">
            {t('filters.ivHint')}
          </p>
        </div>

        <div
          className="field"
          hidden={value.universe === 'watchlist'}
        >
          <label htmlFor="sector">{t('filters.sector')}</label>
          <select
            id="sector"
            value={value.sectors[0] ?? ''}
            onChange={(e) =>
              set('sectors', e.target.value ? [e.target.value] : [])
            }
          >
            <option value="">{t('filters.allSectors')}</option>
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
          {t('filters.sma200')}
        </label>

        <label className="check">
          <input
            type="checkbox"
            checked={value.excludeEarnings}
            onChange={(e) => set('excludeEarnings', e.target.checked)}
          />
          {t('filters.earnings')}
        </label>

        <button className="run" onClick={onRun} disabled={running}>
          {running
            ? t('filters.running')
            : value.universe === 'watchlist'
              ? t('filters.runWatchlist')
              : t('filters.runSp500')}
        </button>

        {loosened > 0 && (
          <p className="hint hint-warn">
            {t('filters.loosened', loosened)}
          </p>
        )}

        <p className="hint">
          {value.universe === 'watchlist'
            ? t('filters.hintWatchlist')
            : t('filters.hintSp500')}
        </p>
      </div>
    </section>
  );
}
