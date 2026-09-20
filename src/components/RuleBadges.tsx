'use client';

import { useEffect, useRef, useState } from 'react';
import { WARSH_ONLY_RULES } from '@/lib/tajweed';
import type { RuleBadge } from '@/lib/types';
import { Badge } from './ui';

/**
 * شارات أحكام التجويد مع شرح داخل البطاقة (لا تطفو خارج الشاشة).
 * على الجوّال لا يوجد مرور بالمؤشر؛ الشرح يُفتح بضغطة ويبقى ضمن حدود البطاقة.
 */
export default function RuleBadges({
  rules,
  max = 3,
}: {
  rules: RuleBadge[];
  max?: number;
  align?: 'start' | 'center';
}) {
  const [open, setOpen] = useState<number | null>(null);
  const boxRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    if (open === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(null);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  if (!rules.length) return <span className="text-slate-600">—</span>;

  const shown = rules.slice(0, max);
  const extra = rules.length - shown.length;
  const openRule = open !== null ? rules[open] : null;

  return (
    <span ref={boxRef} className="flex w-full min-w-0 flex-col items-stretch gap-1.5">
      <span className="flex flex-wrap items-center gap-1">
        {shown.map((r, i) => (
          <button
            key={i}
            type="button"
            onClick={() => setOpen(open === i ? null : i)}
            aria-expanded={open === i}
            className={`rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-400/70 ${r.note ? 'active:scale-[0.97]' : ''}`}
          >
            <Badge tone={r.tone}>
              {r.label}
              {r.note ? (
                <span aria-hidden className="ms-0.5 text-[9px] opacity-70">
                  ؟
                </span>
              ) : null}
            </Badge>
          </button>
        ))}
        {extra > 0 ? (
          <button
            type="button"
            onClick={() => setOpen(open === shown.length - 1 ? null : 0)}
            className="text-[9px] text-slate-400 underline decoration-dotted"
            aria-label="بقية الأحكام"
          >
            +{extra}
          </button>
        ) : null}
      </span>

      {openRule ? (
        <span
          role="dialog"
          className="w-full max-w-full overflow-hidden rounded-xl border border-gold-500/40 bg-ink-900 p-3 text-start shadow-inner"
        >
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] font-semibold text-gold-200">{openRule.label}</span>
            {WARSH_ONLY_RULES.includes(openRule.label) ? (
              <span className="rounded border border-mint-500/50 bg-mint-500/10 px-1.5 py-px text-[9px] text-mint-300">
                خاصة برواية ورش
              </span>
            ) : (
              <span className="rounded border border-line px-1.5 py-px text-[9px] text-slate-500">عند جميع القرّاء</span>
            )}
          </span>
          <span className="mt-1.5 block text-[10px] leading-relaxed text-slate-300">{openRule.note ?? 'لا شرح متاح لهذا الحكم.'}</span>
          <button
            type="button"
            onClick={() => setOpen(null)}
            className="mt-2 text-[9px] text-slate-500 underline decoration-dotted"
          >
            إغلاق
          </button>
        </span>
      ) : null}
    </span>
  );
}
