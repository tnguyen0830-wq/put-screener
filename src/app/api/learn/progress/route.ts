import { NextRequest, NextResponse } from 'next/server';
import { lessonById } from '@/lib/learn';
import { readProgress, recordResult } from '@/lib/learnstore';
import { requireUser } from '@/lib/userstore';

/**
 * Điểm ôn tập của tab Learn — đọc và ghi cho CHÍNH người đang gọi.
 *
 * Mở cho người nhà: tab Learn là tab của cả nhà, và mỗi người chỉ đọc/ghi
 * tiến độ của mình. Danh tính từ header middleware gắn (`requireUser`), không
 * từ body — nên không ai ghi điểm thay người khác được, và một tài khoản đã
 * bị xoá mà cookie còn hạn thì bị 401 thay vì tiếp tục ghi vào kho.
 *
 * Bài phải tồn tại (`lessonById`): một id tuỳ ý từ client mà lọt vào kho là
 * một dòng rác sống mãi trong file trên `/var/data`.
 */
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const user = await requireUser(req);
  if (!user) return NextResponse.json({ error: 'ACCOUNT_GONE' }, { status: 401 });
  return NextResponse.json({ progress: await readProgress(user) });
}

export async function POST(req: NextRequest) {
  const user = await requireUser(req);
  if (!user) return NextResponse.json({ error: 'ACCOUNT_GONE' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const lessonId = typeof body?.lessonId === 'string' ? body.lessonId : '';
  const lesson = lessonById(lessonId);
  if (!lesson) return NextResponse.json({ error: 'BAD_LESSON' }, { status: 400 });

  /* `total` lấy từ CHÍNH bài trên server, không từ client: mẫu số là của
     nội dung, không phải của người làm bài. */
  const result = await recordResult(user, lessonId, Number(body?.score), lesson.quiz.length);
  return NextResponse.json({ ok: true, result });
}
