'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { runAlignment } from '@/lib/alignment';
import { Recorder, decodeBlobTo16k, makeDemoSamples } from '@/lib/audio';
import { LiveTajweedTracker } from '@/lib/live';
import { buildTarget } from '@/lib/quran';
import { analyzeWords } from '@/lib/tajweed';
import type { LiveSnapshot, ModelEvent } from '@/lib/types';
import { fmtTime, waveThemeColors } from '@/lib/util';
import { wordViolation } from '@/lib/haptics';
import { useTahqiq } from '@/store';
import LiveCoach from './LiveCoach';
import { IconMic, IconRefresh, IconStop, IconUpload, IconWand, Panel } from './ui';

/* ---------- canvas painters ---------- */

function fitCanvas(c: HTMLCanvasElement): CanvasRenderingContext2D | null {
  const dpr = window.devicePixelRatio || 1;
  const w = c.clientWidth;
  const h = c.clientHeight;
  if (w === 0 || h === 0) return null;
  if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
    c.width = Math.round(w * dpr);
    c.height = Math.round(h * dpr);
  }
  const ctx = c.getContext('2d');
  if (!ctx) return null;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}

function drawIdle(c: HTMLCanvasElement) {
  const ctx = fitCanvas(c);
  if (!ctx) return;
  const w = c.clientWidth;
  const h = c.clientHeight;
  ctx.clearRect(0, 0, w, h);
  ctx.strokeStyle = waveThemeColors().idle;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let x = 0; x <= w; x += 4) {
    const y = h / 2 + Math.sin(x * 0.05) * 2;
    if (x === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
}

function drawLive(c: HTMLCanvasElement, td: Float32Array) {
  const ctx = fitCanvas(c);
  if (!ctx) return;
  const w = c.clientWidth;
  const h = c.clientHeight;
  ctx.clearRect(0, 0, w, h);
  ctx.strokeStyle = waveThemeColors().center;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, h / 2);
  ctx.lineTo(w, h / 2);
  ctx.stroke();
  const grad = ctx.createLinearGradient(0, 0, w, 0);
  grad.addColorStop(0, 'rgba(16,185,129,0.9)');
  grad.addColorStop(0.5, 'rgba(212,175,55,0.95)');
  grad.addColorStop(1, 'rgba(16,185,129,0.9)');
  ctx.strokeStyle = grad;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  const step = Math.max(1, Math.floor(td.length / w));
  for (let x = 0; x < w; x++) {
    const v = td[Math.min(td.length - 1, x * step)] ?? 0;
    const y = h / 2 + v * h * 0.47;
    if (x === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
}

/* ---------- component ---------- */

export default function RecorderPanel() {
  const data = useTahqiq((s) => s.surahCache[s.selectedSurahId] ?? null);
  const scope = useTahqiq((s) => s.scope);
  const selectedAyah = useTahqiq((s) => s.selectedAyah);
  const riwayah = useTahqiq((s) => s.riwayah);
  const tempo = useTahqiq((s) => s.tempo);
  const modelSize = useTahqiq((s) => s.modelSize);
  const tau = useTahqiq((s) => s.tau);
  const recording = useTahqiq((s) => s.recording);
  const micError = useTahqiq((s) => s.micError);
  const setRecording = useTahqiq((s) => s.setRecording);
  const processing = useTahqiq((s) => s.processing);
  const setProcessing = useTahqiq((s) => s.setProcessing);
  const setResult = useTahqiq((s) => s.setResult);
  const alertOn = useTahqiq((s) => s.alertOn);
  const setAlertOn = useTahqiq((s) => s.setAlertOn);

  const recRef = useRef<Recorder | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const lastInputRef = useRef<{ samples: Float32Array; url: string | null; demo: boolean } | null>(null);
  const busyRef = useRef(false);
  const trackerRef = useRef<LiveTajweedTracker | null>(null);
  const livePushRef = useRef(0);
  const [elapsed, setElapsed] = useState(0);
  const [hasLastInput, setHasLastInput] = useState(false);
  const [live, setLive] = useState<LiveSnapshot | null>(null);
  const liveWords = live ? live : null;

  useEffect(() => {
    const c = canvasRef.current;
    if (c) drawIdle(c);
  }, []);

  useEffect(() => {
    if (!recording) return;
    setElapsed(0);
    const t0 = performance.now();
    const id = window.setInterval(() => setElapsed(performance.now() - t0), 100);
    return () => window.clearInterval(id);
  }, [recording]);

  useEffect(
    () => () => {
      recRef.current?.stopWaveLoop();
    },
    [],
  );

  // تغيير المقاطع أثناء التسجيل → تُبنى جلسة المرافقة الحية للمقاطع الجديدة
  const targetKey = `${data?.id ?? 0}:${scope}:${selectedAyah}:${riwayah}:${tempo}`;
  useEffect(() => {
    if (recording) startLiveSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetKey]);

  const modelHook = (e: ModelEvent) => {
    if (e.status === 'loading') useTahqiq.setState({ modelStatus: 'loading', modelProgress: e.progress ?? 0 });
    else if (e.status === 'ready') useTahqiq.setState({ modelStatus: 'ready', modelProgress: 1, modelMessage: null });
    else if (e.status === 'error') useTahqiq.setState({ modelStatus: 'error', modelMessage: e.message ?? null });
  };

  /** بدء جلسة المرافقة الحية: متتبِّع يحكم كل كلمة لحظة انتهائها */
  function startLiveSession() {
    if (!data) return;
    const target = buildTarget(data, scope, selectedAyah);
    if (!target.words.length) return;
    const tjs = analyzeWords(target.words.map((w) => w.word), riwayah, tempo);
    livePushRef.current = 0;
    setLive(null);
    trackerRef.current = new LiveTajweedTracker(tjs, target.words, tau, (e) => {
      const { alertOn: alerts } = useTahqiq.getState();
      if (alerts && (e.status === 'short' || e.status === 'long' || e.status === 'silent')) {
        wordViolation(e.status);
      }
      const t = trackerRef.current;
      if (t) setLive(t.snapshot()); // تحديث فوري عند إقفال كلمة
    });
  }

  async function runAnalysis(input: { samples: Float32Array; url: string | null; demo: boolean }) {
    if (!data || busyRef.current) return;
    busyRef.current = true;
    lastInputRef.current = input;
    setHasLastInput(true);
    const target = buildTarget(data, scope, selectedAyah);
    setProcessing(true, input.demo ? 'محاكاة تلاوة للتجربة…' : 'تهيئة الصوت…');
    try {
      const res = await runAlignment(
        input,
        { tau, modelSize, target, riwayah, tempo },
        {
          stage: (s) => setProcessing(true, s),
          model: modelHook,
        },
      );
      setResult(res);
    } catch (e: any) {
      console.error('[TAHQIQQ] analysis failed:', e);
      useTahqiq.setState({ modelMessage: e?.message ?? 'حدث خطأ غير متوقع أثناء التحليل' });
    } finally {
      busyRef.current = false;
      setProcessing(false, '');
    }
  }

  async function onToggleRecord() {
    if (processing) return;
    if (!recording) {
      const r = new Recorder();
      recRef.current = r;
      r.onWave = (td) => {
        const c = canvasRef.current;
        if (c) drawLive(c, td);
        // المرافقة الحية: طاقة الإطار تُغذّي المتتبِّع (rms من العيّنة الزمنية)
        const tracker = trackerRef.current;
        if (tracker) {
          let s = 0;
          for (let i = 0; i < td.length; i++) s += td[i] * td[i];
          const rms = Math.sqrt(s / td.length);
          tracker.feed(rms, performance.now());
          const now = performance.now();
          if (now - livePushRef.current > 90) {
            livePushRef.current = now;
            setLive(tracker.snapshot());
          }
        }
      };
      try {
        await r.start();
        r.startWaveLoop();
        startLiveSession();
        setRecording(true, null);
      } catch {
        setRecording(false, r.micError);
        recRef.current = null;
        trackerRef.current = null;
      }
    } else {
      const r = recRef.current;
      if (!r) return;
      r.stopWaveLoop();
      setRecording(false, null);
      trackerRef.current?.finish();
      const snap = trackerRef.current?.snapshot() ?? null;
      if (snap) setLive(snap);
      trackerRef.current = null;
      const blob = await r.stop();
      recRef.current = null;
      if (!blob || blob.size === 0) return;
      try {
        setProcessing(true, 'قراءة التسجيل…');
        const samples = await decodeBlobTo16k(blob);
        const url = URL.createObjectURL(blob);
        void runAnalysis({ samples, url, demo: false });
      } catch {
        setProcessing(false, '');
        setRecording(false, 'تعذّرت قراءة التسجيل');
      }
    }
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f || processing) return;
    try {
      setProcessing(true, 'قراءة الملف الصوتي…');
      const samples = await decodeBlobTo16k(f);
      const url = URL.createObjectURL(f);
      void runAnalysis({ samples, url, demo: false });
    } catch {
      setProcessing(false, '');
      setRecording(false, 'تعذّرت قراءة الملف الصوتي');
    }
  }

  function onDemo() {
    if (!data || processing) return;
    const target = buildTarget(data, scope, selectedAyah);
    const tjs = analyzeWords(target.words.map((w) => w.word), riwayah);
    const samples = makeDemoSamples(tjs);
    void runAnalysis({ samples, url: null, demo: true });
  }

  function onRerun() {
    const li = lastInputRef.current;
    if (!li || processing) return;
    void runAnalysis(li);
  }

  // كلمات الجلسة الحية (تُبنى عند البدء وتُحفظ للعرض بعد الإيقاف)
  const liveTarget = useMemo(
    () => (data ? buildTarget(data, scope, selectedAyah) : null),
    [data, scope, selectedAyah],
  );
  const hasLive = !!liveWords;
  const liveTjs = useMemo(
    () => (liveTarget && hasLive ? analyzeWords(liveTarget.words.map((w) => w.word), riwayah, tempo) : []),
    [liveTarget, hasLive, riwayah, tempo],
  );

  return (
    <Panel
      title="سجّل تلاوتك"
      subtitle="اقرأ بصوت واضح وبهدوء — يُعالَج صوتك على جهازك ولا يُرفَع إلى الإنترنت أبدًا"
    >
      <div className="flex items-start gap-4">
        <button
          onClick={() => void onToggleRecord()}
          disabled={processing}
          aria-label={recording ? 'إيقاف التسجيل' : 'بدء التسجيل'}
          className={`relative flex h-20 w-20 shrink-0 items-center justify-center rounded-full border-2 transition disabled:opacity-50 ${
            recording
              ? 'recording-ring border-danger-500 bg-danger-500/20'
              : 'border-gold-500/60 bg-gold-500/10 hover:bg-gold-500/20'
          }`}
        >
          {recording ? <IconStop className="h-7 w-7 text-danger-400" /> : <IconMic className="h-8 w-8 text-gold-400" />}
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-300">
              {recording
                ? 'جارٍ التسجيل… (اضغط للإيقاف) — الكلمات تُضاء مع صوتك بالأسفل'
                : processing
                  ? 'جارٍ التحليل…'
                  : 'اضغط لبدء تسجيل التلاوة'}
            </span>
            <span className="font-brand text-sm font-semibold text-gold-300" dir="ltr">
              {fmtTime(elapsed)}
            </span>
          </div>
          <canvas ref={canvasRef} className="mt-2 h-20 w-full rounded-lg border border-line bg-ink-950/80" />
          <p className="mt-2 text-[10px] leading-relaxed text-slate-500">
            {micError ?? (recording ? 'يُسجَّل صوتك الآن — اضغط الزر الأحمر عند الانتهاء.' : 'المخطط يعرض صوتك مباشرةً من الميكروفون.')}
          </p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2.5">
        <label className="btn-secondary cursor-pointer disabled:opacity-50">
          <IconUpload className="h-4 w-4" /> رفع ملفّ صوتي
          <input type="file" accept="audio/*" className="hidden" onChange={(e) => void onFile(e)} disabled={processing} />
        </label>
        <button onClick={onDemo} disabled={processing || !data} className="btn-secondary disabled:opacity-50">
          <IconWand className="h-4 w-4" /> تجربة سريعة (محاكاة)
        </button>
        <button onClick={onRerun} disabled={processing || !hasLastInput} className="btn-secondary col-span-2 disabled:opacity-40">
          <IconRefresh className="h-4 w-4" /> إعادة تقييم آخر تسجيل بالإعدادات الحالية
        </button>
      </div>

      {/* المرافقة الحية: أثناء التسجيل وتبقى لمراجعتها بعد الإيقاف */}
      {liveWords && liveTarget && liveTarget.words.length ? (
        <LiveCoach
          snapshot={liveWords}
          words={liveTarget.words}
          tjs={liveTjs}
          recording={recording}
          alertOn={alertOn}
          onToggleAlerts={() => setAlertOn(!alertOn)}
        />
      ) : null}
    </Panel>
  );
}
