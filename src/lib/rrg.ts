/**
 * Biểu đồ luân chuyển dòng tiền (Relative Rotation Graph).
 *
 * Mỗi ngành được chấm bằng hai con số so với S&P 500:
 *
 *   - Trục ngang, RS-Ratio: ngành đang mạnh hay yếu hơn thị trường.
 *   - Trục dọc, RS-Momentum: sức mạnh tương đối đó đang tăng hay đang giảm.
 *
 * Cả hai lấy 100 làm mốc "ngang bằng thị trường", nên bốn góc phần tư có nghĩa
 * cố định: phải-trên là đang dẫn đầu, phải-dưới là mạnh nhưng đuối dần,
 * trái-dưới là đang tụt lại, trái-trên là yếu nhưng đang hồi.
 *
 * Công thức gốc của JdK (RS-Ratio/RS-Momentum) là tài sản riêng và không công
 * bố, nên đây là bản dựng lại theo mô tả công khai: chênh lệch giữa hai đường
 * EMA của sức mạnh tương đối, rồi chuẩn hoá theo mặt bằng của cả 11 ngành trong
 * cùng tuần đó. Chuẩn hoá cắt ngang như vậy - chứ không phải theo lịch sử riêng
 * của từng ngành - mới đúng câu hỏi mà biểu đồ này trả lời: tuần này tiền đang
 * chảy vào ngành nào so với các ngành còn lại. Hình dạng vòng xoay và thứ tự
 * các ngành khớp với bản gốc, nhưng con số tuyệt đối thì không nhất thiết trùng
 * - và giao diện nói rõ điều đó thay vì để người đọc tưởng đây là số của JdK.
 */

/** Nến ngày như Schwab trả về; chỉ cần mốc thời gian và giá đóng cửa. */
export type Bar = { datetime: number; close: number };

/** Một tuần: mốc thời gian của phiên cuối tuần đó và giá đóng cửa phiên ấy. */
export type Week = { t: number; close: number };

export type RrgPoint = { ratio: number; momentum: number };

export type Quadrant = 'leading' | 'weakening' | 'lagging' | 'improving';

const SHORT = 10; // tuần
const LONG = 30; // tuần
const MOM_SMOOTH = 4; // tuần, làm mượt tốc độ đổi của RS-Ratio
const MIN_SECTORS = 5; // dưới mức này thì "mặt bằng chung" không còn nghĩa gì

/** Số tuần tối thiểu để EMA dài kịp ổn định trước khi lấy toạ độ. */
export const MIN_WEEKS = LONG + 26;

/**
 * Giá đóng cửa theo tuần: lấy phiên cuối cùng của mỗi tuần lịch.
 *
 * Gom theo tuần chứ không theo ngày vì RRG là công cụ nhìn dòng tiền dịch
 * chuyển giữa các ngành - nhiễu ngày làm cái đuôi xoắn lại thành mớ bòng bong.
 */
export function weeklyCloses(bars: Bar[]): Week[] {
  const out: Week[] = [];
  let key = '';
  for (const b of bars) {
    if (!Number.isFinite(b.close) || b.close <= 0) continue;
    const d = new Date(b.datetime);
    // Khoá tuần: thứ Năm của tuần ISO chứa ngày đó, đủ để gom đúng nhóm mà
    // không cần thư viện ngày tháng.
    const t = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    const dow = (new Date(t).getUTCDay() + 6) % 7; // thứ Hai = 0
    const thursday = t + (3 - dow) * 86_400_000;
    const k = String(thursday);
    if (k === key) out[out.length - 1] = { t: b.datetime, close: b.close };
    else {
      out.push({ t: b.datetime, close: b.close });
      key = k;
    }
  }
  return out;
}

/** EMA trả về cả chuỗi, không chỉ giá trị cuối. */
function emaSeries(values: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const out: number[] = [];
  let prev = values[0];
  for (let i = 0; i < values.length; i++) {
    prev = i === 0 ? values[0] : values[i] * k + prev * (1 - k);
    out.push(prev);
  }
  return out;
}

/**
 * Xu hướng sức mạnh tương đối của một ngành so với chỉ số tham chiếu.
 *
 * Chênh lệch giữa EMA ngắn và EMA dài của tỉ số giá, tính theo phần trăm. Số
 * dương nghĩa là ngành đang mạnh lên so với thị trường, âm là đang yếu đi. Đây
 * mới là nguyên liệu thô - toạ độ trên biểu đồ phải chờ so với các ngành khác.
 *
 * Trả về mảng cùng độ dài, null ở giai đoạn EMA còn đang khởi động.
 */
export function rsTrend(
  sector: number[],
  benchmark: number[]
): (number | null)[] {
  const n = Math.min(sector.length, benchmark.length);
  if (n < MIN_WEEKS) return new Array(n).fill(null);

  const rs: number[] = [];
  for (let i = 0; i < n; i++) rs.push((100 * sector[i]) / benchmark[i]);

  const short = emaSeries(rs, SHORT);
  const long = emaSeries(rs, LONG);
  return rs.map((_, i) =>
    i < LONG ? null : (100 * (short[i] - long[i])) / long[i]
  );
}

/**
 * Điểm z cắt ngang: một giá trị đứng ở đâu so với các giá trị cùng tuần.
 *
 * Đây là chỗ mốc 100 đến từ: ngành nằm đúng mặt bằng chung của 11 ngành thì ở
 * ngay 100, mạnh hơn thì lệch phải, yếu hơn thì lệch trái.
 */
function crossZ(values: number[]): number[] {
  if (values.length < MIN_SECTORS) return values.map(() => 0);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const sd = Math.sqrt(
    values.reduce((a, b) => a + (b - mean) ** 2, 0) / (values.length - 1)
  );
  // Mọi ngành đi y hệt nhau thì độ lệch chuẩn bằng 0: trả về mốc ngang bằng
  // thay vì chia cho 0.
  if (!Number.isFinite(sd) || sd < 1e-9) return values.map(() => 0);
  return values.map((v) => (v - mean) / sd);
}

/**
 * Toạ độ RRG cho cả rổ ngành.
 *
 * Nhận xu hướng sức mạnh tương đối của từng ngành (rsTrend) và trả về toạ độ
 * theo tuần. Phải tính chung một lượt vì cả hai trục đều là vị trí so với mặt
 * bằng chung của tuần đó - tính riêng từng ngành thì không có mặt bằng nào để
 * so.
 */
export function rrgFromTrends(
  input: Map<string, (number | null)[]>
): Map<string, (RrgPoint | null)[]> {
  const keys = [...input.keys()];
  const weeks = Math.max(0, ...keys.map((k) => input.get(k)!.length));

  // Căn phải trước khi so: tuần cuối của mọi ngành là cùng một tuần, còn đầu
  // chuỗi thì không - quỹ niêm yết muộn hơn sẽ ngắn hơn. So theo chỉ số mà
  // không căn thì tuần này của ngành này bị đem so với tuần khác của ngành kia,
  // và sai lệch đó không để lại dấu vết nào trên biểu đồ.
  const trends = new Map<string, (number | null)[]>(
    keys.map((k) => {
      const a = input.get(k)!;
      return [k, [...new Array(weeks - a.length).fill(null), ...a]];
    })
  );

  // Tốc độ đổi của xu hướng, làm mượt: đây là nguyên liệu của trục dọc.
  const speed = new Map<string, (number | null)[]>();
  for (const k of keys) {
    const t = trends.get(k)!;
    const delta = t.map((v, i) =>
      v === null || t[i - 1] == null ? null : v - (t[i - 1] as number)
    );
    // EMA chỉ chạy trên phần đã có số; phần null giữ nguyên null.
    const known = delta.filter((v) => v !== null) as number[];
    const sm = emaSeries(known, MOM_SMOOTH);
    let j = 0;
    speed.set(
      k,
      delta.map((v) => (v === null ? null : sm[j++]))
    );
  }

  const out = new Map<string, (RrgPoint | null)[]>();
  for (const k of keys) out.set(k, new Array(weeks).fill(null));

  for (let i = 0; i < weeks; i++) {
    // Chỉ những ngành có số trong tuần này mới tham gia mặt bằng chung.
    const live = keys.filter(
      (k) => trends.get(k)![i] != null && speed.get(k)![i] != null
    );
    if (live.length < MIN_SECTORS) continue;
    const zr = crossZ(live.map((k) => trends.get(k)![i] as number));
    const zm = crossZ(live.map((k) => speed.get(k)![i] as number));
    live.forEach((k, j) => {
      out.get(k)![i] = { ratio: 100 + zr[j], momentum: 100 + zm[j] };
    });
  }
  return out;
}

export function quadrantOf(p: RrgPoint): Quadrant {
  if (p.ratio >= 100) return p.momentum >= 100 ? 'leading' : 'weakening';
  return p.momentum >= 100 ? 'improving' : 'lagging';
}
