// TAHQĪQ — audio I/O: microphone recorder, 16k mono decode, energy envelope, demo synthesis

import type { WordTajweed } from './types';
import { mulberry32 } from './util';

/** إطار مستوى لحظي: جذر متوسط المربعات وطابعٌ زمني بالملي ثانية */
export interface LevelFrame {
  rms: number;
  tMs: number;
}

export class Recorder {
  private stream: MediaStream | null = null;
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private srcNode: MediaStreamAudioSourceNode | null = null;
  private proc: ScriptProcessorNode | null = null;
  private rec: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private raf = 0;

  onWave: ((td: Float32Array) => void) | null = null;
  /**
   * مستوياتٌ لحظية بإطارات ١٠ م.ث — وهي ما يُغذّى به المتتبّع الحيّ. وحلقة
   * الرسم (onWave) أبطأ وأسمك (٤٣ م.ث لكل إطار، ومعدّلها معدّل الرسم)، فلا
   * تكفي لكشف حدود الكلمات في التلاوة المتصلة.
   */
  onLevel: ((rms: number, tMs: number) => void) | null = null;
  micError: string | null = null;

  /**
   * الصوت الخام أثناء التسجيل بمعدّل ١٦ كيلوهرتز (مدخل Whisper) — يُجمَع من حلقة
   * المستوى نفسها، فيمكن **الاستماع أثناء التسجيل** (التحقّق اللحظي من النصّ)
   * دون انتظار ملفّ التسجيل النهائي.
   */
  private pcmChunks: Float32Array[] = [];
  private pcmLen = 0;
  private resamplePos = 0; // موضع القراءة الكسري في مدخل المعدّل الأصلي
  private resampleLast = 0; // آخر عيّنة من الدفعة السابقة (للاستيفاء الخطّي عبر الحدود)

  /** طول الصوت المجموع (بالعيّنات عند ١٦ كيلوهرتز) */
  get pcmSamples(): number {
    return this.pcmLen;
  }

  /** نسخة من الصوت المجموع حتى الآن (١٦ كيلوهرتز أحادي) — أو من عيّنةٍ معيّنة */
  pcm16k(from = 0): Float32Array {
    const out = new Float32Array(Math.max(0, this.pcmLen - from));
    let o = 0;
    let pos = 0;
    for (const c of this.pcmChunks) {
      const start = Math.max(0, from - pos);
      if (start < c.length) {
        out.set(start ? c.subarray(start) : c, o);
        o += c.length - start;
      }
      pos += c.length;
    }
    return out;
  }

  /** تحويل دفعة إدخال (بمعدّل السياق) إلى ١٦ كيلوهرتز باستيفاءٍ خطّي وتخزينها */
  private pushPcm(inp: Float32Array, sr: number): void {
    const ratio = sr / 16000;
    if (ratio <= 1.0001 && ratio >= 0.9999) {
      this.pcmChunks.push(inp.slice());
      this.pcmLen += inp.length;
      return;
    }
    const out: number[] = [];
    let pos = this.resamplePos; // قد يكون سالبًا قليلًا (يشير إلى داخل الدفعة السابقة)
    while (pos < inp.length - 1) {
      const i0 = Math.floor(pos);
      const f = pos - i0;
      const a = i0 < 0 ? this.resampleLast : inp[i0];
      const b = inp[i0 + 1];
      out.push(a + (b - a) * f);
      pos += ratio;
    }
    this.resamplePos = pos - inp.length;
    this.resampleLast = inp[inp.length - 1];
    if (out.length) {
      this.pcmChunks.push(Float32Array.from(out));
      this.pcmLen += out.length;
    }
  }

  async start(): Promise<void> {
    this.micError = null;
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
      });
    } catch (e: any) {
      this.micError =
        e?.name === 'NotAllowedError'
          ? 'تم رفض إذن الميكروفون — استعمل «رفع ملفّ صوتي» أو «تجربة سريعة».'
          : 'الميكروفون غير متوفّر في هذه البيئة — استعمل «رفع ملفّ صوتي» أو «تجربة سريعة».';
      throw new Error('MIC_UNAVAILABLE');
    }
    const AC: typeof AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    this.ctx = new AC();
    if (this.ctx.state === 'suspended') await this.ctx.resume().catch(() => {});
    const srcNode = this.ctx.createMediaStreamSource(this.stream);
    this.srcNode = srcNode;
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0.55;
    srcNode.connect(this.analyser);

    const mime =
      ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'].find(
        (m) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m),
      ) ?? '';
    this.rec = new MediaRecorder(this.stream, mime ? { mimeType: mime } : undefined);
    this.chunks = [];
    this.pcmChunks = [];
    this.pcmLen = 0;
    this.resamplePos = 0;
    this.resampleLast = 0;
    this.rec.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data);
    };
    this.rec.start(250);
  }

  /**
   * بدء حلقة المستوى اللحظية (إطارات ١٠ م.ث متصلة لا تتخلّلها فجوات الرسم).
   * تُرجع false إن تعذّرت — وعندها يُكتفى بحلقة الرسم (onWave) بديلًا.
   */
  startLevelLoop(): boolean {
    const ctx = this.ctx as any;
    if (!ctx || !this.srcNode || typeof ctx.createScriptProcessor !== 'function') return false;
    try {
      const sr: number = ctx.sampleRate || 48000;
      const block = Math.max(64, Math.round(sr / 100)); // ١٠ م.ث
      const proc: ScriptProcessorNode = ctx.createScriptProcessor(2048, 1, 1);
      let carry = new Float32Array(0);
      proc.onaudioprocess = (e: AudioProcessingEvent) => {
        const inp = e.inputBuffer.getChannelData(0);
        this.pushPcm(inp, sr);
        const cb = this.onLevel;
        if (!cb) {
          e.outputBuffer.getChannelData(0).fill(0);
          return;
        }
        const buf = new Float32Array(carry.length + inp.length);
        buf.set(carry, 0);
        buf.set(inp, carry.length);
        const blocks = Math.floor(buf.length / block);
        const nowMs = performance.now();
        let off = 0;
        for (let b = 0; b < blocks; b++, off += block) {
          let sum = 0;
          for (let i = 0; i < block; i++) {
            const v = buf[off + i];
            sum += v * v;
          }
          // الطابع الزمني يُنسب إلى نهاية الدفعة، فتُحفظ ترتيب الإطارات وفروقها
          cb(Math.sqrt(sum / block), nowMs - (blocks - b - 1) * 10);
        }
        carry = buf.slice(off);
        if (carry.length > block * 4) carry = carry.slice(carry.length - block);
        const out = e.outputBuffer.getChannelData(0);
        out.fill(0); // لا يُعاد الصوت إلى السماعة (يمنع الارتجاع)
      };
      this.srcNode.connect(proc);
      const mute = ctx.createGain();
      mute.gain.value = 0;
      proc.connect(mute);
      mute.connect(ctx.destination);
      this.proc = proc;
      return true;
    } catch {
      return false;
    }
  }

  stopLevelLoop(): void {
    try {
      this.proc?.disconnect();
    } catch {
      /* noop */
    }
    if (this.proc) this.proc.onaudioprocess = null;
    this.proc = null;
    this.onLevel = null;
  }

  startWaveLoop(): void {
    const loop = () => {
      if (!this.analyser || !this.onWave) return;
      const td = new Float32Array(this.analyser.fftSize);
      this.analyser.getFloatTimeDomainData(td);
      this.onWave(td);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stopWaveLoop(): void {
    cancelAnimationFrame(this.raf);
  }

  stop(): Promise<Blob> {
    return new Promise((resolve) => {
      const r = this.rec;
      if (!r) {
        this.cleanup();
        resolve(new Blob());
        return;
      }
      r.onstop = () => {
        const blob = new Blob(this.chunks, { type: r.mimeType || 'audio/webm' });
        this.cleanup();
        resolve(blob);
      };
      try {
        r.stop();
      } catch {
        this.cleanup();
        resolve(new Blob(this.chunks));
      }
    });
  }

  private cleanup(): void {
    this.stopLevelLoop();
    this.stream?.getTracks().forEach((t) => t.stop());
    this.srcNode?.disconnect();
    this.ctx?.close().catch(() => {});
    this.stream = null;
    this.ctx = null;
    this.analyser = null;
    this.srcNode = null;
    this.rec = null;
  }
}

/** Decode any audio Blob → mono Float32Array @ 16kHz (Whisper input spec) */
export async function decodeBlobTo16k(blob: Blob): Promise<Float32Array> {
  const ab = await blob.arrayBuffer();
  const AC: typeof AudioContext = window.AudioContext || (window as any).webkitAudioContext;
  const ac = new AC();
  const buf = await ac.decodeAudioData(ab);
  await ac.close().catch(() => {});
  if (buf.sampleRate === 16000 && buf.numberOfChannels === 1) return (buf.getChannelData(0) as Float32Array).slice();
  const off = new OfflineAudioContext(1, Math.max(1600, Math.ceil(buf.duration * 16000)), 16000);
  const src = off.createBufferSource();
  src.buffer = buf;
  src.connect(off.destination);
  src.start(0);
  const rendered = await off.startRendering();
  return rendered.getChannelData(0);
}

/* ------------------------------------------------------------------ */
/* كشف الكلام: هل في التسجيل صوتُ إنسانٍ فعلًا؟                        */
/* ------------------------------------------------------------------ */
/*
 * عتبةُ الصوت/الصمت في `alignment.vadThreshold` **نسبيةٌ** بالضرورة (لتعمل مع
 * تسجيلٍ هادئ وآخر صاخب)، وهي لذلك تُخذل في تسجيلٍ ليس فيه إلا ضجيجُ الغرفة:
 * تصير «أرضيةُ الضجيج» نفسها مقياسَ «الكلام»، فيُعدّ الضجيجُ كلُّه صوتًا، ثم
 * يُوزَّع على كلمات الآية بأوزان أزمنتها المتوقَّعة، فتخرج أزمنةُ الكلمات
 * مطابقةً للمتوقَّع — وتُجاز تلاوةٌ لم يُقرأ فيها حرف.
 *
 * لذلك يُقاس هنا دليلٌ على **كلام الإنسان من بنية الصوت** لا من مستواه: فالمصوَّتُ
 * من الكلام دوريٌّ (نبرةٌ بين ٧٠ و٤٠٠ هرتز)، وذروةُ ارتباطه الذاتيّ **قمةٌ
 * ناتئة** عند زمن النبرة يسبقها انخفاض. وأمّا ضجيجُ الغرفة (ولو رفعه التضخيمُ
 * التلقائيّ في الهاتف) فارتباطُه يضمحلّ اضمحلالًا رتيبًا بلا قمة، والهمهمةُ
 * الكهربائيّة دوريةٌ لكن بلا ناتئ (لا يسبقها انخفاض)، والصمتُ التامّ لا إطارات
 * فيه أصلًا. فلا يُعدّ شيءٌ من ذلك كلامًا، ولو ملأ التسجيلَ كلَّه.
 */

/** قياس ظهور الكلام في تسجيل: كم منه صوت، وكم من هذا الصوت كلامُ إنسان */
export interface SpeechPresence {
  /** الزمن الذي جاوز عتبة الصوت النسبية (م.ث) — كما يقيسه محرّك المحاذاة */
  voicedMs: number;
  /** الزمن الذي يشبه كلام الإنسان بنيَةً لا مستوىً فحسب (م.ث) */
  speechMs: number;
  /** speechMs ÷ voicedMs (٠ إن لم يُسمع صوت) */
  speechRatio: number;
  /** أعلى مستوى إطارٍ بوحدة ديسيبل بالنسبة إلى المدى الكامل (dBFS) */
  peakDb: number;
  /** تباين مستويات الإطارات المسموعة بالديسيبل (الكلام ≥ ٦، والضجيج المستوي ≈ ٠) */
  modulationDb: number;
  /** أعلى ارتباطٍ ذاتيّ (وسيط الإطارات المُحلَّلة) — المصوَّت ≥ ٠٫٤ والضجيج ≈ ٠٫١٥ */
  harmonicity: number;
  /** هل في التسجيل كلامُ إنسانٍ بيّن؟ */
  hasSpeech: boolean;
  /** علّة الحكم — تُذكر في النتيجة وفي الاختبارات */
  reason: 'speech' | 'silent' | 'noise' | 'faint';
}

/** طول إطار قياس الكلام (م.ث) — كإطارات الطاقة في المحاذاة */
export const SPEECH_FRAME_MS = 20;
/** أدنى مستوى إطارٍ يُنظر في بنيته (≈ −٥٥ dBFS): دونه صمتٌ في كل جهاز */
const SPEECH_ABS_FLOOR = 0.0018;
/** أدنى ارتباطٍ ذاتيٍّ يُعدّ مصوَّتًا (الضجيج الأبيض ≈ ٠٫١٥ والورديّ ≈ ٠٫٣٩) */
const SPEECH_MIN_AC = 0.4;
/** وأدنى نتوءٍ لتلك الذروة: الضجيج يضمحلّ رتيبًا (نتوء ≈ ٠٫١) والهممةُ لا يسبقها انخفاض */
const SPEECH_MIN_PROMINENCE = 0.3;
/** مدى النبرة المقاس (عيّنات عند ١٦ كهرتز): ٧٠–٤٠٠ هرتز */
const AC_LAG_LO = 34; // نحو ٤٧٠ هرتز: يسع صوت المرأة والطفل
const AC_LAG_HI = 228;
/** أدنى زمن كلامٍ يُعدّ ظهورًا له (م.ث) */
const SPEECH_MIN_MS = 300;
/** وأدنى نسبةٍ من الصوت المسموع (فالحروف المهموسة والسكتات ليست مصوَّتة) */
const SPEECH_MIN_RATIO = 0.15;
/** أدنى مستوى ذروةٍ (dBFS) — صمتٌ رفَعَه التضخيم يبقى دونه غالبًا */
const SPEECH_MIN_PEAK_DB = -52;
/** أقصى عدد إطاراتٍ يُحلَّل طيفها الزمنيّ (التسجيلات الطوال: عيّنةٌ منها) */
const SPEECH_MAX_ANALYZED = 1200;

/**
 * قياس ظهور الكلام في التسجيل. لا يُغني عن عتبة الصوت النسبية في المحاذاة،
 * بل يُجيب سؤالًا آخر: **هل تكلّم أحدٌ أصلًا؟**
 */
export function speechPresence(samples: Float32Array, frameMs = SPEECH_FRAME_MS): SpeechPresence {
  const sr = 16000;
  const frame = Math.max(1, Math.round((sr * frameMs) / 1000));
  const nFrames = Math.floor(samples.length / frame);
  const none: SpeechPresence = {
    voicedMs: 0,
    speechMs: 0,
    speechRatio: 0,
    peakDb: -Infinity,
    modulationDb: 0,
    harmonicity: 0,
    hasSpeech: false,
    reason: 'silent',
  };
  if (!nFrames) return none;

  // مستويات الإطارات أولًا (ومنها العتبة النسبية، كما في المحاذاة تمامًا)
  const rms = new Float32Array(nFrames);
  let peak = 0;
  for (let i = 0; i < nFrames; i++) {
    let s = 0;
    const start = i * frame;
    for (let j = 0; j < frame; j++) {
      const v = samples[start + j] ?? 0;
      s += v * v;
    }
    const r = Math.sqrt(s / frame);
    rms[i] = r;
    if (r > peak) peak = r;
  }
  const peakDb = 20 * Math.log10(Math.max(peak, 1e-9));

  const sorted = Float32Array.from(rms).sort();
  const avg = (a: number, b: number) => {
    const lo = Math.max(0, Math.floor(a));
    const hi = Math.min(nFrames, Math.max(lo + 1, Math.ceil(b)));
    let s = 0;
    for (let i = lo; i < hi; i++) s += sorted[i];
    return s / (hi - lo);
  };
  const noiseFloor = avg(0, nFrames * 0.05);
  const speechLevel = avg(nFrames * 0.7, nFrames * 0.95);
  const relThr = Math.max(Math.min(Math.max(noiseFloor * 3, speechLevel * 0.15), speechLevel * 0.5), 1e-5);

  const candidates: number[] = [];
  const dbOfVoiced: number[] = [];
  let voicedFrames = 0;
  for (let i = 0; i < nFrames; i++) {
    if (rms[i] < relThr) continue;
    voicedFrames++;
    dbOfVoiced.push(20 * Math.log10(Math.max(rms[i], 1e-9)));
    if (rms[i] >= SPEECH_ABS_FLOOR) candidates.push(i);
  }
  // تسجيلٌ طويل: تُحلَّل عيّنةٌ متباعدة من الإطارات المرشَّحة
  const stride = candidates.length > SPEECH_MAX_ANALYZED ? Math.ceil(candidates.length / SPEECH_MAX_ANALYZED) : 1;

  let speechFrames = 0;
  let analyzed = 0;
  const acValues: number[] = [];
  for (let k = 0; k < candidates.length; k += stride) {
    const s = candidates[k] * frame;
    let e0 = 0;
    for (let j = 0; j < frame; j++) {
      const v = samples[s + j] ?? 0;
      e0 += v * v;
    }
    if (e0 <= 1e-12) continue;
    analyzed++;
    // الارتباط الذاتيّ المطبَّع في مدى النبرة، وأدنى قيمةٍ قبل الذروة (نتوءُها)
    let bestLag = -1;
    let bestVal = -2;
    const r: number[] = new Array(AC_LAG_HI + 1).fill(0);
    for (let lag = 1; lag <= AC_LAG_HI; lag++) {
      let num = 0;
      let e1 = 0;
      for (let j = 0; j + lag < frame; j++) {
        const a = samples[s + j] ?? 0;
        const b = samples[s + j + lag] ?? 0;
        num += a * b;
        e1 += b * b;
      }
      r[lag] = num / Math.sqrt(e0 * Math.max(e1, 1e-12));
      if (lag >= AC_LAG_LO && r[lag] > bestVal) {
        bestVal = r[lag];
        bestLag = lag;
      }
    }
    if (bestLag < 0) continue;
    acValues.push(bestVal);
    let dip = 2;
    for (let lag = Math.max(1, bestLag - 30); lag < bestLag; lag++) dip = Math.min(dip, r[lag]);
    if (bestVal >= SPEECH_MIN_AC && bestVal - dip >= SPEECH_MIN_PROMINENCE) speechFrames++;
  }

  const speechMs = speechFrames * stride * frameMs;
  const voicedMs = voicedFrames * frameMs;
  const speechRatio = voicedFrames > 0 ? Math.min(1, (speechFrames * stride) / voicedFrames) : 0;
  const harmonicity = acValues.length ? acValues.sort((a, b) => a - b)[acValues.length >> 1] : 0;
  let modulationDb = 0;
  if (dbOfVoiced.length > 4) {
    const m = dbOfVoiced.reduce((a, b) => a + b, 0) / dbOfVoiced.length;
    modulationDb = Math.sqrt(dbOfVoiced.reduce((a, b) => a + (b - m) * (b - m), 0) / dbOfVoiced.length);
  }

  const hasSpeech = speechMs >= SPEECH_MIN_MS && speechRatio >= SPEECH_MIN_RATIO && peakDb >= SPEECH_MIN_PEAK_DB;
  const reason: SpeechPresence['reason'] = hasSpeech
    ? 'speech'
    : voicedMs <= 0
      ? 'silent'
      : peakDb < SPEECH_MIN_PEAK_DB
        ? 'faint'
        : 'noise';
  return { voicedMs, speechMs, speechRatio, peakDb, modulationDb, harmonicity, hasSpeech, reason };
}

/** RMS energy envelope at 40ms frames (= Whisper encoder frame rate, 25 fps) */
export function energyEnvelope(samples: Float32Array, frameMs = 40): Float32Array {
  const sr = 16000;
  const frame = Math.max(1, Math.round((sr * frameMs) / 1000));
  const n = Math.max(1, Math.floor(samples.length / frame));
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    const start = i * frame;
    for (let j = 0; j < frame; j++) {
      const v = samples[start + j] ?? 0;
      s += v * v;
    }
    out[i] = Math.sqrt(s / frame);
  }
  return out;
}

/**
 * Demo mode: synthesize a plausible recitation-like 16kHz signal whose word
 * boundaries & durations follow the tajweed model (with realistic variation),
 * so the full pipeline can be exercised without a microphone.
 */
export function makeDemoSamples(tjs: WordTajweed[], seed = 20260918): Float32Array {
  const sr = 16000;
  const rng = mulberry32(seed);
  const parts: Float32Array[] = [];
  for (const tj of tjs) {
    const durSec = (tj.expectedMs * (0.78 + rng() * 0.5)) / 1000;
    const n = Math.max(Math.floor(sr * 0.12), Math.floor(durSec * sr));
    const seg = new Float32Array(n);
    const f0 = 105 + rng() * 110;
    const f1 = 240 + rng() * 260;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const env = Math.pow(Math.sin((Math.PI * i) / n), 0.7);
      const vib = 1 + 0.08 * Math.sin(2 * Math.PI * 4.5 * t);
      let v = 0;
      for (let h = 1; h <= 4; h++) v += Math.sin(2 * Math.PI * f0 * h * vib * t) / h;
      v += 0.35 * Math.sin(2 * Math.PI * f1 * t) * Math.sin((Math.PI * t) / Math.max(1e-6, durSec));
      seg[i] = v * env * 0.3 + (rng() - 0.5) * 0.025;
    }
    parts.push(seg);
    const gapSec = 0.055 + rng() * 0.075;
    parts.push(new Float32Array(Math.floor(gapSec * sr)).fill(0));
  }
  const total = parts.reduce((a, b) => a + b.length, 0);
  const out = new Float32Array(total);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}
