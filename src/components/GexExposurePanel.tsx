'use client';

import { useState } from 'react';
import { useLang } from '@/lib/i18n';
import GexChart from './GexChart';

/**
 * "SPX Market Maker Exposure" trong tab Heatmap — làm giống bố cục trang
 * tapchiphowall.com/options-gamma (view "Absolute Gamma" mặc định của họ):
 * chọn mã, biểu đồ gamma theo strike, put wall / call wall / zero gamma,
 * thanh trượt thu hẹp biên độ strike hiển thị.
 *
 * KHÁC trang tham khảo ở nguồn dữ liệu: họ lấy CBOE trễ 15 phút; ở đây tự
 * tính từ chuỗi quyền chọn Schwab của chính bạn (giống hệt GexChart đã dùng
 * ở tab Analyze) nên là số live, không trễ theo lịch cố định — refetch mỗi
 * 10 phút chỉ để đỡ tốn request, không phải vì dữ liệu Schwab bị trễ.
 *
 * KHÔNG có phần "GEX Heatmap for All US Tickers" của trang tham khảo — thực
 * ra trang đó cũng không có mục này (đã xác minh trực tiếp), "Bản Đồ Nhiệt"
 * của họ là treemap giá thường, còn GEX chỉ xem được từng mã một như ở đây.
 */

/** Ký hiệu $ khớp cách app này đã gọi Schwab cho các mã chỉ số ở nơi khác
 *  (TickerTape, /api/md/volatility) — CHƯA xác nhận trực tiếp với endpoint
 *  /chains vì sandbox không có mạng ra ngoài. Nếu Schwab từ chối ký hiệu
 *  này, /api/gex trả lỗi rõ ràng (surfaced by GexChart) thay vì âm thầm sai
 *  số — đúng nguyên tắc tự chẩn đoán của app này.
 */
const PRESETS = ['$SPX', 'QQQ', 'IWM', '$VIX'] as const;

const REFRESH_MS = 10 * 60 * 1000;

const displaySymbol = (s: string) => s.replace(/^\$/, '');

export default function GexExposurePanel() {
  const { t } = useLang();
  const [symbol, setSymbol] = useState<string>(PRESETS[0]);
  const [customInput, setCustomInput] = useState('');
  const [zoomPct, setZoomPct] = useState(0.25);

  return (
    <>
      <h3 className="dsec">{t('gexmm.title', displaySymbol(symbol))}</h3>
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

      <GexChart symbol={symbol} refreshMs={REFRESH_MS} zoomPct={zoomPct} />
    </>
  );
}
