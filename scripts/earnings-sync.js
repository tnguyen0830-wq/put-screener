/**
 * Xây data/earnings.json cho các mã trong data/watchlist.json.
 *
 * Ba nguồn, theo thứ tự ưu tiên:
 *
 *   1. Yahoo Finance quoteSummary/calendarEvents — nguồn chính. Phủ mọi mã và
 *      có cờ `isEarningsDateEstimate` phân biệt rõ ngày công ty đã công bố với
 *      ngày Yahoo tự ước tính. Cần crumb + cookie, không cần API key.
 *   2. Lịch Nasdaq theo ngày — đối chiếu chéo và trám chỗ Yahoo thiếu. API
 *      KHÔNG phân biệt đã công bố với ước tính, nên chỉ dùng khi Yahoo trống.
 *   3. Schwab lastEarningsDate + chu kỳ 91 ngày — chốt chặn cuối. Kém tin nhất:
 *      đã quan sát thấy nó đoán MUỘN hơn ngày thật (KO, LLY), tức là hướng sai
 *      nguy hiểm, nên chỉ dùng khi hai nguồn trên đều không có gì.
 *
 * Nguồn phụ không tự động: data/earnings-external.json — snapshot Earnings
 * Whispers lấy tay qua phiên đăng nhập trình duyệt. Đọc nếu file tồn tại.
 *
 * KHI CÁC NGUỒN LỆCH NHAU THÌ LẤY NGÀY SỚM NHẤT. Đã đo thực tế: Yahoo và
 * Earnings Whispers lệch từ 3 ngày trở lên ở 12/54 mã, và cờ "đã công bố" của
 * Yahoo bị khai quá — nơi Earnings Whispers thực sự đánh dấu đã công bố thì hai
 * bên khớp nhau, còn lại thì vênh. Không nguồn nào đáng tin tuyệt đối, nên bộ
 * lọc chọn hướng an toàn: sớm nhất thắng.
 *
 * Ngày ước tính bị lùi sớm SAFETY_DAYS: đoán sớm thì loại thừa hợp đồng (an
 * toàn), đoán muộn thì lọt hợp đồng vắt qua earnings (mất tiền). Ngày đã công
 * bố thì dùng nguyên, không lùi.
 *
 * Chạy lại hằng tuần: mỗi lần chạy sẽ thay ước tính bằng ngày vừa được công bố.
 *
 *   node scripts/earnings-sync.js
 */
const fs = require('node:fs');
const path = require('node:path');

const SAFETY_DAYS = 3;      // lùi sớm cho ngày ước tính
const QUARTERS_AHEAD = 4;   // số kỳ chiếu tới khi phải tự suy
const MONTHS_AHEAD = 3.5;   // quét lịch Nasdaq bao xa
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36';

const root = path.resolve(__dirname, '..');
const iso = (d) => d.toISOString().slice(0, 10);
const addDays = (base, n) => iso(new Date(new Date(base).getTime() + n * 864e5));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Schwab viết cổ phiếu nhiều lớp bằng gạch chéo (BRK/B); Yahoo dùng gạch ngang,
// Nasdaq dùng dấu chấm.
const toYahoo = (s) => s.replace('/', '-');
const toNasdaq = (s) => s.replace('/', '.');
const fromNasdaq = (s) => s.replace('.', '/');

/* ---------------- nguồn 1: Yahoo Finance ---------------- */

async function yahooSession() {
  const r = await fetch('https://fc.yahoo.com', { headers: { 'User-Agent': UA } });
  const cookie = (r.headers.getSetCookie?.() || [])
    .map((c) => c.split(';')[0])
    .join('; ');
  const cr = await fetch('https://query1.finance.yahoo.com/v1/test/getcrumb', {
    headers: { 'User-Agent': UA, Cookie: cookie },
  });
  const crumb = (await cr.text()).trim();
  if (!crumb || crumb.length > 32) throw new Error('Không lấy được crumb của Yahoo');
  return { cookie, crumb };
}

async function yahooEarnings(symbols, { cookie, crumb }, today) {
  const out = {};
  for (const sym of symbols) {
    try {
      const url =
        `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${toYahoo(sym)}` +
        `?modules=calendarEvents&crumb=${encodeURIComponent(crumb)}`;
      const r = await fetch(url, { headers: { 'User-Agent': UA, Cookie: cookie } });
      const e = (await r.json())?.quoteSummary?.result?.[0]?.calendarEvents?.earnings;
      // Yahoo trả về kỳ VỪA báo cáo khi chưa biết kỳ tới -> lọc bỏ ngày quá khứ.
      // Nếu trả về một khoảng thì lấy mốc sớm nhất cho an toàn.
      const future = (e?.earningsDate || [])
        .map((d) => d.fmt)
        .filter((d) => d && d >= today)
        .sort();
      if (future.length)
        out[sym] = { date: future[0], estimate: e.isEarningsDateEstimate !== false };
    } catch {
      /* mã lỗi thì để nguồn sau lo */
    }
    await sleep(200);
  }
  return out;
}

/* ---------------- nguồn 2: lịch Nasdaq ---------------- */

async function nasdaqCalendar(symbols, from, to) {
  const want = new Set(symbols.map(toNasdaq));
  const found = {};
  let days = 0;
  let fails = 0;
  for (let d = new Date(from); d <= to; d.setUTCDate(d.getUTCDate() + 1)) {
    if (d.getUTCDay() === 0 || d.getUTCDay() === 6) continue;
    const date = iso(d);
    try {
      const r = await fetch(
        `https://api.nasdaq.com/api/calendar/earnings?date=${date}`,
        { headers: { 'User-Agent': UA, Accept: 'application/json' } }
      );
      for (const row of (await r.json())?.data?.rows || [])
        if (want.has(row.symbol)) (found[fromNasdaq(row.symbol)] ||= []).push(date);
    } catch {
      fails++;
    }
    days++;
    await sleep(250);
  }
  return { found, days, fails };
}

/* ---------------- nguồn 3: Schwab ---------------- */

/**
 * Nguồn thứ ba, và là nguồn kém tin nhất — chỉ dùng khi Yahoo và Nasdaq đều
 * trống. Nên khi không có phiên Schwab thì bỏ qua chứ không dừng cả lần chạy:
 * script này còn chạy trên CI, nơi không có và không nên có token nào.
 */
async function schwabFundamentals(symbols) {
  const tokenFile = process.env.TOKEN_PATH || path.join(root, '.tokens.json');
  let tok;
  try {
    tok = JSON.parse(fs.readFileSync(tokenFile, 'utf8')).access_token;
  } catch {
    console.log('Không có token Schwab — bỏ qua nguồn thứ ba, chạy tiếp.');
    return {};
  }
  const out = {};
  for (let i = 0; i < symbols.length; i += 100) {
    const batch = symbols.slice(i, i + 100).join(',');
    const r = await fetch(
      `https://api.schwabapi.com/marketdata/v1/quotes?symbols=${encodeURIComponent(
        batch
      )}&fields=fundamental,reference`,
      { headers: { Authorization: `Bearer ${tok}` } }
    );
    if (!r.ok) {
      console.log(
        `Schwab trả ${r.status} (token hết hạn?) — bỏ qua nguồn thứ ba, chạy tiếp.`
      );
      return {};
    }
    Object.assign(out, await r.json());
  }
  return out;
}

/* ---------------- ghép ---------------- */

(async () => {
  const wl = JSON.parse(
    fs.readFileSync(path.join(root, 'data/watchlist.json'), 'utf8')
  );
  const today = iso(new Date());

  console.log(`Yahoo Finance — ${wl.length} mã...`);
  const yahoo = await yahooEarnings(wl, await yahooSession(), today);
  console.log(`  ${Object.keys(yahoo).length} mã có ngày`);

  console.log('Lịch Nasdaq (đối chiếu chéo)...');
  const { found: nasdaq, days, fails } = await nasdaqCalendar(
    wl,
    new Date(),
    new Date(Date.now() + MONTHS_AHEAD * 30 * 864e5)
  );
  console.log(
    `  ${days} ngày giao dịch, ${fails} lỗi, ${Object.keys(nasdaq).length} mã có trong lịch`
  );

  console.log('Schwab (nhận diện ETF + chốt chặn cuối)...');
  const schwab = await schwabFundamentals(wl);

  // Snapshot Earnings Whispers, nếu có. Lấy tay nên có thể cũ; ngày đã qua bị bỏ.
  let external = {};
  try {
    const raw = JSON.parse(
      fs.readFileSync(path.join(root, 'data/earnings-external.json'), 'utf8')
    );
    for (const [k, v] of Object.entries(raw.dates ?? {}))
      if (v && v.date >= today) external[k] = v;
    console.log(`  overlay Earnings Whispers: ${Object.keys(external).length} mã`);
  } catch {
    console.log('  overlay Earnings Whispers: không có');
  }

  const out = {};
  const announced = [];
  const estimated = [];
  const projected = [];
  const etfs = [];
  const blocked = [];
  const conflicts = [];

  for (const sym of wl) {
    if (schwab[sym]?.assetSubType === 'ETF') {
      etfs.push(sym); // ETF không có earnings
      continue;
    }

    const y = yahoo[sym];
    const n = (nasdaq[sym] || []).filter((d) => d >= today).sort()[0];
    const x = external[sym];

    // Ghi lại mọi chỗ hai nguồn vênh nhau để còn biết mà kiểm tra tay.
    const seen = [
      y && ['yahoo', y.date],
      n && ['nasdaq', n],
      x && ['ew', x.date],
    ].filter(Boolean);
    const distinct = new Set(seen.map(([, d]) => d));
    if (distinct.size > 1)
      conflicts.push(`${sym}: ${seen.map(([s, d]) => s + '=' + d).join(' ')}`);

    let anchor = null;
    let isEstimate = true;
    if (y || x) {
      // Sớm nhất thắng: loại thừa hợp đồng còn hơn để lọt một hợp đồng vắt
      // qua earnings.
      const cands = [y?.date, x?.date].filter(Boolean).sort();
      anchor = cands[0];
      // Chỉ coi là đã công bố khi nguồn cho ra ngày sớm nhất nói vậy.
      isEstimate = !(
        (y && y.date === anchor && y.estimate === false) ||
        (x && x.date === anchor && x.confirmed === true)
      );
      (isEstimate ? estimated : announced).push(`${sym}=${anchor}`);
    } else if (n) {
      anchor = n;
      estimated.push(`${sym}=${n}(nasdaq)`);
    } else {
      const led = schwab[sym]?.fundamental?.lastEarningsDate?.slice(0, 10);
      if (led) {
        anchor = addDays(led, 91);
        projected.push(sym);
      }
    }

    if (!anchor) {
      out[sym] = [today]; // không nguồn nào biết -> chặn hết cho an toàn
      blocked.push(sym);
      continue;
    }

    const first = isEstimate ? addDays(anchor, -SAFETY_DAYS) : anchor;
    const dates = [first < today ? today : first];
    for (let q = 1; q <= QUARTERS_AHEAD; q++)
      dates.push(addDays(anchor, q * 91 - SAFETY_DAYS));
    out[sym] = dates.filter((d) => d >= today);
  }

  const doc = {
    _comment:
      `Tao tu dong ${today} boi scripts/earnings-sync.js. ` +
      `DA CONG BO (Yahoo isEarningsDateEstimate=false, dung nguyen ngay): ${
        announced.join(' ') || 'khong co'
      }. ` +
      `UOC TINH (lui som ${SAFETY_DAYS} ngay): ${estimated.join(' ') || 'khong co'}. ` +
      `TU SUY tu Schwab lastEarningsDate+91 (kem tin nhat): ${
        projected.join(' ') || 'khong co'
      }. ` +
      `Cac ky sau ky dau tien luon la tu suy. ` +
      `ETF bo qua: ${etfs.join(' ') || 'khong co'}. ` +
      `Xac nhan lai tren trang IR truoc khi vao lenh.`,
    ...out,
  };
  fs.writeFileSync(
    path.join(root, 'data/earnings.json'),
    JSON.stringify(doc, null, 2)
  );

  console.log(`\nĐã ghi data/earnings.json — ${Object.keys(out).length} mã`);
  console.log(`  đã công bố : ${announced.length}`);
  console.log(`  ước tính   : ${estimated.length}`);
  console.log(`  tự suy     : ${projected.length}  ${projected.join(' ')}`);
  console.log(`  ETF bỏ qua : ${etfs.join(' ') || '(không)'}`);
  if (blocked.length)
    console.log(`  CHẶN HẾT (không nguồn nào có ngày): ${blocked.join(' ')}`);
  if (conflicts.length) {
    console.log(
      `\n  LỆCH giữa các nguồn (${conflicts.length}/${Object.keys(out).length}) — đã lấy ngày sớm nhất:`
    );
    conflicts.forEach((c) => console.log('   ', c));
  }
})();
