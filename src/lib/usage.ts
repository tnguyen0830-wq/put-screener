import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * Chi phí theo từng người: mỗi lần app THẬT SỰ gọi một dịch vụ tính tiền
 * (Claude, ElevenLabs) thì ghi lại tốn bao nhiêu và ai bấm.
 *
 * Chủ app hỏi: "trong account family tôi muốn có mục history của từng thành
 * viên coi họ làm những gì và tốn bao nhiêu credit". Nhật ký hoạt động
 * (`activity.ts`, #193) đã trả lời "làm những gì" — nhưng nó ghi TRƯỚC khi
 * gọi dịch vụ, nên không biết lượt đó tốn bao nhiêu. Kho này ghi SAU, từ
 * con số dịch vụ tự trả về:
 *
 *  - Claude: `usage` của chính câu trả lời (token vào, token ra — gồm cả
 *    token suy nghĩ, vì Anthropic tính tiền chúng như token ra — cache đọc
 *    và cache ghi), đổi ra USD theo bảng giá bên dưới.
 *  - ElevenLabs: số ký tự đã đọc — đúng đơn vị ElevenLabs trừ vào hạn mức
 *    tháng (`character_count` / `character_limit` của `/user/subscription`,
 *    đã đo ở #185). Lượt phát lại từ cache trên đĩa KHÔNG tốn gì và KHÔNG
 *    được ghi: ghi nó là cộng tiền cho một lượt không ai trả.
 *
 * **Vì sao một kho RIÊNG chứ không thêm trường vào `activity.log`**: nhật ký
 * hoạt động gộp các dòng giống nhau và chỉ giữ 14 ngày / 200 dòng mỗi
 * người — đúng cho câu "đang làm gì", sai cho câu "tháng này tốn bao nhiêu",
 * vì gộp/cắt là làm mất tiền khỏi phép cộng. Kho này không gộp gì, giữ 90
 * ngày.
 *
 * Cùng lối với `activity.ts` và vì cùng một phép đo (#193): mỗi lượt là một
 * `appendFile`, không giữ gì trong RAM — các route là các bundle riêng, mỗi
 * cái một bản sao module này. Đường dẫn suy từ thư mục của `SCAN_PATH`,
 * không có biến môi trường mới.
 */

const DIR = () => path.dirname(process.env.SCAN_PATH || './.cache/last-scan.json');
const LOG_FILE = () => path.join(DIR(), 'usage.log');

const MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000;
const MAX_BYTES = 2 * 1024 * 1024;

export type UsageProvider = 'anthropic' | 'elevenlabs';

export type UsageEvent = {
  at: string;
  user: string;
  /** Cùng bộ mã với nhật ký hoạt động (`ai`, `why`, `brief`, `tts`...), thêm
   *  `profile` cho bản dịch hồ sơ công ty tự chạy ở tab Analyze. */
  kind: string;
  detail?: string;
  provider: UsageProvider;
  /** Model THẬT trả lời (`final.model`), không phải model đã hỏi — với
   *  fallback phía server hai thứ có thể khác nhau. */
  model?: string;
  inTok?: number;
  outTok?: number;
  cacheRead?: number;
  cacheWrite?: number;
  chars?: number;
  /** USD ước tính. `null` = model không có trong bảng giá — KHÔNG phải 0,
   *  vì 0 đọc thành "miễn phí". */
  usd?: number | null;
};

/* ------------------------------ giá ------------------------------------- */

/**
 * USD cho MỘT TRIỆU token. Nguồn: bảng giá Anthropic trong tài liệu API
 * (bản lưu 2026-10-06). Cache ghi = 1,25× giá vào (TTL 5 phút mặc định),
 * cache đọc = 0,1× giá vào — riêng Opus 5.5 tài liệu ghi thẳng $0,20.
 *
 * Đây là ƯỚC TÍNH dựng lại từ token, không phải hoá đơn: con số trên Console
 * Anthropic mới là con số tính tiền. Model không có trong bảng thì `usd` là
 * `null` và màn hình nói ra, không đoán.
 */
export const PRICES: Record<string, { in: number; out: number; cacheRead: number; cacheWrite: number }> = {
  'claude-opus-5': { in: 5, out: 25, cacheRead: 0.5, cacheWrite: 6.25 },
  'claude-opus-5-5': { in: 4, out: 20, cacheRead: 0.2, cacheWrite: 5 },
  'claude-opus-4-8': { in: 5, out: 25, cacheRead: 0.5, cacheWrite: 6.25 },
  'claude-opus-4-7': { in: 5, out: 25, cacheRead: 0.5, cacheWrite: 6.25 },
  'claude-sonnet-5-5': { in: 2, out: 10, cacheRead: 0.2, cacheWrite: 2.5 },
  'claude-sonnet-5': { in: 2, out: 10, cacheRead: 0.2, cacheWrite: 2.5 },
  'claude-haiku-5-5': { in: 0.1, out: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
  'claude-fable-5-1': { in: 10, out: 50, cacheRead: 0.25, cacheWrite: 12.5 },
};

/** Model có thể trả về kèm hậu tố ngày; so theo tiền tố dài nhất có trong bảng. */
export function priceOf(model: string | undefined) {
  if (!model) return null;
  if (PRICES[model]) return PRICES[model];
  const keys = Object.keys(PRICES)
    .filter((k) => model.startsWith(`${k}-`) || model.startsWith(`${k}@`))
    .sort((a, b) => b.length - a.length);
  return keys.length ? PRICES[keys[0]] : null;
}

const n = (v: unknown): number => {
  const x = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(x) && x > 0 ? x : 0;
};

export type ClaudeTokens = { model?: string; inTok: number; outTok: number; cacheRead: number; cacheWrite: number; usd: number | null };

/**
 * Đọc `usage` của một câu trả lời Claude.
 *
 * Fallback phía server (`fallbacks: 'default'`) có thể cho HAI model chạy
 * trong một lượt; khi đó `usage.iterations` liệt kê từng lượt chạy. Hình
 * dạng trường đó chưa được đo trên tài khoản này, nên chỉ dùng nó khi MỌI
 * phần tử có model và đủ số token; không thì tính cả lượt theo `model` cuối
 * và nói rõ đó là ước tính.
 */
export function claudeTokens(msg: { model?: string; usage?: any } | null | undefined): ClaudeTokens | null {
  if (!msg || !msg.usage || typeof msg.usage !== 'object') return null;
  const u = msg.usage;
  const one = (model: string | undefined, x: any) => {
    const t = {
      inTok: n(x.input_tokens),
      outTok: n(x.output_tokens),
      cacheRead: n(x.cache_read_input_tokens),
      cacheWrite: n(x.cache_creation_input_tokens),
    };
    const p = priceOf(model);
    const usd = p
      ? (t.inTok * p.in + t.outTok * p.out + t.cacheRead * p.cacheRead + t.cacheWrite * p.cacheWrite) / 1e6
      : null;
    return { ...t, usd };
  };
  const its = Array.isArray(u.iterations) ? u.iterations : null;
  if (
    its &&
    its.length > 0 &&
    its.every((x: any) => x && typeof x.model === 'string' && (x.input_tokens != null || x.output_tokens != null))
  ) {
    const parts = its.map((x: any) => one(x.model, x));
    const sum = (k: 'inTok' | 'outTok' | 'cacheRead' | 'cacheWrite') => parts.reduce((a: number, p: any) => a + p[k], 0);
    const usd = parts.some((p: any) => p.usd === null) ? null : parts.reduce((a: number, p: any) => a + p.usd, 0);
    return { model: msg.model, inTok: sum('inTok'), outTok: sum('outTok'), cacheRead: sum('cacheRead'), cacheWrite: sum('cacheWrite'), usd };
  }
  return { model: msg.model, ...one(msg.model, u) };
}

/* ------------------------------ ghi ------------------------------------- */

async function append(ev: UsageEvent): Promise<void> {
  const file = LOG_FILE();
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.appendFile(file, JSON.stringify(ev) + '\n');
  try {
    const st = await fs.stat(file);
    if (st.size > MAX_BYTES) {
      const kept = pruneUsage(parseUsage(await fs.readFile(file, 'utf8')));
      const tmp = `${file}.tmp`;
      await fs.writeFile(tmp, kept.map((e) => JSON.stringify(e)).join('\n') + '\n');
      await fs.rename(tmp, file);
    }
  } catch {
    /* dọn hỏng thì lần sau dọn lại */
  }
}

/**
 * Ghi chi phí một lượt gọi Claude. Không bao giờ ném — mọi nơi gọi là đường
 * đi chính của một tính năng, và sổ chi phí hỏng không đáng làm hỏng nó.
 */
export async function recordClaude(
  user: string,
  kind: string,
  detail: string | undefined,
  msg: { model?: string; usage?: any } | null | undefined
): Promise<void> {
  try {
    const t = claudeTokens(msg);
    if (!t) return;
    const ev: UsageEvent = {
      at: new Date().toISOString(),
      user,
      kind,
      provider: 'anthropic',
      model: t.model,
      inTok: t.inTok,
      outTok: t.outTok,
      usd: t.usd === null ? null : Math.round(t.usd * 1e6) / 1e6,
    };
    if (t.cacheRead) ev.cacheRead = t.cacheRead;
    if (t.cacheWrite) ev.cacheWrite = t.cacheWrite;
    if (detail) ev.detail = detail.slice(0, 80);
    await append(ev);
  } catch {
    /* im lặng, có chủ ý */
  }
}

/** Ghi số ký tự ElevenLabs THẬT SỰ đã tổng hợp (không ghi lượt lấy từ cache). */
export async function recordEleven(user: string, chars: number, model: string, detail?: string): Promise<void> {
  try {
    if (!(chars > 0)) return;
    const ev: UsageEvent = { at: new Date().toISOString(), user, kind: 'tts', provider: 'elevenlabs', model, chars };
    if (detail) ev.detail = detail.slice(0, 80);
    await append(ev);
  } catch {
    /* như trên */
  }
}

/* ------------------------------ đọc (thuần) ----------------------------- */

export function parseUsage(text: string): UsageEvent[] {
  const out: UsageEvent[] = [];
  for (const line of text.split('\n')) {
    const s = line.trim();
    if (!s) continue;
    try {
      const e = JSON.parse(s);
      if (e && typeof e.at === 'string' && typeof e.user === 'string' && (e.provider === 'anthropic' || e.provider === 'elevenlabs')) {
        out.push(e as UsageEvent);
      }
    } catch {
      /* dòng cụt — bỏ */
    }
  }
  return out;
}

/** Giữ 90 ngày; bỏ dấu thời gian hỏng. Giữ nguyên thứ tự. */
export function pruneUsage(events: readonly UsageEvent[], now = Date.now()): UsageEvent[] {
  return events.filter((e) => {
    const t = new Date(e.at).getTime();
    return Number.isFinite(t) && now - t <= MAX_AGE_MS;
  });
}

export type UsageTotals = {
  calls: number;
  usd: number;
  /** Số lượt Claude không có giá (model lạ) — tiền của chúng KHÔNG nằm trong `usd`. */
  unpriced: number;
  inTok: number;
  outTok: number;
  chars: number;
};

export type UserUsage = { today: UsageTotals; d7: UsageTotals; d30: UsageTotals };

const empty = (): UsageTotals => ({ calls: 0, usd: 0, unpriced: 0, inTok: 0, outTok: 0, chars: 0 });

/** Ngày theo New York — "hôm nay" của app luôn là ngày giao dịch NY, không
 *  phải ngày UTC của máy chủ Render. */
export function nyDay(ms: number): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));
}

export function summarize(events: readonly UsageEvent[], now = Date.now()): Record<string, UserUsage> {
  const out: Record<string, UserUsage> = {};
  const today = nyDay(now);
  for (const e of events) {
    const t = new Date(e.at).getTime();
    if (!Number.isFinite(t) || t > now + 60_000) continue;
    const u = (out[e.user] ??= { today: empty(), d7: empty(), d30: empty() });
    const buckets: UsageTotals[] = [];
    if (now - t <= 30 * 86_400_000) buckets.push(u.d30);
    if (now - t <= 7 * 86_400_000) buckets.push(u.d7);
    if (nyDay(t) === today) buckets.push(u.today);
    for (const b of buckets) {
      b.calls += 1;
      if (e.provider === 'anthropic') {
        if (typeof e.usd === 'number') b.usd += e.usd;
        else b.unpriced += 1;
        b.inTok += e.inTok ?? 0;
        b.outTok += e.outTok ?? 0;
      } else {
        b.chars += e.chars ?? 0;
      }
    }
  }
  return out;
}

export async function readUsage(now = Date.now()): Promise<UsageEvent[]> {
  try {
    return pruneUsage(parseUsage(await fs.readFile(LOG_FILE(), 'utf8')), now);
  } catch {
    /* chưa có file = chưa ghi được gì; màn hình nói sổ bắt đầu từ lần deploy này */
    return [];
  }
}
