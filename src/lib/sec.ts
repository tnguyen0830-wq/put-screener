import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * Máy khách dùng chung cho SEC EDGAR.
 *
 * Cùng vai trò với lib/schwab.ts nhưng cho SEC: một bộ giới hạn tốc độ, một
 * chỗ đặt tiêu đề bắt buộc, một kiểu lỗi. Không có OAuth - dữ liệu SEC là
 * công khai, thứ duy nhất bắt buộc là tự khai danh tính trong User-Agent.
 */

/**
 * SEC yêu cầu mọi request tự khai danh tính, nếu không sẽ trả 403 kèm một
 * trang HTML chứ không phải JSON. Không mặc định bằng email của chủ app:
 * email đó chỉ dùng để nhận diện người dùng, không tự ý gửi ra dịch vụ
 * ngoài. Đặt SEC_USER_AGENT trong Render nếu muốn khai đúng chuẩn SEC
 * ("Tên công ty email@tenmien.com").
 */
function userAgent(): string {
  return process.env.SEC_USER_AGENT || 'tyler-investment-tool put-screener';
}

/** SEC ghi rõ trần 10 request/giây. Ở dưới trần một nhịp cho chắc. */
class RateLimiter {
  private times: number[] = [];
  constructor(private max: number, private windowMs: number) {}
  async take() {
    for (;;) {
      const now = Date.now();
      this.times = this.times.filter((t) => now - t < this.windowMs);
      if (this.times.length < this.max) {
        this.times.push(now);
        return;
      }
      await new Promise((r) => setTimeout(r, this.windowMs - (now - this.times[0]) + 25));
    }
  }
}
const limiter = new RateLimiter(8, 1000);

export class SecError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    /** Vài trăm ký tự đầu của phần thân, để phân biệt 403-thiếu-User-Agent
     *  với 404-sai-đường-dẫn mà không phải đoán. */
    readonly body?: string
  ) {
    super(message);
    this.name = 'SecError';
  }
}

async function getJson(url: string): Promise<any> {
  await limiter.take();
  const res = await fetch(url, {
    headers: {
      'User-Agent': userAgent(),
      'Accept-Encoding': 'gzip, deflate',
      Accept: 'application/json',
    },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new SecError(`SEC ${res.status} cho ${url}`, res.status, text.slice(0, 300));
  }
  try {
    return JSON.parse(text);
  } catch {
    // SEC trả HTML khi chặn hoặc khi đường dẫn sai. Nói ra nó trả cái gì,
    // đừng để lỗi hiện thành "Unexpected token <".
    throw new SecError(
      `SEC trả về thứ không phải JSON cho ${url}`,
      res.status,
      text.slice(0, 300)
    );
  }
}

/** Lấy nguyên văn một file (Form 4 là XML, không phải JSON). */
export async function getText(url: string): Promise<string> {
  await limiter.take();
  const res = await fetch(url, {
    headers: { 'User-Agent': userAgent(), 'Accept-Encoding': 'gzip, deflate' },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new SecError(`SEC ${res.status} cho ${url}`, res.status, text.slice(0, 300));
  }
  return text;
}

/**
 * CIK trong file danh bạ là SỐ, không có số 0 ở đầu (320193), nhưng mọi
 * đường dẫn của data.sec.gov lại đòi đúng 10 chữ số có đệm 0
 * (CIK0000320193). Đây là chỗ dễ sai nhất trong toàn bộ phần SEC, nên nó
 * được tách ra thành một hàm có tên rõ ràng thay vì rải padStart khắp nơi.
 */
export function padCik(cik: number | string): string {
  return String(cik).replace(/\D/g, '').padStart(10, '0');
}

const CIK_MAP_PATH = path.resolve('./.cache/sec-cik-map.json');
const CIK_MAP_URL = 'https://www.sec.gov/files/company_tickers.json';
/** Danh bạ chỉ đổi khi có mã lên/xuống sàn. Một ngày một lần là quá đủ. */
const CIK_MAP_TTL_MS = 24 * 60 * 60 * 1000;

export type CikMap = Record<string, string>;

let memo: { at: number; map: CikMap } | null = null;

/**
 * Đọc danh bạ mã chứng khoán -> CIK.
 *
 * Cấu trúc thật của file (đã đối chiếu bản tải về):
 *   {"0":{"cik_str":1045810,"ticker":"NVDA","title":"NVIDIA CORP"}, "1":{...}}
 * Tức là một ĐỐI TƯỢNG đánh số bằng chuỗi "0","1",... chứ không phải mảng,
 * và "cik_str" bất chấp cái tên lại là kiểu số. Cả hai đều là bẫy nên được
 * ghi lại ở đây.
 */
export async function cikMap(): Promise<CikMap> {
  if (memo && Date.now() - memo.at < CIK_MAP_TTL_MS) return memo.map;

  const disk = await readCikCache();
  if (disk && Date.now() - disk.at < CIK_MAP_TTL_MS) {
    memo = disk;
    return disk.map;
  }

  try {
    const map = parseCikMap(await getJson(CIK_MAP_URL));
    memo = { at: Date.now(), map };
    await fs.mkdir(path.dirname(CIK_MAP_PATH), { recursive: true });
    await fs.writeFile(CIK_MAP_PATH, JSON.stringify(memo));
    return map;
  } catch (e) {
    // Danh bạ cũ vẫn dùng được: mã chứng khoán không đổi CIK. Bản cũ tốt
    // hơn hẳn việc không tra được mã nào.
    if (disk) {
      memo = disk;
      return disk.map;
    }
    throw e;
  }
}

/** Tách riêng để kiểm thử được mà không cần chạm mạng. */
export function parseCikMap(raw: any): CikMap {
  const rows = raw && typeof raw === 'object' ? Object.values(raw) : [];
  const map: CikMap = {};
  for (const r of rows as any[]) {
    if (!r || typeof r !== 'object') continue;
    const ticker = typeof r.ticker === 'string' ? r.ticker.trim().toUpperCase() : '';
    if (!ticker || r.cik_str === undefined || r.cik_str === null) continue;
    map[ticker] = padCik(r.cik_str);
  }
  if (!Object.keys(map).length) {
    // Không đoán bừa là "SEC hết mã". Nói ra file thật sự trông thế nào.
    const sample = (rows as any[])[0];
    throw new SecError(
      'Danh bạ CIK của SEC không có mã nào đọc được — có thể SEC đã đổi cấu trúc file. ' +
        `Khoá ở phần tử đầu: ${sample ? Object.keys(sample).join(', ') : '(rỗng)'}`
    );
  }
  return map;
}

async function readCikCache(): Promise<{ at: number; map: CikMap } | null> {
  try {
    const j = JSON.parse(await fs.readFile(CIK_MAP_PATH, 'utf8'));
    if (j && typeof j.at === 'number' && j.map && Object.keys(j.map).length) return j;
  } catch {
    /* chưa tải lần nào */
  }
  return null;
}

/** Tra CIK cho một danh sách mã. Mã không có trong danh bạ được trả riêng. */
export async function ciksFor(
  symbols: string[]
): Promise<{ found: Record<string, string>; missing: string[] }> {
  const map = await cikMap();
  const found: Record<string, string> = {};
  const missing: string[] = [];
  for (const s of symbols) {
    const key = s.trim().toUpperCase();
    const cik = map[key];
    // Mã không tra được thì nói ra, đừng lặng lẽ bỏ: ETF (QQQ, SPY) không
    // có CIK kiểu này và cũng không có ai nộp Form 4, nên chúng phải hiện
    // ra là "không có dữ liệu" chứ không phải "không có sếp nào mua".
    if (cik) found[key] = cik;
    else missing.push(key);
  }
  return { found, missing };
}

/** Chỉ dùng cho kiểm thử. */
export function __resetSec() {
  memo = null;
}

/* ------------------------------------------------------------------ */
/* Danh sách hồ sơ đã nộp                                              */
/* ------------------------------------------------------------------ */

export type Filing = {
  accessionNumber: string;
  form: string;
  filingDate: string;
  reportDate: string;
  primaryDocument: string;
};

/**
 * `filings.recent` KHÔNG phải danh sách các hồ sơ.
 *
 * Nó là một bó mảng SONG SONG - `form[3]` là loại của hồ sơ mà số hiệu
 * nằm ở `accessionNumber[3]`, ngày nằm ở `filingDate[3]`. Đọc nhầm thành
 * mảng các đối tượng là ra rỗng chứ không ra lỗi, nên chỗ này được ghép
 * lại thành đối tượng ngay tại đây, một lần.
 *
 * Bên cạnh `recent` còn có `filings.files` chứa các hồ sơ cũ hơn đã bị
 * đẩy sang file riêng. Không dùng tới: `recent` giữ khoảng một năm gần
 * nhất, mà tín hiệu người nội bộ mua thì chỉ có nghĩa khi còn mới.
 */
export function parseRecentFilings(raw: any): Filing[] {
  const r = raw?.filings?.recent;
  const acc: string[] = r?.accessionNumber ?? [];
  const form: string[] = r?.form ?? [];
  if (!Array.isArray(acc) || !Array.isArray(form) || !acc.length) {
    throw new SecError(
      'Không đọc được filings.recent của SEC — có thể cấu trúc đã đổi. ' +
        `Khoá thấy được: ${r && typeof r === 'object' ? Object.keys(r).join(', ') : '(không có filings.recent)'}`
    );
  }
  const filingDate: string[] = r.filingDate ?? [];
  const reportDate: string[] = r.reportDate ?? [];
  const primaryDocument: string[] = r.primaryDocument ?? [];
  return acc.map((accessionNumber, i) => ({
    accessionNumber,
    form: form[i] ?? '',
    filingDate: filingDate[i] ?? '',
    reportDate: reportDate[i] ?? '',
    primaryDocument: primaryDocument[i] ?? '',
  }));
}

/** Hồ sơ gần đây của một công ty. `cik` nhận cả dạng đệm 0 lẫn không. */
export async function recentFilings(cik: string | number): Promise<Filing[]> {
  const raw = await getJson(`https://data.sec.gov/submissions/CIK${padCik(cik)}.json`);
  return parseRecentFilings(raw);
}

/** Lọc ra Form 4 nộp trong `days` ngày gần nhất. */
export function form4sSince(filings: Filing[], days: number, now = Date.now()): Filing[] {
  const cutoff = now - days * 24 * 60 * 60 * 1000;
  return filings.filter(
    (f) =>
      // Đúng "4", không phải "4/A" (bản sửa) - bản sửa cần xử lý riêng vì
      // nó thay thế hồ sơ cũ chứ không cộng thêm vào.
      f.form === '4' &&
      f.filingDate &&
      Date.parse(f.filingDate + 'T00:00:00Z') >= cutoff
  );
}
