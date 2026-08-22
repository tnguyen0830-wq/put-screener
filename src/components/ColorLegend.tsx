/**
 * Chú giải màu số liệu.
 *
 * Cần thiết vì trong công cụ tài chính, xanh và đỏ rất dễ bị hiểu thành "nên
 * mua / nên tránh". Ở đây chúng chỉ nói hướng đi của con số; phần đáng lưu ý
 * dùng màu vàng riêng để không lẫn với đỏ.
 */
'use client';

import { useLang } from '@/lib/i18n';

export default function ColorLegend() {
  const { t } = useLang();

  return (
    <div className="legend" aria-label={t('legend.aria')}>
      <span>
        <i className="k-good" />
        <b>{t('legend.good')}</b>
      </span>
      <span>
        <i className="k-bad" />
        <b>{t('legend.bad')}</b>
      </span>
      <span>
        <i className="k-warn" />
        <b>{t('legend.warn')}</b>
      </span>
      <span>{t('legend.note')}</span>
    </div>
  );
}
