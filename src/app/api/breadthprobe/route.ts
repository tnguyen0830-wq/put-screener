import { NextResponse } from 'next/server';
import { uwGet, uwConfigured, UwError } from '@/lib/unusualwhales';
import { ttConfigured, ttGet, TtError } from '@/lib/tastytrade';
import { dxHandshake, BREADTH_CANDIDATES, CONTROL_SYMBOL, CONTROL_SYMBOLS } from '@/lib/dxprobe';

/**
 * Hai nhà cung cấp CÓ KEY mà app đã trả tiền, có mang chỉ báo bề rộng thị
 * trường không?
 *
 * #165 đo được Schwab chỉ phủ 4/8, và tab Bề rộng thị trường hiện phải mượn
 * khung hình TradingView cho phần còn lại - mà khung hình thì app KHÔNG ĐỌC
 * ĐƯỢC thành số, nên không cảnh báo và không phân tích được. Số lấy từ UW
 * hay tastytrade thì đọc được. Đó là lý do đáng bấm một lần đo này.
 *
 * Hai phần, hỏng độc lập (`allSettled`): UW chết không được che mất kết quả
 * của tastytrade và ngược lại.
 *
 * ============================================================
 * PHẦN UW: NHÁNH /api/market/* CHƯA TỪNG ĐƯỢC GỌI
 * ============================================================
 *
 * App mới chỉ dùng congress, darkpool, flow-alerts và GEX theo mã. Danh
 * sách dưới đây là PHỎNG ĐOÁN tên endpoint - và một cái 404 CHÍNH LÀ câu
 * trả lời, không phải lỗi của probe. Cái đáng giá nhất nếu có thật là tổng
 * khối lượng quyền chọn toàn thị trường: có call/put riêng thì app tự tính
 * được tỉ lệ put/call - thứ Schwab không có mã nào để quote.
 *
 * Bề rộng cổ phiếu (advance/decline, TICK) thì ngược lại, nhiều khả năng
 * KHÔNG có: UW là nhà cung cấp dòng tiền QUYỀN CHỌN, còn advance-decline là
 * chuyện của thị trường cổ phiếu. Vẫn hỏi, vì hỏi rẻ hơn đoán.
 *
 * ============================================================
 * PHẦN TASTYTRADE: LẤY TOKEN TRƯỚC, BẮT TAY SAU
 * ============================================================
 *
 * Quote thời gian thực của tastytrade đi qua DXLink (WebSocket), không phải
 * REST. Bước 1 (xin token streamer qua REST) là phép đo RẺ và DỨT ĐIỂM: nếu
 * tài khoản không được cấp token thì toàn bộ hướng DXLink đóng lại ngay,
 * khỏi phải xây client WebSocket. Chỉ khi bước 1 xong mới sang bước 2.
 *
 * TOKEN KHÔNG BAO GIỜ ĐI RA NGOÀI: chỉ trả về boolean "có token hay không",
 * URL streamer và cấp độ. Thông điệp AUTH ghi lại cũng đã che token.
 */
export const dynamic = 'force-dynamic';

const typeOf = (v: unknown) => (v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v);

/** Trường gợi ý endpoint này dùng được cho put/call hay bề rộng. */
const PUTCALL_HINTS = ['put', 'call', 'ratio'];
const BREADTH_HINTS = ['advanc', 'declin', 'tick', 'breadth', 'issues', 'uvol', 'dvol'];

function describe(payload: any) {
  const topLevelKeys = Object.keys(payload ?? {});
  const body = payload?.data ?? payload;
  const isArray = Array.isArray(body);
  const rows: any[] = isArray ? body : [];
  const first = isArray ? rows[0] : body;
  const recordKeys = first && typeof first === 'object' ? Object.keys(first) : [];
  const lower = recordKeys.map((k) => k.toLowerCase());
  const match = (hints: string[]) => recordKeys.filter((_, i) => hints.some((h) => lower[i].includes(h)));

  return {
    topLevelKeys,
    isArray,
    rows: isArray ? rows.length : null,
    recordKeys,
    types:
      first && typeof first === 'object'
        ? Object.fromEntries(Object.entries(first).map(([k, v]) => [k, typeOf(v)]))
        : {},
    /* Hai câu hỏi thật, trả lời bằng TÊN TRƯỜNG chứ không bằng một chữ
       "có/không" do tôi tự kết luận - người đọc thấy tên thật thì tự phán
       được, kể cả khi tôi gợi ý sai. */
    putCallFields: match(PUTCALL_HINTS),
    breadthFields: match(BREADTH_HINTS),
    sample: JSON.stringify(first ?? body).slice(0, 400),
  };
}

/** Tên endpoint PHỎNG ĐOÁN. 404 là câu trả lời, không phải lỗi. */
const UW_MARKET = [
  '/api/market/total-options-volume',
  '/api/market/market-tide',
  '/api/market/oi-change',
  '/api/market/spike',
  '/api/market/sector-etfs',
];

async function probeUw() {
  if (!uwConfigured()) return { skipped: 'UW_API_KEY chưa được cấu hình' as const };

  const results: Record<string, any> = {};
  for (const path of UW_MARKET) {
    try {
      results[path] = { ok: true, ...describe(await uwGet<any>(path)) };
    } catch (e: any) {
      results[path] = {
        ok: false,
        status: e instanceof UwError ? e.status ?? null : null,
        /* Giữ nguyên lời thật của UW: 404 (không có endpoint này) khác hẳn
           403 (có nhưng gói không mở) và 401 (key hết hạn) - ba thứ đó dẫn
           tới ba việc phải làm khác nhau. */
        error: String(e?.message ?? e).slice(0, 200),
        body: e instanceof UwError ? (e.body ?? null)?.slice(0, 200) ?? null : null,
      };
    }
  }
  return { skipped: null, endpoints: results };
}

async function probeTastytrade() {
  if (!ttConfigured()) return { skipped: 'tastytrade chưa được cấu hình' as const };

  // --- Bước 1: xin token streamer (REST, rẻ, dứt điểm) ---
  let tokenInfo: Record<string, unknown>;
  let token: string | null = null;
  let dxUrl: string | null = null;

  try {
    const { data, status } = await ttGet<any>('/api-quote-tokens');
    const body = data?.data ?? data;
    const rawToken = body?.token ?? body?.['streamer-token'] ?? null;
    token = typeof rawToken === 'string' && rawToken ? rawToken : null;
    const rawUrl = body?.['dxlink-url'] ?? body?.['websocket-url'] ?? body?.url ?? null;
    dxUrl = typeof rawUrl === 'string' && rawUrl ? rawUrl : null;

    tokenInfo = {
      ok: true,
      status,
      topLevelKeys: Object.keys(data ?? {}),
      bodyKeys: Object.keys(body ?? {}),
      types: Object.fromEntries(Object.entries(body ?? {}).map(([k, v]) => [k, typeOf(v)])),
      // Token KHÔNG đi ra ngoài - chỉ nói có hay không và dài bao nhiêu.
      hasToken: token !== null,
      tokenLength: token ? token.length : 0,
      dxlinkUrl: dxUrl,
      level: body?.level ?? null,
    };
  } catch (e: any) {
    return {
      skipped: null,
      quoteToken: {
        ok: false,
        status: e instanceof TtError ? e.status ?? null : null,
        error: String(e?.message ?? e).slice(0, 200),
        body: e instanceof TtError ? (e.body ?? null)?.slice(0, 200) ?? null : null,
      },
      dxlink: {
        attempted: false,
        skipped: 'không xin được token streamer nên không bắt tay - hướng DXLink đóng ở ngay bước này',
      },
      note: 'Bước 1 hỏng thì KHÔNG cần xây client WebSocket. Đọc `quoteToken.error`: 404 = tài khoản không có đường này, 403 = có nhưng chưa được cấp quyền.',
    };
  }

  if (!token || !dxUrl) {
    return {
      skipped: null,
      quoteToken: tokenInfo,
      dxlink: {
        attempted: false,
        skipped: `200 nhưng thiếu ${!token ? 'token' : 'dxlink-url'} - đọc bodyKeys để thấy tên trường thật`,
      },
    };
  }

  // --- Bước 2: bắt tay thật, kèm hai mã đối chứng ---
  const symbols = [...CONTROL_SYMBOLS, ...BREADTH_CANDIDATES];
  /* 12 giây, và lần này KHÔNG dừng sớm vì mã đối chứng về (lỗi của phép đo
     đầu tiên, xem dxprobe.ts) - không có mã bề rộng nào thì phải nghe hết
     giờ mới được nói là không có. */
  const dx = await dxHandshake(dxUrl, token, symbols, 12_000);

  const controlsSeen = CONTROL_SYMBOLS.filter((s) => dx.symbolsWithData.includes(s));
  const breadthSeen = dx.symbolsWithData.filter((s) => !CONTROL_SYMBOLS.includes(s));

  return {
    skipped: null,
    quoteToken: tokenInfo,
    dxlink: dx,
    controlsSeen,
    breadthSeen,
    /* Cách đọc kết quả, viết sẵn để khỏi phải suy lại: mã đối chứng chính
       là thứ tách "streaming hỏng" khỏi "streaming chạy nhưng không có mã
       bề rộng". VIX là đối chứng thứ hai vì nó là một CHỈ SỐ - có nó nghĩa
       là dxFeed phục vụ cả loại chỉ số chứ không riêng cổ phiếu, nên việc
       thiếu mã bề rộng là chuyện quyền truy cập/tên mã, không phải chuyện
       dxFeed không làm chỉ số. */
    howToRead: !controlsSeen.length
      ? 'KHÔNG mã đối chứng nào có dữ liệu → chưa kết luận được gì về mã bề rộng, vì chính đường streaming chưa chạy (hoặc đang ngoài giờ). Đọc `messages` để xem DXLink dừng ở bước nào.'
      : breadthSeen.length
        ? `Streaming CHẠY (${controlsSeen.join(', ')}) và mã bề rộng DÙNG ĐƯỢC: ${breadthSeen.join(', ')}.`
        : `Streaming CHẠY (${controlsSeen.join(', ')}) nhưng KHÔNG mã bề rộng nào trong ${BREADTH_CANDIDATES.length} cách viết có dữ liệu, sau khi nghe hết ${12}s. Có VIX nghĩa là dxFeed vẫn phục vụ chỉ số, nên đây là chuyện tài khoản không mang mấy mã đó (hoặc tên mã khác hẳn), không phải chuyện streaming hỏng.`,
  };
}

export async function GET() {
  const [uw, tt] = await Promise.allSettled([probeUw(), probeTastytrade()]);

  return NextResponse.json({
    note:
      'Dò xem UW hoặc tastytrade có chỉ báo bề rộng thị trường không - thứ Schwab thiếu 4/8. ' +
      'Số từ hai nguồn này app ĐỌC ĐƯỢC (cảnh báo, Hỏi Claude), khác hẳn khung hình TradingView. ' +
      'Với UW: 404 là câu trả lời (endpoint không tồn tại), không phải lỗi. ' +
      'Với tastytrade: xem `howToRead` - mã đối chứng AAPL tách "streaming hỏng" khỏi "không có mã bề rộng". ' +
      'Không có token hay khoá API nào trong câu trả lời này.',
    unusualWhales: uw.status === 'fulfilled' ? uw.value : { error: String(uw.reason?.message ?? uw.reason) },
    tastytrade: tt.status === 'fulfilled' ? tt.value : { error: String(tt.reason?.message ?? tt.reason) },
  });
}
