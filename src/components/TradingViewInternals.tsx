'use client';

import { useEffect, useState } from 'react';
import { useLang } from '@/lib/i18n';
import { readRememberedOneOf, remember } from '@/lib/remember';
import { Card, type Series } from './InternalsCard';
import type { Load } from './InternalsPanel';

/**
 * Tám ô market internals theo bố cục trang tapchiphowall.com mà chủ app đưa
 * ảnh mẫu - từ #177 là lưới LAI: mỗi ô chọn được nguồn TradingView (iframe)
 * hay nguồn của app (thẻ Schwab/UW), và mặc định là nguồn TỐT HƠN cho ô đó.
 *
 * ============================================================
 * VÌ SAO NHÚNG, TRONG KHI APP ĐÃ CÓ DỮ LIỆU SCHWAB
 * ============================================================
 *
 * #165 đo được: Schwab chỉ có nến trong ngày cho 4/8 chỉ báo, 3 chỉ báo
 * chỉ có SỐ HIỆN TẠI (app tự lấy mẫu ~15 phút, đường thô), và NASDAQ
 * Advance-Decline KHÔNG nguồn có key nào có. TradingView tự tổng hợp cả họ
 * mã `USI:*` nên có đủ kèm lịch sử phút - đó là lý do trang mẫu nhìn đầy đủ.
 *
 * ============================================================
 * IFRAME THUẦN, KHÔNG DÙNG SCRIPT LOADER CỦA TRADINGVIEW
 * ============================================================
 *
 * TradingView có sẵn một script nhúng tiện hơn, nhưng script đó chạy JS của
 * BÊN THỨ BA ngay trong origin của app này - mà app này giữ phiên Schwab và
 * dữ liệu danh mục thật. Một iframe khác origin thì bị same-origin policy
 * nhốt lại: nó không đọc được DOM, cookie hay phiên của app. Đổi lấy sự bất
 * tiện nhỏ (phải tự dựng URL) để hạ hẳn một bậc rủi ro.
 *
 * ============================================================
 * IFRAME LÀ KHUNG HÌNH: KHÔNG VẼ ĐÈ, KHÔNG ĐỌC SỐ
 * ============================================================
 *
 * App KHÔNG đọc được con số bên trong iframe và KHÔNG vẽ được gì lên nó -
 * kể cả các đường tham chiếu ±600/±300 mà trang mẫu kẻ (họ dùng thư viện
 * biểu đồ TradingView chạy trong trang của họ, không phải widget nhúng).
 * Nên đường tham chiếu chỉ có trên THẺ CỦA APP, và đó là lý do các ô có
 * dữ liệu app tốt (NYSE TICK nến 5 phút, UVOL−DVOL, VIX) mặc định là thẻ
 * app chứ không phải iframe. Ô nào app chỉ có mẫu 15 phút (NASDAQ TICK,
 * ADV−DECL, Put/Call) thì mặc định TradingView, nhưng vẫn có nút chuyển
 * sang thẻ app - đường thô hơn, đổi lấy đường tham chiếu.
 *
 * ============================================================
 * MÃ TRADINGVIEW KHÔNG ĐO ĐƯỢC TỪ SANDBOX - NGƯỜI DÙNG ĐỔI TRÊN MÀN HÌNH
 * ============================================================
 *
 * `s.tradingview.com` bị proxy từ chối 403 ở CONNECT. Ba lần đo THẬT của
 * chủ app, ba cách hỏng khác nhau, không cái nào là "invalid symbol":
 *   - `TVC:VIX` (#168): widget lặng lẽ vẽ biểu đồ APPLE - mã mặc định.
 *   - `CBOE:VIX` (#173): nhận ra mã rồi bật hộp "chỉ có trên TradingView".
 *   - `USI:UVOL-USI:DVOL`: vẽ được nhưng KHÔNG có khung 1m/5m.
 *   - `CAPITALCOM:VIX` (#175): vẽ được, nhưng là CFD theo hợp đồng tương
 *     lai VIX - đọc 18 khi chỉ số tiền mặt 14,82. Nên VIX chỉ còn thẻ app.
 * Đã ĐO CHẠY TỐT ở 5m: `USI:VOLD`, `USI:ADD`, `USI:ADDQ`, `USI:PCC`,
 * `USI:TICK`, `USI:TICKQ`, `USI:PCCE` (#174/#175). Mỗi ô vẫn mang danh sách
 * nguồn + hàng nút, nhớ riêng từng ô; giá trị nhớ chỉ được nhận khi còn
 * trong danh sách - nguồn đã bị gỡ vì đo được là hỏng không sống dậy từ
 * bộ nhớ cũ.
 */

type Source =
  | { id: string; kind: 'tv'; symbol: string }
  | { id: string; kind: 'app'; series: string };

type Box = {
  key: string;
  label: string;
  /** Nguồn theo thứ tự ưu tiên; phần tử đầu là mặc định. */
  sources: readonly Source[];
  /** Phút mỗi nến cho iframe. Ảnh mẫu dùng 15 cho UVOL-DVOL, 5 còn lại. */
  interval: string;
  /** Kiểu vẽ TradingView: '1' nến, '2' đường. */
  style: string;
};

const tv = (symbol: string): Source => ({ id: `tv:${symbol}`, kind: 'tv', symbol });
const app = (series: string): Source => ({ id: `app:${series}`, kind: 'app', series });

const BOXES: Box[] = [
  { key: 'uvolDvol', label: 'NYSE UVOL − DVOL', sources: [app('uvolDvolDiff'), tv('USI:VOLD'), tv('USI:UVOL-USI:DVOL')], interval: '15', style: '1' },
  { key: 'advDecl', label: 'NYSE $ADV − $DECL', sources: [tv('USI:ADD'), tv('USI:ADV-USI:DECL'), app('advDeclNyse')], interval: '5', style: '2' },
  { key: 'advDeclQ', label: 'NASDAQ $ADVQ − $DECLQ', sources: [tv('USI:ADDQ'), tv('USI:ADVQ-USI:DECLQ')], interval: '5', style: '2' },
  { key: 'pcc', label: 'Put/Call Ratio', sources: [tv('USI:PCC'), app('pccTotal')], interval: '5', style: '2' },
  { key: 'tick', label: 'NYSE TICK', sources: [app('nyseTick'), tv('USI:TICK')], interval: '5', style: '1' },
  { key: 'tickq', label: 'NASDAQ TICK', sources: [tv('USI:TICKQ'), app('nasdaqTick')], interval: '5', style: '1' },
  { key: 'vix', label: 'VIX', sources: [app('vix')], interval: '5', style: '2' },
  { key: 'pcce', label: 'Put/Call Ratio (Equity)', sources: [tv('USI:PCCE'), app('pccEquity')], interval: '5', style: '2' },
];

function embedUrl(symbol: string, b: Box, theme: 'light' | 'dark', locale: string): string {
  const q = new URLSearchParams({
    symbol,
    interval: b.interval,
    theme,
    style: b.style,
    locale,
    timezone: 'America/New_York',
    // Ẩn thanh công cụ trên (khung giờ/kiểu nến) như trang mẫu - ô nhỏ,
    // thanh đó ăn mất một phần năm chiều cao.
    hide_top_toolbar: '1',
    hide_side_toolbar: '1',
    allow_symbol_change: '0',
    save_image: '0',
    withdateranges: '0',
  });
  return `https://s.tradingview.com/widgetembed/?${q.toString()}`;
}

/**
 * Theme ĐANG hiện, theo dõi cả hai đường đổi được: nút gạt của app (đặt
 * `data-theme` lên <html>) và theme hệ điều hành (khi đang ở chế độ
 * 'system', lúc đó `data-theme` bị gỡ hẳn - xem ThemeToggle.tsx).
 *
 * Trả `null` cho tới khi dựng xong ở trình duyệt: server không có DOM để
 * hỏi, mà URL iframe lại phụ thuộc theme - render một giá trị đoán ở server
 * rồi đổi ở client là một hydration mismatch. Cùng lý do ThemeToggle có cờ
 * `ready`.
 */
function useResolvedTheme(): 'light' | 'dark' | null {
  const [theme, setTheme] = useState<'light' | 'dark' | null>(null);

  useEffect(() => {
    const read = (): 'light' | 'dark' => {
      const attr = document.documentElement.getAttribute('data-theme');
      if (attr === 'light' || attr === 'dark') return attr;
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    };

    setTheme(read());

    const obs = new MutationObserver(() => setTheme(read()));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onMq = () => setTheme(read());
    mq.addEventListener('change', onMq);

    return () => {
      obs.disconnect();
      mq.removeEventListener('change', onMq);
    };
  }, []);

  return theme;
}

/** Khoá nhớ theo từng ô - đổi nguồn ô này không được kéo ô khác theo. */
const rememberKey = (b: Box) => `tvsrc:${b.key}`;

function useChosenSources() {
  const [chosen, setChosen] = useState<Record<string, string>>(() =>
    Object.fromEntries(BOXES.map((b) => [b.key, b.sources[0].id]))
  );

  useEffect(() => {
    setChosen((prev) => {
      const next = { ...prev };
      for (const b of BOXES) {
        const saved = readRememberedOneOf(rememberKey(b), b.sources.map((s) => s.id));
        if (saved) next[b.key] = saved;
      }
      return next;
    });
  }, []);

  const choose = (b: Box, id: string) => {
    setChosen((prev) => ({ ...prev, [b.key]: id }));
    remember(rememberKey(b), id);
  };

  return { chosen, choose };
}

const fmtRatio = (r: number | null) => (r === null ? '—' : `${r < 0 ? '-' : ''}${Math.abs(r).toFixed(2)}:1`);

/** Thẻ app khi dữ liệu chưa về / lỗi / thiếu chuỗi - KHÔNG bao giờ trống. */
function AppSlot({ load, series, label, t, badge }: { load: Load; series: string; label: string; t: (k: string, ...a: any[]) => string; badge?: React.ReactNode }) {
  if (load.state === 'error') {
    return (
      <div className="tvcard">
        <p className="cap intlabel">{label}</p>
        <p className="cap warnline">{load.expired ? t('int.expired') : `${t('int.loadFailed')} ${load.msg}`}</p>
      </div>
    );
  }
  if (load.state === 'loading') {
    return (
      <div className="tvcard">
        <p className="cap intlabel">{label}</p>
        <p className="cap">{t('int.loading')}</p>
      </div>
    );
  }
  const s: Series | undefined = load.data.series.find((x) => x.key === series);
  if (!s) {
    return (
      <div className="tvcard">
        <p className="cap intlabel">{label}</p>
        <p className="cap warnline">{t('int.seriesMissing', series)}</p>
      </div>
    );
  }
  return <Card s={{ ...s, label }} t={t} tall badge={badge} className="tvcard tvcard-app" />;
}

export default function TradingViewInternals({ load, t }: { load: Load; t: (k: string, ...a: any[]) => string }) {
  const { lang } = useLang();
  const theme = useResolvedTheme();
  const { chosen, choose } = useChosenSources();

  const ratio = load.state === 'ok' ? load.data.nyseUpDown : null;
  const ratioBadge = (
    <span className="tvbadges">
      <span className="tvbadge" style={ratio === null ? undefined : { color: ratio >= 0 ? 'var(--credit)' : 'var(--risk)' }}>
        {fmtRatio(ratio)} NYSE
      </span>
      {/* NASDAQ up/down volume: $UVOLQ/$DVOLQ CHƯA ĐO ở Schwab (#165 chỉ
          đo bốn mã) - một badge trống có nhãn thật hơn một badge bịa. */}
      <span className="tvbadge tvbadge-muted">{t('int.nasdaqRatioUnknown')}</span>
    </span>
  );

  const srcLabel = (s: Source): string => {
    if (s.kind === 'tv') return s.symbol;
    const found = load.state === 'ok' ? load.data.series.find((x) => x.key === s.series) : undefined;
    if (!found) return t('int.srcApp');
    return found.source === 'schwab' ? t('int.srcAppSchwab') : found.source === 'uw' ? t('int.srcAppUw') : t('int.srcAppSampled');
  };

  return (
    <>
      <p className="cap">{t('int.tvNote')}</p>
      {/* Nói TRƯỚC, không chờ phát hiện: một iframe khác origin không cho
          đọc trạng thái tải, nên app không có cách nào biết TradingView bị
          chặn để mà báo. Tám ô xám im lặng trông y như "app hỏng" - đúng
          bẫy "chưa tải xong nhìn giống không có gì" mà repo này cấm. */}
      <p className="hint hint-warn">{t('int.tvBlocked')}</p>
      <p className="hint hint-warn">{t('int.tvFallback')}</p>

      {theme === null ? (
        <p className="cap">{t('int.loading')}</p>
      ) : (
        <div className="tvgrid">
          {BOXES.map((b, i) => {
            const src = b.sources.find((s) => s.id === chosen[b.key]) ?? b.sources[0];
            /* MỘT phần tử lưới cho mỗi ô: thẻ + hàng nút nằm CHUNG một khung.
               Bản đầu để hàng nút làm phần tử lưới riêng (Fragment) - lưới
               coi nó là một ô nữa, kéo nó cao bằng thẻ bên cạnh: tám ô thành
               mười lăm, nút cao 300px. Chỉ ảnh chụp thật mới thấy. */
            return (
              <div key={b.key} className="tvslot">
                {src.kind === 'app' ? (
                  <AppSlot load={load} series={src.series} label={b.label} t={t} badge={b.key === 'uvolDvol' ? ratioBadge : undefined} />
                ) : (
                  <div className="tvcard">
                    <p className="cap intlabel" style={b.key === 'uvolDvol' ? { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' } : undefined}>
                      <span>{b.label}</span>
                      {b.key === 'uvolDvol' && ratioBadge}
                    </p>
                    <iframe
                      /* `key` theo mã: đổi mã là dựng iframe MỚI chứ không đổi
                         `src` trên iframe cũ - widget giữ trạng thái của mã
                         trước (kể cả hộp thoại "chỉ có trên TradingView"). */
                      key={src.symbol}
                      className="tvframe"
                      title={`${b.label} — TradingView`}
                      src={embedUrl(src.symbol, b, theme, lang === 'vi' ? 'vi_VN' : 'en')}
                      /* Bốn ô đầu tải ngay, phần còn lại chờ cuộn tới. KHÁC
                         bẫy #133 (ảnh chân dung): ở đây không có nhánh dự
                         phòng nào bám vào sự kiện tải cả. */
                      loading={i < 4 ? 'eager' : 'lazy'}
                      referrerPolicy="no-referrer-when-downgrade"
                    />
                    {/* Dòng mã in dưới ô là DẤU HIỆU DUY NHẤT khi biểu đồ không
                        khớp với nhãn (widget lặng lẽ vẽ AAPL cho mã lạ). */}
                    <p className="cap intmeta">{src.symbol}</p>
                  </div>
                )}
                {b.sources.length > 1 && (
                  /* Chọn MỘT, nên KHÔNG dùng ChipRow (bộ nút chọn NHIỀU): hai
                     hàng nút trông giống nhau mà hành xử khác là đúng cái
                     ChipRow được tách ra để tránh. Dùng lại CSS `.chiprow`. */
                  <div className="chiprow tvchips" role="radiogroup" aria-label={t('int.tvPick')}>
                    {b.sources.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        role="radio"
                        aria-checked={s.id === src.id}
                        className={s.id === src.id ? 'on' : undefined}
                        onClick={() => choose(b, s.id)}
                      >
                        {srcLabel(s)}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      <p className="cap">{t('int.refNote')}</p>
    </>
  );
}
