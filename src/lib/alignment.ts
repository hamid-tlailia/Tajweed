// TAHQĪQ — forced alignment engine (orchestrator)
//
// Engine chain (automatic fallback on any failure):
//   1. whisper-attn   — Whisper (ONNX/WASM) teacher-forced pass + cross-attention timing
//   2. whisper-energy — Whisper transcription (similarity) + energy-peak forced alignment
//   3. offline-dtw    — pure in-browser energy/DTW-style forced alignment (no AI, always works)

import { energyEnvelope } from './audio';
import { buildCoach } from './coach';
import { scoreTranscriptMatch } from './match';
import { targetTextOf } from './quran';
import { analyzeTargetWords, classifyWord, normalizeArabic, tajweedScore, verdictFor } from './tajweed';
import type {
  AlignmentResult,
  EngineId,
  ModelEvent,
  ModelSize,
  Riwayah,
  TargetSpec,
  Tempo,
  WordAlignment,
  WordTajweed,
} from './types';
import { clamp, mean, median } from './util';
import { loadWhisper, whisperForcedAlignment, whisperTranscribeChunked, type TsChunk } from './whisper';

export interface AlignInput {
  samples: Float32Array;
  sampleRate?: number;
  url?: string | null;
  demo?: boolean;
}

export interface AlignOpts {
  tau: number;
  modelSize: ModelSize;
  target: TargetSpec;
  riwayah: Riwayah;
  tempo: Tempo;
  /**
   * التقييم اللحظي: تحليلٌ فوريّ بقياس الصوت وحده (بلا سماع ذكي)، فيظهر
   * الحكم خلال عُشر ثانية بدلًا من ثوانٍ. وهو أدنى دقةً في تمييز الألفاظ
   * (لا نصّ مسموعًا) لكن أزمنةَ الكلمات تُقاس بالمحرّك نفسه.
   */
  fast?: boolean;
}

export interface AlignHooks {
  stage: (s: string) => void;
  model?: (e: ModelEvent) => void;
}

const ATTN_MAX_WORDS = 60; // attention matrix size guard
const ATTN_MAX_SEC = 31; // whisper context window guard

/** طول إطار الطاقة (م.ث) — ٢٠ م.ث تُعطي حدودًا أدقّ من ٤٠ للكلمات القصيرة */
const FRAME_MS = 20;
/** أدنى زمنٍ يُعدّ كلمة مسموعة؛ دونه تُحكم الكلمة «لم تُسمع» */
const MIN_VOICED_MS = 70;
/** أدنى عرضٍ يبقى للكلمة عند فضّ تداخل الحدود (إطاران) */
const MIN_SPAN_MS = 2 * FRAME_MS;

export async function runAlignment(input: AlignInput, opts: AlignOpts, hooks: AlignHooks): Promise<AlignmentResult> {
  const sr = input.sampleRate ?? 16000;
  const samples = input.samples;
  const durationMs = (samples.length / sr) * 1000;
  const words = opts.target.words;
  const tempo = opts.tempo ?? 'tartil';
  const tjs: WordTajweed[] = analyzeTargetWords(words, opts.riwayah, tempo);

  hooks.stage('تهيئة الصوت المسجَّل…');
  const energy = energyEnvelope(samples, FRAME_MS);

  let engine: EngineId = 'offline-dtw';
  let perWord: { midMs: number; conf: number }[] | null = null;
  let transcript = '';
  let transcriptMatch = 0;
  let matchSource: AlignmentResult['matchSource'] = 'coverage';
  let predWords: { word: string; ok: boolean }[] = [];

  if (!input.demo && !opts.fast) {
    try {
      hooks.model?.({ status: 'loading', progress: 0 });
      const b = await loadWhisper(opts.modelSize, (p) =>
        hooks.model?.({ status: 'loading', progress: p.progress ?? 0 }),
      );
      hooks.model?.({ status: 'ready', progress: 1 });

      hooks.stage('الاستماع إلى التلاوة…');
      const tsOut = await whisperTranscribeChunked(b, samples, 4, (i, total) =>
        hooks.stage(
          total > 1 ? `الاستماع — المقطع ${i + 1} من ${total}…` : 'الاستماع إلى التلاوة…',
        ),
      );
      transcript = tsOut.text;
      const targetNorm = targetTextOf(opts.target);
      const scored = scoreTranscriptMatch(transcript, targetNorm);
      transcriptMatch = scored.match;
      predWords = scored.predWords;
      if (!scored.empty) matchSource = 'transcript';

      // 1) best precision: teacher-forced cross-attention matrix
      if (words.length <= ATTN_MAX_WORDS && durationMs / 1000 <= ATTN_MAX_SEC) {
        hooks.stage('مطابقة الكلمات مواضعَ الصوت بدقةٍ عالية…');
        const fa = await whisperForcedAlignment(b, samples, words.map((w) => w.word));
        if (fa) {
          engine = 'whisper-attn';
          perWord = attentionToWords(fa, tjs, energy, durationMs);
        }
      }
      // 2) robust path: Whisper's own timestamp tokens matched to the target words
      if (!perWord && tsOut.chunks.length) {
        hooks.stage('مطابقة الكلمات مواضعَ الصوت…');
        perWord = timestampsToWords(tsOut.chunks, transcript, tjs);
        if (perWord) engine = 'whisper-ts';
      }
      if (!perWord) engine = 'whisper-energy';
    } catch (e: any) {
      console.warn('[TAHQIQQ] Whisper engine failed → fallback Energy-DTW:', e);
      hooks.model?.({ status: 'error', message: e?.message ?? String(e) });
      engine = 'offline-dtw';
    }
  }

  if (!perWord) {
    hooks.stage('قياس الصوت لمطابقة الكلمات…');
    perWord = energyForcedAlignment(tjs, energy, durationMs);
  }

  const N = words.length;
  const mids = perWord.map((p) => p.midMs);
  for (let i = 1; i < N; i++) if (mids[i] < mids[i - 1]) mids[i] = mids[i - 1] + 40; // enforce monotonicity

  // precise start/end via per-word voiced-span VAD around each midpoint
  const spans = computeWordSpans(energy, mids, tjs.map((t) => t.expectedMs), durationMs);
  const measuredMs = spans.map((sp) => Math.max(0, sp.endMs - sp.startMs));

  // عدلة السرعة: وسطيُ نِسَب الأزمنة المقاسة إلى المتوقَّعة.
  // الحكم على كلمةٍ يكون إلى نموذج الأزمنة «بسرعة القارئ نفسه» لا بسرعة نظرية
  // مطلقة؛ وإلا عوقب من يقرأ مرتبةً أسرع أو أبطأ بـ«أقصر» على كل كلمة، وعوقب
  // من يقرأ بترتيلٍ متأنٍّ بـ«أطول» على كل كلمة — فتتعارض التنبيهات بلا سبب.
  const ratios: number[] = [];
  for (let i = 0; i < measuredMs.length; i++) {
    if (measuredMs[i] >= MIN_VOICED_MS && tjs[i].expectedMs > 0) ratios.push(measuredMs[i] / tjs[i].expectedMs);
  }
  const tempoScale = clamp(median(ratios) || 1, 0.35, 3);
  const refMs = tjs.map((t) => Math.max(60, t.expectedMs * tempoScale));
  // نافذة الأوجه الجائزة بعدلة السرعة نفسها: فمن قرأ بالقصر أو التوسط أو
  // الإشباع حيث جازت لم يُخطَّأ، ومن نقص عن أدنى الأوجه أُخذ به.
  const refWin = tjs.map((t) => ({
    minMs: Math.max(60, Math.min(t.minMs ?? t.expectedMs, t.expectedMs) * tempoScale),
    maxMs: Math.max(60, Math.max(t.maxMs ?? t.expectedMs, t.expectedMs) * tempoScale),
  }));

  const alignWords: WordAlignment[] = words.map((w, i) => {
    const { startMs, endMs } = spans[i];
    const status = classifyWord(measuredMs[i], refMs[i], opts.tau, refWin[i]);
    let conf = perWord[i].conf;
    if (engine === 'whisper-attn') conf = clamp(0.7 * conf + 0.3 * transcriptMatch, 0.05, 0.99);
    else if (engine === 'whisper-ts') conf = clamp(0.7 * conf + 0.3 * transcriptMatch, 0.05, 0.99);
    else if (engine === 'whisper-energy') conf = clamp(0.55 * conf + 0.45 * transcriptMatch, 0.05, 0.99);
    return {
      index: i,
      ayah: w.ayah,
      word: w.word,
      startMs,
      endMs: Math.max(startMs + 20, endMs),
      confidence: conf,
      status,
      // الزمن المرجعيّ المعروض هو نفسه الذي حُكمت به الكلمة: بعدلة سرعة القارئ
      tajweed: {
        ...tjs[i],
        expectedMs: Math.round(refMs[i]),
        minMs: Math.round(refWin[i].minMs),
        maxMs: Math.round(refWin[i].maxMs),
      },
    };
  });

  const meanConf = mean(alignWords.map((w) => w.confidence));
  // انتظام النسق: مطابقة الأزمنة بعدلة السرعة (وهو ما يُقاس عليه المتعلّم فعلًا)
  const rhythm = mean(measuredMs.map((m, i) => tajweedScore(m, refMs[i], opts.tau, refWin[i])));
  // ملاءمة المرتبة المختارة: انحراف السرعة وحده لا يُسقط الدرجة، لكن أثره يظهر فيها
  const tempoFit = clamp(1 - Math.abs(Math.log2(tempoScale)) / 2.4, 0, 1);
  const meanTj = 0.85 * rhythm + 0.15 * tempoFit;
  const voiced = alignWords.length ? alignWords.filter((w) => w.status !== 'silent').length / alignWords.length : 0;

  if (input.demo) {
    transcriptMatch = 1;
    matchSource = 'demo';
    predWords = words.map((w) => ({ word: normalizeArabic(w.word), ok: true }));
  } else if (matchSource !== 'transcript') {
    // (ومنه التقييم اللحظي: لا يستمع بالألفاظ، فتُعتَمد تغطية الكلمات المسموعة)
    transcriptMatch = voiced;
    matchSource = 'coverage';
  } else if (transcriptMatch < 0.12 && voiced > 0.5) {
    // النصّ المسموع فارغ المعنى رغم وجود صوت — لا نعرض 0٪ مضلِّلة
    transcriptMatch = Math.max(transcriptMatch, voiced * 0.65);
    matchSource = 'coverage';
  }

  const asrOk = matchSource === 'transcript' && transcriptMatch >= 0.25;
  const overallScore = Math.round(100 * (asrOk ? 0.4 * meanConf + 0.6 * meanTj : 0.2 * meanConf + 0.8 * meanTj));
  const coach = buildCoach(alignWords, overallScore, transcriptMatch, matchSource, tempoScale);

  return {
    targetKey: opts.target.key,
    targetLabel: opts.target.label + (input.demo ? ' (عرض تجريبي)' : ''),
    engine,
    transcript,
    transcriptMatch,
    matchSource,
    predWords,
    overallScore,
    verdict: verdictFor(overallScore),
    durationMs,
    words: alignWords,
    demo: !!input.demo,
    createdAt: Date.now(),
    audioUrl: input.url ?? null,
    samples,
    tempo,
    tempoScale,
    tips: coach.tips,
    summary: coach.summary,
    passed: coach.passed,
    instant: !!opts.fast,
  };
}

/**
 * عتبة الصوت/الصمت لمغلَّف الطاقة.
 *
 * لا يُبنى الحدّ على «المتوسط + انحراف» ولا على عُشرٍ مئويّ ثابت: التلاوة المتصلة
 * (وهي الأصل في الأداء) لا تكاد تحتوي صمتًا، فأيّ عتبةٍ تُشتقّ من توزيعها تقع
 * فوق معظم إطاراتها وتُسقِط الكلمات كلها. لذلك تُقاس أرضية الضجيج من أخمس
 * الإطارات همودًا، ومستوى الكلام من أعلاها (بترك ذروة الانفجارات)، وتُؤخذ
 * العتبة أبعدَ الحدّين عن الأرضية — فتعمل مع تسجيلٍ كثيرِ السكتات وآخرَ متصلٍ.
 */
export function vadThreshold(energy: Float32Array): { thr: number; noiseFloor: number; speechLevel: number } {
  const n = energy.length;
  if (!n) return { thr: 1e-5, noiseFloor: 0, speechLevel: 0 };
  const sorted = Float64Array.from(energy).sort();
  const avg = (a: number, b: number) => {
    const lo = Math.max(0, Math.floor(a));
    const hi = Math.min(n, Math.max(lo + 1, Math.ceil(b)));
    let s = 0;
    for (let i = lo; i < hi; i++) s += sorted[i];
    return s / (hi - lo);
  };
  const noiseFloor = avg(0, n * 0.05);
  const speechLevel = avg(n * 0.7, n * 0.95);
  const thr = Math.max(noiseFloor * 3, speechLevel * 0.15, 1e-5);
  return { thr, noiseFloor, speechLevel };
}

/* ------------------------------------------------------------------ */

/**
 * Given a midpoint per word (from any engine), refine start/end to the actual
 * voiced span around that midpoint.
 *
 * Three things this must get right, because the whole verdict rests on them:
 *  1. The voiced/unvoiced threshold comes from the **recording's** speech level,
 *     not from the peak inside the word's own window. A madd tail decays well
 *     below the word's onset peak, so a local-peak threshold silently amputates
 *     exactly the part the learner is being asked to hold.
 *  2. A word may never be limited by its own expected duration — that would make
 *     the measurement circular (the model would grade itself). The search window
 *     is bounded by the neighbouring midpoints, widened by the prior.
 *  3. Overlapping spans are cut at the **quietest frame** between them, never at
 *     an arbitrary halfway point, and never in a way that inverts a span (which
 *     used to collapse real words to 20 ms and report them as "not heard").
 */
export function computeWordSpans(
  energy: Float32Array,
  midsMs: number[],
  expectedMs: number[],
  durationMs: number,
): { startMs: number; endMs: number }[] {
  const frameMs = FRAME_MS;
  const n = energy.length;
  const out: { startMs: number; endMs: number }[] = [];
  if (!n) return midsMs.map((m) => ({ startMs: m, endMs: m }));

  // speech level & noise floor over the whole envelope
  const { thr } = vadThreshold(energy);
  const DIP = 3; // frames of momentary dip tolerated inside a word (~60 ms)

  const frameOf = (ms: number) => Math.max(0, Math.min(n - 1, Math.round(ms / frameMs)));

  for (let i = 0; i < midsMs.length; i++) {
    const midF = frameOf(midsMs[i]);
    // search window: towards the neighbouring midpoints, widened by the prior
    const priorHalf = Math.max(4, Math.round((expectedMs[i] * 1.2) / frameMs));
    const lo = Math.max(0, Math.min(i > 0 ? frameOf(midsMs[i - 1]) : 0, midF - priorHalf));
    const hi = Math.min(n - 1, Math.max(i < midsMs.length - 1 ? frameOf(midsMs[i + 1]) : n - 1, midF + priorHalf));

    // walk back to the last frame above threshold, tolerating short dips
    let s = midF;
    let dip = 0;
    let lastVoiced = energy[midF] >= thr ? midF : -1;
    while (s > lo) {
      s--;
      if (energy[s] >= thr) {
        lastVoiced = s;
        dip = 0;
      } else if (++dip > DIP) break;
    }
    // walk forward
    let e = midF;
    dip = 0;
    while (e < hi) {
      e++;
      if (energy[e] >= thr) {
        lastVoiced = Math.max(lastVoiced, e);
        dip = 0;
      } else if (++dip > DIP) break;
    }

    if (lastVoiced < 0 || (lastVoiced - s + 1) * frameMs < MIN_VOICED_MS) {
      // nothing voiced around this midpoint → honest "not heard", no invented span
      out.push({ startMs: midsMs[i], endMs: midsMs[i] });
      continue;
    }
    out.push({ startMs: s * frameMs, endMs: (lastVoiced + 1) * frameMs });
  }

  // Resolve overlaps at the quietest frame between the two words. Guarantees
  // monotonic, non-inverted spans.
  for (let i = 1; i < out.length; i++) {
    const a = out[i - 1];
    const b = out[i];
    if (b.startMs >= a.endMs) continue;
    const loBound = a.startMs + MIN_SPAN_MS;
    const hiBound = b.endMs - MIN_SPAN_MS;
    if (loBound > hiBound) {
      // both words shorter than the minimum together → split by expected weight
      const wA = Math.max(1, expectedMs[i - 1]);
      const wB = Math.max(1, expectedMs[i]);
      const cut = a.startMs + (b.endMs - a.startMs) * (wA / (wA + wB));
      a.endMs = cut;
      b.startMs = cut;
      continue;
    }
    // الحدّ يُبحث عنه قرب منتصف المسافة بين منتصفي الكلمتين (وهو أفضل ما لدى
    // محرك المحاذاة)، ولا يُترك حرًّا في كل منطقة التداخل: فحين تتصل التلاوة
    // بلا سكتات يكون ملفّ الطاقة شبه مستوٍ، وأهدأ إطارٍ فيه قد يقع في أيّ
    // موضع — وقد كان ذلك يطوي كلمةً كاملة إلى ٤٠ م.ث فيحكمها «لم تُسمع».
    const prior = (midsMs[i - 1] + midsMs[i]) / 2;
    const reach = Math.max(MIN_SPAN_MS, (midsMs[i] - midsMs[i - 1]) * 0.35);
    const f0 = Math.max(0, Math.round(Math.max(loBound, prior - reach) / frameMs));
    const f1 = Math.min(n - 1, Math.round(Math.min(hiBound, prior + reach) / frameMs));
    let cutF = Math.round(prior / frameMs);
    let best = Infinity;
    for (let f = f0; f <= f1; f++) {
      if (energy[f] < best) {
        best = energy[f];
        cutF = f;
      }
    }
    const cut = Math.max(loBound, Math.min(hiBound, cutF * frameMs));
    a.endMs = cut;
    b.startMs = cut;
  }

  // ==== هل سُمعت الكلمةُ فعلًا؟ (تمييز الكلمة المُسقَطة من التلاوة المتعثّرة) ====
  // قد يُسقط القارئ كلمةً فيبقى مكانَها سكوتٌ لا صوتَ فيه، ثم تتقدّم الكلمةُ التالية إليه
  // فيبدو زمنُها المقاس أطولَ كثيرًا (وهو ما ترصده الدالةُ أعلاه «طويلة» لا «لم تُسمع»).
  // فأمارةُ الإسقاط: أن تبتدئ الكلمةُ بعد فجوةِ سكوتٍ صريحة (١٢٠ م.ث فأكثر: لا يتّسع لها
  // داخل الكلمة عادةً) ويكون زمنُها المقاس — مع ذلك — يزيد على ١٫٥ من وتيرة القارئ نفسه.
  // حينئذٍ يُبطَل زمنُها وتُحكم «لم تُسمع» — وهو ما لا يُدركه قياسُ الزمن وحده.
  {
    const holes: { from: number; to: number }[] = [];
    let hFrom = -1;
    for (let f = 0; f <= n; f++) {
      const quiet = f < n && energy[f] < thr;
      if (quiet && hFrom < 0) hFrom = f;
      else if (!quiet && hFrom >= 0) {
        if (f - hFrom >= 5) holes.push({ from: hFrom, to: f - 1 });
        hFrom = -1;
      }
    }
    if (holes.length) {
      // فجوةٌ تُعدّ سكتةً معتبرة: ١٢٠ م.ث فأكثر (تتجاوز ما يتسامح فيه داخل الكلمة)
      const HOLE_MIN = 6;
      const ratios: number[] = [];
      for (let i = 0; i < out.length; i++) {
        const m = out[i].endMs - out[i].startMs;
        if (expectedMs[i] > 0 && m >= MIN_VOICED_MS) ratios.push(m / expectedMs[i]);
      }
      ratios.sort((a, b) => a - b);
      const scale = ratios.length ? ratios[Math.floor(ratios.length / 2)] : 1;
      for (let i = 0; i < out.length; i++) {
        const sp = out[i];
        if (expectedMs[i] <= 0 || sp.startMs <= 2 * frameMs) continue;
        const measured = sp.endMs - sp.startMs;
        if (measured < 1.5 * scale * expectedMs[i]) continue;
        // فجوةٌ يبتدئ الصوتُ بعدها: بدايةُ الكلمة داخل سكوتٍ لا صوتَ فيه
        const hit = holes.find(
          (h) => sp.startMs >= h.from * frameMs - 2 * frameMs && sp.startMs <= (h.to + 1) * frameMs + 2 * frameMs,
        );
        if (!hit || hit.to - hit.from + 1 < HOLE_MIN) continue;
        out[i] = { startMs: midsMs[i], endMs: midsMs[i] };
      }
    }
  }

  if (out.length) out[0].startMs = Math.max(0, Math.min(out[0].startMs, 120));
  for (const o of out) {
    o.startMs = Math.max(0, Math.min(durationMs, o.startMs));
    o.endMs = Math.max(o.startMs, Math.min(durationMs, o.endMs));
  }
  return out;
}

/* ------------------------------------------------------------------ */

function softmaxIfNeeded(row: Float32Array): Float32Array {
  let max = -Infinity;
  let min = Infinity;
  let sum = 0;
  for (const v of row) {
    if (v > max) max = v;
    if (v < min) min = v;
    sum += v;
  }
  if (max > 0 && min >= -1e-6 && max <= 5 && Math.abs(sum - 1) < 0.6) return row; // already probabilities
  const out = new Float32Array(row.length);
  let z = 0;
  for (let i = 0; i < row.length; i++) {
    out[i] = Math.exp(row[i] - max);
    z += out[i];
  }
  if (z <= 0) return row;
  for (let i = 0; i < row.length; i++) out[i] /= z;
  return out;
}

/** Convert cross-attention rows (per token) into per-word midpoints + confidences */
function attentionToWords(
  fa: { rows: Float32Array[]; spans: [number, number][] },
  tjs: WordTajweed[],
  energy: Float32Array,
  durationMs: number,
): { midMs: number; conf: number }[] {
  const frameMs = FRAME_MS;
  const Ntok = fa.rows.length - 1; // drop final row (SOT shift)
  const mids: number[] = [];
  const confs: number[] = [];
  for (let j = 0; j < Ntok; j++) {
    const row = softmaxIfNeeded(fa.rows[j]);
    const z = row.reduce((a, b) => a + b, 0) || 1;
    let maxp = 0;
    for (const v of row) maxp = Math.max(maxp, v / z);
    let num = 0;
    let den = 0;
    for (let s = 0; s < row.length; s++) {
      const p = row[s] / z;
      const wgt = p * p; // sharpen toward the peak
      num += wgt * s;
      den += wgt;
    }
    mids.push(den > 1e-9 ? (num / den) * frameMs + frameMs / 2 : (j / Math.max(1, Ntok)) * durationMs);
    confs.push(clamp((maxp - 1 / row.length) / (1 - 1 / row.length), 0, 1));
  }
  return tjs.map((_, wi) => {
    const span: [number, number] = fa.spans[wi] ?? [0, 1];
    const a = Math.max(0, span[0]);
    const b = Math.min(span[1], Ntok, mids.length);
    let m = 0;
    let c = 0;
    let cnt = 0;
    for (let j = a; j < b; j++) {
      m += mids[j];
      c += confs[j];
      cnt++;
    }
    const mid0 = cnt ? m / cnt : (wi / Math.max(1, tjs.length)) * durationMs;
    const conf0 = cnt ? c / cnt : 0.3;
    // blend with the local energy peak for robustness
    const eStart = Math.max(0, Math.floor((mid0 - 320) / frameMs));
    const eEnd = Math.min(energy.length - 1, Math.floor((mid0 + 320) / frameMs));
    let peak = eStart;
    let pv = -1;
    for (let i = eStart; i <= eEnd; i++) if (energy[i] > pv) {
      pv = energy[i];
      peak = i;
    }
    const midE = peak * frameMs + frameMs / 2;
    const mid = pv > 0 ? 0.65 * mid0 + 0.35 * midE : mid0;
    return { midMs: mid, conf: clamp(0.65 * conf0 + 0.35 * (pv > 0 ? 0.55 : 0.25), 0.05, 0.98) };
  });
}

/**
 * Robust timing path: match transcript words (from Whisper timestamp chunks)
 * to target words via LCS and take per-word midpoints from the chunk timings.
 * Returns null when the transcript is too far from the target (<20% match).
 */
function timestampsToWords(
  chunks: TsChunk[],
  _transcript: string,
  tjs: WordTajweed[],
): { midMs: number; conf: number }[] | null {
  // 1) flatten chunks into timed words (even split inside multi-word chunks)
  const timed: { w: string; mid: number; conf: number }[] = [];
  for (const c of chunks) {
    const ws = c.text.split(/\s+/).filter(Boolean);
    if (!ws.length) continue;
    const dur = Math.max(80, c.endMs - c.startMs);
    ws.forEach((w, k) => {
      const start = c.startMs + (k / ws.length) * dur;
      timed.push({ w: normalizeArabic(w), mid: start + dur / ws.length / 2, conf: 0.85 });
    });
  }
  if (!timed.length) return null;

  const target = tjs.map((t) => normalizeArabic(t.word));
  const pairs = lcsPairs(timed.map((t) => t.w), target);
  if (!pairs.length) return null;
  if (pairs.length / target.length < 0.2) return null;

  const matchAt = new Map<number, number>(); // target idx → timed idx
  for (const [ti, pi] of pairs) matchAt.set(ti, pi);

  // 2) per-target-word midpoint: matched → chunk midpoint; unmatched → interpolate
  const mids: number[] = [];
  const confs: number[] = [];
  for (let i = 0; i < target.length; i++) {
    const pi = matchAt.get(i);
    if (pi != null) {
      mids.push(timed[pi].mid);
      confs.push(timed[pi].conf);
    } else {
      let prevI = i - 1;
      while (prevI >= 0 && !matchAt.has(prevI)) prevI--;
      let nextI = i + 1;
      while (nextI < target.length && !matchAt.has(nextI)) nextI++;
      if (prevI >= 0 && nextI < target.length) {
        const a = timed[matchAt.get(prevI)!].mid;
        const b = timed[matchAt.get(nextI)!].mid;
        const f = (i - prevI) / (nextI - prevI);
        mids.push(a + (b - a) * f);
        confs.push(0.4);
      } else if (nextI < target.length) {
        mids.push(timed[matchAt.get(nextI)!].mid - (nextI - i) * 260);
        confs.push(0.4);
      } else if (prevI >= 0) {
        mids.push(timed[matchAt.get(prevI)!].mid + (i - prevI) * 260);
        confs.push(0.4);
      } else {
        mids.push((i / Math.max(1, target.length)) * 2000);
        confs.push(0.25);
      }
    }
  }
  return mids.map((m, i) => ({ midMs: m, conf: confs[i] }));
}

/** LCS returning matched index pairs [targetIdx, predIdx] (order preserved) */
function lcsPairs(p: string[], t: string[]): [number, number][] {
  const n = p.length;
  const m = t.length;
  if (!n || !m || n * m > 4_000_000) return [];
  const dp: Int32Array[] = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = p[i] === t[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const pairs: [number, number][] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (p[i] === t[j]) {
      pairs.push([j, i]);
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
    else j++;
  }
  return pairs;
}

/** مقاطع الصوت المتصلة (VAD): تُدمج الفجوات القصيرة وتُهمل النُبَذ الضئيلة */
export function voicedRuns(
  energy: Float32Array,
  thr: number,
  mergeGapFrames = 5,
  minRunFrames = 2,
): { from: number; to: number }[] {
  const n = energy.length;
  const runs: { from: number; to: number }[] = [];
  let cur: { from: number; to: number } | null = null;
  let gap = 0;
  for (let f = 0; f < n; f++) {
    if (energy[f] >= thr) {
      if (cur) cur.to = f;
      else cur = { from: f, to: f };
      gap = 0;
    } else if (cur) {
      if (++gap > mergeGapFrames) {
        runs.push(cur);
        cur = null;
        gap = 0;
      }
    }
  }
  if (cur) runs.push(cur);
  return runs.filter((r) => r.to - r.from + 1 >= minRunFrames);
}

/**
 * Fallback forced alignment (no AI): VAD on the energy envelope, then the voiced
 * frames are split between the target words **in proportion to the tajweed
 * duration priors**, monotonically and without a moving cursor.
 *
 * The previous version hunted for the loudest frame inside a sliding window and
 * advanced a cursor past it. One word that grabbed a neighbour's peak pushed
 * every following word further off, so the last words of an ayah regularly ended
 * up beyond the end of the recording and were reported as "not heard" — the
 * learner was blamed for words the engine had simply lost. Proportional
 * allocation on the voiced timeline cannot drift: each word's share is fixed by
 * the priors, and the mapping back to real time is monotonic by construction.
 */
export function energyForcedAlignment(
  tjs: WordTajweed[],
  energy: Float32Array,
  durationMs: number,
): { midMs: number; conf: number }[] {
  const frameMs = FRAME_MS;
  const n = energy.length;
  const N = tjs.length;
  if (!n || !N) return tjs.map((_, i) => ({ midMs: (i / Math.max(1, N)) * durationMs, conf: 0.2 }));

  const { thr, speechLevel } = vadThreshold(energy);

  const runs = voicedRuns(energy, thr, 3);
  if (!runs.length) return tjs.map((_, i) => ({ midMs: ((i + 0.5) / N) * durationMs, conf: 0.15 }));

  const timeOf = (f: number) => f * frameMs + frameMs / 2;
  const peakConf = speechLevel > 0 ? clamp((Math.max(...Array.from(energy)) - thr) / (2 * speechLevel) + 0.45, 0.15, 0.9) : 0.3;

  // ١) مقاطع الصوت أكثر من الكلمات أو تساويها → إسناد monotonic أمثل:
  //    كل كلمة تأخذ مجموعةً متصلة من المقاطع، ويُختار التقسيم الذي تُقارب فيه
  //    الأزمنةُ المقاسة أزمنةَ النموذج. هذا يمنع الانزياح التراكميّ الذي كان
  //    يفقد الكلمات في أواخر الآية.
  if (runs.length >= N && runs.length * runs.length * N <= 4_000_000) {
    const fit = matchRunsToWords(runs, tjs.map((t) => Math.max(1, t.expectedMs)), frameMs);
    if (fit) {
      return fit.map((f) => ({ midMs: f.midMs, conf: clamp(peakConf + 0.08 - f.penalty, 0.15, 0.95) }));
    }
  }

  // ٢) خلاف ذلك: توزيع إطارات الصوت على الكلمات بأوزان الأزمنة المتوقَّعة
  const voicedFrames: number[] = [];
  for (const r of runs) for (let f = r.from; f <= r.to; f++) voicedFrames.push(f);
  const V = voicedFrames.length;
  const weights = tjs.map((t) => Math.max(1, t.expectedMs));
  const totalW = weights.reduce((a, b) => a + b, 0);

  // حدود الكلمات على خطّ الصوت (بالإطارات الصوتية) — تراكمية، فلا انزياح
  const bounds: number[] = [0];
  let acc = 0;
  for (let i = 0; i < N; i++) {
    acc += weights[i];
    bounds.push(i === N - 1 ? V : Math.min(V, Math.round((acc / totalW) * V)));
  }
  for (let i = 1; i <= N; i++) if (bounds[i] < bounds[i - 1]) bounds[i] = bounds[i - 1];

  // ملاءمة الحدود: إن كان الحدّ قريبًا من سكتةٍ حقيقية فليُسنَد إليها
  const gaps: number[] = [];
  for (let k = 1; k < runs.length; k++) gaps.push(Math.round((runs[k - 1].to + runs[k].from) / 2));
  const gapIdx = gaps.map((g) => voicedFrames.findIndex((f) => f >= g));

  const out: { midMs: number; conf: number }[] = [];
  for (let i = 0; i < N; i++) {
    let a = bounds[i];
    let b = bounds[i + 1];
    const idealSpan = (weights[i] / totalW) * V;
    for (const gi of gapIdx) {
      if (gi <= 0) continue;
      if (Math.abs(gi - a) <= idealSpan * 0.35 && Math.abs(gi - a) < Math.abs(nearestGap(gapIdx, a) - a)) a = gi;
      if (Math.abs(gi - b) <= idealSpan * 0.35 && Math.abs(gi - b) < Math.abs(nearestGap(gapIdx, b) - b)) b = gi;
    }
    if (b <= a) b = Math.min(V, a + Math.max(1, Math.round(idealSpan)));
    const midV = Math.min(V - 1, Math.max(0, Math.floor((a + b) / 2)));
    const midF = voicedFrames[midV] ?? Math.round((timeOf(a) / frameMs));
    const runCount = runs.filter((r) => voicedFrames[a] >= r.from && voicedFrames[a] <= r.to).length;
    out.push({
      midMs: timeOf(midF),
      conf: clamp(peakConf * (runs.length === N ? 1 : 0.85) - (runCount ? 0 : 0.05), 0.15, 0.9),
    });
  }
  return out;
}

/**
 * إسناد مقاطع الصوت إلى الكلمات: تقسيمٌ monotonic للمقاطع على الكلمات يقلّل
 * مجموع الفروق النسبية بين زمن كل كلمة وزمنها المتوقَّع. يضمن أن كل كلمة
 * تنال مقطعًا واحدًا على الأقل، فلا تبتلع كلمةٌ جارتَها ولا تضيع كلمةٌ في
 * آخر الآية.
 */
function matchRunsToWords(
  runs: { from: number; to: number }[],
  expectedMs: number[],
  frameMs: number,
): { midMs: number; penalty: number }[] | null {
  const R = runs.length;
  const N = expectedMs.length;
  if (R < N) return null;

  // زمن كل مقطع ومركزه الزمنيّ
  const dur = runs.map((r) => (r.to - r.from + 1) * frameMs);
  // مجموع أزمنة المقاطع k..j-1
  const pre = new Float64Array(R + 1);
  for (let i = 0; i < R; i++) pre[i + 1] = pre[i] + dur[i];
  const sumRuns = (k: number, j: number) => pre[j] - pre[k];

  const INF = Infinity;
  const dp: number[][] = Array.from({ length: N + 1 }, () => new Array<number>(R + 1).fill(INF));
  const back: number[][] = Array.from({ length: N + 1 }, () => new Array<number>(R + 1).fill(-1));
  dp[0][0] = 0;
  for (let i = 1; i <= N; i++) {
    for (let j = i; j <= R - (N - i); j++) {
      let best = INF;
      let bk = -1;
      for (let k = i - 1; k < j; k++) {
        if (dp[i - 1][k] === INF) continue;
        const c = dp[i - 1][k] + Math.abs(sumRuns(k, j) - expectedMs[i - 1]) / expectedMs[i - 1];
        if (c < best) {
          best = c;
          bk = k;
        }
      }
      dp[i][j] = best;
      back[i][j] = bk;
    }
  }
  if (dp[N][R] === INF) return null;

  // استرجاع التقسيم
  const bounds: number[] = new Array(N + 1);
  bounds[N] = R;
  for (let i = N; i >= 1; i--) bounds[i - 1] = back[i][bounds[i]];

  const out: { midMs: number; penalty: number }[] = [];
  for (let i = 0; i < N; i++) {
    const k = bounds[i];
    const j = bounds[i + 1];
    if (j <= k) return null;
    // مركز الزمن المصوت داخل مقاطع هذه الكلمة
    let voiced = 0;
    for (let x = k; x < j; x++) voiced += dur[x];
    let acc = 0;
    let midF = runs[k].from;
    for (let x = k; x < j; x++) {
      if (acc + dur[x] >= voiced / 2) {
        const inside = (voiced / 2 - acc) / frameMs;
        midF = runs[x].from + Math.min(runs[x].to - runs[x].from, Math.max(0, Math.round(inside)));
        break;
      }
      acc += dur[x];
    }
    const penalty = Math.min(0.35, Math.abs(voiced - expectedMs[i]) / (2 * expectedMs[i]));
    out.push({ midMs: midF * frameMs + frameMs / 2, penalty });
  }
  return out;
}

/** أقرب حدّ سكتةٍ إلى موضعٍ على خطّ الصوت */
function nearestGap(gapIdx: number[], at: number): number {
  let best = -1;
  let bd = Infinity;
  for (const g of gapIdx) {
    if (g < 0) continue;
    const d = Math.abs(g - at);
    if (d < bd) {
      bd = d;
      best = g;
    }
  }
  return best < 0 ? at : best;
}
