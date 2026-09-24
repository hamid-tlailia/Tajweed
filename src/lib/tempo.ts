// TAHQĪQ — عدلة السرعة المرتبطة بالقارئ المرجعي
//
// ============================ لماذا أُعيد بناؤها ============================
// كانت عدلةُ السرعة وسيطَ نِسَب «المقيس ÷ المتوقَّع» على كلمات الآية نفسها،
// محدودةً بين ×٠٫٣٥ و×٣ — أي أن التطبيق **يقيس القارئ بمسطرته هو**. وذلك يصحّ في
// آيةٍ طويلة (فالمدود تُعرف بنسبتها إلى بقية الكلمات)، ويفسد في الآية القصيرة:
// فآيةٌ من كلمةٍ واحدة (الٓمٓ · طه · يسٓ · حمٓ · الرحمن …) تصير نسبتُها هي العدلة
// نفسها، فيطابق المقيسُ المتوقَّعَ **أيًّا كان** — فمن قرأ «الٓمٓ» كلمةً عادية في
// ٠٫٩ ث حُكم «متقنًا» (والصحيح نحو ٢٫٧ ث حدرًا). وكذلك مقارنة القارئ المعتمد.
//
// ============================== البنية الجديدة ==============================
// العدلةُ الآن **تقديرٌ مُرجَّح بمرجع**:
//   ١) المرجع: سرعة القارئ المعتمد للمرتبة المختارة (انظر reciter.ts) — فهو
//      «المسطرة» الأصلية التي يُقاس إليها كل تحليل، وإن لم يختر المستخدم شيخًا.
//   ٢) الدليل: نِسَب الكلمات **الصالحة مسطرةً** وحدها (وزنُها rulerWeight): فلا
//      تُقاس السرعة من المدّ اللازم ولا من الفواتح ولا من كلمة الوقف — فهي موضع
//      الامتحان لا أداة القياس.
//   ٣) الجمع: متوسطٌ لوغاريتمي يُرجِّح الدليلَ بقدر وزنه والمرجعَ بقدر ثابت —
//      فالآية الطويلة تحكمها سرعةُ قارئها، والقصيرة يحكمها المرجع.
//   ٤) الحدود: لا تبعد العدلة عن المرجع إلا في مدًى معقول (×٠٫٦٢–×١٫٦)؛ فمن
//      جاوزه لم يُعدَّل له، بل ظهر أثره في كلماته (أقصر/أطول) وفي ملاحظة السرعة.

import { clamp } from './util';

/** حدود العدلة نسبةً إلى سرعة المرجع (من ×٠٫٦٢ إلى ×١٫٦) */
export const TEMPO_BAND: [number, number] = [0.62, 1.6];
/** وزن المرجع مقيسًا بعدد «الكلمات المسطرة»: كلمةٌ واحدة */
export const PRIOR_STRENGTH = 1;

export interface TempoPrior {
  /** مركز السرعة المتوقَّعة نسبةً إلى نموذج المرتبة — سرعة القارئ المرجعي */
  center: number;
  /** حدود العدلة نسبةً إلى المركز */
  band?: [number, number];
  /** وزن المرجع (بعدد الكلمات المسطرة) */
  strength?: number;
}

export interface TempoSample {
  /** المقيس ÷ المتوقَّع (بنموذج المرتبة) */
  ratio: number;
  /** وزن الكلمة مسطرةً (٠..١) */
  weight: number;
}

export interface TempoEstimate {
  /** العدلة المطبَّقة على أزمنة النموذج (نسبةً إلى نموذج المرتبة) */
  scale: number;
  /** السرعة الخام من الكلمات (وسيطٌ مرجَّح بلا مرجع ولا حدود) — NaN إن لم يُقس شيء */
  raw: number;
  /** السرعة الخام نسبةً إلى المرجع (raw ÷ center) — ١ = بسرعة القارئ المعتمد */
  relative: number;
  /** قوة الدليل: مجموع أوزان الكلمات المقيسة */
  evidence: number;
  /** هل غلب المرجعُ الدليلَ (آيةٌ قصيرة أو كلماتها غير صالحة مسطرة)؟ */
  anchored: boolean;
}

/** المرجع المحايد: نموذج المرتبة نفسه (يُستعمل حين لا يُعرف للقارئ المرجعي قياس) */
export const NEUTRAL_PRIOR: TempoPrior = { center: 1 };

/** الوسيط المرجَّح */
export function weightedMedian(xs: number[], ws: number[]): number {
  const idx = xs.map((_, i) => i).sort((a, b) => xs[a] - xs[b]);
  const total = ws.reduce((a, b) => a + b, 0);
  if (!(total > 0)) return NaN;
  let acc = 0;
  for (const i of idx) {
    acc += ws[i];
    if (acc >= total / 2) return xs[i];
  }
  return xs[idx[idx.length - 1]];
}

/**
 * تقدير عدلة السرعة من كلمات التلاوة مرجَّحًا بالمرجع ومحدودًا حوله.
 * (تُستعمل في التحليل الكامل والمرافقة الحية ومقارنة القارئ المعتمد جميعًا.)
 */
export function estimateTempo(samples: TempoSample[], prior: TempoPrior = NEUTRAL_PRIOR): TempoEstimate {
  const center = prior.center > 0 && Number.isFinite(prior.center) ? prior.center : 1;
  const [bLo, bHi] = prior.band ?? TEMPO_BAND;
  const k = prior.strength ?? PRIOR_STRENGTH;
  const ok = samples.filter((s) => Number.isFinite(s.ratio) && s.ratio > 0.02 && s.weight > 0);
  const evidence = ok.reduce((a, s) => a + s.weight, 0);
  if (!ok.length || !(evidence > 0)) {
    return { scale: center, raw: NaN, relative: 1, evidence: 0, anchored: true };
  }
  const raw = Math.exp(
    weightedMedian(
      ok.map((s) => Math.log(s.ratio)),
      ok.map((s) => s.weight),
    ),
  );
  const logS = (evidence * Math.log(raw) + k * Math.log(center)) / (evidence + k);
  const scale = clamp(Math.exp(logS), center * bLo, center * bHi);
  return { scale, raw, relative: raw / center, evidence, anchored: evidence < k };
}

/** مركز المرجع من سرعة القارئ المعتمد ونموذج المرتبة (مع حدٍّ يمنع الشطط) */
export function priorCenter(referencePace: number | null | undefined, tempoScale: number): number {
  if (!referencePace || !(tempoScale > 0)) return 1;
  const r = referencePace / tempoScale;
  // قارئٌ من غير مرتبة المستخدم (الحصري مرتِّلًا ومن اختار الحدر): سرعتُه ليست
  // مسطرةً لهذه المرتبة — كانت تُحدّ عند ×١٫٦ فيُطالَب الحادر بمدودٍ أطول من الحدر.
  // فالمسطرة حينئذٍ نموذجُ المرتبة نفسه، ويبقى القارئ مرجعَ المقارنة كلمةً كلمة.
  if (r < 0.75 || r > 1.4) return 1;
  return r;
}

/**
 * لينُ الحدّ الأدنى ما دامت سرعة القارئ مجهولة: المرجعُ مرجعٌ لا قيد — فكلمةٌ
 * **عادية** (صالحةٌ مسطرةً) لا يُحكم عليها «أقصر» بأشدّ من نموذج مرتبتها الاسمي
 * قبل أن يتبيّن من التلاوة أن قارئها أبطأ (كأن يكون المرجع الحصري ×١٫١٩ والقارئ
 * بسرعة النموذج). أمّا المدّ اللازم والفواتح فلا لين فيها: هي موضع الامتحان،
 * وحدُّها ستُّ حركاتٍ بسرعة المرجع.
 * @param minMs     أدنى الأوجه بعد العدلة
 * @param scale     العدلة المطبَّقة (نسبةً إلى نموذج المرتبة)
 * @param evidence  قوة الدليل على سرعة القارئ حتى الآن
 * @param weight    وزن الكلمة مسطرةً
 */
export function lenientMin(minMs: number, scale: number, evidence: number, weight: number): number {
  if (!(scale > 1) || evidence >= 1 || weight < 0.5) return minMs;
  const f = 1 + (1 / scale - 1) * (1 - Math.max(0, evidence));
  return minMs * f;
}
