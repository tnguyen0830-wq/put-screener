import fs from 'node:fs/promises';
import path from 'node:path';
import { quotes, intradayHistory } from './schwab';
import { inMarketHours, tradingDay } from './alerts';
import {
  diffOrNull,
  diffSeries,
  numField,
  type Series,
  type SeriesPoint,
} from './internals-pure';

export type { Series, SeriesPoint } from './internals-pure';

/**
 * Market internals - đo được ở #165 trước khi viết dòng nào ở đây
 * (`/api/internalsprobe`, giữ lại vì đã trả giá xứng đáng, đúng khuôn
 * `/api/uwprobe`). Kết quả đo chia ba nhóm rõ rệt, và cả ba đều load-bearing
 * cho thiết kế file này:
 *
 *   - BỐN chỉ báo Schwab quote được VÀ có nến phút trong ngày ($TICK, $UVOL,
 *     $DVOL, $VIX) - vẽ được ngay từ /pricehistory, làm mới mỗi lần gọi,
 *     không cần lưu gì.
 *   - BA chỉ báo Schwab quote được nhưng /pricehistory trả 0 nến ($TICKQ,
 *     $ADV, $DECL, $PCCE) - có SỐ HIỆN TẠI nhưng không có ĐƯỜNG. Muốn có
 *     đường thì app phải tự lấy mẫu định kỳ và tự lưu, đúng khuôn
 *     gexhistory.ts đã làm cho GEX khi các nguồn khác cũng không có lịch sử.
 *   - HAI chỉ báo không cách viết nào Schwab quote được (NASDAQ
 *     Advance-Decline, CBOE Total Put/Call) - không có đường vòng nào từ
 *     Schwab, nói thẳng "không có dữ liệu" trên màn hình thay vì âm thầm bỏ
 *     qua hay lấy một con số gần đúng giả làm con số thật.
 */

const CHARTABLE: { key: string; label: string; symbol: string }[] = [
  { key: 'nyseTick', label: 'NYSE TICK', symbol: '$TICK' },
  { key: 'nyseUvol', label: 'NYSE Up Volume', symbol: '$UVOL' },
  { key: 'nyseDvol', label: 'NYSE Down Volume', symbol: '$DVOL' },
  { key: 'vix', label: 'VIX', symbol: '$VIX' },
];

/**
 * Bốn chuỗi vẽ được thẳng từ Schwab, cộng chuỗi thứ năm dựng ra (UVOL trừ
 * DVOL) - đúng ô đầu tiên trong ảnh mẫu tapchiphowall.
 *
 * Một mã lỗi vì lý do KHÁC session (mã lạ, mạng chập chờn) không được kéo
 * mất ba mã còn lại - bắt riêng và trả về đường rỗng cho đúng mã đó. Nhưng
 * REAUTH_REQUIRED thì NÉM TIẾP: phiên Schwab chết phải trả 401 thật, không
 * được đọc thành "bốn chỉ báo đều rỗng" - đúng luật `/api/gex`/`/api/rrg`
 * đã ghi ("session expiry never papered over").
 */
async function chartableSeries(): Promise<Series[]> {
  const raw = await Promise.all(
    CHARTABLE.map(async (c) => {
      try {
        const hist = await intradayHistory(c.symbol, 5);
        const candles: any[] = Array.isArray(hist?.candles) ? hist.candles : [];
        const points: SeriesPoint[] = candles
          .filter((cd) => typeof cd?.close === 'number' && typeof cd?.datetime === 'number')
          .map((cd) => ({ t: cd.datetime, v: cd.close }));
        return { ...c, points };
      } catch (e: any) {
        if (String(e?.message ?? e).includes('REAUTH_REQUIRED')) throw e;
        return { ...c, points: [] as SeriesPoint[] };
      }
    })
  );

  const toSeries = (r: (typeof raw)[number]): Series => ({
    key: r.key,
    label: r.label,
    points: r.points,
    current: r.points.length ? r.points[r.points.length - 1].v : null,
    source: 'schwab',
    asOf: r.points.length ? r.points[r.points.length - 1].t : null,
  });

  const out = raw.map(toSeries);

  const uvol = raw.find((r) => r.key === 'nyseUvol');
  const dvol = raw.find((r) => r.key === 'nyseDvol');
  if (uvol && dvol && uvol.points.length && dvol.points.length) {
    const points = diffSeries(uvol.points, dvol.points);
    out.push({
      key: 'uvolDvolDiff',
      label: 'NYSE UVOL − DVOL',
      points,
      current: points.length ? points[points.length - 1].v : null,
      source: 'schwab',
      asOf: points.length ? points[points.length - 1].t : null,
    });
  }

  return out;
}

/* ------------------------------------------------------------------ *
 *  Ba chỉ báo tự lấy mẫu.
 * ------------------------------------------------------------------ */

const SAMPLED_SYMBOLS = ['$TICKQ', '$ADV', '$DECL', '$PCCE'];

type StoredPoint = {
  t: number;
  tickNasdaq: number | null;
  advDeclNyse: number | null;
  pccEquity: number | null;
};
type Store = { date: string; points: StoredPoint[] };

/* .cache/ chứ không /var/data: đúng khuôn ttearnings.json/pehistory.json -
   mất khi redeploy chỉ làm đường của NGÀY ĐÓ ngắn lại từ điểm deploy, tự
   đầy lại từ mẫu kế tiếp, không cần thêm biến môi trường hay bước tay nào
   trên Render. */
const STORE_FILE = () =>
  path.resolve(process.env.INTERNALS_PATH || './.cache/internals-history.json');

async function readStore(): Promise<Store> {
  try {
    const raw = JSON.parse(await fs.readFile(STORE_FILE(), 'utf8'));
    if (raw && typeof raw.date === 'string' && Array.isArray(raw.points)) return raw;
    return { date: tradingDay(), points: [] };
  } catch {
    return { date: tradingDay(), points: [] };
  }
}

async function writeStore(s: Store) {
  await fs.mkdir(path.dirname(STORE_FILE()), { recursive: true });
  const tmp = `${STORE_FILE()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(s));
  await fs.rename(tmp, STORE_FILE());
}

/**
 * Lấy một mẫu và lưu lại. Đi nhờ bộ đếm giờ 15 phút DUY NHẤT của
 * alert-runner.ts (xem chú thích ở đó) - không phải bộ đếm giờ thứ hai.
 *
 * Tự gác cổng giờ giao dịch NGAY TRONG hàm, đúng khuôn syncDarkpool(): lấy
 * mẫu ngoài giờ vừa vô nghĩa (không ai giao dịch, số không đổi) vừa tốn một
 * request Schwab mỗi 15 phút suốt 24 giờ. MỘT lượt /quotes cho cả bốn mã
 * (Schwab gộp lô sẵn), không phải bốn request riêng.
 */
export async function sampleInternals(now = new Date()): Promise<void> {
  if (!inMarketHours(now)) return;

  const q = await quotes(SAMPLED_SYMBOLS);
  const tickNasdaq = numField(q, '$TICKQ');
  const adv = numField(q, '$ADV');
  const decl = numField(q, '$DECL');
  const pccEquity = numField(q, '$PCCE');
  const advDeclNyse = diffOrNull(adv, decl);

  const day = tradingDay(now);
  let store = await readStore();
  if (store.date !== day) store = { date: day, points: [] };
  store.points.push({ t: now.getTime(), tickNasdaq, advDeclNyse, pccEquity });
  await writeStore(store);
}

function sampledSeries(store: Store): Series[] {
  const build = (
    key: string,
    label: string,
    field: 'tickNasdaq' | 'advDeclNyse' | 'pccEquity'
  ): Series => {
    const points = store.points
      .filter((p) => p[field] !== null)
      .map((p) => ({ t: p.t, v: p[field] as number }));
    return {
      key,
      label,
      points,
      current: points.length ? points[points.length - 1].v : null,
      source: 'sampled',
      asOf: points.length ? points[points.length - 1].t : null,
    };
  };

  return [
    build('nasdaqTick', 'NASDAQ TICK', 'tickNasdaq'),
    build('advDeclNyse', 'NYSE ADV − DECL', 'advDeclNyse'),
    build('pccEquity', 'Put/Call Ratio (Equity)', 'pccEquity'),
  ];
}

/**
 * Hai chỉ báo #165 đo được là KHÔNG mã nào Schwab quote - liệt kê ra chứ
 * không âm thầm bỏ, để màn hình nói thẳng "không có" thay vì để người đọc
 * tưởng app quên vẽ.
 */
export type Unavailable = { key: string; label: string };
const UNAVAILABLE: Unavailable[] = [
  { key: 'nasdaqAdvDecl', label: 'NASDAQ Advance − Decline' },
  { key: 'putCallTotal', label: 'Put/Call Ratio (Total)' },
];

export async function marketInternals(): Promise<{ series: Series[]; unavailable: Unavailable[] }> {
  const [chartable, store] = await Promise.all([chartableSeries(), readStore()]);
  return { series: [...chartable, ...sampledSeries(store)], unavailable: UNAVAILABLE };
}
