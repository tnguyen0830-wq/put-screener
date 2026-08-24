import { NextResponse } from 'next/server';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { realizedFromCsv } from '@/lib/realized';

/**
 * Lời/lỗ đã chốt trong năm, đọc từ báo cáo Schwab xuất ra.
 *
 * Bản trước gọi endpoint giao dịch rồi tự ghép lô theo FIFO. Cách đó sai
 * ngay từ giả định: giá vốn thật của Schwab đã điều chỉnh theo lô thuế và
 * wash sale, thứ không suy ra được từ danh sách giao dịch thô. Báo cáo
 * "Realized Gain/Loss - Lot Details" thì có sẵn cột Gain/Loss cho từng lô,
 * do chính Schwab tính - không còn gì để đoán.
 *
 * Đổi lại đây là ảnh chụp tại một thời điểm: muốn cập nhật thì xuất lại báo
 * cáo và thay file trong data/realized/. Ngày xuất được trả về kèm và hiện
 * lên màn hình, để con số không lặng lẽ cũ đi mà trông vẫn như mới.
 */
export const dynamic = 'force-dynamic';

/** Đặt cạnh mã nguồn chứ không trên đĩa lưu trữ: đây là dữ liệu tĩnh thay
 *  theo từng lần xuất báo cáo, không phải thứ app tự ghi ra. */
const DIR = path.join(process.cwd(), 'data', 'realized');

export async function GET() {
  try {
    const names = (await readdir(DIR)).filter((f) => f.toLowerCase().endsWith('.csv')).sort();
    if (!names.length) {
      return NextResponse.json(
        { error: 'NO_REPORTS', reason: 'NO_REPORTS', detail: `Không có file .csv nào trong ${DIR}` },
        { status: 404 }
      );
    }
    const files = await Promise.all(
      names.map((n) => readFile(path.join(DIR, n), 'utf8'))
    );
    const result = realizedFromCsv(files);
    if (!result.lots) {
      return NextResponse.json(
        {
          error: 'EMPTY_REPORT',
          reason: 'EMPTY_REPORT',
          detail: `Đọc được ${names.length} file nhưng không có dòng lô nào: ${names.join(', ')}`,
        },
        { status: 422 }
      );
    }
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json(
      {
        error: 'REPORT_READ_FAILED',
        reason: 'REPORT_READ_FAILED',
        detail: String(e?.message ?? e).slice(0, 400),
      },
      { status: 500 }
    );
  }
}
