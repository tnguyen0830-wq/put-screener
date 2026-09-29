'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useLang } from '@/lib/i18n';
import TradingViewWidget from './TradingViewWidget';
import { useResolvedTheme } from './useResolvedTheme';
import {
  CHART_IMAGE_EDGE,
  CHART_IMAGE_MAX,
  cropBox,
  fitWithin,
  type ChartImage,
} from '@/lib/chartimage';

export type Shot = ChartImage & { id: number; url: string; w: number; h: number };

let nextId = 1;

/**
 * Vẽ một nguồn ảnh (khung video / ảnh đã giải mã) lên canvas, thu nhỏ về
 * CHART_IMAGE_EDGE và nén JPEG. Làm ở trình duyệt để lượt hỏi Claude chỉ
 * mang vài trăm KB thay vì ảnh chụp màn hình 4K nguyên cỡ.
 */
function toShot(
  src: CanvasImageSource,
  crop: { x: number; y: number; w: number; h: number }
): Shot {
  const size = fitWithin(crop.w, crop.h, CHART_IMAGE_EDGE);
  const canvas = document.createElement('canvas');
  canvas.width = size.w;
  canvas.height = size.h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas 2d unavailable');
  // Nền trắng: ảnh PNG trong suốt nén sang JPEG sẽ thành nền ĐEN.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size.w, size.h);
  ctx.drawImage(src, crop.x, crop.y, crop.w, crop.h, 0, 0, size.w, size.h);
  const url = canvas.toDataURL('image/jpeg', 0.9);
  return {
    id: nextId++,
    media_type: 'image/jpeg',
    data: url.slice(url.indexOf(',') + 1),
    url,
    w: size.w,
    h: size.h,
  };
}

async function fileToShot(file: Blob): Promise<Shot> {
  let bmp: ImageBitmap | HTMLImageElement;
  try {
    bmp = await createImageBitmap(file);
  } catch {
    // Safari cũ không giải mã được mọi định dạng qua createImageBitmap.
    const u = URL.createObjectURL(file);
    try {
      bmp = await new Promise<HTMLImageElement>((ok, bad) => {
        const im = new Image();
        im.onload = () => ok(im);
        im.onerror = () => bad(new Error('decode'));
        im.src = u;
      });
    } finally {
      setTimeout(() => URL.revokeObjectURL(u), 0);
    }
  }
  const w = 'naturalWidth' in bmp ? bmp.naturalWidth : bmp.width;
  const h = 'naturalHeight' in bmp ? bmp.naturalHeight : bmp.height;
  if (!(w > 0) || !(h > 0)) throw new Error('decode');
  return toShot(bmp, { x: 0, y: 0, w, h });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type CaptureNote = 'notTab' | 'cropMiss' | null;

/**
 * Chụp đúng khung chart từ CHÍNH tab này qua getDisplayMedia. Đây là cách
 * duy nhất lấy được pixel của iframe TradingView (khác origin): trình duyệt
 * chụp màn hình tab, rồi app cắt lấy khung chart.
 *
 * Cắt bằng Region Capture (`CropTarget`) nếu trình duyệt có — chính xác
 * theo phần tử; không có thì tính theo toạ độ (`cropBox`). Người dùng chọn
 * chia sẻ cửa sổ/màn hình khác thay vì tab này thì KHÔNG cắt (toạ độ vô
 * nghĩa) và nói ra, thay vì cắt bừa một góc màn hình.
 */
async function captureElement(el: HTMLElement): Promise<{ shot: Shot; note: CaptureNote }> {
  const md: any = navigator.mediaDevices;
  const stream: MediaStream = await md.getDisplayMedia({
    video: { displaySurface: 'browser' },
    audio: false,
    preferCurrentTab: true,
    selfBrowserSurface: 'include',
  });
  try {
    const track: any = stream.getVideoTracks()[0];
    const surface = track?.getSettings?.().displaySurface;
    el.scrollIntoView({ block: 'center', behavior: 'instant' as ScrollBehavior });
    let regionCropped = false;
    const CT = (window as any).CropTarget;
    if (surface === 'browser' && CT?.fromElement && typeof track?.cropTo === 'function') {
      try {
        await track.cropTo(await CT.fromElement(el));
        regionCropped = true;
      } catch {
        regionCropped = false;
      }
    }
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.srcObject = stream;
    await video.play();
    // Chờ vài khung để khung hình mới (sau khi cuộn / cắt vùng) tới nơi.
    await sleep(350);
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!vw || !vh) throw new Error('empty frame');
    let note: CaptureNote = null;
    let crop = { x: 0, y: 0, w: vw, h: vh };
    if (!regionCropped) {
      if (surface && surface !== 'browser') {
        note = 'notTab';
      } else {
        const box = cropBox(
          el.getBoundingClientRect(),
          { width: window.innerWidth, height: window.innerHeight },
          { width: vw, height: vh }
        );
        if (box) crop = box;
        else note = 'cropMiss';
      }
    }
    return { shot: toShot(video, crop), note };
  } finally {
    stream.getTracks().forEach((t) => t.stop());
  }
}

/**
 * Chart TradingView của mã đang mở + phần đính kèm ảnh cho Claude.
 *
 * Claude KHÔNG nhìn thấy iframe — màn hình nói thẳng điều đó, nếu không
 * người dùng sẽ tưởng bấm Claude là Claude đã "xem chart". Thứ Claude đọc
 * là ảnh trong hàng thumbnail bên dưới, và chỉ những ảnh đó.
 */
export default function ChartForClaude({
  symbol,
  tv,
  shots,
  setShots,
  disabled,
}: {
  symbol: string;
  tv: string;
  shots: Shot[];
  setShots: (f: (s: Shot[]) => Shot[]) => void;
  disabled?: boolean;
}) {
  const { t, lang } = useLang();
  const theme = useResolvedTheme();
  const chartRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<CaptureNote>(null);
  const [canCapture, setCanCapture] = useState(false);

  useEffect(() => {
    // Đọc sau hydrate: server không có navigator. Điện thoại gần như luôn
    // không có getDisplayMedia, và nút chụp không được là nút bấm không ra gì.
    setCanCapture(typeof navigator !== 'undefined' && !!(navigator.mediaDevices as any)?.getDisplayMedia);
  }, []);

  const full = shots.length >= CHART_IMAGE_MAX;

  const add = useCallback(
    (s: Shot) => setShots((prev) => (prev.length >= CHART_IMAGE_MAX ? prev : [...prev, s])),
    [setShots]
  );

  const addFiles = useCallback(
    async (files: Blob[]) => {
      setErr(null);
      const room = CHART_IMAGE_MAX - shots.length;
      if (room <= 0) {
        setErr(t('ci.full', CHART_IMAGE_MAX));
        return;
      }
      for (const f of files.slice(0, room)) {
        try {
          add(await fileToShot(f));
        } catch {
          setErr(t('ci.errDecode'));
        }
      }
      if (files.length > room) setErr(t('ci.full', CHART_IMAGE_MAX));
    },
    [add, shots.length, t]
  );

  /* Dán ảnh (Ctrl+V / Cmd+V) ở bất kỳ đâu trên trang khi khối này đang hiện.
     CHỈ bắt khi clipboard có ảnh — dán chữ vào ô tìm mã vẫn chạy như cũ. */
  useEffect(() => {
    if (disabled) return;
    const onPaste = (e: ClipboardEvent) => {
      const items = Array.from(e.clipboardData?.items ?? []);
      const imgs = items
        .filter((it) => it.kind === 'file' && it.type.startsWith('image/'))
        .map((it) => it.getAsFile())
        .filter((f): f is File => !!f);
      if (!imgs.length) return;
      e.preventDefault();
      void addFiles(imgs);
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, [addFiles, disabled]);

  const capture = async () => {
    if (!chartRef.current || full) return;
    setErr(null);
    setNote(null);
    setBusy(true);
    try {
      const r = await captureElement(chartRef.current);
      add(r.shot);
      setNote(r.note);
    } catch (e: any) {
      const name = e?.name ?? '';
      setErr(
        name === 'NotAllowedError' || name === 'AbortError'
          ? t('ci.errDenied')
          : t('ci.errCapture', String(e?.message ?? e).slice(0, 160))
      );
    } finally {
      setBusy(false);
    }
  };

  const locale = lang === 'vi' ? 'vi_VN' : 'en';

  return (
    <div className="ci">
      <h4 className="dsec">{t('dd.chart')}</h4>
      <p className="cap">{t('ci.intro')}</p>
      <div ref={chartRef} className="cichart">
        {theme && tv && (
          /* key theo mã + theme: đổi một trong hai là dựng widget MỚI —
             widget TradingView không đổi theme hay mã tại chỗ. */
          <TradingViewWidget
            key={`${tv}:${theme}:${locale}`}
            type="advanced-chart"
            height={440}
            attributionHref={`https://www.tradingview.com/symbols/${tv.replace(':', '-')}/`}
            attributionLabel={`${symbol} chart`}
            config={{
              width: '100%',
              height: 440,
              symbol: tv,
              interval: 'D',
              range: '12M',
              timezone: 'America/New_York',
              theme,
              style: '1',
              locale,
              // Thanh công cụ bên trái MỞ: người dùng vẽ đường/vùng trước khi
              // chụp, và Claude đọc được những gì họ vẽ.
              hide_side_toolbar: false,
              allow_symbol_change: false,
              save_image: true,
              studies: ['MASimple@tv-basicstudies', 'RSI@tv-basicstudies'],
              support_host: 'https://www.tradingview.com',
            }}
          />
        )}
      </div>
      {/* Widget lặng lẽ vẽ AAPL cho mã nó không nhận (#173) — dòng này là
          dấu hiệu duy nhất để thấy chart không khớp mã đang mở. */}
      <p className="cap intmeta">{t('ci.symbol', tv)}</p>

      <div
        className="cibar"
        onDragOver={(e) => {
          if (Array.from(e.dataTransfer.items).some((i) => i.kind === 'file')) e.preventDefault();
        }}
        onDrop={(e) => {
          const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith('image/'));
          if (!files.length) return;
          e.preventDefault();
          void addFiles(files);
        }}
      >
        {canCapture && (
          <button type="button" className="aibtn" onClick={capture} disabled={busy || full || disabled}>
            {busy ? t('ci.capturing') : t('ci.capture')}
          </button>
        )}
        <button
          type="button"
          className="aibtn"
          onClick={() => fileRef.current?.click()}
          disabled={full || disabled}
        >
          {t('ci.pick')}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          multiple
          hidden
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            e.target.value = '';
            if (files.length) void addFiles(files);
          }}
        />
        <span className="cap">{t('ci.pasteHint')}</span>
      </div>
      {!canCapture && <p className="cap">{t('ci.noCapture')}</p>}

      {shots.length > 0 ? (
        <div className="cithumbs">
          {shots.map((s, i) => (
            <figure key={s.id} className="cithumb">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={s.url} alt={t('ci.alt', i + 1)} />
              <button
                type="button"
                className="cix"
                aria-label={t('ci.remove')}
                title={t('ci.remove')}
                onClick={() => setShots((prev) => prev.filter((x) => x.id !== s.id))}
                disabled={disabled}
              >
                ×
              </button>
            </figure>
          ))}
        </div>
      ) : null}
      <p className="cap">
        {shots.length ? t('ci.count', { n: shots.length, max: CHART_IMAGE_MAX }) : t('ci.none')}
      </p>
      {note && <p className="cap hint hint-warn">{t(note === 'notTab' ? 'ci.notTab' : 'ci.cropMiss')}</p>}
      {err && <p className="cap hint hint-warn ciwarn">{err}</p>}
    </div>
  );
}
