import { uwConfigured, uwGet, UwError } from './unusualwhales';
import { uwTicker } from './uwgex';
import { parseSpotStrike, parseStrikeExpiry, type UwDeltaSide, type UwGammaSide } from './uwexposure';

/**
 * Lấy số phơi nhiễm UW tự tính cho tab MM Exposure — xem đầu `uwexposure.ts`.
 *
 * Chi phí là nửa còn lại của thiết kế. Panel tự làm mới mỗi 60 giây, và một
 * lượt so tốn HAI request; không cache là ~780 request mỗi 6,5 giờ phiên cho
 * MỘT tab mở — đúng hình dạng #78. Cache **120 giây** là con số của
 * `fetchUwChain` với cùng lý do: gamma = greek × open interest, mà OI chỉ đổi
 * một lần mỗi ngày; 2 phút vẫn tươi hơn CBOE gần tám lần.
 *
 * Hai request đi LẦN LƯỢT, không song song: trần 3 request đồng thời là của
 * CẢ TÀI KHOẢN (đo được, #209), chuỗi UW của thang GEX có thể đang giữ hai
 * suất, và vòng lặp cảnh báo nền có thể giữ suất thứ ba. Một cái 429 ở đây
 * sẽ đọc y hệt "UW không có dữ liệu" nếu không nói ra — nên mỗi nửa hỏng ĐỘC
 * LẬP và mang nguyên văn lời UW.
 *
 * Cache nằm trong RAM của MỘT route bundle (`/api/daytrade/exposure/uw`) —
 * đúng chỗ nó đúng: chỉ một route dùng (#193).
 */

const TTL_MS = 120_000;

type Half<T> = { ok: true; value: T; at: number } | { ok: false; error: string; at: number };

const gammaCache = new Map<string, Half<UwGammaSide>>();
const deltaCache = new Map<string, Half<UwDeltaSide>>();

/** Lỗi UW thành MỘT dòng đọc được: mã trạng thái trước (cú cắt không được ăn
 *  mất nó — #102), rồi nguyên văn thân. Khoá API đi trong header nên không
 *  bao giờ có trong chuỗi này. */
function describe(e: unknown): string {
  if (e instanceof UwError) {
    const body = e.body ? ` · ${e.body.replace(/\s+/g, ' ').slice(0, 180)}` : '';
    return `${e.status ?? '—'} ${e.message}${body}`;
  }
  return String((e as any)?.message ?? e).slice(0, 240);
}

async function cached<T>(
  store: Map<string, Half<T>>,
  key: string,
  run: () => Promise<T>
): Promise<Half<T>> {
  const hit = store.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit;
  let out: Half<T>;
  try {
    out = { ok: true, value: await run(), at: Date.now() };
  } catch (e) {
    out = { ok: false, error: describe(e), at: Date.now() };
  }
  // Lỗi cũng được cache 120 giây: bấm lại mỗi phút một endpoint đang 429
  // chỉ đẩy thêm request vào đúng cái trần đang chặn mình.
  store.set(key, out);
  return out;
}

export type UwExposureResult =
  | { configured: false }
  | {
      configured: true;
      ticker: string;
      gamma: Half<UwGammaSide>;
      /** null khi client chưa có kỳ nào để hỏi. */
      delta: Half<UwDeltaSide> | null;
    };

export async function loadUwExposure(
  symbol: string,
  expiration: string | null
): Promise<UwExposureResult> {
  if (!uwConfigured()) return { configured: false };
  const ticker = uwTicker(symbol);

  const gamma = await cached(gammaCache, ticker, async () =>
    parseSpotStrike(await uwGet(`/api/stock/${encodeURIComponent(ticker)}/spot-exposures/strike`))
  );

  const delta = expiration
    ? await cached(deltaCache, `${ticker}:${expiration}`, async () =>
        parseStrikeExpiry(
          await uwGet(`/api/stock/${encodeURIComponent(ticker)}/greek-exposure/strike-expiry`, {
            expiry: expiration,
          }),
          expiration
        )
      )
    : null;

  return { configured: true, ticker, gamma, delta };
}

export function _resetUwExposureCache(): void {
  gammaCache.clear();
  deltaCache.clear();
}
