'use client';

import { useLang } from '@/lib/i18n';
import { summarizeDarkpool, summarizeFlow, FLOW_DAYS, type UwContext } from '@/lib/uwsummary';

/**
 * Khối "Unusual Whales" trong phần Claude của tab Analyze: đúng những con số
 * UW mà Claude sẽ đọc, tóm tắt bằng CÙNG hàm prompt dùng (`uwsummary.ts`).
 *
 * Bốn trạng thái không được trông như nhau: đang tải / chưa cấu hình khoá /
 * một nửa hỏng (in nguyên văn lời UW) / trả lời mà thật sự bằng không.
 */
export default function UwContextCard({ uw, loading }: { uw: UwContext | null; loading: boolean }) {
  const { t } = useLang();
  if (loading && !uw) return <p className="cap">{t('uw.loading')}</p>;
  if (!uw) return null;
  if (!uw.configured) return <p className="cap">{t('uw.off')}</p>;

  const money = (x: number) =>
    x >= 1e9 ? `$${(x / 1e9).toFixed(2)}B` : x >= 1e6 ? `$${(x / 1e6).toFixed(2)}M` : `$${Math.round(x / 1e3)}K`;
  const f = uw.flow.error ? null : summarizeFlow(uw.flow.data);
  const d = uw.darkpool.error ? null : summarizeDarkpool(uw.darkpool.data);
  const c = uw.congress.error ? null : uw.congress.data;

  const head = [
    f ? t('uw.hFlow', f.alerts) : t('uw.hFlowErr'),
    d ? t('uw.hDp', d.prints) : t('uw.hDpErr'),
    uw.congress.error ? t('uw.hCgErr') : t('uw.hCg', c?.trades.length ?? 0),
  ].join(' · ');

  return (
    <details className="uwctx">
      <summary>
        <b>Unusual Whales</b> · {head}
      </summary>

      <h4>{t('uw.flowTitle', FLOW_DAYS)}</h4>
      {uw.flow.error ? (
        <p className="hint hint-warn uwerr">{t('uw.err', uw.flow.error)}</p>
      ) : f && f.alerts ? (
        <>
          <p>
            {t('uw.flowPrem', [money(f.callPremium), money(f.putPremium)])}
          </p>
          <p>
            {t('uw.flowSides', [money(f.callAsk), money(f.callBid), money(f.putAsk), money(f.putBid)])}
          </p>
          <p>{t('uw.flowFlags', [f.sweeps, f.newPositions, f.multileg])}</p>
          {f.strikes.length > 0 && (
            <p>
              {t('uw.flowStrikes')}{' '}
              {f.strikes.map((k) => `${k.strike} (${money(k.premium)}, ${t(`uw.lean.${k.lean}`)})`).join(' · ')}
            </p>
          )}
        </>
      ) : (
        <p className="cap">{t('uw.flowNone', FLOW_DAYS)}</p>
      )}
      {uw.flow.unparsed > 0 && (
        <p className="hint hint-warn">{t('uw.unparsed', [uw.flow.unparsed, uw.flow.sampleKeys.join(', ')])}</p>
      )}

      <h4>{t('uw.dpTitle')}</h4>
      {uw.darkpool.error ? (
        <p className="hint hint-warn uwerr">{t('uw.err', uw.darkpool.error)}</p>
      ) : d && d.prints ? (
        <>
          <p>{t('uw.dpSum', [d.prints, money(d.premium)])}</p>
          <p>
            {t('uw.dpSide', [d.buyVolume.toLocaleString('en-US'), d.sellVolume.toLocaleString('en-US'), d.unsided])}
          </p>
          <p>
            {t('uw.dpLevels')}{' '}
            {d.levels.map((l) => `${l.price.toFixed(2)} (${money(l.premium)})`).join(' · ')}
          </p>
        </>
      ) : (
        <p className="cap">{t('uw.dpNone')}</p>
      )}

      <h4>{t('uw.cgTitle')}</h4>
      {uw.congress.error ? (
        <p className="hint hint-warn uwerr">{t('uw.err', uw.congress.error)}</p>
      ) : c ? (
        <p>{t('uw.cgSum', [c.trades.length, c.traderCount, c.buys, c.sells, c.lastTradeDate ?? '—', c.medianLagDays ?? '—'])}</p>
      ) : (
        <p className="cap">{t('uw.cgNone')}</p>
      )}

      <p className="cap">{t('uw.caveat')}</p>
    </details>
  );
}
