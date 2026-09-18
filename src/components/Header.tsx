'use client';

import { useTahqiq } from '@/store';

function LogoMark() {
  return (
    <svg width="44" height="44" viewBox="0 0 48 48" className="drop-shadow-[0_0_10px_rgba(212,175,55,0.35)]">
      <defs>
        <linearGradient id="tahqiq-gld" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#F1DC9B" />
          <stop offset="1" stopColor="#B08D1F" />
        </linearGradient>
      </defs>
      <rect x="7" y="7" width="34" height="34" rx="8" transform="rotate(45 24 24)" fill="none" stroke="url(#tahqiq-gld)" strokeWidth="2.5" />
      <rect x="11.5" y="11.5" width="25" height="25" rx="6" transform="rotate(45 24 24)" fill="rgba(212,175,55,0.10)" />
      <text x="24" y="30" textAnchor="middle" fontSize="15" fill="#F1DC9B" fontFamily="Amiri, serif">
        ت
      </text>
    </svg>
  );
}

export default function Header() {
  const modelStatus = useTahqiq((s) => s.modelStatus);
  const modelProgress = useTahqiq((s) => s.modelProgress);
  const modelSize = useTahqiq((s) => s.modelSize);
  const tau = useTahqiq((s) => s.tau);

  const status =
    modelStatus === 'ready'
      ? { dot: 'bg-mint-400', text: 'جاهز — يعمل على جهازك', cls: 'text-mint-300' }
      : modelStatus === 'loading'
        ? { dot: 'bg-warn-400 animate-pulse', text: `جارٍ التحميل ${Math.round(modelProgress * 100)}%`, cls: 'text-warn-300' }
        : modelStatus === 'error'
          ? { dot: 'bg-danger-400 animate-pulse', text: 'تعذّر التحميل — المحرّك الاحتياطي فعّال', cls: 'text-danger-300' }
          : { dot: 'bg-slate-500', text: 'الخمول — النموذج غير محمَّل بعد', cls: 'text-slate-400' };

  return (
    <header className="sticky top-0 z-40 border-b border-line/70 bg-ink-950/85 backdrop-blur-md">
      <div className="mx-auto flex max-w-[1500px] items-center gap-4 px-4 py-3 sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <LogoMark />
          <div className="min-w-0 leading-tight">
            <div className="flex items-baseline gap-2">
              <span className="font-brand text-xl font-bold tracking-[0.18em] text-gold-400">TAHQĪQ</span>
              <span className="font-quran text-2xl text-gold-200">تَحَقُّق</span>
            </div>
            <p className="truncate text-[11px] text-slate-400">محرِّك التحقق من التلاوة — بالمعالجة على الجهاز</p>
          </div>
        </div>

        <div className="ms-auto flex items-center gap-3">
          <div className="flex items-center gap-2.5 rounded-full border border-line bg-ink-900/80 px-4 py-2">
            <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${status.dot}`} />
            <div className="leading-tight">
              <div className="font-brand text-[10px] tracking-[0.22em] text-slate-300">ON-DEVICE WHISPER · WASM</div>
              <div className={`whitespace-nowrap text-[11px] ${status.cls}`}>{status.text}</div>
            </div>
          </div>
          <div className="hidden items-center gap-4 rounded-xl border border-line bg-ink-900/60 px-4 py-2 text-[11px] text-slate-300 md:flex">
            <span>
              النموذج: <b className="font-brand text-gold-300">{modelSize} · {modelSize === 'tiny' ? '~43' : '~80'}MB</b>
            </span>
            <span className="h-4 w-px bg-line" />
            <span>
              τ = <b className="font-brand text-mint-300">{tau.toFixed(2)}</b>
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}
