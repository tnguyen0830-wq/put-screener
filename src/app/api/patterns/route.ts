import fs from 'node:fs/promises';
import path from 'node:path';
import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/userstore';
import { logActivity } from '@/lib/activity';
import { readWatchlist } from '@/lib/watchlist';
import { symbolPatterns } from '@/lib/patternscan';
import { savePatScan, type PatRow } from '@/lib/pat-store';

export const dynamic = 'force-dynamic';

/**
 * Quét mẫu hình cho cả danh sách (watchlist hoặc rổ S&P 500), NDJSON.
 *
 * Không có tầng 0 rẻ như Long-term: mẫu hình cần nến, và nến là một request
 * mỗi mã (cache theo ngày, chung với Long-term). Cả rổ lần đầu trong ngày là
 * ~503 request qua RateLimiter 100/phút — vài phút; màn hình nói trước. Lần
 * hai trong ngày (hoặc sau một lượt Long-term cả rổ) đọc từ đĩa, gần như tức
 * thì.
 *
 * Chỉ phát mã CÓ mẫu; mã không có mẫu chỉ đếm vào `scanned`. Mã bỏ qua (không
 * lịch sử, lỗi Schwab) ĐẾM THEO LÝ DO — một mã biến mất trông y hệt một mã
 * không có mẫu, mà hai chuyện đó khác nhau.
 */
type Event =
  | { type: 'phase'; phase: string; total?: number }
  | { type: 'progress'; done: number; total: number }
  | { type: 'candidate'; row: PatRow }
  | { type: 'error'; message: string }
  | { type: 'done'; scanned: number; kept: number; at: string; skipped: Record<string, number> };

type Constituent = { symbol: string; name: string; sector: string };

async function constituents(): Promise<Constituent[]> {
  const raw = await fs.readFile(path.resolve(process.cwd(), 'data/sp500.json'), 'utf8');
  return JSON.parse(raw);
}

async function pooled<T>(items: T[], size: number, worker: (item: T) => Promise<void>) {
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (i < items.length) await worker(items[i++]);
    })
  );
}

export async function GET(req: NextRequest) {
  const user = await requireUser(req);
  if (!user) return NextResponse.json({ error: 'ACCOUNT_GONE' }, { status: 401 });
  const universe = req.nextUrl.searchParams.get('universe') === 'sp500' ? 'sp500' : 'watchlist';
  await logActivity(user, 'patscan', universe);

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (e: Event) => controller.enqueue(encoder.encode(JSON.stringify(e) + '\n'));
      try {
        let list: Constituent[];
        if (universe === 'watchlist') {
          const syms = await readWatchlist(user);
          let bySymbol = new Map<string, Constituent>();
          try { bySymbol = new Map((await constituents()).map((c) => [c.symbol, c])); } catch { /* tên/ngành để trống */ }
          list = syms.map((s) => bySymbol.get(s) ?? { symbol: s, name: s, sector: '' });
        } else {
          list = await constituents();
        }
        send({ type: 'phase', phase: 'candles', total: list.length });
        const rows: PatRow[] = [];
        const skipped: Record<string, number> = {};
        let done = 0;
        await pooled(list, 6, async (c) => {
          try {
            const r = await symbolPatterns(c.symbol);
            if (r.row.bars < 60) { skipped['short-history'] = (skipped['short-history'] ?? 0) + 1; return; }
            if (r.row.detections.length) rows.push({ ...r.row, name: c.name, sector: c.sector });
          } catch (e: any) {
            const msg = String(e?.message ?? e);
            /* Hết phiên Schwab là một lý do RIÊNG (cách sửa: kết nối lại). */
            const key = msg.includes('REAUTH_REQUIRED') ? 'REAUTH_REQUIRED' : 'error';
            skipped[key] = (skipped[key] ?? 0) + 1;
          } finally {
            send({ type: 'progress', done: ++done, total: list.length });
          }
        });
        rows.sort((a, b) => b.weight - a.weight || a.symbol.localeCompare(b.symbol));
        const at = new Date().toISOString();
        try {
          await savePatScan({ universe, at, scanned: list.length, kept: rows.length, skipped, rows }, user);
        } catch (e: any) {
          skipped['save'] = (skipped['save'] ?? 0) + 1;
        }
        for (const row of rows) send({ type: 'candidate', row });
        send({ type: 'done', scanned: list.length, kept: rows.length, at, skipped });
      } catch (e: any) {
        send({ type: 'error', message: String(e?.message ?? e).slice(0, 400) });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
