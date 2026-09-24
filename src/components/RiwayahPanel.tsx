'use client';

import { useEffect, useRef, useState } from 'react';
import { ayahAudioUrls, globalAyahNumber, resolveReciter } from '@/lib/reciter';
import type { Riwayah } from '@/lib/types';
import { useTahqiq } from '@/store';
import { IconPause, IconPlay, IconStop, Panel } from './ui';

const RIWAYAHS: { id: Riwayah; label: string; hint: string }[] = [
  { id: 'hafs', label: 'حفص عن عاصم', hint: 'قراءة أهل المشرق: بدل حركتين، ومتصل ومنفصل ٤–٥' },
  { id: 'warsh', label: 'ورش عن نافع', hint: 'قراءة أهل المغرب: بدل ٢ أو ٤ أو ٦، ومتصل ومنفصل ٦، ونقلٌ وتقليل' },
];

export default function RiwayahPanel() {
  const riwayah = useTahqiq((s) => s.riwayah);
  const setRiwayah = useTahqiq((s) => s.setRiwayah);
  const surahs = useTahqiq((s) => s.surahs);
  const surahId = useTahqiq((s) => s.selectedSurahId);
  const ayah = useTahqiq((s) => s.selectedAyah);
  const scope = useTahqiq((s) => s.scope);
  const recording = useTahqiq((s) => s.recording);
  const data = useTahqiq((s) => s.surahCache[s.selectedSurahId] ?? null);
  const tempo = useTahqiq((s) => s.tempo);
  const style = useTahqiq((s) => s.recitationStyle);
  const choice = useTahqiq((s) => s.referenceChoice);

  const [state, setState] = useState<'idle' | 'loading' | 'playing' | 'error'>('idle');
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // القارئ المرجعي نفسه الذي يُقاس إليه التحليل (التلقائي بحسب المرتبة ونوع التلاوة، أو المختار)
  const { reciter } = resolveReciter(riwayah, tempo, style, choice);
  const firstAyahOfScope = scope === 'surah' ? 1 : ayah;
  const firstWordAyah = data?.ayahs[0]?.numberInSurah ?? firstAyahOfScope;
  const playAyah = scope === 'surah' ? firstWordAyah : firstAyahOfScope;
  const globalNo = globalAyahNumber(surahs, surahId, playAyah);
  const urls = ayahAudioUrls(reciter, surahId, playAyah, globalNo);

  /** يوقف الاستماع (يُستدعى عند تغيير الآية/الرواية أو بدء التسجيل) */
  function stop() {
    const el = audioRef.current;
    if (el) {
      el.pause();
      audioRef.current = null;
    }
    setState('idle');
  }

  useEffect(() => {
    stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [surahId, ayah, scope, riwayah, reciter.id]);

  // لا يُسجَّل صوتُ القارئ مع صوت المتعلِّم
  useEffect(() => {
    if (recording) stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recording]);

  useEffect(() => () => stop(), []);

  function play(fromIndex = 0) {
    if (fromIndex >= urls.length) {
      setState('error');
      return;
    }
    setState('loading');
    const el = new Audio(urls[fromIndex]);
    el.preload = 'auto';
    audioRef.current = el;
    el.oncanplay = () => setState('playing');
    el.onended = () => {
      audioRef.current = null;
      setState('idle');
    };
    el.onerror = () => {
      // جرّب الرابط البديل قبل إعلان التعذّر
      if (audioRef.current === el) audioRef.current = null;
      play(fromIndex + 1);
    };
    void el.play().catch(() => {
      if (audioRef.current === el) audioRef.current = null;
      play(fromIndex + 1);
    });
  }

  const busy = state === 'loading';

  return (
    <Panel title="الرواية والقارئ المرجعي" subtitle="اختر الرواية التي تريد إتقانها، واسمع الآية من قارئٍ متقنٍ قبل أن تسجّل">
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        {RIWAYAHS.map((r) => {
          const sel = r.id === riwayah;
          return (
            <button
              key={r.id}
              onClick={() => setRiwayah(r.id)}
              aria-pressed={sel}
              className={`rounded-xl border p-3 text-start transition ${
                sel ? 'border-gold-500/70 bg-gold-500/10 shadow-[0_0_14px_rgba(212,175,55,0.15)]' : 'border-line bg-ink-850/60 hover:border-gold-600/40'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className={`text-sm font-semibold ${sel ? 'text-gold-200' : 'text-slate-200'}`}>{r.label}</span>
                {sel ? <span className="text-[10px] text-gold-300">مختارة ✓</span> : null}
              </div>
              <p className="mt-1 text-[10px] leading-snug text-slate-500">{r.hint}</p>
            </button>
          );
        })}
      </div>

      {riwayah === 'warsh' ? (
        <p className="mt-3 rounded-xl border border-line/70 bg-ink-900/60 p-3 text-[10px] leading-relaxed text-slate-400">
          في رواية ورش يُقاس عليك: البدل (٢ أو ٤ أو ٦) · المتصل والمنفصل والصلة الكبرى (٦ مشبعة) · النقل (مِنْ آمَنَ ←
          مِنَامَن) · إبدال الهمز الساكن (يُؤْمِنُ ← يُومِنُ) · الهمزتان في كلمة · تقليل ذوات الياء وذوات الراء.
        </p>
      ) : null}

      <div className="mt-4 rounded-xl border border-line bg-ink-850/70 p-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold text-slate-200">
              القارئ المرجعي: <span className="text-gold-200">{reciter.name}</span>
            </p>
            <p className="mt-0.5 text-[10px] text-slate-500">
              {scope === 'surah' ? 'يُسمَع أول آية من السورة المختارة' : `الآية ${playAyah} من السورة المختارة`} — بلا أي
              أثرٍ على صوتك المُسجَّل
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {state === 'playing' ? (
              <>
                <button
                  onClick={stop}
                  aria-label="إيقاف الاستماع"
                  className="flex h-10 items-center gap-2 rounded-lg border border-danger-500/50 bg-danger-500/10 px-3 text-xs text-danger-300 transition hover:bg-danger-500/20"
                >
                  <IconStop className="h-4 w-4" /> إيقاف
                </button>
                <span className="flex items-center gap-1.5 text-[11px] text-mint-300">
                  <IconPause className="h-3.5 w-3.5" /> يُسمَع الآن
                </span>
              </>
            ) : (
              <button
                onClick={() => play()}
                disabled={busy || !urls.length}
                className="flex h-10 items-center gap-2 rounded-lg border border-gold-600/50 bg-gold-500/15 px-3.5 text-xs font-semibold text-gold-200 transition hover:bg-gold-500/25 disabled:opacity-50"
              >
                <IconPlay className="h-4 w-4" /> {busy ? 'جارٍ الجلب…' : 'اسمع الآية'}
              </button>
            )}
          </div>
        </div>
        {state === 'error' ? (
          <p className="mt-2 text-[10px] leading-relaxed text-danger-300">
            تعذّر جلب الصوت المرجعي الآن — تحقّق من اتصال الإنترنت ثم أعد المحاولة. (بقية التطبيق تعمل على جهازك بلا
            إنترنت.)
          </p>
        ) : (
          <p className="mt-2 text-[10px] leading-relaxed text-slate-500">
            هذه الميزة الوحيدة التي تحتاج إنترنت، ولا يُرسَل منها شيء عنك — ولا تتأثّر بها دقة التقييم.
          </p>
        )}
      </div>
    </Panel>
  );
}
