'use client';

import { Fragment, useCallback, useEffect, useState } from 'react';
import { useLang } from '@/lib/i18n';

type Buy = {
  accessionNumber: string;
  filingDate: string;
  ownerName: string;
  title: string;
  isDirector: boolean;
  isOfficer: boolean;
  isTenPercentOwner: boolean;
  shares: number;
  value: number | null;
  url: string;
};

type Row = {
  symbol: string;
  buys: Buy[];
  buyerCount: number;
  totalValue: number | null;
  clusterBuy: boolean;
  lastBuyDate: string | null;
  checkedAt: number | null;
  lastError: string | null;
  unavailable: 'never-checked' | 'no-filer' | 'fetch-failed' | null;
};

/** Máy chủ trả về mã, màn hình mới dịch — nếu không thì câu tiếng Việt
 *  cứng trong lib sẽ lọt thẳng ra giao diện tiếng Anh. */
const REASON: Record<NonNullable<Row['unavailable']>, string> = {
  'no-filer': 'ins.unavail.noFiler',
  'never-checked': 'ins.unavail.neverChecked',
  'fetch-failed': 'ins.unavail.fetchFailed',
};

type Payload = {
  rows: Row[];
  lookbackDays: number;
  clusterMinBuyers: number;
  lastRun: {
    at: number;
    checked: number;
    fetched: number;
    symbols: number;
    errors: string[];
    holdingsError: string | null;
  } | null;
  /** Đang có một lượt đồng bộ chạy trong nền hay không, ngay lúc này. */
  syncing: boolean;
  /** S&P 500 + watchlist + đang giữ, gộp lại - KHÔNG phải số mã có trong
   *  bảng. 0 nghĩa là chưa có gì để theo dõi, khác hẳn "đã hỏi, sạch thật". */
  trackedCount: number;
  holdingsError: string | null;
  /** Không đọc được data/sp500.json trên máy chủ - khác hẳn "S&P 500 sạch". */
  sp500Error: string | null;
};

const usd = (n: number) =>
  n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  });

/** "Chief Executive Officer" đọc trên điện thoại thì dài quá. */
function role(b: Buy, t: (k: string, v?: any) => string): string {
  if (b.title) return b.title;
  const parts: string[] = [];
  if (b.isOfficer) parts.push('Officer');
  if (b.isDirector) parts.push('Director');
  if (b.isTenPercentOwner) parts.push('10%');
  return parts.join(' · ');
}

export default function InsiderPanel() {
  const { t } = useLang();
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Mã đang bung ra để xem ai mua, ngay dưới dòng của nó trong bảng. */
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/insiders');
      const j = await r.json();
      if (j.error) setError(String(j.error));
      else {
        setData(j);
        setError(null);
      }
    } catch (e: any) {
      setError(String(e?.message ?? e));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * Trong lúc máy chủ đang đồng bộ nền, tự hỏi lại vài giây một lần tới
   * khi xong - không bắt người dùng phải tự bấm lại. Che cả trường hợp
   * người dùng vừa mở tab đúng lúc vòng lặp nền (mỗi 15 phút) đang chạy,
   * không riêng gì lúc bấm nút.
   */
  useEffect(() => {
    if (!data?.syncing) return;
    const id = setInterval(() => void load(), 3000);
    return () => clearInterval(id);
  }, [data?.syncing, load]);

  const sync = useCallback(async () => {
    setError(null);
    try {
      // KHÔNG chờ việc đồng bộ chạy xong ở đây - route chỉ khởi động rồi
      // trả lời ngay. Chờ ở request/response từng làm proxy Render tự
      // trả về trang lỗi của chính nó khi hỏi SEC mất quá lâu.
      //
      // KHÔNG kèm ?force=1: mã lỗi (403 chẳng hạn) không được ghi
      // `checkedAt` nên tự động bị hỏi lại ở lượt kế tiếp rồi - ép hỏi
      // lại toàn bộ ~500 mã của S&P 500 mỗi lần bấm nút là phí, kể cả
      // những mã hôm nay đã xong sạch sẽ.
      const r = await fetch('/api/insiders', { method: 'POST' });
      const j = await r.json();
      if (j.error) setError(String(j.error));
    } catch (e: any) {
      setError(String(e?.message ?? e));
    }
    await load();
  }, [load]);

  const withBuys = data?.rows.filter((r) => r.buys.length > 0) ?? [];
  // Mã không có dữ liệu tách hẳn xuống dưới, KHÔNG trộn vào bảng chính:
  // "đã hỏi, không ai mua" và "chưa hỏi được" mà nằm cạnh nhau trong cùng
  // một bảng trống thì đọc y hệt nhau.
  const unknown = data?.rows.filter((r) => r.unavailable !== null) ?? [];
  // Case rõ nhất trong cả tính năng: 0 mã để theo dõi (watchlist trống,
  // Schwab chưa có gì) không được hiện giống "đã hỏi N mã, sạch thật".
  const nothingTracked = data !== null && data.trackedCount === 0;

  // Gộp theo LÝ DO thay vì liệt kê từng mã một: với rổ S&P 500 (~500 mã),
  // một lượt quét nguội hoặc một lỗi hệ thống (như 403 thiếu User-Agent)
  // có thể khiến hàng trăm mã cùng rơi vào một lý do - 400 dòng "chưa hỏi"
  // là nhiễu, không phải tín hiệu. fetch-failed lên đầu vì đó là thứ cần
  // hành động; no-filer gần như không xảy ra ở rổ S&P 500 thật (toàn công
  // ty thật, không phải ETF) nên vẫn hiện đủ tên khi có.
  const REASON_ORDER: NonNullable<Row['unavailable']>[] = [
    'fetch-failed',
    'never-checked',
    'no-filer',
  ];
  const groups = REASON_ORDER.map((code) => ({
    code,
    rows: unknown.filter((r) => r.unavailable === code),
  })).filter((g) => g.rows.length > 0);
  const SHOW_MAX = 20;

  return (
    <section className="panel">
      <div className="panel-head">{t('ins.title')}</div>
      <div className="panel-body">
        <p className="cap">{t('ins.intro')}</p>
        <p className="cap">{t('ins.clusterNote', data?.clusterMinBuyers ?? 2)}</p>

        <p className="cap">
          {data?.lastRun
            ? t('ins.lastRun', data.lastRun.at)
            : t('ins.neverRun')}{' '}
          <button onClick={sync} disabled={!!data?.syncing}>
            {data?.syncing ? t('ins.syncing') : t('ins.syncNow')}
          </button>
        </p>

        {data?.lastRun && (
          <p className="cap">
            {t('ins.syncDone', data.lastRun)}{' '}
            {t('ins.scope', data.lastRun.symbols)}
          </p>
        )}
        <p className="cap">{t('ins.sp500Note')}</p>

        {error && <p className="cap warnline">{error}</p>}
        {data?.holdingsError && (
          <p className="cap warnline">
            {t('ins.holdingsError')} <code>{data.holdingsError}</code>
          </p>
        )}
        {data?.sp500Error && (
          <p className="cap warnline">
            {t('ins.sp500Error')} <code>{data.sp500Error}</code>
          </p>
        )}
        {data?.lastRun?.errors.length ? (
          <details className="rrgtable">
            <summary>
              {t('ins.errors')} ({data.lastRun.errors.length})
            </summary>
            <ul className="pfskipped">
              {data.lastRun.errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </details>
        ) : null}
      </div>

      {data === null && !error ? (
        <div className="panel-body">
          <p className="cap">…</p>
        </div>
      ) : nothingTracked ? (
        <div className="panel-body">
          <div className="empty">
            <strong>{t('ins.noneTracked')}</strong>
            <p className="cap">{t('ins.noneTrackedNote')}</p>
          </div>
        </div>
      ) : withBuys.length === 0 ? (
        <div className="panel-body">
          <div className="empty">
            <strong>{t('ins.none')}</strong>
            <p className="cap">{t('ins.noneNote')}</p>
          </div>
        </div>
      ) : (
        <>
          <div className="panel-body" style={{ paddingBottom: 0 }}>
            <p className="cap">{t('ins.lookback', data?.lookbackDays ?? 90)}</p>
          </div>
          {/* .pftable đặt min-width 640px cho khỏi bẹp chữ, nên trên
              điện thoại nó phải tự cuộn ngang trong khung của mình -
              cả trang mà cuộn ngang theo thì hỏng. Cột mã được ghim lại
              sẵn trong globals.css. */}
          <div className="tablewrap">
          <table className="pftable">
            <thead>
              <tr>
                <th>{t('ins.colSymbol')}</th>
                <th>{t('ins.colBuyers')}</th>
                <th>{t('ins.colValue')}</th>
                <th>{t('ins.colLast')}</th>
              </tr>
            </thead>
            <tbody>
              {withBuys.map((r) => {
                const open = expanded === r.symbol;
                return (
                  <Fragment key={r.symbol}>
                    {/* Bấm vào dòng là thấy ngay ai mua + chức vụ, không
                        cần cuộn xuống tìm một khối riêng - trước đây danh
                        sách "ai mua" nằm tách hẳn ở dưới bảng, phải bấm
                        thêm một lần và tự dò đúng mã. */}
                    <tr
                      className="ins-row"
                      onClick={() => setExpanded(open ? null : r.symbol)}
                      aria-expanded={open}
                    >
                      <td>
                        <b>{r.symbol}</b>
                        {r.clusterBuy && (
                          <span className="pfsub good">{t('ins.cluster')}</span>
                        )}
                      </td>
                      <td className={r.clusterBuy ? 'good' : undefined}>
                        {r.buyerCount}
                      </td>
                      <td>
                        {r.totalValue === null ? (
                          <span className="pfsub">{t('ins.noPrice')}</span>
                        ) : (
                          usd(r.totalValue)
                        )}
                      </td>
                      <td>{r.lastBuyDate}</td>
                    </tr>
                    {open && (
                      <tr className="ins-expand-row">
                        <td colSpan={4}>
                          <p className="cap" style={{ margin: '0 0 4px' }}>
                            {r.symbol} — {t('ins.colWho')} ({r.buys.length})
                          </p>
                          <ul className="pfskipped">
                            {r.buys.map((b) => (
                              <li key={b.accessionNumber}>
                                <b>{b.ownerName}</b>
                                {/* Chức vụ ngay cạnh tên - chính là phần
                                    người dùng nói phải hiện "luôn", không
                                    ẩn thêm một lớp bấm nữa. */}
                                {role(b, t) ? ` — ${role(b, t)}` : ''} ·{' '}
                                {b.filingDate} · {t('ins.shares', b.shares)}
                                {b.value !== null
                                  ? ` · ${usd(b.value)}`
                                  : ` · ${t('ins.noPrice')}`}{' '}
                                <a
                                  href={b.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  {t('ins.viewFiling')}
                                </a>
                              </li>
                            ))}
                          </ul>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
          </div>
        </>
      )}

      {groups.length > 0 && (
        <div className="panel-body">
          <h3>{t('ins.unavailableHead')}</h3>
          <p className="cap warnline">{t('ins.unavailableNote')}</p>
          {groups.map(({ code, rows }) => {
            const shown = rows.slice(0, SHOW_MAX);
            const rest = rows.length - shown.length;
            return (
              <details key={code} className="rrgtable" open={code === 'fetch-failed'}>
                <summary>
                  {t(REASON[code])} ({rows.length})
                </summary>
                <ul className="pfskipped">
                  {shown.map((r) => (
                    <li key={`unk-${r.symbol}`}>
                      <b>{r.symbol}</b>
                      {/* Lời của chính SEC, giữ nguyên văn: "403" và "không
                          tìm thấy" là hai chuyện phải sửa bằng hai cách
                          khác nhau. */}
                      {r.lastError && <span className="pfsub">{r.lastError}</span>}
                    </li>
                  ))}
                  {rest > 0 && (
                    <li className="pfsub">{t('ins.andMore', rest)}</li>
                  )}
                </ul>
              </details>
            );
          })}
        </div>
      )}
    </section>
  );
}
