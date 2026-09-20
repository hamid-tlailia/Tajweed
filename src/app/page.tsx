'use client';

import { useEffect } from 'react';
import AlignmentConsole from '@/components/AlignmentConsole';
import Header from '@/components/Header';
import ModelPanel from '@/components/ModelPanel';
import ProgressPanel from '@/components/ProgressPanel';
import ReciterGate from '@/components/ReciterGate';
import RecorderPanel from '@/components/RecorderPanel';
import RiwayahPanel from '@/components/RiwayahPanel';
import SurahBrowser from '@/components/SurahBrowser';
import TabBar from '@/components/TabBar';
import { useTahqiq } from '@/store';

export default function Home() {
  const init = useTahqiq((s) => s.init);
  const surahsStatus = useTahqiq((s) => s.surahsStatus);
  const riwayah = useTahqiq((s) => s.riwayah);
  const activeTab = useTahqiq((s) => s.activeTab);

  useEffect(() => {
    void init();
  }, [init]);

  return (
    <div className="min-h-screen overflow-x-clip">
      <div className="sticky top-0 z-40">
        <Header />
      </div>
      <main className="mx-auto max-w-[1500px] px-4 py-6 sm:px-5">
        {surahsStatus === 'error' ? (
          <div className="rounded-2xl border border-danger-500/40 bg-danger-500/10 p-8 text-center">
            <p className="font-quran text-xl text-danger-300">
              تعذّر تحميل فهرس السور — تحقق من الاتصال بالشبكة ثم أعد تحميل الصفحة.
            </p>
          </div>
        ) : (
          <>
            {activeTab === 'practice' ? (
              <div className="space-y-5">
                <SurahBrowser />
                <ReciterGate />
                <RecorderPanel />
              </div>
            ) : null}
            {activeTab === 'settings' ? (
              <div className="mx-auto max-w-2xl space-y-5">
                <RiwayahPanel />
                <ModelPanel />
              </div>
            ) : null}
            {activeTab === 'result' ? <AlignmentConsole /> : null}
            {activeTab === 'progress' ? <ProgressPanel /> : null}
          </>
        )}
      </main>
      <footer
        className="border-t border-line/60 py-5 text-center text-[11px] leading-relaxed text-slate-500"
        style={{ paddingBottom: 'calc(92px + env(safe-area-inset-bottom, 0px))' }}
      >
        <span className="font-quran text-sm text-gold-500">تَحَقُّق</span> · تطبيق مساعد على إتقان التلاوة بالتجويد —
        يحلّل معالجٌ ذكي صوتَك على جهازك دون أن يُرفَع إلى الإنترنت · أداةُ تمرين لا تُغني عن أستاذ التجويد والمُقرئين ·
        نصّ المصحف: الرسم العثماني — AlQuran Cloud · الأحكام: رواية {riwayah === 'warsh' ? 'ورش عن نافع' : 'حفص عن عاصم'}
      </footer>
      {/* شريط التبويب السفلي — فوتر الملاحة الثابت */}
      {surahsStatus !== 'error' ? <TabBar /> : null}
    </div>
  );
}
