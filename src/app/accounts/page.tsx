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

type User = {
  name: string;
  createdAt: string;
  updatedAt: string;
  /** Có mã đặt lại đang treo và còn hạn. Server chỉ gửi hạn dùng, không
   *  bao giờ gửi lại mã - xem `listUsers()` ở userstore.ts. */
  resetExpiresAt?: number;
};

const hhmm = (ms: number) =>
  new Date(ms).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

/** Hình dạng `/api/users/activity` trả về - xem lib/activity.ts. */
type ActEvent = { at: string; user: string; kind: string; detail?: string; n?: number };
type Activity = {
  events: ActEvent[];
  presence: Record<string, { at: string; tab: string | null }>;
  onlineMs: number;
  now: number;
};

/** Bao nhiêu dòng lịch sử hiện ra. Kho giữ nhiều hơn (14 ngày) - phần không
 *  hiện được NÓI RA bên dưới bảng, chứ không cắt lặng lẽ. */
const SHOW_EVENTS = 80;

const REFRESH_MS = 30_000;

export default function AccountsPage() {
  const { t } = useLang();
  const [users, setUsers] = useState<User[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [newName, setNewName] = useState('');
  const [newPass, setNewPass] = useState('');
  const [resetFor, setResetFor] = useState<string | null>(null);
  const [resetPass, setResetPass] = useState('');
  const [busy, setBusy] = useState(false);
  /* Mã vừa tạo, giữ trong bộ nhớ trang cho tới khi chủ app bấm đã đọc
     xong. Không lưu đâu cả: trên đĩa chỉ có bản băm, nên đây là lần duy
     nhất mã tồn tại ở dạng đọc được. */
  const [code, setCode] = useState<{ name: string; code: string; expiresAt: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  /* Nhật ký hoạt động. Giữ kèm `fetchedAt` để quy mọi phép tính "bao lâu
     rồi" về ĐỒNG HỒ CỦA SERVER: điện thoại đặt sai giờ vài phút sẽ khiến
     người đang ngồi đó hiện thành đã rời đi, hoặc ngược lại. */
  const [act, setAct] = useState<{ data: Activity; fetchedAt: number } | null>(null);
  const [actError, setActError] = useState<string | null>(null);

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

  const loadActivity = useCallback(async () => {
    try {
      const r = await fetch('/api/users/activity');
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? String(r.status));
      setAct({ data: j as Activity, fetchedAt: Date.now() });
      setActError(null);
    } catch (e: any) {
      // Cùng luật với `load()`: một bảng trống vì lỗi và một bảng trống vì
      // chưa ai dùng gì là hai chuyện, sửa khác nhau.
      setActError(String(e?.message ?? e));
    }
  }, []);

  useEffect(() => {
    loadActivity();
    const id = setInterval(loadActivity, REFRESH_MS);
    return () => clearInterval(id);
  }, [loadActivity]);

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

  const makeCode = async (name: string) => {
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const r = await fetch('/api/users/reset-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        setError(t(`acct.err.${j.error ?? 'failed'}`));
        return;
      }
      if (Array.isArray(j.users)) setUsers(j.users);
      setCode({ name, code: j.code, expiresAt: j.expiresAt });
    } catch {
      setError(t('acct.err.failed'));
    } finally {
      setBusy(false);
    }
  };

  const cancelCode = async (name: string) => {
    await write(
      { method: 'DELETE', url: `/api/users/reset-code?name=${encodeURIComponent(name)}` },
      t('acct.codeCancelled', name)
    );
  };

  const remove = async (name: string) => {
    // Xoá là mất quyền, và không hoàn tác được - hỏi lại một lần.
    if (!window.confirm(t('acct.confirmDelete', name))) return;
    await write(
      { method: 'DELETE', url: `/api/users?name=${encodeURIComponent(name)}` },
      t('acct.deleted', name)
    );
  };

  /* Nhãn của một loại việc. Loại LẠ in nguyên mã server gửi chứ không in
     khoá i18n: `t()` trả về khoá khi thiếu, mà một loại mới ở server sẽ ra
     màn hình trước khi ai kịp thêm khoá - đúng lối `ruleLabel()` bên
     Options Flow. */
  const oneOf = (key: string, fallback: string) => {
    const v = t(key);
    return v === key ? fallback : v;
  };

  const whatOf = (e: ActEvent) => {
    const label = oneOf(`act.kind.${e.kind}`, e.kind);
    if (!e.detail) return label;
    // Chi tiết của 'tab' là mã tab, dịch qua chính khoá thanh điều hướng.
    const detail = e.kind === 'tab' ? oneOf(`tab.${e.detail}`, e.detail) : e.detail;
    return `${label} · ${detail}`;
  };

  /* Giờ server ngay lúc này = giờ server lúc lấy dữ liệu + thời gian đã trôi
     trên máy này. Không dùng thẳng Date.now() so với dấu thời gian của
     server. */
  const serverNow = act ? act.data.now + (Date.now() - act.fetchedAt) : 0;
  const agoText = (iso: string) => {
    const ms = serverNow - new Date(iso).getTime();
    const min = Math.floor(ms / 60_000);
    return min < 1 ? t('acct.actNow') : t('acct.actAgo', min);
  };
  const online = act
    ? Object.entries(act.data.presence)
        .filter(([, p]) => serverNow - new Date(p.at).getTime() < act.data.onlineMs)
        .sort((a, b) => b[1].at.localeCompare(a[1].at))
    : [];
  const events = act?.data.events ?? [];

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

          <h3 className="dsec">{t('acct.actTitle')}</h3>
          <p className="cap">{t('acct.actIntro')}</p>
          {actError && <p className="hint hint-warn">{t('acct.actFailed', actError)}</p>}

          <h4 className="actsub">{t('acct.actOnline')}</h4>
          {online.length === 0 ? (
            <p className="cap">{t('acct.actNobody')}</p>
          ) : (
            <ul className="actonline">
              {online.map(([name, p]) => (
                <li key={name}>
                  <span className="actdot" aria-hidden="true" />
                  <b>{name}</b>
                  {name === 'owner' && <span className="actme">{t('acct.actOwnerTag')}</span>}
                  <span className="actwhere">
                    {p.tab ? oneOf(`tab.${p.tab}`, p.tab) : '—'}
                  </span>
                  <span className="actago">{agoText(p.at)}</span>
                </li>
              ))}
            </ul>
          )}

          <h4 className="actsub">{t('acct.actRecent')}</h4>
          {events.length === 0 ? (
            <p className="cap">{t('acct.actEmpty')}</p>
          ) : (
            <>
              <table className="acctlist actlog">
                <thead>
                  <tr>
                    <th>{t('acct.actColTime')}</th>
                    <th>{t('acct.actColUser')}</th>
                    <th>{t('acct.actColWhat')}</th>
                  </tr>
                </thead>
                <tbody>
                  {events.slice(0, SHOW_EVENTS).map((e, i) => (
                    <tr key={`${e.at}-${e.user}-${e.kind}-${i}`}>
                      <td>{new Date(e.at).toLocaleString(undefined, {
                        month: '2-digit',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}</td>
                      <th scope="row">{e.user}</th>
                      <td>
                        {whatOf(e)}
                        {e.n && e.n > 1 && <span className="actn">{t('acct.actTimes', e.n)}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {events.length > SHOW_EVENTS && (
                <p className="cap">{t('acct.actMore', events.length - SHOW_EVENTS)}</p>
              )}
            </>
          )}
          <p className="cap">{t('acct.actNote')}</p>
          <p className="cap">{t('acct.actTelegram')}</p>

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
                    <th scope="row">
                      {u.name}
                      {u.resetExpiresAt && (
                        <span className="acctpending">
                          {t('acct.codePending', hhmm(u.resetExpiresAt))}
                        </span>
                      )}
                    </th>
                    <td>{u.createdAt.slice(0, 10)}</td>
                    <td>{u.updatedAt.slice(0, 10)}</td>
                    <td className="acctactions">
                      <button type="button" onClick={() => makeCode(u.name)} disabled={busy}>
                        {t('acct.codeBtn')}
                      </button>
                      {u.resetExpiresAt && (
                        <button type="button" onClick={() => cancelCode(u.name)} disabled={busy}>
                          {t('acct.codeCancel')}
                        </button>
                      )}
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

          {code && (
            <div className="acctcode">
              <h3 className="dsec">{t('acct.codeTitle', code.name)}</h3>
              <p className="codeval">{code.code}</p>
              <p className="hint hint-warn">{t('acct.codeShown')}</p>
              <p className="cap">{t('acct.codeExpires', hhmm(code.expiresAt))}</p>
              <p className="cap">{t('acct.codeWhere')}</p>
              <button type="button" onClick={() => setCode(null)}>
                {t('acct.codeDone')}
              </button>
            </div>
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
          <p className="cap">{t('acct.ownerNoCode')}</p>
        </div>
      </section>
    </div>
  );
}
