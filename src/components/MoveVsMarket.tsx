'use client';

import { useLang } from '@/lib/i18n';
import { FLAT_SIGMA, REL_SIGMA, type MoveRead } from '@/lib/moveread';

/**
 * Bảng "diễn biến giá so với thị trường" ở tab Analyze — đúng những con số và
 * nhãn Claude đọc trong phần "thị trường đang nói gì" (`moveFacts()`), để câu
 * trả lời tra ngược được về một bảng trên màn hình.
 */
const sign = (v: number | null) =>
  v === null ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`;
const cls = (v: number | null) => (v === null ? '' : v >= 0 ? 'good' : 'bad');

export default function MoveVsMarket({ moves }: { moves: MoveRead | null | undefined }) {
  const { t } = useLang();
  if (!moves) {
    return <p className="cap hint hint-warn">{t('mv.none')}</p>;
  }
  const etf = moves.sectorEtf;
  return (
    <div className="mvwrap">
      <div className="tablewrap">
        <table className="sftable mvtable">
          <thead>
            <tr>
              <th>{t('mv.window')}</th>
              <th className="num">{t('mv.stock')}</th>
              <th className="num">{moves.market}</th>
              {etf && <th className="num">{etf}</th>}
              <th>{t('mv.label')}</th>
              <th>{t('mv.driver')}</th>
            </tr>
          </thead>
          <tbody>
            {moves.windows.map((w) => (
              <tr key={w.sessions}>
                <td>{w.sessions === 1 ? t('mv.w1') : t('mv.wn', w.sessions)}</td>
                <td className={`num ${cls(w.stock)}`}>{sign(w.stock)}</td>
                <td className="num">{sign(w.market)}</td>
                {etf && <td className="num">{sign(w.sector)}</td>}
                <td className="mvlabel">{w.label ? t(`mv.label.${w.label}`) : '—'}</td>
                <td className="mvdriver">
                  {w.driver ? t(`mv.driver.${w.driver}`) : w.label === 'flat' ? t('mv.driver.none') : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="cap">
        {t('mv.note', { f: FLAT_SIGMA, r: REL_SIGMA, d: moves.sessionDate })}
        {!etf ? ` ${t('mv.noSector')}` : ''}
      </p>
      {moves.hv20 === null && <p className="cap hint hint-warn">{t('mv.noHv')}</p>}
      {moves.errors.map((e) => (
        <p key={e.source} className="cap hint hint-warn mverr">
          {t('mv.failed', { src: e.source, err: e.error })}
        </p>
      ))}
    </div>
  );
}
