'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { engineAlign, engineTranscribe } from '@/lib/engine';
import { Recorder, decodeBlobTo16k, makeDemoSamples } from '@/lib/audio';
import { browserSpeechAvailable, startBrowserSpeech } from '@/lib/browser-speech';
import { ayahLabel, classifyUtterance, loadCorpus, utteranceTokens } from '@/lib/corpus';
import { LiveTajweedTracker } from '@/lib/live';
import { editClose, matchTokens, scoreTranscriptMatch } from '@/lib/match';
import { BASMALA_WORDS, buildTarget, targetTextOf } from '@/lib/quran';
import { TEMPO_SCALE, analyzeTargetWords, analyzeWords } from '@/lib/tajweed';
import { priorCenter } from '@/lib/tempo';
import type { LiveSnapshot, LiveTextCheck, ModelEvent } from '@/lib/types';
import { fmtTime, waveThemeColors } from '@/lib/util';
import { wordViolation } from '@/lib/haptics';
import { useTahqiq } from '@/store';
import LiveCoach from './LiveCoach';
import ReciterListen from './ReciterListen';
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

/**
 * مهلة الإيقاف: يبقى الميكروفون يُغذّي المرافقة الحية والتسجيلَ هذه المدة بعد ضغط
 * «إيقاف» ثم يُختمان. فبين النطق ووصول الصوت إلى حلقة المستوى زمنٌ (مخزن الميكروفون
 * ومعالج الصوت، ويطول في الجوّال) — وكان الإيقاف الفوري يُسقط ذيل الكلمة الأخيرة
 * فيُقاس مدُّها ناقصًا («الكلمة الأخيرة قصيرةٌ دائمًا»)، ومن يضغط مع آخر حرفٍ يُتمّه فيها.
 */
const STOP_FLUSH_MS = 450;

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
  const instantEval = useTahqiq((s) => s.instantEval);
  const referenceOf = useTahqiq((s) => s.referenceOf);
  /** الإيقاف جارٍ (مهلة ختم الصوت) — يمنع بدء تسجيلٍ جديد قبل أن يُختم السابق */
  const stoppingRef = useRef(false);
  const [stopping, setStopping] = useState(false);

  const recRef = useRef<Recorder | null>(null);
  const browserSpeechRef = useRef<{ stop: () => void; text: () => string } | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const lastInputRef = useRef<{ samples: Float32Array; url: string | null; demo: boolean; browserTranscript?: string } | null>(null);
  const busyRef = useRef(false);
  const trackerRef = useRef<LiveTajweedTracker | null>(null);
  const livePushRef = useRef(0);
  /** هل حلقة المستوى اللحظية (١٠ م.ث) هي التي تُغذّي المتتبّع؟ */
  const levelLoopRef = useRef(false);
  /** رقم الجلسة: يُبطل تحسينًا خلفيًا قديمًا إن بدأ القارئ تسجيلًا جديدًا */
  const sessionRef = useRef(0);
  const [elapsed, setElapsed] = useState(0);
  const [hasLastInput, setHasLastInput] = useState(false);
  const [live, setLive] = useState<LiveSnapshot | null>(null);
  const liveWords = live ? live : null;
  /** التحقّق اللحظي من النصّ أثناء المرافقة الحية (بالسماع الذكي في العامل) */
  const [liveText, setLiveText] = useState<LiveTextCheck | null>(null);
  const liveTextRef = useRef<{
    busy: boolean;
    lastVoiced: number;
    lastEnd: number;
    heard: string[];
    strikes: number;
    fails: number;
    done: boolean;
    rebased: boolean;
  }>({ busy: false, lastVoiced: 0, lastEnd: 0, heard: [], strikes: 0, fails: 0, done: false, rebased: false });
  /** بداية جلسة المرافقة الحية (لربط نتيجة التحليل الكامل بها) ونصّ آيتها للمطابقة */
  const [liveStartedAt, setLiveStartedAt] = useState(0);
  /** بيانات جلسة المرافقة: نصّ المقطع المستهدف ومرجعه (لمطابقة المصحف كلّه) */
  const liveSessionRef = useRef<{ text: string; surahId: number; scope: 'ayah' | 'surah'; ayah: number }>({
    text: '',
    surahId: 0,
    scope: 'ayah',
    ayah: 1,
  });
  const result = useTahqiq((s) => s.result);
  const refining = useTahqiq((s) => s.refining);
  const modelStatus = useTahqiq((s) => s.modelStatus);

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
      recRef.current?.stopLevelLoop();
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
    const tjs = analyzeTargetWords(target.words, riwayah, tempo);
    livePushRef.current = 0;
    setLive(null);
    liveTextRef.current = { busy: false, lastVoiced: 0, lastEnd: 0, heard: [], strikes: 0, fails: 0, done: false, rebased: false };
    liveSessionRef.current = { text: targetTextOf(target), surahId: data.id, scope, ayah: selectedAyah };
    const ready = useTahqiq.getState().modelStatus === 'ready';
    setLiveText({ status: ready ? 'checking' : 'off', heard: 0, precision: 0, text: '' });
    // تهيئة فهرس المصحف للتحقّق اللحظي (هل المقروء هذه الآية أم غيرها أم كلامٌ عادي)
    if (ready) void loadCorpus().catch(() => {});
    setLiveStartedAt(Date.now());
    // مسطرة السرعة: سرعة القارئ المرجعي (المختار أو التلقائي بحسب المرتبة ونوع التلاوة)
    const { reciter } = referenceOf();
    trackerRef.current = new LiveTajweedTracker(
      tjs,
      target.words,
      tau,
      (e) => {
        const { alertOn: alerts } = useTahqiq.getState();
        // الأحكام الختامية (عند الإيقاف) تُعرض ولا تُهزّ: القارئ ضغط الإيقاف لتوّه — وكذلك البسملة قبل الآية
        if (!e.final && !e.prefix && alerts && (e.status === 'short' || e.status === 'long' || e.status === 'silent')) {
          wordViolation(e.status);
        }
        const t = trackerRef.current;
        if (t) setLive(t.snapshot()); // تحديث فوري عند إقفال كلمة
      },
      { center: priorCenter(reciter.pace, TEMPO_SCALE[tempo] ?? 1) },
    );
  }

  /**
   * التحقّق اللحظي من النصّ أثناء التسجيل: كل نحو ثانيةٍ ونصف من الصوت يُفرَّغ
   * ما استجدّ منه (مع تداخلٍ يسير) في العامل، ويُضمّ إلى ما سُمع قبله، ثم يُقاس
   * المسموع إلى الآية المختارة **وإلى المصحف كلّه**: فيُعلم هل المقروء هذه
   * الآية، أم آيةٌ أخرى (وتُسمّى)، أم كلامٌ عادي. إن تبيّن مرتين متتاليتين
   * أن المسموع ليس من الآية جُمّدت المرافقة: فهي إنما تُرافق هذه الآية، ولا
   * «تمرّ» تلاوةُ غيرها فيها — ولو كلمةً واحدة بدل كلمة (كـ«تفاحة» بدل «الم»).
   */
  function maybeLiveCheck(tracker: LiveTajweedTracker, rec: Recorder) {
    const st = liveTextRef.current;
    if (st.done || st.busy) return;
    const { modelStatus: ms, modelSize: size } = useTahqiq.getState();
    if (ms !== 'ready') return;
    const voiced = tracker.voiced;
    if (voiced - st.lastVoiced < 1500) return;
    if (rec.pcmSamples - st.lastEnd < 16000 * 1.2) return;
    const sess = liveSessionRef.current;
    if (!sess.text) return;
    st.busy = true;
    st.lastVoiced = voiced;
    const from = Math.max(0, Math.max(st.lastEnd - 8000, rec.pcmSamples - 16000 * 12));
    const win = rec.pcm16k(from);
    st.lastEnd = rec.pcmSamples;
    engineTranscribe(win, size)
      .then(async (text) => {
        if (trackerRef.current !== tracker || st.done) return;
        const toks = matchTokens(text);
        // تداخل النافذتين: قد تتكرّر آخر كلمةٍ مسموعة في أول النافذة التالية
        const last = st.heard[st.heard.length - 1];
        if (last && toks.length && (toks[0] === last || editClose(toks[0], last))) toks.shift();
        st.heard.push(...toks);
        const heardText = st.heard.join(' ');
        const sc = scoreTranscriptMatch(heardText, sess.text);
        const heardN = sc.predWords.filter((w) => !w.prefix).length;
        // الضوء لا يتخلّف عمّا أثبت السماعُ أنه قُرئ: آخرُ كلمةٍ من الآية سُمعت
        // (بالترتيب) وقد سُمع قبلها معظمُ ما قبلها — فلا تقفز به كلمةٌ مكرَّرة شاردة
        {
          let hits = 0;
          let upTo = 0;
          sc.targetHit.forEach((hit, j) => {
            if (!hit) return;
            hits++;
            if (hits >= 0.6 * (j + 1)) upTo = j + 1;
          });
          if (upTo) tracker.noteHeard(upTo);
        }
        // ابتدأ القارئ بالبسملة وليست من الآية: تُقدَّم على كلمات المرافقة وتُعاد المطابقة
        if (sc.basmalaPrefix && !st.rebased) {
          st.rebased = true;
          const prefixWords = BASMALA_WORDS.map((w) => ({ word: w, ayah: selectedAyah }));
          tracker.rebase(analyzeTargetWords(prefixWords, riwayah, tempo), prefixWords);
          setLive(tracker.snapshot());
        }
        // تمييز المسموع بمطابقة المصحف كلّه: الآية / آية أخرى / كلام عادي
        let kind: LiveTextCheck['kind'] | undefined;
        let otherLabel: string | undefined;
        try {
          const corpus = await loadCorpus();
          if (trackerRef.current !== tracker || st.done) return;
          const ident = classifyUtterance(corpus, utteranceTokens(heardText), sess.text, {
            targetMatch: sc.match,
            isTarget: (s, a) => s === sess.surahId && (sess.scope === 'surah' || a === sess.ayah),
          });
          kind = ident.kind;
          if (ident.kind === 'quran' && ident.best) otherLabel = ayahLabel(ident.best);
        } catch {
          /* إن تعذّر فهرس المصحف فالقاعدة القديمة (الدقّة) تكفي */
        }
        // عدد كلمات الآية المستهدفة: في القصار (١–٣) يكفي إنذارٌ واحد للتجميد
        // (فـ«تفاحة» بدل «الم» لا تنتظر ضربتين).
        const targetN = sess.text.split(/\s+/).filter(Boolean).length || 1;
        const freezeAfter = targetN <= 3 ? 1 : 2;
        let status: LiveTextCheck['status'];
        if (!heardN) {
          status = 'checking';
        } else if (kind === 'quran') {
          // المقروء آيةٌ أخرى — إنذارٌ ثم تجميد
          st.strikes++;
          status = st.strikes >= freezeAfter ? 'other' : 'warn';
        } else if (kind === 'speech' && (heardN >= 1 || sc.match < 0.15)) {
          // كلامٌ عاديٌّ ليس من القرآن — ولو كلمةً واحدة بدل كلمة من الآية
          st.strikes++;
          status = st.strikes >= freezeAfter ? 'other' : 'warn';
        } else if (kind === 'target' || sc.precision >= 0.5) {
          st.strikes = 0;
          status = heardN >= Math.min(2, targetN) ? 'same' : 'checking';
        } else if (sc.precision < 0.34 && heardN >= 1) {
          st.strikes++;
          status = st.strikes >= freezeAfter ? 'other' : 'warn';
        } else if (heardN < Math.min(2, targetN)) {
          status = 'checking';
        } else {
          status = 'unsure';
        }
        if (status === 'other') {
          st.done = true;
          tracker.freeze();
          if (useTahqiq.getState().alertOn) wordViolation('silent');
          setLive(tracker.snapshot());
        }
        setLiveText({ status, heard: heardN, precision: sc.precision, text: heardText, kind, otherLabel });
      })
      .catch((e) => {
        console.warn('[TAHQIQQ] live text check failed:', e);
        if (++st.fails >= 2) {
          st.done = true;
          setLiveText({ status: 'off', heard: 0, precision: 0, text: '' });
        }
      })
      .finally(() => {
        st.busy = false;
      });
  }

  /** التحليل الكامل (بالسماع الذكي إن كان مُجهَّزًا) — يحجز الواجهة حتى ينتهي */
  async function runAnalysis(input: { samples: Float32Array; url: string | null; demo: boolean; browserTranscript?: string }) {
    if (!data || busyRef.current) return;
    busyRef.current = true;
    const session = ++sessionRef.current;
    lastInputRef.current = input;
    setHasLastInput(true);
    const target = buildTarget(data, scope, selectedAyah);
    setProcessing(true, input.demo ? 'محاكاة تلاوة للتجربة…' : 'تهيئة الصوت…');
    const { reciter } = referenceOf();
    try {
      const res = await engineAlign(
        input,
        { tau, modelSize, target, riwayah, tempo, browserTranscript: input.browserTranscript, reference: { id: reciter.id, name: reciter.name, pace: reciter.pace } },
        {
          stage: (s) => setProcessing(true, s),
          model: modelHook,
        },
      );
      if (sessionRef.current === session) setResult(res);
    } catch (e: any) {
      console.error('[TAHQIQQ] analysis failed:', e);
      useTahqiq.setState({ modelMessage: e?.message ?? 'حدث خطأ غير متوقع أثناء التحليل' });
    } finally {
      busyRef.current = false;
      if (sessionRef.current === session) setProcessing(false, '');
    }
  }

  /**
   * تقييم التلاوة — **نتيجةٌ واحدة لكل تسجيل**:
   *
   * كان «التقييم اللحظي» يُظهر نتيجةً فور الإيقاف ثم يستبدلها بعد ثوانٍ بنتيجة
   * التحليل الأدقّ — فكان القارئ يرى نتيجتين مختلفتين لا يدري أيّهما تُعتمد.
   * الآن: إن كان السماع الذكي جاهزًا (أو قيد التجهيز) جُلبت النتيجة الكاملة
   * مرةً واحدة؛ وإن لم يكن مُجهَّزًا اكتُفي بالنتيجة اللحظية وحدها (بلا
   * استبدالٍ لاحق) مع التنبيه إلى أنها غير معتمدةٍ حتى يُجهَّز السماع.
   * والمراجعة اليدوية متاحةٌ دائمًا بزرّ «إعادة تقييم آخر تسجيل».
   */
  async function evaluate(input: { samples: Float32Array; url: string | null; demo: boolean; browserTranscript?: string }) {
    if (!data || busyRef.current) return;
    const { modelStatus } = useTahqiq.getState();
    const fullOnce = !instantEval || input.demo || modelStatus === 'ready' || modelStatus === 'loading';
    if (fullOnce) {
      await runAnalysis(input);
      return;
    }
    // السماع الذكي غير مُجهَّز: نتيجةٌ لحظية واحدة (قياس الأزمنة وحده)
    busyRef.current = true;
    const session = ++sessionRef.current;
    lastInputRef.current = input;
    setHasLastInput(true);
    const target = buildTarget(data, scope, selectedAyah);
    setProcessing(true, 'قياس لحظي للأزمنة…');
    let quick = null;
    try {
      const { reciter } = referenceOf();
      quick = await engineAlign(
        input,
        { tau, modelSize, target, riwayah, tempo, fast: true, reference: { id: reciter.id, name: reciter.name, pace: reciter.pace } },
        { stage: () => {} },
      );
    } catch (e) {
      console.warn('[TAHQIQQ] instant pass failed:', e);
    }
    busyRef.current = false;
    if (sessionRef.current === session) setProcessing(false, '');
    if (!quick || sessionRef.current !== session) return;
    setResult(quick); // نتيجةٌ واحدة — لا يُستبدل بها شيء بعدها
  }

  async function onToggleRecord() {
    if (processing || stoppingRef.current) return;
    if (!recording) {
      const r = new Recorder();
      recRef.current = r;
      const pushLive = (tracker: LiveTajweedTracker) => {
        const now = performance.now();
        if (now - livePushRef.current > 80) {
          livePushRef.current = now;
          setLive(tracker.snapshot());
        }
      };
      r.onWave = (td) => {
        const c = canvasRef.current;
        if (c) drawLive(c, td);
        // احتياط: إن تعذّرت حلقة المستوى اللحظية غُذّي المتتبّع من إطار الرسم
        const tracker = trackerRef.current;
        if (tracker && !levelLoopRef.current) {
          let s = 0;
          for (let i = 0; i < td.length; i++) s += td[i] * td[i];
          tracker.feed(Math.sqrt(s / td.length), performance.now());
          pushLive(tracker);
        }
      };
      // المرافقة الحية: إطارات ١٠ م.ث متصلة — أدقّ في كشف حدود الكلمات
      r.onLevel = (rms, tMs) => {
        const tracker = trackerRef.current;
        if (!tracker) return;
        tracker.feed(rms, tMs);
        pushLive(tracker);
        maybeLiveCheck(tracker, r);
      };
      try {
        await r.start();
        startLiveSession();
        // قناة ثانية اختيارية: تعرّف المتصفح أفضل من Whisper في كثير من
        // الهواتف، خصوصًا فواتح السور. لا تُستعمل إن لم يدعمها المتصفح.
        browserSpeechRef.current = startBrowserSpeech(({ text }) => {
          const tracker = trackerRef.current;
          const sess = liveSessionRef.current;
          if (!tracker || !text || !sess.text) return;
          const sc = scoreTranscriptMatch(text, sess.text);
          let hits = 0;
          let upTo = 0;
          sc.targetHit.forEach((hit, j) => {
            if (hit) hits++;
            if (hit && hits >= 0.6 * (j + 1)) upTo = j + 1;
          });
          if (upTo) tracker.noteHeard(upTo);
          setLiveText({
            status: sc.precision >= 0.5 ? 'same' : sc.predWords.length ? 'warn' : 'checking',
            heard: sc.predWords.length,
            precision: sc.precision,
            text,
            kind: sc.precision >= 0.5 ? 'target' : 'unknown',
            source: 'browser',
          });
          setLive(tracker.snapshot());
          // لا نكتفي بنسبة الآية المختارة: افحص المصحف كله حتى نقول بدقة
          // «آية أخرى» أو «كلام عادي»، وهي المشكلة الأهم في الفواتح.
          void loadCorpus().then((corpus) => {
            if (trackerRef.current !== tracker) return;
            const ident = classifyUtterance(corpus, utteranceTokens(text), sess.text, {
              targetMatch: sc.match,
              isTarget: (s, a) => s === sess.surahId && (sess.scope === 'surah' || a === sess.ayah),
            });
            const otherLabel = ident.kind === 'quran' && ident.best ? ayahLabel(ident.best) : undefined;
            const enough = sc.predWords.length >= 1;
            setLiveText({
              status: ident.kind === 'target' ? 'same' : enough && (ident.kind === 'quran' || ident.kind === 'speech') ? 'warn' : 'checking',
              heard: sc.predWords.length,
              precision: sc.precision,
              text,
              kind: ident.kind,
              otherLabel,
              source: 'browser',
            });
          }).catch(() => {});
        });
        levelLoopRef.current = r.startLevelLoop();
        r.startWaveLoop();
        setRecording(true, null);
      } catch {
        setRecording(false, r.micError);
        recRef.current = null;
        trackerRef.current = null;
      }
    } else {
      const r = recRef.current;
      if (!r) return;
      // مهلة الختم: يُترك الميكروفون يُغذّي المرافقة والتسجيل قليلًا حتى يصل ذيلُ الصوت
      // (انظر STOP_FLUSH_MS) — ثم تُختم الكلمة الأخيرة بطولها الحقيقي.
      stoppingRef.current = true;
      setStopping(true);
      setRecording(false, null);
      await new Promise((res) => setTimeout(res, STOP_FLUSH_MS));
      stoppingRef.current = false;
      setStopping(false);
      const browserTranscript = browserSpeechRef.current?.text() ?? '';
      browserSpeechRef.current?.stop();
      browserSpeechRef.current = null;
      r.stopWaveLoop();
      r.stopLevelLoop();
      levelLoopRef.current = false;
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
        setProcessing(false, '');
        void evaluate({ samples, url, demo: false, browserTranscript });
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
      setProcessing(false, '');
      void evaluate({ samples, url, demo: false });
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
    () => (liveTarget && hasLive ? analyzeTargetWords(liveTarget.words, riwayah, tempo) : []),
    [liveTarget, hasLive, riwayah, tempo],
  );

  return (
    <Panel
      title="سجّل تلاوتك"
      subtitle={browserSpeechAvailable()
        ? 'اقرأ بوضوح — يقارن التطبيق تعرّف المتصفح مع Whisper ويعتمد الأدق (قد يرسل المتصفح الصوت إلى خدمة التعرّف التابعة له)'
        : 'اقرأ بصوت واضح وبهدوء — التحليل المحلي يعمل بـ Whisper على جهازك'}
    >
      {/* اسمع الآية من القارئ المعتمد ثم اقرأها — وتُخفى أثناء التسجيل لتعلو المرافقة */}
      {!recording ? <ReciterListen /> : null}

      {/* المرافقة الحية فوق زرّ الميكروفون: الكلمات تُضاء مع الصوت بلا تمرير الشاشة */}
      {liveWords && liveTarget && liveTarget.words.length ? (
        <LiveCoach
          snapshot={liveWords}
          words={liveTarget.words}
          tjs={liveTjs}
          recording={recording}
          alertOn={alertOn}
          onToggleAlerts={() => setAlertOn(!alertOn)}
          textCheck={liveText}
          finalText={
            result && !result.demo && result.targetKey === liveTarget.key && result.createdAt >= liveStartedAt
              ? result.textCheck
              : null
          }
          finalKind={
            result && !result.demo && result.targetKey === liveTarget.key && result.createdAt >= liveStartedAt
              ? result.textKind ?? null
              : null
          }
          finalOther={
            result && !result.demo && result.targetKey === liveTarget.key && result.createdAt >= liveStartedAt && result.heardOf
              ? ayahLabel(result.heardOf)
              : null
          }
          refining={refining}
          modelReady={modelStatus === 'ready'}
          className="mb-4 mt-0"
        />
      ) : null}

      <div className="flex items-start gap-4">
        <button
          onClick={() => void onToggleRecord()}
          disabled={processing || stopping}
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
                : stopping
                  ? 'جارٍ ختم التسجيل… (يُلتقط ذيل الكلمة الأخيرة)'
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
    </Panel>
  );
}
