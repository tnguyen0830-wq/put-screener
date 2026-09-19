import { translateHeadlines } from '@/lib/newstranslate';
import { logActivity } from '@/lib/activity';
import { currentUser } from '@/lib/users';

export const dynamic = 'force-dynamic';

/**
 * Dịch một lô tiêu đề tin sang tiếng Việt. Client (`NewsPanel.tsx`) gọi
 * TỰ ĐỘNG khi UI ở chế độ tiếng Việt, cho đúng những tiêu đề đang hiện mà
 * chưa dịch — không phải nút bấm, đúng yêu cầu "khi để tiếng việt thì News
 * tiếng việt". Mở cho cả người nhà, cùng lý do `/api/news/brief` mở: tab
 * Tin tức là tab của cả nhà, và cache trong `newstranslate.ts` khiến tiêu
 * đề đã dịch một lần không tốn thêm cho người thứ hai.
 */
export async function POST(req: Request) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid body' }, { status: 400 });
  }
  const titles = Array.isArray(body?.titles)
    ? body.titles.filter((t: unknown): t is string => typeof t === 'string' && t.trim().length > 0)
    : [];
  if (!titles.length) return Response.json({ translations: {} });

  await logActivity(currentUser(req), 'translate', `${titles.length} tiêu đề`);

  const result = await translateHeadlines(titles);
  return Response.json(result);
}
