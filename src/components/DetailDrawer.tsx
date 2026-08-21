'use client';

import { useEffect } from 'react';
import TradingViewWidget from './TradingViewWidget';
import GexChart from './GexChart';
import {
  tvSymbol,
  tradingViewChartUrl,
  tcpwGexUrl,
  tcpwGexUrlEn,
} from '@/lib/links';
import type { Candidate } from '@/lib/types';

const usd = (n: number) =>
  n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  });

export default function DetailDrawer({
  row,
  onClose,
  inWatchlist,
  onToggleWatchlist,
}: {
  row: Candidate | null;
  onClose: () => void;
  inWatchlist: boolean;
  onToggleWatchlist: (symbol: string) => void;
}) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);

  if (!row) return null;
  const tv = tvSymbol(row.symbol, row.exchange);

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-label={`Chi tiết ${row.symbol}`}>
        <div className="drawer-head">
          <div>
            <span className="sym">{row.symbol}</span>
            <span className="sub2">{row.name}</span>
          </div>
          <div className="headacts">
            <button
              className={inWatchlist ? 'wl on' : 'wl'}
              onClick={() => onToggleWatchlist(row.symbol)}
            >
              {inWatchlist ? '★ Trong watchlist' : '☆ Lưu watchlist'}
            </button>
            <button className="x" onClick={onClose} aria-label="Đóng">
              ✕
            </button>
          </div>
        </div>

        <div className="drawer-body">
          <dl className="stats">
            <div>
              <dt>Strike</dt>
              <dd>{usd(row.strike)}</dd>
            </div>
            <div>
              <dt>Đáo hạn</dt>
              <dd>
                {row.expiration} · {row.dte}d
              </dd>
            </div>
            <div>
              <dt>Credit nhận</dt>
              <dd className="num-key">{usd(row.credit)}</dd>
            </div>
            <div>
              <dt>Vốn khoá</dt>
              <dd>{usd(row.capital)}</dd>
            </div>
            <div>
              <dt>Break-even</dt>
              <dd className={row.breakeven < row.low52 ? 'warn' : undefined}>
                {usd(row.breakeven)}
              </dd>
            </div>
            <div>
              <dt>Lợi suất/năm</dt>
              <dd className="num-key">{row.annualRocPct.toFixed(1)}%</dd>
            </div>
          </dl>

          <p className="assigned">
            Nếu bị assign: bạn mua 100 {row.symbol} với giá vốn thực{' '}
            <b>{usd(row.breakeven)}</b>, tức thấp hơn giá hiện tại{' '}
            {(((row.spot - row.breakeven) / row.spot) * 100).toFixed(1)}%.
          </p>

          {row.warnings.length > 0 && (
            <ul className="warnlist">
              {row.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          )}

          <h3 className="dsec">Biểu đồ</h3>
          <TradingViewWidget
            type="advanced-chart"
            height={320}
            attributionHref={`https://www.tradingview.com/symbols/${tv.replace(
              ':',
              '-'
            )}/`}
            attributionLabel={`${row.symbol} chart`}
            config={{
              width: '100%',
              height: 320,
              symbol: tv,
              interval: 'D',
              range: '6M',
              timezone: 'America/New_York',
              theme: 'light',
              style: '1',
              locale: 'en',
              hide_side_toolbar: true,
              allow_symbol_change: false,
              save_image: false,
              studies: ['MASimple@tv-basicstudies'],
              support_host: 'https://www.tradingview.com',
            }}
          />
          <p className="cap">
            Kẻ tay mức {usd(row.strike)} (strike) và {usd(row.breakeven)}{' '}
            (break-even) lên chart để xem giá đã từng thủng vùng đó chưa.
          </p>

          <h3 className="dsec">Đánh giá kỹ thuật</h3>
          <TradingViewWidget
            type="technical-analysis"
            height={400}
            attributionHref={`https://www.tradingview.com/symbols/${tv.replace(
              ':',
              '-'
            )}/technicals/`}
            attributionLabel={`${row.symbol} technicals`}
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

          <h3 className="dsec">Gamma theo strike</h3>
          <GexChart symbol={row.symbol} strike={row.strike} />
          <p className="cap">
            Tính tại chỗ từ chuỗi quyền chọn Schwab: gamma × open interest cộng
            dồn theo từng strike, cửa sổ 60 ngày. Put wall là strike có gamma put
            lớn nhất — nơi dealer phải mua vào để hedge, nên thường hành xử như
            hỗ trợ. Đây là mô hình dựa trên giả định dealer long call / short
            put, không phải vị thế thật của họ.
          </p>

          <h3 className="dsec">Đối chiếu ngoài</h3>
          <div className="linkrow">
            <a href={tcpwGexUrl(row.symbol)} target="_blank" rel="noopener">
              GEX trên Tạp Chí Phố Wall ↗
            </a>
            <a href={tcpwGexUrlEn(row.symbol)} target="_blank" rel="noopener">
              TCPW (English) ↗
            </a>
            <a
              href={tradingViewChartUrl(row.symbol, row.exchange)}
              target="_blank"
              rel="noopener"
            >
              Mở chart đầy đủ ↗
            </a>
          </div>
          <p className="cap">
            Mỗi nhà cung cấp GEX dùng giả định khác nhau (số kỳ đáo hạn, cách xử
            lý 0DTE), nên con số sẽ lệch nhau. Dùng để đối chiếu vùng giá, đừng
            kỳ vọng khớp từng số.
          </p>
        </div>
      </aside>
    </>
  );
}
