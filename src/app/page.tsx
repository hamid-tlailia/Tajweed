'use client';

import { useEffect } from 'react';
import AlignmentConsole from '@/components/AlignmentConsole';
import Header from '@/components/Header';
import ModelPanel from '@/components/ModelPanel';
import RecorderPanel from '@/components/RecorderPanel';
import SurahBrowser from '@/components/SurahBrowser';
import { useTahqiq } from '@/store';

export default function Home() {
  const init = useTahqiq((s) => s.init);
  const surahsStatus = useTahqiq((s) => s.surahsStatus);

  useEffect(() => {
    void init();
  }, [init]);

  return (
    <div className="min-h-screen">
      <Header />
      <main className="mx-auto max-w-[1500px] px-4 py-6 sm:px-5">
        {surahsStatus === 'error' ? (
          <div className="rounded-2xl border border-danger-500/40 bg-danger-500/10 p-8 text-center">
            <p className="font-quran text-xl text-danger-300">
              تعذّر تحميل فهرس السور — تحقق من الاتصال بالشبكة ثم أعد تحميل الصفحة.
            </p>
          </div>
        ) : (
          <>
            <SurahBrowser />
            <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-[400px_minmax(0,1fr)]">
              <div className="min-w-0 space-y-5 xl:sticky xl:top-[86px] xl:self-start">
                <ModelPanel />
                <RecorderPanel />
              </div>
              <div className="min-w-0">
                <AlignmentConsole />
              </div>
            </div>
          </>
        )}
      </main>
      <footer className="border-t border-line/60 py-5 text-center text-[11px] leading-relaxed text-slate-500">
        <span className="font-quran text-sm text-gold-500">تَحَقُّق</span> · تطبيق مساعد على إتقان التلاوة بالتجويد —
        يحلّل معالجٌ ذكي صوتَك على جهازك دون أن يُرفَع إلى الإنترنت · أداةُ تمرين لا تُغني عن أستاذ التجويد
        والمُقرئين · نصّ المصحف: رواية حفص — AlQuran Cloud
      </footer>
    </div>
  );
}
