'use client';

import { useCallback, useEffect, useState } from 'react';
import { useLang } from '@/lib/i18n';

type Row = {
  id: string;
  kind: 'put' | 'stock';
  symbol: string;
  openedAt?: string;
  strike?: number;
  expiration?: string;
  contracts?: number;
  credit?: number;
  shares?: number;
  cost?: number;
  spot: number | null;
  changePct: number | null;
  /* put */
  mark?: number | null;
  delta?: number | null;
  creditTotal?: number;
  buyback?: number | null;
  pl: number | null;
  captured?: number | null;
  collateral?: number;
  dte?: number;
  daysHeld?: number | null;
  rocAnnual?: number | null;
  rocRemaining?: number | null;
  cushion?: number | null;
  itm?: boolean | null;
  nextEarnings?: string | null;
  /** Lời/lỗ hôm nay, Schwab tự tính - cột "P/L Day" trên app của họ. */
  dayPl?: number;
  /* stock */
  value?: number | null;
  costTotal?: number;
  plPct?: number | null;
  /** Chỉ có khi Schwab không trả về marketValue - xem lib/positions.ts. */
  rawKeys?: string[];
  /** Mọi trường số Schwab trả về cho vị thế này, luôn có mặt - xem lib/positions.ts. */
  raw?: Record<string, number>;
};

type Summary = {
  putCount: number;
  stockCount: number;
  collateral: number;
  creditTotal: number;
  openPl: number;
  stockValue: number;
  itmCount: number;
  earningsCount: number;
  nearestDte: number | null;
  dayPl: number | null;
  quoteError: string | null;
};

type Skipped = { symbol: string; reason: string };

type Cash = {
  cash: number | null;
  buyingPower: number | null;
  accountValue: number | null;
};

type Realized = {
  year: number;
  /** Ngày xuất báo cáo Schwab (YYYY-MM-DD) - hiện lên để con số không lặng
   *  lẽ cũ đi mà trông vẫn như mới. */
  asOf: string;
  total: number;
  bySymbol: Record<string, number>;
  accounts: { name: string; total: number; lots: number }[];
  lots: number;
};

const usd = (n: number | null | undefined, d = 2) =>
  n === null || n === undefined
    ? '—'
    : n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: d });
const pct = (n: number | null | undefined, d = 1) =>
  n === null || n === undefined ? '—' : `${(n * 100).toFixed(d)}%`;
const signed = (n: number | null | undefined) =>
  n === null || n === undefined ? '—' : `${n >= 0 ? '+' : ''}${usd(n, 0)}`;
/** Xanh nếu số ≥ 0, đỏ nếu âm - áp cho mọi ô tiền/% trong bảng, không riêng
 *  các cột lời/lỗ. null/undefined thì không tô màu, không có số để so dấu. */
const sc = (n: number | null | undefined) =>
  n === null || n === undefined ? undefined : n >= 0 ? 'good' : 'bad';

/** Nhãn cho lý do một vị thế Schwab không hiện ở đây - xem mapSchwabPositions(). */
const reasonKey = (reason: string) => {
  if (reason.startsWith('asset-type:')) return 'pf.skipAssetType';
  const known: Record<string, string> = {
    'call-option': 'pf.skipCall',
    'long-put': 'pf.skipLongPut',
    'short-stock': 'pf.skipShortStock',
    'missing-price': 'pf.skipMissingPrice',
    'unrecognized-option-symbol': 'pf.skipUnrecognized',
  };
  return known[reason] ?? 'pf.skipOther';
};

export default function PortfolioPanel() {
  const { t } = useLang();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [skipped, setSkipped] = useState<Skipped[]>([]);
  const [cash, setCash] = useState<Cash | null>(null);
  const [realized, setRealized] = useState<Realized | null>(null);
  const [realizedError, setRealizedError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showSkipped, setShowSkipped] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/positions');
      const j = await r.json();
      if (!r.ok) throw new Error(j.reason ?? j.error ?? t('pf.loadFailed'));
      setRows(j.rows ?? []);
      setSummary(j.summary ?? null);
      setSkipped(j.skipped ?? []);
      setCash(j.cash ?? null);
      setError(null);
    } catch (e: any) {
      setError(e.message);
      setRows([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
    // Định giá lại mỗi phút, cùng nhịp với thanh chỉ số.
    const timer = setInterval(load, 60_000);
    return () => clearInterval(timer);
  }, [load]);

  // Lời/lỗ đã chốt chỉ tải một lần: phải đọc mấy năm lịch sử giao dịch, đắt
  // hơn hẳn bảng vị thế, và con số đó không đổi trong lúc đang xem.
  useEffect(() => {
    let alive = true;
    // Lỗi ở đây KHÔNG được nuốt: nếu không nói ra thì phần "đã chốt" chỉ đơn
    // giản là không xuất hiện, không một dấu vết nào cho biết vì sao - đúng
    // cái bẫy đã mất mấy vòng mới thoát ra ở phần giá vốn.
    fetch('/api/realized')
      .then(async (r) => {
        const j = await r.json().catch(() => null);
        if (!alive) return;
        if (r.ok && j && typeof j.total === 'number') {
          setRealized(j);
          setRealizedError(null);
          return;
        }
        setRealizedError(
          j?.detail ?? j?.reason ?? j?.error ?? `HTTP ${r.status}`
        );
      })
      .catch((e) => {
        if (alive) setRealizedError(String(e?.message ?? e));
      });
    return () => {
      alive = false;
    };
  }, []);

  const puts = (rows ?? []).filter((r) => r.kind === 'put');
  const stocks = (rows ?? []).filter((r) => r.kind === 'stock');
  // marketValue không đọc được thì "Giá trị" dùng giá thị trường sống thay
  // vì con số Schwab tự tính - lời/lỗ vẫn tự tính từ cost (averageLongPrice)
  // như bình thường, không bị ảnh hưởng. Vẫn nói ra để không lặng lẽ đoán.
  const stockFallback = stocks.find((r) => r.rawKeys);

  const errBody =
    error === 'SCHWAB_SESSION_EXPIRED'
      ? t('pf.errExpired')
      : error === 'NO_TRADER_ACCESS'
        ? t('pf.errNoAccess')
        : error
          ? t('pf.loadFailed')
          : null;

  return (
    <section className="panel">
      <div className="panel-head">{t('pf.title')}</div>
      <div className="panel-body">
        {errBody && (
          <>
            <p className="cap warnline">{errBody}</p>
            {error === 'SCHWAB_SESSION_EXPIRED' && (
              <a className="popaction" href="/api/auth/login">
                {t('settings.reconnect')}
              </a>
            )}
          </>
        )}
        {summary?.quoteError && <p className="cap warnline">{t('pf.quoteError')}</p>}
        {stockFallback && (
          <p className="cap warnline">
            {t('pf.stockFallback')}{' '}
            <code>{stockFallback.rawKeys?.join(', ')}</code>
          </p>
        )}
        {realizedError && (
          <p className="cap warnline">
            {t('pf.realizedFailed')} <code>{realizedError}</code>
          </p>
        )}


        {/* Tiền mặt của tài khoản - hiện độc lập với việc có vị thế nào hay
            không, vì đó chính là câu hỏi của người còn 100% tiền mặt. Từng ô
            chỉ hiện khi Schwab thật sự trả về đúng trường đó (xem
            mapCashBalances), nên thiếu một ô không có nghĩa là tài khoản
            trống - có thể chỉ là trường đó không đọc được. */}
        {!errBody && cash && (cash.cash !== null || cash.buyingPower !== null || cash.accountValue !== null) && (
          <>
            <h3 className="dsec">{t('pf.cashHead')}</h3>
            <dl className="stats">
              {cash.accountValue !== null && (
                <div>
                  <dt>{t('pf.accountValue')}</dt>
                  <dd className={sc(cash.accountValue)}>{usd(cash.accountValue, 0)}</dd>
                </div>
              )}
              {cash.cash !== null && (
                <div>
                  <dt>{t('pf.cash')}</dt>
                  <dd className={sc(cash.cash)}>{usd(cash.cash, 0)}</dd>
                </div>
              )}
              {cash.buyingPower !== null && (
                <div>
                  <dt>{t('pf.buyingPower')}</dt>
                  <dd className={sc(cash.buyingPower)}>{usd(cash.buyingPower, 0)}</dd>
                </div>
              )}
            </dl>
          </>
        )}

        {summary && (rows?.length ?? 0) > 0 && (
          <dl className="stats">
            {/* Cả năm đứng đầu: đó là câu hỏi lớn nhất, và hai ô ngay sau nó
                là hai nửa cộng thành nó. Giữ ba ô này liền nhau và đúng thứ
                tự tổng-rồi-mới-tới-phần thì đọc một lượt là hiểu phép cộng,
                không phải đi tìm.

                Vẫn tách "đã chốt" và "đang mở" thành hai ô riêng chứ không
                gộp: khoản đã chốt là tiền thật đã vào tài khoản, khoản đang
                mở còn có thể bốc hơi - gộp lại thành một số làm mất đúng cái
                khác biệt đó. */}
            {realized && (
              <>
                <div>
                  <dt>{t('pf.yearPl', realized.year)}</dt>
                  <dd className={realized.total + summary.openPl >= 0 ? 'good' : 'bad'}>
                    {signed(realized.total + summary.openPl)}
                  </dd>
                </div>
                <div>
                  <dt>{t('pf.realized', realized.year)}</dt>
                  <dd className={realized.total >= 0 ? 'good' : 'bad'}>
                    {signed(realized.total)}
                  </dd>
                </div>
              </>
            )}
            <div>
              <dt>{t('pf.openPl')}</dt>
              <dd className={summary.openPl >= 0 ? 'good' : 'bad'}>{signed(summary.openPl)}</dd>
            </div>
            {summary.dayPl !== null && (
              <div>
                <dt>{t('pf.dayPl')}</dt>
                <dd className={summary.dayPl >= 0 ? 'good' : 'bad'}>{signed(summary.dayPl)}</dd>
              </div>
            )}
            <div>
              <dt>{t('pf.collateral')}</dt>
              <dd className={sc(summary.collateral)}>{usd(summary.collateral, 0)}</dd>
            </div>
            <div>
              <dt>{t('pf.creditTotal')}</dt>
              <dd className={sc(summary.creditTotal)}>{usd(summary.creditTotal, 0)}</dd>
            </div>
            <div>
              <dt>{t('pf.stockValue')}</dt>
              <dd className={sc(summary.stockValue)}>{usd(summary.stockValue, 0)}</dd>
            </div>
            <div>
              <dt>{t('pf.nearestDte')}</dt>
              <dd>{summary.nearestDte === null ? '—' : t('pf.days', summary.nearestDte)}</dd>
            </div>
            <div>
              <dt>{t('pf.attention')}</dt>
              <dd className={summary.itmCount || summary.earningsCount ? 'warn' : undefined}>
                {t('pf.attentionValue', {
                  itm: summary.itmCount,
                  earnings: summary.earningsCount,
                })}
              </dd>
            </div>
          </dl>
        )}

        {rows === null && !errBody ? (
          <p className="cap">{t('pf.loading')}</p>
        ) : rows !== null && rows.length === 0 && !errBody ? (
          <div className="empty">
            <strong>{t('pf.emptyTitle')}</strong>
            {t('pf.emptyBody')}
          </div>
        ) : null}

        {puts.length > 0 && (
          <>
            <h3 className="dsec">{t('pf.puts')}</h3>
            <div className="tablewrap">
              <table className="ratings pftable">
                <thead>
                  <tr>
                    <th>{t('pf.colSymbol')}</th>
                    <th>{t('pf.colStrike')}</th>
                    <th>{t('pf.colExp')}</th>
                    <th>{t('pf.colCredit')}</th>
                    <th>{t('pf.colNow')}</th>
                    <th>{t('pf.colPl')}</th>
                    <th>{t('pf.colCaptured')}</th>
                    <th>{t('pf.colCushion')}</th>
                    <th>{t('pf.colRoc')}</th>
                  </tr>
                </thead>
                <tbody>
                  {puts.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <b>{r.symbol}</b>
                        <span className="pfsub">
                          {usd(r.spot)}
                          {r.nextEarnings ? ` · ⚠ ${t('pf.earnings', r.nextEarnings)}` : ''}
                        </span>
                      </td>
                      <td className={sc(r.strike)}>{usd(r.strike, 0)}</td>
                      <td>
                        {r.expiration}
                        <span className="pfsub">{t('pf.days', r.dte ?? 0)}</span>
                      </td>
                      <td className={sc(r.credit)}>
                        {usd(r.credit)}
                        <span className="pfsub">×{r.contracts}</span>
                      </td>
                      <td className={sc(r.mark)}>{usd(r.mark)}</td>
                      <td className={(r.pl ?? 0) >= 0 ? 'good' : 'bad'}>{signed(r.pl)}</td>
                      <td className={sc(r.captured)}>{pct(r.captured, 0)}</td>
                      {/* Khoảng cách từ giá hiện tại xuống strike. Âm là đã vào
                          trong tiền, tức là đang đứng trước khả năng bị assign -
                          ưu tiên hơn màu theo dấu thường, vì đây là cảnh báo rủi
                          ro chứ không chỉ là số dương/âm đơn thuần. */}
                      <td className={r.itm ? 'bad' : (r.cushion ?? 1) < 0.03 ? 'warn' : sc(r.cushion)}>
                        {pct(r.cushion, 1)}
                      </td>
                      {/* Con số chính là phần credit còn lại quy năm - thứ
                          quyết định giữ tiếp hay đóng sớm. */}
                      <td className={sc(r.rocRemaining)}>{pct(r.rocRemaining, 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {stocks.length > 0 && (
          <>
            <h3 className="dsec">{t('pf.shares')}</h3>
            <div className="tablewrap">
              <table className="ratings pftable">
                <thead>
                  <tr>
                    <th>{t('pf.colSymbol')}</th>
                    <th>{t('pf.colShares')}</th>
                    <th>{t('pf.colCost')}</th>
                    <th>{t('pf.colNow')}</th>
                    <th>{t('pf.colValue')}</th>
                    <th>{t('pf.colDayPl')}</th>
                    <th>{t('pf.colPl')}</th>
                  </tr>
                </thead>
                <tbody>
                  {stocks.map((r) => (
                    <tr key={r.id}>
                      <td><b>{r.symbol}</b></td>
                      <td>{r.shares}</td>
                      <td className={sc(r.cost)}>{usd(r.cost)}</td>
                      <td className={sc(r.spot)}>{usd(r.spot)}</td>
                      <td className={sc(r.value)}>{usd(r.value, 0)}</td>
                      <td className={r.dayPl === undefined ? undefined : r.dayPl >= 0 ? 'good' : 'bad'}>
                        {signed(r.dayPl)}
                      </td>
                      <td className={(r.pl ?? 0) >= 0 ? 'good' : 'bad'}>
                        {signed(r.pl)}
                        <span className="pfsub">{pct(r.plPct, 1)}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {realized && Object.keys(realized.bySymbol).length > 0 && (
          <details className="rrgtable">
            <summary>{t('pf.realizedToggle', realized.year)}</summary>
            <p className="cap">{t('pf.realizedAsOf', realized.asOf)}</p>
            <ul className="pfskipped">
              {Object.entries(realized.bySymbol)
                .sort((a, b) => b[1] - a[1])
                .map(([sym, pl]) => (
                  <li key={`realized-${sym}`}>
                    <b>{sym}</b> — <span className={pl >= 0 ? 'good' : 'bad'}>{signed(pl)}</span>
                  </li>
                ))}
              {/* Cộng lại ngay dưới danh sách, để không phải tự nhẩm hay cuộn
                  ngược lên ô tổng ở đầu trang. */}
              {realized.accounts.map((a) => (
                <li key={`acct-${a.name}`} className="pfacct">
                  {a.name} —{' '}
                  <span className={a.total >= 0 ? 'good' : 'bad'}>{signed(a.total)}</span>
                </li>
              ))}
              <li className="pftotal">
                <b>{t('pf.realizedTotal')}</b> —{' '}
                <span className={realized.total >= 0 ? 'good' : 'bad'}>
                  {signed(realized.total)}
                </span>
              </li>
            </ul>
          </details>
        )}

        {stocks.some((r) => r.raw) && (
          <details className="rrgtable">
            <summary>{t('pf.rawToggle')}</summary>
            <ul className="pfskipped">
              {stocks
                .filter((r) => r.raw)
                .map((r) => (
                  <li key={`${r.id}-raw`}>
                    <b>{r.symbol}</b>:{' '}
                    <code>
                      {Object.entries(r.raw!)
                        .map(([k, v]) => `${k}=${v}`)
                        .join(', ')}
                    </code>
                  </li>
                ))}
            </ul>
          </details>
        )}

        {skipped.length > 0 && (
          <details className="rrgtable" open={showSkipped} onToggle={(e) => setShowSkipped(e.currentTarget.open)}>
            <summary>{t('pf.skippedToggle', skipped.length)}</summary>
            <ul className="pfskipped">
              {skipped.map((s, i) => (
                <li key={`${s.symbol}-${i}`}>
                  <b>{s.symbol}</b> — {t(reasonKey(s.reason))}
                </li>
              ))}
            </ul>
          </details>
        )}

        <p className="cap">{t('pf.note')}</p>
      </div>
    </section>
  );
}
