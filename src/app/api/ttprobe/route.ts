import { NextRequest, NextResponse } from 'next/server';
import { ttAuthenticate, ttConfigured, ttGet, ttAuthMethod, TtError } from '@/lib/tastytrade';

/**
 * Dò HÌNH DẠNG thật của tastytrade `/market-metrics`, chạy một lần trong
 * production. Cùng lý do tồn tại với `/api/uwprobe`: sandbox không có mạng,
 * và "đọc tài liệu rồi code theo" đã sai nhiều lần ở repo này.
 *
 * Câu hỏi cần trả lời, theo thứ tự quan trọng:
 *   1. Xác thực cách nào chạy được (OAuth hay phiên), token phiên gắn header
 *      kiểu nào (có "Bearer" hay không) - tài liệu và thực tế hay lệch ở đây.
 *   2. `market-metrics` có trả NGÀY EARNINGS không, tên trường thật là gì -
 *      đây là thứ sẽ vá hard gate đang pass-vì-thiếu-dữ-liệu.
 *   3. Có IV rank / IV percentile / IV theo từng kỳ hạn không.
 *   4. Hỏi N mã thì về đủ N mã không, hay có mã bị rơi im lặng.
 *
 * CỐ TÌNH: chỉ chủ app (`/api/ttprobe` nằm trong OWNER_ONLY) - đây là tài
 * khoản môi giới thật của chủ app, người nhà không được kích hoạt lượt gọi
 * trên đó dù chỉ để xem hình dạng. Và KHÔNG BAO GIỜ trả về token, mật khẩu
 * hay client secret: mọi thứ về xác thực đi ra ngoài đều là boolean, tên
 * khoá, hoặc mã trạng thái.
 */
export const dynamic = 'force-dynamic';

/** Trường mong đợi theo tài liệu tôi nhớ. Probe KHÔNG giả định chúng tồn
 *  tại - nó báo cái nào có, cái nào không, và in toàn bộ khoá thật bên
 *  cạnh để người đọc thấy tên đúng nếu tôi nhớ sai. */
const WANTED = {
  earnings: ['earnings', 'expected-report-date', 'earnings-date', 'next-earnings'],
  ivRank: ['implied-volatility-index-rank', 'iv-rank', 'implied-volatility-rank'],
  ivPercentile: ['implied-volatility-percentile', 'iv-percentile'],
  ivIndex: ['implied-volatility-index', 'iv-index'],
  termStructure: ['option-expiration-implied-volatilities', 'expiration-implied-volatilities'],
  liquidity: ['liquidity-rating', 'liquidity-value'],
  hv: ['historical-volatility-30-day', 'historical-volatility'],
};

const typeOf = (v: unknown) => (v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v);

function describeRecord(rec: any) {
  if (!rec || typeof rec !== 'object') return { recordKeys: [], types: {}, found: {} };
  const recordKeys = Object.keys(rec);
  const types = Object.fromEntries(recordKeys.map((k) => [k, typeOf(rec[k])]));
  const lower = recordKeys.map((k) => k.toLowerCase());
  const found: Record<string, string[]> = {};
  for (const [name, hints] of Object.entries(WANTED)) {
    found[name] = recordKeys.filter((k, i) => hints.some((h) => lower[i] === h || lower[i].includes(h)));
  }
  // Hai trường lồng nhau quyết định giá trị của cả endpoint: earnings và
  // term structure. Mở chúng ra một tầng để thấy khoá + kiểu bên trong.
  const nested: Record<string, unknown> = {};
  for (const k of [...found.earnings, ...found.termStructure]) {
    const v = rec[k];
    if (Array.isArray(v)) {
      nested[k] = {
        isArray: true,
        length: v.length,
        firstKeys: v[0] && typeof v[0] === 'object' ? Object.keys(v[0]) : [],
        firstTypes:
          v[0] && typeof v[0] === 'object'
            ? Object.fromEntries(Object.entries(v[0]).map(([kk, vv]) => [kk, typeOf(vv)]))
            : typeOf(v[0]),
        sample: JSON.stringify(v[0] ?? null).slice(0, 300),
      };
    } else if (v && typeof v === 'object') {
      nested[k] = {
        isArray: false,
        keys: Object.keys(v),
        types: Object.fromEntries(Object.entries(v).map(([kk, vv]) => [kk, typeOf(vv)])),
        sample: JSON.stringify(v).slice(0, 300),
      };
    } else {
      nested[k] = { isArray: false, scalar: typeOf(v), value: String(v).slice(0, 60) };
    }
  }
  return { recordKeys, types, found, nested };
}

export async function GET(req: NextRequest) {
  if (!ttConfigured()) {
    return NextResponse.json(
      {
        error:
          'tastytrade chưa được cấu hình. Đặt TT_CLIENT_SECRET + TT_REFRESH_TOKEN (ưu tiên) ' +
          'hoặc TT_USERNAME + TT_PASSWORD, rồi gọi lại.',
      },
      { status: 400 }
    );
  }

  const raw = req.nextUrl.searchParams.get('symbols') ?? 'AAPL,MSFT,SPY';
  const asked = [...new Set(raw.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean))];

  // ---- 1. xác thực ----
  let auth: Record<string, unknown>;
  try {
    const a = await ttAuthenticate(true);
    auth = { ok: true, ...a };
  } catch (e: any) {
    return NextResponse.json({
      configuredMethod: ttAuthMethod(),
      auth: {
        ok: false,
        status: e instanceof TtError ? e.status ?? null : null,
        error: String(e?.message ?? e),
        body: e instanceof TtError ? e.body ?? null : null,
      },
      note: 'Xác thực thất bại nên chưa đo gì thêm. Đọc `body` - đó là lời thật của tastytrade.',
    });
  }

  // ---- 2. market-metrics ----
  let metrics: Record<string, unknown>;
  try {
    const { data, scheme, status } = await ttGet<any>('/market-metrics', { symbols: asked.join(',') });
    const topLevelKeys = Object.keys(data ?? {});
    const body = data?.data ?? data;
    const items: any[] = Array.isArray(body?.items) ? body.items : Array.isArray(body) ? body : [];
    const symbolKey =
      items[0] && typeof items[0] === 'object'
        ? Object.keys(items[0]).find((k) => k.toLowerCase() === 'symbol') ?? null
        : null;
    const returned = symbolKey ? items.map((it) => String(it[symbolKey]).toUpperCase()) : [];
    metrics = {
      ok: true,
      status,
      schemeAccepted: scheme,
      topLevelKeys,
      dataKeys: Object.keys(data?.data ?? {}),
      itemsIsArray: Array.isArray(body?.items) || Array.isArray(body),
      asked: asked.length,
      returned: returned.length,
      // Câu hỏi 4: mã nào rơi. Rơi im lặng là thứ nguy hiểm với một cái gate.
      missing: asked.filter((s) => !returned.includes(s)),
      ...describeRecord(items[0]),
      sample: JSON.stringify(items[0] ?? body).slice(0, 700),
    };
  } catch (e: any) {
    metrics = {
      ok: false,
      status: e instanceof TtError ? e.status ?? null : null,
      error: String(e?.message ?? e),
      body: e instanceof TtError ? e.body ?? null : null,
    };
  }

  return NextResponse.json({
    configuredMethod: ttAuthMethod(),
    note:
      'Chỉ dò hình dạng. `found.earnings` rỗng nghĩa là KHÔNG có ngày earnings ở endpoint này ' +
      '(gate earnings không vá được từ đây). `missing` khác rỗng nghĩa là hỏi N mã về ít hơn N - ' +
      'phải biết trước khi tin vào một cái gate. Không có token nào trong câu trả lời này.',
    auth,
    marketMetrics: metrics,
  });
}
