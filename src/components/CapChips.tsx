'use client';

import { CAP_BUTTONS, type CapTier } from '@/lib/marketcap';
import { useLang } from '@/lib/i18n';
import ChipRow from './ChipRow';

/**
 * Ba nút vốn hoá, dùng CHUNG cho tab Sell Put Screener và tab Đầu tư dài hạn.
 *
 * Một component chứ không phải hai bản chép: hai tab phải hiểu "mega" giống
 * hệt nhau, và mốc chia thì đã nằm chung ở `marketcap.ts` rồi - để nhãn và
 * cách bấm trôi lệch ra hai nơi là tự tạo cảnh hai tab vẽ cùng một bộ lọc
 * theo hai kiểu. Cách bấm nằm ở `ChipRow`, dùng chung với bộ nút RRG.
 */
export default function CapChips({
  value,
  onChange,
  disabled,
}: {
  value: CapTier[];
  onChange: (next: CapTier[]) => void;
  disabled?: boolean;
}) {
  const { t } = useLang();
  return (
    <ChipRow
      label={t('cap.label')}
      /* Nói ra cái mà màn hình không tự nói được: không bấm gì là KHÔNG lọc,
         chứ không phải "loại sạch". Thiếu câu này thì ba nút tối thui trông
         y hệt một bộ lọc đang chặn hết. */
      note={value.length ? t('cap.some') : t('cap.none')}
      options={CAP_BUTTONS.map((tier) => ({ value: tier, label: t(`cap.${tier}`) }))}
      value={value}
      onChange={onChange}
      disabled={disabled}
    />
  );
}
