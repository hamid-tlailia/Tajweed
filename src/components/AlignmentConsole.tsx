'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { energyEnvelope } from '@/lib/audio';
import { fmtSec, fmtTime } from '@/lib/util';
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

/* ---------- violation alert (vibration + beep) ---------- */

let alertCtx: AudioContext | null = null;
function ensureAlertAudio(): AudioContext | null {
  try {
    if (!alertCtx) {
      const AC = window.AudioContext || (window as any).webkitAudioContext;
      if (!AC) return null;
      alertCtx = new AC();
    }
    if (alertCtx.state === 'suspended') void alertCtx.resume();
    return alertCtx;
  } catch {
    return null;
  }
}
function beep(freq: number, ms = 90, gainV = 0.05) {
  const ctx = ensureAlertAudio();
  if (!ctx) return;
  try {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.value = freq;
    g.gain.value = gainV;
    o.connect(g).connect(ctx.destination);
    o.start();
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + ms / 1000);
    o.stop(ctx.currentTime + ms / 1000 + 0.02);
  } catch {
    /* noop */
  }
}
function fireAlert(status: string) {
  if (!navigator.vibrate) return;
  navigator.vibrate(status === 'silent' ? [70, 50, 70] : [45, 35, 45]);
}

export default function AlignmentConsole() {
  const result = useTahqiq((s) => s.result);
  const processing = useTahqiq((s) => s.processing);
  const stage = useTahqiq((s) => s.stage);
  const activeWord = useTahqiq((s) => s.activeWord);
  const setActiveWord = useTahqiq((s) => s.setActiveWord);
  const alertOn = useTahqiq((s) => s.alertOn);
  const setAlertOn = useTahqiq((s) => s.setAlertOn);

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
    for (let i = 0; i < n; i++) {
      const v = energy[i] / max;
      const bh = Math.max(2, v * (h - 10));
      ctx.fillStyle = i / n <= progress ? 'rgba(212,175,55,0.9)' : 'rgba(100,116,139,0.28)';
      ctx.fillRect(i * bw, (h - bh) / 2, Math.max(1, bw - 0.6), bh);
    }
    ctx.fillStyle = 'rgba(241,220,155,0.9)';
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
      // violation alert: vibrate + beep when the playhead lands on a flawed word
      const w = idx >= 0 ? result.words[idx] : null;
      if (w && alertOn && (w.status === 'short' || w.status === 'long' || w.status === 'silent')) {
        fireAlert(w.status);
        beep(w.status === 'silent' ? 392 : 880);
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

  /* ---------------- states ---------------- */

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
              اختر السورة والآية من الأعلى، ثم اضغط زرّ الميكروفون وسجّل تلاوتك — أو اضغط{' '}
              <b className="text-gold-300">«تجربة سريعة»</b> لترى مثالًا جاهزًا دون تسجيل.
            </p>
          </div>
      </Panel>
    );
  }

  const scoreTone = result.overallScore >= 70 ? 'mint' : result.overallScore >= 50 ? 'warn' : 'danger';
  const rows = result.words.slice(0, MAX_ROWS);

  // فهرس شروح الأحكام التي ظهرت في هذه التلاوة (يُفتح باللمس)
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
    <Panel
      title="نتيجة التلاوة"
      subtitle={`${result.targetLabel} — ${result.verdict}`}
      className="fade-up"
    >
      {result.audioUrl ? <audio ref={audioRef} src={result.audioUrl} className="hidden" preload="auto" /> : null}

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
          title={alertOn ? 'التنبيه بالاهتزاز والصوت عند المخالفة: مفعّل — اضغط للإيقاف' : 'التنبيه بالاهتزاز والصوت عند المخالفة: متوقف — اضغط للتفعيل'}
          aria-label="تنبيه المخالفات"
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border text-sm transition ${
            alertOn ? 'border-gold-500/60 bg-gold-500/15 text-gold-300' : 'border-line bg-ink-900/60 text-slate-600'
          }`}
        >
          📳
        </button>
      </div>

      {/* summary stats */}
      <div className="mt-3 grid grid-cols-2 gap-2.5 md:grid-cols-4">
        <Stat label="الدرجة الكلية" value={`${result.overallScore}%`} tone={scoreTone} sub="يجمع دقةَ النطق وصحةَ المدود والغنن" />
        <Stat
          label="مطابقة ما قرأته"
          value={`${Math.round(result.transcriptMatch * 100)}%`}
          tone="gold"
          sub="مدى تطابق ما قرأتَه مع الآية"
        />
        <Stat label="مدة التلاوة" value={fmtTime(result.durationMs)} sub="من بداية التسجيل لنهايته" />
        <Stat
          label="طريقة التقييم"
          value={<span className="text-[13px]">{ENGINE_LABEL[result.engine]}</span>}
          tone="slate"
          sub={result.demo ? 'محاكاة للتجربة — بلا ميكروفون' : 'على جهازك دون إنترنت'}
        />
      </div>

      {/* transcript diff */}
      {result.transcript ? (
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

      {/* بطاقات الكلمات — عرض الجوّال (بلا تمرير أفقي) */}
      <div className="mt-3 space-y-2 md:hidden">
        {rows.map((w, i) => {
          const newAyah = i === 0 || result.words[i].ayah !== result.words[i - 1].ayah;
          return (
            <div
              key={i}
              className={`rounded-xl border p-3 transition-colors ${
                activeWord === i ? 'border-gold-500/60 bg-gold-500/10' : 'border-line bg-ink-850/60'
              }`}
            >
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
                <span className="text-slate-500">كلمة {i + 1} من {result.words.length}</span>
              </div>
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
                  activeWord === i ? 'bg-gold-500/10' : i % 2 === 1 ? 'bg-ink-900/40' : ''
                }`}
              >
                <td className="px-3 py-2 font-brand text-slate-500">{i + 1}</td>
                <td className="whitespace-nowrap px-3 py-2">
                  <span className="font-quran text-lg text-gold-100">{w.word}</span>
                  {i === 0 || result.words[i].ayah !== result.words[i - 1].ayah ? (
                    <span className="ms-2 font-brand text-[9px] text-slate-500">آية {w.ayah}</span>
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
                    <span className="block space-y-1.5">
                      {w.tajweed.rules.map((r, k) => (
                        <span key={k} className="block rounded-lg border border-line bg-ink-900/70 p-2">
                          <Badge tone={r.tone}>{r.label}</Badge>
                          {r.note ? (
                            <span className="mt-1 block text-[10px] leading-relaxed text-slate-300">{r.note}</span>
                          ) : null}
                        </span>
                      ))}
                      <button
                        type="button"
                        onClick={() => setOpenRow(null)}
                        className="text-[10px] text-slate-400 underline decoration-dotted"
                      >
                        إغلاق الشرح
                      </button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setOpenRow(i)}
                      className="flex flex-wrap items-center gap-1 text-start"
                      aria-label="إظهار شرح الأحكام"
                    >
                      {w.tajweed.rules.length ? (
                        w.tajweed.rules.slice(0, 3).map((r, k) => (
                          <Badge key={k} tone={r.tone}>
                            {r.label}
                          </Badge>
                        ))
                      ) : (
                        <span className="text-slate-600">—</span>
                      )}
                      {w.tajweed.rules.length > 3 ? (
                        <span className="text-[9px] text-slate-500">+{w.tajweed.rules.length - 3}</span>
                      ) : null}
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

      {/* دليل الأحكام — يُفتح بلمسة، ويجمع كل حكم ظهر في تلاوتك */}
      {glossary.length ? (
        <details className="mt-3 rounded-xl border border-line bg-ink-850/50">
          <summary className="cursor-pointer list-none px-3.5 py-3 text-[11px] font-semibold text-gold-200">
            دليل الأحكام في هذه التلاوة
            <span className="ms-2 text-[10px] font-normal text-slate-500">
              ({glossary.length} حكمًا — اضغط ليُفتح)
            </span>
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
