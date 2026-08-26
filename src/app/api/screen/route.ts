import { NextRequest, NextResponse } from 'next/server';
import { currentScan, startScan } from '@/lib/scan-job';
import type { Filters, StreamEvent } from '@/lib/types';

/**
 * Xem một lần quét.
 *
 * Việc quét thật nằm ở lib/scan-job.ts và chạy trong tiến trình server.
 * Route này chỉ đọc theo và đẩy sự kiện về trình duyệt. Đóng tab thì chỉ
 * mỗi cái luồng này dừng - lần quét vẫn chạy tiếp tới khi xong và tự lưu.
 */
export const dynamic = 'force-dynamic';
export const maxDuration = 900;

/** Đang quét dở hay không, để mở app lên là biết ngay. */
export async function GET() {
  const job = currentScan();
  if (!job) return NextResponse.json({ running: false });
  return NextResponse.json({
    running: job.status === 'running',
    universe: job.universe,
    startedAt: job.startedAt,
    status: job.status,
    found: job.rows.length,
  });
}

export async function POST(req: NextRequest) {
  const filters = (await req.json()) as Filters;
  const job = startScan(filters);
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      // Phát lại từ sự kiện đầu tiên, nên nối vào giữa chừng vẫn thấy đủ
      // các mã đã tìm được trước đó chứ không phải bảng trống.
      let i = 0;
      try {
        for (;;) {
          while (i < job.events.length) {
            const e: StreamEvent = job.events[i++];
            controller.enqueue(encoder.encode(JSON.stringify(e) + '\n'));
          }
          if (job.status !== 'running') break;
          await new Promise((r) => setTimeout(r, 250));
        }
      } catch {
        // Trình duyệt ngắt giữa chừng. Không phải lỗi, và tuyệt đối không
        // được đụng tới công việc đang chạy.
      } finally {
        try {
          controller.close();
        } catch {
          /* đã đóng rồi */
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-store, no-transform',
    },
  });
}
