'use client';

import { Fragment, useCallback, useEffect, useState } from 'react';
import { useLang } from '@/lib/i18n';

type Trade = {
  key: string;
  politicianId: string;
  name: string;
  chamber: string | null;
  issuer: string | null;
  txnType: string;
  /** Chuỗi khoảng tiền nguyên văn kiểu STOCK Act - KHÔNG phải số chính
   *  xác, luật chỉ cho khai khoảng. */
  amounts: string | null;
  transactionDate: string;
  filedAtDate: string | null;
  notes: string | null;
  /** Đường dẫn ảnh chân dung, hoặc null khi mã định danh không đúng dạng
   *  Bioguide. Tính ở /api/congress để phép kiểm dạng chỉ nằm một chỗ. */
  photo: string | null;
  /** Số ngày từ giao dịch tới công bố. null = không có ngày công bố. */
  lagDays: number | null;
};

type Row = {
  symbol: string;
  trades: Trade[];
  traderCount: number;
  lastTradeDate: string | null;
  buys: number;
  sells: number;
  others: number;
  medianLagDays: number | null;
};

type Payload = {
  configured: boolean;
  rows: Row[];
  lookbackDays: number;
  lastRun: {
    at: number;
    pagesRead: number;
    seen: number;
    saved: number;
    error: string | null;
  } | null;
  syncing: boolean;
  trackedCount: number;
  holdingsError: string | null;
  sp500Error: string | null;
};

/** house/senate -> chữ hiển thị. Giữ nguyên chuỗi gốc nếu UW đổi giá trị,
 *  đừng biến mất chỉ vì gặp giá trị lạ. */
function chamber(t: (k: string) => string, raw: string | null): string {
  if (raw === 'house') return t('cg.house');
  if (raw === 'senate') return t('cg.senate');
  return raw ?? '';
}

/**
 * Mua / bán / không rõ.
 *
 * `other` là một phía THẬT. Cùng bài học với `flowSide()` (#125): lúc chỉ in
 * một chữ ra màn hình thì một giá trị lạ hiện thành "mua" chỉ là lỗi trang
 * trí; từ khi ĐẾM theo phía để vẽ thanh thì nó thành một con số sai trông y
 * như số đúng. Phép phân loại này phải khớp với `tradeSide()` trong
 * congress.ts - server đếm, màn hình tô màu, hai bên phải nói cùng một thứ.
 */
function sideOf(txnType: string): 'buy' | 'sell' | 'other' {
  const s = String(txnType ?? '').trim().toLowerCase();
  if (!s) return 'other';
  if (s.startsWith('purchase') || s.startsWith('buy')) return 'buy';
  if (s.startsWith('sale') || s.startsWith('sell')) return 'sell';
  return 'other';
}

/** Chữ cái đầu của tên, cho ô ảnh khi không có ảnh. */
function initials(name: string): string {
  const parts = String(name ?? '')
    .replace(/,/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return '?';
  return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase();
}

/**
 * Ảnh chân dung nghị sĩ, với ô chữ cái đầu làm nền lót.
 *
 * Hai lý do phải có nền lót chứ không chỉ là một thẻ `<img>`: mã định danh có
 * thể không đúng dạng Bioguide (lúc đó `photo` đã là null từ server), và ảnh
 * có thể 404 dù mã đúng dạng (nghị sĩ mới, kho ảnh chưa cập nhật). Cả hai
 * trường hợp đều phải ra một ô tròn có chữ, không bao giờ là một ảnh vỡ -
 * ảnh vỡ đọc như app hỏng chứ không đọc như "chưa có ảnh".
 */
function Face({ trade, size }: { trade: Trade; size: 'sm' | 'md' }) {
  const [failed, setFailed] = useState(false);
  const cls = `cgface cgface-${size}`;
  if (!trade.photo || failed) {
    return (
      <span className={`${cls} cgface-initials`} title={trade.name} aria-hidden>
        {initials(trade.name)}
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className={cls}
      src={trade.photo}
      alt={trade.name}
      title={trade.name}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}

/** Một khuôn mặt cho mỗi nghị sĩ khác nhau, giữ đúng thứ tự đã sắp (mới
 *  nhất trước). Trùng người thì chỉ lấy lần đầu - bảng đếm NGƯỜI, không
 *  đếm lượt. */
function distinctTraders(trades: Trade[]): Trade[] {
  const seen = new Set<string>();
  const out: Trade[] = [];
  for (const t of trades) {
    const id = t.politicianId || t.name;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(t);
  }
  return out;
}

/** Trung vị, không phải trung bình: một bản ghi trễ ba năm kéo lệch trung
 *  bình, còn trung vị vẫn nói đúng "thường thì trễ bao lâu". */
function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

const FACE_LIMIT = 4;

export default function CongressPanel() {
  const { t } = useLang();
  /**
   * Ai đứng tên tài khoản, dịch khi biết, giữ NGUYÊN chữ của UW khi không.
   *
   * `t()` trả về chính cái khoá nếu thiếu bản dịch (cố ý, để lỗi thiếu chữ lộ
   * ra khi đang viết code) - nhưng danh sách này là của UW và họ thêm giá trị
   * mới không báo, nên để nguyên thì màn hình in ra "cg.issuer.trust", đọc
   * như app hỏng. In chữ thật của UW thì vừa không giả vờ hiểu, vừa cho biết
   * chính xác phải thêm khoá nào. Cùng khuôn với `ruleLabel()` ở Options Flow.
   */
  const issuerLabel = (issuer: string | null) => {
    const raw = String(issuer ?? '').trim();
    if (!raw) return t('cg.issuer.self');
    const key = `cg.issuer.${raw.toLowerCase()}`;
    const got = t(key);
    return got === key ? raw : got;
  };
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/congress');
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

  useEffect(() => {
    if (!data?.syncing) return;
    const id = setInterval(() => void load(), 3000);
    return () => clearInterval(id);
  }, [data?.syncing, load]);

  const sync = useCallback(async () => {
    setError(null);
    try {
      const r = await fetch('/api/congress', { method: 'POST' });
      const j = await r.json();
      if (j.error) setError(String(j.error));
    } catch (e: any) {
      setError(String(e?.message ?? e));
    }
    await load();
  }, [load]);

  // Tính năng trả phí, tự tắt khi thiếu UW_API_KEY - giống hệt Telegram/
  // web push: không có biến môi trường thì coi như tính năng không tồn
  // tại, không phải lỗi để người dùng lo lắng.
  if (data !== null && !data.configured) {
    return (
      <section className="panel">
        <div className="panel-head">{t('cg.title')}</div>
        <div className="panel-body">
          <p className="cap">{t('cg.notConfigured')}</p>
        </div>
      </section>
    );
  }

  const nothingTracked = data !== null && data.trackedCount === 0;

  /* Độ trễ ĐO THẬT trên chính dữ liệu đang hiện, không phải con số 30-45
     ngày của luật. Đây là điểm khác biệt quan trọng nhất của tab này: luật
     nói trần, thực tế thường gấp ba lần trần. */
  const allLags = (data?.rows ?? [])
    .flatMap((r) => r.trades)
    .map((tr) => tr.lagDays)
    .filter((d): d is number => d !== null);
  const overallLag = median(allLags);

  /* Thang chung cho mọi thanh: dài ngắn giữa các dòng mới so sánh được với
     nhau. Mỗi dòng tự co giãn theo chính nó thì mã có 2 lệnh và mã có 40
     lệnh vẽ ra hai thanh dài bằng nhau - đúng kiểu biểu đồ nói dối. */
  const maxTrades = Math.max(1, ...(data?.rows ?? []).map((r) => r.trades.length));

  return (
    <section className="panel">
      <div className="panel-head">{t('cg.title')}</div>
      <div className="panel-body">
        <p className="cap">{t('cg.intro')}</p>

        <p className="cap">
          {data?.lastRun ? t('cg.lastRun', data.lastRun.at) : t('cg.neverRun')}{' '}
          {/* Chỉ hiện nút khi ĐÃ BIẾT chắc data.configured === true - lúc
              data còn null (đang tải lần đầu), !data.configured phía dưới
              chưa kịp chặn vì nó đòi data !== null, nên nút sẽ lộ ra một
              nhịp trước khi biết có cấu hình UW_API_KEY hay không. */}
          {data?.configured === true && (
            <button onClick={sync} disabled={!!data?.syncing}>
              {data?.syncing ? t('cg.syncing') : t('cg.syncNow')}
            </button>
          )}
        </p>

        {error && <p className="cap warnline">{error}</p>}
        {data?.holdingsError && (
          <p className="cap warnline">
            {t('cg.holdingsError')} <code>{data.holdingsError}</code>
          </p>
        )}
        {data?.lastRun?.error && (
          <p className="cap warnline">{data.lastRun.error}</p>
        )}
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
      ) : data && data.rows.length === 0 ? (
        <div className="panel-body">
          <div className="empty">
            <strong>{t('cg.none')}</strong>
            <p className="cap">{t('cg.noneNote')}</p>
          </div>
        </div>
      ) : (
        <>
          {/* Độ trễ đứng TRƯỚC bảng, không phải một dòng chú thích cuối trang.
              Nó quyết định cách đọc mọi con số bên dưới: đây là hồ sơ lịch sử
              chứ không phải tín hiệu hôm nay. */}
          <div className="panel-body cglag">
            <div className="cglagbig">
              <span className="cglaglabel">{t('cg.lagHead')}</span>
              <b className={overallLag === null ? '' : 'warnline'}>
                {overallLag === null ? '—' : t('cg.lagMedian', overallLag)}
              </b>
            </div>
            <p className="cap" style={{ margin: 0 }}>
              {overallLag === null ? t('cg.lagUnknown') : t('cg.lagNote')}
            </p>
          </div>

          <div className="panel-body cgkey">
            <span>
              <i className="cgswatch cgswatch-buy" /> {t('cg.keyBuy')}
            </span>
            <span>
              <i className="cgswatch cgswatch-sell" /> {t('cg.keySell')}
            </span>
            {/* Giới hạn phải nói ra, không phải giấu đi - cùng lý do với
                of.keyCaveat: một hàng toàn đỏ rất dễ đọc thành "nghị sĩ biết
                tin xấu", trong khi phần lớn lệnh bán không nói lên điều đó. */}
            <span className="hint hint-warn">{t('cg.keyCaveat')}</span>
            <span>{t('cg.lookback', data?.lookbackDays ?? 90)}</span>
          </div>

          <div className="tablewrap">
            <table className="pftable cgtable">
              <thead>
                <tr>
                  <th>{t('ins.colSymbol')}</th>
                  <th>{t('cg.colWho')}</th>
                  <th className="num">{t('cg.colTraders')}</th>
                  <th>{t('cg.colSide')}</th>
                  <th className="num">{t('cg.colCount')}</th>
                  <th className="num">{t('cg.colLag')}</th>
                  <th>{t('cg.colLast')}</th>
                </tr>
              </thead>
              <tbody>
                {data!.rows.map((r) => {
                  const open = expanded === r.symbol;
                  const faces = distinctTraders(r.trades);
                  const known = r.buys + r.sells;
                  const buyPct = known > 0 ? (r.buys / known) * 100 : 0;
                  const width = (r.trades.length / maxTrades) * 100;
                  return (
                    <Fragment key={r.symbol}>
                      <tr
                        className="ins-row"
                        onClick={() => setExpanded(open ? null : r.symbol)}
                        aria-expanded={open}
                      >
                        <td>
                          <b>{r.symbol}</b>
                        </td>
                        {/* Khuôn mặt nằm NGAY trên hàng, không phải giấu sau
                            một cú bấm: câu hỏi đầu tiên của tab này là "ai",
                            và một cái tên chữ nhỏ không trả lời nhanh bằng
                            một khuôn mặt. */}
                        <td>
                          <div className="cgfaces">
                            {faces.slice(0, FACE_LIMIT).map((tr) => (
                              <Face key={tr.key} trade={tr} size="sm" />
                            ))}
                            {faces.length > FACE_LIMIT && (
                              <span className="cgface cgface-sm cgface-more">
                                +{faces.length - FACE_LIMIT}
                              </span>
                            )}
                            <span className="cgnames">
                              {faces
                                .slice(0, 2)
                                .map((tr) => tr.name)
                                .join(', ')}
                              {faces.length > 2 ? '…' : ''}
                            </span>
                          </div>
                        </td>
                        <td className="num">{r.traderCount}</td>
                        <td>
                          <div
                            className="cgbar"
                            style={{ width: `${Math.max(width, 8)}%` }}
                            title={`${t('cg.keyBuy')} ${r.buys} · ${t('cg.keySell')} ${r.sells}`}
                          >
                            <i className="cgbar-buy" style={{ width: `${buyPct}%` }} />
                            <i className="cgbar-sell" style={{ width: `${100 - buyPct}%` }} />
                          </div>
                          <span className="cgsplit">
                            {known > 0 ? t('cg.sideSplit', Math.round(buyPct)) : t('cg.sideNone')}
                            {/* Khác 0 = UW gửi kiểu giao dịch lạ. Nói ra, đừng
                                cộng lén vào "mua" rồi vẽ một cái thanh sai
                                trông như đúng. */}
                            {r.others > 0 && (
                              <span className="hint hint-warn"> {t('cg.otherSide', r.others)}</span>
                            )}
                          </span>
                        </td>
                        <td className="num">{r.trades.length}</td>
                        {/* Trễ bao lâu là thứ quyết định dòng này còn dùng được
                            hay không, nên nó là một CỘT chứ không phải chi
                            tiết bên trong. Không tính được thì in "—", không
                            in số 0 - số 0 đọc thành "công bố ngay trong ngày". */}
                        <td className="num">
                          {r.medianLagDays === null ? '—' : r.medianLagDays}
                        </td>
                        <td>{r.lastTradeDate}</td>
                      </tr>
                      {open && (
                        <tr className="ins-expand-row">
                          <td colSpan={7}>
                            <table className="cgdetail">
                              <thead>
                                <tr>
                                  <th>{t('cg.dWho')}</th>
                                  <th>{t('cg.dAccount')}</th>
                                  <th>{t('cg.dSide')}</th>
                                  <th title={t('cg.amountWhat')}>{t('cg.dAmount')}</th>
                                  <th>{t('cg.dTraded')}</th>
                                  <th>{t('cg.dFiled')}</th>
                                  <th className="num">{t('cg.dLag')}</th>
                                  <th>{t('cg.dNotes')}</th>
                                </tr>
                              </thead>
                              <tbody>
                                {r.trades.map((tr) => {
                                  const side = sideOf(tr.txnType);
                                  return (
                                    <tr key={tr.key}>
                                      <td>
                                        <div className="cgwho">
                                          <Face trade={tr} size="md" />
                                          <span>
                                            <b>{tr.name}</b>
                                            <span className="cgsub">
                                              {chamber(t, tr.chamber)}
                                            </span>
                                          </span>
                                        </div>
                                      </td>
                                      <td>{issuerLabel(tr.issuer)}</td>
                                      <td>
                                        <b className={`cgside cgside-${side}`}>
                                          {side === 'buy'
                                            ? t('cg.buy')
                                            : side === 'sell'
                                              ? t('cg.sell')
                                              : tr.txnType || '?'}
                                        </b>
                                      </td>
                                      {/* Nguyên văn khoảng tiền được khai. Luật
                                          chỉ cho khai khoảng, nên app KHÔNG quy
                                          nó ra một con số - một con số ở đây sẽ
                                          là con số app tự bịa. */}
                                      <td title={t('cg.amountWhat')}>{tr.amounts ?? '—'}</td>
                                      <td>{tr.transactionDate}</td>
                                      <td>{tr.filedAtDate ?? '—'}</td>
                                      <td className="num">
                                        {tr.lagDays === null ? '—' : t('cg.days', tr.lagDays)}
                                      </td>
                                      <td className="cgnotes">{tr.notes ?? ''}</td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                            <p className="cap cgphotonote">{t('cg.photoSource')}</p>
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
    </section>
  );
}
