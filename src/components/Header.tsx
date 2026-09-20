'use client';

import { useTahqiq } from '@/store';

function LogoMark({ className = 'h-11 w-11 sm:h-12 sm:w-12' }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={`${className} shrink-0 drop-shadow-[0_0_10px_rgba(212,175,55,0.35)]`}>
      <defs>
        <linearGradient id="tahqiq-gld" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#F1DC9B" />
          <stop offset="1" stopColor="#B08D1F" />
        </linearGradient>
      </defs>
      <rect x="7" y="7" width="34" height="34" rx="8" transform="rotate(45 24 24)" fill="none" stroke="url(#tahqiq-gld)" strokeWidth="2.5" />
      <rect x="11.5" y="11.5" width="25" height="25" rx="6" transform="rotate(45 24 24)" fill="rgba(212,175,55,0.10)" />
      <text x="24" y="31" textAnchor="middle" fontSize="17" fill="#F1DC9B" fontFamily="Amiri, serif">
        ت
      </text>
    </svg>
  );
}

export default function Header() {
  const modelStatus = useTahqiq((s) => s.modelStatus);
  const modelProgress = useTahqiq((s) => s.modelProgress);

  const status =
    modelStatus === 'ready'
      ? { dot: 'bg-mint-400', text: 'التعرّف الصوتي جاهز', cls: 'text-mint-300' }
      : modelStatus === 'loading'
        ? { dot: 'bg-warn-400 animate-pulse', text: `يُنزَّل نموذج التعرّف… ${Math.round(modelProgress * 100)}%`, cls: 'text-warn-300' }
        : modelStatus === 'error'
          ? { dot: 'bg-danger-400 animate-pulse', text: 'سيعمل بالتحليل الصوتي البديل', cls: 'text-danger-300' }
          : { dot: 'bg-slate-500', text: 'لم يُنزَّل نموذج التعرّف بعد', cls: 'text-slate-400' };

  return (
    <header className="sticky top-0 z-40 border-b border-line/70 bg-ink-950/90 backdrop-blur-md">
      <div className="mx-auto max-w-[1500px] px-3 py-3 sm:px-5 sm:py-3.5">
        <div className="flex items-center gap-3 sm:gap-4">
          {/* الشعار والعنوان */}
          <div className="flex min-w-0 items-center gap-3">
            <LogoMark />
            <div className="min-w-0 leading-tight">
              <h1 className="font-quran text-2xl font-bold text-gold-300 sm:text-[27px]">تَحَقُّق</h1>
              <p className="mt-0.5 truncate text-[11px] text-slate-400 sm:text-xs">
                اسمع تلاوتك كما يسمعها المُجوِّد — مدودٌ وغننٌ وأحكام
              </p>
            </div>
          </div>

          {/* حالة نموذج التعرف — لغة يفهمها كل مستخدم */}
          <div className="ms-auto flex items-center gap-2.5 rounded-full border border-line bg-ink-900/80 px-3.5 py-2 sm:px-4">
            <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${status.dot}`} />
            <span className={`truncate text-[11px] sm:text-xs ${status.cls}`}>{status.text}</span>
          </div>
        </div>
      </div>
    </header>
  );
}
