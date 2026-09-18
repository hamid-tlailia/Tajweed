import type { ReactNode } from 'react';
import type { WordStatus } from '@/lib/types';

/* ---------------- Panel ---------------- */

export function Panel({
  title,
  subtitle,
  latin,
  children,
  className = '',
}: {
  title: string;
  subtitle?: string;
  latin?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`min-w-0 rounded-2xl border border-line/80 bg-ink-900/70 shadow-[0_0_30px_rgba(0,0,0,0.35)] backdrop-blur-sm ${className}`}>
      <header className="flex items-center justify-between gap-3 border-b border-line/60 px-5 py-3.5">
        <div>
          <h2 className="font-quran text-lg leading-none text-gold-200">{title}</h2>
          {subtitle ? <p className="mt-1 text-[11px] text-slate-400">{subtitle}</p> : null}
        </div>
        {latin ? (
          <span className="whitespace-nowrap font-brand text-[10px] uppercase tracking-[0.25em] text-slate-500">{latin}</span>
        ) : null}
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
  ok: { t: 'متوافق', c: 'border-mint-500/30 bg-mint-500/10 text-mint-300/90' },
  short: { t: 'قصير ↓', c: 'border-warn-500/50 bg-warn-500/15 text-warn-300' },
  long: { t: 'طويل ↑', c: 'border-warn-500/50 bg-warn-500/15 text-warn-300' },
  silent: { t: 'غير مسموع', c: 'border-danger-500/50 bg-danger-500/15 text-danger-300' },
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
