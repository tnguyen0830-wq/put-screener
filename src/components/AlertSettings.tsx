'use client';

import { useCallback, useEffect, useState } from 'react';
import { useLang } from '@/lib/i18n';

type Status = {
  telegram: boolean;
  webPush: boolean;
  vapidPublicKey: string | null;
  lastRun: {
    at: number;
    skipped: 'market-closed' | 'no-channel' | null;
    found: number;
    sent: number;
    channels: string[];
    errors: string[];
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

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/alerts/status');
      setStatus(await r.json());
    } catch (e: any) {
      setMsg(String(e?.message ?? e));
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

  if (!status) return null;

  const nothingOn = !status.telegram && !status.webPush;
  const lr = status.lastRun;

  return (
    <>
      <h3 className="dsec">{t('al.head')}</h3>

      <dl className="stats">
        <div>
          <dt>Telegram</dt>
          <dd className={status.telegram ? 'good' : undefined}>
            {t(status.telegram ? 'al.on' : 'al.off')}
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

      {lr?.skipped === 'market-closed' && <p className="cap">{t('al.closed')}</p>}
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
        <button className="aibtn" onClick={testRun} disabled={busy || nothingOn}>
          {t('al.test')}
        </button>
      </div>

      {msg && <p className="cap">{msg}</p>}
      <p className="cap">{t('al.note')}</p>
    </>
  );
}
