import { NextRequest, NextResponse } from 'next/server';
import { translateProfile, type ProfileFields } from '@/lib/profiletranslate';

/**
 * Dịch sector/industry/country/description của Analyze tab sang tiếng
 * Việt - xem lib/profiletranslate.ts cho lý do và chiến lược cache.
 *
 * Route riêng, không gộp vào /api/analyze: /api/analyze còn phải gọi
 * Schwab (quote, lịch sử giá) mỗi lần tải, trong khi bản dịch gần như
 * không đổi và chỉ cần chạy lại khi người dùng bật tiếng Việt. Gộp chung
 * sẽ buộc đổi ngôn ngữ phải tải lại toàn bộ Schwab data chỉ để lấy một
 * đoạn dịch, tốn quota vô ích.
 */
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const symbol = typeof body?.symbol === 'string' ? body.symbol : null;
  if (!symbol) {
    return NextResponse.json({ error: 'Missing symbol' }, { status: 400 });
  }

  const fields: ProfileFields = {
    sector: typeof body?.sector === 'string' ? body.sector : null,
    industry: typeof body?.industry === 'string' ? body.industry : null,
    country: typeof body?.country === 'string' ? body.country : null,
    description: typeof body?.description === 'string' ? body.description : null,
  };

  // Không văng lỗi ra ngoài: dịch là phần phụ trợ hiển thị, phía gọi lùi về
  // tiếng Anh khi `translated` là null, không phải một trang lỗi.
  const translated = await translateProfile(symbol, fields);
  return NextResponse.json({ translated });
}
