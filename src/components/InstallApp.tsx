'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useLang } from '@/lib/i18n';
import {
  type InstallChecks,
  isStandalone,
  manifestUsable,
  platformOf,
  verdictOf,
} from '@/lib/pwa';

/**
 * Nút "Cài app" trên thanh đầu trang, và một bảng TỰ NÓI RA vì sao khi
 * trình duyệt không chịu mời. Lý do từng trạng thái: xem `src/lib/pwa.ts`.
 *
 * Hai chi tiết dễ làm hỏng nếu sửa sau này:
 *
 * 1. `beforeinstallprompt` bắn MỘT LẦN và chỉ trước khi người dùng kịp bấm
 *    gì, nên phải nghe từ lúc gắn component và GIỮ LẠI sự kiện. Gọi
 *    `preventDefault()` là để Chrome thôi tự hiện thanh mời của nó — ta
 *    chọn thời điểm hỏi, nhưng đổi lại BẮT BUỘC phải có một nút thật, nếu
 *    không thì ta vừa chặn lời mời duy nhất người dùng từng nhận được.
 * 2. Service worker được đăng ký ngay ở đây, chứ không chỉ trong
 *    `AlertSettings`: panel đó nằm trong tab của riêng chủ app, nên trước
 *    thay đổi này phần lớn lượt mở trang không đăng ký gì. `register()` với
 *    cùng script và cùng scope là thao tác lặp vô hại — nó trả lại đúng bản
 *    đăng ký đang có, không tạo bản thứ hai.
 */

type PromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

export default function InstallApp() {
  const { t } = useLang();
  const [prompt, setPrompt] = useState<PromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [open, setOpen] = useState(false);
  const [checks, setChecks] = useState<InstallChecks | null>(null);
  const [outcome, setOutcome] = useState<'accepted' | 'dismissed' | null>(null);
  const [platform, setPlatform] = useState<'ios' | 'android' | 'desktop'>('desktop');
  const wrap = useRef<HTMLDivElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  /* Bảng neo về bên PHẢI như menu ⚙, nhưng nút này không đứng ở mép phải:
     `.rail` có `flex-wrap: wrap`, nên với mười tab nó xuống hàng thứ hai và
     nằm sát mép TRÁI — lúc đó bảng neo phải thò hẳn ra ngoài màn hình.
     Chụp màn hình mới thấy; đọc CSS thì không, đúng bài học #58/#101/#117.

     Lật bằng phép ĐO bản đã vẽ chứ không chép lại chiều rộng từ CSS (hai
     bản chép là hai bản sẽ trôi lệch), và chỉ lật MỘT lần mỗi lần mở: mặc
     định là phải, chỉ đổi sang trái khi thật sự lòi ra trái — nên không có
     đường quay lại để thành vòng lặp. */
  const [align, setAlign] = useState<'right' | 'left'>('right');
  const flipped = useRef(false);

  useLayoutEffect(() => {
    if (!open) {
      flipped.current = false;
      setAlign('right');
      return;
    }
    if (flipped.current || !pop.current) return;
    if (pop.current.getBoundingClientRect().left < 8) {
      flipped.current = true;
      setAlign('left');
    }
  }, [open, align]);

  /* Chỉ đọc được sau khi hydrate: server không có `navigator`, và đọc sớm
     thì HTML từ server lệch với DOM. */
  useEffect(() => {
    setPlatform(platformOf(navigator.userAgent, navigator.maxTouchPoints ?? 0));
    const mm = window.matchMedia?.('(display-mode: standalone)');
    const nav = (navigator as unknown as { standalone?: boolean }).standalone;
    setInstalled(isStandalone(Boolean(mm?.matches), nav));
    /* Cài xong ngay trong phiên này thì nút phải biến đi — để lại là mời
       người ta làm cái việc vừa làm xong. */
    const onMode = (e: MediaQueryListEvent) => setInstalled(isStandalone(e.matches, nav));
    mm?.addEventListener?.('change', onMode);
    return () => mm?.removeEventListener?.('change', onMode);
  }, []);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPrompt(e as PromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setPrompt(null);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* Hỏng thì phần tự kiểm bên dưới nói ra, không cần ném ở đây. */
    });
  }, []);

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

  /* Ba tiền đề, ĐO bằng chính trình duyệt đang mở, và chỉ khi mở bảng —
     không tốn gì ở mọi lượt tải trang. Đây là phần biến "bấm không ra gì"
     thành một câu trả lời: chủ app đọc được ngay chỗ nào hỏng. */
  const measure = useCallback(async () => {
    const secure = typeof window !== 'undefined' && window.isSecureContext;

    let manifest = false;
    let manifestDetail: string | null = null;
    try {
      const r = await fetch('/manifest.webmanifest', { cache: 'no-store' });
      if (!r.ok) {
        manifestDetail = `HTTP ${r.status}`;
      } else {
        let json: unknown = null;
        try {
          json = JSON.parse(await r.text());
        } catch {
          json = null;
        }
        const v = manifestUsable(json);
        manifest = v.ok;
        manifestDetail = v.detail;
      }
    } catch (e: any) {
      manifestDetail = String(e?.message ?? e).slice(0, 80);
    }

    let sw = false;
    let swDetail: string | null = null;
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
      swDetail = 'trình duyệt không có service worker';
    } else {
      try {
        sw = Boolean(await navigator.serviceWorker.getRegistration());
        if (!sw) swDetail = 'chưa đăng ký';
      } catch (e: any) {
        swDetail = String(e?.message ?? e).slice(0, 80);
      }
    }

    setChecks({ secure, manifest, manifestDetail, sw, swDetail });
  }, []);

  const press = useCallback(async () => {
    if (prompt) {
      try {
        await prompt.prompt();
        const { outcome: o } = await prompt.userChoice;
        setOutcome(o);
        /* Sự kiện chỉ dùng được MỘT lần — giữ lại là giữ một cái nút gọi
           vào thứ đã tiêu. */
        setPrompt(null);
        if (o === 'dismissed') {
          setOpen(true);
          void measure();
        }
      } catch {
        setOpen(true);
        void measure();
      }
      return;
    }
    setOpen((v) => !v);
    if (!open) void measure();
  }, [prompt, open, measure]);

  if (installed) return null;

  const verdict = verdictOf({ hasPrompt: Boolean(prompt), platform, checks });

  const row = (label: string, ok: boolean | null, detail: string | null) => (
    <p className="pophint installrow">
      <span className={ok === null ? undefined : ok ? 'good' : 'bad'} aria-hidden="true">
        {ok === null ? '…' : ok ? '✓' : '✗'}
      </span>{' '}
      {label}
      {ok === false && detail ? ` — ${detail}` : ''}
    </p>
  );

  return (
    <div className="settings install" ref={wrap}>
      <button
        className="installbtn"
        onClick={press}
        aria-expanded={open}
        aria-label={t('install.label')}
        title={t('install.label')}
      >
        <span aria-hidden="true">⤓</span> {t('install.btn')}
      </button>

      {open && (
        <div
          className={`settingspop installpop${align === 'left' ? ' installpop-left' : ''}`}
          role="dialog"
          aria-label={t('install.title')}
          ref={pop}
        >
          <div className="popsec">{t('install.title')}</div>
          <p className="pophint">{t('install.why')}</p>

          {outcome === 'dismissed' && (
            <p className="pophint popwarn">{t('install.dismissed')}</p>
          )}

          {verdict === 'insecure' && <p className="pophint popwarn">{t('install.insecure')}</p>}
          {verdict === 'no-manifest' && (
            <p className="pophint popwarn">
              {t('install.noManifest', checks?.manifestDetail ?? '—')}
            </p>
          )}
          {verdict === 'no-sw' && (
            <p className="pophint popwarn">{t('install.noSw', checks?.swDetail ?? '—')}</p>
          )}
          {verdict === 'ios' && (
            <>
              <p className="pophint">{t('install.ios')}</p>
              <p className="pophint">{t('install.iosNote')}</p>
            </>
          )}
          {verdict === 'browser' && (
            <>
              <p className="pophint">{t('install.browser')}</p>
              <p className="pophint">
                {platform === 'android' ? t('install.android') : t('install.desktop')}
              </p>
            </>
          )}

          <div className="popsec">{t('install.checks')}</div>
          {!checks && <p className="pophint">{t('install.checking')}</p>}
          {checks && (
            <>
              {row(t('install.checkSecure'), checks.secure, null)}
              {row(t('install.checkManifest'), checks.manifest, checks.manifestDetail)}
              {row(t('install.checkSw'), checks.sw, checks.swDetail)}
            </>
          )}
        </div>
      )}

      {outcome === 'accepted' && <span className="pill installok">{t('install.accepted')}</span>}
    </div>
  );
}
