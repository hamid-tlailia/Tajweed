import type { ReactNode } from 'react';
import type { WordStatus } from '@/lib/types';

/* ---------------- Panel ---------------- */

export function Panel({
  title,
  subtitle,
  children,
  className = '',
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`min-w-0 rounded-2xl border border-line/80 bg-ink-900/70 shadow-panel backdrop-blur-sm ${className}`}>
      <header className="border-b border-line/60 px-5 py-4">
        <h2 className="font-quran text-xl leading-none text-gold-200">{title}</h2>
        {subtitle ? <p className="mt-1.5 text-[11px] leading-relaxed text-slate-400">{subtitle}</p> : null}
      </header>
      <div className="p-5">{children}</div>
    </section>
  );
}

/* ---------------- Badge ---------------- */

const badgeTones: Record<string, string> = {
  gold: 'border-gold-500/50 bg-gold-500/10 text-gold-300',
  mint: 'border-mint-500/50 bg-mint-500/10 text-mint-300',
  warn: 'border-warn-500/50 bg-warn-500/10 text-warn-300',
  danger: 'border-danger-500/50 bg-danger-500/10 text-danger-300',
  slate: 'border-line bg-ink-800 text-slate-300',
};

export function Badge({ tone = 'slate', children, className = '' }: { tone?: string; children: ReactNode; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-medium ${badgeTones[tone] ?? badgeTones.slate} ${className}`}>
      {children}
    </span>
  );
}

/* ---------------- Stat ---------------- */

export function Stat({
  label,
  value,
  sub,
  tone = 'slate',
}: {
  label: string;
  value: ReactNode;
  sub?: string;
  tone?: 'gold' | 'mint' | 'warn' | 'danger' | 'slate';
}) {
  const tones: Record<string, string> = {
    gold: 'text-gold-300',
    mint: 'text-mint-300',
    warn: 'text-warn-300',
    danger: 'text-danger-300',
    slate: 'text-slate-100',
  };
  return (
    <div className="rounded-xl border border-line bg-ink-850/70 p-3.5">
      <div className="text-[10px] text-slate-400">{label}</div>
      <div className={`mt-1 font-brand text-lg font-semibold leading-none ${tones[tone]}`}>{value}</div>
      {sub ? <div className="mt-1.5 text-[10px] leading-snug text-slate-500">{sub}</div> : null}
    </div>
  );
}

/* ---------------- Status badge (word verdict) ---------------- */

const statusMap: Record<WordStatus, { t: string; c: string }> = {
  excellent: { t: 'مُتقَن ✓', c: 'border-mint-500/50 bg-mint-500/15 text-mint-300' },
  ok: { t: 'جيد', c: 'border-mint-500/30 bg-mint-500/10 text-mint-300/90' },
  short: { t: 'أقصر من المطلوب ↓', c: 'border-warn-500/50 bg-warn-500/15 text-warn-300' },
  long: { t: 'أطول من المطلوب ↑', c: 'border-warn-500/50 bg-warn-500/15 text-warn-300' },
  silent: { t: 'لم يُسمع', c: 'border-danger-500/50 bg-danger-500/15 text-danger-300' },
};

export function StatusBadge({ status }: { status: WordStatus }) {
  const s = statusMap[status];
  return <span className={`inline-flex rounded-md border px-2 py-0.5 text-[10px] font-medium ${s.c}`}>{s.t}</span>;
}

export function statusCardClass(status: WordStatus | null): string {
  if (!status) return 'border-line bg-ink-850/70';
  if (status === 'excellent' || status === 'ok') return 'border-mint-500/40 bg-mint-500/10';
  if (status === 'short' || status === 'long') return 'border-warn-500/40 bg-warn-500/10';
  return 'border-danger-500/40 bg-danger-500/10';
}

/* ---------------- Surah medallion (octagon) ---------------- */

export function Medallion({ n, size = 'sm', active = false }: { n: number; size?: 'sm' | 'md'; active?: boolean }) {
  const clip = 'polygon(29.3% 0%, 70.7% 0%, 100% 29.3%, 100% 70.7%, 70.7% 100%, 29.3% 100%, 0% 70.7%, 0% 29.3%)';
  const box = size === 'sm' ? 'h-8 w-8' : 'h-11 w-11';
  const txt = size === 'sm' ? 'text-[10px]' : 'text-sm';
  return (
    <span className={`relative inline-flex shrink-0 items-center justify-center ${box}`}>
      <span
        className={`absolute inset-0 ${active ? 'bg-gold-500' : 'bg-gradient-to-b from-gold-500/30 to-gold-500/10'}`}
        style={{ clipPath: clip }}
      />
      <span className={`absolute inset-[3px] ${active ? 'bg-gold-400' : 'bg-ink-900'}`} style={{ clipPath: clip }} />
      <span className={`relative font-brand font-semibold ${txt} ${active ? 'text-ink-950' : 'text-gold-400'}`}>{n}</span>
    </span>
  );
}

/* ---------------- Icons ---------------- */

type IconProps = { className?: string };

export const IconMic = ({ className = 'h-5 w-5' }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
    <line x1="12" y1="19" x2="12" y2="22" />
  </svg>
);

export const IconStop = ({ className = 'h-5 w-5' }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
    <rect x="6" y="6" width="12" height="12" rx="2.5" />
  </svg>
);

export const IconPlay = ({ className = 'h-5 w-5' }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M8 5.5v13l11-6.5z" />
  </svg>
);

export const IconPause = ({ className = 'h-5 w-5' }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
    <rect x="6.5" y="5" width="3.6" height="14" rx="1.2" />
    <rect x="13.9" y="5" width="3.6" height="14" rx="1.2" />
  </svg>
);

export const IconUpload = ({ className = 'h-5 w-5' }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M21 15v3a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3v-3" />
    <path d="m7 8 5-5 5 5" />
    <line x1="12" y1="3" x2="12" y2="15" />
  </svg>
);

export const IconWand = ({ className = 'h-5 w-5' }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1" />
    <circle cx="12" cy="12" r="3.2" />
  </svg>
);

export const IconRefresh = ({ className = 'h-5 w-5' }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M21 12a9 9 0 1 1-2.64-6.36" />
    <path d="M21 3v6h-6" />
  </svg>
);

export const IconWaveEmpty = ({ className = 'h-10 w-28' }: IconProps) => (
  <svg viewBox="0 0 120 40" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" className={className}>
    <path d="M4 20h6M16 13v14M26 8v24M36 15v10M46 6v28M56 14v12M66 9v22M76 16v8M86 5v30M96 14v12M106 10v20M116 18v4" />
  </svg>
);

/* ---------------- أيقونات شريط التبويب السفلي والثيم ---------------- */

export const IconBookOpen = ({ className = 'h-5 w-5' }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M12 6.5C10.4 5 8.3 4.4 5.5 4.4c-.8 0-1.5.6-1.5 1.4v10.7c0 .8.7 1.4 1.5 1.4 2.8 0 4.9.6 6.5 2.1 1.6-1.5 3.7-2.1 6.5-2.1.8 0 1.5-.6 1.5-1.4V5.8c0-.8-.7-1.4-1.5-1.4-2.8 0-4.9.6-6.5 2.1Z" />
    <path d="M12 6.5v13.5" />
  </svg>
);

export const IconSliders = ({ className = 'h-5 w-5' }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className={className}>
    <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
    <circle cx="15" cy="7" r="2.2" />
    <circle cx="9" cy="17" r="2.2" />
  </svg>
);

export const IconPulse = ({ className = 'h-5 w-5' }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M2.5 12h4l2.5-6.5 4 13 2.5-6.5h6" />
  </svg>
);

export const IconMedal = ({ className = 'h-5 w-5' }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <circle cx="12" cy="14.5" r="5" />
    <path d="m9.5 10-3-6.5h11L14.5 10M12 12.3l.9 1.8 2 .3-1.4 1.4.3 2-1.8-1-1.8 1 .3-2-1.4-1.4 2-.3Z" />
  </svg>
);

export const IconSun = ({ className = 'h-5 w-5' }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className={className}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5 5l1.4 1.4M17.6 17.6 19 19M19 5l-1.4 1.4M6.4 17.6 5 19" />
  </svg>
);

export const IconMoon = ({ className = 'h-5 w-5' }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M20 13.5A8 8 0 0 1 10.5 4 8 8 0 1 0 20 13.5Z" />
  </svg>
);

export const IconShieldCheck = ({ className = 'h-5 w-5' }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M12 3 5 5.8v5.4c0 4.4 2.9 7.6 7 9.8 4.1-2.2 7-5.4 7-9.8V5.8L12 3Z" />
    <path d="m9 11.6 2.2 2.2 4-4.2" />
  </svg>
);

export const IconBolt = ({ className = 'h-5 w-5' }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M13 2 4.5 13.5H10L9 22l8.5-11.5H12L13 2Z" />
  </svg>
);
