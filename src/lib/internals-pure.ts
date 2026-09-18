/**
 * Phần THUẦN của market internals (`internals.ts`) - tách riêng, KHÔNG import
 * gì khác, để biên dịch và test độc lập được (`internals.ts` kéo theo
 * `./alerts` -> `./portfolio` -> nhiều alias `@/lib/...`, phá vỡ cách biên
 * dịch một file rồi require() thẳng mà repo này dùng để test).
 */

export type SeriesPoint = { t: number; v: number };

export type Series = {
  key: string;
  label: string;
  points: SeriesPoint[];
  current: number | null;
  /** 'schwab' = nến phút thật của Schwab, làm mới mỗi lần gọi endpoint.
   *  'uw'     = chuỗi trong ngày lấy trọn một lượt từ Unusual Whales.
   *  'sampled' = app tự lấy mẫu ~15 phút/lần - đường THÔ hơn bản gốc, và
   *  màn hình phải nói ra điều đó chứ không được trông giống dữ liệu tick.
   *
   *  Đây là NHÃN NGUỒN hiện thẳng lên thẻ, không phải một cách phân loại
   *  nội bộ: market tide từng mang 'schwab' với ý "chuỗi đầy đủ", và màn
   *  hình dịch ra "nến thật (Schwab)" - một lời khẳng định sai về xuất xứ
   *  của con số. */
  source: 'schwab' | 'uw' | 'sampled';
  asOf: number | null;
  /** Với nguồn Schwab: con số đầu thẻ là `lastPrice` của `/quotes` (cùng
   *  trường thanh ticker in) hay giá đóng của nến 5 phút cuối (quote không
   *  trả về). Hai số lệch nhau vài xu, và một thẻ không nói thì người đọc
   *  thấy "chưa khớp" (#176). */
  currentSource?: 'quote' | 'candle';
  /** Vì sao chuỗi này rỗng, khi nó rỗng. Thiếu trường này thì một nguồn
   *  chết chỉ đơn giản là biến mất khỏi màn hình - không phân biệt được
   *  với "tính năng không tồn tại". */
  note?: string;
};

/**
 * Ghép hai chuỗi theo CHỈ SỐ, không theo mốc thời gian: hai chuỗi đến từ
 * cùng một lưới nến (cùng phiên, cùng tần suất phút), nên cùng độ dài là
 * điều đo được thật (#165: cả bốn mã đều ra đúng 78 nến) - ghép theo `t` sẽ
 * vỡ nếu một bên thiếu đúng một nến ở đầu hay cuối do làm tròn giờ khác
 * nhau.
 */
export function diffSeries(a: SeriesPoint[], b: SeriesPoint[]): SeriesPoint[] {
  const n = Math.min(a.length, b.length);
  const out: SeriesPoint[] = [];
  for (let i = 0; i < n; i++) out.push({ t: a[i].t, v: a[i].v - b[i].v });
  return out;
}

/** Hiệu số của hai giá trị CHƯA BIẾT ĐƯỢC - null nếu MỘT trong hai còn
 *  thiếu, chứ không lặng lẽ coi giá trị thiếu là 0 (0 thật và "chưa biết"
 *  phải khác nhau, đúng luật #131/#142 ở nơi khác trong repo). */
export function diffOrNull(a: number | null, b: number | null): number | null {
  return a !== null && b !== null ? a - b : null;
}

/** Trường có tồn tại hay không - kiểm typeof, không kiểm truthy. NYSE TICK
 *  và ADV-DECL có thể đúng lúc bằng 0 THẬT (#165's own probe already pinned
 *  this), một phép kiểm truthy sẽ đọc 0 thật thành "Schwab không trả". */
export function numField(q: Record<string, any>, symbol: string): number | null {
  const v = q[symbol]?.quote?.lastPrice;
  return typeof v === 'number' ? v : null;
}

/** Trung bình các giá trị ĐÃ BIẾT, bỏ qua `null` - không coi mã thiếu là 0
 *  (một rổ 500 mã mà 400 mã thiếu IV rank sẽ kéo trung bình về gần 0 nếu
 *  null bị tính như 0, một con số sai trông y như con số đúng). Rỗng hoặc
 *  toàn null trả về `null`, không trả `0` (0 là một giá trị thật). */
export function meanOf(values: (number | null)[]): number | null {
  const known = values.filter((v): v is number => v !== null && Number.isFinite(v));
  if (!known.length) return null;
  return known.reduce((a, b) => a + b, 0) / known.length;
}

/* ------------------------------------------------------------------ *
 *  Bảng phụ của tab Bề rộng TT (#177): tỉ lệ up/down volume, biến động
 *  theo ngành, top vốn hoá. Thuần, test độc lập.
 * ------------------------------------------------------------------ */

/**
 * Tỉ lệ khối lượng tăng/giảm theo đúng quy ước tapchiphowall in trên ô
 * UVOL−DVOL: "1.38:1" khi khối lượng tăng lớn hơn, "-2.94:1" khi khối
 * lượng GIẢM lớn hơn (dấu âm = phe bán thắng, con số = gấp bao nhiêu lần).
 * Thiếu một vế, hoặc vế bị chia bằng 0, ra `null` chứ không ra 0 hay
 * Infinity - một tỉ lệ 0:1 đọc thành "không ai mua", mà thật ra là "chưa
 * biết".
 */
export function upDownRatio(up: number | null, down: number | null): number | null {
  if (up === null || down === null) return null;
  if (!Number.isFinite(up) || !Number.isFinite(down) || up <= 0 || down <= 0) return null;
  return up >= down ? up / down : -(down / up);
}

export function fmtRatio(r: number | null): string {
  if (r === null) return '—';
  return `${r < 0 ? '-' : ''}${Math.abs(r).toFixed(2)}:1`;
}

export type CapRow = { symbol: string; sector: string; marketCap: number; change1d: number };
export type SectorChange = { name: string; change: number; count: number };

/**
 * Biến động 1 ngày theo ngành, trung bình CÓ TRỌNG SỐ vốn hoá - đúng cách
 * `/api/heatmap` gộp (một chỉ số theo vốn hoá vận động thế), không phải
 * trung bình cộng. Xếp giảm dần theo biến động, như bảng "S&P 500 SECTORS"
 * của trang mẫu. Ngành có vốn hoá tổng 0 (không thể, nhưng số 0 không được
 * chia) bị bỏ chứ không ra NaN.
 */
export function sectorChanges(rows: CapRow[]): SectorChange[] {
  const acc = new Map<string, { cap: number; weighted: number; count: number }>();
  for (const r of rows) {
    if (!Number.isFinite(r.marketCap) || r.marketCap <= 0 || !Number.isFinite(r.change1d)) continue;
    const a = acc.get(r.sector) ?? { cap: 0, weighted: 0, count: 0 };
    a.cap += r.marketCap;
    a.weighted += r.marketCap * r.change1d;
    a.count += 1;
    acc.set(r.sector, a);
  }
  return [...acc.entries()]
    .filter(([, a]) => a.cap > 0)
    .map(([name, a]) => ({ name, change: a.weighted / a.cap, count: a.count }))
    .sort((x, y) => y.change - x.change);
}

/** N mã vốn hoá lớn nhất, xếp theo biến động 1 ngày giảm dần - cùng hình
 *  dạng bảng "NASDAQ 100 TOP 14" của trang mẫu, nhưng trên RỔ ĐANG CÓ
 *  (S&P 500): app không có danh sách thành phần NASDAQ 100, và một danh
 *  sách gõ tay từ trí nhớ là một danh sách sai trông y như danh sách đúng.
 *  Nhãn trên màn hình nói đúng rổ nào. */
export function topCaps(rows: CapRow[], n: number): { symbol: string; change: number }[] {
  return [...rows]
    .filter((r) => Number.isFinite(r.marketCap) && r.marketCap > 0 && Number.isFinite(r.change1d))
    .sort((a, b) => b.marketCap - a.marketCap)
    .slice(0, n)
    .map((r) => ({ symbol: r.symbol, change: r.change1d }))
    .sort((a, b) => b.change - a.change);
}

/**
 * Phiên chính thức của sàn (09:30–16:00 New York, thứ Hai–Sáu) - cho dòng
 * "Thị trường đã đóng cửa — đang hiển thị phiên gần nhất". KHÁC
 * `inMarketHours()` của alerts.ts (8h–18h, cố ý rộng để cảnh báo không bỏ
 * lỡ trước/sau giờ): ở đây câu hỏi là "sàn đang mở không", nên phải đúng
 * giờ sàn. Ngày lễ KHÔNG được xét - một ngày lễ rơi vào thứ Tư sẽ đọc là
 * "đang mở" dù không có nến nào; chú thích trên màn hình nói ra giới hạn đó.
 */
export function sessionOpenAt(now: Date): boolean {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  const weekday = get('weekday');
  if (weekday === 'Sat' || weekday === 'Sun') return false;
  const mins = (Number(get('hour')) % 24) * 60 + Number(get('minute'));
  return mins >= 9 * 60 + 30 && mins < 16 * 60;
}
