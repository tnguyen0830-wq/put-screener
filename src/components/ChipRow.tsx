'use client';

/**
 * Một hàng nút bật/tắt CHỌN NHIỀU được, dùng chung cho mọi bộ lọc kiểu "giữ
 * lại các nhóm đang sáng".
 *
 * Tách ra khi bộ lọc thứ hai (góc phần tư RRG) cần y hệt cách bấm của bộ nút
 * vốn hoá: hai hàng nút trông giống nhau mà hành xử lệch nhau - một bên nhớ
 * `aria-pressed`, một bên quên; một bên khoá lúc đang quét, một bên không -
 * là thứ người dùng phát hiện ra trước lập trình viên.
 *
 * Cố ý KHÔNG dùng lại `.segmented`: cái đó là lưới hai cột để chọn MỘT (phạm
 * vi quét), tô bằng `--ink`. Ở đây tô bằng `--stamp` - đúng màu ô tích của
 * chính app này - nên nhìn là biết đây là kiểu điều khiển khác, chọn được
 * nhiều.
 */
export default function ChipRow<T extends string>({
  label,
  note,
  options,
  value,
  onChange,
  disabled,
}: {
  label: string;
  /** Câu nói ra cái màn hình không tự nói được (đang lọc hay không lọc). */
  note: string;
  options: { value: T; label: string }[];
  value: T[];
  onChange: (next: T[]) => void;
  disabled?: boolean;
}) {
  const toggle = (v: T) =>
    onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);

  return (
    <div className="field">
      <label>{label}</label>
      <div className="chiprow">
        {options.map((o) => {
          const on = value.includes(o.value);
          return (
            <button
              key={o.value}
              type="button"
              /* aria-pressed, không phải aria-selected: đây là các nút bật/tắt
                 độc lập, không phải một bộ chọn-một. */
              aria-pressed={on}
              className={on ? 'on' : undefined}
              onClick={() => toggle(o.value)}
              disabled={disabled}
            >
              {o.label}
            </button>
          );
        })}
      </div>
      <p className="hint">{note}</p>
    </div>
  );
}
