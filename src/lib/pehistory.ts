import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * Kho P/E theo ngày, để trả lời "mã này rẻ so với CHÍNH NÓ hay không".
 *
 * Chủ app chốt định giá gồm hai vế: bội số Finviz (so với thị trường) VÀ so
 * với lịch sử của chính mã. Vế thứ hai có đúng cái vấn đề khởi động mà
 * `iv-history.json` và `skew-history.json` đã gặp: không nguồn nào cho sẵn
 * chuỗi P/E quá khứ, nên nó phải tự tích luỹ mỗi lần quét một dòng.
 *
 * HỆ QUẢ PHẢI NÓI RA CHỨ KHÔNG ĐƯỢC GIẤU: trong nhiều tuần đầu, phân vị P/E
 * là KHÔNG BIẾT, không phải là "ở mức trung bình". Một phân vị tính trên 4
 * lần đọc là một con số vô nghĩa trông y hệt một con số có nghĩa - và ở đây
 * nó còn nguy hiểm hơn IV rank, vì nó là một trong hai chân của luận điểm
 * "đang rẻ". Nên `median`/`percentile` trả null cho tới khi đủ số lần đọc,
 * và `readings`/`needed` được trả về để MÀN HÌNH NÓI ĐƯỢC còn thiếu bao
 * nhiêu - chứ không chỉ im lặng hiện một dấu gạch ngang.
 *
 * Kho nằm ở `.cache/`, thứ repo này đã ghi rõ là mất được và dựng lại được.
 * Ở đây "dựng lại được" có giá thật: deploy một cái là chuỗi lịch sử về 0 và
 * phải tích luỹ lại từ đầu. Đó là đánh đổi có chủ ý - đổi lại là không có
 * biến môi trường mới nào phải thêm tay trên Render (cái bẫy `USERS_PATH`),
 * và vế định giá thứ nhất (bội số Finviz) vẫn chạy đủ ngay lập tức.
 */

export type PeReading = { d: string; pe: number };
type PeFile = Record<string, PeReading[]>;

const PE_PATH = path.resolve('./.cache/pe-history.json');

/* Khoảng 6 tuần quét hằng ngày. Dưới mức này thì phân vị chưa nói được gì. */
const MIN_READINGS = 30;
/* Giữ ~2 năm, cùng trần với iv-history. */
const MAX_READINGS = 520;

let cache: PeFile | null = null;

async function load(): Promise<PeFile> {
  if (cache) return cache;
  try {
    cache = JSON.parse(await fs.readFile(PE_PATH, 'utf8'));
  } catch {
    cache = {};
  }
  return cache!;
}

/** Một lần đọc mỗi mã mỗi ngày. Quét hai lần trong ngày không làm lệch kho. */
export async function recordPe(symbol: string, pe: number) {
  if (!Number.isFinite(pe) || pe <= 0) return; // P/E âm = đang lỗ, không có nghĩa để xếp hạng
  const store = await load();
  const today = new Date().toISOString().slice(0, 10);
  const list = (store[symbol] ||= []);
  if (list.some((r) => r.d === today)) return;
  list.push({ d: today, pe });
  if (list.length > MAX_READINGS) list.splice(0, list.length - MAX_READINGS);
}

export async function flushPe() {
  if (!cache) return;
  try {
    await fs.mkdir(path.dirname(PE_PATH), { recursive: true });
    await fs.writeFile(PE_PATH, JSON.stringify(cache));
  } catch {
    /* Kho lịch sử là phần THÊM, không phải phần chính: ghi hỏng thì lần quét
       vẫn phải trả về kết quả chứ không được đổ cả lượt quét. */
  }
}

export function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export type PeContext = {
  /** Số lần đọc đã tích luỹ được cho mã này. */
  readings: number;
  /** Còn thiếu bao nhiêu lần đọc nữa mới dùng được. 0 = đã đủ. */
  needed: number;
  /** Trung vị P/E lịch sử. null khi chưa đủ dữ liệu. */
  median: number | null;
  /** Phân vị của P/E hiện tại trong lịch sử (0-100). Thấp = rẻ so với chính nó. */
  percentile: number | null;
  /** P/E hiện tại lệch bao nhiêu % so với trung vị. Âm = rẻ hơn thường lệ. */
  vsMedianPct: number | null;
};

/**
 * Trung vị chứ không phải trung bình, cùng lý do với độ trễ công bố của tab
 * Quốc hội: một quý lỗ đẩy P/E lên vài trăm lần và kéo lệch hẳn trung bình,
 * trong khi trung vị không nhúc nhích.
 */
export function peContextFrom(
  readings: PeReading[],
  currentPe: number | null,
  minReadings = MIN_READINGS
): PeContext {
  const n = readings.length;
  const base: PeContext = {
    readings: n,
    needed: Math.max(0, minReadings - n),
    median: null,
    percentile: null,
    vsMedianPct: null,
  };
  if (n < minReadings || currentPe === null || !Number.isFinite(currentPe)) return base;

  const values = readings.map((r) => r.pe);
  const med = median(values)!;
  const below = values.filter((v) => v < currentPe).length;
  return {
    ...base,
    median: med,
    percentile: (below / n) * 100,
    vsMedianPct: med > 0 ? ((currentPe - med) / med) * 100 : null,
  };
}

export async function peContext(
  symbol: string,
  currentPe: number | null
): Promise<PeContext> {
  const store = await load();
  return peContextFrom(store[symbol] ?? [], currentPe);
}
