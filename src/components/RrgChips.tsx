'use client';

import type { Quadrant } from '@/lib/rrg';
import { useLang } from '@/lib/i18n';
import ChipRow from './ChipRow';

/** Thứ tự theo chiều xoay của RRG: tụt lại → đang hồi → dẫn đầu → đuối dần. */
export const QUADRANTS: Quadrant[] = ['lagging', 'improving', 'leading', 'weakening'];

/**
 * Bốn nút góc phần tư RRG cho tab Đầu tư dài hạn.
 *
 * Nhãn dùng lại đúng khoá `rrg.q.*` mà biểu đồ bên tab Heatmap đang dùng: một
 * bộ chữ thứ hai cho cùng bốn góc là cách chắc chắn để hai tab gọi cùng một
 * thứ bằng hai cái tên.
 */
export default function RrgChips({
  value,
  onChange,
  disabled,
}: {
  value: Quadrant[];
  onChange: (next: Quadrant[]) => void;
  disabled?: boolean;
}) {
  const { t } = useLang();
  return (
    <ChipRow
      label={t('rrgf.label')}
      note={value.length ? t('rrgf.some') : t('rrgf.none')}
      options={QUADRANTS.map((q) => ({ value: q, label: t(`rrg.q.${q}`) }))}
      value={value}
      onChange={onChange}
      disabled={disabled}
    />
  );
}
