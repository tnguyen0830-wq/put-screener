'use client';

import { useEffect, useRef, useState } from 'react';
import ThemeToggle from './ThemeToggle';

export type ConnStatus = {
  configured: boolean;
  connected: boolean;
  daysLeft?: number;
};

/** Days of refresh-token life left below which the header should say so. */
const WARN_DAYS = 2;

/**
 * Nothing here is needed while working, so all of it collapses behind one
 * button and the header stops wrapping to a second row on a phone.
 *
 * The catch is that the Schwab session dies every 7 days and the countdown was
 * the reminder. Folding it away silently would mean finding out by way of a
 * failed scan, so the button carries a dot: red when there is no session to
 * scan with, amber when one is about to lapse. The state stays visible even
 * when the detail does not.
 */
function attentionOf(s: ConnStatus | null): 'none' | 'warn' | 'bad' {
  if (!s) return 'none';
  if (!s.configured || !s.connected) return 'bad';
  if ((s.daysLeft ?? Infinity) < WARN_DAYS) return 'warn';
  return 'none';
}

export default function SettingsMenu({ status }: { status: ConnStatus | null }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const onDown = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const attention = attentionOf(status);

  return (
    <div className="settings" ref={wrap}>
      <button
        className="settingsbtn"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Cài đặt: giao diện và kết nối Schwab"
        title="Cài đặt"
      >
        <span aria-hidden="true">⚙</span>
        {attention !== 'none' && (
          <i className={`sdot sdot-${attention}`} aria-hidden="true" />
        )}
      </button>

      {open && (
        <div className="settingspop" role="menu">
          <div className="popsec">Giao diện</div>
          <ThemeToggle />

          <div className="popsec">Kết nối Schwab</div>
          {!status && <p className="pophint">Đang kiểm tra…</p>}

          {status && !status.configured && (
            <p className="pophint">
              Chưa cấu hình <code>.env</code> — thiếu khoá Schwab trên server.
            </p>
          )}

          {status?.configured && !status.connected && (
            <>
              <p className="pophint">Chưa kết nối. Quét sẽ không chạy được.</p>
              <a className="popaction" href="/api/auth/login">
                Kết nối Schwab
              </a>
            </>
          )}

          {status?.connected && (
            <>
              <p className="pophint">
                Còn <strong>{status.daysLeft?.toFixed(1)} ngày</strong>. Schwab
                giới hạn cứng 7 ngày, hết hạn là phải đăng nhập lại.
              </p>
              <a className="popaction" href="/api/auth/login">
                Kết nối lại
              </a>
            </>
          )}
        </div>
      )}
    </div>
  );
}
