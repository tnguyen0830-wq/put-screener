'use client';

import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { useLang } from '@/lib/i18n';

/* Hình dạng khớp với LtCandidate của src/lib/longterm.ts. Khai báo lại ở đây
   thay vì import kiểu từ server: component này là 'use client', còn chuỗi
   import kia kéo theo node:fs. Cùng lý do CongressPanel không import
   congress.ts. */
type Zone = {
  price: number; low: number; high: number; touches: number;
  firstTouch: string; lastTouch: string;
};
type Gate = { key: string; label: string; passed: boolean; unknown?: boolean };
type Row = {
  symbol: string; name: string; sector: string; price: number;
  trend: {
    sma50: number | null; sma200: number | null; sma200SlopePct: number | null;
    aboveSma200: boolean | null; high52w: number | null; low52w: number | null;
    offHighPct: number | null; aboveLowPct: number | null;
  };
  nearestSupport: Zone | null;
  distancePct: number | null;
  brokenSupport: Zone | null;
  zoneCount: number;
  fa: Record<string, number | null>;
  faMissing: string[];
  pe: { readings: number; needed: number; median: number | null; percentile: number | null; vsMedianPct: number | null } | null;
  targetUpsidePct: number | null;
  sec: Sec | null;
  secReason: string | null;
  gates: Gate[];
  score: number;
  scoreBreakdown: { support: number; quality: number; value: number; trend: number; growth: number };
};
type SecPoint = { end: string; value: number; filed: string; form: string };
type Sec = {
  entityName: string | null;
  revenue: SecPoint[]; epsDiluted: SecPoint[]; fcf: SecPoint[]; shares: SecPoint[];
  revenueCagr3: number | null; revenueCagr5: number | null;
  epsCagr3: number | null; epsCagr5: number | null; fcfCagr3: number | null;
  sharesCagr3: number | null; fcfLatest: number | null; fcfMarginLatest: number | null;
  latestFy: string | null; latestFiled: string | null;
  tagsUsed: Record<string, string | null>;
  splitBreaks?: string[];
};

/* Tiền tỷ đọc thành "1.23B", không phải "1234567890". */
const big = (v: number | null | undefined) => {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  const a = Math.abs(v);
  const s = a >= 1e12 ? `${(v / 1e12).toFixed(2)}T` : a >= 1e9 ? `${(v / 1e9).toFixed(2)}B` : a >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v.toFixed(0);
  return s;
};

const n2 = (v: number | null | undefined, d = 2) =>
  v === null || v === undefined || !Number.isFinite(v) ? '—' : v.toFixed(d);
const pc = (v: number | null | undefined, d = 1) =>
  v === null || v === undefined || !Number.isFinite(v) ? '—' : `${v.toFixed(d)}%`;

export default function LongTermPanel() {
  const { t } = useLang();
  const [universe, setUniverse] = useState<'watchlist' | 'sp500'>('watchlist');
  /* Mặc định BẬT vì chủ app đặt hàng đúng cái cổng này. Vẫn là ô tích chứ
     không đóng cứng: mã rớt đủ sâu để tab này quan tâm thì phần lớn đã thủng
     SMA200, nên phải bỏ tích được khi bảng trống. */
  const [aboveSma200, setAboveSma200] = useState(true);
  const [rows, setRows] = useState<Row[]>([]);
  const [running, setRunning] = useState(false);
  const [phase, setPhase] = useState<string | null>(null);
  const [prog, setProg] = useState<{ done: number; total: number } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [scannedAt, setScannedAt] = useState<string | null>(null);
  const [summary, setSummary] = useState<
    { scanned: number; kept: number; belowSma200: number } | null
  >(null);
  const [open, setOpen] = useState<string | null>(null);
  /* Bảng đang hiện đến từ kho chứ không phải từ lượt quét vừa rồi. Phải nói
     ra: một bảng số nhìn y hệt nhau dù nó là số sống hay ảnh chụp bốn tiếng
     trước. Cùng lý do `res.saved` của tab Screener. */
  const [restored, setRestored] = useState(false);
  const openRow = rows.find((r) => r.symbol === open) ?? null;

  /* Ref chứ không phải state `running`: hàm nạp lại chạy bất đồng bộ, và cái
     nó cần biết là "ĐẾN LÚC NÀY đã có lượt quét mới chưa", chứ không phải
     giá trị `running` lúc effect được tạo. Đọc state cũ ở đây sẽ đè kết quả
     đang quét bằng ảnh chụp cũ. */
  const runningRef = useRef(false);

  /* Mở tab lên là có ngay kết quả lần quét trước, và chạy lại mỗi khi đổi
     phạm vi HOẶC gạt ô tích SMA200, vì mỗi tổ hợp lưu riêng: gạt từ
     watchlist sang cả rổ mà vẫn thấy bảng của watchlist là đọc nhầm kết
     quả, và gạt ô tích mà bảng cũ nằm nguyên đó cũng vậy. Không có bản lưu
     thì XOÁ bảng - giữ lại bảng của tổ hợp kia dưới mấy cái nút vừa đổi là
     nói dối một cách im lặng. */
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(
          `/api/longterm/last?universe=${universe}&aboveSma200=${aboveSma200 ? 1 : 0}`,
          { cache: 'no-store' }
        );
        const j = await res.json();
        if (!alive || runningRef.current) return;
        if (j.scan) {
          setRows(j.scan.rows ?? []);
          setScannedAt(j.scan.at ?? null);
          setSummary({
            scanned: j.scan.scanned,
            kept: j.scan.kept,
            /* Bản ghi lưu trước #145 không có trường này - `?? 0` chứ không
               phải bịa một con số, và 0 đọc đúng: hồi đó chưa có cổng nào
               loại mã vì SMA200. */
            belowSma200: j.scan.belowSma200 ?? 0,
          });
          setRestored(true);
        } else {
          setRows([]); setScannedAt(null); setSummary(null); setRestored(false);
          /* Đọc kho HỎNG khác hẳn CHƯA QUÉT LẦN NÀO: một bên sửa ở đĩa,
             một bên chỉ cần bấm quét. */
          if (j.error) setErr(j.error);
        }
      } catch {
        /* Không hỏi được thì coi như chưa có gì - nút quét vẫn dùng được. */
      }
    })();
    return () => { alive = false; };
  }, [universe, aboveSma200]);

  const scan = useCallback(async () => {
    runningRef.current = true;
    setRunning(true); setErr(null); setRows([]); setSummary(null);
    setRestored(false); setScannedAt(null); setOpen(null);
    setPhase('quotes'); setProg(null);
    try {
      const res = await fetch(
        `/api/longterm?universe=${universe}&aboveSma200=${aboveSma200 ? 1 : 0}`,
        { cache: 'no-store' }
      );
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      const found: Row[] = [];
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.trim()) continue;
          const e = JSON.parse(line);
          if (e.type === 'phase') { setPhase(e.phase); setProg(e.total ? { done: 0, total: e.total } : null); }
          else if (e.type === 'progress') setProg({ done: e.done, total: e.total });
          else if (e.type === 'candidate') { found.push(e.row); setRows([...found]); }
          else if (e.type === 'error') setErr(e.message);
          else if (e.type === 'done') {
            setScannedAt(e.at);
            setSummary({ scanned: e.scanned, kept: e.kept, belowSma200: e.belowSma200 ?? 0 });
          }
        }
      }
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    } finally {
      runningRef.current = false;
      setRunning(false); setPhase(null); setProg(null);
    }
  }, [universe, aboveSma200]);

  return (
    <section>
      <p className="hint hint-lead">{t('lt.lead')}</p>

      <div className="segmented">
        <button className={universe === 'watchlist' ? 'on' : undefined}
          onClick={() => setUniverse('watchlist')} disabled={running}>
          {t('lt.watchlist')}
        </button>
        <button className={universe === 'sp500' ? 'on' : undefined}
          onClick={() => setUniverse('sp500')} disabled={running}>
          {t('lt.sp500')}
        </button>
      </div>

      <label className="check">
        <input
          type="checkbox"
          checked={aboveSma200}
          onChange={(e) => setAboveSma200(e.target.checked)}
          disabled={running}
        />
        {t('lt.aboveSma200')}
      </label>
      <p className="hint">{t('lt.aboveSma200Note')}</p>

      <button className="run" onClick={scan} disabled={running}>
        {running ? t('lt.scanning') : t('lt.scan')}
      </button>

      {running && (
        <p className="hint">
          {phase ? t(`lt.phase.${phase}`) : t('lt.scanning')}
          {prog ? ` — ${prog.done}/${prog.total}` : ''}
        </p>
      )}

      {/* Hết phiên Schwab cần một hành động KHÁC HẲN mọi lỗi quét khác (bấm
          kết nối lại, không phải quét lại), nên nó được nói riêng thay vì
          đổ nguyên chuỗi REAUTH_REQUIRED ra màn hình. Vẫn in kèm lỗi gốc
          để còn chẩn đoán được. */}
      {err && (
        <p className="hint hint-warn">
          {err.includes('REAUTH_REQUIRED') ? t('lt.errExpired') : t('lt.error', err)}
        </p>
      )}

      {summary && (
        <p className="hint">
          {t('lt.summary', { scanned: summary.scanned, kept: summary.kept })}
          {scannedAt ? ` · ${new Date(scannedAt).toLocaleString()}` : ''}
        </p>
      )}

      {/* Con số này là thứ ngăn một bảng trống đọc thành "app hỏng" hoặc
          thành "thị trường không có mã nào đạt". Nó nói đúng một điều: ô tích
          đã loại bao nhiêu mã, và bỏ tích thì chúng được xét tiếp. */}
      {summary && summary.belowSma200 > 0 && (
        <p className="hint hint-warn">{t('lt.belowSmaCount', summary.belowSma200)}</p>
      )}

      {/* Ảnh chụp, không phải giá sống - và câu này phải là CẢNH BÁO chứ
          không phải chú thích mờ, vì thứ nó cảnh báo (giá đã cũ) không có
          dấu hiệu nào khác trên màn hình. */}
      {restored && scannedAt && !running && (
        <p className="hint hint-warn">{t('lt.saved', Date.parse(scannedAt))}</p>
      )}

      {/* Nói thẳng cái bảng này KHÔNG nói được, trước khi người đọc kịp suy ra
          điều ngược lại. Thiếu đoạn này thì một bảng tên "công ty tốt đang rẻ"
          tự đọc thành một danh sách khuyến nghị mua. */}
      <p className="hint hint-warn">{t('lt.caveat')}</p>

      {rows.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table className="pftable">
            <thead>
              <tr>
                <th>{t('lt.col.symbol')}</th>
                <th>{t('lt.col.price')}</th>
                <th>{t('lt.col.offHigh')}</th>
                <th>{t('lt.col.support')}</th>
                <th>{t('lt.col.trend')}</th>
                <th>{t('lt.col.quality')}</th>
                <th>{t('lt.col.value')}</th>
                <th>{t('lt.col.growth')}</th>
                <th>{t('lt.col.score')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <Fragment key={r.symbol}>
                  <tr
                    className={`ins-row${open === r.symbol ? ' lt-open' : ''}`}
                    onClick={() => setOpen(open === r.symbol ? null : r.symbol)}
                  >
                    <td>
                      <strong>{r.symbol}</strong>
                      {r.sector ? <div className="pfsub">{r.sector}</div> : null}
                    </td>
                    <td>{n2(r.price)}</td>
                    <td>{pc(r.trend.offHighPct)}</td>
                    <td>
                      {r.nearestSupport ? (
                        <>
                          {n2(r.nearestSupport.price)}
                          <div className="pfsub">
                            {t('lt.awayTouches', {
                              away: pc(r.distancePct),
                              touches: r.nearestSupport.touches,
                            })}
                          </div>
                        </>
                      ) : '—'}
                      {/* "Đã thủng" và "đang tới" là hai trạng thái ngược
                          nhau về hành động, nên không bao giờ hiện giống nhau. */}
                      {r.brokenSupport && (
                        <div className="ltbroken">{t('lt.brokenTag', n2(r.brokenSupport.price))}</div>
                      )}
                    </td>
                    <td>
                      {r.trend.aboveSma200 === null
                        ? '—'
                        : r.trend.aboveSma200 ? t('lt.aboveSma') : t('lt.belowSma')}
                      <div className="pfsub">{t('lt.slope', pc(r.trend.sma200SlopePct, 2))}</div>
                    </td>
                    <td>
                      {t('lt.roe')} {pc(r.fa.roe)}
                      <div className="pfsub">{t('lt.margin')} {pc(r.fa.profitMargin)}</div>
                    </td>
                    <td>
                      {t('lt.fwdPe')} {n2(r.fa.forwardPe, 1)}
                      <div className="pfsub">
                        {r.pe?.percentile !== null && r.pe
                          ? t('lt.pePct', r.pe.percentile!.toFixed(0))
                          : t('lt.peWarming', r.pe?.needed ?? 0)}
                      </div>
                    </td>
                    <td>
                      {r.sec ? (
                        <>
                          {t('lt.revCagr', pc(r.sec.revenueCagr3))}
                          <div className="pfsub">{t('lt.sharesCagr', pc(r.sec.sharesCagr3))}</div>
                        </>
                      ) : (
                        /* "Không có" và "chưa hỏi" đều là chưa biết; chi tiết
                           bên dưới nói rõ vì sao. */
                        <span className="pfsub">{t('lt.secNone')}</span>
                      )}
                    </td>
                    <td><strong>{r.score.toFixed(0)}</strong></td>
                  </tr>

                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Ngăn chi tiết nằm NGOÀI khung cuộn ngang của bảng, và đó là một sửa
          lỗi đo được chứ không phải sở thích bố cục. Đặt nó trong một `<td>`
          như tab Quốc hội thì nó rộng theo BẢNG (784px) chứ không theo màn
          hình: trên điện thoại 400px, quá nửa mỗi dòng nằm ngoài khung và
          phải kéo ngang mới đọc được. Với bảng số thì cuộn ngang là hợp lý -
          đó là lý do tab Quốc hội làm vậy - nhưng đây là VĂN XUÔI, mà phần
          bị che lại đúng là mấy câu cảnh báo. Ra ngoài bảng thì nó rộng
          đúng bằng thẻ, ở mọi bề ngang. */}
      {openRow && (
        <div className="ltdetailcard">
          <Detail key={openRow.symbol} row={openRow} />
        </div>
      )}

      {!running && summary && rows.length === 0 && (
        <p className="hint">{t('lt.empty')}</p>
      )}
    </section>
  );
}

function Detail({ row }: { row: Row }) {
  const { t, lang } = useLang();
  const [why, setWhy] = useState('');
  const [busy, setBusy] = useState(false);
  const started = useRef(false);

  const askWhy = useCallback(async () => {
    if (busy) return;
    setBusy(true); setWhy(''); started.current = true;
    try {
      const res = await fetch('/api/longterm/why', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ row, lang }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setWhy(`[${j?.error ?? `HTTP ${res.status}`}]`);
        return;
      }
      const reader = res.body!.getReader();
      const dec = new TextDecoder();
      let acc = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += dec.decode(value, { stream: true });
        setWhy(acc);
      }
    } catch (e: any) {
      setWhy(`[${String(e?.message ?? e)}]`);
    } finally {
      setBusy(false);
    }
  }, [row, lang, busy]);

  const b = row.scoreBreakdown;

  return (
    <div className="ltdetail">
      <h4>{t('lt.gates')}</h4>
      <ul className="gatelist">
        {row.gates.map((g) => (
          <li key={g.key} className={g.unknown ? 'gateunknown' : g.passed ? 'good' : 'bad'}>
            {g.unknown ? '?' : g.passed ? '✓' : '✗'} {g.label}
            {g.unknown && <span className="gateunknowntag">{t('lt.gateUnknown')}</span>}
          </li>
        ))}
      </ul>

      <h4>{t('lt.scoreHead')}</h4>
      <table className="ltmini">
        <tbody>
          <tr><td>{t('lt.col.support')}</td><td>{b.support.toFixed(1)} / 25</td></tr>
          <tr><td>{t('lt.col.quality')}</td><td>{b.quality.toFixed(1)} / 25</td></tr>
          <tr><td>{t('lt.col.value')}</td><td>{b.value.toFixed(1)} / 20</td></tr>
          <tr><td>{t('lt.col.trend')}</td><td>{b.trend.toFixed(1)} / 15</td></tr>
          <tr><td>{t('lt.col.growth')}</td><td>{(b.growth ?? 0).toFixed(1)} / 15</td></tr>
        </tbody>
      </table>

      <h4>{t('lt.supportHead')}</h4>
      {row.nearestSupport ? (
        <p className="hint">
          {t('lt.zoneDetail', {
            price: n2(row.nearestSupport.price),
            low: n2(row.nearestSupport.low),
            high: n2(row.nearestSupport.high),
            touches: row.nearestSupport.touches,
            first: row.nearestSupport.firstTouch,
            last: row.nearestSupport.lastTouch,
          })}
        </p>
      ) : (
        <p className="hint hint-warn">{t('lt.noZone')}</p>
      )}
      {row.brokenSupport && (
        <p className="hint hint-warn">{t('lt.brokenDetail', n2(row.brokenSupport.price))}</p>
      )}
      <p className="hint">{t('lt.zoneCount', row.zoneCount)}</p>

      <h4>{t('lt.faHead')}</h4>
      <table className="ltmini">
        <tbody>
          <tr><td>EPS (ttm)</td><td>{n2(row.fa.eps)}</td></tr>
          <tr><td>P/E · Forward P/E · PEG</td><td>{n2(row.fa.pe, 1)} · {n2(row.fa.forwardPe, 1)} · {n2(row.fa.peg, 2)}</td></tr>
          <tr><td>ROE · ROIC</td><td>{pc(row.fa.roe)} · {pc(row.fa.roic)}</td></tr>
          <tr><td>{t('lt.margin')} · Debt/Eq</td><td>{pc(row.fa.profitMargin)} · {n2(row.fa.debtEq)}</td></tr>
          <tr>
            <td>{t('lt.target')}</td>
            <td>{n2(row.fa.targetPrice)} ({pc(row.targetUpsidePct)})</td>
          </tr>
        </tbody>
      </table>
      {/* Giá mục tiêu được HIỆN nhưng không được làm cổng - xem chú thích
          trong gatesFor(). Nói ra để người đọc không tưởng nó đã lọc giúp. */}
      <p className="hint">{t('lt.targetNote')}</p>
      {row.faMissing.length > 0 && (
        <p className="hint hint-warn">{t('lt.faMissing', row.faMissing.join(', '))}</p>
      )}

      <h4>{t('lt.secHead')}</h4>
      {row.sec ? (
        <SecBlock sec={row.sec} />
      ) : (
        <p className="hint hint-warn">
          {row.secReason === 'no-cik'
            ? t('lt.secNoCik')
            : row.secReason?.startsWith('no-data')
              ? t('lt.secNoData', row.secReason.slice('no-data: '.length))
              : t('lt.secError', row.secReason ?? '?')}
        </p>
      )}

      <h4>{t('lt.peHead')}</h4>
      {row.pe && row.pe.percentile !== null ? (
        <p className="hint">
          {t('lt.peDetail', {
            pct: row.pe.percentile.toFixed(0),
            readings: row.pe.readings,
            median: n2(row.pe.median, 1),
            vs: pc(row.pe.vsMedianPct),
          })}
        </p>
      ) : (
        <p className="hint hint-warn">
          {t('lt.peWarmingDetail', { have: row.pe?.readings ?? 0, need: row.pe?.needed ?? 0 })}
        </p>
      )}

      <h4>{t('lt.whyHead')}</h4>
      <button className="run" onClick={askWhy} disabled={busy}>
        {busy ? t('lt.whyBusy') : t('lt.whyBtn')}
      </button>
      <p className="hint">{t('lt.whyNote')}</p>
      {why && <div className="ltwhy">{why}</div>}
    </div>
  );
}

/** Bảng 5 năm gần nhất + CAGR. Hiện NGUỒN và ngày nộp ngay cạnh số. */
function SecBlock({ sec }: { sec: Sec }) {
  const { t } = useLang();
  const ends = sec.revenue.slice(-5).map((p) => p.end);
  const at = (arr: SecPoint[], end: string) => arr.find((p) => p.end === end)?.value ?? null;
  const dilutedEps = sec.epsCagr3 !== null && sec.sharesCagr3 !== null && sec.sharesCagr3 > 3;
  return (
    <>
      <p className="hint">
        {t('lt.secLead', {
          years: sec.revenue.length,
          fy: sec.latestFy ?? '—',
          filed: sec.latestFiled ?? '—',
          tag: sec.tagsUsed.revenue ?? '—',
        })}
      </p>
      <div style={{ overflowX: 'auto' }}>
        <table className="ltmini ltsec">
          <thead>
            <tr>
              <th>{t('lt.secFy')}</th>
              <th>{t('lt.secRevenue')}</th>
              <th>{t('lt.secEps')}</th>
              <th>{t('lt.secFcf')}</th>
              <th>{t('lt.secShares')}</th>
            </tr>
          </thead>
          <tbody>
            {ends.map((end) => (
              <tr key={end}>
                <td>{end.slice(0, 7)}</td>
                <td>{big(at(sec.revenue, end))}</td>
                <td>{n2(at(sec.epsDiluted, end))}</td>
                <td>{big(at(sec.fcf, end))}</td>
                <td>{big(at(sec.shares, end))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="hint">
        {t('lt.secCagr', {
          rev: pc(sec.revenueCagr3),
          eps: pc(sec.epsCagr3),
          fcf: pc(sec.fcfCagr3),
          margin: pc(sec.fcfMarginLatest),
          shares: pc(sec.sharesCagr3),
        })}
        {sec.revenueCagr5 !== null || sec.epsCagr5 !== null
          ? ' ' + t('lt.secCagr5', { rev: pc(sec.revenueCagr5), eps: pc(sec.epsCagr5) })
          : ''}
      </p>
      {dilutedEps && <p className="hint hint-warn">{t('lt.secDilutionWarn')}</p>}
      {/* `?.` vì một payload cũ (scan đã lưu, cache) có thể thiếu trường này -
          ngăn chi tiết không được chết vì một dòng cảnh báo. */}
      {(sec.splitBreaks?.length ?? 0) > 0 && (sec.sharesCagr3 === null || sec.epsCagr3 === null) && (
        <p className="hint hint-warn">{t('lt.secSplit', (sec.splitBreaks ?? []).map((d) => d.slice(0, 7)).join(', '))}</p>
      )}
    </>
  );
}
