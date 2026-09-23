'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLang } from '@/lib/i18n';
import { readJsonOrText } from '@/lib/fetchjson';
import { readRemembered, readRememberedOneOf, remember } from '@/lib/remember';
import {
  window as windowStrikes,
  keyLevels,
  withinRange,
  type ExposureBar,
  type KeyLevels,
  type StrikeExposure,
} from '@/lib/mmexposure';
import type { UwDeltaSide, UwGammaSide } from '@/lib/uwexposure';
import { ExposureLadder, SpotGammaChart, DeltaByStrike } from './MmExposureCharts';
import type { IntraBar } from '@/lib/daytrade';

/**
 * Tab chính MM Exposure (từng là tab con thứ ba của Daytrade — chủ app
 * không tìm thấy nó ở tầng đó, nên đưa ra ngoài): phơi nhiễm của nhà tạo
 * lập, ba panel theo
 * đúng bố cục chủ app gửi ảnh (Unusual Whales) — nhưng mọi con số ở đây do
 * app TỰ TÍNH từ chuỗi quyền chọn của chính tài khoản, không phải lấy của
 * UW. Đó cũng là lý do nó làm được: gamma và delta không phải dữ liệu độc
 * quyền, chúng là số học trên greek và open interest mà `/chains` đã trả
 * (xem đầu `gex.ts`).
 *
 * Ba panel trả lời ba câu khác nhau, nên chúng KHÔNG phải ba cách vẽ của
 * cùng một bảng:
 *   1. gamma ròng theo strike xếp CẠNH nến phiên — hỏi "mấy mức gamma nằm
 *      ở đâu so với đường giá đang chạy";
 *   2. gamma theo strike trên HAI cơ sở — hỏi "vị thế đang tồn tại (OI) và
 *      giao dịch hôm nay (khối lượng) có nói cùng một chuyện không";
 *   3. delta theo strike cho MỘT kỳ — hỏi "kỳ này đang gánh bao nhiêu
 *      delta, và lệch về phía nào".
 *
 * Một lượt gọi lấy hết cả ba, vì cả ba đọc chung một chuỗi.
 */

const PRESETS = ['$SPX', 'SPY', 'QQQ', 'IWM'];
/** Nến 5 phút nên làm mới nhanh hơn một phút KHÔNG có nến mới — chỉ tốn
 *  request. Cùng con số và cùng lý do với nửa cổ phiếu. */
const REFRESH_MS = 60_000;
/** Bề rộng cửa sổ quanh giá, phần trăm. Cắt ở PHÍA MÀN HÌNH trên dữ liệu
 *  đã có, nên đổi là tức thì và không tốn request. ±1% là mặc định vì trên
 *  một chỉ số 7.700 điểm thì ±2% là hơn 300 điểm — mấy cột gần tiền, phần
 *  duy nhất có nghĩa, mảnh như sợi chỉ; còn ±0,5% có khi chỉ còn vài
 *  strike, nên `window()` mới có sàn `minRows`. */
const WINDOWS = ['0.5', '1', '2'] as const;
type WindowPct = (typeof WINDOWS)[number];

type Profile = {
  symbol: string;
  spot: number;
  basis: 'oi' | 'volume';
  expirations: string[];
  expiration: string | null;
  strikes: StrikeExposure[];
  totalGamma: number;
  totalDelta: number;
  diagnosis: {
    contracts: number; used: number; droppedNoGamma: number; droppedSentinel: number;
    droppedNoStrike: number; noDelta: number; deltaZero: number;
    withOi: number; withVolume: number; sample: Record<string, unknown> | null;
  };
};

type Payload = {
  symbol: string;
  source: 'schwab' | 'uw' | 'cboe';
  schwabDetail?: string;
  cboeAsOf?: string | null;
  uwAsOf?: string | null;
  uwDiag?: string;
  uwDetail?: string;
  spot: number;
  oi: Profile;
  volume: Profile;
  byExpiration: Profile | null;
  expiration: string | null;
  expirations: string[];
  bars: IntraBar[];
  candlesError: string | null;
  candleSymbol: string | null;
  at: number;
};

/** Hình dạng của `/api/daytrade/exposure/uw` — số UW TỰ TÍNH, đặt song song
 *  với số app tự tính. Mỗi nửa hỏng độc lập (xem `uwexposureload.ts`). */
type UwHalf<T> = { ok: true; value: T; at: number } | { ok: false; error: string; at: number };
type UwPayload =
  | { configured: false; at: number }
  | {
      configured: true;
      ticker: string;
      gamma: UwHalf<UwGammaSide>;
      delta: UwHalf<UwDeltaSide> | null;
      at: number;
    };

/** Tên nguồn chuỗi của APP — nhãn tiếng Anh ở cả hai ngôn ngữ, cùng luật
 *  tiêu đề #215. "UW chain" khác hẳn cột Unusual Whales bên cạnh: đó là
 *  chuỗi THÔ của UW mà app tự nhân, còn cột kia là số UW đã tính sẵn. */
const SRC_NAME: Record<Payload['source'], string> = {
  schwab: 'Schwab chain',
  uw: 'UW raw chain',
  cboe: 'CBOE chain (15-min delay)',
};

function LevelCell({ v, other }: { v: number | null; other: number | null }) {
  if (v === null) return <td>—</td>;
  return <td className={other !== null && other === v ? 'good' : undefined}>{v}</td>;
}

export default function MmExposurePanel() {
  const { t, lang } = useLang();
  const [symbol, setSymbol] = useState('$SPX');
  const [input, setInput] = useState('');
  const [exp, setExp] = useState<string | null>(null);
  const [pct, setPct] = useState<WindowPct>('1');
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [uw, setUw] = useState<UwPayload | null>(null);
  const [uwErr, setUwErr] = useState<string | null>(null);

  useEffect(() => {
    setSymbol(readRemembered('mmsymbol') || '$SPX');
    const w = readRememberedOneOf<WindowPct>('mmwindow', WINDOWS);
    if (w) setPct(w);
  }, []);

  const load = useCallback(
    async (sym: string, expiration: string | null) => {
      setBusy(true);
      try {
        const q = new URLSearchParams({ symbol: sym });
        if (expiration) q.set('exp', expiration);
        const r = await fetch(`/api/daytrade/exposure?${q}`);
        const body = await readJsonOrText(r);
        if (!body.ok) {
          // Không phải JSON: in mã HTTP + tiêu đề trang thật (lib/fetchjson.ts).
          setError(t('mm.failed', body.summary));
          return;
        }
        const j = body.json;
        if (!r.ok) {
          /* Ba lý do hỏng, ba câu khác nhau, vì ba cách sửa khác nhau: hết
             phiên thì bấm kết nối lại, mã sai thì sửa mã, còn lại in NGUYÊN
             VĂN lý do của Schwab/CBOE. Gộp lại thành "không tải được" là
             bắt người đọc tự đoán. */
          setError(
            j.error === 'REAUTH_REQUIRED'
              ? t('mm.reauth')
              : j.error === 'BAD_SYMBOL'
                ? t('mm.badSymbol')
                : t('mm.failed', String(j.detail ?? j.error ?? r.status))
          );
          return;
        }
        setData(j as Payload);
        setError(null);
      } catch (e: any) {
        setError(t('mm.failed', String(e?.message ?? e)));
      } finally {
        setBusy(false);
      }
    },
    [t]
  );

  useEffect(() => {
    load(symbol, exp);
    const id = setInterval(() => load(symbol, exp), REFRESH_MS);
    return () => clearInterval(id);
  }, [symbol, exp, load]);

  /* Số UW đi SAU route chính, không song song: chuỗi UW trong thang GEX có
     thể đang giữ hai suất trong trần 3 request đồng thời của cả tài khoản
     (#209). Route UW cache 120 giây, nên làm mới mỗi 60 giây không nhân đôi
     chi phí. */
  const dataKey = data ? `${data.symbol}|${data.expiration ?? ''}|${data.at}` : '';
  useEffect(() => {
    if (!data) return;
    let dead = false;
    (async () => {
      try {
        const q = new URLSearchParams({ symbol: data.symbol });
        if (data.expiration) q.set('exp', data.expiration);
        const r = await fetch(`/api/daytrade/exposure/uw?${q}`);
        const body = await readJsonOrText(r);
        if (dead) return;
        if (!body.ok) {
          setUwErr(body.summary);
          return;
        }
        if (!r.ok) {
          setUwErr(String(body.json?.detail ?? body.json?.error ?? r.status));
          return;
        }
        setUw(body.json as UwPayload);
        setUwErr(null);
      } catch (e: any) {
        if (!dead) setUwErr(String(e?.message ?? e));
      }
    })();
    return () => {
      dead = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataKey]);

  const pick = (s: string) => {
    const up = s.trim().toUpperCase();
    if (!up) return;
    setSymbol(up);
    // Kỳ đáo hạn của mã cũ gần như chắc chắn không có trong chuỗi mã mới;
    // giữ lại là để bảng delta rỗng trông như "kỳ này không có hợp đồng".
    setExp(null);
    // Số UW của mã cũ không được nằm lại dưới tên mã mới.
    setUw(null);
    remember('mmsymbol', up);
  };

  const windowed = useMemo(() => {
    if (!data) return null;
    const width = Number(pct);
    return {
      oi: windowStrikes(data.oi.strikes, data.spot, width),
      volume: windowStrikes(data.volume.strikes, data.spot, width),
      delta: data.byExpiration
        ? windowStrikes(data.byExpiration.strikes, data.spot, width)
        : [],
    };
  }, [data, pct]);

  const uwGamma = uw && uw.configured && uw.gamma.ok ? uw.gamma.value : null;
  const uwDelta = uw && uw.configured && uw.delta && uw.delta.ok ? uw.delta.value : null;
  const uwSpot = uwGamma?.price ?? data?.spot ?? 0;

  const uwWindowed = useMemo(() => {
    if (!uwGamma) return null;
    const width = Number(pct);
    return {
      oi: windowStrikes(uwGamma.oi, uwSpot, width),
      volume: windowStrikes(uwGamma.volume, uwSpot, width),
    };
  }, [uwGamma, uwSpot, pct]);

  const uwDeltaWindowed = useMemo(
    () => (uwDelta && data ? windowStrikes(uwDelta.strikes, data.spot, Number(pct)) : []),
    [uwDelta, data, pct]
  );

  /* So mức trên CÙNG một dải: UW chỉ trả ~50 strike quanh giá còn chuỗi của
     app trải hết, nên tường của app được tính lại trong đúng dải UW có. */
  const cmp = useMemo(() => {
    if (!data || !uwGamma) return null;
    const range = (rows: ExposureBar[]) =>
      rows.length ? { lo: rows[0].strike, hi: rows[rows.length - 1].strike } : null;
    const rOi = range(uwGamma.oi);
    const rVol = range(uwGamma.volume);
    if (!rOi && !rVol) return null;
    const side = (appRows: StrikeExposure[], uwRows: ExposureBar[], r: { lo: number; hi: number } | null) =>
      r ? { app: keyLevels(withinRange(appRows, r.lo, r.hi)), uw: keyLevels(uwRows) } : null;
    return {
      range: rOi ?? rVol!,
      oi: side(data.oi.strikes, uwGamma.oi, rOi),
      volume: side(data.volume.strikes, uwGamma.volume, rVol),
    };
  }, [data, uwGamma]);

  const hhmm = (ms: number) =>
    new Date(ms).toLocaleTimeString(lang === 'vi' ? 'vi-VN' : 'en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });

  /** Dòng trạng thái cho một khối UW khi KHÔNG có biểu đồ để vẽ — bốn lý do,
   *  bốn câu: chưa cấu hình / đang lấy / request hỏng (nguyên văn UW) / nửa
   *  này hỏng. Một khối trống im lặng đọc thành "UW không có gì". */
  const uwNote = (half: UwHalf<unknown> | null | undefined) => {
    if (uwErr) return <p className="hint hint-warn">{t('mm.uwFailed', uwErr)}</p>;
    if (!uw) return <p className="cap">{t('mm.uwLoading')}</p>;
    if (!uw.configured) return <p className="cap">{t('mm.uwOff')}</p>;
    if (!half) return <p className="cap">{t('mm.noExpRows')}</p>;
    if (!half.ok) return <p className="hint hint-warn">{t('mm.uwFailed', half.error)}</p>;
    return null;
  };

  const levelRows: Array<[keyof KeyLevels, string]> = [
    ['callWall', t('mm.cmpCall')],
    ['putWall', t('mm.cmpPut')],
    ['absGamma', t('mm.cmpAbs')],
  ];

  return (
    <section className="panel">
      <div className="panel-head">{t('mm.title')}</div>
      <div className="panel-body">
      <p className="cap">{t('mm.intro')}</p>

      <div className="dtcontrols">
        <div className="chiprow">
          {PRESETS.map((p) => (
            <button key={p} className={symbol === p ? 'on' : undefined}
                    aria-pressed={symbol === p} onClick={() => pick(p)} disabled={busy}>
              {p}
            </button>
          ))}
        </div>
        <div className="chiprow mmwin">
          {WINDOWS.map((w) => (
            <button key={w} className={pct === w ? 'on' : undefined} aria-pressed={pct === w}
                    onClick={() => { setPct(w); remember('mmwindow', w); }}>
              {t('mm.window', w)}
            </button>
          ))}
        </div>
        <span className="dtadd">
          <input value={input} onChange={(e) => setInput(e.target.value)}
                 onKeyDown={(e) => { if (e.key === 'Enter') { pick(input); setInput(''); } }}
                 placeholder={t('mm.symPlaceholder')} maxLength={10} size={8} />
          <button onClick={() => { pick(input); setInput(''); }}>{t('mm.go')}</button>
        </span>
      </div>

      {error && <p className="hint hint-warn">{error}</p>}

      {data && (
        <>
          <p className="cap">
            {data.source === 'cboe'
              ? t('mm.srcCboe', { as: data.cboeAsOf ?? '—', why: data.schwabDetail ?? '—' })
              : data.source === 'uw'
                ? t('mm.srcUw', { as: data.uwAsOf ?? '—', why: data.schwabDetail ?? '—' })
                : t('mm.srcSchwab')}
            {' · '}
            {t('mm.readAt', hhmm(data.at))}
          </p>

          <h3 className="dtsub">{t('mm.p1Title', data.symbol)}</h3>
          <p className="cap">{t('mm.p1Note', pct)}</p>
          <p className="cap">{t('mm.uwScale')}</p>
          <h4 className="mmsrc">App · {SRC_NAME[data.source]}</h4>
          <ExposureLadder bars={data.bars} strikes={windowed?.oi ?? []} spot={data.spot}
                          symbol={data.symbol} candlesError={data.candlesError} />
          <h4 className="mmsrc">Unusual Whales</h4>
          {uwGamma && uwWindowed ? (
            <>
              <p className="cap">
                {t('mm.uwAt', uwGamma.time ?? '—')}
                {' · '}
                {t('mm.uwRange', {
                  n: uwGamma.oi.length,
                  lo: uwGamma.oi[0]?.strike ?? '—',
                  hi: uwGamma.oi[uwGamma.oi.length - 1]?.strike ?? '—',
                })}
              </p>
              {uwGamma.putGammaPositive > 0 && (
                <p className="hint hint-warn">{t('mm.uwPutSign', uwGamma.putGammaPositive)}</p>
              )}
              {(uwGamma.droppedOi > 0 || uwGamma.droppedVolume > 0) && (
                <p className="cap">{t('mm.uwDropped', { oi: uwGamma.droppedOi, vol: uwGamma.droppedVolume })}</p>
              )}
              <ExposureLadder bars={data.bars} strikes={uwWindowed.oi} spot={uwSpot}
                              symbol={data.symbol} candlesError={data.candlesError}
                              hideCandleNote />
            </>
          ) : (
            uwNote(uw && uw.configured ? uw.gamma : null)
          )}

          <h3 className="dtsub">{t('mm.p2Title')}</h3>
          <p className="cap">{t('mm.p2Note')}</p>
          <div className="mmpair">
            <div>
              <h4 className="mmsrc">App · {SRC_NAME[data.source]}</h4>
              <SpotGammaChart oi={windowed?.oi ?? []} volume={windowed?.volume ?? []}
                              spot={data.spot} />
            </div>
            <div>
              <h4 className="mmsrc">Unusual Whales</h4>
              {uwWindowed ? (
                <SpotGammaChart oi={uwWindowed.oi} volume={uwWindowed.volume} spot={uwSpot} />
              ) : (
                uwNote(uw && uw.configured ? uw.gamma : null)
              )}
            </div>
          </div>

          {cmp && (
            <>
              <h4 className="mmsrc">App vs Unusual Whales — key strikes</h4>
              <p className="cap">{t('mm.cmpNote', { lo: cmp.range.lo, hi: cmp.range.hi })}</p>
              <div className="tablewrap">
                <table className="pftable mmcmp">
                  <thead>
                    <tr>
                      <th>{t('mm.cmpLevel')}</th>
                      <th>App · OI</th>
                      <th>UW · OI</th>
                      <th>{t('mm.cmpAppVol')}</th>
                      <th>{t('mm.cmpUwVol')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {levelRows.map(([k, label]) => (
                      <tr key={k}>
                        <td>{label}</td>
                        <LevelCell v={cmp.oi?.app[k] ?? null} other={cmp.oi?.uw[k] ?? null} />
                        <LevelCell v={cmp.oi?.uw[k] ?? null} other={cmp.oi?.app[k] ?? null} />
                        <LevelCell v={cmp.volume?.app[k] ?? null} other={cmp.volume?.uw[k] ?? null} />
                        <LevelCell v={cmp.volume?.uw[k] ?? null} other={cmp.volume?.app[k] ?? null} />
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          <h3 className="dtsub">{t('mm.p3Title')}</h3>
          <p className="cap">{t('mm.p3Note')}</p>
          <div className="chiprow mmexps">
            {data.expirations.slice(0, 8).map((e) => (
              <button key={e} className={data.expiration === e ? 'on' : undefined}
                      aria-pressed={data.expiration === e} onClick={() => setExp(e)}
                      disabled={busy}>
                {e}
              </button>
            ))}
          </div>
          <div className="mmpair">
            <div>
              <h4 className="mmsrc">App · {SRC_NAME[data.source]}</h4>
              {windowed && windowed.delta.length > 0 ? (
                <DeltaByStrike strikes={windowed.delta} />
              ) : (
                <p className="cap">{t('mm.noExpRows')}</p>
              )}
            </div>
            <div>
              <h4 className="mmsrc">Unusual Whales</h4>
              {uwDelta ? (
                uwDelta.strikes.length > 0 ? (
                  <>
                    {uwDelta.putDeltaPositive > 0 && (
                      <p className="hint hint-warn">{t('mm.uwPutDeltaSign', uwDelta.putDeltaPositive)}</p>
                    )}
                    <DeltaByStrike strikes={uwDeltaWindowed} />
                  </>
                ) : uwDelta.returned.length > 0 ? (
                  <p className="hint hint-warn">
                    {t('mm.uwExpMismatch', { asked: uwDelta.asked, got: uwDelta.returned.join(', ') })}
                  </p>
                ) : (
                  <p className="cap">{t('mm.uwExpEmpty', uwDelta.asked)}</p>
                )
              ) : (
                uwNote(uw && uw.configured ? uw.delta : null)
              )}
            </div>
          </div>

          {/* Khối chẩn đoán: đúng idiom probe của repo, áp vào giao diện.
              Ba con số tách RIÊNG vì ba nguyên nhân cần ba cách xử lý —
              và chuỗi SPX của Schwab từng trả OI = 0 ở TOÀN BỘ hợp đồng
              (#108) mà vẫn trông như một chuỗi đầy đủ. */}
          <details className="mmdiag">
            <summary>{t('mm.diagTitle')}</summary>
            <p className="cap">
              {t('mm.diagLine', {
                contracts: data.oi.diagnosis.contracts,
                used: data.oi.diagnosis.used,
                oi: data.oi.diagnosis.withOi,
                vol: data.oi.diagnosis.withVolume,
                noDelta: data.oi.diagnosis.noDelta,
                zeroDelta: data.oi.diagnosis.deltaZero,
              })}
            </p>
            <p className="cap">
              {t('mm.diagDropped', {
                gamma: data.oi.diagnosis.droppedNoGamma,
                sentinel: data.oi.diagnosis.droppedSentinel,
                strike: data.oi.diagnosis.droppedNoStrike,
              })}
            </p>
            {data.oi.diagnosis.withOi === 0 && (
              <p className="hint hint-warn">{t('mm.diagNoOi')}</p>
            )}
            {data.oi.diagnosis.sample && (
              <p className="cap mmsample">{JSON.stringify(data.oi.diagnosis.sample)}</p>
            )}
          </details>

          <p className="cap">{t('mm.caveat')}</p>
        </>
      )}
      </div>
    </section>
  );
}
