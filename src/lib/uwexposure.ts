/**
 * Số phơi nhiễm do CHÍNH Unusual Whales tính, để đặt SONG SONG với số app tự
 * tính trong tab MM Exposure.
 *
 * Chủ app chọn điều này sau khi biết tab lấy dữ liệu từ đâu: *"hiện song song
 * cả hai"*. Đây KHÔNG phải một đường tính thứ hai cho cùng con số — app vẫn
 * tự tính một mình từ chuỗi (`mmexposure.ts`); file này chỉ ĐỌC con số UW đã
 * tính sẵn và đưa nó lên màn hình cạnh con số của app, mỗi bên một thang.
 * Chính cái đặt cạnh nhau mới là tính năng: một lần so tay với trang ngoài đã
 * bắt được lỗi định nghĩa tường GEX (#94), còn đặt thường trực trên màn hình
 * thì lần lệch sau tự lộ ra.
 *
 * Tên trường là ĐO ĐƯỢC (probe production 2026-09-22, SPX + SPY), không nhớ:
 *
 *   `spot-exposures/strike` — 50 strike quanh giá, mọi giá trị là CHUỖI,
 *     `call_gamma_oi`/`put_gamma_oi`, `call_gamma_vol`/`put_gamma_vol`,
 *     `call_delta_oi`/`put_delta_oi`, cộng `price` (spot), `time`, `date`.
 *     Đủ cho panel 1 (cơ sở OI) VÀ panel 2 (hai cơ sở) trong MỘT request.
 *
 *   `greek-exposure/strike-expiry` — `expiry`, `strike`, `dte`,
 *     `call_delta`/`put_delta`, `call_gex`/`put_gex`. Probe gọi KHÔNG tham
 *     số và nhận 264 hàng của đúng MỘT kỳ (kỳ gần nhất). Tham số chọn kỳ
 *     (`expiry`) là NHỚ ĐƯỢC chứ chưa đo — nên hàng trả về được KIỂM theo
 *     trường `expiry` của chính nó, và kỳ lệch thì KHÔNG vẽ (xem dưới).
 *
 * Ba luật, mỗi cái là một chỗ "thà không nói còn hơn nói sai":
 *
 * 1. **KHÔNG đổi dấu gì cả.** UW đã áp quy ước dealer sẵn — `put_gamma_*` về
 *    ÂM (đo được: `put_gamma_vol` = −69.219.368 ở strike 7525). `mmexposure.ts`
 *    tự đổi dấu put của CHÍNH NÓ; áp phép đổi đó lên số UW là lật ngược biểu
 *    đồ mà trông vẫn hoàn toàn bình thường. Nên số UW đi thẳng, và để phòng
 *    UW đổi quy ước không báo, `putGammaPositive` ĐẾM số strike put dương và
 *    màn hình nói ra khi khác 0 — một quy ước khác đo được hôm đó.
 *
 * 2. **Thiếu một phía thì bỏ HÀNG, không điền 0.** Một strike có call mà
 *    không có put trên một cơ sở thì gamma ròng của nó là không biết, không
 *    phải bằng call. Hàng bị bỏ khỏi CƠ SỞ đó và được đếm.
 *
 * 3. **Kỳ lệch thì không vẽ.** Nếu UW bỏ qua `expiry` và trả kỳ khác, vẽ nó
 *    cạnh kỳ app đang chọn là so hai kỳ khác nhau dưới cùng một tiêu đề —
 *    con số sai mà trông y hệt đúng. `returned` mang các kỳ UW thật sự trả
 *    để màn hình in ra, đúng idiom probe.
 *
 * Chỉ import KIỂU, nên biên dịch và `require()` đứng riêng được để test.
 */
import type { ExposureBar } from './mmexposure';

/** Đọc số chịu được chuỗi (mọi giá trị UW ở đây là chuỗi). Chuỗi rỗng là
 *  null chứ không phải 0 — `Number('')` là 0 và trông y hệt số thật. */
export function num(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string') {
    const s = v.trim();
    if (!s) return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** Payload có hàng mà không bóc được hàng nào — mang khoá THẬT để màn hình
 *  in ra, thay vì một biểu đồ rỗng đọc thành "UW không có gì". */
export class UwShapeError extends Error {
  constructor(message: string, readonly keys: string[]) {
    super(`${message} · khoá: [${keys.slice(0, 16).join(',')}]`);
    this.name = 'UwShapeError';
  }
}

function rowsOf(payload: any): any[] {
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload)) return payload;
  return [];
}

function keysOf(payload: any, rows: any[]): string[] {
  if (rows[0] && typeof rows[0] === 'object') return Object.keys(rows[0]);
  return payload && typeof payload === 'object' ? Object.keys(payload) : [];
}

export type UwGammaSide = {
  /** Cơ sở open interest — cho panel 1 và nửa OI của panel 2. */
  oi: ExposureBar[];
  /** Cơ sở khối lượng hôm nay — nửa kia của panel 2. */
  volume: ExposureBar[];
  /** Spot UW dùng lúc tính (trường `price`), null nếu không có. */
  price: number | null;
  /** Mốc thời gian UW ghi trên bản tính, nguyên văn. */
  time: string | null;
  rows: number;
  /** Hàng bị bỏ khỏi một cơ sở vì thiếu call hoặc put — luật 2. */
  droppedOi: number;
  droppedVolume: number;
  /** Strike có put gamma DƯƠNG — xem luật 1. */
  putGammaPositive: number;
};

/** `spot-exposures/strike` → hai cơ sở gamma theo strike. */
export function parseSpotStrike(payload: any): UwGammaSide {
  const rows = rowsOf(payload);
  const oi: ExposureBar[] = [];
  const volume: ExposureBar[] = [];
  let price: number | null = null;
  let time: string | null = null;
  let droppedOi = 0;
  let droppedVolume = 0;
  let putGammaPositive = 0;

  for (const r of rows) {
    const strike = num(r?.strike);
    if (strike === null) continue;
    if (price === null) price = num(r?.price);
    if (time === null && (r?.time || r?.date)) time = String(r.time ?? r.date);

    const cdo = num(r?.call_delta_oi) ?? 0;
    const pdo = num(r?.put_delta_oi) ?? 0;

    const cgo = num(r?.call_gamma_oi);
    const pgo = num(r?.put_gamma_oi);
    if (cgo !== null && pgo !== null) {
      if (pgo > 0) putGammaPositive++;
      oi.push({
        strike,
        callGamma: cgo,
        putGamma: pgo,
        netGamma: cgo + pgo,
        callDelta: cdo,
        putDelta: pdo,
        netDelta: cdo + pdo,
      });
    } else {
      droppedOi++;
    }

    const cgv = num(r?.call_gamma_vol);
    const pgv = num(r?.put_gamma_vol);
    if (cgv !== null && pgv !== null) {
      volume.push({
        strike,
        callGamma: cgv,
        putGamma: pgv,
        netGamma: cgv + pgv,
        callDelta: 0,
        putDelta: 0,
        netDelta: 0,
      });
    } else {
      droppedVolume++;
    }
  }

  if (rows.length && !oi.length && !volume.length) {
    throw new UwShapeError(
      `UW spot-exposures/strike trả ${rows.length} hàng nhưng không bóc được hàng nào`,
      keysOf(payload, rows)
    );
  }
  const byStrike = (a: ExposureBar, b: ExposureBar) => a.strike - b.strike;
  oi.sort(byStrike);
  volume.sort(byStrike);
  return {
    oi,
    volume,
    price,
    time,
    rows: rows.length,
    droppedOi,
    droppedVolume,
    putGammaPositive,
  };
}

export type UwDeltaSide = {
  /** Chỉ các hàng ĐÚNG kỳ đã hỏi — rỗng khi UW trả kỳ khác (luật 3). */
  strikes: ExposureBar[];
  asked: string;
  /** Mọi kỳ UW thật sự trả, để màn hình in ra khi lệch. */
  returned: string[];
  rows: number;
  /** Strike có put delta DƯƠNG — put mang delta âm, dương là quy ước lạ. */
  putDeltaPositive: number;
};

/** `greek-exposure/strike-expiry` → delta theo strike cho ĐÚNG một kỳ. */
export function parseStrikeExpiry(payload: any, asked: string): UwDeltaSide {
  const rows = rowsOf(payload);
  const returned = new Set<string>();
  const strikes: ExposureBar[] = [];
  let parsed = 0;
  let putDeltaPositive = 0;

  for (const r of rows) {
    const strike = num(r?.strike);
    const cd = num(r?.call_delta);
    const pd = num(r?.put_delta);
    if (strike === null || cd === null || pd === null) continue;
    parsed++;
    const exp = typeof r?.expiry === 'string' ? r.expiry.slice(0, 10) : '';
    if (exp) returned.add(exp);
    if (exp !== asked) continue;
    if (pd > 0) putDeltaPositive++;
    const cg = num(r?.call_gex) ?? 0;
    const pg = num(r?.put_gex) ?? 0;
    strikes.push({
      strike,
      callGamma: cg,
      putGamma: pg,
      netGamma: cg + pg,
      callDelta: cd,
      putDelta: pd,
      netDelta: cd + pd,
    });
  }

  if (rows.length && !parsed) {
    throw new UwShapeError(
      `UW greek-exposure/strike-expiry trả ${rows.length} hàng nhưng không bóc được hàng nào`,
      keysOf(payload, rows)
    );
  }
  strikes.sort((a, b) => a.strike - b.strike);
  return { strikes, asked, returned: [...returned].sort(), rows: rows.length, putDeltaPositive };
}
