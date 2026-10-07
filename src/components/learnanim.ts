/**
 * Thứ tự chuyển động của một hình Learn (#246).
 *
 * Hình được vẽ TĨNH bằng React (server render ra đúng hình cuối). Hàm này
 * chỉ gắn lớp + độ trễ lên các phần tử đã có, theo đúng thứ tự một người giải
 * thích trên bảng sẽ vẽ:
 *
 *   1. nến (`.lf-c`) hiện lần lượt từ trái sang phải;
 *   2. đường giá (polyline nét liền) tự vẽ, lần lượt nếu có nhiều đường —
 *      cờ: cột cờ → lá cờ → cú bung;
 *   3. đường biên / đường cổ / khung đánh dấu mẫu (mọi thứ nét đứt) hiện ra;
 *   4. hướng kỳ vọng sau khi phá (`.lf-tgt`) tự vẽ;
 *   5. chữ chú thích hiện cuối.
 *
 * Lớp `play` trên <svg> mới thật sự chạy animation (CSS trong globals.css),
 * nên trước khi `play` hình vẫn đứng yên ở trạng thái đầy đủ — không bao giờ
 * có lúc hình trống.
 *
 * Phần tử nằm trong `[data-noanim]` tự lo chuyển động của nó (cây nến hình
 * thành trong phiên) và chỉ nghe sự kiện `PLAY_EVENT`.
 */

export const PLAY_EVENT = 'lfplay';

const CANDLE_STEP = 150;
const CANDLE_TOTAL = 1800;
const DRAW_MS = 1100;
const TARGET_MS = 700;

/** Trả về true nếu hình có thứ gì để chạy (không thì khỏi hiện nút ↻). */
export function prepareFigure(svg: SVGSVGElement): boolean {
  const own = (e: Element) => !e.closest('[data-noanim]');
  const all = (sel: string) => Array.from(svg.querySelectorAll<SVGElement>(sel)).filter(own);
  const delay = (e: SVGElement, ms: number) => {
    e.style.animationDelay = `${Math.round(ms)}ms`;
  };

  const candles = all('.lf-c');
  const step = candles.length ? Math.min(CANDLE_STEP, CANDLE_TOTAL / candles.length) : 0;
  candles.forEach((c, i) => delay(c, i * step));
  let t = candles.length ? candles.length * step + 200 : 0;

  const draws = all('polyline').filter((e) => !e.hasAttribute('stroke-dasharray') && !e.closest('.lf-c') && !e.classList.contains('lf-tgt'));
  draws.forEach((d, i) => {
    d.setAttribute('pathLength', '1');
    d.classList.add('lf-draw');
    d.style.setProperty('--lfdur', `${DRAW_MS}ms`);
    delay(d, t + i * DRAW_MS * 0.85);
  });
  if (draws.length) t += (draws.length - 1) * DRAW_MS * 0.85 + DRAW_MS;

  const live = !!svg.querySelector('[data-noanim]');
  if (!candles.length && !draws.length) return live;

  const dashed = all('[stroke-dasharray]').filter((e) => !e.classList.contains('lf-draw') && !e.closest('.lf-c'));
  dashed.forEach((e) => {
    e.classList.add('lf-fade');
    delay(e, t);
  });
  if (dashed.length) t += 400;

  const targets = all('.lf-tgt');
  targets.forEach((e) => {
    e.setAttribute('pathLength', '1');
    e.classList.add('lf-draw');
    e.style.setProperty('--lfdur', `${TARGET_MS}ms`);
    delay(e, t);
  });
  if (targets.length) t += TARGET_MS;

  all('text').forEach((e) => {
    e.classList.add('lf-fade');
    delay(e, t);
  });
  return true;
}
