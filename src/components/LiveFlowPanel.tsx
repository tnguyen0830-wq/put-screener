'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLang } from '@/lib/i18n';
import FlowTable, { money, nyTime } from './FlowTable';
import { readRemembered, readRememberedOneOf, remember } from '@/lib/remember';
import { readJsonOrText } from '@/lib/fetchjson';
import { filterRows, sideCounts, type FlowSide, type LiveRow } from '@/lib/liveflow';
import ChipRow from './ChipRow';

type WsDiag = {
  state: 'idle' | 'connecting' | 'open' | 'closed' | 'refused' | 'unsupported' | 'no-key';
  since: number | null;
  connectedAt: number | null;
  lastMessageAt: number | null;
  frames: number;
  controlFrames: number;
  trades: number;
  kept: number;
  belowFloor: number;
  unparsed: number;
  nonJson: number;
  sampleKeys: string[];
  firstFrames: string[];
  closeCode: number | null;
  closeReason: string | null;
  lastError: string | null;
  attempts: number;
  nextRetryAt: number | null;
  handshake?: { at: number; status: number; statusText: string; headers: Record<string, string>; body: string | null } | null;
  refusedUntil?: number | null;
};

type WsRefusal = { status: number; body: string | null; at: number };

type TradesPayload =
  | { src: 'trades'; configured: false }
  | { src: 'trades'; configured: true; now: number; rows: LiveRow[]; minPremium: number; ws: WsDiag };

type AlertsPayload =
  | { configured: false }
  | {
      configured: true;
      rows: LiveRow[];
      fetchedAt: number | null;
      now: number;
      marketOpen: boolean;
      error: string | null;
      errorAt: number | null;
      pageFull: boolean;
      sampleKeys: string[];
      lastBatch: number;
      lastPages?: number;
      tickers?: string[];
      rejected?: string[];
      unparsed: number;
      ttlMs: number;
      /** Lời từ chối WebSocket gần nhất, nếu có — để chế độ Alert nói được vì
       *  sao chế độ Từng lệnh không dùng được. */
      wsRefused?: WsRefusal | null;
    };

type Src = 'trades' | 'alerts';

/** Nhịp hỏi của trình duyệt. Server tự giữ bộ đệm 10 giây, nên hỏi nhanh hơn
 *  cũng không tốn thêm request UW nào — chỉ tốn một vòng mạng tới app. */
const POLL_MS: Record<Src, number> = { trades: 2_000, alerts: 5_000 };
/** Trần số dòng VẼ ra: luồng từng lệnh có thể giữ 1.500 dòng, vẽ hết mỗi 2
 *  giây là bắt điện thoại dựng lại cả nghìn hàng. Màn hình nói ra khi cắt. */
const RENDER_CAP = 300;
/** Đã mở mà quá chừng này không có lệnh nào thì nói ra — "đang chờ" và "UW
 *  không gửi gì" trông y hệt nhau nếu im lặng. */
const QUIET_MS = 20_000;

const SIDES: FlowSide[] = ['ask', 'bid', 'mid', 'mixed', 'unknown'];
const TYPES = ['call', 'put'] as const;
const MINS = [0, 25_000, 100_000, 500_000, 1_000_000] as const;

function parseList<T extends string>(raw: string | null, allowed: readonly T[]): T[] {
  if (!raw) return [];
  return raw.split(',').filter((x): x is T => (allowed as readonly string[]).includes(x));
}

export default function LiveFlowPanel() {
  const { t } = useLang();
  // Alert là mặc định từ #223: đo được ở production là gói UW hiện tại KHÔNG
  // có WebSocket, nên mặc định Từng lệnh là mở tab ra một bảng trống.
  const [src, setSrc] = useState<Src>('alerts');
  const [alerts, setAlerts] = useState<AlertsPayload | null>(null);
  const [trades, setTrades] = useState<TradesPayload | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const [ticker, setTicker] = useState('');
  const [sides, setSides] = useState<FlowSide[]>([]);
  const [types, setTypes] = useState<('call' | 'put')[]>([]);
  const [minPrem, setMinPrem] = useState<number>(0);
  /** id đã thấy ở lượt trước — dòng MỚI được tô sáng một nhịp, như màn UW. */
  const seen = useRef<Set<string> | null>(null);
  const [fresh, setFresh] = useState<Set<string>>(new Set());

  useEffect(() => {
    const s0 = readRememberedOneOf<Src>('lfSrc', ['trades', 'alerts'] as const);
    if (s0) setSrc(s0);
    setTicker(readRemembered('lfTicker') ?? '');
    setSides(parseList(readRemembered('lfSides'), SIDES));
    setTypes(parseList(readRemembered('lfTypes'), TYPES));
    const m = readRememberedOneOf('lfMin', MINS.map(String));
    if (m) setMinPrem(Number(m));
  }, []);

  /* Mã gửi lên server ở chế độ Alert — chờ 1 giây sau lần gõ cuối, để gõ
     dở "Q", "QQ" không thành một request UW cho mã không tồn tại. Bảng vẫn
     lọc NGAY phía trình duyệt trên những dòng đã có trong lúc chờ. */
  const [serverTickers, setServerTickers] = useState('');
  useEffect(() => {
    const id = setTimeout(() => setServerTickers(ticker.trim()), 1000);
    return () => clearTimeout(id);
  }, [ticker]);

  const [retrying, setRetrying] = useState(false);
  const retryWs = useCallback(async () => {
    setRetrying(true);
    try {
      const r = await fetch('/api/liveflow?src=trades&retry=1', { cache: 'no-store' });
      const p = await readJsonOrText(r);
      if (p.ok) setTrades(p.json as TradesPayload);
    } finally {
      setRetrying(false);
    }
  }, []);

  const load = useCallback(async (which: Src, tks: string) => {
    try {
      const q = which === 'alerts' && tks ? `&tickers=${encodeURIComponent(tks)}` : '';
      const r = await fetch(`/api/liveflow?src=${which}${q}`, { cache: 'no-store' });
      const body = await readJsonOrText(r);
      if (!body.ok) {
        setErr(body.summary);
        return;
      }
      if (!r.ok) {
        setErr(`HTTP ${r.status}${body.json?.error ? ` · ${body.json.error}` : ''}`);
        return;
      }
      const p = body.json;
      if (p.configured) {
        const prev = seen.current;
        const ids = new Set<string>(p.rows.map((x: LiveRow) => x.id));
        // Lượt đầu không tô gì: cả bảng "mới" thì chẳng dòng nào nổi bật.
        setFresh(prev ? new Set(p.rows.filter((x: LiveRow) => !prev.has(x.id)).map((x: LiveRow) => x.id)) : new Set());
        seen.current = ids;
      }
      if (which === 'trades') setTrades(p as TradesPayload);
      else setAlerts(p as AlertsPayload);
      setErr(null);
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    }
  }, []);

  useEffect(() => {
    // Đổi nguồn là một bảng khác: không tô dòng nào là "mới" ở lượt đầu.
    seen.current = null;
    setFresh(new Set());
    load(src, serverTickers);
  }, [load, src, serverTickers]);

  useEffect(() => {
    if (paused) return;
    // Chỉ hỏi khi tab trình duyệt đang HIỆN — cửa sổ bỏ quên trong nền không
    // cần luồng sống, và quay lại là hỏi ngay.
    const tick = () => {
      if (document.visibilityState === 'visible') load(src, serverTickers);
    };
    const id = setInterval(tick, POLL_MS[src]);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [paused, load, src, serverTickers]);

  const data = src === 'trades' ? trades : alerts;
  const rows: LiveRow[] = data && data.configured ? data.rows : [];
  const shown = useMemo(
    () => filterRows(rows, { ticker, sides, types, minPremium: minPrem }),
    [rows, ticker, sides, types, minPrem]
  );
  const counts = useMemo(() => sideCounts(rows), [rows]);
  const allUnknown = rows.length > 0 && counts.unknown === rows.length;
  const fromPremium = rows.some((r) => r.sideSource === 'premium');
  const fromNbbo = rows.some((r) => r.sideSource === 'nbbo');
  const drawn = shown.slice(0, RENDER_CAP);
  const al = src === 'alerts' && alerts && alerts.configured ? alerts : null;
  const tr = src === 'trades' && trades && trades.configured ? trades : null;
  const ws = tr?.ws ?? null;

  if (data && !data.configured) {
    return (
      <section className="panel">
        <div className="panel-head">Live Flow</div>
        <div className="panel-body">
          <p className="cap">{t('lf.notConfigured')}</p>
        </div>
      </section>
    );
  }

  const live = !paused && (al ? al.marketOpen : ws ? ws.state === 'open' && ws.kept > 0 : false);
  const fetchedAt = al ? al.fetchedAt : ws?.lastMessageAt ?? null;
  const statusText = paused
    ? t('lf.paused')
    : al
      ? al.marketOpen
        ? t('lf.live')
        : t('lf.closedShort')
      : ws
        ? t(`lf.ws.state.${ws.state}`)
        : t('lf.live');

  return (
    <section className="panel liveflow">
      <div className="panel-head lfhead">
        <span>Live Flow</span>
        <span className={`lfstatus${live ? ' on' : ''}`}>
          <i className="lfdot" />
          {statusText}
          {fetchedAt ? ` · ${nyTime(new Date(fetchedAt).toISOString())} ET` : ''}
        </span>
      </div>
      <div className="panel-body">
        <div className="segmented lfsrc">
          {(['alerts', 'trades'] as const).map((k) => (
            <button
              key={k}
              className={src === k ? 'on' : undefined}
              onClick={() => {
                setSrc(k);
                remember('lfSrc', k);
              }}
            >
              {t(`lf.src.${k}`)}
            </button>
          ))}
        </div>
        <p className="cap">{src === 'trades' ? t('lf.introTrades') : t('lf.intro')}</p>

        <div className="lftools">
          <div className="segmented lfplay">
            <button className={!paused ? 'on' : undefined} onClick={() => setPaused(false)}>
              ▶ {t('lf.live')}
            </button>
            <button className={paused ? 'on' : undefined} onClick={() => setPaused(true)}>
              ❚❚ {t('lf.pause')}
            </button>
          </div>
          <input
            className="lfticker"
            value={ticker}
            placeholder={t('lf.tickerPh')}
            onChange={(e) => {
              setTicker(e.target.value);
              remember('lfTicker', e.target.value);
            }}
          />
        </div>

        <ChipRow
          label={t('lf.side')}
          note={sides.length ? t('lf.sideOn') : t('lf.sideOff')}
          options={SIDES.map((s) => ({ value: s, label: t(`lf.side.${s}`) }))}
          value={sides}
          onChange={(v) => {
            setSides(v);
            remember('lfSides', v.join(','));
          }}
        />
        <ChipRow
          label={t('lf.type')}
          note={types.length ? t('lf.typeOn') : t('lf.typeOff')}
          options={TYPES.map((s) => ({ value: s, label: s === 'call' ? 'Calls' : 'Puts' }))}
          value={types}
          onChange={(v) => {
            setTypes(v);
            remember('lfTypes', v.join(','));
          }}
        />
        <div className="field">
          <label>{t('lf.minPrem')}</label>
          <div className="chiprow">
            {MINS.map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={minPrem === m}
                className={minPrem === m ? 'on' : undefined}
                onClick={() => {
                  setMinPrem(m);
                  remember('lfMin', String(m));
                }}
              >
                {m === 0 ? t('lf.minAll') : `≥ ${money(m)}`}
              </button>
            ))}
          </div>
        </div>

        <p className="hint hint-warn">{t('lf.caveat')}</p>
        {al && !al.marketOpen && <p className="cap warnline">{t('lf.closed')}</p>}
        {ws && (
          <WsStatus
            ws={ws}
            now={tr!.now}
            retrying={retrying}
            onRetry={retryWs}
            onAlerts={() => {
              setSrc('alerts');
              remember('lfSrc', 'alerts');
            }}
          />
        )}
        {al && al.wsRefused && (
          <p className="hint lfkeys lfplan">
            {t(planLacksWs(al.wsRefused.body) ? 'lf.ws.planNote' : 'lf.ws.refusedNote', al.wsRefused.status)}
          </p>
        )}
        {err && <p className="cap warnline">{t('lf.fetchErr', err)}</p>}
        {al && al.error && (
          <p className="cap warnline">
            {t('lf.uwErr', al.error)}
            {al.rows.length ? ` ${t('lf.keptOld')}` : ''}
          </p>
        )}
        {al && al.tickers && al.tickers.length > 0 && <p className="hint">{t('lf.serverFilter', al.tickers.join(', '))}</p>}
        {al && al.rejected && al.rejected.length > 0 && <p className="hint hint-warn">{t('lf.rejected', al.rejected.join(', '))}</p>}
        {al && al.pageFull && <p className="hint hint-warn">{t('lf.pageFull', { n: al.lastBatch, pages: al.lastPages ?? 1 })}</p>}
        {allUnknown && (
          <p className="cap warnline lfkeys">
            {t('lf.noSide')} <code>{(al ? al.sampleKeys : ws?.sampleKeys ?? []).join(', ')}</code>
          </p>
        )}
        {fromPremium && <p className="hint">{t('lf.sidePremium')}</p>}
        {fromNbbo && <p className="hint">{t('lf.sideNbbo')}</p>}
        {al && al.unparsed > 0 && (
          <p className="hint hint-warn lfkeys">
            {t('lf.unparsed', al.unparsed)} <code>{al.sampleKeys.join(', ')}</code>
          </p>
        )}
        {tr && <p className="hint">{t('lf.floor', money(tr.minPremium))}</p>}

        <p className="hint">
          {t('lf.count', { shown: shown.length, total: rows.length })} · ASK {counts.ask} · BID {counts.bid}
          {counts.mid ? ` · MID ${counts.mid}` : ''}
          {counts.mixed ? ` · ${t('lf.side.mixed')} ${counts.mixed}` : ''}
          {counts.unknown ? ` · ? ${counts.unknown}` : ''}
          {shown.length > RENDER_CAP ? ` · ${t('lf.renderCap', RENDER_CAP)}` : ''}
        </p>

        {!data ? (
          <p className="cap">…</p>
        ) : rows.length === 0 ? (
          <div className="empty">
            <p className="cap">
              {al && al.error ? t('lf.emptyErr') : ws ? t(ws.state === 'open' ? 'lf.ws.emptyOpen' : 'lf.ws.emptyNotOpen') : t('lf.empty')}
            </p>
          </div>
        ) : shown.length === 0 ? (
          <div className="empty">
            <p className="cap">{t('lf.emptyFiltered')}</p>
          </div>
        ) : (
          <FlowTable rows={drawn} fresh={fresh} />
        )}
      </div>
    </section>
  );
}

/** Trạng thái luồng WebSocket, nói ra đúng một trong các tình huống — không
 *  bao giờ để "chưa nối", "UW từ chối" và "đang chờ lệnh" trông như nhau. */
/** UW nói rõ trong thân câu trả lời khi thiếu là do GÓI ("websocket scope",
 *  "upgrade your api subscription") — ĐO ĐƯỢC 2026-09-23. Chỉ đọc chữ để chọn
 *  câu giải thích; không khớp thì nói chung "khoá hoặc gói", không đoán. */
function planLacksWs(body: string | null | undefined): boolean {
  return !!body && /scope|subscription|upgrade|plan/i.test(body);
}

function WsStatus({
  ws,
  now,
  retrying,
  onRetry,
  onAlerts,
}: {
  ws: WsDiag;
  now: number;
  retrying: boolean;
  onRetry: () => void;
  onAlerts: () => void;
}) {
  const { t } = useLang();
  const quiet = ws.state === 'open' && ws.kept === 0 && ws.connectedAt !== null && now - ws.connectedAt > QUIET_MS;
  const broken = ws.state === 'closed' || ws.state === 'unsupported';
  const refused = ws.state === 'refused';
  const retryIn = ws.nextRetryAt && ws.nextRetryAt > now ? Math.round((ws.nextRetryAt - now) / 1000) : null;
  return (
    <>
      {ws.state === 'connecting' && (
        <p className="cap">
          {t('lf.ws.connecting')}
          {ws.since ? ` ${t('lf.ws.elapsed', Math.max(0, Math.round((now - ws.since) / 1000)))}` : ''}
        </p>
      )}
      {ws.state === 'connecting' && ws.attempts > 1 && ws.lastError && (
        <p className="cap warnline lfkeys">{t('lf.ws.prev', ws.lastError)}</p>
      )}
      {ws.handshake && (
        <div className={`cap lfkeys${ws.handshake.status === 101 ? '' : ' warnline'}`}>
          <p>
            {t('lf.ws.http', {
              status: ws.handshake.status,
              text: ws.handshake.statusText,
              meaning: t(httpMeaningKey(ws.handshake.status)),
            })}
          </p>
          {ws.handshake.status !== 101 &&
            (ws.handshake.body ? (
              <>
                <p>{t('lf.ws.body')}</p>
                <pre className="lfframe">{ws.handshake.body}</pre>
              </>
            ) : (
              <p>{t('lf.ws.noBody')}</p>
            ))}
          {Object.keys(ws.handshake.headers).length > 0 && (
            <p>
              {t('lf.ws.headers')}{' '}
              <code>
                {Object.entries(ws.handshake.headers)
                  .map(([k, v]) => `${k}: ${v}`)
                  .join(' · ')}
              </code>
            </p>
          )}
        </div>
      )}
      {refused && (
        <div className="cap warnline lfrefused">
          <p>
            <strong>
              {t(planLacksWs(ws.handshake?.body) ? 'lf.ws.refusedPlan' : 'lf.ws.refusedKey', ws.handshake?.status ?? '—')}
            </strong>
          </p>
          <p>
            {ws.refusedUntil ? t('lf.ws.refusedNext', nyTime(new Date(ws.refusedUntil).toISOString())) : ''}{' '}
            <button className="rrgfullbtn" onClick={onAlerts}>
              {t('lf.ws.useAlertsNow')} →
            </button>{' '}
            <button className="rrgfullbtn" onClick={onRetry} disabled={retrying}>
              {retrying ? t('lf.ws.retryingBtn') : t('lf.ws.retryBtn')}
            </button>
          </p>
        </div>
      )}
      {broken && (
        <p className="cap warnline">
          {t('lf.ws.closed', {
            code: ws.closeCode ?? '—',
            reason: ws.closeReason || ws.lastError || t('lf.ws.noReason'),
          })}
          {` ${retryIn !== null && retryIn > 0 ? t('lf.ws.retry', retryIn) : t('lf.ws.retrySoon')}`}{' '}
          <button className="rrgfullbtn" onClick={onAlerts}>{t('lf.ws.useAlerts')} →</button>
        </p>
      )}
      {quiet && (
        <p className="cap warnline">
          {t('lf.ws.quiet', { frames: ws.frames, trades: ws.trades })}{' '}
          <button className="rrgfullbtn" onClick={onAlerts}>{t('lf.ws.useAlerts')} →</button>
        </p>
      )}
      {ws.unparsed > 0 && (
        <p className="hint hint-warn lfkeys">
          {t('lf.unparsed', ws.unparsed)} <code>{ws.sampleKeys.join(', ') || '—'}</code>
        </p>
      )}
      {/* Tự mở khi luồng chưa chạy: lúc đó khối này là thứ duy nhất đáng đọc,
          bắt bấm thêm một lần là bắt chờ vô ích. */}
      <details className="lfdiag" open={ws.state !== 'open' || ws.kept === 0}>
        <summary>{t('lf.ws.diag')}</summary>
        <p className="hint">
          {t('lf.ws.counts', {
            frames: ws.frames,
            control: ws.controlFrames,
            trades: ws.trades,
            kept: ws.kept,
            below: ws.belowFloor,
            unparsed: ws.unparsed,
            nonJson: ws.nonJson,
            attempts: ws.attempts,
          })}
        </p>
        {ws.sampleKeys.length > 0 && (
          <p className="hint lfkeys">
            {t('lf.ws.keys')} <code>{ws.sampleKeys.join(', ')}</code>
          </p>
        )}
        {ws.firstFrames.length > 0 && (
          <>
            <p className="hint">{t('lf.ws.frames')}</p>
            {ws.firstFrames.map((f, i) => (
              <pre key={i} className="lfframe">{f}</pre>
            ))}
          </>
        )}
      </details>
    </>
  );
}

/** Mã HTTP → khoá câu giải thích. Không đoán ngoài bảng: mã lạ in "chưa rõ". */
function httpMeaningKey(status: number): string {
  if (status === 401) return 'lf.ws.h401';
  if (status === 403) return 'lf.ws.h403';
  if (status === 404) return 'lf.ws.h404';
  if (status === 101) return 'lf.ws.h101';
  if (status === 400) return 'lf.ws.h400';
  if (status === 426) return 'lf.ws.h426';
  if (status === 429) return 'lf.ws.h429';
  if (status >= 500) return 'lf.ws.h5xx';
  if (status >= 300 && status < 400) return 'lf.ws.h3xx';
  if (status === 200) return 'lf.ws.h200';
  return 'lf.ws.hOther';
}
