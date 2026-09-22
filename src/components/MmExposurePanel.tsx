'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLang } from '@/lib/i18n';
import { readRemembered, readRememberedOneOf, remember } from '@/lib/remember';
import { window as windowStrikes, type StrikeExposure } from '@/lib/mmexposure';
import { ExposureLadder, SpotGammaChart, DeltaByStrike } from './MmExposureCharts';
import type { IntraBar } from '@/lib/daytrade';

/**
 * Tab con thứ BA của Daytrade: phơi nhiễm của nhà tạo lập, ba panel theo
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

export default function MmExposurePanel() {
  const { t, lang } = useLang();
  const [symbol, setSymbol] = useState('$SPX');
  const [input, setInput] = useState('');
  const [exp, setExp] = useState<string | null>(null);
  const [pct, setPct] = useState<WindowPct>('1');
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
        const j = await r.json();
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

  const pick = (s: string) => {
    const up = s.trim().toUpperCase();
    if (!up) return;
    setSymbol(up);
    // Kỳ đáo hạn của mã cũ gần như chắc chắn không có trong chuỗi mã mới;
    // giữ lại là để bảng delta rỗng trông như "kỳ này không có hợp đồng".
    setExp(null);
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

  const hhmm = (ms: number) =>
    new Date(ms).toLocaleTimeString(lang === 'vi' ? 'vi-VN' : 'en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });

  return (
    <>
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
          <ExposureLadder bars={data.bars} strikes={windowed?.oi ?? []} spot={data.spot}
                          symbol={data.symbol} candlesError={data.candlesError} />

          <h3 className="dtsub">{t('mm.p2Title')}</h3>
          <p className="cap">{t('mm.p2Note')}</p>
          <SpotGammaChart oi={windowed?.oi ?? []} volume={windowed?.volume ?? []}
                          spot={data.spot} />

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
          {windowed && windowed.delta.length > 0 ? (
            <DeltaByStrike strikes={windowed.delta} />
          ) : (
            <p className="cap">{t('mm.noExpRows')}</p>
          )}

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
    </>
  );
}
