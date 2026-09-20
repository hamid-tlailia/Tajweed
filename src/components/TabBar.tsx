'use client';

import type { ComponentType } from 'react';
import type { AppTab } from '@/lib/types';
import { PASS_SCORE } from '@/lib/types';
import { useTahqiq } from '@/store';
import { IconBookOpen, IconMedal, IconPulse, IconSliders } from './ui';

const TABS: { id: AppTab; label: string; Icon: ComponentType<{ className?: string }> }[] = [
  { id: 'practice', label: 'التمرين', Icon: IconBookOpen },
  { id: 'settings', label: 'الإعدادات', Icon: IconSliders },
  { id: 'result', label: 'النتيجة', Icon: IconPulse },
  { id: 'progress', label: 'التقدّم', Icon: IconMedal },
];

/**
 * شريط تبويب سفلي احترافي (فوتر الملاحة) — مثبَّت أسفل الشاشة:
 * أيقونة + عنوان لكل تبويب، مؤشّر ذهبي للتبويب النشط، شارات حالة (نتيجة/تقدّم)،
 * احترام مساحة الأمان في هواتف الحزمة (safe-area)، وخطٌّ ذهبي رفيع يعلوه.
 */
export default function TabBar() {
  const activeTab = useTahqiq((s) => s.activeTab);
  const setActiveTab = useTahqiq((s) => s.setActiveTab);
  const result = useTahqiq((s) => s.result);
  const processing = useTahqiq((s) => s.processing);
  const progress = useTahqiq((s) => s.progress);
  const recording = useTahqiq((s) => s.recording);
  const surahId = useTahqiq((s) => s.selectedSurahId);
  const riwayah = useTahqiq((s) => s.riwayah);
  const data = useTahqiq((s) => s.surahCache[s.selectedSurahId] ?? null);

  const recs = progress[`${surahId}:${riwayah}`] ?? {};
  const passed = Object.values(recs).filter((r) => r.passed).length;
  const total = data?.meta.numberOfAyahs ?? 0;

  return (
    <nav
      aria-label="التنقّل الرئيس"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line/70 bg-ink-950/92 shadow-dock backdrop-blur-xl"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      {/* خطٌّ ذهبي رفيع يعلو الشريط */}
      <div className="pointer-events-none absolute inset-x-0 -top-px h-px bg-gradient-to-l from-transparent via-gold-500/60 to-transparent" />

      <div className="mx-auto grid max-w-[560px] grid-cols-4 px-1.5 py-1.5 sm:max-w-[640px]">
        {TABS.map((t) => {
          const on = activeTab === t.id;
          const hint =
            t.id === 'result' && (processing || result)
              ? processing
                ? '…'
                : result && result.overallScore >= PASS_SCORE
                  ? '✓'
                  : '!'
              : t.id === 'progress' && total
                ? `${passed}/${total}`
                : null;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id)}
              aria-current={on ? 'page' : undefined}
              className={`group relative flex min-w-0 flex-col items-center gap-1 rounded-xl px-1 py-2 transition sm:py-2.5 ${
                on ? 'bg-gold-500/10' : 'hover:bg-ink-800/70'
              }`}
            >
              {/* مؤشّر التبويب النشط */}
              <span
                className={`absolute top-0 h-[3px] w-9 rounded-full bg-gradient-to-l from-gold-600 via-gold-400 to-gold-600 transition-opacity ${
                  on ? 'opacity-100' : 'opacity-0'
                }`}
              />

              <span className="relative">
                <t.Icon className={`h-[22px] w-[22px] transition ${on ? 'text-gold-400' : 'text-slate-400 group-hover:text-slate-200'}`} />
                {t.id === 'practice' && recording ? (
                  <span className="live-dot absolute -end-1 -top-0.5 h-2 w-2 rounded-full bg-danger-500 ring-2 ring-ink-950/80" />
                ) : null}
                {hint ? (
                  <span
                    className={`absolute -end-2 -top-1.5 rounded-md px-1 py-px font-brand text-[9px] font-semibold leading-none ${
                      hint === '✓'
                        ? 'bg-mint-500/25 text-mint-300'
                        : hint === '!'
                          ? 'bg-warn-500/25 text-warn-300'
                          : 'bg-ink-700 text-slate-400'
                    }`}
                  >
                    {hint}
                  </span>
                ) : null}
              </span>

              <span
                className={`whitespace-nowrap text-[10.5px] font-semibold transition sm:text-[11.5px] ${
                  on ? 'text-gold-300' : 'text-slate-400 group-hover:text-slate-200'
                }`}
              >
                {t.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
