'use client';

import { CAP_BUTTONS, type CapTier } from '@/lib/marketcap';
import { useLang } from '@/lib/i18n';

/**
 * Ba nút vốn hoá, dùng CHUNG cho tab Sell Put Screener và tab Đầu tư dài hạn.
 *
 * Một component chứ không phải hai bản chép: hai tab phải hiểu "mega" giống
 * hệt nhau, và mốc chia thì đã nằm chung ở `marketcap.ts` rồi - để nhãn và
 * cách bấm trôi lệch ra hai nơi là tự tạo cảnh hai tab vẽ cùng một bộ lọc
 * theo hai kiểu.
 *
 * CHỌN NHIỀU được, và cố ý KHÔNG dùng lại `.segmented`: cái đó là lưới hai
 * cột cho phép chọn MỘT (phạm vi quét), tô bằng `--ink`. Ở đây tô bằng
 * `--stamp` - đúng màu ô tích của chính app này - nên nhìn là biết đây là
 * kiểu điều khiển khác, chọn được nhiều.
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
  const toggle = (tier: CapTier) =>
    onChange(
      value.includes(tier) ? value.filter((v) => v !== tier) : [...value, tier]
    );

  return (
    <div className="field">
      <label>{t('cap.label')}</label>
      <div className="capchips">
        {CAP_BUTTONS.map((tier) => {
          const on = value.includes(tier);
          return (
            <button
              key={tier}
              type="button"
              /* aria-pressed, không phải aria-selected: đây là ba nút bật/tắt
                 độc lập, không phải một bộ chọn-một. */
              aria-pressed={on}
              className={on ? 'on' : undefined}
              onClick={() => toggle(tier)}
              disabled={disabled}
            >
              {t(`cap.${tier}`)}
            </button>
          );
        })}
      </div>
      {/* Nói ra cái mà màn hình không tự nói được: không bấm gì là KHÔNG lọc,
          chứ không phải "loại sạch". Thiếu câu này thì ba nút tối thui trông
          y hệt một bộ lọc đang chặn hết. */}
      <p className="hint">{value.length ? t('cap.some') : t('cap.none')}</p>
    </div>
  );
}
