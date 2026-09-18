'use client';

import { useEffect, useState } from 'react';
import { useLang } from '@/lib/i18n';
import { readRememberedOneOf, remember } from '@/lib/remember';

/**
 * Tám biểu đồ market internals nhúng từ TradingView - đúng bố cục trang
 * tapchiphowall.com mà chủ app đưa ảnh mẫu.
 *
 * ============================================================
 * VÌ SAO NHÚNG, TRONG KHI APP ĐÃ CÓ DỮ LIỆU SCHWAB
 * ============================================================
 *
 * #165 đo được: Schwab chỉ có nến trong ngày cho 4/8 chỉ báo, 3 chỉ báo
 * chỉ có SỐ HIỆN TẠI (không vẽ được đường), và 2 chỉ báo (NASDAQ
 * Advance-Decline, Put/Call Total) KHÔNG mã nào quote được. TradingView tự
 * tổng hợp cả họ mã `USI:*` nên có đủ cả 8 kèm lịch sử - đó là lý do trang
 * mẫu nhìn đầy đủ còn app thì không.
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
 * ĐÂY LÀ MỘT KHUNG HÌNH, KHÔNG PHẢI DỮ LIỆU CỦA APP
 * ============================================================
 *
 * App KHÔNG đọc được con số bên trong iframe. Nghĩa là không cảnh báo được,
 * không đưa vào "Hỏi Claude" được, không tính toán gì với nó - khác hẳn chế
 * độ "Số liệu app" bên cạnh, nơi mọi con số là của app và dùng được. Màn
 * hình phải nói ra điều đó, nếu không hai chế độ trông như nhau mà khả năng
 * lại khác hẳn.
 *
 * ============================================================
 * MÃ KHÔNG ĐO ĐƯỢC TỪ SANDBOX, NÊN NGƯỜI DÙNG ĐƯỢC ĐỔI MÃ NGAY TRÊN MÀN HÌNH
 * ============================================================
 *
 * `s.tradingview.com` bị proxy từ chối 403 ở CONNECT (đo lại 2026-09-18),
 * nên KHÔNG một chuỗi mã nào ở đây xác nhận được từ đây. Ba lần đo THẬT của
 * chủ app, mỗi lần một cách hỏng khác nhau, và cả ba đều KHÔNG phải "invalid
 * symbol" như bản đầu của file này khẳng định:
 *
 *   - `TVC:VIX` (#168): widget lặng lẽ vẽ biểu đồ APPLE - mã mặc định của
 *     chính nó - hoàn chỉnh, đúng theme, trông y như một ô đang chạy tốt.
 *   - `CBOE:VIX` (#173): widget NHẬN RA mã (tiêu đề in "CBOE:VIX · 5") rồi
 *     bật hộp thoại "Mã giao dịch này chỉ có trên TradingView" - dữ liệu
 *     CBOE bị giữ lại cho trang chính, widget nhúng không được vẽ.
 *   - `USI:UVOL-USI:DVOL` (phép trừ hai mã): vẽ được, nhưng KHÔNG xem được
 *     khung 1m/5m - biểu thức spread trong widget miễn phí không có nến
 *     trong ngày, mà trong ngày mới là toàn bộ lý do ô này tồn tại.
 *
 * Đúng cái bẫy "đoán sai ra một thứ sai trông y như thứ đúng" - và mỗi lần
 * đoán lại là một lượt deploy + một lượt chủ app chụp ảnh. Nên thay vì đoán
 * lần thứ tư, mỗi ô mang một DANH SÁCH mã ứng viên và một hàng nút để chủ
 * app tự đổi ngay trên màn hình; lựa chọn được nhớ theo từng ô
 * (`localStorage`, cùng cơ chế tab/ticker của #110). Phép đo diễn ra ở
 * đúng chỗ duy nhất đo được - trình duyệt của chủ app - và không tốn deploy.
 *
 * Thứ tự ứng viên là thứ tự KHẢ NĂNG, mã đầu là mặc định:
 *   - Chỉ báo hiệu số: TradingView có sẵn mã ĐƠN cho từng hiệu số
 *     (`USI:VOLD` = UVOL−DVOL, `USI:ADD` = ADV−DECL, `USI:ADDQ` bên
 *     NASDAQ) - một mã đơn có nến trong ngày như `USI:PCCE` đã đo được
 *     chạy tốt ở 5m; biểu thức trừ giữ lại làm đường lùi.
 *   - VIX: `TVC:VIX` bị loại (vẽ Apple), `CBOE:VIX` bị loại (chỉ trên
 *     TradingView); còn lại là các nguồn CFD/tổng hợp mà widget vẫn vẽ
 *     được ở nơi khác - chưa đo, nên đưa hết lên nút.
 *
 * Dòng mã in dưới mỗi ô là DẤU HIỆU DUY NHẤT khi biểu đồ không khớp với
 * nhãn: iframe khác origin không cho app tự so, nên app không thể tự đổi.
 */

type Panel = {
  key: string;
  label: string;
  /** Các cách viết mã, thứ tự khả năng; phần tử đầu là mặc định. */
  candidates: readonly string[];
  /** Phút mỗi nến. Ảnh mẫu dùng 15 cho UVOL-DVOL, 5 cho phần còn lại. */
  interval: string;
  /** Kiểu vẽ của TradingView: '1' nến, '2' đường. Ảnh mẫu vẽ nến cho
   *  TICK/UVOL-DVOL (thứ dao động hai chiều quanh 0) và đường cho các tỉ
   *  lệ. Con số này cũng CHƯA xác nhận - sai thì chỉ là vẽ sai kiểu, dữ
   *  liệu vẫn đúng. */
  style: string;
};

const PANELS: Panel[] = [
  { key: 'uvolDvol', label: 'NYSE UVOL − DVOL', candidates: ['USI:VOLD', 'USI:UVOL-USI:DVOL'], interval: '15', style: '1' },
  { key: 'advDecl', label: 'NYSE $ADV − $DECL', candidates: ['USI:ADD', 'USI:ADV-USI:DECL'], interval: '5', style: '2' },
  { key: 'advDeclQ', label: 'NASDAQ $ADVQ − $DECLQ', candidates: ['USI:ADDQ', 'USI:ADVQ-USI:DECLQ'], interval: '5', style: '2' },
  { key: 'pcc', label: 'Put/Call Ratio', candidates: ['USI:PCC'], interval: '5', style: '2' },
  { key: 'tick', label: 'NYSE TICK', candidates: ['USI:TICK'], interval: '5', style: '1' },
  { key: 'tickq', label: 'NASDAQ TICK', candidates: ['USI:TICKQ'], interval: '5', style: '1' },
  { key: 'vix', label: 'VIX', candidates: ['CAPITALCOM:VIX', 'FOREXCOM:VIX', 'SP:VIX', 'VIX'], interval: '5', style: '2' },
  { key: 'pcce', label: 'Put/Call Ratio (Equity)', candidates: ['USI:PCCE'], interval: '5', style: '2' },
];

function embedUrl(symbol: string, p: Panel, theme: 'light' | 'dark', locale: string): string {
  const q = new URLSearchParams({
    symbol,
    interval: p.interval,
    theme,
    style: p.style,
    locale,
    timezone: 'America/New_York',
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
 *
 * Không theo dõi thì đổi theme xong còn lại tám biểu đồ trắng toát nằm
 * trong một app nền đen cho tới khi tải lại trang.
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

/** Khoá nhớ theo từng ô - đổi mã ô VIX không được kéo ô khác theo. */
const rememberKey = (p: Panel) => `tvsym:${p.key}`;

/**
 * Mã đang chọn cho mỗi ô: mặc định là ứng viên đầu, đọc localStorage SAU
 * khi hydrate (cùng lý do `useResolvedTheme` trả null lúc đầu). Giá trị nhớ
 * chỉ được nhận nếu còn nằm trong danh sách ứng viên - một mã đã bị gỡ khỏi
 * danh sách ở bản sau (vì đo được là hỏng) mà vẫn lọt vào từ bộ nhớ cũ là
 * cái ô hỏng sống dậy sau chính bản vá gỡ nó.
 */
function useChosenSymbols() {
  const [chosen, setChosen] = useState<Record<string, string>>(() =>
    Object.fromEntries(PANELS.map((p) => [p.key, p.candidates[0]]))
  );

  useEffect(() => {
    setChosen((prev) => {
      const next = { ...prev };
      for (const p of PANELS) {
        const saved = readRememberedOneOf(rememberKey(p), p.candidates);
        if (saved) next[p.key] = saved;
      }
      return next;
    });
  }, []);

  const choose = (p: Panel, symbol: string) => {
    setChosen((prev) => ({ ...prev, [p.key]: symbol }));
    remember(rememberKey(p), symbol);
  };

  return { chosen, choose };
}

export default function TradingViewInternals() {
  const { t, lang } = useLang();
  const theme = useResolvedTheme();
  const { chosen, choose } = useChosenSymbols();

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
          {PANELS.map((p, i) => {
            const symbol = chosen[p.key];
            return (
              <div key={p.key} className="tvcard">
                <p className="cap intlabel">{p.label}</p>
                <iframe
                  /* `key` theo mã: đổi mã là dựng iframe MỚI chứ không đổi
                     `src` trên iframe cũ - widget giữ trạng thái của mã
                     trước (kể cả hộp thoại "chỉ có trên TradingView") khi
                     chỉ đổi src. */
                  key={symbol}
                  className="tvframe"
                  title={`${p.label} — TradingView`}
                  src={embedUrl(symbol, p, theme, lang === 'vi' ? 'vi_VN' : 'en')}
                  /* Tám biểu đồ TradingView là tám ứng dụng vẽ đồ thị đầy đủ -
                     nặng thật. Bốn ô đầu tải ngay, phần còn lại chờ cuộn tới.
                     KHÁC bẫy #133 (ảnh chân dung nghị sĩ): ở đó có một nhánh
                     dự phòng chỉ chạy khi ảnh lỗi, nên lazy làm nhánh đó không
                     bao giờ tới lượt; ở đây không có nhánh nào bám vào sự kiện
                     tải cả. */
                  loading={i < 4 ? 'eager' : 'lazy'}
                  referrerPolicy="no-referrer-when-downgrade"
                />
                {/* In chuỗi mã ra màn hình. Đây KHÔNG phải trang trí: mã
                    TradingView không nhận ra thì nó lặng lẽ vẽ AAPL thay vì
                    báo lỗi (đo được ở ô VIX), nên dòng này là thứ duy nhất
                    cho biết chính xác chuỗi nào đang chạy khi biểu đồ trong
                    khung không khớp với nhãn. */}
                <p className="cap intmeta">{symbol}</p>
                {p.candidates.length > 1 && (
                  /* Chọn MỘT, nên KHÔNG dùng ChipRow (bộ nút chọn NHIỀU): hai
                     hàng nút trông giống nhau mà một cái bật/tắt độc lập, một
                     cái loại trừ nhau là đúng cái ChipRow được tách ra để
                     tránh. Dùng lại CSS `.chiprow` cho đồng bộ hình thức. */
                  <div className="chiprow" role="radiogroup" aria-label={t('int.tvPick')}>
                    {p.candidates.map((c) => (
                      <button
                        key={c}
                        type="button"
                        role="radio"
                        aria-checked={c === symbol}
                        className={c === symbol ? 'on' : undefined}
                        onClick={() => choose(p, c)}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
