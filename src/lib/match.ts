// TAHQĪQ — مطابقة نصّ التلاوة بالآية: هل قرأ القارئُ **هذه** الآية؟
//
// المقياس هنا هو **بوّابة النصّ**: لا تُجاز تلاوةٌ بأزمنتها وحدها؛ فمن قال
// «يأكل تفاحة» بإيقاعٍ حسن لم يقرأ «الرحمن الرحيم»، ومن قرأ آيةً غيرها لم يقرأها.
//
// كان المقياس القديم يأخذ الأعلى من (كلمات، حروف، ثلاثيات) وكلُّها **استدعاءٌ**
// (نسبةً إلى الآية) فحسب — فآيةُ الكرسي تُطابق «الرحمن الرحيم» ١٠٠٪ لأنها تحويها،
// والحروفُ المشتركة تُعطي أيَّ كلامٍ عربيّ ثلثَ الدرجة. المقياس الجديد:
//   ١) توحيدٌ إملائيّ يقرّب الرسمَ العثمانيّ من الرسم الذي يُخرجه السماع الآلي
//      (الألف الخنجرية → ألف، ءا → ا، …) — فلا يُحاسَب القارئ على فروق الرسم؛
//   ٢) أطولُ تتابعٍ مشترك (LCS) على **الكلمات** بمطابقةٍ ضبابية لكلّ كلمة
//      (خطأٌ إملائيّ يسير في الكلمة لا يُسقطها)؛
//   ٣) الاستدعاء (كم من كلمات الآية سُمع) **والدقّة** (كم من المسموع من الآية)
//      ومتوسّطهما التوافقي F1 هو درجة المطابقة — فالزيادةُ على الآية تُنقص كما
//      يُنقص النقصُ منها.
//
// على ٦٢٣٦ آية بالرسم الإملائيّ مع ضجيجٍ مصطنع للسماع: التلاوة الصحيحة ≥ ٠٫٧٥
// في ٩٥٪ من الحالات (ضجيجٌ خفيف)، وآيةٌ أخرى ≤ ٠٫٢٩ في ٩٩٪ منها؛ فالحدّ ٠٫٥
// يفصل بينهما، وما بين ٠٫٣ و٠٫٥ «ضعيف» (نصفُ آية، أو سماعٌ رديء).

import { normalizeArabic } from './tajweed';

/** حدّ قبول النصّ: F1 على الكلمات بعد التوحيد */
export const TEXT_GATE_OK = 0.5;
/** دونه النصّ بعيدٌ عن الآية بيّنًا؛ وبينهما «ضعيف» */
export const TEXT_GATE_WEAK = 0.3;

/** كلمةٌ من الآية لم تتبيّن في المسموع: أُسقطت، أو سُمع بدلها لفظٌ آخر */
export interface MissingWord {
  index: number;
  word: string;
  /** اللفظ الذي سُمع في موضعها (إن سُمع شيء لا يشبهها) */
  heard?: string;
}

export interface TranscriptScore {
  /** درجة المطابقة 0..1 (F1 بين الاستدعاء والدقّة) */
  match: number;
  /** نسبة كلمات الآية التي سُمعت */
  recall: number;
  /** نسبة الكلمات المسموعة التي هي من الآية */
  precision: number;
  /** الكلمات المسموعة (بعد التوحيد) وهل وقعت في موضعها من الآية؛ prefix = بسملةٌ قبل الآية */
  predWords: { word: string; ok: boolean; prefix?: boolean }[];
  /** لكلّ كلمة من الآية: هل وُجدت في المسموع */
  targetHit: boolean[];
  /**
   * كلمات الآية التي لم تتبيّن ولا ما يشبهها في موضعها (فليست تحريفَ سماعٍ يسير،
   * بل إسقاطٌ أو إبدال) — وهي التي تُغلق البوّابة وإن حسُنت النسبة الكلية.
   */
  missing: MissingWord[];
  /** كلماتٌ من الآية سُمع في موضعها لفظٌ **يشبهها** (تحريفُ سماعٍ محتمل) — تُعدّ مسموعة */
  garbled: number;
  /** بدأ المسموع بالبسملة وليست من الآية (أول السورة) — فأُخرجت من الحساب */
  basmalaPrefix: boolean;
  /** لا حروف عربية في النصّ المسموع — يُلجأ عندها لتغطية الصوت */
  empty: boolean;
}

/**
 * توحيدٌ إملائيّ للمطابقة: يقرّب الرسم العثمانيّ (وما يخرجه السماع الآلي من
 * رسمٍ إملائيّ) إلى صورةٍ واحدة قبل `normalizeArabic`.
 *
 * لا يُستعمل هذا في محرّك الأحكام (فهو يعتمد هويّةَ الكلمة بالرسم العثمانيّ
 * كما يُخرجها `normalizeArabic`، مثل «الي» لـ«إِلَىٰ») — بل في المطابقة النصّية
 * فقط: نصّ الآية، والمسموع، ومطابقة كلمات التوقيت.
 */
export function normalizeForMatch(s: string): string {
  return normalizeArabic(
    s
      .replace(/[\u200A\u2060\u200C\uFEFF\u0640]/g, '')
      .replace(/و\u064E\u0670/g, 'وا') // واوٌ مفتوحة فوقها خنجرية (ٱلسَّمَـٰوَٰت · صَلَوَٰت): واوٌ منطوقة ثم ألف
      .replace(
        /[\u064B-\u0658\u06D6-\u06DC\u06DF-\u06E2\u06E4-\u06E6\u06E8\u06EA-\u06ED\u08F0-\u08F2]/g,
        '',
      )
      .replace(/ى\u0670/g, 'ى') // ألف مقصورة فوقها خنجرية (إِلَىٰ · مُوسَىٰ) → المقصورة تكفي
      .replace(/و\u0670/g, 'ا') // واو فوقها خنجرية (ٱلصَّلَوٰة · ٱلزَّكَوٰة · ٱلۡحَيَوٰة) → ألف
      .replace(/\u0670/g, 'ا') // ألف خنجرية (ٱلرَّحۡمَٰن · ٱلۡعَٰلَمِين · ٱلسَّمَٰوَٰت) → ألف
      .replace(/\u06E7/g, 'ي') // ياء صغيرة عالية (إِبۡرَٰهِـۧم) → ياء
      .replace(/ء[اٰ]/g, 'ا') // ءَا (ءَامَنُوا۟ · ءَايَٰت · ٱلۡقُرۡءَان) → آ → ا
      .replace(/(^|\s)ء/g, '$1ا'), // همزة على السطر أول الكلمة → ألف
  );
}

/** كلمات النصّ بعد التوحيد */
export function matchTokens(s: string): string[] {
  return normalizeForMatch(s).split(/\s+/).filter(Boolean);
}

function arabicOnly(s: string): string {
  return s.replace(/[^\u0600-\u06FF\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

/** مسافة تحرير محدودة (Wagner–Fischer) */
function editDistance(a: string, b: string): number {
  const n = a.length;
  const m = b.length;
  const dp: number[] = Array.from({ length: m + 1 }, (_, j) => j);
  for (let i = 1; i <= n; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= m; j++) {
      const tmp = dp[j];
      dp[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[j], dp[j - 1]);
      prev = tmp;
    }
  }
  return dp[m];
}

/**
 * كلمتان «متقاربتان»: تحريفٌ يسير لا يجاوز ثلث حروف **الأقصر** منهما (وحرفًا
 * واحدًا على الأقل) — والقصار جدًّا (حرفان) بالمطابقة التامّة، وإلا طابقت «من»
 * كلَّ «ما» و«مِن» كلَّ «مَن» في الآيات الأخرى.
 */
export function editClose(a: string, b: string): boolean {
  if (a === b) return true;
  const n = a.length;
  const m = b.length;
  const lo = Math.min(n, m);
  if (lo <= 2) return false;
  if (Math.abs(n - m) > 2) return false;
  if (n * m > 800) return false;
  const maxD = Math.max(1, Math.floor(lo / 3));
  return editDistance(a, b) <= maxD;
}

/** أطول تتابعٍ مشترك على الكلمات بمطابقةٍ ضبابية، مع استرجاع مواضع الإصابة وأزواجها */
function fuzzyWordLcs(
  p: string[],
  t: string[],
): { hits: number; okP: boolean[]; okT: boolean[]; pairs: [number, number][] } {
  const n = p.length;
  const m = t.length;
  const okP = new Array<boolean>(n).fill(false);
  const okT = new Array<boolean>(m).fill(false);
  const pairs: [number, number][] = []; // [فهرس كلمة الآية، فهرس الكلمة المسموعة]
  if (!n || !m) return { hits: 0, okP, okT, pairs };

  if (n * m > 4_000_000) {
    // نصوصٌ طويلة جدًّا: عدُّ التقاطع بالحقيبة (بلا ترتيب)
    const counts = new Map<string, number>();
    for (const w of p) counts.set(w, (counts.get(w) ?? 0) + 1);
    let hits = 0;
    t.forEach((w, j) => {
      const c = counts.get(w) ?? 0;
      if (c > 0) {
        hits++;
        okT[j] = true;
        counts.set(w, c - 1);
      }
    });
    return { hits, okP, okT, pairs };
  }

  const dp: Int32Array[] = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      const hit = p[i] === t[j] || editClose(p[i], t[j]);
      dp[i][j] = hit ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (p[i] === t[j] || editClose(p[i], t[j])) {
      okP[i] = true;
      okT[j] = true;
      pairs.push([j, i]);
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
    else j++;
  }
  return { hits: dp[0][0], okP, okT, pairs };
}

/**
 * «يشبهها»: تحريفٌ يبلغ نصف الحروف — أوسع من «متقاربة» (ثلث الحروف). لا يُعدّ
 * إصابةً في النسبة، لكنه يشهد أن القارئ نطق الكلمة ولم يُبدلها بلفظٍ آخر
 * (فـ«الفلق» و«الناس» لا تتشابهان، و«المستقيم» و«المستقين» تتشابهان).
 */
function similarClose(a: string, b: string): boolean {
  // أداة التعريف لا تشهد بالتشابه («الناس» و«الفلق» تشتركان فيها فحسب)
  const strip = (w: string) => (w.length > 4 && w.startsWith('ال') ? w.slice(2) : w);
  const x = strip(a);
  const y = strip(b);
  const n = x.length;
  const m = y.length;
  if (Math.min(n, m) < 2 || Math.abs(n - m) > 3 || n * m > 800) return false;
  return editDistance(x, y) <= Math.max(1, Math.floor(Math.max(n, m) / 2.5));
}

/** هل تبدأ الكلمات المسموعة بالبسملة؟ (٣ من كلماتها الأربع في أول خمس كلمات) */
function predStartsWithBasmala(p: string[]): number {
  if (p.length < 3) return 0;
  const head = p.slice(0, 5);
  const r = fuzzyWordLcs(head, [...BASMALA]);
  if (r.hits < 3) return 0;
  // آخر كلمةٍ مسموعة أُصيبت من البسملة تحدّ الطول المحذوف
  let last = -1;
  r.okP.forEach((ok, k) => {
    if (ok) last = k;
  });
  return last + 1;
}

function f1(recall: number, precision: number): number {
  return recall + precision > 0 ? (2 * recall * precision) / (recall + precision) : 0;
}

/**
 * مطابقةُ كلمةٍ من الآية لمقطعٍ من كلمةٍ ملتصقة: القصار (≤ ٣ أحرف) بالمطابقة
 * التامّة فقط (وإلا طابقت «من» أيَّ حرفين فيهما ميم)، والطوال بثلث الحروف.
 */
function segmentClose(seg: string, w: string): boolean {
  if (seg === w) return true;
  if (w.length <= 3) return false;
  return editClose(seg, w);
}

/**
 * الكلمة الملتصقة: قد يُخرج السماعُ كلماتٍ متتاليةً بلا مسافة («منشرماخلق»).
 * يُبحث في الكلمة عن أطول سلسلةٍ من كلمات الآية **المتتالية** تُغطّيها بالترتيب
 * (كلٌّ منها في موضعها من الحروف)، ولا تُقبل إلا إن غطّت معظم حروفها —
 * فلا تُنتزع كلماتٌ قصار من كلامٍ آخر. يُرجع فهارس كلمات الآية المغطّاة.
 */
function segmentGlued(token: string, t: string[]): number[] {
  if (token.length < 5) return [];
  let best: number[] = [];
  let bestCover = 0;
  for (let j0 = 0; j0 < t.length; j0++) {
    if (t.length - j0 <= best.length) break;
    const run: number[] = [];
    let pos = 0;
    let j = j0;
    while (j < t.length && pos < token.length) {
      const w = t[j];
      let took = 0;
      for (const len of [w.length, w.length - 1, w.length + 1]) {
        if (len < 1 || pos + len > token.length) continue;
        if (segmentClose(token.slice(pos, pos + len), w)) {
          took = len;
          break;
        }
      }
      if (!took) break;
      run.push(j);
      pos += took;
      j++;
    }
    if (run.length >= 2 && pos >= 0.7 * token.length && (run.length > best.length || (run.length === best.length && pos > bestCover))) {
      best = run;
      bestCover = pos;
    }
  }
  return best;
}

const BASMALA = matchTokens('بِسۡمِ ٱللَّهِ ٱلرَّحۡمَـٰنِ ٱلرَّحِیمِ');

/** هل تبدأ كلمات الآية بالبسملة (أول آيةٍ من السورة في المصحف)؟ */
function startsWithBasmala(t: string[]): boolean {
  return t.length > BASMALA.length && BASMALA.every((w, k) => t[k] === w);
}

/**
 * درجة تطابق ما سمعه التطبيق من التلاوة مع نصّ الآية.
 *
 * `target` نصّ الآية (بأيّ رسم؛ يُوحَّد هنا)، و`pred` النصّ المسموع.
 * إن كانت الآيةُ مبدوءةً بالبسملة (أول السورة) ولم يقرأها القارئ، حُوسب على
 * الآية دونها — فالبسملة ليست من الآية عند الجمهور، ولا يُعاب تركُها هنا
 * (وتظهر كلماتُها في التوقيت «لم تُسمع» على كل حال).
 */
export function scoreTranscriptMatch(pred: string, target: string): TranscriptScore {
  const t = matchTokens(target);
  const arabic = arabicOnly(pred);
  const emptyResult = (empty: boolean): TranscriptScore => ({
    match: 0,
    recall: 0,
    precision: 0,
    predWords: [],
    targetHit: t.map(() => false),
    missing: t.map((w, index) => ({ index, word: w })),
    garbled: 0,
    basmalaPrefix: false,
    empty,
  });
  if (!t.length) return emptyResult(true);
  if (!arabic) return emptyResult(true);
  const pAll = matchTokens(arabic);
  if (!pAll.length) return emptyResult(true);

  // بسملةٌ في أول المسموع وليست من الآية (أول السورة): تُخرج من الحساب
  const targetIsBasmala = t.length === BASMALA.length && BASMALA.every((w, k) => t[k] === w);
  const prefixLen = startsWithBasmala(t) || targetIsBasmala ? 0 : predStartsWithBasmala(pAll);
  const p = pAll.slice(prefixLen);
  if (!p.length) {
    const r = emptyResult(false);
    r.predWords = pAll.map((w) => ({ word: w, ok: true, prefix: true }));
    r.basmalaPrefix = true;
    return r;
  }

  /** المطابقة على قائمة كلماتٍ للآية (كاملةً أو بلا بسملة) */
  const evaluate = (tt: string[]) => {
    const r = fuzzyWordLcs(p, tt);
    let hits = r.hits;
    let units = p.length; // وحدات المسموع (الكلمة الملتصقة تُعدّ بعدد ما فيها)
    // الكلمات الملتصقة: ما لم يُطابَق ككلمةٍ واحدة قد يكون كلماتٍ متتالية
    p.forEach((tok, k) => {
      if (r.okP[k]) return;
      const run = segmentGlued(tok, tt).filter((j) => !r.okT[j]);
      if (run.length < 2) return;
      r.okP[k] = true;
      for (const j of run) {
        r.okT[j] = true;
        r.pairs.push([j, k]);
      }
      hits += run.length;
      units += run.length - 1;
    });
    r.pairs.sort((a, b) => a[0] - b[0]);
    return { hits, okP: r.okP, okT: r.okT, pairs: r.pairs, recall: hits / tt.length, precision: hits / units, tt };
  };

  let best = evaluate(t);
  let optionalBasmala = false;

  // البسملة اختيارية في أول السورة (إن بقيت في نصّ الآية من المصدر)
  if (startsWithBasmala(t) && !BASMALA.every((_, k) => best.okT[k])) {
    const r = evaluate(t.slice(BASMALA.length));
    if (f1(r.recall, r.precision) > f1(best.recall, best.precision)) {
      best = {
        ...r,
        okT: [...BASMALA.map(() => false), ...r.okT],
        pairs: r.pairs.map(([j, k]) => [j + BASMALA.length, k] as [number, number]),
        tt: t,
      };
      optionalBasmala = true;
    }
  }

  // ما لم يتبيّن من كلمات الآية: تحريفُ سماعٍ (يشبهها لفظٌ في موضعها) أم إسقاط/إبدال؟
  const usedP = new Set<number>(best.pairs.map(([, k]) => k));
  const garbledP = new Set<number>();
  const missing: MissingWord[] = [];
  for (let j = 0; j < t.length; j++) {
    if (best.okT[j]) continue;
    if (optionalBasmala && j < BASMALA.length) continue; // بسملةٌ اختيارية لم تُقرأ
    // فجوة الموضع: بين آخر إصابةٍ قبلها وأول إصابةٍ بعدها
    let lo = -1;
    let hi = p.length;
    for (const [tj, pk] of best.pairs) {
      if (tj < j) lo = Math.max(lo, pk);
      else if (tj > j) hi = Math.min(hi, pk);
    }
    let bestK = -1;
    let bestD = Infinity;
    for (let k = lo + 1; k < hi; k++) {
      if (usedP.has(k)) continue;
      const d = editDistance(p[k], t[j]);
      if (d < bestD) {
        bestD = d;
        bestK = k;
      }
    }
    if (bestK >= 0 && similarClose(p[bestK], t[j])) {
      usedP.add(bestK);
      garbledP.add(bestK);
    } else {
      missing.push({ index: j, word: t[j], heard: bestK >= 0 ? p[bestK] : undefined });
      if (bestK >= 0) usedP.add(bestK);
    }
  }

  return {
    match: Math.max(0, Math.min(1, f1(best.recall, best.precision))),
    recall: best.recall,
    precision: best.precision,
    predWords: [
      ...pAll.slice(0, prefixLen).map((w) => ({ word: w, ok: true, prefix: true })),
      ...p.map((w, k) => ({ word: w, ok: best.okP[k] || garbledP.has(k) })),
    ],
    targetHit: best.okT,
    missing,
    garbled: garbledP.size,
    basmalaPrefix: prefixLen > 0,
    empty: false,
  };
}

/**
 * كم كلمةً يُغتفر غيابها (إسقاطًا أو إبدالًا) قبل أن تُغلق البوّابة: لا شيء في
 * القصار (فآيةٌ من أربع كلمات بُدّلت إحداها آيةٌ أخرى)، وكلمةٌ واحدة في المتوسطة
 * (السماع الآلي يُسقط أحيانًا كلمةً قصيرة في التلاوة المتصلة)، وعُشرٌ في الطوال.
 */
export function allowedMissing(n: number): number {
  return n <= 5 ? 0 : n <= 12 ? 1 : Math.floor(n / 10);
}

/**
 * تصنيف المطابقة إلى حكمٍ على النصّ:
 *   - النسبة الكلية (F1) دون ٠٫٣ → بعيدٌ عن الآية؛ دون ٠٫٥ → ضعيف.
 *   - ثم **كلَّ كلمةٍ من الآية**: ما لم تُسمع ولا ما يشبهها في موضعها فهي إسقاطٌ
 *     أو إبدال (كـ«الناس» موضع «الفلق»)، ولا يُغتفر منها شيء في الآيات القصار —
 *     فمن قرأ آيةً تشبه الآية في أكثر كلماتها لم يقرأ الآية.
 */
export function textCheckOf(score: number | Pick<TranscriptScore, 'match' | 'missing' | 'targetHit'>): 'ok' | 'weak' | 'mismatch' {
  const match = typeof score === 'number' ? score : score.match;
  if (match < TEXT_GATE_WEAK) return 'mismatch';
  if (match < TEXT_GATE_OK) return 'weak';
  if (typeof score !== 'number' && score.missing.length > allowedMissing(score.targetHit.length)) return 'weak';
  return 'ok';
}
