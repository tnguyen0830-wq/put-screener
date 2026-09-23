'use client';

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { useLang } from '@/lib/i18n';
import { readJsonOrText } from '@/lib/fetchjson';
import { readRemembered, readRememberedOneOf, remember } from '@/lib/remember';
/* Cả hai file đều THUẦN (không `node:fs`), nên một client component
   import thẳng được — và phải import thay vì chép, vì bản chép thứ hai
   của một ngưỡng là bản sẽ nói khác bản gốc. `sessionOpenAt` là CÙNG
   định nghĩa phiên mà tab Bề rộng TT đang dùng, nên hai màn hình không
   nói hai nghĩa cho chữ "sàn đang mở". */
import { sessionOpenAt } from '@/lib/internals-pure';
import {
  bookOneSided, maxVolume, moneynessPct, nearestStrike, quoteHealth, spotDividerIndex,
} from '@/lib/zerodte';
/* Kiểu lấy THẲNG từ module tính, không khai lại: bản khai lại ở đây từng
   thiếu `symbol` và sẽ còn lệch nữa mỗi lần `toLeg()` thêm một trường. */
import type { LadderRow, Leg } from '@/lib/zerodte';
import IntradayChart from './IntradayChart';
import type { DaytradeRow } from '@/lib/daytrade';

/**
 * Tab Daytrade — hai phần, chọn bằng tab con (cùng khuôn Heatmap/Insider):
 *
 *   • **Cổ phiếu**: VWAP, mốc phiên trước, khoảng mở cửa, khối lượng tương
 *     đối cho tối đa 10 mã, kèm biểu đồ nến 5 phút của mã đang chọn.
 *   • **0DTE**: thang strike của kỳ đáo hạn HÔM NAY, biên dao động thị
 *     trường đang định giá, và khối chẩn đoán nói thẳng Schwab gửi gì.
 *
 * Phơi nhiễm MM từng là tab con thứ ba ở đây; giờ là tab chính riêng
 * (`MmExposurePanel`), vì nằm ở tầng thứ ba thì chủ app không tìm thấy.
 *
 * Nửa 0DTE cũng LÀ phép đo: xem đầu `src/lib/zerodte.ts`.
 */

type Result =
  | { symbol: string; ok: true; row: DaytradeRow }
  | { symbol: string; ok: false; error: string };

type Payload = {
  results: Result[];
  rejected: string[];
  openRangeMinutes: number;
  barMinutes: number;
  baselineDays: number;
  at: number;
};

type ZeroDte = {
  symbol: string; requested: string; expiry: string | null; asked: string;
  spot: number | null; rows: LadderRow[];
  move: { strike: number; straddle: number; pct: number; low: number; high: number } | null;
  diagnosis: {
    contracts: number; withQuote: number; withOpenInterest: number; withGamma: number;
    expirations: string[]; sample: Record<string, unknown> | null;
  };
  source: 'schwab' | 'uw';
  uwAsOf?: string | null;
  uwDiag?: string;
  uwDetail?: string;
  trimmed: number;
  attempts: { symbol: string; error: string }[];
};

const MODES = ['stocks', 'zerodte'] as const;
type Mode = (typeof MODES)[number];
const OR_CHOICES = ['15', '30'] as const;
const ZERO_PRESETS = ['$SPX', 'SPY', 'QQQ', 'IWM'];
const DEFAULT_SYMBOLS = ['AAPL', 'NVDA', 'TSLA'];
const MAX_SYMBOLS = 10;
/** Nến là 5 phút, nên làm mới nhanh hơn một phút KHÔNG mang lại nến mới —
 *  chỉ tốn request. Con số này cố ý khớp với nhịp dữ liệu, không phải với
 *  cảm giác "càng nhanh càng tốt". */
const REFRESH_MS = 60_000;

const n2 = (v: number | null | undefined, d = 2) =>
  v === null || v === undefined || !Number.isFinite(v) ? '—' : v.toFixed(d);
const pct = (v: number | null | undefined, d = 2) =>
  v === null || v === undefined || !Number.isFinite(v) ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(d)}%`;
/* `good`/`bad` là lớp DÙNG CHUNG cả site (globals.css nói thẳng: "chỗ sửa
   là đổi cả site, không phải lặp lại từng bảng"). Đặt tên riêng cho tab này
   là tạo ra một bộ màu thứ hai sẽ trôi lệch — và bản đầu của tôi đã bịa ra
   `pos`/`neg` không tồn tại, nên số dương hiện màu chữ thường; chỉ đo màu
   đã tính trong trình duyệt mới thấy, đọc CSS thì không. */
const signCls = (v: number | null | undefined) =>
  v === null || v === undefined || !Number.isFinite(v) ? undefined : v >= 0 ? 'good' : 'bad';

/* Khối lượng và open interest là SỐ NGUYÊN đếm hợp đồng, và ở SPX chúng
   lên tới năm chữ số — không có dấu phân cách thì "24310" và "2431" trông
   gần giống nhau ở cỡ chữ bảng. Cố định `en-US` chứ không theo máy người
   đọc: bảng này đặt cạnh mấy con số Schwab vốn đã viết theo quy ước đó. */
const INT = new Intl.NumberFormat('en-US');
const int = (v: number | null | undefined) =>
  v === null || v === undefined || !Number.isFinite(v) ? '—' : INT.format(v);

/**
 * Ô GIÁ — một cột thay cho hai.
 *
 * Số lớn là giá giữa, dòng nhỏ là chính hai giá chào. Gộp được vì chúng
 * trả lời một câu hỏi ("hợp đồng này giá bao nhiêu"), và tách ra thành hai
 * cột số là thứ khiến bảng cũ có chín cột toàn chữ số.
 *
 * Dòng nhỏ KHÔNG bỏ đi được: `mid` chỉ tồn tại khi có CẢ HAI bên, nên khi
 * sổ lệnh một bên thì số lớn là một dấu gạch ngang — và nếu không in hai
 * giá chào bên dưới thì "không ai mua" đọc thành "không có dữ liệu", hai
 * chuyện cần hai cách xử lý khác nhau.
 */
function PriceCell({ leg, itm }: { leg: Leg | null; itm: boolean }) {
  const cls = itm ? 'dtprice itm' : 'dtprice';
  if (!leg || (leg.bid === null && leg.ask === null)) return <td className={cls}>—</td>;
  return (
    <td className={cls}>
      <b>{n2(leg.mid)}</b>
      <span className="dtsmall">{n2(leg.bid)} × {n2(leg.ask)}</span>
    </td>
  );
}

/**
 * Ô CỠ — khối lượng hôm nay (số + thanh) và open interest.
 *
 * Thanh chạy trên thang CHUNG cả bảng (`maxVolume`), đúng lý do Options
 * Flow đã ghi: thang theo từng hàng thì mọi hàng đều dài bằng nhau và cái
 * thanh nói ngược lại con số ngay cạnh nó. Không có sàn bề rộng tối thiểu
 * — một strike lèo tèo PHẢI trông lèo tèo; CSS chỉ giữ lại một sợi tóc
 * 1px để "có mà rất nhỏ" không biến mất thành "không có".
 */
function SizeCell(
  { leg, itm, side, max }: { leg: Leg | null; itm: boolean; side: 'call' | 'put'; max: number }
) {
  const cls = itm ? 'dtsize itm' : 'dtsize';
  const v = leg?.volume ?? null;
  const w = max > 0 && v !== null && v > 0 ? (v / max) * 100 : 0;
  return (
    <td className={cls}>
      <b>{int(v)}</b>
      {w > 0 && (
        <span className={`dtvolbar dtvolbar-${side}`} aria-hidden="true">
          <i style={{ width: `${w}%` }} />
        </span>
      )}
      <span className="dtsmall">OI {int(leg?.openInterest)}</span>
    </td>
  );
}

export default function DaytradePanel() {
  const { t } = useLang();
  const [mode, setMode] = useState<Mode>('stocks');

  /* ---- nửa cổ phiếu ---- */
  const [symbols, setSymbols] = useState<string[]>(DEFAULT_SYMBOLS);
  const [input, setInput] = useState('');
  const [orMin, setOrMin] = useState<'15' | '30'>('15');
  const [auto, setAuto] = useState(true);
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(null);

  /* ---- nửa 0DTE ---- */
  const [zsym, setZsym] = useState('$SPX');
  const [zdata, setZdata] = useState<ZeroDte | null>(null);
  const [zloading, setZloading] = useState(false);
  const [zerr, setZerr] = useState<string | null>(null);

  useEffect(() => {
    const m = readRememberedOneOf<Mode>('dtmode', MODES);
    if (m) setMode(m);
    const o = readRememberedOneOf<'15' | '30'>('dtor', OR_CHOICES);
    if (o) setOrMin(o);
    const s = readRemembered('dtsymbols');
    if (s) {
      const list = s.split(',').map((x) => x.trim().toUpperCase()).filter(Boolean).slice(0, MAX_SYMBOLS);
      if (list.length) setSymbols(list);
    }
    const z = readRemembered('dtzsym');
    if (z) setZsym(z);
  }, []);

  const load = useCallback(
    async (syms: string[], or: string) => {
      if (!syms.length) { setData(null); return; }
      setLoading(true);
      setErr(null);
      try {
        const r = await fetch(
          `/api/daytrade?symbols=${encodeURIComponent(syms.join(','))}&or=${or}`,
          { cache: 'no-store' }
        );
        const body = await readJsonOrText(r);
        if (!body.ok) { setErr(t('dt.failed', body.summary)); return; }
        const j = body.json;
        if (!r.ok) {
          /* Phiên Schwab hết hạn cần bấm kết nối lại — câu khác hẳn "thử
             lại", nên khoá i18n khác. */
          setErr(j?.error === 'REAUTH_REQUIRED' ? t('dt.reauth') : t('dt.failed', j?.detail ?? r.status));
          return;
        }
        setData(j);
        setPicked((p) => {
          const ok = j.results.find((x: Result) => x.ok && x.symbol === p);
          return ok ? p : (j.results.find((x: Result) => x.ok)?.symbol ?? null);
        });
      } catch (e: any) {
        setErr(t('dt.failed', String(e?.message ?? e)));
      } finally {
        setLoading(false);
      }
    },
    [t]
  );

  /* Nạp lần đầu + tự làm mới. `symbols`/`orMin` nằm trong deps nên đổi mã
     hay đổi khoảng mở cửa là nạp lại ngay, không phải bấm thêm. */
  const symKey = symbols.join(',');
  useEffect(() => {
    if (mode !== 'stocks') return;
    load(symbols, orMin);
    if (!auto) return;
    const id = setInterval(() => load(symbols, orMin), REFRESH_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, symKey, orMin, auto, load]);

  const loadZero = useCallback(
    async (s: string) => {
      setZloading(true);
      setZerr(null);
      try {
        const r = await fetch(`/api/daytrade/zerodte?symbol=${encodeURIComponent(s)}`, { cache: 'no-store' });
        const body = await readJsonOrText(r);
        if (!body.ok) { setZerr(t('dt.failed', body.summary)); return; }
        const j = body.json;
        if (!r.ok) {
          setZerr(j?.error === 'REAUTH_REQUIRED' ? t('dt.reauth') : t('dt.failed', j?.detail ?? r.status));
          return;
        }
        setZdata(j);
      } catch (e: any) {
        setZerr(t('dt.failed', String(e?.message ?? e)));
      } finally {
        setZloading(false);
      }
    },
    [t]
  );

  useEffect(() => {
    if (mode === 'zerodte') loadZero(zsym);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, zsym]);

  const setMode2 = (m: Mode) => { setMode(m); remember('dtmode', m); };
  const setOr2 = (o: '15' | '30') => { setOrMin(o); remember('dtor', o); };
  const setSyms = (list: string[]) => {
    const next = list.slice(0, MAX_SYMBOLS);
    setSymbols(next);
    remember('dtsymbols', next.join(','));
  };
  const addSymbol = () => {
    const s = input.trim().toUpperCase();
    if (!s || symbols.includes(s) || symbols.length >= MAX_SYMBOLS) { setInput(''); return; }
    setSyms([...symbols, s]);
    setInput('');
  };

  const rows = useMemo(() => data?.results ?? [], [data]);
  const current = rows.find((r) => r.ok && r.symbol === picked);
  const chartRow = current && current.ok ? current.row : null;

  /* ---- nửa 0DTE: mấy phép đo nhỏ để bảng đọc được ----
     Cố ý KHÔNG bọc `useMemo`: mỗi phép là một vòng duyệt trên tối đa 81
     hàng, rẻ hơn hẳn việc giữ một danh sách deps sẽ trôi lệch. */
  const zrows = zdata?.rows ?? [];
  const zspot = zdata?.spot ?? null;
  const zhealth = quoteHealth(zrows);
  const zVolMax = maxVolume(zrows);
  /* Hàng được tô là hàng gần GIÁ nhất, không phải strike của straddle:
     thường trùng nhau, và khi không trùng thì cái gần giá mới trả lời câu
     "tiền đang ở đâu". Không có spot thì lùi về strike straddle, vì một
     bảng không có mốc nào là bảng khó đọc nhất. */
  const zAtm = nearestStrike(zrows, zspot) ?? zdata?.move?.strike ?? null;
  const zDivider = spotDividerIndex(zrows, zspot);
  /* HAI phép đo độc lập về độ tươi, cố ý không gộp: đồng hồ trả lời "sàn
     có mở không", sổ lệnh trả lời "mấy con số này có giao dịch được
     không". Một mã èo uột giữa phiên hỏng theo kiểu thứ hai mà không hỏng
     theo kiểu thứ nhất, và ngược lại. */
  const zClosed = !!zdata && !sessionOpenAt(new Date());
  const zOneSided = bookOneSided(zhealth);

  return (
    <section className="panel">
      <div className="panel-head">{t('dt.title')}</div>
      <div className="panel-body">
        <nav className="segmented subtabs">
          <button className={mode === 'stocks' ? 'on' : undefined} onClick={() => setMode2('stocks')}>
            {t('dt.subStocks')}
          </button>
          <button className={mode === 'zerodte' ? 'on' : undefined} onClick={() => setMode2('zerodte')}>
            {t('dt.subZero')}
          </button>
        </nav>

        {mode === 'stocks' ? (
          <>
            <p className="cap">{t('dt.intro', { bar: data?.barMinutes ?? 5, days: data?.baselineDays ?? 10 })}</p>

            <div className="dtcontrols">
              <div className="dtchips">
                {symbols.map((s) => (
                  <button key={s} className="dtchip" onClick={() => setSyms(symbols.filter((x) => x !== s))}
                          title={t('dt.removeSym', s)}>
                    {s} <span aria-hidden="true">×</span>
                  </button>
                ))}
                {symbols.length < MAX_SYMBOLS && (
                  <span className="dtadd">
                    <input value={input} onChange={(e) => setInput(e.target.value)}
                           onKeyDown={(e) => { if (e.key === 'Enter') addSymbol(); }}
                           placeholder={t('dt.addPlaceholder')} maxLength={10} size={7} />
                    <button onClick={addSymbol}>{t('dt.add')}</button>
                  </span>
                )}
              </div>
              <div className="chiprow">
                {OR_CHOICES.map((o) => (
                  <button key={o} className={orMin === o ? 'on' : undefined}
                          aria-pressed={orMin === o} onClick={() => setOr2(o)}>
                    {t('dt.orChip', o)}
                  </button>
                ))}
              </div>
              <label className="check">
                <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
                {t('dt.auto')}
              </label>
              <button className="run" onClick={() => load(symbols, orMin)} disabled={loading}>
                {loading ? t('dt.loading') : t('dt.refresh')}
              </button>
            </div>

            {/* Trần 10 mã nói ra LÝ DO, không chỉ chặn im lặng. */}
            {symbols.length >= MAX_SYMBOLS && <p className="cap warnline">{t('dt.maxed', MAX_SYMBOLS)}</p>}
            {data?.rejected?.length ? <p className="cap warnline">{t('dt.rejected', data.rejected.join(', '))}</p> : null}
            {err && <p className="cap warnline">{err}</p>}

            {rows.length > 0 && (
              <div className="tablewrap">
                <table className="pftable dttable">
                  <thead>
                    <tr>
                      <th>{t('dt.colSymbol')}</th>
                      <th>{t('dt.colLast')}</th>
                      <th>{t('dt.colVwap')}</th>
                      <th>{t('dt.colVsVwap')}</th>
                      <th>{t('dt.colGap')}</th>
                      <th>{t('dt.colOr')}</th>
                      <th>{t('dt.colRelVol')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) =>
                      r.ok ? (
                        <tr key={r.symbol}
                            className={picked === r.symbol ? 'on' : undefined}
                            onClick={() => setPicked(r.symbol)}
                            style={{ cursor: 'pointer' }}>
                          <td><b>{r.symbol}</b></td>
                          <td>{n2(r.row.last)}</td>
                          <td>{n2(r.row.vwap)}</td>
                          <td className={signCls(r.row.vwapDiffPct)}>{pct(r.row.vwapDiffPct)}</td>
                          <td className={signCls(r.row.gapPct)}>{pct(r.row.gapPct)}</td>
                          <td>
                            {r.row.openRange ? (
                              <>
                                {n2(r.row.openRange.low)}–{n2(r.row.openRange.high)}{' '}
                                {r.row.openRange.broke === 'up' && <span className="good">▲</span>}
                                {r.row.openRange.broke === 'down' && <span className="bad">▼</span>}
                                {r.row.openRange.broke === null && <span className="cap">{t('dt.orInside')}</span>}
                              </>
                            ) : (
                              /* KHÁC hẳn một ô trống: khoảng mở cửa chưa đủ nến
                                 là "chưa tới lúc", không phải "không có". */
                              <span className="cap">{t('dt.orPending')}</span>
                            )}
                          </td>
                          <td className={r.row.relVol.ratio !== null && r.row.relVol.ratio >= 2 ? 'warnline' : undefined}>
                            {r.row.relVol.ratio !== null
                              ? `${r.row.relVol.ratio.toFixed(2)}×`
                              : <span className="cap">{t('dt.relVolWarm', r.row.relVol.sessions)}</span>}
                          </td>
                        </tr>
                      ) : (
                        <tr key={r.symbol}>
                          <td><b>{r.symbol}</b></td>
                          {/* Lỗi NGUYÊN VĂN của Schwab cho riêng mã này. */}
                          <td colSpan={6} className="warnline">{r.error}</td>
                        </tr>
                      )
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {chartRow && (
              <>
                <h3 className="dtsub">{t('dt.chartFor', { s: chartRow.symbol, d: chartRow.sessionDate ?? '—' })}</h3>
                <IntradayChart data={{
                  symbol: chartRow.symbol, bars: chartRow.bars,
                  openRange: chartRow.openRange, prior: chartRow.prior,
                  sessionDate: chartRow.sessionDate,
                }} />
                {chartRow.notes.length > 0 && (
                  <p className="cap warnline">
                    {chartRow.notes.map((n) => t(`dt.note.${n}`)).join(' · ')}
                  </p>
                )}
              </>
            )}

            <p className="cap">{t('dt.vwapCaveat')}</p>
            {data && <p className="cap">{t('dt.at', new Date(data.at).toLocaleTimeString())}</p>}
          </>
        ) : (
          <>
            <p className="cap">{t('dt.zeroIntro')}</p>
            <div className="chiprow">
              {ZERO_PRESETS.map((s) => (
                <button key={s} className={zsym === s ? 'on' : undefined} aria-pressed={zsym === s}
                        onClick={() => { setZsym(s); remember('dtzsym', s); }}>
                  {s}
                </button>
              ))}
              <button onClick={() => loadZero(zsym)} disabled={zloading}>
                {zloading ? t('dt.loading') : t('dt.refresh')}
              </button>
            </div>

            {zerr && <p className="cap warnline">{zerr}</p>}

            {zdata && (
              <>
                {/* Nguồn: chỉ nói khi KHÁC mặc định. Đường Schwab là bình
                    thường nên không cần một dòng; đường UW thì phải nói,
                    vì người đọc cần biết mấy con số này không đến từ chỗ
                    quen thuộc. */}
                {zdata.source === 'uw' && (
                  <p className="cap">
                    {t('dt.zeroSrcUw', { as: zdata.uwAsOf ?? '—', diag: zdata.uwDiag ?? '' })}
                  </p>
                )}
                {/* Bảng đã cắt KHÔNG được trông giống bảng đầy đủ. */}
                {zdata.trimmed > 0 && (
                  <p className="cap">{t('dt.zeroTrimmed', zdata.trimmed)}</p>
                )}
                {/* Chỉ nói vì sao UW hỏng khi bảng THẬT SỰ rỗng — nếu Schwab
                    đã cho số thì UW chưa bao giờ được gọi tới, và in một lý
                    do ở đó là nói về một chuyện không xảy ra. */}
                {zdata.rows.length === 0 && zdata.uwDetail && (
                  <p className="cap warnline">{t('dt.zeroUwFailed', zdata.uwDetail)}</p>
                )}

                {/* ---- ĐỘ TƯƠI, đứng TRƯỚC con số ----
                    Ảnh chụp production 2026-09-22 là lý do khối này tồn
                    tại: sau giờ đóng cửa của chính ngày đáo hạn, mọi put
                    chỉ còn giá chào bán và biên ra ±0,02% — số học đúng,
                    nhưng in nó dưới tiêu đề "khoảng thị trường đang định
                    giá" là nói rằng thị trường dự báo một ngày đứng yên,
                    trong khi sự thật là mấy hợp đồng này đã xong. Hai
                    dòng, không gộp, vì hai nguyên nhân độc lập. */}
                {zClosed && <p className="cap warnline">{t('dt.closedNow')}</p>}
                {zOneSided && (
                  <p className="cap warnline">
                    {t('dt.oneSided', { askOnly: zhealth.askOnly, legs: zhealth.legs })}
                  </p>
                )}

                {/* Biên dao động — MỘT CÂU trước, bốn ô số sau. Bốn ô rời
                    bắt người đọc tự ghép lại thành một câu trong đầu; câu
                    dẫn làm sẵn việc đó và gọi đúng tên con số (giá
                    straddle, không phải một mô hình). Khi sổ lệnh đã đóng
                    thì câu dẫn đổi hẳn nghĩa, không chỉ thêm một lời cảnh
                    báo bên cạnh. */}
                {zdata.move ? (
                  <>
                    <p className={zClosed || zOneSided ? 'dtlead warnline' : 'dtlead'}>
                      {t(zClosed || zOneSided ? 'dt.emLeadStale' : 'dt.emLead', {
                        straddle: n2(zdata.move.straddle),
                        pct: zdata.move.pct.toFixed(2),
                        spot: n2(zdata.spot),
                        low: n2(zdata.move.low),
                        high: n2(zdata.move.high),
                        strike: n2(zdata.move.strike, zdata.move.strike >= 100 ? 0 : 2),
                      })}
                    </p>
                    <div className="stats dtmove">
                      <div><dt>{t('dt.emSpot')}</dt><dd>{n2(zdata.spot)}</dd></div>
                      <div><dt>{t('dt.emStraddle', zdata.move.strike)}</dt><dd>{n2(zdata.move.straddle)}</dd></div>
                      <div><dt>{t('dt.emPct')}</dt><dd>±{zdata.move.pct.toFixed(2)}%</dd></div>
                      <div><dt>{t('dt.emRange')}</dt><dd>{n2(zdata.move.low)} – {n2(zdata.move.high)}</dd></div>
                    </div>
                  </>
                ) : (
                  <p className="cap warnline">{t('dt.emNone')}</p>
                )}

                {zdata.rows.length > 0 ? (
                  <>
                    <p className="cap">{t('dt.howToRead')}</p>
                    {/* Không có spot thì ba thứ cùng biến mất (vạch giá, ô
                        trong tiền, cột %) — nói ra một lần, thay vì để
                        người đọc tưởng bảng hỏng. */}
                    {zspot === null && <p className="cap warnline">{t('dt.noSpot')}</p>}
                    {/* Màn hình hẹp giấu hai cột cỡ (xem globals.css) — và
                        một cột bị giấu mà không ai nói là đúng thứ repo này
                        cấm, nên câu này chỉ hiện đúng ở bề ngang đó. */}
                    <p className="cap dtnarrowonly">{t('dt.narrowNote')}</p>
                    <div className="tablewrap">
                      <table className="pftable dttable">
                        <thead>
                          <tr>
                            <th colSpan={2} className="dtcallhead">{t('dt.calls')}</th>
                            <th>{t('dt.strike')}</th>
                            <th colSpan={2} className="dtputhead">{t('dt.puts')}</th>
                          </tr>
                          {/* Cột giá nằm SÁT strike ở cả hai bên (bảng cũ
                              không đối xứng, nên OI của call lại là thứ
                              chạm vào strike). Hai con số người ta so với
                              nhau nhiều nhất — giá call và giá put ở cùng
                              một strike — giờ ngồi cạnh nhau. */}
                          <tr>
                            <th className="dtsizehead">{t('dt.size')}</th><th>{t('dt.price')}</th>
                            <th />
                            <th>{t('dt.price')}</th><th className="dtsizehead">{t('dt.size')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {zdata.rows.map((r, i) => {
                            const mny = moneynessPct(r.strike, zspot);
                            /* "Trong tiền" chỉ có nghĩa khi đã biết giá:
                               không có spot thì KHÔNG tô ô nào, chứ không
                               tô theo một mốc đoán. */
                            const callItm = zspot !== null && r.strike < zspot;
                            const putItm = zspot !== null && r.strike > zspot;
                            return (
                              <Fragment key={r.strike}>
                                {i === zDivider && (
                                  <tr className="dtspotrow">
                                    <td colSpan={5}>{t('dt.spotHere', n2(zdata.spot))}</td>
                                  </tr>
                                )}
                                <tr className={zAtm === r.strike ? 'on' : undefined}>
                                  <SizeCell leg={r.call} itm={callItm} side="call" max={zVolMax} />
                                  <PriceCell leg={r.call} itm={callItm} />
                                  <td className="dtstrike">
                                    <b>{n2(r.strike, r.strike >= 100 ? 0 : 2)}</b>
                                    <span className="dtsmall">
                                      {mny === null ? '' : `${mny >= 0 ? '+' : ''}${mny.toFixed(2)}%`}
                                    </span>
                                  </td>
                                  <PriceCell leg={r.put} itm={putItm} />
                                  <SizeCell leg={r.put} itm={putItm} side="put" max={zVolMax} />
                                </tr>
                              </Fragment>
                            );
                          })}
                          {/* Giá nằm NGOÀI dải strike của bảng: vạch rơi
                              xuống đáy. Đó là sự thật đáng thấy, không
                              phải lỗi — nên vẫn vẽ. */}
                          {zDivider === zdata.rows.length && (
                            <tr className="dtspotrow">
                              <td colSpan={5}>{t('dt.spotHere', n2(zdata.spot))}</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </>
                ) : (
                  <p className="cap warnline">{t('dt.zeroEmpty', zdata.asked)}</p>
                )}


                {/* KHỐI CHẨN ĐOÁN — lý do nửa này tồn tại. Nó trả lời câu
                    #103/#108 chưa hỏi: chuỗi rỗng-ruột-về-OI có mang GIÁ
                    không. Ba con số riêng biệt, vì ba nguyên nhân khác nhau
                    cần ba cách xử lý khác nhau. */}
                <details className="dtdiag">
                  <summary>{t('dt.diagTitle')}</summary>
                  <ul className="cap">
                    <li>{t('dt.diagSymbol', { used: zdata.symbol, asked: zdata.requested })}</li>
                    <li>{t('dt.diagAsked', { asked: zdata.asked, got: zdata.expiry ?? '—' })}</li>
                    <li>{t('dt.diagCounts', { n: zdata.diagnosis.contracts, q: zdata.diagnosis.withQuote,
                        oi: zdata.diagnosis.withOpenInterest, g: zdata.diagnosis.withGamma })}</li>
                    {zdata.diagnosis.contracts > 0 && zdata.diagnosis.withOpenInterest === 0 && (
                      <li className="warnline">{t('dt.diagIndexBug')}</li>
                    )}
                    {zdata.attempts.length > 0 && (
                      <li>{t('dt.diagAttempts', zdata.attempts.map((a) => `${a.symbol}: ${a.error}`).join(' | '))}</li>
                    )}
                    {zdata.diagnosis.sample && (
                      <li><code>{JSON.stringify(zdata.diagnosis.sample)}</code></li>
                    )}
                  </ul>
                </details>
              </>
            )}
          </>
        )}
      </div>
    </section>
  );
}
