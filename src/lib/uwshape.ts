/**
 * Đọc HÌNH DẠNG một payload Unusual Whales: khoá, kiểu, có theo strike
 * không, có gamma/delta/cơ sở không.
 *
 * Nằm ở lib chứ không ở trong route, vì đây là logic THUẦN và nó sinh ra
 * một KẾT LUẬN chủ app sẽ hành động theo (`usableForExposure`). Một cái
 * `true` sai đẩy chủ app đi viết cả một đường dữ liệu mới cho một endpoint
 * không dùng được — nên nó phải test được mà không cần mạng, đúng lối
 * `internals-pure.ts` và `airead.ts`. File này KHÔNG import gì.
 */

/** Tên trường hay dùng cho strike.
 *
 *  CỐ TÌNH KHÔNG có 'price' trong này. Bản đầu có, và nó báo nhầm:
 *  `spot-exposures` trả về trường `price` là GIÁ SPOT tại thời điểm đó, không
 *  phải strike - đúng như tên endpoint. Probe khi ấy kêu looksPerStrike=true
 *  cho một endpoint hoàn toàn không theo strike. Một cái nhãn sai còn tệ hơn
 *  không có nhãn, vì nó khiến người đọc tin vào kết luận sai. */
const STRIKE_HINTS = ['strike'];
/** `gex` có trong danh sách này, và việc nó THIẾU ở vòng đo đầu là một lỗi
 *  THẬT của probe — không phải chi tiết.
 *
 *  `greek-exposure/strike` trả `call_gex`/`put_gex`, tức gamma exposure ĐÃ
 *  NHÂN sẵn, theo từng strike (802 dòng cho SPX, 483 cho SPY). Đó chính là
 *  endpoint đáng giá nhất trong cả vòng đo. Vì hint thiếu chữ `gex`, probe
 *  báo `gammaKeys` chỉ có charm/vanna rồi kết luận `usableForExposure:
 *  false` — một BÁO NHẦM ÂM, tức nói "không dùng được" về thứ dùng được.
 *
 *  Cùng một lớp lỗi với vụ `price` bị tính là strike ở #106, chỉ ngược
 *  chiều: lần đó nhãn sai nói CÓ, lần này nhãn sai nói KHÔNG. Cái sau nguy
 *  hiểm hơn vì nó im lặng — một endpoint tốt bị loại khỏi bảng và không ai
 *  đi kiểm lại. */
const GAMMA_HINTS = [
  'gamma', 'call_gamma', 'put_gamma', 'gamma_exposure', 'gex', 'charm', 'vanna',
];
/** Phơi nhiễm ĐÃ NHÂN SẴN. Tách riêng khỏi GAMMA_HINTS vì nó đổi hẳn phép
 *  kiểm bên dưới: `gamma` thô thì PHẢI có OI hoặc khối lượng để nhân, còn
 *  `gex` thì UW đã nhân rồi — đòi thêm một cơ sở nữa là đòi thứ không tồn
 *  tại, và đó đúng là cách vòng đo đầu tự loại mất endpoint tốt nhất. */
const EXPOSURE_HINTS = ['gex', 'exposure', 'per_one_percent_move'];
/** Tách RIÊNG khỏi GAMMA_HINTS, vì chủ app hỏi tab "Gamma VÀ Delta". Gộp
 *  vào một danh sách thì một endpoint chỉ có gamma và một endpoint có cả
 *  hai đọc ra giống hệt nhau, mà panel 3 (delta theo strike) cần đúng vế
 *  delta. `delta` để trước nên khớp cả `call_delta`/`delta_exposure`. */
const DELTA_HINTS = ['delta'];
/** Open interest và khối lượng: hai CƠ SỞ của `mmexposure.ts`. Một endpoint
 *  có greek mà không có OI thì vẫn không dựng được bảng — gamma × OI mới ra
 *  phơi nhiễm, nên thiếu vế này là thiếu một nửa phép tính. */
const SIZE_HINTS = ['open_interest', 'oi', 'volume'];

export function describeShape(payload: any) {
  const topLevelKeys = Object.keys(payload ?? {});
  // UW bọc trong { data: ... } ở hầu hết endpoint, nhưng không phải tất cả -
  // chấp nhận cả hai, cùng cách phòng thủ như uwgex.ts.
  const body = payload?.data ?? payload;
  const isArray = Array.isArray(body);
  const rows: any[] = isArray ? body : [];
  const first = rows[0];
  const recordKeys = first && typeof first === 'object' ? Object.keys(first) : [];

  const has = (hints: string[]) =>
    recordKeys.filter((k) => hints.some((h) => k.toLowerCase().includes(h)));

  const strikeKeys = has(STRIKE_HINTS);
  const distinctStrikes = strikeKeys.length
    ? new Set(rows.map((r) => r?.[strikeKeys[0]])).size
    : 0;

  /* `option-contracts` KHÔNG có trường strike — strike nằm TRONG mã hợp
     đồng (`SPY260922P00773000` → 8 chữ số cuối / 1000 = 773). Phép đo đầu
     vì thế báo `looksPerStrike: false` cho một chuỗi quyền chọn đầy đủ, mà
     đó lại là endpoint duy nhất trả greek THÔ kèm OI và khối lượng — tức
     đường DUY NHẤT dùng lại được `computeGex()` nguyên si.
     Đây là phép đo, không phải phép đoán: nếu bóc được strike từ mã hợp
     đồng thì nói ra, còn không thì để null chứ không suy ra từ gì khác. */
  const symbolKeys = recordKeys.filter((k) =>
    ['option_symbol', 'call_option_symbol', 'put_option_symbol'].includes(k.toLowerCase())
  );
  let strikesFromSymbol: number | null = null;
  if (symbolKeys.length && rows.length) {
    const seen = new Set<number>();
    for (const r of rows) {
      const m = /^[A-Z]{1,6}\d{6}[CP](\d{8})$/.exec(String(r?.[symbolKeys[0]] ?? ''));
      if (m) seen.add(Number(m[1]) / 1000);
    }
    strikesFromSymbol = seen.size || null;
  }

  /* Một endpoint có `price` + một trường thời gian có thể là HAI thứ khác
     hẳn nhau, và chỉ đếm tổng số giá thì không phân biệt được:

       (a) đường cong theo giá TẠI MỘT thời điểm - nhiều `price` cùng chung
           một mốc thời gian. Vẽ được bản đồ gamma theo mức giá.
       (b) chuỗi thời gian của giá spot - mỗi mốc thời gian đúng một `price`.
           Không vẽ được gì theo giá.

     Phân biệt bằng cách nhóm theo mốc thời gian rồi đếm số giá TRONG một
     nhóm. Đây chính là câu hỏi còn treo sau lần đo đầu với spot-exposures
     (564 dòng, 11 giá: 51 mốc × 11 giá, hay 564 mốc?). */
  /* Thứ tự ƯU TIÊN, không phải thứ tự xuất hiện trong bản ghi. `start_time`
     là mốc GOM NHÓM, còn `time` là dấu thời gian riêng của từng dòng - gom
     theo `time` thì mỗi nhóm đúng một dòng và phép đo thành vô nghĩa. Bản
     đầu lấy theo thứ tự khoá trong bản ghi, mà production trả về `time`
     đứng trước `start_time`, nên rơi đúng vào cái bẫy đó. */
  /* `date` bị ĐẨY XUỐNG CUỐI sau phép đo SPY: `spot-exposures/strike` mang
     CẢ `date` lẫn `time`, mà `date` chỉ có một giá trị cho cả 50 dòng — gom
     theo nó thì 50 dòng vào một nhóm và `looksLikePriceCurve` báo `true`
     cho một bảng thật ra là strike × vài mốc thời gian. Cùng đúng cái bẫy
     đã ghi ở trên với `time` vs `start_time`, chỉ khác khoá. Thứ tự đúng là
     từ MỊN tới THÔ: mốc riêng của dòng trước, ngày chung sau cùng. */
  const TIME_PREFERENCE = ['start_time', 'timestamp', 'time', 'date'];
  const timeKeys = TIME_PREFERENCE.filter((p) =>
    recordKeys.some((k) => k.toLowerCase() === p)
  ).map((p) => recordKeys.find((k) => k.toLowerCase() === p)!);
  const priceKeys = recordKeys.filter((k) => k.toLowerCase() === 'price');
  let curveShape: Record<string, unknown> | null = null;
  if (timeKeys.length && priceKeys.length && rows.length) {
    const tk = timeKeys[0];
    const pk = priceKeys[0];
    const buckets = new Map<string, Set<unknown>>();
    for (const r of rows) {
      const t = String(r?.[tk]);
      if (!buckets.has(t)) buckets.set(t, new Set());
      buckets.get(t)!.add(r?.[pk]);
    }
    const sizes = [...buckets.values()].map((v) => v.size);
    curveShape = {
      groupedBy: tk,
      timestamps: buckets.size,
      pricesPerTimestampMax: Math.max(...sizes),
      pricesPerTimestampMin: Math.min(...sizes),
      // Đây là câu trả lời: nhiều giá trong CÙNG một mốc thời gian nghĩa là
      // có một đường cong theo giá, vẽ được.
      looksLikePriceCurve: Math.max(...sizes) > 1,
    };
  }

  return {
    topLevelKeys,
    dataIsArray: isArray,
    rowCount: isArray ? rows.length : null,
    recordKeys,
    // Trả lời thẳng câu hỏi duy nhất đáng hỏi. Chỉ tính trường có chữ
    // "strike" trong tên - xem chú thích ở STRIKE_HINTS về lần báo nhầm.
    looksPerStrike: strikeKeys.length > 0 && distinctStrikes > 1,
    strikeKeys,
    distinctStrikes,
    /** Số strike bóc được từ mã hợp đồng OSI khi không có trường strike.
     *  null = payload không mang mã hợp đồng nào đọc được. */
    strikesFromSymbol,
    /** Chỉ có khi payload vừa có thời gian vừa có `price` - phân biệt đường
     *  cong theo giá với chuỗi thời gian. null = không áp dụng. */
    curveShape,
    gammaKeys: has(GAMMA_HINTS),
    deltaKeys: has(DELTA_HINTS),
    sizeKeys: has(SIZE_HINTS),
    /* Kết luận gộp, để đọc một dòng là biết có thay được CBOE cho SPX
       không: theo strike + có gamma + có một cơ sở để nhân. Thiếu delta
       KHÔNG làm mất tư cách — panel 1 và 2 chỉ cần gamma; delta là panel 3,
       nên nó được ĐẾM RIÊNG thay vì kéo cả kết luận xuống. */
    /** ĐÃ NHÂN SẴN hay chưa — quyết định phép kiểm bên dưới, và cũng là
     *  thứ quyết định có phải tự tính hay không. */
    preMultiplied: has(EXPOSURE_HINTS).length > 0,
    usableForExposure:
      strikeKeys.length > 0 &&
      distinctStrikes > 1 &&
      has(GAMMA_HINTS).length > 0 &&
      // Greek THÔ cần một cơ sở để nhân (phơi nhiễm = gamma × OI); greek ĐÃ
      // NHÂN thì không. Gộp hai ca này vào một điều kiện là loại oan đúng
      // những endpoint trả thẳng exposure — lỗi của vòng đo đầu.
      (has(EXPOSURE_HINTS).length > 0 || has(SIZE_HINTS).length > 0),
    /** Chuỗi quyền chọn THÔ: greek chưa nhân + OI/khối lượng + mã hợp đồng
     *  mang strike. Cờ này tách khỏi `usableForExposure` vì nó trả lời một
     *  câu KHÁC và là câu tốt hơn: không phải "vẽ được panel không" mà
     *  "chuyển được sang hình dạng chuỗi Schwab không" — tức dùng lại được
     *  `computeGex()`, `mmexposure.ts`, trade briefing và 0DTE nguyên si,
     *  với ĐƠN VỊ và QUY ƯỚC DẤU của chính app. Một endpoint đã-nhân-sẵn
     *  không làm được việc đó dù `usableForExposure` là true. */
    usableAsRawChain:
      (strikesFromSymbol ?? 0) > 1 &&
      has(['gamma']).length > 0 &&
      has(['delta']).length > 0 &&
      has(SIZE_HINTS).length > 0 &&
      has(EXPOSURE_HINTS).length === 0,
    /** Một bản ghi thật kèm KIỂU của từng trường - chỉ có kiểu mới phân biệt
     *  "không gửi" với "gửi dưới dạng chuỗi", đúng bài học từ #97. */
    sampleTypes:
      first && typeof first === 'object'
        ? Object.fromEntries(Object.entries(first).map(([k, v]) => [k, typeof v]))
        : typeof first,
    sample: JSON.stringify(first ?? body).slice(0, 500),
  };
}
