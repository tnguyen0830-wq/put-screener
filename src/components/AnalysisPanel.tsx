'use client';

import { useCallback, useEffect, useState } from 'react';
import TradingViewWidget from './TradingViewWidget';
import AiRead from './AiRead';
import { useLang } from '@/lib/i18n';
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
  profile: {
    sector: string | null;
    industry: string | null;
    country: string | null;
    website: string | null;
    ceo: string | null;
    employees: number | null;
    ipoDate: string | null;
    exchange: string | null;
    description: string | null;
    /** Nguồn nào trả lời, nguồn nào không — đọc được ở /api/analyze. */
    sources: { fmp: string; finviz: string };
  } | null;
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
  r === null ? '' : r >= 70 ? 'an.rsiOver' : r <= 30 ? 'an.rsiUnder' : 'an.rsiNeutral';
const bbLabel = (b: number | null) =>
  b === null ? '' : b > 1 ? 'an.bbAbove' : b < 0 ? 'an.bbBelow' : 'an.bbInside';

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

/**
 * Hồ sơ công ty, ngay dưới giá.
 *
 * Phần còn lại của tab này toàn số; khối này trả lời câu hỏi đứng trước mọi con
 * số đó — công ty này làm gì, thuộc ngành nào, lớn cỡ nào. Bán put là nhận cổ
 * phiếu về nếu bị assign, nên biết mình có thể phải ôm cái gì là chuyện đầu tiên.
 *
 * Mọi trường đều có thể trống: trường nào trống thì biến mất, không để lại một
 * hàng dấu gạch.
 */
function CompanyProfileCard({ p }: { p: NonNullable<Analysis['profile']> }) {
  const { t: tr } = useLang();
  const [open, setOpen] = useState(false);

  const tags = [p.sector, p.industry, p.country].filter(Boolean) as string[];
  const host = p.website ? p.website.replace(/^https?:\/\//, '').replace(/\/$/, '') : null;

  // Mô tả của FMP dài cỡ một đoạn văn. Cắt còn vài dòng để khối này không đẩy
  // toàn bộ phần phân tích xuống dưới màn hình, và chỉ hiện nút khi có gì để mở.
  const longBio = (p.description?.length ?? 0) > 320;

  const meta: { label: string; value: string }[] = [];
  if (p.ceo) meta.push({ label: tr('an.ceo'), value: p.ceo });
  if (p.employees)
    meta.push({ label: tr('an.employees'), value: p.employees.toLocaleString('en-US') });
  if (p.ipoDate) meta.push({ label: tr('an.ipo'), value: p.ipoDate });
  if (p.exchange) meta.push({ label: tr('an.listedOn'), value: p.exchange });

  return (
    <>
      <h3 className="dsec">{tr('an.company')}</h3>

      {tags.length > 0 || host ? (
        <div className="cptags">
          {tags.map((x) => (
            <span className="cptag" key={x}>
              {x}
            </span>
          ))}
          {host && (
            <a className="cptag cplink" href={p.website!} target="_blank" rel="noopener">
              {host}
            </a>
          )}
        </div>
      ) : null}

      {p.description ? (
        <>
          <p className={open ? 'cpbio' : 'cpbio clamp'}>{p.description}</p>
          {longBio && (
            <button type="button" className="cpmore" onClick={() => setOpen(!open)}>
              {tr(open ? 'an.less' : 'an.more')}
            </button>
          )}
        </>
      ) : (
        <p className="cap">
          {tr(p.sources.fmp === 'no-key' ? 'an.companyNoKey' : 'an.companyNoBio')}
        </p>
      )}

      {meta.length > 0 && (
        <dl className="stats cpmeta">
          {meta.map((m) => (
            <Row key={m.label} label={m.label} value={m.value} />
          ))}
        </dl>
      )}

      <p className="cap">{tr('an.companyNote')}</p>
    </>
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
      if (!r.ok) throw new Error(j.error ?? tr('an.loadFailed'));
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

  const { t: tr } = useLang();
  const t = data?.technical;
  const f = data?.fundamental;
  const p = data?.price;
  const tv = data ? tvSymbol(data.symbol, data.exchange) : '';

  return (
    <section className="panel">
      <div className="panel-head">
        {loading ? (
          tr('an.loading')
        ) : error ? (
          error
        ) : data ? (
          <>
            {/* Mã tô màu định danh, tên công ty giữ màu tiêu đề. */}
            <span className="sym">{data.symbol}</span> · {data.name}
          </>
        ) : (
          tr('an.title')
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
            placeholder={tr('an.placeholder')}
            aria-label={tr('an.inputAria')}
          />
          <button type="submit" disabled={loading}>
            {tr('an.submit')}
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
            <strong>{tr('an.emptyTitle')}</strong>
            {tr('an.emptyBody')}
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
                title={tr(watchlist.includes(data.symbol) ? 'wl.removeTitle' : 'wl.addTitle')}
                onClick={() => onToggleWatchlist(data.symbol)}
              >
                {watchlist.includes(data.symbol) ? tr('an.inWatchlist') : tr('an.saveWatchlist')}
              </button>
            </div>

            <div className="r52">
              <div className="r52bar">
                <i style={{ left: `${Math.min(100, Math.max(0, (p.pos52 ?? 0) * 100))}%` }} />
              </div>
              <div className="r52ends">
                <span>{tr('an.low52', usd(p.low52))}</span>
                <span>{tr('an.ofRange', pct(p.pos52, 0))}</span>
                <span>{tr('an.high52', usd(p.high52))}</span>
              </div>
            </div>

            {data.profile && <CompanyProfileCard p={data.profile} />}

            <ColorLegend />

            <AiRead analysis={data} />

            <h3 className="dsec">{tr('an.technical')}</h3>
            <dl className="stats">
              <Row
                label="RSI(14)"
                value={num(t.rsi14, 1)}
                note={rsiLabel(t.rsi14) ? tr(rsiLabel(t.rsi14)) : ''}
                tone={t.rsi14 === null ? undefined : t.rsi14 >= 70 || t.rsi14 <= 30 ? 'warn' : undefined}
              />
              <Row
                label="MACD(12,26,9)"
                value={num(t.macd?.hist ?? null)}
                note={t.macd ? tr(t.macd.hist >= 0 ? 'an.aboveSignal' : 'an.belowSignal') : ''}
                tone={t.macd ? (t.macd.hist >= 0 ? 'good' : 'bad') : undefined}
              />
              <Row label="SMA20" value={usd(t.sma20)} note={pct(t.vsSma20)} tone={(t.vsSma20 ?? 0) >= 0 ? 'good' : 'bad'} />
              <Row label="SMA50" value={usd(t.sma50)} note={pct(t.vsSma50)} tone={(t.vsSma50 ?? 0) >= 0 ? 'good' : 'bad'} />
              <Row
                label="SMA200"
                value={usd(t.sma200)}
                note={tr('an.smaStreak', {
                  pct: pct(t.vsSma200),
                  n: Math.abs(t.sma200Streak ?? 0),
                  side: (t.sma200Streak ?? 0) >= 0 ? 'above' : 'below',
                })}
                tone={(t.vsSma200 ?? 0) >= 0 ? 'good' : 'bad'}
              />
              <Row label="Bollinger %B" value={num(t.bollinger?.pctB ?? null)} note={bbLabel(t.bollinger?.pctB ?? null)} />
              <Row label="ATR(14)" value={usd(t.atr14)} note={pct(t.atrPct)} />
              <Row label="HV20 / HV60" value={`${pct(t.hv20, 0)} / ${pct(t.hv60, 0)}`} note={t.volRatio ? tr('an.volRatio', num(t.volRatio)) : ''} />
            </dl>

            <h3 className="dsec">{tr('an.options')}</h3>
            <dl className="stats">
              <Row label={tr('an.refIv')} value={pct(data.options.iv, 1)} note={data.options.refExpiration ?? ''} />
              <Row
                label="IV / HV20"
                value={num(data.options.ivHv)}
                note={data.options.ivHv ? tr(data.options.ivHv > 1.2 ? 'an.optRich' : 'an.optFair') : ''}
                tone={data.options.ivHv && data.options.ivHv > 1.2 ? 'warn' : undefined}
              />
              <Row label={tr('an.refStrike')} value={usd(data.options.refStrike)} note={`Δ ${num(data.options.refDelta)}`} />
            </dl>
            <p className="cap">
              {tr('an.ivNote')}
            </p>

            <h3 className="dsec">{tr('an.fundamental')}</h3>
            <dl className="stats">
              <Row label={tr('an.marketCap')} value={big(f.marketCap)} />
              <Row label="P/E" value={num(f.peRatio, 1)} />
              <Row label="EPS" value={usd(f.eps)} />
              <Row label={tr('an.dividend')} value={f.divYield ? `${num(f.divYield, 2)}%` : '—'} note={f.divAmount ? tr('an.perYear', usd(f.divAmount)) : ''} />
              <Row label={tr('an.exDate')} value={f.divExDate ?? '—'} />
              <Row label={tr('an.avgVol10')} value={big(f.avgVolume10d)} note={f.avgVolume1y ? tr('an.avgVol1y', big(f.avgVolume1y)) : ''} />
              <Row label={tr('an.lastEarnings')} value={f.lastEarnings ?? '—'} />
              <Row label={tr('an.nextEarnings')} value={f.nextEarnings ?? '—'} tone={f.nextEarnings ? 'warn' : undefined} />
            </dl>
            <p className="cap">
              {tr('an.earningsNote')}
            </p>

            {data.finviz && (
              <>
                <h3 className="dsec">{tr('an.finviz')}</h3>
                <dl className="stats">
                  <Row
                    label={tr('an.targetPrice')}
                    value={data.finviz.metrics['Target Price'] ?? '—'}
                    note={(() => {
                      const tp = parseFloat(data.finviz.metrics['Target Price'] ?? '');
                      if (!isFinite(tp)) return '';
                      const up = (tp - p.spot) / p.spot;
                      return tr('an.vsCurrent', `${up >= 0 ? '+' : ''}${(up * 100).toFixed(1)}%`);
                    })()}
                  />
                  <Row
                    label={tr('an.avgRating')}
                    value={data.finviz.metrics['Recom'] ?? '—'}
                    note={tr('an.ratingScale')}
                  />
                  <Row label={tr('an.fwdPe')} value={data.finviz.metrics['Forward P/E'] ?? '—'} note={tr('an.currently', data.finviz.metrics['P/E'] ?? '—')} />
                  <Row label={tr('an.epsNextY')} value={data.finviz.metrics['EPS next Y'] ?? '—'} />
                  <Row label="Short float" value={data.finviz.metrics['Short Float'] ?? '—'} note={data.finviz.metrics['Short Ratio'] ? tr('an.ratio', data.finviz.metrics['Short Ratio']) : ''} />
                  <Row label="Rel Volume" value={data.finviz.metrics['Rel Volume'] ?? '—'} note={tr('an.vsUsualVol')} />
                  <Row label="Beta" value={data.finviz.metrics['Beta'] ?? '—'} />
                  <Row label="ROE / ROIC" value={`${data.finviz.metrics['ROE'] ?? '—'} / ${data.finviz.metrics['ROIC'] ?? '—'}`} />
                  <Row label={tr('an.debtEq')} value={data.finviz.metrics['Debt/Eq'] ?? '—'} />
                  <Row label={tr('an.perfYear')} value={data.finviz.metrics['Perf Year'] ?? '—'} note={data.finviz.metrics['Perf YTD'] ? `YTD ${data.finviz.metrics['Perf YTD']}` : ''} />
                </dl>

                {data.finviz.ratings.length > 0 && (
                  <table className="ratings">
                    <thead>
                      <tr>
                        <th>{tr('an.date')}</th>
                        <th>{tr('an.action')}</th>
                        <th>{tr('an.analyst')}</th>
                        <th>{tr('an.rating')}</th>
                        <th>{tr('an.targetPrice')}</th>
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
                  {tr('an.finvizNote')}
                </p>
              </>
            )}

            <h3 className="dsec">{tr('an.news')}</h3>
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
                        ? tr('an.mentionsN', n.tickerCount)
                        : tr('an.thisTickerOnly')}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="cap">{tr('an.noNews')}</p>
            )}
            <p className="cap">
              {tr('an.newsNote')}
            </p>

            <h3 className="dsec">{tr('dd.chart')}</h3>
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

            <h3 className="dsec">{tr('dd.technicals')}</h3>
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
              {tr('an.tvGaugeNote')}
            </p>

            <h3 className="dsec">{tr('an.gamma')}</h3>
            <GexChart symbol={data.symbol} />
            <p className="cap">
              {tr('an.gammaNote')}
            </p>

            <h3 className="dsec">{tr('dd.external')}</h3>
            <div className="linkrow">
              <a href={tradingViewChartUrl(data.symbol, data.exchange)} target="_blank" rel="noopener">
                {tr('dd.fullChart')}
              </a>
              <a href={tcpwGexUrl(data.symbol)} target="_blank" rel="noopener">
                {tr('dd.gexTcpw')}
              </a>
            </div>

            <p className="cap">
              {tr('an.metaNote', {
                bars: data.meta.bars,
                first: data.meta.firstBar,
                last: data.meta.lastBar,
              })}
            </p>
          </>
        )}
      </div>
    </section>
  );
}
