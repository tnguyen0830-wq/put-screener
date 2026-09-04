import { NextRequest, NextResponse } from 'next/server';
import { dailyHistory, fullChain } from '@/lib/schwab';
import { computeGex } from '@/lib/gex';
import { flattenCalls, flattenPuts, skewZScore, termStructureAndSkew, type ChainContract } from '@/lib/screener';
import { realizedVol } from '@/lib/indicators';
import { curateIdeas, expectedMove, nearestDte, type Regime } from '@/lib/tradebrief';

/**
 * Tính TOÀN BỘ số liệu cho "AI Trade Briefing" - mức GEX, kỳ vọng biến
 * động, term structure/skew, và danh sách gợi ý giao dịch với strike/giá/
 * lãi-lỗ THẬT. Không gọi Claude ở đây - route riêng /api/ai/trade-briefing
 * chỉ nhận lại đúng những số này để viết phần diễn giải, không được tự tạo
 * số (cùng nguyên tắc "Use only the numbers given" của /api/ai).
 */
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const addDays = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

function atmIv(contracts: ChainContract[], dte: number, spot: number): number | null {
  const inExp = contracts.filter((c) => c.daysToExpiration === dte && c.volatility > 0);
  if (!inExp.length) return null;
  const nearest = inExp.reduce((best, c) =>
    Math.abs(c.strikePrice - spot) < Math.abs(best.strikePrice - spot) ? c : best
  );
  return nearest.volatility;
}

async function buildHorizon(
  horizon: 'short' | 'medium',
  dte: number,
  spot: number,
  regime: Regime,
  putWall: number | null,
  callWall: number | null,
  flip: number | null,
  puts: ChainContract[],
  calls: ChainContract[]
) {
  const inExp = [...puts, ...calls].filter((c) => c.daysToExpiration === dte);
  const expiration = inExp[0]?.expirationDate ?? null;
  const iv = atmIv([...puts, ...calls], dte, spot);
  const move = iv !== null ? expectedMove(spot, iv, dte) : null;

  const ideas = expiration
    ? curateIdeas({
        regime,
        spot,
        putWall,
        callWall,
        flip,
        puts,
        calls,
        dte,
        expiration,
        horizon,
      })
    : [];

  return { dte, expiration, atmIv: iv, expectedMove: move, ideas };
}

export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get('symbol');
  if (!symbol) {
    return NextResponse.json({ error: 'Thiếu tham số symbol' }, { status: 400 });
  }

  try {
    const [chain, hist] = await Promise.all([
      fullChain(symbol, addDays(0), addDays(60)),
      dailyHistory(symbol, 1).catch(() => null),
    ]);

    const profile = computeGex(chain, symbol);
    if (!profile) {
      return NextResponse.json(
        { error: 'Chuỗi quyền chọn không đủ dữ liệu gamma' },
        { status: 404 }
      );
    }

    const puts = flattenPuts(chain);
    const calls = flattenCalls(chain);
    const dtes = [...new Set([...puts, ...calls].map((c) => c.daysToExpiration))].sort((a, b) => a - b);
    if (!dtes.length) {
      return NextResponse.json({ error: 'Chuỗi quyền chọn không có hợp đồng nào' }, { status: 404 });
    }
    const shortDte = dtes[0];
    const mediumDte = nearestDte([...puts, ...calls], 21) ?? shortDte;

    const regime: Regime = profile.totalGex >= 0 ? 'POSITIVE' : 'NEGATIVE';

    const { tsSlope, skew } = termStructureAndSkew(puts, calls, profile.spot);
    const skewZ = skew !== null ? await skewZScore(symbol, skew).catch(() => null) : null;

    const closes: number[] = (hist?.candles ?? []).map((c: any) => c.close);
    const hv20 = closes.length >= 20 ? realizedVol(closes, 20) : null;
    const hv60 = closes.length >= 60 ? realizedVol(closes, 60) : null;

    const [shortTerm, mediumTerm] = await Promise.all([
      buildHorizon('short', shortDte, profile.spot, regime, profile.putWall, profile.callWall, profile.zeroGamma, puts, calls),
      buildHorizon('medium', mediumDte, profile.spot, regime, profile.putWall, profile.callWall, profile.zeroGamma, puts, calls),
    ]);

    return NextResponse.json({
      symbol,
      date: new Date().toISOString().slice(0, 10),
      spot: profile.spot,
      regime,
      putWall: profile.putWall,
      callWall: profile.callWall,
      gammaFlip: profile.zeroGamma,
      totalGex: profile.totalGex,
      // vol: IV/HV thay cho mô hình Heston (spot_vol/long-run/half-life) -
      // CHƯA làm, xem chú thích đầu tradebrief.ts. hv20/hv60 null khi lịch
      // sử giá chưa đủ phiên, không phải 0 - phân biệt rõ "chưa tính được"
      // với "vol bằng 0".
      vol: { iv: shortTerm.atmIv, hv20, hv60 },
      termStructure: tsSlope,
      skew,
      skewZ,
      shortTerm,
      mediumTerm,
    });
  } catch (e: any) {
    const reauth = String(e.message).includes('REAUTH_REQUIRED');
    return NextResponse.json(
      { error: reauth ? 'Phiên Schwab hết hạn' : 'Không lấy được chuỗi quyền chọn' },
      { status: reauth ? 401 : 500 }
    );
  }
}
