import fs from 'node:fs/promises';
import path from 'node:path';
import { uwConfigured, uwGet, UwError } from './unusualwhales';
import { trackedSymbols } from './insiders';
import { inMarketHours } from './alerts';

/**
 * Lệnh in ngoài sàn (dark pool) khối lượng lớn, qua Unusual Whales.
 *
 * Khác Options Flow: `/api/darkpool/recent` KHÔNG có tham số lọc theo
 * mã (xác nhận từ tài liệu thật), chỉ `/api/darkpool/{ticker}` mới có -
 * nên phải gọi RIÊNG TỪNG MÃ, không gộp lô được như Options Flow. Kéo
 * luồng chung `/recent` rồi tự lọc từng có cân nhắc, nhưng khối lượng in
 * dark pool TOÀN THỊ TRƯỜNG đủ lớn để cửa sổ "gần đây" có thể trôi qua
 * hết trước lần đồng bộ kế tiếp - gọi riêng từng mã mới chắc chắn không
 * bỏ sót.
 *
 * CHI PHÍ THẬT (sự cố đã xảy ra, không phải giả định): rổ theo dõi có
 * ~500+ mã, mỗi mã tốn đúng 1 request không gộp lô được. Ban đầu chạy
 * theo đúng nhịp 15 phút của alert-runner, 24/7 không phân biệt giờ -
 * 503 mã × 96 lượt/ngày ≈ 48.000 request/ngày, VƯỢT hẳn hạn mức
 * 30.000/ngày của UW chỉ riêng endpoint này (xác nhận trực tiếp trên UW
 * API Dashboard của người dùng: /api/darkpool/:ticker chiếm 91,9% hạn
 * mức 30 ngày, và một ngày bị dùng hết sạch 30.000/30.000 lúc mới 5 giờ
 * chiều). Dark pool chỉ khớp lệnh trong giờ sàn mở cửa - không có gì để
 * bỏ lỡ lúc nửa đêm hay cuối tuần, nên hai việc dưới đây không đánh đổi
 * độ mới của dữ liệu, chỉ cắt phần gọi thừa:
 * 1) `syncDarkpool()` tự bỏ qua (không gọi UW) khi ngoài giờ giao dịch,
 *    trừ khi gọi có `force: true` (nút "Đồng bộ ngay" của người dùng).
 * 2) `alert-runner.ts` chỉ cho tick tự động gọi hàm này mỗi giờ (1 trong
 *    4 lượt của bộ đếm 15 phút chung), không phải mọi lượt.
 * Cùng nhau: 503 × ~10 giờ giao dịch/ngày ≈ 5.000 request/ngày - còn xa
 * hạn mức, đủ chỗ cho Options Flow/Congress và các tính năng UW sau này.
 *
 * Số lượng in dark pool cho MỘT mã cũng có thể rất nhiều trong ngày -
 * chỉ giữ lại lệnh có premium đủ lớn (MIN_PREMIUM), giống cách chọn
 * "block trade" đáng chú ý trên thị trường thay vì lưu mọi lệnh nhỏ lẻ.
 * Lọc CẢ HAI phía: truyền `min_premium` cho UW (nếu endpoint này cũng
 * nhận tham số đó như /recent - chưa xác nhận riêng) VÀ lọc lại phía
 * app bằng field `premium` đã có sẵn trong response - đúng dù UW có
 * nhận tham số đó hay lặng lẽ bỏ qua.
 *
 * KHÔNG CÓ hướng mua/bán thật. Xác nhận từ đúng bảng mô tả field đầy đủ
 * của tài liệu API (17 field, không chỉ đọc một bản ghi mẫu có thể null
 * mất field) - không có field nào tên side/aggressor_side/buy_sell/
 * direction. Đúng bản chất của dark pool: một lệnh khớp giấu tên luôn có
 * CẢ người mua lẫn người bán cùng lúc, không có "phe nào chủ động" theo
 * nghĩa một sổ lệnh công khai. `sideEstimate` dưới đây là suy đoán tự
 * làm (so giá khớp với NBBO bid/ask lúc khớp lệnh) - một kỹ thuật phổ
 * biến trong ngành (gần giống "quote rule" phân loại giao dịch), NHƯNG
 * chỉ là ước lượng. Giao diện phải luôn ghi rõ đây là ước lượng, và
 * KHÔNG tô xanh/đỏ cho nó - trùng đúng cái bẫy ColorLegend.tsx đã nói:
 * xanh/đỏ trong công cụ tài chính dễ bị đọc thành "nên mua/nên tránh",
 * mà đây chỉ là suy đoán ai chủ động khớp lệnh, không phải khuyến nghị.
 */

const STORE = path.resolve(process.env.DARKPOOL_PATH || './.cache/darkpool.json');

/** Ngắn như Options Flow - một lệnh in tuần trước không còn ý nghĩa gì
 *  cho quyết định hôm nay. */
export const LOOKBACK_DAYS = 14;

/** Ngưỡng "đáng chú ý": khớp cỡ giao dịch tổ chức, không phải lẻ tẻ. */
export const MIN_PREMIUM = 1_000_000;

const PAGE_SIZE = 200;

/** Suy đoán bên nào chủ động khớp lệnh, từ giá khớp so với NBBO bid/ask
 *  lúc đó - KHÔNG phải nhãn thật của UW (không tồn tại). null khi thiếu
 *  bid/ask để so (không suy đoán bừa khi không có dữ liệu). */
export type SideEstimate = 'buy' | 'sell' | 'neutral' | null;

export type DarkpoolPrint = {
  /** UW không có "id" cho dark pool (khác flow-alerts), nhưng có
   *  tracking_id - số nguyên lớn, đủ để làm khoá thật, không cần dựng
   *  khoá tổng hợp như congress.ts. */
  trackingId: string;
  ticker: string;
  size: number | null;
  price: number | null;
  premium: number | null;
  executedAt: string;
  marketCenter: string | null;
  extendedHours: boolean;
  /** Giá/khối lượng chào mua-bán tốt nhất lúc khớp lệnh - giữ lại để
   *  người đọc kỹ có thể tự kiểm tra `sideEstimate`, không giấu số gốc
   *  đằng sau một chữ suy luận. */
  nbboBid: number | null;
  nbboAsk: number | null;
  sideEstimate: SideEstimate;
};

/**
 * So giá khớp với điểm giữa bid/ask: trên điểm giữa nghiêng về bên mua
 * chủ động (trả gần giá ask), dưới điểm giữa nghiêng về bên bán chủ
 * động (bán gần giá bid). Đây là ước lượng phổ biến trong ngành khi
 * không có nhãn thật (gần giống "quote rule"), không phải phép tính
 * chính xác - hai lệnh mua/bán luôn tồn tại song song trong mọi lệnh
 * khớp, kể cả lệnh này.
 */
export function estimateSide(price: number | null, bid: number | null, ask: number | null): SideEstimate {
  if (price === null || bid === null || ask === null) return null;
  if (ask <= bid) return null; // dữ liệu bid/ask vô lý (hỏng hoặc thị trường đóng cửa) - không suy đoán
  const mid = (bid + ask) / 2;
  if (price > mid) return 'buy';
  if (price < mid) return 'sell';
  return 'neutral';
}

type Stored = {
  prints: Record<string, DarkpoolPrint>;
  /** mã -> lần đồng bộ gần nhất thành công (ISO). Đồng bộ RIÊNG TỪNG MÃ
   *  nên mỗi mã có watermark của mã đó, không dùng chung một mốc. */
  watermarks: Record<string, string>;
};

/**
 * Di trú kho cũ: lệnh đã lưu TRƯỚC KHI có `sideEstimate` sẽ mãi mãi
 * thiếu trường đó nếu không xử lý gì thêm - `syncDarkpool()` chỉ hỏi UW
 * cho `tracking_id` CHƯA từng thấy (tránh tốn hạn mức gọi lại cái đã
 * có), nên lệnh cũ dù còn nằm trong 14 ngày hiển thị cũng không bao giờ
 * được phân tích lại bằng code mới.
 *
 * Phát hiện qua sự CÓ MẶT của khoá `sideEstimate`, không phải giá trị
 * của nó - giá trị `null` là hợp lệ (thiếu bid/ask thật), còn khoá
 * không tồn tại mới là dấu hiệu "lưu từ code cũ".
 *
 * Xoá đúng những lệnh đó khỏi kho (để lần đồng bộ sau coi như "chưa
 * từng thấy", hỏi lại UW) VÀ xoá watermark của những mã liên quan - nếu
 * không, `newer_than` sẽ chặn UW trả lại đúng lệnh cũ đó vì nó "cũ hơn"
 * mốc đã lưu. Chỉ tốn một lượt đồng bộ đầy đủ lại, một lần duy nhất.
 */
function migrateOldPrints(s: Stored): Stored {
  const staleSymbols = new Set<string>();
  for (const [key, p] of Object.entries(s.prints)) {
    // Đọc dữ liệu JSON đã lưu từ đĩa như dữ liệu KHÔNG đáng tin theo type -
    // bản ghi cũ hoàn toàn có thể thiếu trường mà kiểu DarkpoolPrint bây
    // giờ khai là bắt buộc, nên `p` phải coi như `any` ở đây.
    const raw = p as any;
    if (!('sideEstimate' in raw)) {
      staleSymbols.add(raw.ticker);
      delete s.prints[key];
    }
  }
  for (const symbol of staleSymbols) delete s.watermarks[symbol];
  return s;
}

async function read(): Promise<Stored> {
  try {
    const j = JSON.parse(await fs.readFile(STORE, 'utf8'));
    if (j && typeof j === 'object' && j.prints) return migrateOldPrints(j);
  } catch {
    /* chưa đồng bộ lần nào */
  }
  return { prints: {}, watermarks: {} };
}

async function write(s: Stored): Promise<void> {
  await fs.mkdir(path.dirname(STORE), { recursive: true });
  await fs.writeFile(STORE, JSON.stringify(s));
}

function num(v: unknown): number | null {
  const n = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) ? n : null;
}

function parsePrint(raw: any): DarkpoolPrint {
  const price = num(raw.price);
  const nbboBid = num(raw.nbbo_bid);
  const nbboAsk = num(raw.nbbo_ask);
  return {
    trackingId: String(raw.tracking_id ?? ''),
    ticker: String(raw.ticker ?? '').toUpperCase(),
    size: num(raw.size),
    price,
    premium: num(raw.premium),
    executedAt: String(raw.executed_at ?? ''),
    marketCenter: raw.market_center ?? null,
    extendedHours: raw.ext_hour_sold_codes === 'extended_hours_trade',
    nbboBid,
    nbboAsk,
    sideEstimate: estimateSide(price, nbboBid, nbboAsk),
  };
}

export type DarkpoolRun = {
  at: number;
  symbolsChecked: number;
  seen: number;
  saved: number;
  errors: string[];
  /** 'market-closed' khi lượt này bị bỏ qua vì ngoài giờ giao dịch (xem
   *  chú thích ở đầu file) - giữ nguyên `lastRun` của lần chạy THẬT gần
   *  nhất thì đúng hơn, nhưng phải tự ghi lại là ĐÃ bỏ qua, không được
   *  im lặng - im lặng đọc thành "đã kiểm tra, không có gì mới", sai hẳn
   *  với "chưa kiểm tra vì đang ngoài giờ". */
  skipped: 'market-closed' | null;
};

let lastRun: DarkpoolRun | null = null;
export const getDarkpoolLastRun = () => lastRun;

let inFlight = false;
export const darkpoolSyncing = () => inFlight;

/** `force: true` bỏ qua giờ giao dịch - dùng cho nút "Đồng bộ ngay" của
 *  người dùng (một hành động chủ động thì luôn cho phép), KHÔNG dùng cho
 *  lượt tự động của alert-runner. */
export async function syncDarkpool(force = false): Promise<DarkpoolRun> {
  if (inFlight) {
    return (
      lastRun ?? { at: Date.now(), symbolsChecked: 0, seen: 0, saved: 0, errors: [], skipped: null }
    );
  }
  if (!uwConfigured()) {
    lastRun = {
      at: Date.now(),
      symbolsChecked: 0,
      seen: 0,
      saved: 0,
      errors: ['UW_API_KEY chưa được cấu hình'],
      skipped: null,
    };
    return lastRun;
  }
  if (!force && !inMarketHours()) {
    lastRun = {
      at: Date.now(),
      symbolsChecked: 0,
      seen: 0,
      saved: 0,
      errors: [],
      skipped: 'market-closed',
    };
    return lastRun;
  }

  inFlight = true;
  const at = Date.now();
  let symbolsChecked = 0;
  let seen = 0;
  let saved = 0;
  const errors: string[] = [];

  try {
    const { symbols } = await trackedSymbols();
    const store = await read();

    for (const symbol of symbols) {
      symbolsChecked++;
      try {
        const res = await uwGet<{ data?: any[] } | any[]>(`/api/darkpool/${symbol}`, {
          limit: PAGE_SIZE,
          min_premium: MIN_PREMIUM,
          newer_than: store.watermarks[symbol],
        });
        const rows: any[] = Array.isArray(res) ? res : Array.isArray(res?.data) ? res.data : [];
        for (const raw of rows) {
          seen++;
          if (raw.canceled) continue; // lệnh đã bị huỷ - không phải in thật
          const p = parsePrint(raw);
          // Lọc lại phía app phòng khi UW bỏ qua min_premium ở endpoint này.
          if ((p.premium ?? 0) < MIN_PREMIUM) continue;
          if (p.trackingId && !(p.trackingId in store.prints)) {
            store.prints[p.trackingId] = p;
            saved++;
          }
        }
        store.watermarks[symbol] = new Date(at).toISOString();
      } catch (e: any) {
        const msg =
          e instanceof UwError && e.status
            ? `UW trả mã ${e.status}${e.body ? ` — ${e.body.slice(0, 120)}` : ''}`
            : String(e?.message ?? e);
        errors.push(`${symbol}: ${msg}`);
        // KHÔNG cập nhật watermark của mã lỗi - lần sau thử lại từ đầu
        // cửa sổ thay vì bỏ sót phần chưa lấy được.
      }
      await write(store);
    }
  } finally {
    inFlight = false;
  }

  lastRun = { at, symbolsChecked, seen, saved, errors, skipped: null };
  return lastRun;
}

export type SymbolDarkpoolPrints = {
  symbol: string;
  prints: DarkpoolPrint[];
  totalPremium: number;
  lastPrintAt: string | null;
  /** Tổng số cổ phiếu của các lệnh NGHIÊNG mua/bán (ước lượng, xem
   *  estimateSide) - lệnh 'neutral' hoặc null (thiếu bid/ask) không
   *  tính vào bên nào, vì không có cơ sở để xếp nó vào một phía. */
  buyVolume: number;
  sellVolume: number;
};

export async function readDarkpool(symbols: string[]): Promise<SymbolDarkpoolPrints[]> {
  const store = await read();
  const cutoff = Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000;
  const wanted = new Set(symbols.map((s) => s.toUpperCase()));

  const bySymbol = new Map<string, DarkpoolPrint[]>();
  for (const p of Object.values(store.prints)) {
    if (!wanted.has(p.ticker)) continue;
    if (Date.parse(p.executedAt) < cutoff) continue;
    if (!bySymbol.has(p.ticker)) bySymbol.set(p.ticker, []);
    bySymbol.get(p.ticker)!.push(p);
  }

  return [...bySymbol.entries()].map(([symbol, prints]) => {
    prints.sort((a, b) => b.executedAt.localeCompare(a.executedAt));
    let buyVolume = 0;
    let sellVolume = 0;
    for (const p of prints) {
      if (p.sideEstimate === 'buy') buyVolume += p.size ?? 0;
      else if (p.sideEstimate === 'sell') sellVolume += p.size ?? 0;
    }
    return {
      symbol,
      prints,
      totalPremium: prints.reduce((n, p) => n + (p.premium ?? 0), 0),
      lastPrintAt: prints[0]?.executedAt ?? null,
      buyVolume,
      sellVolume,
    };
  });
}

/** Chỉ dùng cho kiểm thử. */
export const __store = STORE;
