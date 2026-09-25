'use client';

import { useLang } from '@/lib/i18n';
import { PROB_DAYS, type Outlook } from '@/lib/outlook';

/**
 * Bản đồ mức giá của chế độ "Kịch bản giá" — những con số Claude được phép
 * dùng, in ra TRƯỚC khi ai bấm gì.
 *
 * Hiện ra ngay vì nó miễn phí: mọi thứ tính từ payload trang Analyze đã có,
 * không tốn request hay tiền API. Và vì câu trả lời của Claude chỉ đáng tin
 * khi người đọc tra ngược được từng mức giá nó nhắc tới về một dòng ở đây.
 */
export default function OutlookMap({ o }: { o: Outlook }) {
  const { t } = useLang();
  const f = (x: number) => x.toFixed(2);
  /* Dưới 1% in "<1%" chứ không "0%": một mức xa vẫn CÓ xác suất, và số 0
     đọc thành "không thể xảy ra". */
  const pc = (x: number | null) =>
    x === null ? '—' : x > 0 && x < 0.01 ? '<1%' : `${Math.round(x * 100)}%`;
  const sp = (x: number) => `${x >= 0 ? '+' : ''}${(x * 100).toFixed(1)}%`;

  if (!o.spot) return <p className="hint hint-warn">{t('ol.noSpot')}</p>;

  const rows: JSX.Element[] = [];
  let spotShown = false;
  const spotRow = (
    <tr key="spot" className="olspot">
      <td colSpan={5}>{t('ol.spotRow', f(o.spot))}</td>
    </tr>
  );
  for (const [i, l] of o.levels.entries()) {
    if (!spotShown && l.price <= o.spot) {
      rows.push(spotRow);
      spotShown = true;
    }
    rows.push(
      <tr key={i}>
        <td className="num">{f(l.price)}</td>
        <td>
          {t(`ol.kind.${l.kind}`)}
          {l.touches !== undefined && (
            <span className="olsub">{t('ol.touches', [l.touches, l.lastTouch ?? '—'])}</span>
          )}
          {l.confluence > 0 && <span className="olconf">{t('ol.confluence', l.confluence)}</span>}
        </td>
        <td className="num">{sp(l.dist)}</td>
        <td className="num">{pc(l.pEnd)}</td>
        <td className="num">{pc(l.pTouch)}</td>
      </tr>
    );
  }
  if (!spotShown) rows.push(spotRow);

  return (
    <div className="olmap">
      {o.vol ? (
        <>
          {o.volSource === 'implied' && (
            <p className="cap">{t('ol.volImplied', `${(o.vol * 100).toFixed(1)}%`)}</p>
          )}
          {o.volSource === 'realized' && (
            <p className="hint hint-warn">{t('ol.volRealized', `${(o.vol * 100).toFixed(1)}%`)}</p>
          )}
          <ul className="olbands">
            {o.bands.map((b) => (
              <li key={b.days}>
                <b>{t('ol.days', b.days)}</b>{' '}
                {t('ol.band1', [f(b.low1), f(b.high1), `±${(b.sigma * 100).toFixed(1)}%`])}{' '}
                <span className="olsub">{t('ol.band2', [f(b.low2), f(b.high2)])}</span>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="hint hint-warn">{t('ol.noVol')}</p>
      )}

      {o.earningsInWindow && (
        <p className="hint hint-warn">{t('ol.earnings', [o.earningsInWindow, PROB_DAYS])}</p>
      )}

      <div className="tablewrap">
        <table className="oltable">
          <thead>
            <tr>
              <th>{t('ol.col.price')}</th>
              <th>{t('ol.col.level')}</th>
              <th className="num">{t('ol.col.dist')}</th>
              <th className="num">{t('ol.col.close', PROB_DAYS)}</th>
              <th className="num">{t('ol.col.touch', PROB_DAYS)}</th>
            </tr>
          </thead>
          <tbody>{rows}</tbody>
        </table>
      </div>

      <p className="cap">{t('ol.probNote')}</p>
      {o.missing.includes('gex') && <p className="cap">{t('ol.missGex')}</p>}
      {o.gexSource === 'cache' && <p className="hint hint-warn">{t('ol.gexStale')}</p>}
      {o.missing.includes('zones') && <p className="cap">{t('ol.missZones')}</p>}
    </div>
  );
}
