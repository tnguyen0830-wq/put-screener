'use client';

import { useEffect, useState } from 'react';
import { useLang } from '@/lib/i18n';

export type Theme = 'light' | 'dark' | 'system';

const KEY = 'put-screener-theme';

/** Theme đang thực sự hiển thị, sau khi đã giải nghĩa 'system'. */
export function resolveTheme(t: Theme): 'light' | 'dark' {
  if (t !== 'system') return t;
  return typeof window !== 'undefined' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

function apply(t: Theme) {
  const root = document.documentElement;

  // Chrome không khởi động lại một transition khi giá trị của nó đến từ biến CSS
  // vừa đổi — thuộc tính sẽ kẹt ở màu cũ dù biến đã mới. Tắt transition trong
  // đúng khung hình đổi theme rồi bật lại ngay sau đó.
  root.classList.add('theme-switching');

  // Bỏ hẳn thuộc tính khi chọn 'system' để @media prefers-color-scheme giành lại
  // quyền quyết định; để nguyên giá trị cũ sẽ khoá cứng theme.
  if (t === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', t);

  // Đọc một thuộc tính layout để ép trình duyệt tính lại style ngay, trước khi
  // gỡ lớp chặn; nếu không thì cả hai thay đổi gộp vào một lần tính và vô hiệu.
  void root.offsetHeight;
  requestAnimationFrame(() => root.classList.remove('theme-switching'));
  try {
    localStorage.setItem(KEY, t);
  } catch {
    /* chế độ riêng tư chặn localStorage: cứ chạy, chỉ là không nhớ được */
  }
}

/**
 * Script chạy trước khi React dựng cây, nhét thẳng vào <head>.
 *
 * Không có nó thì trang luôn vẽ theme sáng trước rồi mới nhảy sang tối khi
 * JavaScript của React chạy — thấy rõ một nháy trắng. Đoạn này đồng bộ nên
 * thuộc tính data-theme có mặt ngay từ khung hình đầu tiên.
 */
export const themeBootScript = `
(function () {
  try {
    var t = localStorage.getItem('${KEY}');
    if (t === 'light' || t === 'dark') {
      document.documentElement.setAttribute('data-theme', t);
    }
  } catch (e) {}
})();
`;

const ORDER: Theme[] = ['light', 'dark', 'system'];
const ICON: Record<Theme, string> = { light: '☀', dark: '☾', system: '◐' };

export default function ThemeToggle() {
  // Khởi tạo bằng 'system' để lần render đầu ở server và ở client khớp nhau;
  // giá trị thật đọc từ localStorage sau khi mount.
  const { t } = useLang();
  const [theme, setTheme] = useState<Theme>('system');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let saved: Theme = 'system';
    try {
      const raw = localStorage.getItem(KEY);
      if (raw === 'light' || raw === 'dark' || raw === 'system') saved = raw;
    } catch {
      /* bỏ qua */
    }
    setTheme(saved);
    apply(saved);
    setReady(true);
  }, []);

  const cycle = () => {
    const next = ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length];
    setTheme(next);
    apply(next);
  };

  const label = t(`theme.${theme}`);

  return (
    <button
      className="themetoggle"
      onClick={cycle}
      title={t('theme.cycle')}
      aria-label={t('theme.aria', label)}
      // Trước khi đọc xong localStorage thì ẩn chữ đi để không nháy sai nhãn.
      style={{ visibility: ready ? 'visible' : 'hidden' }}
    >
      <span className="tico" aria-hidden="true">
        {ICON[theme]}
      </span>
      {label}
    </button>
  );
}
