/**
 * Phơi nhiễm của nhà tạo lập theo TỪNG STRIKE — gamma và delta, trên hai
 * cơ sở (open interest và khối lượng hôm nay).
 *
 * Vì sao có file này khi đã có `gex.ts`: `computeGex()` trả về đúng thứ nó
 * sinh ra để trả — gamma theo OI, cộng ba mức tường. Ba panel kiểu Unusual
 * Whales mà chủ app đặt hàng cần thêm hai thứ nữa mà `collect()` bên đó CỐ Ý
 * vứt bỏ: **delta** và **khối lượng**. Nên đây là một bộ gom RỘNG HƠN trên
 * cùng một chuỗi, không phải một đường tính thứ hai cho cùng một con số —
 * và để điều đó không trôi lệch, một test ghim rằng gamma trên cơ sở OI của
 * file này KHỚP TỪNG STRIKE với `computeGex()` (bài học #96/#99/#147).
 *
 * Không import gì cả, nên biên dịch và `require()` đứng một mình để test —
 * cùng luật với `daytrade.ts`/`zerodte.ts`.
 *
 * SÁU quyết định, mỗi cái là một chỗ "thà không nói còn hơn nói sai":
 *
 * 1. **Đơn vị gamma y HỆT `computeGex()`**: `spot² × 0,01 × 100` = đô-la
 *    delta cho một bước dịch 1%. Chép một công thức thứ hai vào đây là hai
 *    con số sẽ cãi nhau trên hai màn hình cạnh nhau.
 *
 * 2. **Hai cơ sở, và cơ sở KHỐI LƯỢNG không được loại hợp đồng.** Một hợp
 *    đồng có OI mà hôm nay chưa ai giao dịch phải đóng góp **0** trên cơ sở
 *    khối lượng, chứ không bị bỏ khỏi bảng: loại nó đi làm biểu đồ khối
 *    lượng co lại hẹp hơn thật mà không có gì nói ra. `collect()` của
 *    `gex.ts` bỏ hợp đồng `!oi` — đúng cho GEX, sai cho bảng này.
 *
 * 3. **Delta ở đây là delta theo OPEN INTEREST, KHÔNG quy ước theo phía nhà
 *    tạo lập.** Put có delta ÂM sẵn, nên cột put tự nằm bên trái. Nếu đổi
 *    dấu theo quy ước "dealer long call, short put" như gamma thì biểu đồ
 *    lật NGƯỢC mà trông vẫn bình thường — đúng loại con số sai không ai
 *    phát hiện. Màn hình phải gọi đúng tên nó.
 *
 * 4. **`cboeToChain()` ép `delta` thiếu thành 0**, nên trên đường CBOE
 *    "không có delta" và "delta bằng 0" KHÔNG phân biệt được nữa. Không giả
 *    vờ: `diagnosis.deltaZero` đếm riêng số hợp đồng delta đúng bằng 0 để
 *    chủ app tự đọc, thay vì app khẳng định một điều nó không biết.
 *
 * 5. **Cửa sổ quanh giá.** Chuỗi SPX trải từ strike 200 tới 8000; vẽ hết thì
 *    mấy cột gần tiền — phần duy nhất có nghĩa — mảnh như sợi chỉ. `window()`
 *    cắt theo phần trăm quanh spot nhưng LUÔN giữ tối thiểu một số strike,
 *    nên một mã có ít strike không bao giờ ra biểu đồ rỗng.
 *
 * 6. **Sentinel −999 của Schwab** (greek không có) bị loại y như `gex.ts`,
 *    cho CẢ gamma LẪN delta. Nó là số hữu hạn nên mọi phép kiểm ngây thơ đều
 *    cho nó đi qua, rồi nó được cộng vào như một greek thật.
 */

export type Basis = 'oi' | 'volume';

export type StrikeExposure = {
  strike: number;
  /** Đô-la gamma cho bước dịch 1%, quy ước dealer: call dương, put âm. */
  callGamma: number;
  putGamma: number;
  netGamma: number;
  /** Delta theo open interest (hoặc khối lượng), KHÔNG quy ước dealer.
   *  Put mang dấu âm sẵn từ chính chuỗi. */
  callDelta: number;
  putDelta: number;
  netDelta: number;
  callOi: number;
  putOi: number;
  callVolume: number;
  putVolume: number;
};

export type ExposureDiagnosis = {
  contracts: number;
  used: number;
  droppedNoGamma: number;
  droppedSentinel: number;
  droppedNoStrike: number;
  /** Hợp đồng có gamma hợp lệ nhưng KHÔNG có delta đọc được. */
  noDelta: number;
  /** Delta đúng bằng 0 — xem quyết định 4 ở đầu file. */
  deltaZero: number;
  withOi: number;
  withVolume: number;
  sample: Record<string, unknown> | null;
};

export type ExposureProfile = {
  symbol: string;
  spot: number;
  basis: Basis;
  /** Mọi kỳ đáo hạn CÓ TRONG CHUỖI, kể cả khi đang lọc còn một kỳ. */
  expirations: string[];
  /** Kỳ đang lọc, null = gộp tất cả. */
  expiration: string | null;
  strikes: StrikeExposure[];
  totalGamma: number;
  totalDelta: number;
  diagnosis: ExposureDiagnosis;
};

const SENTINEL = -999;

/** Đọc số chịu được chuỗi. `Number.isFinite('0.4')` là false, và tin vào nó
 *  đã từng làm CẢ chuỗi câm lặng (#97). Chuỗi rỗng bị loại vì `Number('')`
 *  là 0 — một số 0 trông y như số thật. */
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

/** Greek dùng được, hoặc null. Sentinel −999 của Schwab nghĩa là "không có". */
export function greek(v: unknown): number | null {
  const n = num(v);
  if (n === null || n === SENTINEL) return null;
  return n;
}

type Walked = {
  exp: string;
  strike: number;
  gamma: number;
  delta: number | null;
  oi: number;
  volume: number;
  isCall: boolean;
};

function emptyDiag(): ExposureDiagnosis {
  return {
    contracts: 0,
    used: 0,
    droppedNoGamma: 0,
    droppedSentinel: 0,
    droppedNoStrike: 0,
    noDelta: 0,
    deltaZero: 0,
    withOi: 0,
    withVolume: 0,
    sample: null,
  };
}

function walk(
  map: any,
  isCall: boolean,
  expiration: string | null,
  diag: ExposureDiagnosis,
  out: Walked[]
) {
  for (const expKey of Object.keys(map ?? {})) {
    const exp = expKey.split(':')[0];
    for (const strikeKey of Object.keys(map[expKey] ?? {})) {
      for (const c of map[expKey][strikeKey] ?? []) {
        diag.contracts++;
        if (!diag.sample) {
          diag.sample = {
            gamma: c?.gamma,
            gammaType: typeof c?.gamma,
            delta: c?.delta,
            deltaType: typeof c?.delta,
            openInterest: c?.openInterest,
            totalVolume: c?.totalVolume,
            strikePrice: c?.strikePrice,
          };
        }
        const strike = num(c?.strikePrice) ?? num(strikeKey);
        if (strike === null) {
          diag.droppedNoStrike++;
          continue;
        }
        const rawG = num(c?.gamma);
        if (rawG === SENTINEL) {
          diag.droppedSentinel++;
          continue;
        }
        if (rawG === null) {
          diag.droppedNoGamma++;
          continue;
        }
        const delta = greek(c?.delta);
        if (delta === null) diag.noDelta++;
        else if (delta === 0) diag.deltaZero++;
        const oi = num(c?.openInterest) ?? 0;
        const volume = num(c?.totalVolume) ?? num(c?.volume) ?? 0;
        if (oi > 0) diag.withOi++;
        if (volume > 0) diag.withVolume++;
        // Lọc kỳ đáo hạn xảy ra SAU khi đếm chẩn đoán: người đọc cần biết cả
        // chuỗi có gì, không chỉ phần đang hiện.
        if (expiration && exp !== expiration) continue;
        diag.used++;
        out.push({ exp, strike, gamma: rawG, delta, oi, volume, isCall });
      }
    }
  }
}

export function underlyingSpot(chain: any): number | null {
  return num(chain?.underlyingPrice ?? chain?.underlying?.last ?? chain?.underlying?.mark);
}

/** Mọi kỳ đáo hạn trong chuỗi, đã sắp xếp. */
export function chainExpirations(chain: any): string[] {
  const set = new Set<string>();
  for (const map of [chain?.callExpDateMap, chain?.putExpDateMap]) {
    for (const k of Object.keys(map ?? {})) set.add(k.split(':')[0]);
  }
  return [...set].sort();
}

export function buildExposure(
  chain: any,
  symbol: string,
  opts: { basis: Basis; expiration?: string | null }
): ExposureProfile | null {
  const spot = underlyingSpot(chain);
  if (!spot) return null;

  const expiration = opts.expiration ?? null;
  const diag = emptyDiag();
  const rows: Walked[] = [];
  walk(chain?.callExpDateMap, true, expiration, diag, rows);
  walk(chain?.putExpDateMap, false, expiration, diag, rows);

  // Cùng đúng một biểu thức với computeGex(): đô-la delta cho bước dịch 1%.
  const notional = spot * spot * 0.01 * 100;

  const byStrike = new Map<number, StrikeExposure>();
  const bucket = (k: number) => {
    let row = byStrike.get(k);
    if (!row) {
      row = {
        strike: k,
        callGamma: 0,
        putGamma: 0,
        netGamma: 0,
        callDelta: 0,
        putDelta: 0,
        netDelta: 0,
        callOi: 0,
        putOi: 0,
        callVolume: 0,
        putVolume: 0,
      };
      byStrike.set(k, row);
    }
    return row;
  };

  for (const r of rows) {
    const row = bucket(r.strike);
    // Cơ sở quyết định hệ số NHÂN, không quyết định hợp đồng nào được vào
    // bảng — xem quyết định 2 ở đầu file.
    const size = opts.basis === 'volume' ? r.volume : r.oi;
    const gamma = r.gamma * size * notional;
    const delta = r.delta === null ? 0 : r.delta * size * 100;
    if (r.isCall) {
      row.callGamma += gamma;
      row.callDelta += delta;
      row.callOi += r.oi;
      row.callVolume += r.volume;
    } else {
      row.putGamma -= gamma;
      row.putDelta += delta;
      row.putOi += r.oi;
      row.putVolume += r.volume;
    }
  }

  const strikes = [...byStrike.values()].sort((a, b) => a.strike - b.strike);
  for (const s of strikes) {
    s.netGamma = s.callGamma + s.putGamma;
    s.netDelta = s.callDelta + s.putDelta;
  }
  if (!strikes.length) return null;

  return {
    symbol,
    spot,
    basis: opts.basis,
    expirations: chainExpirations(chain),
    expiration,
    strikes,
    totalGamma: strikes.reduce((a, s) => a + s.netGamma, 0),
    totalDelta: strikes.reduce((a, s) => a + s.netDelta, 0),
    diagnosis: diag,
  };
}

/**
 * Cắt danh sách strike về một cửa sổ quanh giá.
 *
 * `minRows` là phần load-bearing: một mã chỉ có vài strike, hoặc một cửa sổ
 * hẹp trên chuỗi thưa, sẽ ra biểu đồ RỖNG — và biểu đồ rỗng đọc thành "không
 * có dữ liệu" chứ không phải "không có strike nào gần giá". Nên khi cửa sổ
 * phần trăm không đủ hàng thì lấy bù bằng những strike GẦN GIÁ NHẤT.
 */
export function window(
  strikes: StrikeExposure[],
  spot: number,
  pct: number,
  minRows = 10
): StrikeExposure[] {
  if (!strikes.length) return [];
  const lo = spot * (1 - pct / 100);
  const hi = spot * (1 + pct / 100);
  const inBand = strikes.filter((s) => s.strike >= lo && s.strike <= hi);
  if (inBand.length >= minRows) return inBand;
  const byNear = [...strikes].sort(
    (a, b) => Math.abs(a.strike - spot) - Math.abs(b.strike - spot)
  );
  return byNear.slice(0, Math.min(minRows, strikes.length)).sort((a, b) => a.strike - b.strike);
}

/** Strike có |gamma ròng| lớn nhất trong danh sách đã cắt — dùng để vẽ nhãn.
 *  Trả null khi mọi strike đều đúng 0 (chuỗi rỗng ruột), chứ không trả strike
 *  đầu tiên: một nhãn trỏ vào con số 0 trông y hệt một nhãn thật. */
export function peakGamma(strikes: StrikeExposure[]): number | null {
  let best: number | null = null;
  let max = 0;
  for (const s of strikes) {
    const v = Math.abs(s.netGamma);
    if (v > max) {
      max = v;
      best = s.strike;
    }
  }
  return best;
}
