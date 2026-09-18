import { quotes, intradayHistory } from '@/lib/schwab';

/**
 * Dò xem Schwab có quote được các chỉ báo "market internals" mà chủ app xin
 * hay không - TICK, Advance-Decline, UVOL/DVOL, Put/Call Ratio, VIX - trước
 * khi xây tab. Cùng lý do tồn tại với /api/uwprobe, /api/ttprobe, /api/xprobe,
 * /api/secprobe: sandbox này không có phiên Schwab OAuth nên không đo được
 * gì, và repo này đã trả giá nhiều lần vì code theo tên mã NHỚ được thay vì
 * ĐO được (SPX #86-#100, BRK/B #141, tastytrade #130).
 *
 * Không nằm trong OWNER_ONLY: đây là hạn mức Schwab market-data DÙNG CHUNG
 * (100 req/phút) mà Screener/Analyze/Heatmap đã dùng, không phải một tài
 * khoản riêng chủ app trả tiền như tastytrade/UW/X - không có lý do chặn
 * người nhà xem hình dạng này.
 *
 * Hai câu phải trả lời, và câu đầu quyết định cả tính năng có làm được không:
 *   1. `/quotes` có nhận ra mã nào trong số các cách viết hay đoán không -
 *      mỗi chỉ báo thử VÀI cách viết (`$TICK`, `$TICK.NY`, `TICK`...), đúng
 *      khuôn "thử nhiều cách viết" mà $SPX/BRK-B/CBOE đã dùng.
 *   2. Mã đã quote được có LỊCH SỬ TRONG NGÀY (nến phút) không - một con số
 *      snapshot không vẽ được biểu đồ như ảnh tapchiphowall, phải có
 *      /pricehistory theo phút mới vẽ được.
 *
 * Đọc dung thứ: một trường quote hợp lệ có thể mang giá trị 0 (TICK đúng lúc
 * cân bằng, ADV-DECL đúng lúc hoà) - kiểm sự TỒN TẠI của trường (typeof
 * === 'number'), không kiểm nó có "truthy" hay không, nếu không một cái 0
 * thật sẽ bị đọc nhầm thành "không quote được" (đúng bẫy #131/#142 ở chỗ
 * khác trong repo này).
 */
export const dynamic = 'force-dynamic';

type Candidate = { key: string; label: string; candidates: string[] };

const INDICATORS: Candidate[] = [
  { key: 'nyseTick', label: 'NYSE TICK', candidates: ['$TICK', '$TICK.NY', 'TICK', '$TICKI'] },
  { key: 'nasdaqTick', label: 'NASDAQ TICK', candidates: ['$TICKQ', '$TICK.NQ', 'TICKQ'] },
  { key: 'nyseAdv', label: 'NYSE Advancing issues', candidates: ['$ADV', '$ADV.NY', 'ADVN'] },
  { key: 'nyseDecl', label: 'NYSE Declining issues', candidates: ['$DECL', '$DECL.NY', 'DECN'] },
  { key: 'nasdaqAdv', label: 'NASDAQ Advancing issues', candidates: ['$ADVQ', 'ADVQ'] },
  { key: 'nasdaqDecl', label: 'NASDAQ Declining issues', candidates: ['$DECLQ', 'DECLQ'] },
  { key: 'nyseUvol', label: 'NYSE Up Volume', candidates: ['$UVOL', '$UVOL.NY', 'UVOL'] },
  { key: 'nyseDvol', label: 'NYSE Down Volume', candidates: ['$DVOL', '$DVOL.NY', 'DVOL'] },
  { key: 'vix', label: 'VIX (đã dùng ở nơi khác trong app, để đối chiếu)', candidates: ['$VIX'] },
  { key: 'putCallTotal', label: 'CBOE Total Put/Call Ratio', candidates: ['$PCC', '$CPC', 'PCC'] },
  { key: 'putCallEquity', label: 'CBOE Equity Put/Call Ratio', candidates: ['$PCCE', '$CPCE', 'PCCE'] },
];

const typeOf = (v: unknown) => (v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v);

/** Có quote thật hay không - kiểm sự TỒN TẠI của một trường số, không kiểm
 *  truthy, để 0 hợp lệ không bị đọc nhầm thành "không có". */
function pricedField(q: Record<string, any>, symbol: string): string | null {
  const quote = q[symbol]?.quote;
  if (!quote || typeof quote !== 'object') return null;
  for (const f of ['lastPrice', 'mark', 'closePrice', 'netChange']) {
    if (typeof quote[f] === 'number') return f;
  }
  return null;
}

export async function GET() {
  const allCandidates = INDICATORS.flatMap((i) => i.candidates);

  let q: Record<string, any>;
  let quotesError: string | null = null;
  try {
    q = await quotes(allCandidates);
  } catch (e: any) {
    quotesError = String(e?.message ?? e);
    return Response.json(
      {
        error: quotesError,
        note: quotesError.includes('REAUTH_REQUIRED')
          ? 'Phiên Schwab hết hạn - bấm kết nối lại rồi thử endpoint này lần nữa.'
          : 'Lỗi gọi /quotes trước khi kịp dò chỉ báo nào.',
      },
      { status: quotesError.includes('REAUTH_REQUIRED') ? 401 : 500 }
    );
  }

  const results: Record<string, any> = {};
  for (const ind of INDICATORS) {
    const tried = ind.candidates.map((symbol) => {
      const field = pricedField(q, symbol);
      const quote = q[symbol]?.quote ?? null;
      return {
        symbol,
        quoted: field !== null,
        field,
        assetMainType: q[symbol]?.assetMainType ?? null,
        // Toàn bộ khoá thật của quote, để thấy tên trường đúng nếu tôi đoán
        // sai - đúng khuôn gexDiagnosis()/describeRecord() ở các probe khác.
        quoteKeys: quote ? Object.keys(quote) : [],
      };
    });
    const resolved = tried.find((t) => t.quoted) ?? null;
    results[ind.key] = { label: ind.label, tried, resolvedSymbol: resolved?.symbol ?? null };
  }

  // Câu hỏi 2, chỉ hỏi cho mã ĐÃ quote được - lịch sử trong ngày (nến phút),
  // thứ cần có để vẽ biểu đồ giống ảnh tapchiphowall thay vì một con số trơ.
  await Promise.all(
    Object.values(results).map(async (r: any) => {
      if (!r.resolvedSymbol) {
        r.intraday = { checked: false, reason: 'no resolved symbol to check' };
        return;
      }
      try {
        const hist = await intradayHistory(r.resolvedSymbol, 5);
        const candles = Array.isArray(hist?.candles) ? hist.candles : [];
        r.intraday = {
          checked: true,
          ok: true,
          candleCount: candles.length,
          firstCandleKeys: candles[0] ? Object.keys(candles[0]) : [],
          firstCandleTypes: candles[0]
            ? Object.fromEntries(Object.entries(candles[0]).map(([k, v]) => [k, typeOf(v)]))
            : {},
          sample: candles.length ? JSON.stringify(candles[Math.floor(candles.length / 2)]).slice(0, 200) : null,
        };
      } catch (e: any) {
        r.intraday = { checked: true, ok: false, error: String(e?.message ?? e).slice(0, 200) };
      }
    })
  );

  return Response.json({
    note:
      'results[key].resolvedSymbol null nghĩa là KHÔNG cách viết nào trong "tried" được Schwab quote - ' +
      'chỉ báo đó có thể không tồn tại trên Trader API dù có trên thinkorswim. ' +
      'results[key].intraday.ok=false hoặc candleCount=0 nghĩa là quote được nhưng KHÔNG vẽ được biểu đồ ' +
      'trong ngày từ /pricehistory - lúc đó chỉ hiện được một con số, không vẽ được đường như ảnh mẫu.',
    schwabErrors: (q as any).errors ?? null,
    results,
  });
}
