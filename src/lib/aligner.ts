// TAHQĪQ — التوقيت الدقيق: محاذاةٌ قسرية بنموذج CTC
//
// ============================ لماذا هذا الملفّ ============================
// أزمنةُ الكلمات هي مدارُ التطبيق كلِّه: المدُّ والغنّة إنما يُحكم عليهما بالزمن.
// وكان التوقيت يُؤخذ من **قياس الطاقة وحده**: يُوزَّع الصوتُ المسموع على الكلمات
// بنسبة أزمنتها المتوقَّعة — فالنموذج يقيس نفسه بنفسه. وأمّا محاذاةُ ويسبر
// بالانتباه فلا سبيل إليها: ملفّات ONNX المنشورة لا تُصدِّر الانتباه أصلًا
// (انظر whisper.ts) فتُرجع null دائمًا.
//
// والبديلُ المقيس: نموذجُ CTC مبنيٌّ للمحاذاة القسرية (MMS forced aligner،
// ١١٣٠ لغة). يُعطي لكل إطارٍ (٢٠ م.ث) احتمالَ كل حرف، فتُحاذى حروفُ الآية
// **المعلومة** على الصوت بخوارزمية Viterbi، فتخرج حدودُ كل كلمة من الصوت نفسه
// لا من النموذج الزمني.
//
// ============================== ما قيس فعلًا ==============================
// قُورنت الطريقتان بأزمنةٍ مرجعية من Quran.com لتلاوة الحصري نفسها (٩ آيات من
// الفلق والناس)، بمتوسّط الخطأ المطلق في مدّة الكلمة:
//     قياس الطاقة = ٥٨٠ م.ث   ·   محاذاة CTC = ٤١١ م.ث
// وأثرُها أظهر في أسوأ الحالات (١١٣:٣ من ٩٩٨ إلى ٣٢٩، و١١٣:٤ من ١٢٠٨ إلى ٣٩٨).
// وغلبت الطاقةُ في آيتين، فليست CTC أفضلَ في كل حال.
//
// وتحفّظان لازمان: المرجع نفسه مقطَّعٌ آليًّا لا يدويًّا، والخطآن كلاهما كبير
// (الحركة نحو ٢٥٠ م.ث) — فالتوقيت أدقُّ نسبيًّا لا قاطعًا.
//
// ولأن النموذج يُنزَّل بنحو ٢٤٠ م.ب فهو **اختياريّ**: لا يُجلب إلا لمن طلبه.

import type { WordSpan } from './types';

/** معرّف النموذج ومعاملاته — نموذجٌ مبنيٌّ للمحاذاة القسرية لا للتفريغ */
export const ALIGNER_MODEL = 'onnx-community/mms-300m-1130-forced-aligner-ONNX';

/**
 * مفردات النموذج (حرفٌ لاتيني → معرّفه): تُقرأ من المُرمِّز، وهذه احتياطُها
 * إن تعذّر — وهي مفردات النموذج نفسها (٣١ رمزًا، لاتينيةٌ محضة).
 */
export const ALIGNER_VOCAB: Record<string, number> = {
  '<blank>': 0, '<pad>': 1, '</s>': 2, '<unk>': 3,
  a: 4, i: 5, e: 6, n: 7, o: 8, u: 9, t: 10, s: 11, r: 12, m: 13, k: 14, l: 15,
  d: 16, g: 17, h: 18, y: 19, b: 20, p: 21, w: 22, c: 23, v: 24, j: 25, z: 26,
  f: 27, "'": 28, q: 29, x: 30,
};

/**
 * نقلُ الحرف العربيّ إلى اللاتينيّ.
 *
 * مفرداتُ النموذج لاتينيةٌ محضة (فهو مدرَّبٌ على نصٍّ منقول)، فيلزم نقلُ نصّ
 * الآية قبل محاذاته. والنقلُ هنا **صوتيٌّ تقريبيّ** لا معياريّ: يكفي أن يوافق
 * كلُّ حرفٍ صوتَه، فالمحاذاةُ القسرية تحتمل التقريب لأن التتابع مفروضٌ سلفًا.
 * والشدّةُ تضعيفُ ما قبلها، والسكونُ لا صوت له، والتنوينُ نونٌ ساكنة.
 */
const LETTERS: Record<string, string> = {
  'ا': 'a', 'أ': 'a', 'إ': 'i', 'آ': 'aa', 'ٱ': 'a', 'ء': 'a', 'ى': 'a',
  'ب': 'b', 'ت': 't', 'ث': 'th', 'ج': 'j', 'ح': 'h', 'خ': 'kh', 'د': 'd', 'ذ': 'dh',
  'ر': 'r', 'ز': 'z', 'س': 's', 'ش': 'sh', 'ص': 's', 'ض': 'd', 'ط': 't', 'ظ': 'z',
  'ع': 'a', 'غ': 'gh', 'ف': 'f', 'ق': 'q', 'ك': 'k', 'ل': 'l', 'م': 'm', 'ن': 'n',
  'ه': 'h', 'ة': 'h', 'و': 'w', 'ؤ': 'w', 'ي': 'y', 'ئ': 'y',
  'َ': 'a', // فتحة
  'ِ': 'i', // كسرة
  'ُ': 'u', // ضمة
  'ٰ': 'a', // ألف خنجرية
  'ً': 'an', // تنوين فتح
  'ٍ': 'in', // تنوين كسر
  'ٌ': 'un', // تنوين ضم
  'ْ': '', // سكون: لا صوت له
};
/** الشدّة: تُضعِّف الحرف الذي قبلها */
const SHADDA = 'ّ';

/** تنوين الفتح: تتبعه ألفٌ مرسومةٌ لا تُنطق («عَلِيمًا» ← aaliyman) */
const TANWEEN_FATH = '\u064B';
const ALIFS = 'اٱأ';

/** نقلُ كلمةٍ عربية إلى حروفٍ لاتينية بمفردات النموذج */
export function romanize(word: string): string {
  let out = '';
  const chars = [...word];
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    if (ch === SHADDA) {
      out += out.slice(-1);
      continue;
    }
    // الألفُ التي بعد تنوين الفتح مرسومةٌ لا منطوقة، فلا تُنقل
    if (ALIFS.includes(ch) && chars[i - 1] === TANWEEN_FATH) continue;
    const m = LETTERS[ch];
    if (m !== undefined) out += m;
  }
  return out.replace(/[^a-z']/g, '');
}

/**
 * محاذاةٌ قسرية بخوارزمية Viterbi على شبكة CTC.
 *
 * تُبنى الشبكة على تتابع الحروف مع فراغٍ (blank) بينها وحولها — وهو تمثيل CTC
 * المعتاد — ثم يُختار أرجحُ مسارٍ يمرّ بالحروف كلِّها بالترتيب. فلكل حرفٍ إطاراتُه
 * من الصوت، ومنها حدودُ كلمته.
 *
 * @param logProbs لوغاريتم الاحتمالات مسطَّحًا [إطار × مفردة]
 * @param frames   عدد الإطارات
 * @param vocabSize عدد المفردات
 * @param tokens   معرّفات حروف النصّ بالترتيب
 * @param owner    لكل حرفٍ رقمُ كلمته
 * @param wordCount عدد الكلمات
 * @param durationMs مدة التسجيل (لتحويل الإطار إلى زمن)
 * @param blank    معرّف الفراغ
 */
export function ctcAlign(
  logProbs: Float32Array,
  frames: number,
  vocabSize: number,
  tokens: number[],
  owner: number[],
  wordCount: number,
  durationMs: number,
  blank = 0,
): { spans: (WordSpan | null)[]; score: number } | null {
  const S = 2 * tokens.length + 1;
  if (!frames || !tokens.length || frames < tokens.length) return null;
  // حالةٌ زوجية = فراغ، وفردية = حرفُ النصّ الذي يقابلها
  const labelAt = (s: number) => (s % 2 === 0 ? blank : tokens[(s - 1) / 2]);
  const NEG = -1e30;

  let prev = new Float64Array(S).fill(NEG);
  const back = new Int32Array(frames * S);
  prev[0] = logProbs[labelAt(0)];
  if (S > 1) prev[1] = logProbs[labelAt(1)];

  for (let t = 1; t < frames; t++) {
    const cur = new Float64Array(S).fill(NEG);
    const row = t * vocabSize;
    for (let s = 0; s < S; s++) {
      let best = prev[s];
      let from = s;
      if (s > 0 && prev[s - 1] > best) {
        best = prev[s - 1];
        from = s - 1;
      }
      // القفزُ فوق فراغٍ لا يجوز بين حرفين متماثلين (وإلا اندمجا في CTC)
      if (s > 1 && labelAt(s) !== blank && labelAt(s) !== labelAt(s - 2) && prev[s - 2] > best) {
        best = prev[s - 2];
        from = s - 2;
      }
      if (best <= NEG) continue;
      cur[s] = best + logProbs[row + labelAt(s)];
      back[t * S + s] = from;
    }
    prev = cur;
  }

  // المسار ينتهي عند آخر حرفٍ أو الفراغ الذي بعده
  let s = prev[S - 1] >= prev[S - 2] ? S - 1 : S - 2;
  const total = prev[s];
  if (!(total > NEG)) return null;
  const path = new Int32Array(frames);
  for (let t = frames - 1; t >= 0; t--) {
    path[t] = s;
    if (t > 0) s = back[t * S + s];
  }

  const msPerFrame = durationMs / frames;
  const first = new Array<number>(wordCount).fill(-1);
  const last = new Array<number>(wordCount).fill(-1);
  for (let t = 0; t < frames; t++) {
    const st = path[t];
    if (st % 2 === 0) continue; // فراغ
    const w = owner[(st - 1) / 2];
    if (first[w] < 0) first[w] = t;
    last[w] = t;
  }
  const spans = first.map((f, i) =>
    f < 0 ? null : { startMs: f * msPerFrame, endMs: (last[i] + 1) * msPerFrame },
  );
  return { spans, score: total / frames };
}

/** تحويل مخرَج النموذج الخام إلى لوغاريتم الاحتمالات (log-softmax لكل إطار) */
export function toLogProbs(logits: Float32Array, frames: number, vocabSize: number): Float32Array {
  const out = new Float32Array(frames * vocabSize);
  for (let t = 0; t < frames; t++) {
    const off = t * vocabSize;
    let max = -Infinity;
    for (let v = 0; v < vocabSize; v++) if (logits[off + v] > max) max = logits[off + v];
    let z = 0;
    for (let v = 0; v < vocabSize; v++) z += Math.exp(logits[off + v] - max);
    const logZ = max + Math.log(z);
    for (let v = 0; v < vocabSize; v++) out[off + v] = logits[off + v] - logZ;
  }
  return out;
}

/** حروفُ الكلمات بمعرّفاتها مع نسبة كل حرفٍ إلى كلمته */
export function tokenizeWords(
  words: string[],
  vocab: Record<string, number> = ALIGNER_VOCAB,
): { tokens: number[]; owner: number[] } {
  const tokens: number[] = [];
  const owner: number[] = [];
  words.forEach((w, i) => {
    for (const ch of romanize(w)) {
      const id = vocab[ch];
      if (id !== undefined) {
        tokens.push(id);
        owner.push(i);
      }
    }
  });
  return { tokens, owner };
}

/* ------------------------------------------------------------------ */
/* تحميل النموذج وتشغيله                                               */
/* ------------------------------------------------------------------ */

interface AlignerBundle {
  model: any;
  processor: any;
  vocab: Record<string, number>;
}

let bundle: AlignerBundle | null = null;
let inflight: Promise<AlignerBundle> | null = null;

/** ترميزاتٌ تُجرَّب بالترتيب: الأصغر أولًا (النموذج كبير) */
const DTYPES = ['q4', 'q4f16', 'int8', 'quantized'];

export function alignerLoaded(): boolean {
  return !!bundle;
}

export function loadAligner(onProgress?: (p: number) => void): Promise<AlignerBundle> {
  if (bundle) return Promise.resolve(bundle);
  if (inflight) return inflight;
  const p = (async (): Promise<AlignerBundle> => {
    const tf: any = await import('@huggingface/transformers');
    try {
      tf.env.allowLocalModels = false;
      // خزنُ المتصفح يجعل التنزيل مرةً واحدة — ولا وجود له خارج المتصفح
      if (typeof caches !== 'undefined') tf.env.useBrowserCache = true;
    } catch {
      /* noop */
    }
    const cb = (e: any) => {
      if (e?.status === 'progress' && onProgress) onProgress(e.progress ?? 0);
    };
    let lastErr: unknown = null;
    for (const dtype of DTYPES) {
      try {
        const processor = await tf.AutoProcessor.from_pretrained(ALIGNER_MODEL, { progress_callback: cb });
        const model = await tf.AutoModelForCTC.from_pretrained(ALIGNER_MODEL, { dtype, progress_callback: cb });
        let vocab = ALIGNER_VOCAB;
        try {
          const map = processor?.tokenizer?.model?.tokens_to_ids;
          if (map?.get) {
            const read: Record<string, number> = {};
            for (const ch of Object.keys(ALIGNER_VOCAB)) {
              const id = map.get(ch);
              if (typeof id === 'number') read[ch] = id;
            }
            if (Object.keys(read).length >= 26) vocab = read;
          }
        } catch {
          /* تُستعمل المفردات الاحتياطية */
        }
        bundle = { model, processor, vocab };
        return bundle;
      } catch (err) {
        lastErr = err;
      }
    }
    // يُذكر سببُ الإخفاق: بغيره لا يُعرف أهو الشبكةُ أم الترميزُ أم غيرهما
    const why = lastErr instanceof Error ? lastErr.message : String(lastErr ?? '');
    throw new Error(`تعذّر تنزيل نموذج التوقيت الدقيق — تحقّق من الاتصال ثم أعد المحاولة${why ? ` (${why})` : ''}`);
  })();
  inflight = p;
  p.catch(() => {
    inflight = null;
  });
  return p;
}

/**
 * حدودُ كلمات الآية من الصوت بمحاذاةٍ قسرية. تُرجع null إن تعذّر شيء — فيبقى
 * قياسُ الصوت كما هو، ولا يُحرم القارئُ نتيجةً.
 */
export async function alignWordsCtc(
  samples: Float32Array,
  words: string[],
  durationMs: number,
): Promise<{ spans: (WordSpan | null)[]; score: number } | null> {
  if (!words.length) return null;
  const b = await loadAligner();
  const { tokens, owner } = tokenizeWords(words, b.vocab);
  if (!tokens.length) return null;
  const inputs = await b.processor(samples, { sampling_rate: 16000 });
  const out: any = await b.model(inputs);
  const dims: number[] = out?.logits?.dims ?? [];
  if (!out?.logits?.data || dims.length !== 3) return null;
  const frames = dims[1];
  const vocabSize = dims[2];
  const logProbs = toLogProbs(out.logits.data as Float32Array, frames, vocabSize);
  return ctcAlign(
    logProbs,
    frames,
    vocabSize,
    tokens,
    owner,
    words.length,
    durationMs,
    b.vocab['<blank>'] ?? 0,
  );
}
