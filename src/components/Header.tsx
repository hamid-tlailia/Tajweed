'use client';

import { useTahqiq } from '@/store';
import { IconMoon, IconSun } from './ui';

/**
 * شعار التطبيق — «ت» من تَحَقُّق داخل معيّن ذهبي.
 *
 * كانت ألوانه مثبتةً بقيمٍ فاتحة (#F1DC9B) فتختفي الحرفُ في الثيم النهاري على
 * الأرضية العاجية. وصارت كلها من متغيّرات الثيم: الإطار ذهبٌ متدرّج، والحرف
 * `currentColor` من صنف `text-gold-300` الذي ينقلب في النهاري إلى ذهبٍ غامق —
 * فيبقى الشعار مقروءًا في الثيمين.
 */
function LogoMark({ className = 'h-11 w-11 sm:h-12 sm:w-12' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 48 48"
      role="img"
      aria-label="شعار تَحَقُّق"
      className={`${className} shrink-0 text-gold-300 drop-shadow-[0_0_10px_rgb(var(--c-gold-500)/0.35)]`}
    >
      <defs>
        <linearGradient id="tahqiq-gld" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="rgb(var(--c-gold-400))" />
          <stop offset="1" stopColor="rgb(var(--c-gold-600))" />
        </linearGradient>
      </defs>
      <rect
        x="7"
        y="7"
        width="34"
        height="34"
        rx="8"
        transform="rotate(45 24 24)"
        fill="none"
        stroke="url(#tahqiq-gld)"
        strokeWidth="2.5"
      />
      <rect
        x="11.5"
        y="11.5"
        width="25"
        height="25"
        rx="6"
        transform="rotate(45 24 24)"
        fill="rgb(var(--c-gold-500) / 0.12)"
      />
      <text x="24" y="31.5" textAnchor="middle" fontSize="18" fill="currentColor" fontFamily="Amiri, serif">
        ت
      </text>
    </svg>
  );
}

export default function Header() {
  const modelStatus = useTahqiq((s) => s.modelStatus);
  const modelProgress = useTahqiq((s) => s.modelProgress);
  const theme = useTahqiq((s) => s.theme);
  const setTheme = useTahqiq((s) => s.setTheme);

  const status =
    modelStatus === 'ready'
      ? { dot: 'bg-mint-400', text: 'السماع الذكي جاهز', cls: 'text-mint-300' }
      : modelStatus === 'loading'
        ? { dot: 'bg-warn-400 animate-pulse', text: `يُجهَّز السماع الذكي… ${Math.round(modelProgress * 100)}%`, cls: 'text-warn-300' }
        : modelStatus === 'error'
          ? { dot: 'bg-danger-400 animate-pulse', text: 'سيُقيَّم صوتيًّا بلا سماع ذكي', cls: 'text-danger-300' }
          : { dot: 'bg-slate-500', text: 'السماع الذكي غير مُجهَّز بعد', cls: 'text-slate-400' };

  return (
    <header className="border-b border-line/70 bg-ink-950/90 backdrop-blur-md">
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

          <div className="ms-auto flex items-center gap-2">
            {/* حالة السماع الذكي — لغة يفهمها كل مستخدم */}
            <div className="flex items-center gap-2.5 rounded-full border border-line bg-ink-900/80 px-3.5 py-2 sm:px-4">
              <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${status.dot}`} />
              <span className={`hidden max-w-[180px] truncate text-[11px] sm:inline sm:text-xs ${status.cls}`}>{status.text}</span>
            </div>

            {/* مبدّل الثيم: نهاري/ليلي */}
            <button
              type="button"
              onClick={() => setTheme(theme === 'day' ? 'night' : 'day')}
              title={theme === 'day' ? 'التبديل إلى الثيم الليلي' : 'التبديل إلى الثيم النهاري'}
              aria-label={theme === 'day' ? 'تفعيل الثيم الليلي' : 'تفعيل الثيم النهاري'}
              aria-pressed={theme === 'day'}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-line bg-ink-900/80 text-gold-400 transition hover:border-gold-500/60 hover:bg-gold-500/10 hover:text-gold-300"
            >
              {theme === 'day' ? <IconMoon className="h-5 w-5" /> : <IconSun className="h-5 w-5" />}
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
