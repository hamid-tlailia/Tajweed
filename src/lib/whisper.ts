// TAHQĪQ — on-device Whisper runtime (Hugging Face transformers.js + ONNX Runtime Web / WASM)
//
//  • loadWhisper(size)            → cached model/processor with download progress
//  • whisperTranscribeChunked()   → free transcription in 28s chunks
//  • whisperForcedAlignment()     → TEACHER-FORCED pass: the decoder input is
//    forced to the target ayah's token sequence, then the cross-attention
//    matrix (target tokens → 40ms audio frames) is extracted for timing.

import { normalizeArabic } from './tajweed';
import type { ModelSize } from './types';

export interface WhisperBundle {
  model: any;
  processor: any;
  size: ModelSize;
}

let bundle: WhisperBundle | null = null;
let inflight: { size: ModelSize; p: Promise<WhisperBundle> } | null = null;

const MODEL_IDS: Record<ModelSize, string> = {
  tiny: 'onnx-community/whisper-tiny', // ~43MB
  base: 'onnx-community/whisper-base', // ~80MB
};

/**
 * Pinned ONNX Runtime Web engine build.
 *
 * transformers.js 3.x, by default, serves the WASM engine from its own
 * CDN dist/ folder — and recent releases ship a **dev build** of
 * onnxruntime-web there, containing an int64→Number (BigInt) defect that
 * breaks Whisper on mobile browsers ("Cannot convert a BigInt value to a
 * number"). Pointing wasmPaths at the stable 1.20.1 release guarantees a
 * consistent (JS glue + wasm binary) pair. A backup CDN covers flaky
 * mobile networks.
 */
const ORT_WASM_CDN = [
  'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.20.1/dist/',
  'https://unpkg.com/onnxruntime-web@1.20.1/dist/',
];

export function whisperLoadedSize(): ModelSize | null {
  return bundle?.size ?? null;
}

export function loadWhisper(
  size: ModelSize,
  onProgress?: (e: { file: string; progress: number }) => void,
): Promise<WhisperBundle> {
  if (bundle && bundle.size === size) return Promise.resolve(bundle);
  if (inflight && inflight.size === size) return inflight.p;
  const p = (async (): Promise<WhisperBundle> => {
    const tf: any = await import('@huggingface/transformers');
    try {
      tf.env.allowLocalModels = false;
    } catch {
      /* noop */
    }
    try {
      tf.env.useBrowserCache = true; // Cache API → second load is instant
    } catch {
      /* noop */
    }
    const id = MODEL_IDS[size];
    const cb = (e: any) => {
      if (e?.status === 'progress' && onProgress) onProgress({ file: e.file ?? 'model', progress: e.progress ?? 0 });
    };
    let lastErr: unknown = null;
    for (const wasmPaths of ORT_WASM_CDN) {
      try {
        tf.env.backends.onnx.wasm.wasmPaths = wasmPaths;
        const processor = await tf.AutoProcessor.from_pretrained(id, cb);
        const model = await tf.AutoModelForSpeechSeq2Seq.from_pretrained(id, {
          dtype: 'q8',
          progress_callback: cb,
        });
        bundle = { model, processor, size };
        return bundle;
      } catch (err) {
        lastErr = err; // try next CDN
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
  })();
  inflight = { size, p };
  p.catch(() => {
    if (inflight?.p === p) inflight = null;
  });
  return p;
}

const SOT_ID = 50257; // whisper <|startoftranscript|>

async function toWhisperInputs(b: WhisperBundle, samples: Float32Array): Promise<any> {
  return b.processor(samples, { return_tensor: true, sampling_rate: 16000 });
}

export interface TsChunk {
  text: string;
  startMs: number;
  endMs: number;
}

export interface TsTranscript {
  text: string;
  chunks: TsChunk[]; // word-level timestamp chunks (Whisper timestamp tokens)
}

/**
 * Free Arabic transcription, processed in ≤28s chunks (Whisper context
 * window). Forces `language: 'ar'` (without it, Whisper auto-detects and
 * hallucinates English on short recitation samples). `return_timestamps`
 * gives word-level timings usable as a fallback alignment path. One failing
 * chunk no longer kills the whole transcription.
 */
export async function whisperTranscribeChunked(
  b: WhisperBundle,
  samples: Float32Array,
  maxChunks = 4,
  onChunk?: (i: number, total: number) => void,
): Promise<TsTranscript> {
  const sr = 16000;
  const chunk = Math.floor(28 * sr);
  const total = Math.max(1, Math.min(maxChunks, Math.ceil(samples.length / chunk)));
  let text = '';
  const chunks: TsChunk[] = [];
  let failures = 0;
  for (let i = 0; i < total; i++) {
    const seg = samples.subarray(i * chunk, Math.min(samples.length, (i + 1) * chunk));
    if (i > 0 && seg.length < sr * 0.5) break;
    onChunk?.(i, total);
    try {
      const inputs = await toWhisperInputs(b, seg);
      const out: any = await b.model.generate(inputs, {
        language: 'ar',
        task: 'transcribe',
        do_sample: false,
        max_new_tokens: 384,
        condition_on_previous_text: false,
        return_timestamps: true,
      });
      const offsetMs = i * 28 * 1000;
      const rawChunks: any[] = Array.isArray(out?.chunks) ? out.chunks : [];
      const chunkTexts = rawChunks.map((c) => String(c?.text ?? '').trim()).filter(Boolean);
      const t =
        typeof out === 'string' ? out : (String(out?.text ?? chunkTexts.join(' ')).trim());
      if (t) text = text ? `${text} ${t}` : t;
      for (const c of rawChunks) {
        const ct = String(c?.text ?? '').trim();
        if (!ct) continue;
        const ts: any = c?.timestamp;
        const st = Number(ts?.[0] ?? 0) * 1000 + offsetMs;
        const enRaw = ts?.[1];
        const en = enRaw == null ? st + 400 : Number(enRaw) * 1000 + offsetMs;
        chunks.push({ text: ct, startMs: st, endMs: Math.max(st + 60, en) });
      }
    } catch (e) {
      failures++;
      if (failures >= total) throw e; // all chunks failed → let the caller fall back
    }
  }
  return { text, chunks };
}

export interface ForcedAlignmentOut {
  rows: Float32Array[]; // per decoder position: attention over encoder frames (head-averaged)
  tEnc: number; // encoder frame count
  spans: [number, number][]; // word → token span (BPE token counts)
}

/**
 * Constrained / teacher-forced alignment:
 *  1. tokenize the target ayah (tashkeel-stripped, Arabic-normalized)
 *  2. force decoder_input_ids = [SOT, target tokens…] and run ONE forward
 *     with output_attentions (the model may only attend to the given text)
 *  3. extract cross-attention rows → each target token gets a distribution
 *     over 40ms audio frames → timing.
 */
export async function whisperForcedAlignment(
  b: WhisperBundle,
  samples: Float32Array,
  targetWords: string[],
): Promise<ForcedAlignmentOut | null> {
  const norm = targetWords.map(normalizeArabic).filter(Boolean).join(' ');
  if (!norm) return null;

  let encTok: any;
  try {
    encTok = await b.processor.tokenizer(norm, { return_tensor: true, padding: false });
  } catch {
    return null;
  }
  const ids: number[] = Array.from(encTok?.input_ids?.data ?? encTok?.input_ids ?? []);
  if (!ids.length) return null;

  const decoderIds = new Int32Array([SOT_ID, ...ids]);
  let inputs: any;
  try {
    inputs = await toWhisperInputs(b, samples);
  } catch {
    return null;
  }

  let out: any = null;
  const callStyles: Array<() => Promise<any>> = [
    () =>
      b.model(
        { input_features: inputs.input_features, decoder_input_ids: decoderIds },
        { output_attentions: true },
      ),
    () =>
      b.model.forward(
        { input_features: inputs.input_features, decoder_input_ids: decoderIds },
        { output_attentions: true },
      ),
  ];
  for (const f of callStyles) {
    try {
      const o = await f();
      if (o && (o.cross_attentions || o.attentions)) {
        out = o;
        break;
      }
    } catch {
      /* try next call style */
    }
    out = null;
  }
  if (!out) return null;

  const tDec = decoderIds.length;
  const rows = extractCrossRows(out.cross_attentions ?? out.attentions, tDec);
  if (!rows || rows.length !== tDec) return null;

  const spans = await buildSpans(b.processor, targetWords.map(normalizeArabic).filter(Boolean), ids.length);
  return { rows, tEnc: rows[0].length, spans };
}

/** Greedy mapping of words → BPE token spans (per-word token counts) */
async function buildSpans(processor: any, words: string[], totalTokens: number): Promise<[number, number][]> {
  const spans: [number, number][] = [];
  let pos = 0;
  for (let i = 0; i < words.length; i++) {
    let n = 1;
    try {
      const e = await processor.tokenizer(words[i], { return_tensor: true, padding: false });
      n = Math.max(1, e?.input_ids?.data?.length ?? e?.input_ids?.length ?? 1);
    } catch {
      n = 1;
    }
    const end = Math.min(totalTokens, pos + n);
    spans.push([pos, Math.max(pos + (i === words.length - 1 ? 1 : 0), end)]);
    pos = end;
    if (pos >= totalTokens) {
      for (let j = i + 1; j < words.length; j++) spans.push([Math.max(0, totalTokens - 1), totalTokens]);
      break;
    }
  }
  if (spans.length === words.length && totalTokens > 0 && spans[words.length - 1][1] < totalTokens) {
    spans[words.length - 1][1] = totalTokens;
  }
  if (spans.length < words.length) {
    const last = spans[spans.length - 1];
    for (let j = spans.length; j < words.length; j++) spans.push([Math.max(0, last[1] - 1), last[1]]);
  }
  return spans;
}

/**
 * Defensive extractor for cross-attention tensors.
 * Accepts Tensor[1,H,T,S] | Tensor[H,T,S] | Tensor[T,S] | nested arrays/dicts.
 * Averages all heads → Float32Array per decoder position over encoder frames.
 */
function extractCrossRows(x: any, tDec: number): Float32Array[] | null {
  const acc = new Map<number, { sum: Float32Array; count: number }>();
  const visit = (node: any, depth: number) => {
    if (node == null || depth > 5) return;
    if (Array.isArray(node)) {
      for (const v of node) visit(v, depth + 1);
      return;
    }
    if (typeof node !== 'object') return;
    const dims = node.dims;
    const data = node.data;
    if (Array.isArray(dims) && data) {
      const d = dims as number[];
      if (d.length >= 2 && d[d.length - 2] === tDec && d[d.length - 1] > 0) {
        const S = d[d.length - 1];
        const lead = d.slice(0, d.length - 2).reduce((a, v) => a * (v || 1), 1) || 1;
        for (let h = 0; h < lead; h++) {
          const base = h * tDec * S;
          for (let t = 0; t < tDec; t++) {
            let a = acc.get(t);
            if (!a) {
              a = { sum: new Float32Array(S), count: 0 };
              acc.set(t, a);
            }
            const rowBase = base + t * S;
            for (let s = 0; s < S; s++) a.sum[s] += data[rowBase + s];
            a.count++;
          }
        }
      }
      return; // never recurse inside a tensor
    }
    for (const k of Object.keys(node)) visit(node[k], depth + 1);
  };
  visit(x, 0);
  if (acc.size !== tDec) return null;
  const out: Float32Array[] = [];
  for (let t = 0; t < tDec; t++) {
    const a = acc.get(t);
    if (!a || a.count === 0) return null;
    const r = new Float32Array(a.sum);
    for (let s = 0; s < r.length; s++) r[s] /= a.count;
    out.push(r);
  }
  return out;
}
