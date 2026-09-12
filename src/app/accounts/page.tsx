'use client';

import { useCallback, useEffect, useState } from 'react';
import { useLang } from '@/lib/i18n';
import Logo from '@/components/Logo';

/**
 * Quản lý tài khoản người nhà. Chỉ chủ app mở được.
 *
 * Trang riêng chứ không phải một tab: đây là việc làm vài lần trong đời, và
 * thanh tab đã có năm mục cho những thứ dùng hàng ngày. Vào từ menu ⚙.
 *
 * Cổng thật nằm ở `middleware.ts` (`isOwnerOnlyPage` + `isOwnerOnly` cho
 * `/api/users`), không phải ở trang này - người nhà gõ thẳng địa chỉ sẽ bị
 * đưa về trang chủ trước khi component này kịp chạy.
 */

type User = { name: string; createdAt: string; updatedAt: string };

export default function AccountsPage() {
  const { t } = useLang();
  const [users, setUsers] = useState<User[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [newName, setNewName] = useState('');
  const [newPass, setNewPass] = useState('');
  const [resetFor, setResetFor] = useState<string | null>(null);
  const [resetPass, setResetPass] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/users');
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? String(r.status));
      setUsers(j.users ?? []);
      setLoadError(null);
    } catch (e: any) {
      // Nói ra lý do thật: một danh sách trống vì lỗi trông y hệt một danh
      // sách trống vì chưa có ai - hai chuyện sửa khác hẳn nhau.
      setLoadError(String(e?.message ?? e));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  /** Mọi thao tác ghi đi qua đây: cùng một cách xử lý lỗi, và danh sách luôn
   *  lấy lại từ server thay vì tự đoán trạng thái mới ở phía trình duyệt. */
  const write = async (init: RequestInit & { url?: string }, okMsg: string) => {
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const r = await fetch(init.url ?? '/api/users', init);
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        setError(t(`acct.err.${j.error ?? 'failed'}`));
        return false;
      }
      if (Array.isArray(j.users)) setUsers(j.users);
      setDone(okMsg);
      return true;
    } catch {
      setError(t('acct.err.failed'));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await write(
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName, password: newPass }),
      },
      t('acct.added', newName.trim().toLowerCase())
    );
    if (ok) {
      setNewName('');
      setNewPass('');
    }
  };

  const reset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetFor) return;
    const ok = await write(
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: resetFor, password: resetPass }),
      },
      t('acct.reset', resetFor)
    );
    if (ok) {
      setResetFor(null);
      setResetPass('');
    }
  };

  const remove = async (name: string) => {
    // Xoá là mất quyền, và không hoàn tác được - hỏi lại một lần.
    if (!window.confirm(t('acct.confirmDelete', name))) return;
    await write(
      { method: 'DELETE', url: `/api/users?name=${encodeURIComponent(name)}` },
      t('acct.deleted', name)
    );
  };

  return (
    <div className="shell solo">
      <section className="panel">
        <div className="panel-head">
          <a className="brand" href="/" aria-label={t('brand.home')}>
            <Logo height={22} />
          </a>
          {t('acct.title')}
        </div>
        <div className="panel-body">
          <p className="cap">{t('acct.intro')}</p>

          {loadError && <p className="hint hint-warn">{t('acct.loadFailed', loadError)}</p>}

          <h3 className="dsec">{t('acct.listTitle')}</h3>
          {users === null && !loadError ? (
            <p className="cap">{t('acct.loading')}</p>
          ) : users && users.length === 0 ? (
            <p className="cap">{t('acct.empty')}</p>
          ) : (
            <table className="acctlist">
              <thead>
                <tr>
                  <th>{t('acct.colName')}</th>
                  <th>{t('acct.colCreated')}</th>
                  <th>{t('acct.colUpdated')}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {(users ?? []).map((u) => (
                  <tr key={u.name}>
                    <th scope="row">{u.name}</th>
                    <td>{u.createdAt.slice(0, 10)}</td>
                    <td>{u.updatedAt.slice(0, 10)}</td>
                    <td className="acctactions">
                      <button
                        type="button"
                        onClick={() => {
                          setResetFor(u.name);
                          setResetPass('');
                          setError(null);
                          setDone(null);
                        }}
                        disabled={busy}
                      >
                        {t('acct.resetBtn')}
                      </button>
                      <button
                        type="button"
                        className="acctdel"
                        onClick={() => remove(u.name)}
                        disabled={busy}
                      >
                        {t('acct.deleteBtn')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {resetFor && (
            <form className="acctform" onSubmit={reset}>
              <h3 className="dsec">{t('acct.resetTitle', resetFor)}</h3>
              <label className="loginfield">
                <span>{t('acct.newPassword')}</span>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={resetPass}
                  onChange={(e) => setResetPass(e.target.value)}
                />
              </label>
              <div className="acctactions">
                <button type="submit" disabled={busy || resetPass.length < 8}>
                  {t('acct.save')}
                </button>
                <button type="button" onClick={() => setResetFor(null)} disabled={busy}>
                  {t('acct.cancel')}
                </button>
              </div>
            </form>
          )}

          <form className="acctform" onSubmit={add}>
            <h3 className="dsec">{t('acct.addTitle')}</h3>
            <label className="loginfield">
              <span>{t('acct.name')}</span>
              <input
                type="text"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder={t('acct.namePlaceholder')}
              />
            </label>
            <label className="loginfield">
              <span>{t('acct.password')}</span>
              <input
                type="password"
                autoComplete="new-password"
                value={newPass}
                onChange={(e) => setNewPass(e.target.value)}
              />
            </label>
            <button type="submit" disabled={busy || !newName || newPass.length < 8}>
              {busy ? t('acct.saving') : t('acct.addBtn')}
            </button>
          </form>

          {error && <p className="hint hint-warn">{error}</p>}
          {done && <p className="cap">{done}</p>}

          <p className="cap">{t('acct.note')}</p>
        </div>
      </section>
    </div>
  );
}
