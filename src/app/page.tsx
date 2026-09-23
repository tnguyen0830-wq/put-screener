'use client';

import { useCallback, useEffect, useState } from 'react';
import FilterPanel from '@/components/FilterPanel';
import TickerTape from '@/components/TickerTape';
import ResultsTable from '@/components/ResultsTable';
import DetailDrawer from '@/components/DetailDrawer';
import WatchlistPanel from '@/components/WatchlistPanel';
import AnalysisPanel from '@/components/AnalysisPanel';
import HeatmapPanel from '@/components/HeatmapPanel';
import FearGreed from '@/components/FearGreed';
import RrgChart from '@/components/RrgChart';
import GexExposurePanel from '@/components/GexExposurePanel';
import InternalsPanel from '@/components/InternalsPanel';
import PortfolioPanel from '@/components/PortfolioPanel';
import InsiderPanel from '@/components/InsiderPanel';
import CongressPanel from '@/components/CongressPanel';
import OptionFlowPanel from '@/components/OptionFlowPanel';
import DarkpoolPanel from '@/components/DarkpoolPanel';
import SettingsMenu from '@/components/SettingsMenu';
import InstallApp from '@/components/InstallApp';
import LongTermPanel from '@/components/LongTermPanel';
import NewsPanel from '@/components/NewsPanel';
import LearnPanel from '@/components/LearnPanel';
import DaytradePanel from '@/components/DaytradePanel';
import MmExposurePanel from '@/components/MmExposurePanel';
import { useLang } from '@/lib/i18n';
import { readRemembered, readRememberedOneOf, remember } from '@/lib/remember';
import { TABS, type Tab } from '@/lib/tabs';
import Logo from '@/components/Logo';
import ColorLegend from '@/components/ColorLegend';
import { DEFAULT_OFF, type Candidate, type Filters, type StreamEvent } from '@/lib/types';

const DEFAULTS: Filters = {
  universe: 'sp500',
  maxCapital: 50000,
  minDelta: 0.15,
  maxDelta: 0.3,
  minDte: 25,
  maxDte: 50,
  minAnnualRoc: 15,
  minOpenInterest: 500,
  maxSpreadPct: 5,
  minIvHv: 1.0,
  minDrawdownPct: 10,
  minIv: 35,
  requireAboveSma200: true,
  excludeEarnings: true,
  /* Rỗng = không lọc theo vốn hoá. Mặc định phải là trạng thái RỘNG nhất:
     một bộ lọc bật sẵn mà người dùng chưa từng chạm vào là một bộ lọc ngầm. */
  caps: [],
  hardGates: true,
  sectors: [],
  limit: 0,
  off: [...DEFAULT_OFF],
};

type Status = {
  configured: boolean;
  connected: boolean;
  daysLeft?: number;
};

/* TABS/Tab nằm ở `lib/tabs.ts` chứ không ở đây từ khi server phải kiểm tên
   tab của nhịp báo hoạt động - một danh sách, hai nơi dùng, không có bản
   chép nào để trôi lệch. */
/** Bốn nguồn "ai/cái gì đang mua" trong tab Insider Trade, xem RIÊNG
 *  TỪNG CÁI thay vì xếp chồng cả bốn phải cuộn dài. */
const INSIDER_SUBS = ['form4', 'congress', 'flow', 'darkpool'] as const;
type InsiderSub = (typeof INSIDER_SUBS)[number];
/** Bốn nội dung khác nhau trong tab Heatmap, cùng lý do tách tab con như
 *  Insider Trade ở trên - trước đó cả bốn (bản đồ nhiệt, Fear & Greed, RRG,
 *  GEX) xếp chồng trong một cột phải cuộn rất dài mới thấy hết. */
const HEATMAP_SUBS = ['map', 'feargreed', 'rrg', 'gex', 'internals'] as const;
type HeatmapSub = (typeof HEATMAP_SUBS)[number];

/** Nhịp báo "đang mở tab nào". Hai phút, dưới hẳn ngưỡng 5 phút mà server
 *  coi là đã rời đi (`ONLINE_MS`), nên một nhịp rớt không làm người đang
 *  ngồi đó biến mất khỏi màn hình Hoạt động. */
const HEARTBEAT_MS = 2 * 60_000;

export default function Page() {
  const { t } = useLang();
  const [tab, setTab] = useState<Tab>('screener');
  const [insiderSub, setInsiderSub] = useState<InsiderSub>('form4');
  const [heatmapSub, setHeatmapSub] = useState<HeatmapSub>('map');
  /* Nhớ tab và tab con đang mở giữa hai lần mở app. Chủ app xem GEX SPX
     trên điện thoại, thoát ra mở lại là về Sell Put Screener và phải bấm
     lại hai lần - "SPX bị mất". Đọc SAU khi hydrate (xem lib/remember.ts),
     và cờ `restored` để không ghi đè giá trị đã nhớ bằng mặc định ở lượt
     render đầu tiên. */
  const [restored, setRestored] = useState(false);
  useEffect(() => {
    const savedTab = readRememberedOneOf<Tab>('tab', TABS);
    const savedHm = readRememberedOneOf<HeatmapSub>('heatmapSub', HEATMAP_SUBS);
    const savedIn = readRememberedOneOf<InsiderSub>('insiderSub', INSIDER_SUBS);
    /* Phơi nhiễm MM từng là tab con thứ ba của Daytrade; giờ là tab chính
       riêng. Người đã để nó mở lần trước (`tab=daytrade` + `dtmode=mmexposure`)
       mở lại phải về đúng chỗ đó, không phải rơi về nửa Cổ phiếu — bộ nhớ
       cũ vẫn nằm trong trình duyệt họ. */
    /* Patterns cũng đi chiều ngược lại (#217): từ tab chính vào thành chế độ
       thứ ba của Learn. 'patterns' đã rời TABS nên `readRememberedOneOf`
       trả null cho nó — đọc giá trị THÔ để người để mở Patterns lần trước
       mở lại đúng chỗ đó, thay vì rơi về tab mặc định. */
    if (readRemembered('tab') === 'patterns') {
      setTab('learn');
      remember('learnMode', 'patterns');
      remember('tab', 'learn');
    } else if (savedTab === 'daytrade' && readRemembered('dtmode') === 'mmexposure') {
      setTab('mmexposure');
      remember('dtmode', 'stocks');
    } else if (savedTab) setTab(savedTab);
    if (savedHm) setHeatmapSub(savedHm);
    if (savedIn) setInsiderSub(savedIn);
    setRestored(true);
  }, []);
  useEffect(() => {
    if (!restored) return;
    remember('tab', tab);
    remember('heatmapSub', heatmapSub);
    remember('insiderSub', insiderSub);
  }, [restored, tab, heatmapSub, insiderSub]);

  /* Nhịp báo "tôi đang mở tab nào" cho màn hình Hoạt động (⚙ → Quản lý tài
     khoản, chỉ chủ app đọc được). Gửi khi đổi tab và hai phút một lần.

     CHỈ gửi khi tab trình duyệt đang HIỆN: một cửa sổ bỏ quên trong nền
     không phải là "đang dùng app", và nếu vẫn báo thì màn hình kia sẽ nói
     có người online suốt đêm. `visibilitychange` cũng gọi lại ngay, để quay
     lại tab là hiện online liền chứ không phải chờ hết hai phút.

     Hỏng thì im: đây là thứ phụ, không được phép làm vỡ trang chính. */
  useEffect(() => {
    if (!restored) return;
    let alive = true;
    const ping = () => {
      if (!alive || document.visibilityState !== 'visible') return;
      fetch('/api/activity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tab }),
        keepalive: true,
      }).catch(() => {});
    };
    ping();
    const id = setInterval(ping, HEARTBEAT_MS);
    document.addEventListener('visibilitychange', ping);
    return () => {
      alive = false;
      clearInterval(id);
      document.removeEventListener('visibilitychange', ping);
    };
  }, [restored, tab]);

  /* Vai trò của người đang đăng nhập. 'owner' thấy tab My Portfolio, người
     nhà thì không - xem lib/users.ts. Mặc định 'member' trong lúc chưa biết:
     đoán thấp rồi hiện thêm, an toàn hơn là cho tab loé lên rồi biến mất. */
  const [role, setRole] = useState<'owner' | 'member'>('member');
  useEffect(() => {
    let alive = true;
    fetch('/api/me')
      .then(async (r) => {
        // 401 ở đây nghĩa là tài khoản đã bị xoá trong khi phiên còn hạn.
        // Đưa thẳng ra trang đăng nhập: một app hiện ra nhưng mọi thứ đều
        // lỗi 401 thì đọc như app hỏng, chứ không đọc như "bạn bị xoá".
        if (r.status === 401) {
          window.location.href = '/login';
          return null;
        }
        return r.json();
      })
      .then((j) => {
        if (alive && j && (j.role === 'owner' || j.role === 'member')) setRole(j.role);
      })
      .catch(() => {
        /* không hỏi được thì giữ 'member' - chặn thật nằm ở middleware */
      });
    return () => {
      alive = false;
    };
  }, []);

  /* Tab đã nhớ có thể là 'portfolio' - từ lần chủ app đăng nhập trên chính
     máy này, vì localStorage theo trình duyệt chứ không theo tài khoản. Đưa
     người nhà về Screener thay vì để họ nhìn một tab rỗng toàn lỗi 403. */
  useEffect(() => {
    if (role !== 'owner' && tab === 'portfolio') setTab('screener');
  }, [role, tab]);
  const [focusSymbol, setFocusSymbol] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>(DEFAULTS);
  const [rows, setRows] = useState<Candidate[]>([]);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [phase, setPhase] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [selected, setSelected] = useState<Candidate | null>(null);
  const [watchlist, setWatchlist] = useState<string[]>([]);
  const [savingList, setSavingList] = useState(false);
  /** Thời điểm của kết quả đang hiện, nếu nó được nạp lại từ lần quét trước. */
  const [scanAt, setScanAt] = useState<number | null>(null);

  useEffect(() => {
    fetch('/api/watchlist')
      .then((r) => r.json())
      .then((j) => setWatchlist(j.symbols ?? []))
      .catch(() => {});
  }, []);

  const saveWatchlist = useCallback(async (symbols: string[]) => {
    setWatchlist(symbols); // optimistic: the list is small and the write is local
    setSavingList(true);
    try {
      const res = await fetch('/api/watchlist', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbols }),
      });
      const j = await res.json();
      if (Array.isArray(j.symbols)) setWatchlist(j.symbols);
    } finally {
      setSavingList(false);
    }
  }, []);

  /**
   * Mở app lên là có ngay kết quả lần quét trước.
   *
   * Chạy lại mỗi khi đổi phạm vi quét, vì hai phạm vi lưu riêng - gạt từ
   * watchlist sang cả rổ thì phải thấy đúng kết quả của cả rổ, không phải
   * bảng trống.
   */
  useEffect(() => {
    let alive = true;
    (async () => {
      // Hỏi trước xem server có đang quét dở không. Nếu có thì nối vào xem
      // tiếp, đừng nạp kết quả cũ đè lên - lần quét đang chạy mới là thứ
      // người dùng đang chờ.
      try {
        const st = await fetch('/api/screen').then((r) => r.json());
        if (!alive) return;
        // `mine` sai nghĩa là người khác đang quét: nối vào sẽ nhận kết quả
        // chạy bằng watchlist và bộ lọc của họ. Nạp kết quả cũ của chính
        // mình như bình thường.
        if (st.running && st.mine !== false) {
          run();
          return;
        }
      } catch {
        /* không hỏi được thì cứ nạp kết quả cũ như thường */
      }

      try {
        const j = await fetch(
          `/api/screen/last?universe=${filters.universe}`
        ).then((r) => r.json());
        if (!alive || !j.scan) return;
        // Không đè lên kết quả đang quét dở hay vừa quét xong trong phiên này.
        setRows((prev) => (prev.length ? prev : j.scan.rows ?? []));
        setScanAt((prev) => prev ?? j.scan.at ?? null);
      } catch {
        /* chưa quét lần nào */
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.universe]);

  useEffect(() => {
    fetch('/api/auth/status')
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => setStatus({ configured: false, connected: false }));
  }, []);

  /**
   * Đọc luồng NDJSON của một lần quét.
   *
   * Dùng chung cho hai đường vào: bấm nút quét, và mở app lên trong lúc
   * server đang quét dở. Cùng một luồng, vì server phát lại từ sự kiện đầu
   * tiên nên nối vào giữa chừng cũng thấy đủ các mã đã tìm được.
   */
  const run = useCallback(async () => {
    setRunning(true);
    setRows([]);
    setScanAt(null);
    setError(null);
    setProgress({ done: 0, total: 0 });
    setPhase(t('phase.quotes'));

    try {
      const res = await fetch('/api/screen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(filters),
      });
      // 409: người khác trong nhà đang quét. Nói ra thay vì để màn hình
      // đứng im ở "đang lấy báo giá" mãi mãi.
      if (res.status === 409) {
        setError(t('scan.busy'));
        setRunning(false);
        setPhase('');
        return;
      }
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buf = '';

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.trim()) continue;
          const ev = JSON.parse(line) as StreamEvent;
          if (ev.type === 'candidate') {
            setRows((prev) => [...prev, ev.data]);
          } else if (ev.type === 'progress') {
            setProgress({ done: ev.done, total: ev.total });
          } else if (ev.type === 'phase') {
            setPhase(
              ev.phase === 'quotes'
                ? `Đang lấy báo giá — ${ev.detail}`
                : `Đang đọc chuỗi quyền chọn — ${ev.detail}`
            );
          } else if (ev.type === 'error') {
            setError(ev.message);
          } else if (ev.type === 'done') {
            setPhase(
              `Xong: ${ev.found} cơ hội trong ${ev.scanned} mã, ${(
                ev.ms / 1000
              ).toFixed(0)} giây`
            );
          }
        }
      }
    } catch (e: any) {
      setError(e.message ?? 'Quét thất bại');
    } finally {
      setRunning(false);
    }
  }, [filters]);

  const toggleWatchlist = useCallback(
    (sym: string) =>
      saveWatchlist(
        watchlist.includes(sym)
          ? watchlist.filter((s) => s !== sym)
          : [...watchlist, sym]
      ),
    [watchlist, saveWatchlist]
  );

  const pct = progress.total
    ? Math.round((progress.done / progress.total) * 100)
    : 0;

  return (
    <>
      <div className="topstack">
      <header className="rail">
        <a className="brand" href="/" aria-label={t('brand.home')}>
          <Logo height={32} />
          <span className="brandtext">
            <span className="wordmark">
              <span className="wm-name">tyler</span>
              <span className="wm-dot" aria-hidden="true" />
              <span className="wm-tag">INVESTMENT TOOL</span>
            </span>
            <span className="brandsub">{t('brand.sub')}</span>
          </span>
        </a>
        <nav className="segmented tabs">
          <button
            className={tab === 'news' ? 'on' : undefined}
            onClick={() => setTab('news')}
          >
            {t('tab.news')}
          </button>
          <button
            className={tab === 'longterm' ? 'on' : undefined}
            onClick={() => setTab('longterm')}
          >
            {t('tab.longterm')}
          </button>
          <button
            className={tab === 'screener' ? 'on' : undefined}
            onClick={() => setTab('screener')}
          >
            {t('tab.screener')}
          </button>
          <button
            className={tab === 'analyze' ? 'on' : undefined}
            onClick={() => setTab('analyze')}
          >
            {t('tab.analyze')}
          </button>
          <button
            className={tab === 'heatmap' ? 'on' : undefined}
            onClick={() => setTab('heatmap')}
          >
            {t('tab.heatmap')}
          </button>
          <button
            className={tab === 'insider' ? 'on' : undefined}
            onClick={() => setTab('insider')}
          >
            {t('tab.insider')}
          </button>
          <button
            className={tab === 'learn' ? 'on' : undefined}
            onClick={() => setTab('learn')}
          >
            {t('tab.learn')}
          </button>
          <button
            className={tab === 'daytrade' ? 'on' : undefined}
            onClick={() => setTab('daytrade')}
          >
            {t('tab.daytrade')}
          </button>
          <button
            className={tab === 'mmexposure' ? 'on' : undefined}
            onClick={() => setTab('mmexposure')}
          >
            {t('tab.mmexposure')}
          </button>
          {role === 'owner' && (
            <button
              className={tab === 'portfolio' ? 'on' : undefined}
              onClick={() => setTab('portfolio')}
            >
              {t('tab.portfolio')}
            </button>
          )}
        </nav>
        <span className="spacer" />
        <InstallApp />
        <SettingsMenu status={status} />
      </header>

      <TickerTape />
      </div>

      {running && (
        <div className="bar">
          <i style={{ width: `${pct}%` }} />
        </div>
      )}

      {tab === 'screener' ? (
        <div className="shell">
          <div className="leftcol sticky-col">
            <FilterPanel
              value={filters}
              onChange={setFilters}
              onRun={run}
              running={running}
              watchlistCount={watchlist.length}
            />
            <WatchlistPanel
              symbols={watchlist}
              onChange={saveWatchlist}
              saving={savingList}
            />
          </div>

          <section className="panel">
            <div className="panel-head">
              {error
                ? error
                : phase || t('res.count', rows.length)}
            </div>
            <div className="panel-body" style={{ paddingBottom: 0 }}>
              {/* Kết quả nạp lại là ẢNH CHỤP: giá, IV, spread đều đã cũ. Nói
                  rõ giờ quét ngay trên đầu bảng, vì một bảng số trông y hệt
                  lúc mới quét mà thật ra đã cũ vài tiếng là thứ dễ đọc nhầm
                  thành giá sống nhất. */}
              {scanAt !== null && !running && (
                <p className="cap warnline">{t('res.saved', scanAt)}</p>
              )}
              <ColorLegend />
            </div>
            <ResultsTable rows={rows} onSelect={setSelected} />
          </section>
        </div>
      ) : tab === 'analyze' ? (
        <div className="shell solo">
          <AnalysisPanel
            watchlist={watchlist}
            onToggleWatchlist={toggleWatchlist}
            focusSymbol={focusSymbol}
          />
        </div>
      ) : tab === 'portfolio' ? (
        <div className="shell solo">
          <PortfolioPanel />
        </div>
      ) : tab === 'longterm' ? (
        <div className="shell solo">
          <LongTermPanel />
        </div>
      ) : tab === 'news' ? (
        <div className="shell solo">
          <NewsPanel />
        </div>
      ) : tab === 'learn' ? (
        <div className="shell solo">
          {/* Nút "Xem thật ở tab …" trong bài học nhảy sang đúng tab (và tab
              con) đang có dữ liệu sống — bài học đứng cạnh dữ liệu của chính
              app, không phải một cuốn sách rời. `sub` chỉ áp cho hai tab có
              tab con; tên tab/sub đã được `validateLessons()` kiểm ở test. */}
          <LearnPanel
            onOpen={(to, sub) => {
              if (sub && to === 'heatmap' && (HEATMAP_SUBS as readonly string[]).includes(sub)) setHeatmapSub(sub as HeatmapSub);
              if (sub && to === 'insider' && (INSIDER_SUBS as readonly string[]).includes(sub)) setInsiderSub(sub as InsiderSub);
              if ((TABS as readonly string[]).includes(to)) setTab(to as Tab);
            }}
          />
        </div>
      ) : tab === 'daytrade' ? (
        <div className="shell solo">
          <DaytradePanel />
        </div>
      ) : tab === 'mmexposure' ? (
        <div className="shell solo">
          <MmExposurePanel />
        </div>
      ) : tab === 'insider' ? (
        <div className="shell solo">
          {/* Bốn nguồn dữ liệu cùng trả lời "ai/cái gì đang mua", nhưng
              xem RIÊNG TỪNG CÁI qua tab con thay vì xếp chồng - trước đó
              cả bốn bảng nằm chung một cột phải cuộn rất dài mới thấy
              hết. Tab con thay vì thêm 3 tab lớn ở thanh trên vì thanh
              đó đã khá chật trên điện thoại (5 tab lớn hiện có). */}
          <div className="segmented hmranges">
            <button
              className={insiderSub === 'form4' ? 'on' : undefined}
              onClick={() => setInsiderSub('form4')}
            >
              {t('ins.subForm4')}
            </button>
            <button
              className={insiderSub === 'congress' ? 'on' : undefined}
              onClick={() => setInsiderSub('congress')}
            >
              {t('ins.subCongress')}
            </button>
            <button
              className={insiderSub === 'flow' ? 'on' : undefined}
              onClick={() => setInsiderSub('flow')}
            >
              {t('ins.subFlow')}
            </button>
            <button
              className={insiderSub === 'darkpool' ? 'on' : undefined}
              onClick={() => setInsiderSub('darkpool')}
            >
              {t('ins.subDarkpool')}
            </button>
          </div>

          {insiderSub === 'form4' ? (
            <InsiderPanel />
          ) : insiderSub === 'congress' ? (
            <CongressPanel role={role} />
          ) : insiderSub === 'flow' ? (
            <OptionFlowPanel role={role} />
          ) : (
            <DarkpoolPanel role={role} />
          )}
        </div>
      ) : (
        <div className="shell solo">
          {/* Bốn nội dung khác nhau trong tab này (bản đồ nhiệt, Fear & Greed,
              RRG, GEX), xem RIÊNG TỪNG CÁI qua tab con - cùng khuôn mẫu tab
              Insider Trade ở trên, cùng lý do (trước đó xếp chồng một cột
              phải cuộn rất dài mới thấy hết cả bốn). */}
          <div className="segmented hmranges">
            <button
              className={heatmapSub === 'map' ? 'on' : undefined}
              onClick={() => setHeatmapSub('map')}
            >
              {t('hm.subMap')}
            </button>
            <button
              className={heatmapSub === 'feargreed' ? 'on' : undefined}
              onClick={() => setHeatmapSub('feargreed')}
            >
              {t('hm.subFearGreed')}
            </button>
            <button
              className={heatmapSub === 'rrg' ? 'on' : undefined}
              onClick={() => setHeatmapSub('rrg')}
            >
              {t('hm.subRrg')}
            </button>
            <button
              className={heatmapSub === 'gex' ? 'on' : undefined}
              onClick={() => setHeatmapSub('gex')}
            >
              {t('hm.subGex')}
            </button>
            <button
              className={heatmapSub === 'internals' ? 'on' : undefined}
              onClick={() => setHeatmapSub('internals')}
            >
              {t('hm.subInternals')}
            </button>
          </div>

          {heatmapSub === 'map' ? (
            <HeatmapPanel
              onSelectSymbol={(sym) => {
                setFocusSymbol(sym);
                setTab('analyze');
              }}
            />
          ) : heatmapSub === 'feargreed' ? (
            <FearGreed />
          ) : heatmapSub === 'rrg' ? (
            <RrgChart />
          ) : heatmapSub === 'gex' ? (
            <GexExposurePanel />
          ) : (
            <InternalsPanel />
          )}
        </div>
      )}

      <DetailDrawer
        row={selected}
        onClose={() => setSelected(null)}
        inWatchlist={selected ? watchlist.includes(selected.symbol) : false}
        onToggleWatchlist={toggleWatchlist}
      />

      <p className="disclaimer">
        {t('disclaimer')}
      </p>
    </>
  );
}
