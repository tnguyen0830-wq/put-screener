'use client';

import { useEffect, useState } from 'react';

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
export function useResolvedTheme(): 'light' | 'dark' | null {
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
