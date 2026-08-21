/**
 * Chú giải màu số liệu.
 *
 * Cần thiết vì trong công cụ tài chính, xanh và đỏ rất dễ bị hiểu thành "nên
 * mua / nên tránh". Ở đây chúng chỉ nói hướng đi của con số; phần đáng lưu ý
 * dùng màu vàng riêng để không lẫn với đỏ.
 */
export default function ColorLegend() {
  return (
    <div className="legend" aria-label="Quy ước màu số liệu">
      <span>
        <i className="k-good" />
        <b>Lên / trên mốc</b>
      </span>
      <span>
        <i className="k-bad" />
        <b>Xuống / dưới mốc</b>
      </span>
      <span>
        <i className="k-warn" />
        <b>Cần chú ý</b>
      </span>
      <span>Số không màu là dữ kiện thuần — màu chỉ hướng, không phải khuyến nghị.</span>
    </div>
  );
}
