'use client';

import { useCallback, useEffect, useState } from 'react';
import { useLang } from '@/lib/i18n';

type Status = {
  telegram: boolean;
  telegramTokenSet: boolean;
  telegramChatSet: boolean;
  webPush: boolean;
  vapidPublicKey: string | null;
  lastRun: {
    at: number;
    skipped: 'market-closed' | 'no-channel' | null;
    found: number;
    sent: number;
    channels: string[];
    errors: string[];
    marketOpen: boolean;
    events: {
      symbols: number;
      heldError: string | null;
      noCik: string[];
      secError: string | null;
      quoteError: string | null;
      skippedRoutine: number;
      unknownItems: string[];
      windowShort: boolean;
      pressRan: boolean;
      pressChecked: number;
      pressSkipped: number;
      pressRoutine: number;
      pressBroad: number;
      pressOverflow: number;
      pressErrors: string[];
      xConfigured: boolean;
      xChecked: number;
      xBatches: number;
      xRoutine: number;
      xOverflow: number;
      xErrors: string[];
    } | null;
  } | null;
};

/** VAPID key đi trên đường dưới dạng base64url; pushManager cần Uint8Array. */
function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
  const raw = atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

/**
 * Bật thông báo, và nói thẳng bộ kiểm tra ngầm có đang sống hay không.
 *
 * Vòng kiểm tra chạy trong tiến trình server (lib/alert-runner.ts), tức là
 * không ai nhìn thấy nó. Nên chỗ này hiện lần chạy gần nhất: bộ đếm giờ
 * chết thì con số đứng im, và bạn biết ngay - thay vì tưởng "không có cảnh
 * báo nào" trong khi thật ra là "không có gì kiểm tra cả".
 */
export default function AlertSettings() {
  const { t } = useLang();
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [subscribed, setSubscribed] = useState<boolean | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [probe, setProbe] = useState<
    { bot: string | null; chats: { id: number; name: string }[]; error: string | null } | null
  >(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/alerts/status');
      if (!r.ok) throw new Error(`/api/alerts/status trả về HTTP ${r.status}`);
      setStatus(await r.json());
      setLoadError(null);
    } catch (e: any) {
      setLoadError(String(e?.message ?? e));
    }
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(load, 60_000);
    return () => clearInterval(timer);
  }, [load]);

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker
      .getRegistration()
      .then((reg) => reg?.pushManager.getSubscription())
      .then((sub) => setSubscribed(Boolean(sub)))
      .catch(() => setSubscribed(false));
  }, []);

  const enablePush = async () => {
    setBusy(true);
    setMsg(null);
    try {
      if (!('serviceWorker' in navigator) || !('PushManager' in window))
        throw new Error(t('al.unsupported'));
      if (!status?.vapidPublicKey) throw new Error(t('al.noVapid'));

      const reg = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;

      const perm = await Notification.requestPermission();
      if (perm !== 'granted') throw new Error(t('al.denied'));

      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(status.vapidPublicKey),
        }));

      const r = await fetch('/api/alerts/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sub),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.detail ?? j.error ?? t('al.subFailed'));
      setSubscribed(true);
      setMsg(t('al.subOk'));
    } catch (e: any) {
      setMsg(String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  const findChatId = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch('/api/alerts/telegram-probe', { method: 'POST' });
      setProbe(await r.json());
    } catch (e: any) {
      setMsg(String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  const testRun = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch('/api/alerts/status', { method: 'POST' });
      const j = await r.json();
      setStatus((s) => (s ? { ...s, lastRun: j } : s));
      setMsg(
        j.errors?.length
          ? j.errors.join(' · ')
          : t('al.testOk', { found: j.found ?? 0, sent: j.sent ?? 0 })
      );
    } catch (e: any) {
      setMsg(String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  // Trước đây chỗ này `return null` khi chưa đọc được trạng thái, nên cả khu
  // vực biến mất và người dùng nhìn vào chỉ thấy trống - không biết là chưa
  // cấu hình hay là hỏng. Giờ luôn hiện, và nói rõ đang vướng gì.
  if (!status)
    return (
      <>
        <h3 className="dsec">{t('al.head')}</h3>
        <p className="cap warnline">
          {loadError ? `${t('al.statusFailed')} ${loadError}` : t('al.loading')}
        </p>
      </>
    );

  const nothingOn = !status.telegram && !status.webPush;
  const lr = status.lastRun;

  return (
    <>
      <h3 className="dsec">{t('al.head')}</h3>

      <dl className="stats">
        <div>
          <dt>Telegram</dt>
          <dd className={status.telegram ? 'good' : undefined}>
            {status.telegram
              ? t('al.on')
              : status.telegramTokenSet
                ? t('al.needChatId')
                : t('al.off')}
          </dd>
        </div>
        <div>
          <dt>{t('al.webPush')}</dt>
          <dd className={status.webPush && subscribed ? 'good' : undefined}>
            {!status.webPush
              ? t('al.off')
              : subscribed
                ? t('al.on')
                : t('al.notSubscribed')}
          </dd>
        </div>
        <div>
          <dt>{t('al.lastRun')}</dt>
          <dd>
            {lr
              ? new Date(lr.at).toLocaleTimeString('vi-VN', {
                  hour: '2-digit',
                  minute: '2-digit',
                })
              : '—'}
          </dd>
        </div>
      </dl>

      {/* Điều kiện đổi từ `skipped` sang `marketOpen`: ngoài giờ KHÔNG còn
          nghĩa là bỏ qua cả lượt chạy, nên đọc `skipped` ở đây sẽ không bao
          giờ đúng nữa. */}
      {lr && !lr.marketOpen && <p className="cap">{t('al.closed')}</p>}
      {lr?.events && (
        <>
          <p className="cap">{t('al.watching', lr.events.symbols)}</p>
          {lr.events.heldError && <p className="cap warnline">{t('al.evHeldErr')}</p>}
          {lr.events.secError && (
            <p className="cap warnline">{t('al.evSecErr', lr.events.secError)}</p>
          )}
          {lr.events.quoteError && (
            <p className="cap warnline">{t('al.evQuoteErr', lr.events.quoteError)}</p>
          )}
          {lr.events.windowShort && <p className="cap warnline">{t('al.evWindowShort')}</p>}
          {lr.events.unknownItems.length > 0 && (
            <p className="cap warnline">
              {t('al.evUnknown', lr.events.unknownItems.join(', '))}
            </p>
          )}
          {/* Tầng báo chí. `pressRan` tách "lượt này chưa hỏi" khỏi "đã hỏi
              và không có gì" - nếu gộp thì mấy con số 0 bên dưới nói dối. */}
          {lr.events.pressRan ? (
            <>
              <p className="cap">
                {t('al.press', { checked: lr.events.pressChecked })}{' '}
                {t('al.pressQuiet', {
                  routine: lr.events.pressRoutine,
                  broad: lr.events.pressBroad,
                })}
              </p>
              {lr.events.pressSkipped > 0 && (
                <p className="cap warnline">
                  {t('al.pressSkipped', lr.events.pressSkipped)}
                </p>
              )}
              {lr.events.pressOverflow > 0 && (
                <p className="cap warnline">
                  {t('al.pressOverflow', lr.events.pressOverflow)}
                </p>
              )}
              {lr.events.pressErrors.length > 0 && (
                <p className="cap warnline">
                  {t('al.pressErr', lr.events.pressErrors.join(' · '))}
                </p>
              )}
            </>
          ) : (
            <p className="cap">{t('al.pressIdle')}</p>
          )}
          {/* Tầng X. `xConfigured: false` (chưa đặt X_BEARER_TOKEN) tách
              khỏi "đã hỏi và không có gì" - X tự tắt như UW/Telegram nên
              phần lớn người đọc file này sẽ thấy đúng dòng "chưa cấu hình". */}
          {lr.events.xConfigured ? (
            <>
              <p className="cap">
                {t('al.x', { checked: lr.events.xChecked, batches: lr.events.xBatches })}{' '}
                {t('al.xQuiet', lr.events.xRoutine)}
              </p>
              {lr.events.xOverflow > 0 && (
                <p className="cap warnline">{t('al.xOverflow', lr.events.xOverflow)}</p>
              )}
              {lr.events.xErrors.length > 0 && (
                <p className="cap warnline">{t('al.xErr', lr.events.xErrors.join(' · '))}</p>
              )}
            </>
          ) : (
            <p className="cap">{t('al.xIdle')}</p>
          )}
        </>
      )}
      {nothingOn && <p className="cap warnline">{t('al.nothingOn')}</p>}
      {lr && lr.errors.length > 0 && (
        <p className="cap warnline">
          {t('al.runErrors')} <code>{lr.errors.join(' · ')}</code>
        </p>
      )}

      <div className="alrow">
        {status.webPush && !subscribed && (
          <button className="aibtn" onClick={enablePush} disabled={busy}>
            {t('al.enablePush')}
          </button>
        )}
        {status.telegramTokenSet && !status.telegramChatSet && (
          <button className="aibtn" onClick={findChatId} disabled={busy}>
            {t('al.findChat')}
          </button>
        )}
        {/* Luôn bấm được. Khoá nút lúc chưa cấu hình thì không dạy được gì -
            chạy thử rồi đọc lý do mới biết mình đang thiếu cái nào. */}
        <button className="aibtn" onClick={testRun} disabled={busy}>
          {t('al.test')}
        </button>
      </div>

      {probe && (
        <div className="cap">
          {probe.error ? (
            <p className="warnline">{t('al.probeFailed')} <code>{probe.error}</code></p>
          ) : (
            <>
              <p>{t('al.probeBot', probe.bot ?? '?')}</p>
              {probe.chats.length === 0 ? (
                <p className="warnline">{t('al.probeNoChat', probe.bot ?? '')}</p>
              ) : (
                <ul className="pfattnlist">
                  {probe.chats.map((c) => (
                    <li key={c.id}>
                      <b>{c.name}</b> — TELEGRAM_CHAT_ID = <code>{c.id}</code>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      )}

      {msg && <p className="cap">{msg}</p>}
      <p className="cap">{t('al.note')}</p>
    </>
  );
}
