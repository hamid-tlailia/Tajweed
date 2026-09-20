'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { energyEnvelope } from '@/lib/audio';
import { resultPulse, wordViolation } from '@/lib/haptics';
import { TEMPO_META } from '@/lib/tajweed';
import { PASS_SCORE } from '@/lib/types';
import { fmtSec, fmtTime, waveThemeColors } from '@/lib/util';
import { useTahqiq } from '@/store';
import RuleBadges from './RuleBadges';
import { Badge, IconPause, IconPlay, IconWaveEmpty, Panel, Stat, StatusBadge } from './ui';

const MAX_ROWS = 500;

const ENGINE_LABEL: Record<string, string> = {
  'whisper-attn': 'سماع ذكي — يتبع كل كلمة من تلاوتك',
  'whisper-ts': 'سماع ذكي — يوقّت كلمات تلاوتك',
  'whisper-energy': 'سماع ذكي مع قياس الصوت',
  'offline-dtw': 'قياس الصوت مباشرة',
};

function cardTone(status: string, active: boolean): string {
  const ring = active ? 'ring-2 ring-gold-400 shadow-[0_0_18px_rgba(212,175,55,0.28)]' : '';
  if (status === 'excellent' || status === 'ok') return `border-mint-500/50 bg-mint-500/10 ${ring}`;
  if (status === 'short' || status === 'long') return `border-warn-500/55 bg-warn-500/10 shake-error ${ring}`;
  if (status === 'silent') return `border-danger-500/55 bg-danger-500/10 pulse-miss ${ring}`;
  return `border-line bg-ink-850/60 ${ring}`;
}

export default function AlignmentConsole() {
  const result = useTahqiq((s) => s.result);
  const processing = useTahqiq((s) => s.processing);
  const stage = useTahqiq((s) => s.stage);
  const activeWord = useTahqiq((s) => s.activeWord);
  const setActiveWord = useTahqiq((s) => s.setActiveWord);
  const alertOn = useTahqiq((s) => s.alertOn);
  const setAlertOn = useTahqiq((s) => s.setAlertOn);
  const advanceAyah = useTahqiq((s) => s.advanceAyah);
  const selectedAyah = useTahqiq((s) => s.selectedAyah);
  const data = useTahqiq((s) => s.surahCache[s.selectedSurahId] ?? null);
  const scope = useTahqiq((s) => s.scope);

  const [playing, setPlaying] = useState(false);
  const [openRow, setOpenRow] = useState<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef(0);
  const clockRef = useRef<{ t0: number; offset: number } | null>(null);
  const lastIdxRef = useRef(-1);

  const energy = useMemo(() => (result?.samples ? Array.from(energyEnvelope(result.samples, 40)) : []), [result]);
  const durationMs = result?.durationMs ?? 0;

  useEffect(() => {
    setPlaying(false);
    clockRef.current = null;
    lastIdxRef.current = -1;
    setOpenRow(null);
    setActiveWord(-1);
  }, [result, setActiveWord]);

  useEffect(() => {
    if (!result) return;
    resultPulse(result.passed);
  }, [result?.createdAt]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(
    () => () => {
      cancelAnimationFrame(rafRef.current);
      audioRef.current?.pause();
    },
    [],
  );

  const currentT = (): number => {
    if (!result) return 0;
    if (result.audioUrl && audioRef.current) return audioRef.current.currentTime * 1000;
    if (clockRef.current) return clockRef.current.offset + (performance.now() - clockRef.current.t0);
    return 0;
  };

  function indexAt(t: number): number {
    if (!result) return -1;
    if (t < 150) return -1;
    let idx = -1;
    for (let i = 0; i < result.words.length; i++) {
      if (t >= result.words[i].startMs && t <= result.words[i].endMs) {
        idx = i;
        break;
      }
      if (t > result.words[i].endMs) idx = i;
    }
    return idx;
  }

  function drawWave(tMs: number) {
    const c = canvasRef.current;
    if (!c || !energy.length) return;
    const dpr = window.devicePixelRatio || 1;
    const w = c.clientWidth;
    const h = c.clientHeight;
    if (w === 0 || h === 0) return;
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
    }
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const max = Math.max(...energy, 1e-6);
    const n = energy.length;
    const bw = w / n;
    const progress = durationMs > 0 ? tMs / durationMs : 0;
    const wave = waveThemeColors();
    for (let i = 0; i < n; i++) {
      const v = energy[i] / max;
      const bh = Math.max(2, v * (h - 10));
      ctx.fillStyle = i / n <= progress ? wave.done : wave.todo;
      ctx.fillRect(i * bw, (h - bh) / 2, Math.max(1, bw - 0.6), bh);
    }
    ctx.fillStyle = wave.playhead;
    ctx.fillRect(Math.max(0, w * progress - 1), 0, 2, h);
  }

  useEffect(() => {
    if (result) drawWave(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result, energy]);

  function loop() {
    if (!result) return;
    const t = Math.min(currentT(), durationMs);
    drawWave(t);
    const idx = indexAt(t);
    if (idx !== lastIdxRef.current) {
      lastIdxRef.current = idx;
      setActiveWord(idx);
      const w = idx >= 0 ? result.words[idx] : null;
      if (w && alertOn && (w.status === 'short' || w.status === 'long' || w.status === 'silent')) {
        wordViolation(w.status);
      }
    }
    if (t >= durationMs && durationMs > 0) {
      setPlaying(false);
      setActiveWord(-1);
      return;
    }
    rafRef.current = requestAnimationFrame(loop);
  }

  function togglePlay() {
    if (!result) return;
    if (playing) {
      audioRef.current?.pause();
      if (clockRef.current) clockRef.current = { t0: performance.now(), offset: currentT() };
      setPlaying(false);
      cancelAnimationFrame(rafRef.current);
      return;
    }
    if (result.audioUrl && audioRef.current) {
      audioRef.current.currentTime = 0;
      void audioRef.current.play().catch(() => {});
    } else {
      clockRef.current = { t0: performance.now(), offset: 0 };
    }
    setPlaying(true);
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(loop);
  }

  if (processing) {
    return (
      <Panel title="نتيجة التلاوة" subtitle="يقارن التطبيق صوتَك الآن بكل كلمة من النصّ">
        <div className="flex flex-col items-center gap-4 py-12 text-center">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-gold-500/30 border-t-gold-400" />
          <p className="font-quran text-lg text-gold-200">جارٍ التحليل…</p>
          <p className="text-xs text-slate-400">{stage}</p>
          <div className="h-1.5 w-64 overflow-hidden rounded-full bg-ink-700">
            <div className="shimmer h-full w-full" />
          </div>
        </div>
      </Panel>
    );
  }

  if (!result) {
    return (
      <Panel title="نتيجة التلاوة" subtitle="سيظهر هنا تقييمُ تلاوتك كلمةً كلمة مع أحكام التجويد">
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-line py-16 text-center">
          <IconWaveEmpty className="h-10 w-28 text-slate-600" />
          <p className="font-quran text-lg text-slate-300">لا توجد نتيجة بعد</p>
          <p className="max-w-md text-xs leading-relaxed text-slate-500">
            من تبويب التمرين اختر الآية واضغط زرّ الميكروفون — أو اضغط <b className="text-gold-300">«تجربة سريعة»</b> لترى
            مثالًا جاهزًا دون تسجيل.
          </p>
        </div>
      </Panel>
    );
  }

  const scoreTone = result.overallScore >= 70 ? 'mint' : result.overallScore >= 50 ? 'warn' : 'danger';
  const rows = result.words.slice(0, MAX_ROWS);
  const lastAyah = data?.meta.numberOfAyahs ?? 0;
  const hasNext = scope === 'ayah' && lastAyah > 0 && selectedAyah < lastAyah;
  const surahDone = scope === 'ayah' && lastAyah > 0 && selectedAyah >= lastAyah && result.passed;
  const tipByIndex = new Map(result.tips.map((t) => [t.index, t]));
  const matchPct = Math.round(result.transcriptMatch * 100);
  const matchSub =
    result.matchSource === 'coverage'
      ? 'تعذّر تمييز النصّ — هذه تغطية الكلمات المسموعة'
      : result.matchSource === 'demo'
        ? 'محاكاة للتجربة — بلا ميكروفون'
        : 'مدى تطابق ما قرأتَه مع الآية';

  const glossary = (() => {
    const seen = new Map<string, { label: string; note: string }>();
    for (const w of result.words) {
      for (const r of w.tajweed.rules) {
        if (r.note && !seen.has(r.label)) seen.set(r.label, { label: r.label, note: r.note });
      }
    }
    return [...seen.values()];
  })();

  return (
    <Panel title="نتيجة التلاوة" subtitle={`${result.targetLabel} — ${result.verdict}`} className="fade-up">
      {result.audioUrl ? <audio ref={audioRef} src={result.audioUrl} className="hidden" preload="auto" /> : null}

      {/* خلاصة + اجتياز */}
      <div
        className={`mb-3 rounded-2xl border p-4 ${
          result.passed ? 'border-mint-500/40 bg-mint-500/10 success-burst' : 'border-warn-500/40 bg-warn-500/10'
        }`}
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className={`font-quran text-lg ${result.passed ? 'text-mint-300' : 'text-warn-300'}`}>
              {result.reciter
                ? result.passed
                  ? 'اجتزت الآية بمطابقة القارئ المعتمد'
                  : 'لم تبلغ مطابقة القارئ حدّ الاجتياز'
                : result.passed
                  ? 'اجتزت الآية'
                  : 'لم تُجتز بعد'}
              <span className="ms-2 font-brand text-base">
                {result.reciter ? `${result.reciter.matchPct}%` : `${result.overallScore}%`}
              </span>
              {result.reciter ? <span className="ms-1.5 font-brand text-xs text-slate-400">(درجتك الذاتية {result.overallScore}%)</span> : null}
            </p>
            <p className="mt-1.5 text-[12px] leading-relaxed text-slate-300">{result.summary}</p>
          </div>
          <Badge tone={result.passed ? 'mint' : 'warn'}>{TEMPO_META[result.tempo]?.label ?? 'ترتيل'}</Badge>
        </div>
        {result.tips.length ? (
          <ul className="mt-3 space-y-1.5">
            {result.tips.slice(0, 5).map((t) => (
              <li key={t.index} className="rounded-lg border border-line/70 bg-ink-900/50 px-3 py-2 text-[11px] leading-relaxed text-slate-200">
                <span className="font-semibold text-gold-200">{t.title} — «{t.word}»</span>
                <span className="mt-0.5 block text-slate-400">{t.action}</span>
              </li>
            ))}
            {result.tips.length > 5 ? (
              <li className="text-[10px] text-slate-500">و{result.tips.length - 5} ملاحظات أخرى في بطاقات الكلمات.</li>
            ) : null}
          </ul>
        ) : (
          <p className="mt-2 text-[11px] text-mint-300">لا مخالفات زمنية ظاهرة في هذه التلاوة.</p>
        )}
        {result.passed && hasNext ? (
          <button
            type="button"
            onClick={() => advanceAyah()}
            className="mt-3 w-full rounded-xl border border-mint-500/50 bg-mint-500/15 py-2.5 text-sm font-semibold text-mint-200 transition hover:bg-mint-500/25"
          >
            الآية التالية ← (الآية {selectedAyah + 1} من {lastAyah})
          </button>
        ) : null}
        {surahDone ? (
          <p className="mt-3 rounded-xl border border-gold-500/40 bg-gold-500/10 px-3 py-2 text-center text-sm text-gold-200">
            هذه آخر آية — راجع تبويب التقدّم لترى إتمام السورة.
          </p>
        ) : null}
        {!result.passed ? (
          <p className="mt-3 text-[11px] text-slate-500">
            {result.reciter
              ? `حدّ الاجتياز مطابقة القارئ المعتمد ${PASS_SCORE}٪ (درجتك الذاتية ${result.overallScore}٪). حاذِ أزمنة كلماتك بأزمنته وأعد التلاوة.`
              : `حدّ الاجتياز ${PASS_SCORE}٪. أعد التلاوة بعد إصلاح الملاحظات أعلاه.`}
          </p>
        ) : null}
      </div>

      {/* التحكيم: مقارنة بالقارئ المعتمد */}
      {result.reciter ? (
        <div className="mb-3 rounded-2xl border border-gold-500/40 bg-gold-500/[0.07] p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-quran text-base text-gold-200">
              المقارنة بالقارئ المعتمد — {result.reciter.refLabel}
            </h3>
            <span className="font-brand text-2xl font-bold leading-none text-gold-300">{result.reciter.matchPct}%</span>
          </div>
          <p className="mt-1 text-[10.5px] leading-relaxed text-slate-400">
            قورنت أزمنة كلماتك بأزمنة القارئ بعدلة سرعتك (أنت ≈{result.reciter.scale.toFixed(2)}× من سرعته) — فمن حافظ
            على نسقه في المدود والغنن والتمطيط طابقه.
          </p>
          {result.reciter.note ? (
            <p className="mt-1.5 rounded-lg border border-warn-500/40 bg-warn-500/10 px-2.5 py-1.5 text-[10.5px] leading-relaxed text-warn-300">
              {result.reciter.note}
            </p>
          ) : null}
          {(() => {
            const worst = [...result.reciter!.perWord].filter((p) => p.sim < 0.6).sort((a, b) => a.sim - b.sim).slice(0, 6);
            if (!worst.length) {
              return (
                <p className="mt-2 text-[11px] text-mint-300">
                  لا مخالفات ظاهرة على نسق القارئ — أزمنتك قريبة من أزمنته في كل الكلمات.
                </p>
              );
            }
            return (
              <div className="mt-2.5 space-y-1.5">
                <p className="text-[10px] text-slate-500">أبعد الكلمات عن نسق القارئ (زمنك ← زمنه بعدلة السرعة):</p>
                {worst.map((p) => (
                  <div
                    key={p.index}
                    className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-lg border border-line/70 bg-ink-900/50 px-2.5 py-1.5"
                  >
                    <span className="font-quran text-base text-gold-100">{p.word}</span>
                    <span className="font-brand text-[10px] text-slate-300" dir="ltr">
                      {fmtSec(p.userMs)} ← {fmtSec(p.scaledRefMs)}
                    </span>
                    <span
                      className={`font-brand text-[10px] font-semibold ${p.userMs < 70 ? 'text-danger-300' : p.userMs < p.scaledRefMs ? 'text-warn-300' : 'text-warn-300'}`}
                    >
                      {p.userMs < 70 ? 'لم تُسمع' : p.userMs < p.scaledRefMs ? 'أقصر من زمن القارئ ↓' : 'أطول من زمن القارئ ↑'}
                    </span>
                  </div>
                ))}
              </div>
            );
          })()}
        </div>
      ) : null}

      {/* playback bar */}
      <div className="flex items-center gap-3 rounded-xl border border-line bg-ink-850/70 p-3">
        <button
          onClick={togglePlay}
          aria-label={playing ? 'إيقاف مؤقت' : 'تشغيل'}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-gold-500/60 bg-gold-500/15 text-gold-300 transition hover:bg-gold-500/25"
        >
          {playing ? <IconPause className="h-5 w-5" /> : <IconPlay className="h-5 w-5" />}
        </button>
        <canvas ref={canvasRef} className="h-14 min-w-0 flex-1 rounded-md bg-ink-950/70" />
        <div className="shrink-0 text-start font-brand text-[10px] leading-tight text-slate-500">
          <div dir="ltr">{fmtTime(result.durationMs)}</div>
          <div className="mt-0.5 text-slate-400">
            {activeWord >= 0 ? `كلمة ${Math.min(activeWord + 1, result.words.length)}/${result.words.length}` : `${result.words.length} كلمة`}
          </div>
        </div>
        <button
          onClick={() => setAlertOn(!alertOn)}
          title={alertOn ? 'التنبيه بالاهتزاز والصوت عند المخالفة: مفعّل' : 'التنبيه بالاهتزاز والصوت: متوقف'}
          aria-label="تنبيه المخالفات"
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border text-sm transition ${
            alertOn ? 'border-gold-500/60 bg-gold-500/15 text-gold-300' : 'border-line bg-ink-900/60 text-slate-600'
          }`}
        >
          📳
        </button>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2.5 md:grid-cols-4">
        <Stat label="الدرجة الكلية" value={`${result.overallScore}%`} tone={scoreTone} sub="يجمع دقةَ النطق وصحةَ المدود والغنن" />
        <Stat label="مطابقة ما قرأته" value={`${matchPct}%`} tone={matchPct >= 70 ? 'mint' : matchPct >= 40 ? 'gold' : 'warn'} sub={matchSub} />
        <Stat label="مدة التلاوة" value={fmtTime(result.durationMs)} sub={`مرتبة ${TEMPO_META[result.tempo]?.label ?? 'ترتيل'}`} />
        <Stat
          label="طريقة التقييم"
          value={<span className="text-[13px]">{ENGINE_LABEL[result.engine]}</span>}
          tone="slate"
          sub={result.demo ? 'محاكاة للتجربة — بلا ميكروفون' : 'على جهازك دون إنترنت'}
        />
      </div>

      {result.transcript && result.matchSource === 'transcript' ? (
        <div className="mt-3 rounded-xl border border-line bg-ink-850/50 p-3.5">
          <h4 className="text-[11px] text-slate-400">ما سمعه التطبيق من تلاوتك — ما نقص أو اختلف مُظلَّل</h4>
          <p className="mt-2 font-quran text-lg leading-9 text-slate-200">
            {result.predWords.length ? (
              result.predWords.map((w, i) => (
                <span key={i} className={w.ok ? '' : 'rounded bg-danger-500/15 px-1 text-danger-300'}>
                  {w.word}{' '}
                </span>
              ))
            ) : (
              <span className="text-slate-500">—</span>
            )}
          </p>
        </div>
      ) : null}

      {/* بطاقات الكلمات — عرض الجوّال */}
      <div className="mt-3 space-y-2 md:hidden">
        {rows.map((w, i) => {
          const newAyah = i === 0 || result.words[i].ayah !== result.words[i - 1].ayah;
          const tip = tipByIndex.get(w.index);
          return (
            <div key={i} className={`rounded-xl border p-3 transition-colors ${cardTone(w.status, activeWord === i)}`}>
              <div className="flex items-start justify-between gap-2">
                <span className="min-w-0">
                  <span className="font-quran text-xl leading-tight text-gold-100">{w.word}</span>
                  {newAyah ? <span className="ms-2 font-brand text-[9px] text-slate-500">آية {w.ayah}</span> : null}
                </span>
                <StatusBadge status={w.status} />
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-slate-400">
                <span className="font-brand" dir="ltr">
                  {fmtSec(w.startMs)} ← {fmtSec(w.endMs)}
                </span>
                <span className="font-brand" dir="ltr">
                  {fmtSec(w.endMs - w.startMs)} / {fmtSec(w.tajweed.expectedMs)}
                </span>
                <span>دقة النطق {Math.round(w.confidence * 100)}%</span>
                <span className="text-slate-500">
                  كلمة {i + 1} من {result.words.length}
                </span>
              </div>
              {tip ? <p className="mt-2 rounded-lg bg-ink-950/40 px-2.5 py-1.5 text-[11px] leading-relaxed text-slate-200">{tip.action}</p> : null}
              <div className="mt-2">
                <RuleBadges rules={w.tajweed.rules} max={4} />
              </div>
            </div>
          );
        })}
        {result.words.length > MAX_ROWS ? (
          <p className="rounded-lg border border-line bg-ink-850 px-3 py-2 text-center text-[10px] text-slate-500">
            يُعرض أول {MAX_ROWS} كلمة من أصل {result.words.length} — العيّنة طويلة جدًا؛ يُنصح بتسجيل آيات قصيرة.
          </p>
        ) : null}
      </div>

      {/* word table — الشاشات الواسعة */}
      <div className="mt-3 hidden max-h-[430px] overflow-auto rounded-xl border border-line md:block">
        <table className="w-full min-w-[680px] border-collapse text-xs">
          <thead className="sticky top-0 z-10">
            <tr className="bg-ink-800 text-slate-400">
              <th className="px-3 py-2.5 text-start font-medium">#</th>
              <th className="px-3 py-2.5 text-start font-medium">الكلمة</th>
              <th className="px-3 py-2.5 text-start font-medium">البَدء</th>
              <th className="px-3 py-2.5 text-start font-medium">الانتهاء</th>
              <th className="px-3 py-2.5 text-start font-medium">المدة (فعلية / مطلوبة)</th>
              <th className="px-3 py-2.5 text-start font-medium">دقة النطق</th>
              <th className="px-3 py-2.5 text-start font-medium">الحكم على تلاوتك</th>
              <th className="px-3 py-2.5 text-start font-medium">أحكام التجويد</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((w, i) => (
              <tr
                key={i}
                className={`border-t border-line/50 transition-colors ${
                  activeWord === i
                    ? 'bg-gold-500/10'
                    : w.status === 'short' || w.status === 'long'
                      ? 'bg-warn-500/5'
                      : w.status === 'silent'
                        ? 'bg-danger-500/5'
                        : i % 2 === 1
                          ? 'bg-ink-900/40'
                          : ''
                }`}
              >
                <td className="px-3 py-2 font-brand text-slate-500">{i + 1}</td>
                <td className="whitespace-nowrap px-3 py-2">
                  <span className="font-quran text-lg text-gold-100">{w.word}</span>
                  {i === 0 || result.words[i].ayah !== result.words[i - 1].ayah ? (
                    <span className="ms-2 font-brand text-[9px] text-slate-500">آية {w.ayah}</span>
                  ) : null}
                  {tipByIndex.get(w.index) ? (
                    <span className="mt-1 block max-w-[220px] whitespace-normal text-[10px] leading-snug text-slate-400">
                      {tipByIndex.get(w.index)!.action}
                    </span>
                  ) : null}
                </td>
                <td className="px-3 py-2 font-brand text-slate-300" dir="ltr">
                  {fmtSec(w.startMs)}
                </td>
                <td className="px-3 py-2 font-brand text-slate-300" dir="ltr">
                  {fmtSec(w.endMs)}
                </td>
                <td className="px-3 py-2 font-brand text-slate-300" dir="ltr">
                  {fmtSec(w.endMs - w.startMs)} <span className="text-slate-500">/ {fmtSec(w.tajweed.expectedMs)}</span>
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-16 overflow-hidden rounded-full bg-ink-700">
                      <div
                        className={`h-full rounded-full ${
                          w.confidence >= 0.7 ? 'bg-mint-500' : w.confidence >= 0.45 ? 'bg-warn-500' : 'bg-danger-500'
                        }`}
                        style={{ width: `${Math.round(w.confidence * 100)}%` }}
                      />
                    </div>
                    <span className="font-brand text-[10px] text-slate-400">{Math.round(w.confidence * 100)}%</span>
                  </div>
                </td>
                <td className="px-3 py-2">
                  <StatusBadge status={w.status} />
                </td>
                <td className="px-3 py-2">
                  {openRow === i ? (
                    <span className="block max-w-[280px] space-y-1.5">
                      {w.tajweed.rules.map((r, k) => (
                        <span key={k} className="block rounded-lg border border-line bg-ink-900/70 p-2">
                          <Badge tone={r.tone}>{r.label}</Badge>
                          {r.note ? <span className="mt-1 block text-[10px] leading-relaxed text-slate-300">{r.note}</span> : null}
                        </span>
                      ))}
                      <button type="button" onClick={() => setOpenRow(null)} className="text-[10px] text-slate-400 underline decoration-dotted">
                        إغلاق الشرح
                      </button>
                    </span>
                  ) : (
                    <button type="button" onClick={() => setOpenRow(i)} className="flex flex-wrap items-center gap-1 text-start" aria-label="إظهار شرح الأحكام">
                      {w.tajweed.rules.length ? (
                        w.tajweed.rules.slice(0, 3).map((r, k) => (
                          <Badge key={k} tone={r.tone}>
                            {r.label}
                          </Badge>
                        ))
                      ) : (
                        <span className="text-slate-600">—</span>
                      )}
                      {w.tajweed.rules.length > 3 ? <span className="text-[9px] text-slate-500">+{w.tajweed.rules.length - 3}</span> : null}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {result.words.length > MAX_ROWS ? (
          <div className="border-t border-line bg-ink-850 px-3 py-2 text-center text-[10px] text-slate-500">
            يُعرض أول {MAX_ROWS} كلمة من أصل {result.words.length} — العيّنة طويلة جدًا؛ يُنصح بتسجيل آيات قصيرة.
          </div>
        ) : null}
      </div>

      {glossary.length ? (
        <details className="mt-3 rounded-xl border border-line bg-ink-850/50">
          <summary className="cursor-pointer list-none px-3.5 py-3 text-[11px] font-semibold text-gold-200">
            دليل الأحكام في هذه التلاوة
            <span className="ms-2 text-[10px] font-normal text-slate-500">({glossary.length} حكمًا — اضغط ليُفتح)</span>
          </summary>
          <div className="space-y-2 border-t border-line/60 p-3.5">
            {glossary.map((g) => (
              <div key={g.label} className="rounded-lg border border-line/70 bg-ink-900/60 p-2.5">
                <span className="text-[11px] font-semibold text-gold-200">{g.label}</span>
                <p className="mt-1 text-[10px] leading-relaxed text-slate-300">{g.note}</p>
              </div>
            ))}
          </div>
        </details>
      ) : null}
    </Panel>
  );
}
