'use client';

import type { AppTab } from '@/lib/types';
import { PASS_SCORE } from '@/lib/types';
import { useTahqiq } from '@/store';

const TABS: { id: AppTab; label: string }[] = [
  { id: 'practice', label: 'التمرين' },
  { id: 'settings', label: 'الإعدادات' },
  { id: 'result', label: 'النتيجة' },
  { id: 'progress', label: 'التقدّم' },
];

export default function TabBar() {
  const activeTab = useTahqiq((s) => s.activeTab);
  const setActiveTab = useTahqiq((s) => s.setActiveTab);
  const result = useTahqiq((s) => s.result);
  const processing = useTahqiq((s) => s.processing);
  const progress = useTahqiq((s) => s.progress);
  const surahId = useTahqiq((s) => s.selectedSurahId);
  const riwayah = useTahqiq((s) => s.riwayah);
  const data = useTahqiq((s) => s.surahCache[s.selectedSurahId] ?? null);

  const recs = progress[`${surahId}:${riwayah}`] ?? {};
  const passed = Object.values(recs).filter((r) => r.passed).length;
  const total = data?.meta.numberOfAyahs ?? 0;

  return (
    <nav className="sticky top-0 z-30 border-b border-line/70 bg-ink-950/95 backdrop-blur-md">
      <div className="mx-auto flex max-w-[1500px] gap-1 px-2 py-2 sm:px-5">
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
              className={`relative min-w-0 flex-1 rounded-xl px-2 py-2.5 text-xs font-semibold transition sm:text-sm ${
                on ? 'bg-gold-500/15 text-gold-200 ring-1 ring-gold-500/50' : 'text-slate-400 hover:bg-ink-800 hover:text-slate-200'
              }`}
            >
              {t.label}
              {hint ? (
                <span
                  className={`ms-1 rounded-md px-1.5 py-px text-[9px] font-brand ${
                    t.id === 'result' && result && result.overallScore >= PASS_SCORE
                      ? 'bg-mint-500/20 text-mint-300'
                      : 'bg-ink-800 text-slate-400'
                  }`}
                >
                  {hint}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
