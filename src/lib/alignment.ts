// TAHQĪQ — forced alignment engine (orchestrator)
//
// Engine chain (automatic fallback on any failure):
//   1. whisper-attn   — Whisper (ONNX/WASM) teacher-forced pass + cross-attention timing
//   2. whisper-energy — Whisper transcription (similarity) + energy-peak forced alignment
//   3. offline-dtw    — pure in-browser energy/DTW-style forced alignment (no AI, always works)

import { energyEnvelope } from './audio';
import { targetTextOf } from './quran';
import { analyzeWords, classifyWord, normalizeArabic, tajweedScore, verdictFor } from './tajweed';
import type {
  AlignmentResult,
  EngineId,
  ModelEvent,
  ModelSize,
  TargetSpec,
  WordAlignment,
  WordTajweed,
} from './types';
import { clamp, mean } from './util';
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
}

export interface AlignHooks {
  stage: (s: string) => void;
  model?: (e: ModelEvent) => void;
}

const ATTN_MAX_WORDS = 60; // attention matrix size guard
const ATTN_MAX_SEC = 31; // whisper context window guard

export async function runAlignment(input: AlignInput, opts: AlignOpts, hooks: AlignHooks): Promise<AlignmentResult> {
  const sr = input.sampleRate ?? 16000;
  const samples = input.samples;
  const durationMs = (samples.length / sr) * 1000;
  const words = opts.target.words;
  const tjs: WordTajweed[] = analyzeWords(words.map((w) => w.word));

  hooks.stage('معالجة العيّنة الصوتية (16kHz · أحادي)…');
  const energy = energyEnvelope(samples, 40);

  let engine: EngineId = 'offline-dtw';
  let perWord: { midMs: number; conf: number }[] | null = null;
  let transcript = '';
  let transcriptMatch = 0;
  let predWords: { word: string; ok: boolean }[] = [];

  if (!input.demo) {
    try {
      hooks.model?.({ status: 'loading', progress: 0 });
      const b = await loadWhisper(opts.modelSize, (p) =>
        hooks.model?.({ status: 'loading', progress: p.progress ?? 0 }),
      );
      hooks.model?.({ status: 'ready', progress: 1 });

      hooks.stage('التفكيك الصوتي (Whisper · عربي)…');
      const tsOut = await whisperTranscribeChunked(b, samples, 4, (i, total) =>
        hooks.stage(
          total > 1 ? `التفكيك الصوتي — المقطع ${i + 1} من ${total}…` : 'التفكيك الصوتي (Whisper)…',
        ),
      );
      transcript = tsOut.text;
      const targetNorm = targetTextOf(opts.target);
      const [match, pred] = similarity(transcript, targetNorm);
      transcriptMatch = match;
      predWords = pred;

      // 1) best precision: teacher-forced cross-attention matrix
      if (words.length <= ATTN_MAX_WORDS && durationMs / 1000 <= ATTN_MAX_SEC) {
        hooks.stage('التراصف القسري: التفكيك المدرَّس + مصفوفة الانتباه المتقاطع…');
        const fa = await whisperForcedAlignment(b, samples, words.map((w) => w.word));
        if (fa) {
          engine = 'whisper-attn';
          perWord = attentionToWords(fa, tjs, energy, durationMs);
        }
      }
      // 2) robust path: Whisper's own timestamp tokens matched to the target words
      if (!perWord && tsOut.chunks.length) {
        hooks.stage('التراصف بزمنيات Whisper (طريق بديل)…');
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
    hooks.stage('التراصف الطُّرائقي القسري (Energy-DTW)…');
    perWord = energyForcedAlignment(tjs, energy, durationMs);
  }

  const N = words.length;
  const mids = perWord.map((p) => p.midMs);
  for (let i = 1; i < N; i++) if (mids[i] < mids[i - 1]) mids[i] = mids[i - 1] + 40; // enforce monotonicity

  // precise start/end via per-word voiced-span VAD around each midpoint
  const spans = computeWordSpans(energy, mids, tjs.map((t) => t.expectedMs), durationMs);

  const alignWords: WordAlignment[] = words.map((w, i) => {
    const { startMs, endMs } = spans[i];
    const measured = Math.max(0, endMs - startMs);
    const status = classifyWord(measured, tjs[i].expectedMs, opts.tau);
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
      tajweed: tjs[i],
    };
  });

  const meanConf = mean(alignWords.map((w) => w.confidence));
  const meanTj = mean(alignWords.map((w) => tajweedScore(w.endMs - w.startMs, w.tajweed.expectedMs, opts.tau)));
  const overallScore = Math.round(100 * (0.5 * meanConf + 0.5 * meanTj));

  return {
    targetKey: opts.target.key,
    targetLabel: opts.target.label + (input.demo ? ' (عرض تجريبي)' : ''),
    engine,
    transcript,
    transcriptMatch,
    predWords,
    overallScore,
    verdict: verdictFor(overallScore),
    durationMs,
    words: alignWords,
    demo: !!input.demo,
    createdAt: Date.now(),
    audioUrl: input.url ?? null,
    samples,
  };
}

/* ------------------------------------------------------------------ */

/**
 * Given a midpoint per word (from any engine), refine start/end to the
 * actual voiced span around each midpoint using a per-word local energy
 * threshold (hysteresis: tolerate a 1-frame dip inside a word).
 */
function computeWordSpans(
  energy: Float32Array,
  midsMs: number[],
  expectedMs: number[],
  durationMs: number,
): { startMs: number; endMs: number }[] {
  const frameMs = 40;
  const n = energy.length;
  const out: { startMs: number; endMs: number }[] = [];

  for (let i = 0; i < midsMs.length; i++) {
    const midF = Math.max(0, Math.min(n - 1, Math.round(midsMs[i] / frameMs)));
    const maxHalf = Math.max(3, Math.round((expectedMs[i] * 1.8) / frameMs));

    let peakV = 0;
    const lo0 = Math.max(0, midF - maxHalf);
    const hi0 = Math.min(n, midF + maxHalf + 1);
    for (let f = lo0; f < hi0; f++) peakV = Math.max(peakV, energy[f]);
    const thr = Math.max(peakV * 0.3, 1e-5);

    // walk back
    let s = midF;
    let dip = 0;
    while (s > 0 && midF - s < maxHalf) {
      if (energy[s - 1] >= thr) dip = 0;
      else if (++dip >= 2) break;
      s--;
    }
    // walk forward
    let e = midF;
    dip = 0;
    while (e < n - 1 && e - midF < maxHalf) {
      if (energy[e + 1] >= thr) dip = 0;
      else if (++dip >= 2) break;
      e++;
    }

    let startMs = s * frameMs;
    let endMs = (e + 1) * frameMs;
    if (endMs - startMs < 80) {
      // degenerate (silence around midpoint) → fall back to expected half-width
      startMs = Math.max(0, midsMs[i] - expectedMs[i] / 2);
      endMs = Math.min(durationMs, midsMs[i] + expectedMs[i] / 2);
    }
    out.push({ startMs, endMs });
  }

  // enforce monotonic non-overlap boundaries
  for (let i = 1; i < out.length; i++) {
    if (out[i].startMs < out[i - 1].endMs) {
      const m = (out[i].startMs + out[i - 1].endMs) / 2;
      out[i - 1].endMs = m;
      out[i].startMs = m;
    }
  }
  if (out.length) {
    out[0].startMs = Math.max(0, Math.min(out[0].startMs, 120));
    out[out.length - 1].endMs = Math.min(durationMs, Math.max(out[out.length - 1].endMs, out[out.length - 1].startMs + 80));
  }
  return out;
}

/* ------------------------------------------------------------------ */

/** Word-level LCS similarity between model transcript and target text */
function similarity(pred: string, target: string): [number, { word: string; ok: boolean }[]] {
  const p = pred
    .split(/\s+/)
    .filter(Boolean)
    .map(normalizeArabic)
    .filter(Boolean);
  const t = target
    .split(/\s+/)
    .filter(Boolean)
    .map(normalizeArabic)
    .filter(Boolean);
  if (!t.length) return [0, p.map((w) => ({ word: w, ok: false }))];
  if (!p.length) return [0, []];

  const n = p.length;
  const m = t.length;
  if (n * m > 4_000_000) {
    // huge targets: multiset-overlap approximation
    const counts = new Map<string, number>();
    for (const w of p) counts.set(w, (counts.get(w) ?? 0) + 1);
    let matches = 0;
    for (const w of t) {
      const c = counts.get(w) ?? 0;
      if (c > 0) {
        matches++;
        counts.set(w, c - 1);
      }
    }
    return [matches / m, p.map((w) => ({ word: w, ok: false }))];
  }

  const dp: Int32Array[] = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = p[i] === t[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  let i = 0;
  let j = 0;
  const ok = new Array<boolean>(n).fill(false);
  while (i < n && j < m) {
    if (p[i] === t[j]) {
      ok[i] = true;
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
    else j++;
  }
  return [dp[0][0] / m, p.map((w, k) => ({ word: w, ok: ok[k] }))];
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
  const frameMs = 40;
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

/**
 * Fallback forced alignment: VAD on the 40ms energy envelope, duration priors
 * from the tajweed model, sequential peak-snapped frame allocation (DTW-style).
 */
function energyForcedAlignment(
  tjs: WordTajweed[],
  energy: Float32Array,
  durationMs: number,
): { midMs: number; conf: number }[] {
  const frameMs = 40;
  const n = energy.length;
  if (!n) return tjs.map((_, i) => ({ midMs: (i / Math.max(1, tjs.length)) * durationMs, conf: 0.2 }));

  let meanV = 0;
  for (const v of energy) meanV += v;
  meanV /= n;
  let varV = 0;
  for (const v of energy) varV += (v - meanV) * (v - meanV);
  const std = Math.sqrt(varV / n);
  const thr = meanV + 0.3 * std;

  let activeFrames = 0;
  for (const v of energy) if (v > thr) activeFrames++;
  if (activeFrames < tjs.length) activeFrames = tjs.length;

  const expFrames = tjs.map((t) => Math.max(2, t.expectedMs / frameMs));
  const totalExp = expFrames.reduce((a, b) => a + b, 0);
  const scale = activeFrames / totalExp;
  const alloc = expFrames.map((f) => Math.max(1, Math.round(f * scale)));

  const out: { midMs: number; conf: number }[] = [];
  let cursor = 0;
  for (let w = 0; w < tjs.length; w++) {
    const win = Math.max(3, alloc[w]);
    const from = Math.min(cursor, n - 1);
    const to = Math.min(n, from + win * 3);
    let peak = from;
    let pv = -1;
    for (let i = from; i < to; i++) if (energy[i] > pv) {
      pv = energy[i];
      peak = i;
    }
    const peakConf = std > 0 ? clamp((pv - thr) / (2 * std) + 0.45, 0.15, 0.9) : 0.3;
    out.push({ midMs: peak * frameMs + frameMs / 2, conf: peakConf });
    cursor = Math.min(n - 1, Math.max(cursor + 1, peak + Math.max(1, Math.floor(win / 2))));
  }
  return out;
}
