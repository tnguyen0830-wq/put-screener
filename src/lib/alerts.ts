import { loadPortfolio } from './portfolio';
import { readTokens } from './schwab';

/**
 * Cảnh báo: những gì đáng làm phiền điện thoại bạn.
 *
 * Nguyên tắc chọn lọc: chỉ báo những chuyện BẠN PHẢI LÀM GÌ ĐÓ. Lời/lỗ
 * hằng ngày cố tình không nằm ở đây - nó sẽ kêu suốt, và một hộp thư kêu
 * suốt là một hộp thư bị bỏ qua, kể cả lúc nó nói chuyện thật.
 *
 * Ngưỡng không định nghĩa lại ở đây: ITM, earnings, backwardation, skew và
 * giới hạn quy mô đều đọc thẳng từ ảnh chụp danh mục mà trang web đang
 * hiện, nên thông báo và màn hình không bao giờ nói khác nhau.
 */

export type Severity = 'urgent' | 'warn';

export type Alert = {
  /** Khoá chống lặp: cùng khoá trong cùng ngày chỉ gửi đúng một lần. */
  key: string;
  severity: Severity;
  title: string;
  body: string;
};

/** Ngày (theo giờ New York) dùng làm mốc chống lặp. */
export function tradingDay(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/**
 * Giờ giao dịch Mỹ, tính rộng ra hai đầu.
 *
 * Không kiểm tra lúc 3 giờ sáng: chuỗi quyền chọn không đổi, chỉ tốn
 * request và làm hao hạn mức. Ngày lễ thì Schwab trả giá cũ - không sai
 * thành cảnh báo bậy, chỉ là lặp lại cái đã biết, nên không cần lịch nghỉ
 * lễ riêng.
 */
export function inMarketHours(now = new Date()): boolean {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
    hour: 'numeric',
    hour12: false,
  }).formatToParts(now);
  const weekday = parts.find((p) => p.type === 'weekday')?.value ?? '';
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? -1);
  if (['Sat', 'Sun'].includes(weekday)) return false;
  return hour >= 8 && hour < 18; // 8h-18h New York, rộng hơn 9:30-16:00
}

/**
 * Còn bao nhiêu ngày nữa phiên Schwab hết hạn cứng.
 *
 * Đọc `refresh_expires_at` - đúng trường mà /api/auth/status dùng để hiện
 * số ngày còn lại trên thanh trạng thái, nên thông báo và màn hình luôn
 * nói cùng một con số.
 */
export async function schwabDaysLeft(): Promise<number | null> {
  const tokens = await readTokens().catch(() => null);
  if (!tokens?.refresh_expires_at) return null;
  return Math.floor((tokens.refresh_expires_at - Date.now()) / 86_400_000);
}

const money = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

/**
 * Dựng danh sách cảnh báo cho thời điểm hiện tại.
 *
 * Thuần tuý đọc-và-quyết-định: không gửi gì, không ghi gì. Tách vậy để
 * kiểm thử được toàn bộ luật mà không cần mạng.
 */
export function alertsFrom(
  snapshot: Awaited<ReturnType<typeof loadPortfolio>>,
  daysLeft: number | null
): Alert[] {
  const out: Alert[] = [];
  const day = tradingDay();
  const rows: any[] = snapshot.rows ?? [];
  const puts = rows.filter((r) => r.kind === 'put');

  // --- Phiên Schwab: mất là cả app ngừng chạy, nên đứng đầu ---
  // Chỉ báo ở đúng ba mốc, không báo mỗi ngày từ ngày thứ 7 đổ xuống.
  if (daysLeft !== null && daysLeft <= 2) {
    out.push({
      key: `schwab-${daysLeft}`,
      severity: 'urgent',
      title:
        daysLeft <= 0
          ? 'Phiên Schwab đã hết hạn'
          : `Phiên Schwab còn ${daysLeft} ngày`,
      body:
        daysLeft <= 0
          ? 'App không đọc được tài khoản nữa. Mở app và bấm "Kết nối lại".'
          : 'Schwab giới hạn cứng 7 ngày, không gia hạn tự động được. Bấm "Kết nối lại" trước khi hết hạn.',
    });
  }

  for (const r of puts) {
    // --- Put vào trong tiền: rủi ro bị assign ---
    if (r.itm) {
      out.push({
        key: `itm-${day}-${r.symbol}-${r.strike}`,
        severity: 'urgent',
        title: `${r.symbol} đã vào trong tiền`,
        body: `Giá ${money(r.spot ?? 0)} đang dưới strike ${money(r.strike ?? 0)}, đáo hạn ${r.expiration}. Cân nhắc roll hoặc đóng.`,
      });
    }

    // --- Earnings trước ngày đáo hạn ---
    if (r.nextEarnings) {
      out.push({
        key: `earnings-${day}-${r.symbol}`,
        severity: 'warn',
        title: `${r.symbol} sắp có earnings`,
        body: `Earnings ngày ${r.nextEarnings}, trước khi put đáo hạn ${r.expiration}. Một cú gap sau earnings có thể đẩy hợp đồng vào trong tiền sau một đêm.`,
      });
    }

    // --- Bề mặt vol: thị trường đang định giá rủi ro ---
    if (r.backwardation) {
      out.push({
        key: `backwardation-${day}-${r.symbol}`,
        severity: 'warn',
        title: `${r.symbol}: term structure đảo`,
        body: `IV60/IV30 = ${(r.tsSlope ?? 0).toFixed(2)} (dưới 0.95). Thị trường đang định giá một sự kiện sắp xảy ra - nên đi tìm hiểu, không phải bán tháo.`,
      });
    }
    if (r.skewElevated) {
      out.push({
        key: `skew-${day}-${r.symbol}`,
        severity: 'warn',
        title: `${r.symbol}: put skew bất thường`,
        body: `Skew z-score ${(r.skewZ ?? 0).toFixed(1)} (trên 2). Thị trường đang trả giá cao bất thường cho bảo hiểm chiều giảm ở mã này.`,
      });
    }
  }

  // --- Vượt giới hạn quy mô vị thế ---
  const ps = snapshot.positionSizing;
  if (ps) {
    if (ps.totalCollateralOverLimit) {
      out.push({
        key: `size-total-${day}`,
        severity: 'warn',
        title: 'Vượt giới hạn tổng cash-secured',
        body: `Đang khoá ${(ps.totalCollateralPct ?? 0).toFixed(0)}% tài khoản, trên giới hạn ${ps.limits.totalCollateralPct}%.`,
      });
    }
    if (ps.clusterOverLimit) {
      out.push({
        key: `size-cluster-${day}`,
        severity: 'warn',
        title: 'Vượt giới hạn cluster exposure',
        body: `Cluster exposure ${(ps.clusterExposurePct ?? 0).toFixed(0)}%, trên giới hạn ${ps.limits.clusterPct}%. Các mã đang giữ tương quan cao với nhau.`,
      });
    }
    for (const s of ps.bySymbol.filter((x) => x.overLimit)) {
      out.push({
        key: `size-sym-${day}-${s.symbol}`,
        severity: 'warn',
        title: `${s.symbol} vượt giới hạn một mã`,
        body: `${(s.pct ?? 0).toFixed(1)}% tài khoản, trên giới hạn ${ps.limits.perSymbolPct}%.`,
      });
    }
    for (const s of ps.bySector.filter((x) => x.overLimit)) {
      out.push({
        key: `size-sec-${day}-${s.sector}`,
        severity: 'warn',
        title: `Ngành ${s.sector} vượt giới hạn`,
        body: `${(s.pct ?? 0).toFixed(1)}% tài khoản, trên giới hạn ${ps.limits.perSectorPct}%.`,
      });
    }
  }

  return out;
}

/** Đọc dữ liệu thật rồi dựng cảnh báo. Tách khỏi alertsFrom để test được luật. */
export async function collectAlerts(): Promise<Alert[]> {
  const [snapshot, daysLeft] = await Promise.all([loadPortfolio(), schwabDaysLeft()]);
  return alertsFrom(snapshot, daysLeft);
}
