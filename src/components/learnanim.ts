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
 * thành trong phiên) và chỉ nghe hai sự kiện `PLAY_EVENT` / `STOP_EVENT`.
 *
 * Nút ▶ Phát chạy lặp (#247), nên hàm trả về TỔNG thời gian một lượt để
 * LearnFigure biết lúc nào bắt đầu lượt kế; 0 nghĩa là hình không có gì để
 * chạy và không hiện nút.
 */

export const PLAY_EVENT = 'lfplay';
/** Dừng: cây nến trong phiên nhảy về trạng thái cuối (hình đầy đủ). */
export const STOP_EVENT = 'lfstop';

/** Cây nến trong phiên: số nhịp giá và độ dài mỗi nhịp — dùng chung với
 *  LearnFigureExtra để thời lượng một lượt tính ở đây không lệch với thật. */
export const LIVE_STEPS = 64;
export const LIVE_TICK_MS = 60;

const CANDLE_STEP = 150;
const CANDLE_TOTAL = 1800;
const DRAW_MS = 1100;
const TARGET_MS = 700;
const POP_MS = 320;
const FADE_MS = 450;

/** Gắn lớp + độ trễ; trả về số mili-giây một lượt chạy (0 = không có gì để chạy). */
export function prepareFigure(svg: SVGSVGElement): number {
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

  const live = svg.querySelector('[data-noanim]') ? LIVE_STEPS * LIVE_TICK_MS : 0;
  if (!candles.length && !draws.length) return live;
  let end = Math.max(live, candles.length ? (candles.length - 1) * step + POP_MS : 0, t);

  const dashed = all('[stroke-dasharray]').filter((e) => !e.classList.contains('lf-draw') && !e.closest('.lf-c'));
  dashed.forEach((e) => {
    e.classList.add('lf-fade');
    delay(e, t);
  });
  if (dashed.length) {
    end = Math.max(end, t + FADE_MS);
    t += 400;
  }

  const targets = all('.lf-tgt');
  targets.forEach((e) => {
    e.setAttribute('pathLength', '1');
    e.classList.add('lf-draw');
    e.style.setProperty('--lfdur', `${TARGET_MS}ms`);
    delay(e, t);
  });
  if (targets.length) t += TARGET_MS;

  end = Math.max(end, t);

  const texts = all('text');
  texts.forEach((e) => {
    e.classList.add('lf-fade');
    delay(e, t);
  });
  if (texts.length) end = Math.max(end, t + FADE_MS);
  return Math.round(end);
}
