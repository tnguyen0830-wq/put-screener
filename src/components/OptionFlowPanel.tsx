'use client';

import { Fragment, useCallback, useEffect, useState } from 'react';
import { useLang } from '@/lib/i18n';

type Alert = {
  id: string;
  type: string;
  strike: number | null;
  expiry: string | null;
  alertRule: string | null;
  hasSweep: boolean;
  hasFloor: boolean;
  hasMultileg: boolean;
  totalPremium: number | null;
  volume: number | null;
  openInterest: number | null;
  tradeCount: number | null;
  underlyingPrice: number | null;
  createdAt: string;
};

type Row = {
  symbol: string;
  alerts: Alert[];
  sweepCount: number;
  lastAlertAt: string | null;
  callPremium: number;
  putPremium: number;
  otherPremium: number;
  totalPremium: number;
  biggestPremium: number;
};

type Payload = {
  configured: boolean;
  rows: Row[];
  lookbackDays: number;
  lastRun: {
    at: number;
    chunks: number;
    seen: number;
    saved: number;
    error: string | null;
    skipped: 'market-closed' | null;
  } | null;
  syncing: boolean;
  trackedCount: number;
  holdingsError: string | null;
  sp500Error: string | null;
};

/** Tiền viết gọn: $1.2M, $340K. Bảng này toàn số bảy chữ số, in đầy đủ thì
 *  mắt phải đếm chữ số để so hai dòng với nhau. */
const money = (n: number | null) => {
  if (n === null || !Number.isFinite(n) || n === 0) return '—';
  const a = Math.abs(n);
  if (a >= 1_000_000) return `$${(n / 1_000_000).toFixed(a >= 10_000_000 ? 0 : 1)}M`;
  if (a >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${Math.round(n)}`;
};

const sideOf = (type: string): 'call' | 'put' | 'other' => {
  const t = String(type ?? '').trim().toLowerCase();
  if (t === 'call' || t === 'c') return 'call';
  if (t === 'put' || t === 'p') return 'put';
  return 'other';
};

/** Số ngày còn lại tới ngày đáo hạn. `null` khi không đọc được ngày - đừng
 *  in ra số 0, nó đọc như "đáo hạn hôm nay". */
function dte(expiry: string | null): number | null {
  if (!expiry) return null;
  const ms = Date.parse(expiry);
  if (!Number.isFinite(ms)) return null;
  return Math.round((ms - Date.now()) / 86_400_000);
}

/**
 * Khối lượng chia cho số hợp đồng đang mở.
 *
 * Tỷ lệ này là thứ đáng đọc nhất trong một dòng flow mà bảng cũ không hề
 * hiện: hơn 1 nghĩa là hôm nay giao dịch nhiều hơn toàn bộ số hợp đồng đang
 * tồn tại ở strike đó, tức gần như chắc chắn là VỊ THẾ MỚI chứ không phải
 * ai đó đóng vị thế cũ. OI = 0 thì phép chia vô nghĩa, trả null.
 */
function volOverOi(a: Alert): number | null {
  if (a.volume === null || !a.openInterest) return null;
  return a.volume / a.openInterest;
}

export default function OptionFlowPanel() {
  const { t } = useLang();

  /**
   * Tên quy tắc của UW, dịch sang tiếng người khi biết, giữ NGUYÊN BẢN khi
   * không.
   *
   * `t()` trả về chính cái khoá nếu thiếu bản dịch (cố ý, để lỗi thiếu chữ
   * lộ ra khi đang viết code) - nhưng ở đây danh sách quy tắc là của UW,
   * họ thêm quy tắc mới lúc nào không báo. Nếu để nguyên thì màn hình sẽ
   * in ra "of.rule.SomethingNew", đọc như app hỏng. In tên thật của UW thì
   * vừa không giả vờ hiểu, vừa cho biết chính xác phải thêm khoá nào.
   */
  const ruleLabel = (rule: string) => {
    const key = `of.rule.${rule}`;
    const got = t(key);
    return got === key ? rule : got;
  };
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/optionflow');
      const j = await r.json();
      if (j.error) setError(String(j.error));
      else {
        setData(j);
        setError(null);
      }
    } catch (e: any) {
      setError(String(e?.message ?? e));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!data?.syncing) return;
    const id = setInterval(() => void load(), 3000);
    return () => clearInterval(id);
  }, [data?.syncing, load]);

  const sync = useCallback(async () => {
    setError(null);
    try {
      const r = await fetch('/api/optionflow', { method: 'POST' });
      const j = await r.json();
      if (j.error) setError(String(j.error));
    } catch (e: any) {
      setError(String(e?.message ?? e));
    }
    await load();
  }, [load]);

  if (data !== null && !data.configured) {
    return (
      <section className="panel">
        <div className="panel-head">{t('of.title')}</div>
        <div className="panel-body">
          <p className="cap">{t('cg.notConfigured')}</p>
        </div>
      </section>
    );
  }

  const nothingTracked = data !== null && data.trackedCount === 0;
  /* Thang chung cho mọi thanh: dài ngắn giữa các dòng mới so sánh được với
     nhau. Mỗi dòng tự co giãn theo chính nó thì mã 50 nghìn đô và mã 5 triệu
     đô vẽ ra hai thanh dài bằng nhau - đúng kiểu biểu đồ nói dối. */
  const maxPremium = Math.max(1, ...(data?.rows ?? []).map((r) => r.totalPremium));

  return (
    <section className="panel">
      <div className="panel-head">{t('of.title')}</div>
      <div className="panel-body">
        <p className="cap">{t('of.intro')}</p>
        <p className="cap">
          {data?.lastRun ? t('cg.lastRun', data.lastRun.at) : t('cg.neverRun')}{' '}
          {/* Chỉ hiện nút khi ĐÃ BIẾT chắc data.configured === true - xem
              chú thích trong CongressPanel.tsx cho lý do đầy đủ. */}
          {data?.configured === true && (
            <button onClick={sync} disabled={!!data?.syncing}>
              {data?.syncing ? t('cg.syncing') : t('cg.syncNow')}
            </button>
          )}
        </p>
        {data?.lastRun?.skipped === 'market-closed' && <p className="cap">{t('of.closed')}</p>}
        {error && <p className="cap warnline">{error}</p>}
        {data?.lastRun?.error && <p className="cap warnline">{data.lastRun.error}</p>}
      </div>

      {data === null && !error ? (
        <div className="panel-body">
          <p className="cap">…</p>
        </div>
      ) : nothingTracked ? (
        <div className="panel-body">
          <div className="empty">
            <strong>{t('ins.noneTracked')}</strong>
            <p className="cap">{t('ins.noneTrackedNote')}</p>
          </div>
        </div>
      ) : data && data.rows.length === 0 ? (
        <div className="panel-body">
          <div className="empty">
            <strong>{t('of.none')}</strong>
            <p className="cap">{t('of.noneNote')}</p>
          </div>
        </div>
      ) : (
        <>
          <div className="panel-body ofkey">
            <span>
              <i className="ofswatch ofswatch-call" /> {t('of.keyCall')}
            </span>
            <span>
              <i className="ofswatch ofswatch-put" /> {t('of.keyPut')}
            </span>
            {/* Giới hạn phải nói ra, không phải giấu đi: dữ liệu này không
                cho biết bên nào MUA bên nào BÁN. Thiếu câu đó thì "tiền vào
                call" rất dễ bị đọc thành "người ta đang đặt cược giá lên",
                mà một lệnh call lớn hoàn toàn có thể là người ta BÁN call. */}
            <span className="hint hint-warn">{t('of.keyCaveat')}</span>
          </div>

          <div className="tablewrap">
            <table className="pftable oftable">
              <thead>
                <tr>
                  <th>{t('ins.colSymbol')}</th>
                  <th className="num">{t('of.colPremium')}</th>
                  <th>{t('of.colSplit')}</th>
                  <th className="num">{t('of.colBiggest')}</th>
                  <th className="num">{t('of.colSweeps')}</th>
                  <th className="num">{t('of.colCount')}</th>
                  <th>{t('cg.colLast')}</th>
                </tr>
              </thead>
              <tbody>
                {data!.rows.map((r) => {
                  const open = expanded === r.symbol;
                  const known = r.callPremium + r.putPremium;
                  const callPct = known > 0 ? (r.callPremium / known) * 100 : 0;
                  const width = (r.totalPremium / maxPremium) * 100;
                  return (
                    <Fragment key={r.symbol}>
                      <tr
                        className="ins-row"
                        onClick={() => setExpanded(open ? null : r.symbol)}
                        aria-expanded={open}
                      >
                        <td>
                          <b>{r.symbol}</b>
                        </td>
                        <td className="num">
                          <b>{money(r.totalPremium)}</b>
                        </td>
                        <td>
                          <div
                            className="ofbar"
                            style={{ width: `${Math.max(width, 6)}%` }}
                            title={`${t('of.keyCall')} ${money(r.callPremium)} · ${t(
                              'of.keyPut'
                            )} ${money(r.putPremium)}`}
                          >
                            <i className="ofbar-call" style={{ width: `${callPct}%` }} />
                            <i className="ofbar-put" style={{ width: `${100 - callPct}%` }} />
                          </div>
                          <span className="ofsplit">
                            {known > 0 ? t('of.splitLabel', Math.round(callPct)) : t('of.splitNone')}
                            {/* Một phía "không rõ" khác 0 nghĩa là UW gửi
                                giá trị type lạ. Nói ra, đừng cộng lén vào
                                call rồi in một con số sai trông như đúng. */}
                            {r.otherPremium > 0 && (
                              <span className="hint hint-warn"> {t('of.otherSide', money(r.otherPremium))}</span>
                            )}
                          </span>
                        </td>
                        <td className="num">{money(r.biggestPremium)}</td>
                        <td className={`num${r.sweepCount > 0 ? ' good' : ''}`}>
                          {r.sweepCount || '—'}
                        </td>
                        <td className="num">{r.alerts.length}</td>
                        <td>{r.lastAlertAt ? new Date(r.lastAlertAt).toLocaleDateString() : ''}</td>
                      </tr>
                      {open && (
                        <tr className="ins-expand-row">
                          <td colSpan={7}>
                            <table className="ofdetail">
                              <thead>
                                <tr>
                                  <th>{t('of.dWhen')}</th>
                                  <th>{t('of.dContract')}</th>
                                  <th className="num">{t('of.dDte')}</th>
                                  <th className="num">{t('of.dPremium')}</th>
                                  <th className="num" title={t('of.volOiWhat')}>
                                    {t('of.dVolOi')}
                                  </th>
                                  <th>{t('of.dTags')}</th>
                                </tr>
                              </thead>
                              <tbody>
                                {r.alerts.map((a) => {
                                  const side = sideOf(a.type);
                                  const d = dte(a.expiry);
                                  const ratio = volOverOi(a);
                                  return (
                                    <tr key={a.id}>
                                      <td>
                                        {new Date(a.createdAt).toLocaleString(undefined, {
                                          month: 'numeric',
                                          day: 'numeric',
                                          hour: '2-digit',
                                          minute: '2-digit',
                                        })}
                                      </td>
                                      <td>
                                        <b className={`ofside ofside-${side}`}>
                                          {side === 'call'
                                            ? t('of.call')
                                            : side === 'put'
                                              ? t('of.put')
                                              : a.type || '?'}
                                        </b>{' '}
                                        {a.strike ?? '—'}
                                        <span className="ofexp"> {a.expiry ?? '—'}</span>
                                      </td>
                                      <td className="num">{d === null ? '—' : d}</td>
                                      <td className="num">
                                        <b>{money(a.totalPremium)}</b>
                                      </td>
                                      {/* >1 = khối lượng hôm nay vượt cả số hợp
                                          đồng đang mở, gần như chắc là vị thế
                                          MỚI. Đây là tín hiệu mạnh nhất trong
                                          một dòng flow, và bảng cũ không hề có. */}
                                      <td className={`num${ratio !== null && ratio > 1 ? ' good' : ''}`}>
                                        {ratio === null ? '—' : `${ratio.toFixed(1)}×`}
                                      </td>
                                      <td className="oftags">
                                        {a.hasSweep && (
                                          <span className="oftag oftag-hot" title={t('of.sweepWhat')}>
                                            {t('of.sweep')}
                                          </span>
                                        )}
                                        {a.hasFloor && (
                                          <span className="oftag" title={t('of.floorWhat')}>
                                            {t('of.floor')}
                                          </span>
                                        )}
                                        {/* Nhiều chân = một spread, không phải
                                            một cú đặt cược thẳng. Bảng cũ có
                                            sẵn trường này mà không bao giờ
                                            hiện - bỏ nó đi là để người đọc kết
                                            luận mạnh hơn thực tế. */}
                                        {a.hasMultileg && (
                                          <span className="oftag" title={t('of.multiWhat')}>
                                            {t('of.multi')}
                                          </span>
                                        )}
                                        {a.alertRule && (
                                          <span className="oftag oftag-rule" title={a.alertRule}>
                                            {ruleLabel(a.alertRule)}
                                          </span>
                                        )}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
