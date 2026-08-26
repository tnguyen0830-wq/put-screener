import { NextResponse } from 'next/server';
import { probeTelegram } from '@/lib/notify';

/** Dò xem token thuộc bot nào và đã có ai nhắn cho bot chưa - để lấy chat id
 *  mà không phải tự ghép URL getUpdates trên điện thoại. */
export const dynamic = 'force-dynamic';

export async function POST() {
  return NextResponse.json(await probeTelegram());
}
