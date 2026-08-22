'use client';

import { useCallback, useEffect, useState } from 'react';
import TradingViewWidget from './TradingViewWidget';
import AiRead from './AiRead';
import GexChart from './GexChart';
import { tvSymbol, tradingViewChartUrl, tcpwGexUrl } from '@/lib/links';
import ColorLegend from './ColorLegend';

/** Dạng dữ liệu do /api/analyze trả về. */
type Analysis = {
  symbol: string;
  name: string;
  exchange: string;
  price: {
    spot: number;
    change: number | null;
    changePct: number | null;
    bid: number | null;
    ask: number | null;
    volume: number | null;
    low52: number;
    high52: number;
    pos52: number | null;
  };
  technical: {
    sma20: number | null;
    sma50: number | null;
    sma200: number | null;
    vsSma20: number | null;
    vsSma50: number | null;
    vsSma200: number | null;
    sma200Streak: number | null;
    rsi14: number | null;
    macd: { macd: number; signal: number; hist: number } | null;
    atr14: number | null;
    atrPct: number | null;
    bollinger: { mid: number; upper: number; lower: number; pctB: number } | null;
    hv20: number | null;
    hv60: number | null;
    volRatio: number | null;
  };
  options: {
    iv: number | null;
    ivHv: number | null;
    refDelta: number | null;
    refStrike: number | null;
    refExpiration: string | null;
  };
  fundamental: {
    eps: number | null;
    peRatio: number | null;
    divAmount: number | null;
    divYield: number | null;
    divExDate: string | null;
    marketCap: number | null;
    avgVolume10d: number | null;
    avgVolume1y: number | null;
    lastEarnings: string | null;
    nextEarnings: string | null;
  };
  news: {
    title: string;
    publisher: string;
    link: string;
    published: string;
    tickerCount: number;
    relatedTickers: string[];
  }[];
  finviz: {
    metrics: Record<string, string>;
    ratings: { date: string; action: string; analyst: string; rating: string; target: string }[];
  } | null;
  meta: { bars: number; firstBar: string; lastBar: string; optionable: boolean | null };
};

const usd = (n: number | null, d = 2) =>
  n === null || n === undefined
    ? '—'
    : n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: d });
const pct = (n: number | null, d = 1) =>
  n === null || n === undefined ? '—' : `${(n * 100).toFixed(d)}%`;
const num = (n: number | null, d = 2) =>
  n === null || n === undefined ? '—' : n.toFixed(d);
const big = (n: number | null) => {
  if (n === null || n === undefined) return '—';
  const u = [[1e12, 'T'], [1e9, 'B'], [1e6, 'M'], [1e3, 'K']] as const;
  for (const [v, s] of u) if (Math.abs(n) >= v) return `${(n / v).toFixed(1)}${s}`;
  return n.toFixed(0);
};

/* Nhãn mô tả cho ngưỡng chỉ báo tiêu chuẩn. Mô tả trạng thái, không phải
   khuyến nghị — quyết định mua bán vẫn là của bạn. */
const rsiLabel = (r: number | null) =>
  r === null ? '' : r >= 70 ? 'quá mua' : r <= 30 ? 'quá bán' : 'trung tính';
const bbLabel = (b: number | null) =>
  b === null ? '' : b > 1 ? 'trên dải trên' : b < 0 ? 'dưới dải dưới' : 'trong dải';

function Row({
  label,
  value,
  note,
  tone,
}: {
  label: string;
  value: string;
  note?: string;
  tone?: 'good' | 'bad' | 'warn';
}) {
  return (
    <div>
      <dt>{label}</dt>
      <dd className={tone}>
        {value}
        {note ? <span className="anote"> {note}</span> : null}
      </dd>
    </div>
  );
}

export default function AnalysisPanel({
  watchlist,
  onToggleWatchlist,
  focusSymbol,
}: {
  watchlist: string[];
  onToggleWatchlist: (symbol: string) => void;
  /** Mã do tab khác chỉ định, ví dụ bấm một ô trên bản đồ nhiệt. */
  focusSymbol?: string | null;
}) {
  const [input, setInput] = useState('');
  const [data, setData] = useState<Analysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (symbol: string) => {
    const s = symbol.trim().toUpperCase();
    if (!s) return;
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`/api/analyze?symbol=${encodeURIComponent(s)}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? 'Không lấy được dữ liệu');
      setData(j);
    } catch (e: any) {
      setError(e.message);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  // Mã do tab khác đẩy sang thì luôn thắng lựa chọn hiện tại.
  useEffect(() => {
    if (focusSymbol) {
      setInput(focusSymbol);
      load(focusSymbol);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusSymbol]);

  // Nạp sẵn mã đầu watchlist để tab không mở ra trống trơn.
  useEffect(() => {
    if (!focusSymbol && !data && !loading && !error && watchlist.length) {
      setInput(watchlist[0]);
      load(watchlist[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchlist.length]);

  const t = data?.technical;
  const f = data?.fundamental;
  const p = data?.price;
  const tv = data ? tvSymbol(data.symbol, data.exchange) : '';

  return (
    <section className="panel">
      <div className="panel-head">
        {loading ? (
          'Đang lấy dữ liệu…'
        ) : error ? (
          error
        ) : data ? (
          <>
            {/* Mã tô màu định danh, tên công ty giữ màu tiêu đề. */}
            <span className="sym">{data.symbol}</span> · {data.name}
          </>
        ) : (
          'Phân tích mã'
        )}
      </div>

      <div className="panel-body">
        <form
          className="addrow"
          onSubmit={(e) => {
            e.preventDefault();
            load(input);
          }}
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Nhập mã, ví dụ NVDA"
            aria-label="Mã cần phân tích"
          />
          <button type="submit" disabled={loading}>
            Phân tích
          </button>
        </form>

        {watchlist.length > 0 && (
          <ul className="chips quick">
            {watchlist.slice(0, 24).map((s) => (
              <li key={s}>
                <button
                  type="button"
                  className={data?.symbol === s ? 'on' : undefined}
                  onClick={() => {
                    setInput(s);
                    load(s);
                  }}
                >
                  {s}
                </button>
              </li>
            ))}
          </ul>
        )}

        {!data && !loading && !error && (
          <div className="empty">
            <strong>Chưa chọn mã</strong>
            Nhập mã ở trên, hoặc bấm một mã trong watchlist.
          </div>
        )}

        {data && p && t && f && (
          <>
            <div className="pxhead">
              <span className="pxbig">{usd(p.spot)}</span>
              <span className={(p.change ?? 0) >= 0 ? 'good' : 'bad'}>
                {(p.change ?? 0) >= 0 ? '+' : ''}
                {num(p.change)} ({num(p.changePct)}%)
              </span>
              <span className="spacer" />
              <button
                className={watchlist.includes(data.symbol) ? 'wl on' : 'wl'}
                onClick={() => onToggleWatchlist(data.symbol)}
              >
                {watchlist.includes(data.symbol) ? '★ Trong watchlist' : '☆ Lưu watchlist'}
              </button>
            </div>

            <div className="r52">
              <div className="r52bar">
                <i style={{ left: `${Math.min(100, Math.max(0, (p.pos52 ?? 0) * 100))}%` }} />
              </div>
              <div className="r52ends">
                <span>Đáy 52T {usd(p.low52)}</span>
                <span>{pct(p.pos52, 0)} biên độ</span>
                <span>Đỉnh 52T {usd(p.high52)}</span>
              </div>
            </div>

            <ColorLegend />

            <AiRead analysis={data} />

            <h3 className="dsec">Kỹ thuật</h3>
            <dl className="stats">
              <Row
                label="RSI(14)"
                value={num(t.rsi14, 1)}
                note={rsiLabel(t.rsi14)}
                tone={t.rsi14 === null ? undefined : t.rsi14 >= 70 || t.rsi14 <= 30 ? 'warn' : undefined}
              />
              <Row
                label="MACD(12,26,9)"
                value={num(t.macd?.hist ?? null)}
                note={t.macd ? (t.macd.hist >= 0 ? 'trên tín hiệu' : 'dưới tín hiệu') : ''}
                tone={t.macd ? (t.macd.hist >= 0 ? 'good' : 'bad') : undefined}
              />
              <Row label="SMA20" value={usd(t.sma20)} note={pct(t.vsSma20)} tone={(t.vsSma20 ?? 0) >= 0 ? 'good' : 'bad'} />
              <Row label="SMA50" value={usd(t.sma50)} note={pct(t.vsSma50)} tone={(t.vsSma50 ?? 0) >= 0 ? 'good' : 'bad'} />
              <Row
                label="SMA200"
                value={usd(t.sma200)}
                note={`${pct(t.vsSma200)} · ${Math.abs(t.sma200Streak ?? 0)} phiên ${
                  (t.sma200Streak ?? 0) >= 0 ? 'trên' : 'dưới'
                }`}
                tone={(t.vsSma200 ?? 0) >= 0 ? 'good' : 'bad'}
              />
              <Row label="Bollinger %B" value={num(t.bollinger?.pctB ?? null)} note={bbLabel(t.bollinger?.pctB ?? null)} />
              <Row label="ATR(14)" value={usd(t.atr14)} note={pct(t.atrPct)} />
              <Row label="HV20 / HV60" value={`${pct(t.hv20, 0)} / ${pct(t.hv60, 0)}`} note={t.volRatio ? `tỷ lệ ${num(t.volRatio)}` : ''} />
            </dl>

            <h3 className="dsec">Quyền chọn</h3>
            <dl className="stats">
              <Row label="IV tham chiếu" value={pct(data.options.iv, 1)} note={data.options.refExpiration ?? ''} />
              <Row
                label="IV / HV20"
                value={num(data.options.ivHv)}
                note={data.options.ivHv ? (data.options.ivHv > 1.2 ? 'quyền chọn đắt' : 'gần biến động thực') : ''}
                tone={data.options.ivHv && data.options.ivHv > 1.2 ? 'warn' : undefined}
              />
              <Row label="Strike tham chiếu" value={usd(data.options.refStrike)} note={`Δ ${num(data.options.refDelta)}`} />
            </dl>
            <p className="cap">
              IV lấy từ hợp đồng put có delta gần −0.30 nhất trong cửa sổ 20–60 ngày, cùng
              vùng delta mà screener nhắm tới, nên so sánh được với cột IV/HV ở bảng kết quả.
            </p>

            <h3 className="dsec">Cơ bản</h3>
            <dl className="stats">
              <Row label="Vốn hoá" value={big(f.marketCap)} />
              <Row label="P/E" value={num(f.peRatio, 1)} />
              <Row label="EPS" value={usd(f.eps)} />
              <Row label="Cổ tức" value={f.divYield ? `${num(f.divYield, 2)}%` : '—'} note={f.divAmount ? `${usd(f.divAmount)}/năm` : ''} />
              <Row label="Ngày GD không hưởng quyền" value={f.divExDate ?? '—'} />
              <Row label="KLGD TB 10 phiên" value={big(f.avgVolume10d)} note={f.avgVolume1y ? `1 năm ${big(f.avgVolume1y)}` : ''} />
              <Row label="Earnings gần nhất" value={f.lastEarnings ?? '—'} />
              <Row label="Earnings kế tiếp" value={f.nextEarnings ?? '—'} tone={f.nextEarnings ? 'warn' : undefined} />
            </dl>
            <p className="cap">
              Ngày earnings kế tiếp lấy từ <code>data/earnings.json</code>. Chạy{' '}
              <code>node scripts/earnings-sync.js</code> để cập nhật — file phân biệt rõ ngày
              công ty đã công bố với ngày ước tính.
            </p>

            {data.finviz && (
              <>
                <h3 className="dsec">Giới phân tích &amp; vị thế (Finviz)</h3>
                <dl className="stats">
                  <Row
                    label="Giá mục tiêu"
                    value={data.finviz.metrics['Target Price'] ?? '—'}
                    note={(() => {
                      const tp = parseFloat(data.finviz.metrics['Target Price'] ?? '');
                      if (!isFinite(tp)) return '';
                      const up = (tp - p.spot) / p.spot;
                      return `${up >= 0 ? '+' : ''}${(up * 100).toFixed(1)}% so với giá hiện tại`;
                    })()}
                  />
                  <Row
                    label="Khuyến nghị TB"
                    value={data.finviz.metrics['Recom'] ?? '—'}
                    note="1 = mua mạnh, 5 = bán"
                  />
                  <Row label="P/E dự phóng" value={data.finviz.metrics['Forward P/E'] ?? '—'} note={`hiện tại ${data.finviz.metrics['P/E'] ?? '—'}`} />
                  <Row label="EPS năm tới" value={data.finviz.metrics['EPS next Y'] ?? '—'} />
                  <Row label="Short float" value={data.finviz.metrics['Short Float'] ?? '—'} note={data.finviz.metrics['Short Ratio'] ? `tỷ lệ ${data.finviz.metrics['Short Ratio']}` : ''} />
                  <Row label="Rel Volume" value={data.finviz.metrics['Rel Volume'] ?? '—'} note="so với KLGD thường ngày" />
                  <Row label="Beta" value={data.finviz.metrics['Beta'] ?? '—'} />
                  <Row label="ROE / ROIC" value={`${data.finviz.metrics['ROE'] ?? '—'} / ${data.finviz.metrics['ROIC'] ?? '—'}`} />
                  <Row label="Nợ / Vốn CSH" value={data.finviz.metrics['Debt/Eq'] ?? '—'} />
                  <Row label="Hiệu suất năm" value={data.finviz.metrics['Perf Year'] ?? '—'} note={data.finviz.metrics['Perf YTD'] ? `YTD ${data.finviz.metrics['Perf YTD']}` : ''} />
                </dl>

                {data.finviz.ratings.length > 0 && (
                  <table className="ratings">
                    <thead>
                      <tr>
                        <th>Ngày</th>
                        <th>Hành động</th>
                        <th>Nhà phân tích</th>
                        <th>Khuyến nghị</th>
                        <th>Giá mục tiêu</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.finviz.ratings.map((r, i) => (
                        <tr key={`${r.date}-${r.analyst}-${i}`}>
                          <td>{r.date}</td>
                          <td className={/downgrade/i.test(r.action) ? 'bad' : /upgrade/i.test(r.action) ? 'good' : undefined}>
                            {r.action}
                          </td>
                          <td>{r.analyst}</td>
                          <td>{r.rating}</td>
                          <td>{r.target}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                <p className="cap">
                  Đọc từ trang quote của Finviz, chỉ khi bạn bấm phân tích một mã. Đây là bóc
                  HTML chứ không phải API có hợp đồng ổn định — Finviz đổi giao diện thì phần
                  này trống, các phần khác vẫn chạy.
                </p>
              </>
            )}

            <h3 className="dsec">Tin tức</h3>
            {data.news?.length ? (
              <ul className="newslist">
                {data.news.map((n) => (
                  <li key={n.link}>
                    <a href={n.link} target="_blank" rel="noopener">
                      {n.title}
                    </a>
                    <span className="nmeta">
                      {n.published.slice(0, 10)} · {n.publisher} ·{' '}
                      {n.tickerCount > 1
                        ? `nhắc ${n.tickerCount} mã`
                        : 'riêng mã này'}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="cap">Không có tin nào gắn với mã này.</p>
            )}
            <p className="cap">
              Nguồn: tìm kiếm tin của Yahoo Finance. Bài gắn ít mã được xếp lên trước vì
              nhiều khả năng viết riêng về mã này; bài gắn nhiều mã thường là bản tin thị
              trường chung. Không có nguồn mạng xã hội — X, StockTwits, Reddit đều đóng API
              công khai hoặc bắt trả phí.
            </p>

            <h3 className="dsec">Biểu đồ</h3>
            <TradingViewWidget
              type="advanced-chart"
              height={380}
              attributionHref={`https://www.tradingview.com/symbols/${tv.replace(':', '-')}/`}
              attributionLabel={`${data.symbol} chart`}
              config={{
                width: '100%',
                height: 380,
                symbol: tv,
                interval: 'D',
                range: '12M',
                timezone: 'America/New_York',
                theme: 'light',
                style: '1',
                locale: 'en',
                hide_side_toolbar: true,
                allow_symbol_change: false,
                save_image: false,
                studies: ['MASimple@tv-basicstudies', 'RSI@tv-basicstudies'],
                support_host: 'https://www.tradingview.com',
              }}
            />

            <h3 className="dsec">Đánh giá kỹ thuật đa khung</h3>
            <TradingViewWidget
              type="technical-analysis"
              height={400}
              attributionHref={`https://www.tradingview.com/symbols/${tv.replace(':', '-')}/technicals/`}
              attributionLabel={`${data.symbol} technicals`}
              config={{
                interval: '1D',
                width: '100%',
                height: 400,
                isTransparent: true,
                symbol: tv,
                showIntervalTabs: true,
                displayMode: 'single',
                locale: 'en',
                colorTheme: 'light',
              }}
            />
            <p className="cap">
              Đồng hồ của TradingView tổng hợp nhiều chỉ báo theo công thức riêng của họ.
              Dùng để đối chiếu chéo với các số tự tính ở trên, không phải tín hiệu vào lệnh.
            </p>

            <h3 className="dsec">Gamma theo strike</h3>
            <GexChart symbol={data.symbol} />
            <p className="cap">
              Put wall thường hành xử như hỗ trợ vì dealer phải mua vào để hedge quanh đó.
              Đây là mô hình suy từ open interest, không phải sổ vị thế thật của dealer.
            </p>

            <h3 className="dsec">Đối chiếu ngoài</h3>
            <div className="linkrow">
              <a href={tradingViewChartUrl(data.symbol, data.exchange)} target="_blank" rel="noopener">
                Mở chart đầy đủ ↗
              </a>
              <a href={tcpwGexUrl(data.symbol)} target="_blank" rel="noopener">
                GEX trên Tạp Chí Phố Wall ↗
              </a>
            </div>

            <p className="cap">
              Dữ liệu lấy lúc {data.meta.bars} phiên ({data.meta.firstBar} → {data.meta.lastBar}).
              Mỗi lần phân tích tốn 3 request Schwab.
            </p>
          </>
        )}
      </div>
    </section>
  );
}
