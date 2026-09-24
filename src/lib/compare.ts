// TAHQĪQ — التحكيم: مقارنة تلاوة المستخدم بتلاوة القارئ المعتمد
//
// لا تُقارن المدد الخامّ مباشرةً؛ فللقارئ سرعته ومرتبته. بل تُضبط أزمنة القارئ
// بمعامل سرعةٍ واحد (وسيط نسب المستخدم/القارئ على كل الكلمات — وسيطٌ صامد أمام
// الكلمات الشاذّة)، ثم تُقاس كل كلمة على حدة: من حافظ على نسق القارئ في المدود
// والغنن والتمطيط طابقَه، ومن خالف في كلمةٍ ظهرت مخالفته في كلمتها.
//
// فإن بلغت المطابقة حدّ الاجتياز (٧٠٪) جازت الآية — وهذا هو «التحكيم»:
// قياسٌ إلى صوتٍ معتمدٍ لا إلى نموذجٍ نظري وحده.

import { tauTolerance } from './tajweed';
import type { RefAlignment, ReciterCompare, ReciterWordCompare, TextCheck, WordAlignment } from './types';
import { PASS_SCORE } from './types';
import { clamp, mean, median } from './util';

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
): ReciterCompare | null {
  if (!userWords.length || userWords.length !== ref.words.length) return null;

  const tol = tauTolerance(tau);

  // ١) معامل السرعة: وسيط نسب مدد الكلمات (صامد أمام الكلمات الشاذّة)
  const ratios = userWords.map((w, i) => {
    const u = Math.max(0, w.endMs - w.startMs);
    const r = Math.max(80, ref.words[i].endMs - ref.words[i].startMs);
    return u / r;
  });
  const scale = clamp(median(ratios.filter((x) => Number.isFinite(x) && x > 0.05)) || 1, 0.25, 4);

  // ٢) تشابه كل كلمة بعد ضبط سرعة القارئ
  const perWord: ReciterWordCompare[] = userWords.map((w, i) => {
    const userMs = Math.max(0, w.endMs - w.startMs);
    const refMs = Math.max(80, ref.words[i].endMs - ref.words[i].startMs);
    const scaledRefMs = refMs * scale;
    if (userMs < 70) {
      return { index: i, word: w.word, userMs, refMs, scaledRefMs, sim: 0.05 };
    }
    const r = userMs / scaledRefMs;
    const sim = clamp(1 - Math.abs(r - 1) / (2 * tol), 0, 1);
    return { index: i, word: w.word, userMs, refMs, scaledRefMs, sim };
  });

  let matchPct = Math.round(100 * mean(perWord.map((p) => p.sim)));
  let note: string | undefined;

  if (!textOk) {
    // ما سُمع من الألفاظ بعيد عن الآية (أو لم يُسمع بعد) — لا يُجيز التوقيتُ وحده
    matchPct = Math.min(matchPct, 45);
    note =
      textCheck === 'unverified'
        ? 'لم يُتحقَّق من نصّ التلاوة بعد، فلا تُعتمد مطابقة القارئ للاجتياز حتى يستكملها السماع الذكي.'
        : textCheck === 'weak'
          ? 'تبيّن بعضُ نصّ الآية فقط، فخُفّضت المطابقة — اقرأ الآية كاملةً بوضوح.'
          : 'ما سُمع من الألفاظ ليس نصَّ الآية، فخُفّضت المطابقة — تأكّد أنك تقرأ الآية المختارة.';
  } else if (scale < 0.55 || scale > 1.9) {
    note = `سرعتك بعيدة عن سرعة القارئ (≈${scale.toFixed(2)}×) — قُورنت الأزمنة بعدلة السرعة، ويُستحسن الاقتراب من مرتبته.`;
  }

  return {
    refLabel: refLabel ?? ref.label,
    matchPct,
    passed: matchPct >= PASS_SCORE,
    scale,
    perWord,
    note,
  };
}
