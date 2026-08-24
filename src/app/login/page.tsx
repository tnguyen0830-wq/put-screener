'use client';

import { useState } from 'react';
import { useLang } from '@/lib/i18n';
import Logo from '@/components/Logo';

/**
 * Cửa vào.
 *
 * Cố tình trơ trọi: không tab, không thanh chỉ số, không gọi một API nào. Người
 * chưa đăng nhập thì không nên nhìn thấy trang này có những gì bên trong, kể cả
 * hình dạng của nó.
 */
export default function LoginPage() {
  const { t } = useLang();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await fetch('/api/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const j = await r.json().catch(() => ({}));
      if (r.ok) {
        // Quay lại đúng chỗ đang định tới, nhưng chỉ nhận đường dẫn nội bộ:
        // tham số này do người ngoài đặt được, và một URL tuyệt đối ở đây là
        // cách đưa người dùng sang trang lạ mà tưởng vẫn ở trang mình.
        const next = new URLSearchParams(window.location.search).get('next');
        window.location.href = next && next.startsWith('/') && !next.startsWith('//') ? next : '/';
        return;
      }
      setError(
        j.error === 'TOO_MANY_TRIES'
          ? t('login.tooMany', j.retryInSec ?? 0)
          : j.error === 'NO_PASSWORD_SET'
            ? t('login.noPassword')
            : t('login.wrong')
      );
    } catch {
      setError(t('login.failed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="loginwrap">
      <form className="loginbox" onSubmit={submit}>
        <div className="loginbrand">
          <Logo height={34} />
          <span className="wordmark">
            <span className="wm-name">tyler</span>
            <span className="wm-dot" aria-hidden="true" />
            <span className="wm-tag">INVESTMENT TOOL</span>
          </span>
        </div>

        <label className="loginfield">
          <span>{t('login.password')}</span>
          <input
            type="password"
            autoFocus
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>

        <button type="submit" disabled={busy || !password}>
          {busy ? t('login.checking') : t('login.enter')}
        </button>

        {error && <p className="loginerr">{error}</p>}
        <p className="cap">{t('login.note')}</p>
      </form>
    </div>
  );
}
