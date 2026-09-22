'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLang } from '@/lib/i18n';
import { readRemembered, readRememberedOneOf, remember } from '@/lib/remember';
import IntradayChart from './IntradayChart';
import MmExposurePanel from './MmExposurePanel';
import type { DaytradeRow } from '@/lib/daytrade';

/**
 * Tab Daytrade — ba phần, chọn bằng tab con (cùng khuôn Heatmap/Insider):
 *
 *   • **Cổ phiếu**: VWAP, mốc phiên trước, khoảng mở cửa, khối lượng tương
 *     đối cho tối đa 10 mã, kèm biểu đồ nến 5 phút của mã đang chọn.
 *   • **0DTE**: thang strike của kỳ đáo hạn HÔM NAY, biên dao động thị
 *     trường đang định giá, và khối chẩn đoán nói thẳng Schwab gửi gì.
 *
 *   • **Phơi nhiễm MM**: ba biểu đồ theo bố cục Unusual Whales — gamma
 *     ròng theo strike cạnh nến phiên, gamma trên hai cơ sở (OI và khối
 *     lượng), và delta theo strike cho một kỳ. Mọi con số app tự tính từ
 *     chuỗi quyền chọn; xem đầu `src/lib/mmexposure.ts`.
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

type Leg = {
  bid: number | null; ask: number | null; mid: number | null; last: number | null;
  volume: number | null; openInterest: number | null; delta: number | null;
};
type LadderRow = { strike: number; call: Leg | null; put: Leg | null; distance: number };
type ZeroDte = {
  symbol: string; requested: string; expiry: string | null; asked: string;
  spot: number | null; rows: LadderRow[];
  move: { strike: number; straddle: number; pct: number; low: number; high: number } | null;
  diagnosis: {
    contracts: number; withQuote: number; withOpenInterest: number; withGamma: number;
    expirations: string[]; sample: Record<string, unknown> | null;
  };
  attempts: { symbol: string; error: string }[];
};

const MODES = ['stocks', 'zerodte', 'mmexposure'] as const;
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
        const j = await r.json();
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
        const j = await r.json();
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
          <button className={mode === 'mmexposure' ? 'on' : undefined}
                  onClick={() => setMode2('mmexposure')}>
            {t('dt.subExposure')}
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
        ) : mode === 'zerodte' ? (
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
                {/* Biên dao động — nói đúng tên: đây là GIÁ STRADDLE, không
                    phải một mô hình. */}
                {zdata.move ? (
                  <div className="stats dtmove">
                    <div><dt>{t('dt.emSpot')}</dt><dd>{n2(zdata.spot)}</dd></div>
                    <div><dt>{t('dt.emStraddle', zdata.move.strike)}</dt><dd>{n2(zdata.move.straddle)}</dd></div>
                    <div><dt>{t('dt.emPct')}</dt><dd>±{zdata.move.pct.toFixed(2)}%</dd></div>
                    <div><dt>{t('dt.emRange')}</dt><dd>{n2(zdata.move.low)} – {n2(zdata.move.high)}</dd></div>
                  </div>
                ) : (
                  <p className="cap warnline">{t('dt.emNone')}</p>
                )}

                {zdata.rows.length > 0 ? (
                  <div className="tablewrap">
                    <table className="pftable dttable">
                      <thead>
                        <tr>
                          <th colSpan={4} className="dtcallhead">{t('dt.calls')}</th>
                          <th>{t('dt.strike')}</th>
                          <th colSpan={4} className="dtputhead">{t('dt.puts')}</th>
                        </tr>
                        <tr>
                          <th>{t('dt.bid')}</th><th>{t('dt.ask')}</th><th>{t('dt.vol')}</th><th>{t('dt.oi')}</th>
                          <th />
                          <th>{t('dt.bid')}</th><th>{t('dt.ask')}</th><th>{t('dt.vol')}</th><th>{t('dt.oi')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {zdata.rows.map((r) => {
                          const atm = zdata.move && r.strike === zdata.move.strike;
                          return (
                            <tr key={r.strike} className={atm ? 'on' : undefined}>
                              <td>{n2(r.call?.bid)}</td><td>{n2(r.call?.ask)}</td>
                              <td>{r.call?.volume ?? '—'}</td><td>{r.call?.openInterest ?? '—'}</td>
                              <td><b>{n2(r.strike, r.strike >= 100 ? 0 : 2)}</b></td>
                              <td>{n2(r.put?.bid)}</td><td>{n2(r.put?.ask)}</td>
                              <td>{r.put?.volume ?? '—'}</td><td>{r.put?.openInterest ?? '—'}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
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
        ) : (
          <MmExposurePanel />
        )}
      </div>
    </section>
  );
}
