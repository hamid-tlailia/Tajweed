// TAHQĪQ — التحكيم: مقارنة تلاوة المستخدم بتلاوة القارئ المعتمد
//
// لا تُقارن المدد الخامّ مباشرةً؛ فللقارئ سرعته ومرتبته. بل تُضبط أزمنة القارئ
// بمعامل سرعةٍ واحد، ثم تُقاس كل كلمة على حدة: من حافظ على نسق القارئ في المدود
// والغنن والتمطيط طابقَه، ومن خالف في كلمةٍ ظهرت مخالفته في كلمتها.
//
// ومعامل السرعة **لا يُستخرج من الكلمة المقيسة نفسها**: كان وسيطَ نِسَب
// (المستخدم ÷ القارئ) على الكلمات كلها، فإذا كانت الآية كلمةً واحدة (الٓمٓ) صار
// المعامل نسبتَها هي فطابقت القارئَ أيًّا كانت (أو حُدّ عند ×٠٫٢٥ فظهر «≈٠٫٢٥×
// من سرعته»). الآن يُقدَّر من الكلمات الصالحة مسطرةً وحدها، مرجَّحًا بسرعة القارئ
// نفسه ومحدودًا حولها (tempo.ts) — فالآية القصيرة تُقارن بأزمنة القارئ كما هي.
//
// وتُراعى الأوجه الجائزة: من قرأ العارضَ بحركتين والقارئُ بستٍّ لم يُخالفه، وكذلك
// مَطُّ اللازم الذي يزيده القرّاء على ستّ حركاتِ مقطع.
//
// فإن بلغت المطابقة حدّ الاجتياز (٧٠٪) جازت الآية — وهذا هو «التحكيم»:
// قياسٌ إلى صوتٍ معتمدٍ لا إلى نموذجٍ نظري وحده.

import { TEMPO_SCALE, tauTolerance } from './tajweed';
import { estimateTempo, priorCenter } from './tempo';
import type { RefAlignment, ReciterCompare, ReciterWordCompare, Tempo, TextCheck, WordAlignment } from './types';
import { PASS_SCORE } from './types';
import { clamp, mean } from './util';

/** حدود معامل السرعة حول القارئ (المستخدم ÷ القارئ) */
const COMPARE_BAND: [number, number] = [0.6, 1.6];

export interface CompareOpts {
  /** مرتبة المستخدم المختارة وسرعة القارئ المقيسة — لمركز معامل السرعة */
  tempo?: Tempo;
  refPace?: number | null;
  /** أخفق السماع الذكي: قُبلت المقارنة بالأزمنة وحدها ويُصرَّح بذلك */
  textUnavailable?: boolean;
}

/**
 * @param userWords كلمات تلاوة المستخدم (من محاذاة التسجيل)
 * @param ref       أزمنة القارئ المعتمد للآية نفسها
 * @param tau       عتبة الصرامة (نفس المستعملة في تصنيف الكلمات)
 * @param textOk    هل النصّ المسموع من المستخدم قريب من الآية؟ (بوابة نصّية)
 */
export function compareWithReciter(
  userWords: WordAlignment[],
  ref: RefAlignment,
  tau: number,
  textOk: boolean,
  refLabel?: string,
  textCheck?: TextCheck,
  opts: CompareOpts = {},
): ReciterCompare | null {
  if (!userWords.length || userWords.length !== ref.words.length) return null;

  const tol = tauTolerance(tau);
  const durUser = (w: WordAlignment) => Math.max(0, w.endMs - w.startMs);
  const durRef = (i: number) => Math.max(80, ref.words[i].endMs - ref.words[i].startMs);

  // ١) معامل السرعة: من الكلمات الصالحة مسطرةً، مرجَّحًا بالقارئ ومحدودًا حوله.
  //    ومركزه ١ (المستخدم مأمورٌ بمحاكاة قارئه) — إلا إن اختار قارئًا بعيدًا عن
  //    مرتبته فيُتوقَّع منه ما توقّعه التحليلُ الذاتي نفسه.
  const nominal = opts.tempo ? (TEMPO_SCALE[opts.tempo] ?? 1) : 1;
  const center = opts.refPace ? (priorCenter(opts.refPace, nominal) * nominal) / opts.refPace : 1;
  const est = estimateTempo(
    userWords.map((w, i) => {
      const u = durUser(w);
      return { ratio: u >= 70 ? u / durRef(i) : NaN, weight: w.tajweed?.rulerWeight ?? 1 };
    }),
    { center, band: COMPARE_BAND },
  );
  const scale = est.scale;

  // ٢) تشابه كل كلمة بعد ضبط سرعة القارئ — داخل الأوجه الجائزة تشابهٌ تامّ
  const perWord: ReciterWordCompare[] = userWords.map((w, i) => {
    const userMs = durUser(w);
    const refMs = durRef(i);
    const scaledRefMs = refMs * scale;
    if (userMs < 70) {
      return { index: i, word: w.word, userMs, refMs, scaledRefMs, sim: 0.05, dir: 'silent' };
    }
    const t = w.tajweed;
    // مدى الأوجه: القارئ قد يقرأ بأعلاها والمستخدم بأدناها (أو العكس) وكلاهما صحيح
    const span = t ? Math.max(1, (t.maxMs || t.expectedMs) / Math.max(1, t.minMs || t.expectedMs)) : 1;
    // ومَطُّ اللازم: القرّاء يمدّونه فوق ستّ حركاتِ مقطع — فلا يُخطَّأ من اقتصر على الستّ
    const stretch = t?.stretchMs ? Math.max(1, t.stretchMs / Math.max(1, t.maxMs || t.expectedMs)) : 1;
    const lo = 1 / (span * stretch);
    const hi = span * stretch;
    const r = userMs / scaledRefMs;
    const excess = r < lo ? (lo - r) / lo : r > hi ? (r - hi) / hi : 0;
    const sim = clamp(1 - excess / (2 * tol), 0, 1);
    const dir: ReciterWordCompare['dir'] = sim >= 0.6 ? 'ok' : r < 1 ? 'short' : 'long';
    return { index: i, word: w.word, userMs, refMs, scaledRefMs, sim, dir };
  });

  let matchPct = Math.round(100 * mean(perWord.map((p) => p.sim)));
  let note: string | undefined;

  if (textOk && opts.textUnavailable) {
    note =
      'لم يتبيّن اللفظ بالسماع الذكي، فقُورنت أزمنتُك بأزمنة القارئ وحدها — تأكّد أنك قرأت الآية المختارة.';
  } else if (!textOk) {
    // ما سُمع من الألفاظ بعيد عن الآية (أو لم يُسمع بعد) — لا يُجيز التوقيتُ وحده
    matchPct = Math.min(matchPct, 45);
    note =
      textCheck === 'nospeech'
        ? 'لم يُسمع في التسجيل كلامٌ أصلًا (صمتٌ أو ضجيج)، فلا تُقارن أزمنةٌ بالقارئ — أعد التسجيل وأنت تقرأ الآية.'
        : textCheck === 'unverified'
          ? 'لم يُتحقَّق من نصّ التلاوة بعد، فلا تُعتمد مطابقة القارئ للاجتياز حتى يستكملها السماع الذكي.'
          : textCheck === 'weak'
            ? 'تبيّن بعضُ نصّ الآية فقط، فخُفّضت المطابقة — اقرأ الآية كاملةً بوضوح.'
            : 'ما سُمع من الألفاظ ليس نصَّ الآية، فخُفّضت المطابقة — تأكّد أنك تقرأ الآية المختارة.';
  } else if (est.anchored && Number.isFinite(est.raw) && (est.relative < 0.8 || est.relative > 1.25)) {
    note =
      `الآية قصيرةٌ أو كلماتُها مدودٌ لازمة، فقُورنت أزمنتُك بأزمنة القارئ كما هي — وزمنك نحو ` +
      `${est.relative.toFixed(2)}× من زمنه (${est.relative < 1 ? 'أقصر: أتمم المدود بمقاديرها' : 'أطول من مقاديرها'}).`;
  } else if (Number.isFinite(est.raw) && (est.relative < 0.62 || est.relative > 1.6)) {
    note = `سرعتك بعيدة عن سرعة القارئ (≈${est.raw.toFixed(2)}×) — قُورنت الأزمنة بعدلة سرعةٍ محدودة حول سرعته، فما جاوزها ظهر في كلماته.`;
  }

  return {
    refLabel: refLabel ?? ref.label,
    matchPct,
    passed: matchPct >= PASS_SCORE,
    scale,
    rawScale: Number.isFinite(est.raw) ? est.raw : undefined,
    anchored: est.anchored,
    perWord,
    note,
  };
}
