'use client';

import { useEffect, useState } from 'react';
import { useLang } from '@/lib/i18n';

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
 * MÃ CHƯA XÁC NHẬN - NHƯNG HỎNG THÌ HỎNG TO, KHÔNG HỎNG THẦM
 * ============================================================
 *
 * Các chuỗi `USI:*` dưới đây đọc từ chính tiêu đề trong ảnh mẫu, CHƯA gọi
 * thử được từ sandbox (không có mạng). Khác với đoán tên trường của một API
 * JSON - chỗ đó đoán sai ra một con số sai trông y như số đúng - ở đây mã
 * sai thì TradingView tự in "invalid symbol" NGAY TRONG khung, nhìn là
 * thấy. Mỗi ô còn in luôn chuỗi mã của nó, nên nếu ô nào hỏng thì chủ app
 * đọc đúng chuỗi cần sửa cho tôi, không phải mò.
 */

type Panel = {
  key: string;
  label: string;
  symbol: string;
  /** Phút mỗi nến. Ảnh mẫu dùng 15 cho UVOL-DVOL, 5 cho phần còn lại. */
  interval: string;
  /** Kiểu vẽ của TradingView: '1' nến, '2' đường. Ảnh mẫu vẽ nến cho
   *  TICK/UVOL-DVOL (thứ dao động hai chiều quanh 0) và đường cho các tỉ
   *  lệ. Con số này cũng CHƯA xác nhận - sai thì chỉ là vẽ sai kiểu, dữ
   *  liệu vẫn đúng. */
  style: string;
};

const PANELS: Panel[] = [
  { key: 'uvolDvol', label: 'NYSE UVOL − DVOL', symbol: 'USI:UVOL-USI:DVOL', interval: '15', style: '1' },
  { key: 'advDecl', label: 'NYSE $ADV − $DECL', symbol: 'USI:ADV-USI:DECL', interval: '5', style: '2' },
  { key: 'advDeclQ', label: 'NASDAQ $ADVQ − $DECLQ', symbol: 'USI:ADVQ-USI:DECLQ', interval: '5', style: '2' },
  { key: 'pcc', label: 'Put/Call Ratio', symbol: 'USI:PCC', interval: '5', style: '2' },
  { key: 'tick', label: 'NYSE TICK', symbol: 'USI:TICK', interval: '5', style: '1' },
  { key: 'tickq', label: 'NASDAQ TICK', symbol: 'USI:TICKQ', interval: '5', style: '1' },
  { key: 'vix', label: 'VIX', symbol: 'TVC:VIX', interval: '5', style: '2' },
  { key: 'pcce', label: 'Put/Call Ratio (Equity)', symbol: 'USI:PCCE', interval: '5', style: '2' },
];

function embedUrl(p: Panel, theme: 'light' | 'dark', locale: string): string {
  const q = new URLSearchParams({
    symbol: p.symbol,
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

export default function TradingViewInternals() {
  const { t, lang } = useLang();
  const theme = useResolvedTheme();

  return (
    <>
      <p className="cap">{t('int.tvNote')}</p>
      {/* Nói TRƯỚC, không chờ phát hiện: một iframe khác origin không cho
          đọc trạng thái tải, nên app không có cách nào biết TradingView bị
          chặn để mà báo. Tám ô xám im lặng trông y như "app hỏng" - đúng
          bẫy "chưa tải xong nhìn giống không có gì" mà repo này cấm. */}
      <p className="hint hint-warn">{t('int.tvBlocked')}</p>

      {theme === null ? (
        <p className="cap">{t('int.loading')}</p>
      ) : (
        <div className="tvgrid">
          {PANELS.map((p, i) => (
            <div key={p.key} className="tvcard">
              <p className="cap intlabel">{p.label}</p>
              <iframe
                className="tvframe"
                title={`${p.label} — TradingView`}
                src={embedUrl(p, theme, lang === 'vi' ? 'vi_VN' : 'en')}
                /* Tám biểu đồ TradingView là tám ứng dụng vẽ đồ thị đầy đủ -
                   nặng thật. Bốn ô đầu tải ngay, phần còn lại chờ cuộn tới.
                   KHÁC bẫy #133 (ảnh chân dung nghị sĩ): ở đó có một nhánh
                   dự phòng chỉ chạy khi ảnh lỗi, nên lazy làm nhánh đó không
                   bao giờ tới lượt; ở đây không có nhánh nào bám vào sự kiện
                   tải cả. */
                loading={i < 4 ? 'eager' : 'lazy'}
                referrerPolicy="no-referrer-when-downgrade"
              />
              {/* In chuỗi mã ra màn hình: ô nào TradingView không nhận ra sẽ
                  tự báo "invalid symbol" bên trong khung, và dòng này cho
                  biết chính xác chuỗi nào cần sửa. */}
              <p className="cap intmeta">{p.symbol}</p>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
