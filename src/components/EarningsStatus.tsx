'use client';

import { useLang } from '@/lib/i18n';
import type { EarningsInfo } from '@/lib/earningsdate';
import type { TtEarningsStatus } from '@/lib/ttearnings';

/**
 * Dòng giải thích dưới "Earnings kế tiếp" ở tab Analyze: ngày lấy từ nguồn
 * nào, chắc tới đâu, và khi KHÔNG có ngày thì vì sao.
 *
 * Trước đây màn hình in một dấu `—` cho mọi trường hợp thiếu, nên "chưa ai
 * hỏi", "ETF không có earnings", "chỉ biết lần đã qua" và "tastytrade đang
 * lỗi" trông y hệt nhau — trong khi chỉ trường hợp cuối là thứ cần sửa.
 */
export default function EarningsStatus({
  info,
}: {
  info: (EarningsInfo & { sync: TtEarningsStatus | null }) | null | undefined;
}) {
  const { t } = useLang();
  if (!info)
    return (
      <div className="erstatus">
        <p className="hint hint-warn">{t('er.noInfo')}</p>
      </div>
    );

  const lines: { text: string; warn?: boolean }[] = [];
  if (info.status === 'known') {
    if (info.source === 'tastytrade') {
      lines.push({
        text: t(info.estimated ? 'er.srcTtEst' : 'er.srcTtConf'),
        warn: !!info.estimated,
      });
    } else if (info.source === 'file') {
      lines.push({ text: t('er.srcFile') });
    } else if (info.source === 'finviz') {
      lines.push({ text: t('er.srcFinviz', info.finvizRaw ?? ''), warn: true });
    }
    if (info.timing) lines.push({ text: t(info.timing === 'AMC' ? 'er.amc' : 'er.bmo') });
  } else if (info.status === 'none') {
    lines.push({ text: t('er.none') });
  } else {
    lines.push({
      text: info.lastDate ? t('er.past', info.lastDate) : t('er.unknown'),
      warn: true,
    });
    for (const r of info.reasons) {
      if (r === 'tt-error') lines.push({ text: t('er.r.tt-error', info.ttError ?? ''), warn: true });
      else if (r === 'finviz-unparsed') lines.push({ text: t('er.r.finviz-unparsed', info.finvizRaw ?? '') });
      else lines.push({ text: t(`er.r.${r}`), warn: r === 'tt-off' });
    }
  }

  const s = info.sync;
  let sync: { text: string; warn?: boolean } | null = null;
  if (s) {
    const hhmm = (ms: number) =>
      new Date(ms).toLocaleString('en-GB', {
        timeZone: 'America/New_York', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
      });
    if (!s.configured) sync = { text: t('er.syncOff'), warn: true };
    else if (!s.lastRun) sync = { text: t('er.syncNever', s.symbols), warn: true };
    else if (s.lastRun.error) sync = { text: t('er.syncErr', [hhmm(s.lastRun.at), s.lastRun.error]), warn: true };
    else
      sync = {
        text: t('er.syncOk', [
          s.symbols,
          hhmm(s.lastRun.at),
          s.lastRun.asked,
          s.lastRun.returned,
          s.lastRun.missing.length,
        ]),
      };
  }

  return (
    <div className="erstatus">
      {lines.map((l, i) => (
        <p key={i} className={l.warn ? 'hint hint-warn' : 'cap'}>
          {l.text}
        </p>
      ))}
      {sync && <p className={sync.warn ? 'hint hint-warn' : 'cap'}>{sync.text}</p>}
    </div>
  );
}
