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
 * تحويل بيانات النموذج إلى أرقام عادية — إصلاح خلل BigInt.
 *
 * بعض نُسخ ONNX Runtime تُرجع معرفات الرموز (token ids) من نوع int64 فتظهر في
 * جافاسكربت على هيئة BigInt، وأي عملية حسابية تخلط BigInt بعددٍ عادي ترمي
 * «Cannot convert a BigInt value to a number» — وهو ما كان يُسقط التحليل على
 * بعض هواتف الجوّال. هنا تُطبَّع كل الأعداد إلى Number قبل استخدامها.
 */
export function toNumberArray(x: unknown): number[] {
  if (x == null) return [];
  const arr: unknown[] = Array.isArray(x) ? x : Array.from(x as ArrayLike<unknown>);
  const out = new Array<number>(arr.length);
  for (let i = 0; i < arr.length; i++) {
    const v = arr[i] as unknown;
    out[i] = typeof v === 'bigint' ? Number(v) : Number(v);
  }
  return out;
}

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

/**
 * ترميز أوزان النموذج (dtype) — والمرمِّزُ خاصّةً.
 *
 * كان يُحمَّل بـ`'q8'` للمكوّنات كلها، ومنها **المرمِّز الصوتي**: وتكميمُه إلى
 * ثمانية أبتات يُفسد تمثيلَ الصوت في ويسبر فيُخرج المفكِّكُ نصًّا فارغًا لتلاوةٍ
 * سليمة — وهو ما كان يُغلق بوّابة النصّ على القارئ المتقن. فيُقدَّم المرمِّزُ
 * بدقّته الكاملة (وهو الوصف المعروف: مرمِّزٌ fp32 ومفكِّكٌ مكمَّم)، ويبقى
 * الترميزُ القديم آخرَ ما يُجرَّب لئلّا يتعذّر التحميل على جهازٍ ضيّق.
 */
const DTYPES: unknown[] = [
  { encoder_model: 'fp32', decoder_model_merged: 'q8' },
  { encoder_model: 'fp32', decoder_model_merged: 'fp32' },
  'q8',
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
    // ملاحظة: تُقرأ كل مخرجات النموذج عبر toNumberArray، فلا يصل BigInt إلى أي حساب.
    const cb = (e: any) => {
      if (e?.status === 'progress' && onProgress) onProgress({ file: e.file ?? 'model', progress: e.progress ?? 0 });
    };
    let lastErr: unknown = null;
    for (const wasmPaths of ORT_WASM_CDN) {
      for (const dtype of DTYPES) {
        try {
          tf.env.backends.onnx.wasm.wasmPaths = wasmPaths;
          const processor = await tf.AutoProcessor.from_pretrained(id, cb);
          const model = await tf.AutoModelForSpeechSeq2Seq.from_pretrained(id, {
            dtype,
            progress_callback: cb,
          });
          bundle = { model, processor, size };
          return bundle;
        } catch (err) {
          lastErr = err; // جرّب ترميزًا آخر ثم مرآةً أخرى
        }
      }
    }
    if (lastErr) console.warn('[tajweed] model load failed:', lastErr);
    throw new Error(
      'تعذّر تنزيل نموذج التعرّف الصوتي — تحقّق من اتصال الإنترنت ثم أعد المحاولة؛ وسيستمر التطبيق بتحليلٍ احتياطي مبسَّط في الأثناء',
    );
  })();
  inflight = { size, p };
  p.catch(() => {
    if (inflight?.p === p) inflight = null;
  });
  return p;
}

/**
 * رموز الموجَّه الخاصّة بويسبر.
 *
 * كان مكتوبًا `SOT_ID = 50257`، وهو **`<|endoftext|>`** لا بداية النصّ: بدايةُ
 * النصّ في النموذج متعدّد اللغات ٥٠٢٥٨ (تحقّقتُ منها من `added_tokens.json`).
 * ومع ذلك كان الموجَّه يخلو من رمز اللغة `<|ar|>` — وهي عينُ علّة «يفكّ الرمز
 * بالإنجليزية» التي أُصلحت في مسار التفريغ، باقيةً في مسار المحاذاة. فكانت
 * التمريرةُ المقيَّدة تفكّ الرمز في حالٍ غير معرَّفة، وعليها تُبنى حدودُ الكلمات
 * ثم أزمنتُها ثم أحكامُ المدّ والغنّة كلُّها.
 *
 * وتُلتمس المعرّفات من المُرمِّز نفسه (فتصحّ مع أيّ نموذج) وهذه احتياطُها.
 */
const SPECIAL_FALLBACK: Record<string, number> = {
  '<|startoftranscript|>': 50258,
  '<|ar|>': 50272,
  '<|transcribe|>': 50359,
  '<|notimestamps|>': 50363,
};

/** معرّف رمزٍ خاصّ من المُرمِّز، وإلا فاحتياطُه المعروف */
function specialId(b: WhisperBundle, token: string): number {
  const id = b.processor?.tokenizer?.model?.tokens_to_ids?.get?.(token);
  return typeof id === 'number' ? id : SPECIAL_FALLBACK[token];
}

/**
 * ترميز نصٍّ **بلا الرموز الخاصّة**.
 *
 * مُرمِّز ويسبر يضيف `<|startoftranscript|><|notimestamps|>` … `<|endoftext|>`
 * تلقائيًّا: فـ«بسم» تُرمَّز إلى خمسة رموز وفيها رمزان فقط. وكان هذا يُفسد عدَّ
 * رموز كل كلمة في `buildSpans` فتُنسب الكلمةُ إلى صوت كلمةٍ أخرى.
 */
async function encodeNoSpecials(b: WhisperBundle, text: string): Promise<number[]> {
  const e = await b.processor.tokenizer(text, { add_special_tokens: false, return_tensor: true, padding: false });
  return toNumberArray(e?.input_ids?.data ?? e?.input_ids ?? []);
}

async function toWhisperInputs(b: WhisperBundle, samples: Float32Array): Promise<any> {
  return b.processor(samples, { return_tensor: true, sampling_rate: 16000 });
}

/**
 * استدعاء Whisper بالطريقة الصحيحة في transformers.js 3.x.
 *
 * `generate` يستقبل **كائنًا واحدًا**: `{ inputs: input_features, language, task, ... }`.
 * كان الكود يمرّر خيارات اللغة/المهمة وسيطًا ثانيًا (`generate(inputs, opts)`)، وهذا
 * الوسيط يُهمل في transformers.js؛ فكان Whisper يعمل بإعداداته الافتراضية (غالبًا
 * الإنجليزية) بدل إجباره على العربية، فتظهر نتيجة «لم يتبيّن اللفظ» لكلامٍ عربيّ واضح.
 */
async function whisperGenerate(b: WhisperBundle, inputs: any, opts: Record<string, unknown>): Promise<any> {
  const features = inputs?.input_features ?? inputs;
  return b.model.generate({ inputs: features, ...opts });
}

/** استخراج المعرّفات من مخرجات generate: Tensor أو sequences أو مصفوفة */
function generatedIds(out: any): number[] {
  if (out == null || typeof out === 'string') return [];
  const seq = out?.sequences ?? out?.sequence ?? out;
  const first = Array.isArray(seq) ? seq[0] : seq;
  if (first?.tolist) {
    const list = first.tolist();
    return toNumberArray(Array.isArray(list?.[0]) ? list[0] : list);
  }
  if (first?.data) {
    const data = toNumberArray(first.data);
    const dims = Array.isArray(first.dims) ? first.dims : [];
    const cols = dims.length >= 2 ? Number(dims[dims.length - 1]) : 0;
    return cols > 0 ? data.slice(0, cols) : data;
  }
  return toNumberArray(first);
}

/** تفكيك مخرجات Whisper مع رموز الأزمنة إلى نصّ ومقاطع، بالطريقة التي يستعملها Pipeline */
async function decodeWhisperAsr(
  b: WhisperBundle,
  out: any,
  chunkSeconds: number,
  returnTimestamps: boolean,
): Promise<{ text: string; chunks: any[] }> {
  if (typeof out?.text === 'string') return { text: out.text.trim(), chunks: Array.isArray(out?.chunks) ? out.chunks : [] };
  const ids = generatedIds(out);
  if (!ids.length) return { text: '', chunks: [] };
  const tok = b.processor?.tokenizer;
  if (tok?._decode_asr) {
    const fe = b.processor?.feature_extractor?.config;
    const maxPos = Number(b.model?.config?.max_source_positions ?? 1500);
    const timePrecision = Number(fe?.chunk_length ?? 30) / Math.max(1, maxPos);
    const [text, opt] = tok._decode_asr([{ tokens: ids, stride: [chunkSeconds, 0, 0] }], {
      time_precision: Number.isFinite(timePrecision) && timePrecision > 0 ? timePrecision : 0.02,
      return_timestamps: returnTimestamps,
      force_full_sequences: false,
    });
    return { text: String(text ?? '').trim(), chunks: Array.isArray(opt?.chunks) ? opt.chunks : [] };
  }
  const text = await b.processor.tokenizer.decode(ids, { skip_special_tokens: true });
  return { text: String(text ?? '').trim(), chunks: [] };
}

/** هل في النصّ حرفٌ عربيٌّ واحد على الأقل؟ (علاماتُ الصمت والموسيقى ليست لفظًا) */
export function hasArabic(s: string): boolean {
  return /[\u0621-\u064A]/.test(String(s ?? ''));
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

  const base: Record<string, unknown> = {
    language: 'ar',
    task: 'transcribe',
    do_sample: false,
    max_new_tokens: 384,
    condition_on_previous_text: false,
  };
  /**
   * محاولةٌ أخيرة بلا فرضِ لغةٍ ولا مهمّة: بعض نسخ النموذج (أو بناءِ WASM) تُخرج
   * نصًّا فارغًا مع رموز اللغة المفروضة، وتُخرج النصّ نفسه إذا تُركت تكتشف اللغة.
   * وإخفاقُ السماع يُغلق بوّابة النصّ على القارئ المتقن، فتُستنفد المحاولات قبله.
   */
  const FREE_DECODE: Record<string, unknown> = { do_sample: false, max_new_tokens: 384 };

  /** المسار البسيط (بلا أزمنة): أثبتُ المسارين — يُفكّ الرمزُ منه يدويًّا */
  async function plainGenerate(inputs: any, opts: Record<string, unknown> = base): Promise<string> {
    const plain: any = await whisperGenerate(b, inputs, opts);
    if (typeof plain === 'string') return plain.trim();
    const ids = generatedIds(plain);
    if (!ids.length) return '';
    const t = await b.processor.tokenizer.decode(ids, { skip_special_tokens: true });
    return String(t ?? '').trim();
  }

  /**
   * generate() with timestamps first (richer output); the plain path is the
   * fallback — **also when the timestamps path yields no Arabic at all**, not
   * only when it throws.
   *
   * كان الرجوع إلى المسار البسيط عند الاستثناء وحده؛ ومسارُ الأزمنة يُخرج أحيانًا
   * نصًّا فارغًا (أو علاماتِ صمتٍ وموسيقى) لتلاوةٍ سليمة — فيُحسب أن القارئ لم
   * يُسمَع له لفظٌ فتُردّ تلاوته الصحيحة. الآن: ما لم يخرج حرفٌ عربيّ واحد
   * تُعاد المحاولة بالمسار البسيط قبل الحكم بأن الصوت لا لفظ فيه.
   */
  async function generateChunk(inputs: any, seconds: number): Promise<{ text: string; chunks: any[] }> {
    let text = '';
    let rawChunks: any[] = [];
    try {
      const out: any = await whisperGenerate(b, inputs, { ...base, return_timestamps: true });
      const decoded = await decodeWhisperAsr(b, out, seconds, true);
      rawChunks = decoded.chunks;
      text = decoded.text || rawChunks.map((c) => String(c?.text ?? '')).join(' ').trim();
    } catch (e) {
      console.warn('[TAHQIQQ] generate(return_timestamps) failed → plain retry:', (e as Error)?.message ?? e);
    }
    if (hasArabic(text)) return { text, chunks: rawChunks };
    let failure: unknown = null;
    for (const opts of [base, FREE_DECODE]) {
      try {
        const t = await plainGenerate(inputs, opts);
        if (hasArabic(t)) return { text: t, chunks: rawChunks };
      } catch (e) {
        failure = e;
      }
    }
    // المسارات كلها أخفقت ولم يخرج نصّ: يُترك للمستدعي ليرجع إلى قياس الصوت
    if (failure && !text) throw failure;
    return { text, chunks: rawChunks };
  }

  for (let i = 0; i < total; i++) {
    const seg = samples.subarray(i * chunk, Math.min(samples.length, (i + 1) * chunk));
    if (i > 0 && seg.length < sr * 0.5) break;
    onChunk?.(i, total);
    try {
      const inputs = await toWhisperInputs(b, seg);
      const { text: t, chunks: rawChunks } = await generateChunk(inputs, seg.length / sr);
      const offsetMs = i * 28 * 1000;
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

/* ------------------------------------------------------------------ */
/* التحقّق من النصّ باحتمال النموذج (لا بتفريغٍ حرّ)                      */
/* ------------------------------------------------------------------ */

/**
 * حدّ الفارق بين احتمال نصّ الآية واحتمال أقرب نصٍّ دخيل.
 *
 * مقيسٌ لا مقدَّر: على خمس آياتٍ من تلاوة الحصري (١:١، ١:٢، ١:٣، ١١٢:١، ١١٤:١)
 * قِيس احتمالُ نصّ الآية واحتمالُ أربعة نصوصٍ دخيلة لكلٍّ منها، فكان نصُّ الآية
 * **أعلاها في كل مرة**، وأدنى فارقٍ ٠٫٤٨ (في «قل هو الله أحد» وهي أقصرها)
 * وأعلاه ٢٫٥٦. وأمّا نصٌّ مهذًى على صوت البسملة فكان دونها بنحو ٤٫٧.
 * فحدُّ ٠٫٣ يقبل الخمس جميعًا ويبقى دون أدناها بهامش.
 */
export const VERIFY_MARGIN = 0.3;

/**
 * أدنى احتمالٍ مطلق يُقبل لنصّ الآية.
 *
 * الهامشُ وحده يُخدع إن قرأ القارئ آيةً بعيدةً ليست من النصوص الدخيلة: فقد يعلو
 * نصُّ الآية تلك النصوصَ وهو مع ذلك بعيدٌ عن الصوت. وفي القياس كان أدنى احتمالٍ
 * لنصٍّ صحيح −٣٫٥٨، وأعلى احتمالٍ لنصٍّ مخالفٍ على صوتٍ ليس له −٢٫٠٧ (وأكثرها
 * دون −٤). فحدُّ −٤ يقبل الصحيح كلَّه ويردّ أكثر المخالف، والهامشُ يردّ باقيه.
 */
export const VERIFY_FLOOR = -4;

/**
 * هل المسموع هو نصُّ الآية؟ — قرارٌ بالمقارنة لا بالعتبة المطلقة.
 *
 * الاحتمالُ المطلق يتقلّب بطول الآية وبالقارئ (بين −١٫٠ و−٣٫٦ في القياس أعلاه)،
 * فلا يصلح عتبةً وحده. وإنما يُقاس نصُّ الآية إلى نصوصٍ دخيلة على **الصوت نفسه**:
 * فإن علاها بهامشٍ فالمقروء هو الآية.
 */
export function decideByLikelihood(target: number, decoys: number[]): { ok: boolean; margin: number } {
  if (!Number.isFinite(target)) return { ok: false, margin: NaN };
  const rivals = decoys.filter((d) => Number.isFinite(d));
  if (!rivals.length) return { ok: false, margin: NaN };
  const margin = target - Math.max(...rivals);
  return { ok: margin >= VERIFY_MARGIN && target >= VERIFY_FLOOR, margin };
}

/**
 * متوسّط لوغاريتم احتمال رموز النصّ إذا فُرضت على المفكِّك مع هذا الصوت.
 *
 * هذا هو **السؤال الذي يحتاجه التطبيق فعلًا**: لا «ماذا قال؟» (وهو أصعب سؤالٍ
 * ممكن، وفيه تهذي النماذجُ الصغيرة على التلاوة المجوَّدة) بل «هل قال هذا النصّ
 * المعلوم؟». وملفّات ONNX الحالية لا تُصدِّر الانتباه، لكنها تُصدِّر `logits` —
 * فهذا الطريق متاحٌ بالنموذج الذي يشحنه التطبيق أصلًا.
 */
export async function whisperScoreText(b: WhisperBundle, samples: Float32Array, text: string): Promise<number> {
  const norm = normalizeArabic(text);
  if (!norm) return NaN;
  const ids = await encodeNoSpecials(b, norm);
  if (!ids.length) return NaN;
  const prefix = [
    specialId(b, '<|startoftranscript|>'),
    specialId(b, '<|ar|>'),
    specialId(b, '<|transcribe|>'),
    specialId(b, '<|notimestamps|>'),
  ].filter((x) => typeof x === 'number');
  const inputs = await toWhisperInputs(b, samples);
  const tf: any = await import('@huggingface/transformers');
  const seq = [...prefix, ...ids];
  const decoderIds = new tf.Tensor('int64', BigInt64Array.from(seq.map((x) => BigInt(x))), [1, seq.length]);
  const out: any = await b.model.forward({ input_features: inputs.input_features, decoder_input_ids: decoderIds });
  const logits = out?.logits;
  const dims: number[] = logits?.dims ?? [];
  if (!logits?.data || dims.length !== 3) return NaN;
  const T = dims[1];
  const V = dims[2];
  const data = logits.data as Float32Array;
  // انتباهُ الموضع p يتنبّأ بالرمز p+1: فرمزُ النصّ j يُتنبّأ به عند (طول البادئة − ١ + j)
  const base = Math.max(0, prefix.length - 1);
  let sum = 0;
  let count = 0;
  for (let j = 0; j < ids.length; j++) {
    const pos = base + j;
    if (pos >= T) break;
    const off = pos * V;
    let max = -Infinity;
    for (let v = 0; v < V; v++) if (data[off + v] > max) max = data[off + v];
    let z = 0;
    for (let v = 0; v < V; v++) z += Math.exp(data[off + v] - max);
    sum += data[off + ids[j]] - max - Math.log(z);
    count++;
  }
  return count ? sum / count : NaN;
}

export interface ForcedAlignmentOut {
  rows: Float32Array[]; // per decoder position: attention over encoder frames (head-averaged)
  tEnc: number; // encoder frame count
  spans: [number, number][]; // word → token span (BPE token counts)
}

/**
 * ملاحظة مقيسة: ملفّات ONNX التي يشحنها `onnx-community` (وسائرُ التحويلات
 * المجرَّبة) تُصدِّر من المفكِّك **`logits` وحدها** بلا أيّ مخرَجِ انتباه — فُحصت
 * أسماءُ مخرجات الجلسة فلم يكن فيها `attentions` ولا `cross_attentions`. فهذه
 * الدالّة تُرجع `null` مع هذه الملفّات مهما صحّ موجَّهُها، ويبقى التوقيتُ على
 * رموز أزمنة ويسبر ثم على قياس الصوت. وقد صُحِّح موجَّهُها على كل حال لتعمل إن
 * صُدِّر الانتباه يومًا. وأمّا التحقّق من النصّ فطريقُه `whisperScoreText` أعلاه.
 *
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

  let ids: number[];
  try {
    ids = await encodeNoSpecials(b, norm);
  } catch {
    return null;
  }
  if (!ids.length) return null;

  // الموجَّه الصحيح: بدءٌ ثم لغةٌ عربية ثم مهمّةُ تفريغ ثم «بلا أزمنة» ثم رموز النصّ
  const prefix = [
    specialId(b, '<|startoftranscript|>'),
    specialId(b, '<|ar|>'),
    specialId(b, '<|transcribe|>'),
    specialId(b, '<|notimestamps|>'),
  ].filter((x) => typeof x === 'number');
  const decoderIds = new Int32Array([...prefix, ...ids]);
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
  const all = extractCrossRows(out.cross_attentions ?? out.attentions, tDec);
  if (!all || all.length !== tDec) return null;

  // انتباهُ الموضع p هو انتباهُ الرمز الذي يليه؛ فرمزُ النصّ j انتباهُه في الصفّ
  // (طول البادئة − ١ + j). وتُقتطع صفوفُ البادئة فلا يبقى إلا صفٌّ لكل رمزِ نصّ.
  const from = Math.max(0, prefix.length - 1);
  const rows = all.slice(from, from + ids.length);
  if (rows.length !== ids.length) return null;

  const spans = await buildSpans(b, targetWords.map(normalizeArabic).filter(Boolean), ids.length);
  return { rows, tEnc: rows[0].length, spans };
}

/**
 * مخطّط الكلمات على رموزها.
 *
 * يُرمَّز كلٌّ بلا الرموز الخاصّة، ومسبوقًا بمسافةٍ إن لم يكن أوّلها — فترميزُ
 * ويسبر يفرّق بين «الله» و« الله». ومجموعُ ما يخرج يطابق ترميزَ الجملة تمامًا،
 * فإن خالفه (رسمٌ غريب) وُزّعت الرموزُ على الكلمات بأطوالها.
 */
async function buildSpans(b: WhisperBundle, words: string[], totalTokens: number): Promise<[number, number][]> {
  const counts: number[] = [];
  let sum = 0;
  for (let i = 0; i < words.length; i++) {
    let n = 1;
    try {
      n = Math.max(1, (await encodeNoSpecials(b, i === 0 ? words[i] : ` ${words[i]}`)).length);
    } catch {
      n = 1;
    }
    counts.push(n);
    sum += n;
  }
  // اختلّ العدّ: تُوزَّع الرموز بأطوال الكلمات بدل إسنادٍ خاطئ
  if (sum !== totalTokens) {
    const chars = words.map((w) => Math.max(1, w.length));
    const tot = chars.reduce((a, c) => a + c, 0);
    let acc = 0;
    return words.map((_, i) => {
      const a = Math.round((totalTokens * acc) / tot);
      acc += chars[i];
      const bEnd = i === words.length - 1 ? totalTokens : Math.round((totalTokens * acc) / tot);
      return [Math.min(a, Math.max(0, totalTokens - 1)), Math.max(a + 1, bEnd)] as [number, number];
    });
  }
  const spans: [number, number][] = [];
  let pos = 0;
  for (const n of counts) {
    spans.push([pos, pos + n]);
    pos += n;
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
    const rawData = node.data;
    // أحيانًا تُرجع الطبقة بيانات int64 (BigInt) — تُحوَّل قبل أي حساب
    const data =
      rawData && typeof BigInt64Array !== 'undefined' && rawData instanceof BigInt64Array
        ? Float64Array.from(rawData, (v) => Number(v))
        : rawData;
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
