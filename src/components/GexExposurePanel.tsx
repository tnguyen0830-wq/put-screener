'use client';

import { useEffect, useState } from 'react';
import { useLang } from '@/lib/i18n';
import { readRemembered, remember } from '@/lib/remember';
import GexChart from './GexChart';

/**
 * "SPX Market Maker Exposure" trong tab Heatmap — làm giống bố cục trang
 * tapchiphowall.com/options-gamma (view "Absolute Gamma" mặc định của họ):
 * chọn mã, biểu đồ gamma theo strike, put wall / call wall / zero gamma,
 * thanh trượt thu hẹp biên độ strike hiển thị.
 *
 * Nguồn dữ liệu: chuỗi quyền chọn Schwab của chính bạn (giống hệt GexChart
 * đã dùng ở tab Analyze), là số live. Mã nào Schwab trả chuỗi rỗng ruột
 * (SPX và các chỉ số - lỗi API phía Schwab, xem lib/cboe.ts) thì /api/gex
 * tự chuyển sang feed công khai trễ 15 phút của CBOE và màn hình nói rõ.
 * Refetch mỗi 10 phút chỉ để đỡ tốn request.
 *
 * KHÔNG có phần "GEX Heatmap for All US Tickers" của trang tham khảo — thực
 * ra trang đó cũng không có mục này (đã xác minh trực tiếp), "Bản Đồ Nhiệt"
 * của họ là treemap giá thường, còn GEX chỉ xem được từng mã một như ở đây.
 */

/** Ký hiệu $ khớp cách app này gọi Schwab cho các mã chỉ số ở nơi khác
 *  (TickerTape, /api/md/volatility). SPY đứng cạnh SPX có chủ ý: cùng một
 *  thị trường nhìn từ hai chuỗi khác nhau - SPX qua CBOE (trễ 15 phút),
 *  SPY qua Schwab (live) - nên đối chiếu được ngay khi một bên có vấn đề. */
const PRESETS = ['$SPX', 'SPY', 'QQQ', 'IWM', '$VIX'] as const;

const REFRESH_MS = 10 * 60 * 1000;

const DEFAULT_ZOOM = 0.25;

const displaySymbol = (s: string) => s.replace(/^\$/, '');

export default function GexExposurePanel() {
  const { t } = useLang();
  const [symbol, setSymbol] = useState<string>(PRESETS[0]);
  const [customInput, setCustomInput] = useState('');
  const [zoomPct, setZoomPct] = useState(DEFAULT_ZOOM);

  /* Nhớ mã và biên độ đang xem. Không nhớ thì mỗi lần mở lại app là về
     SPX ±25% - với người chỉ xem SPX thì không sao, nhưng ai đang theo một
     mã khác thì phải gõ lại mỗi lần. Đọc SAU hydrate (lib/remember.ts). */
  const [restored, setRestored] = useState(false);
  useEffect(() => {
    const s = readRemembered('gexmm.symbol');
    if (s && /^[$A-Z.]{1,12}$/.test(s)) setSymbol(s);
    const z = Number(readRemembered('gexmm.zoom'));
    if (Number.isFinite(z) && z >= 0.1 && z <= 1) setZoomPct(z);
    setRestored(true);
  }, []);
  useEffect(() => {
    if (!restored) return;
    remember('gexmm.symbol', symbol);
    remember('gexmm.zoom', String(zoomPct));
  }, [restored, symbol, zoomPct]);

  return (
    <section className="panel">
      <div className="panel-head">{t('gexmm.title', displaySymbol(symbol))}</div>
      <div className="panel-body">
      <p className="cap">{t('gexmm.note')}</p>

      <div className="segmented hmranges">
        {PRESETS.map((p) => (
          <button
            key={p}
            className={symbol === p ? 'on' : undefined}
            onClick={() => setSymbol(p)}
          >
            {displaySymbol(p)}
          </button>
        ))}
      </div>

      <form
        className="addrow"
        onSubmit={(e) => {
          e.preventDefault();
          const s = customInput.trim().toUpperCase();
          if (s) setSymbol(s);
        }}
      >
        <input
          value={customInput}
          onChange={(e) => setCustomInput(e.target.value)}
          placeholder={t('gexmm.customPlaceholder')}
          aria-label={t('gexmm.customPlaceholder')}
        />
        <button type="submit">{t('gexmm.go')}</button>
      </form>

      <label className="gexmm-zoom">
        <span>{t('gexmm.zoomLabel', Math.round(zoomPct * 100))}</span>
        <input
          type="range"
          min={10}
          max={100}
          step={5}
          value={Math.round(zoomPct * 100)}
          onChange={(e) => setZoomPct(Number(e.target.value) / 100)}
        />
      </label>

      {/* Chỉ dựng biểu đồ SAU khi đã đọc mã đã nhớ. Dựng ngay với mặc định
          "$SPX" rồi đổi sang mã đã nhớ ở nhịp sau là một lượt /api/gex vô
          ích cho $SPX và một khung "đang tính…" chớp qua mỗi lần quay lại
          tab - đúng cái chớp mà phần nhớ này sinh ra để bỏ. */}
      {restored && <GexChart symbol={symbol} refreshMs={REFRESH_MS} zoomPct={zoomPct} />}
      </div>
    </section>
  );
}
