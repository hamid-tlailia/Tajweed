'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ayahAudioUrls, globalAyahNumber, resolveReciter } from '@/lib/reciter';
import { buildTarget } from '@/lib/quran';
import { fmtSec } from '@/lib/util';
import { refKey, useTahqiq } from '@/store';
import { IconPlay, IconStop } from './ui';

/**
 * مشغّل صوت القارئ المعتمد للآية المختارة — يُشارك بين لوحة التمرين ولوحة الرواية.
 * يُرجع زمنَ التشغيل الجاري أيضًا، فتُضاء به كلماتُ الآية مع صوته.
 */
export function useAyahAudio(): {
  state: 'idle' | 'loading' | 'playing' | 'error';
  /** زمن التشغيل الجاري بالملي ثانية (٠ إن لم يكن يُسمَع) */
  atMs: number;
  play: () => void;
  stop: () => void;
  available: boolean;
  reciterName: string;
  playAyah: number;
} {
  const surahs = useTahqiq((s) => s.surahs);
  const surahId = useTahqiq((s) => s.selectedSurahId);
  const ayah = useTahqiq((s) => s.selectedAyah);
  const scope = useTahqiq((s) => s.scope);
  const riwayah = useTahqiq((s) => s.riwayah);
  const tempo = useTahqiq((s) => s.tempo);
  const style = useTahqiq((s) => s.recitationStyle);
  const choice = useTahqiq((s) => s.referenceChoice);
  const recording = useTahqiq((s) => s.recording);
  const data = useTahqiq((s) => s.surahCache[s.selectedSurahId] ?? null);

  const [state, setState] = useState<'idle' | 'loading' | 'playing' | 'error'>('idle');
  const [atMs, setAtMs] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const rafRef = useRef<number | null>(null);

  const { reciter } = resolveReciter(riwayah, tempo, style, choice);
  const firstWordAyah = data?.ayahs[0]?.numberInSurah ?? ayah;
  const playAyah = scope === 'surah' ? firstWordAyah : ayah;
  const globalNo = globalAyahNumber(surahs, surahId, playAyah);
  const urls = ayahAudioUrls(reciter, surahId, playAyah, globalNo);

  const stop = useCallback(() => {
    const el = audioRef.current;
    if (el) {
      el.pause();
      audioRef.current = null;
    }
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    setAtMs(0);
    setState('idle');
  }, []);

  const play = useCallback(() => {
    const start = (fromIndex: number) => {
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
        setAtMs(0);
        setState('idle');
      };
      el.onerror = () => {
        // جرّب الرابط البديل قبل إعلان التعذّر
        if (audioRef.current === el) audioRef.current = null;
        start(fromIndex + 1);
      };
      const tick = () => {
        if (audioRef.current !== el) return;
        setAtMs(el.currentTime * 1000);
        rafRef.current = requestAnimationFrame(tick);
      };
      void el
        .play()
        .then(() => {
          rafRef.current = requestAnimationFrame(tick);
        })
        .catch(() => {
          if (audioRef.current === el) audioRef.current = null;
          start(fromIndex + 1);
        });
    };
    start(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urls.join('|')]);

  // تغيّرت الآية أو الرواية أو القارئ: يُوقف ما كان يُسمَع
  useEffect(() => {
    stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [surahId, ayah, scope, riwayah, reciter.id]);

  // لا يُسجَّل صوت القارئ مع صوت المتعلِّم
  useEffect(() => {
    if (recording) stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recording]);

  useEffect(() => () => stop(), [stop]);

  return { state, atMs, play, stop, available: urls.length > 0, reciterName: reciter.name, playAyah };
}

/**
 * «اسمع الآية ثم اقرأها» — فوق زرّ الميكروفون مباشرةً.
 *
 * كان زرّ الاستماع في تبويب الإعدادات وحده فلا يكاد يُرى، والمتعلِّم إنما يُحسن
 * التلاوة إذا سمعها من متقنٍ أولًا. وهنا تُضاء كلماتُ الآية **مع صوت القارئ**
 * (بأزمنته التي قاسها المحرّك نفسه) فيرى أين يمدّ وأين يصل — ثم يسجّل بالزرّ تحته.
 */
export default function ReciterListen() {
  const data = useTahqiq((s) => s.surahCache[s.selectedSurahId] ?? null);
  const scope = useTahqiq((s) => s.scope);
  const selectedAyah = useTahqiq((s) => s.selectedAyah);
  const riwayah = useTahqiq((s) => s.riwayah);
  const tempo = useTahqiq((s) => s.tempo);
  const style = useTahqiq((s) => s.recitationStyle);
  const choice = useTahqiq((s) => s.referenceChoice);
  const refCache = useTahqiq((s) => s.refCache);

  const { state, atMs, play, stop, available, reciterName } = useAyahAudio();

  const { reciter } = resolveReciter(riwayah, tempo, style, choice);
  const ref = data ? refCache[refKey(data.id, selectedAyah, reciter.id)] : undefined;
  const target = data ? buildTarget(data, scope, selectedAyah) : null;
  const words = target?.words ?? [];
  /** أزمنة القارئ لهذه الآية (إن قِيست) — بها تُضاء الكلمة مع صوته */
  const refWords = ref && ref.words.length === words.length ? ref.words : null;
  const playing = state === 'playing';
  const cur = playing && refWords ? refWords.findIndex((w) => atMs >= w.startMs && atMs < w.endMs) : -1;

  if (!words.length) return null;

  return (
    <div className="mb-4 rounded-xl border border-gold-600/35 bg-gold-500/[0.06] p-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11.5px] font-semibold text-gold-200">اسمع الآية أوّلًا ثم اقرأها</p>
          <p className="mt-0.5 text-[10px] leading-snug text-slate-400">
            القارئ المعتمد: <span className="text-gold-300">{reciterName}</span>
            {refWords ? ' — تُضاء الكلمات مع صوته' : ' — يحتاج الاستماع إلى إنترنت'}
          </p>
        </div>
        {playing || state === 'loading' ? (
          <button
            type="button"
            onClick={stop}
            aria-label="إيقاف الاستماع"
            className="flex h-10 shrink-0 items-center gap-2 rounded-lg border border-danger-500/50 bg-danger-500/10 px-3.5 text-xs font-semibold text-danger-300 transition hover:bg-danger-500/20"
          >
            <IconStop className="h-4 w-4" /> {state === 'loading' ? 'جارٍ الجلب…' : 'إيقاف'}
          </button>
        ) : (
          <button
            type="button"
            onClick={play}
            disabled={!available}
            className="flex h-10 shrink-0 items-center gap-2 rounded-lg border border-gold-600/50 bg-gold-500/15 px-3.5 text-xs font-semibold text-gold-200 transition hover:bg-gold-500/25 disabled:opacity-50"
          >
            <IconPlay className="h-4 w-4" /> اسمع الآية
          </button>
        )}
      </div>

      {/* كلمات الآية — تُضاء مع صوت القارئ متى عُرفت أزمنته */}
      <div className="mt-3 flex flex-wrap items-start gap-1.5">
        {words.slice(0, 90).map((w, i) => {
          const rw = refWords?.[i];
          const done = playing && rw ? atMs >= rw.endMs : false;
          const isCur = i === cur;
          const dur = rw ? Math.max(0, rw.endMs - rw.startMs) : 0;
          return (
            <span
              key={i}
              className={`inline-flex min-w-[3.2rem] flex-col items-stretch rounded-lg border px-2.5 pb-1 pt-1.5 transition ${
                isCur
                  ? 'live-word border-gold-500/70 bg-gold-500/15 text-gold-100 ring-1 ring-gold-400/60'
                  : done
                    ? 'border-line bg-ink-850/70 text-slate-300'
                    : 'border-line/60 bg-ink-850/40 text-slate-400'
              }`}
            >
              <span className="text-center font-quran text-[17px] leading-none">{w.word}</span>
              {rw ? (
                <span className="mt-1 block text-center font-brand text-[8.5px] leading-tight text-slate-500" dir="ltr">
                  {fmtSec(dur)}
                </span>
              ) : null}
            </span>
          );
        })}
      </div>

      {state === 'error' ? (
        <p className="mt-2 text-[10px] leading-relaxed text-danger-300">
          تعذّر جلب صوت القارئ الآن — تحقّق من اتصال الإنترنت. (بقية التطبيق تعمل على جهازك بلا إنترنت.)
        </p>
      ) : null}
    </div>
  );
}
