// TAHQĪQ — اختبار التحكيم: مقارنة تلاوة المستخدم بأزمنة القارئ المعتمد
import { compareWithReciter } from '../src/lib/compare';
import { analyzeWords } from '../src/lib/tajweed';
import type { RefAlignment, WordAlignment } from '../src/lib/types';

let fails = 0;
function check(name: string, cond: boolean, extra = '') {
  console.log(`${cond ? '✔' : '✘'} ${name}${extra ? `  →  ${extra}` : ''}`);
  if (!cond) fails++;
}

const WORDS = ['ٱلۡحَمۡدُ', 'لِلَّهِ', 'رَبِّ', 'ٱلۡعَـٰلَمِينَ'];
const tjs = analyzeWords(WORDS, 'hafs', 'tartil');

function fakeUser(durations: number[]): WordAlignment[] {
  let t = 0;
  return tjs.map((tj, i) => {
    const d = durations[i] ?? 0;
    const w: WordAlignment = {
      index: i,
      ayah: 1,
      word: WORDS[i],
      startMs: t,
      endMs: t + d,
      confidence: 0.8,
      status: 'ok',
      tajweed: tj,
    };
    t += d + 150;
    return w;
  });
}

const refDurations = tjs.map((t) => t.expectedMs);
const ref: RefAlignment = {
  label: 'قارئ الاختبار',
  durationMs: refDurations.reduce((a, b) => a + b, 0),
  score: 96,
  words: (() => {
    let t = 0;
    return refDurations.map((d) => {
      const w = { startMs: t, endMs: t + d };
      t += d + 150;
      return w;
    });
  })(),
};

// ١) مستخدم يقلّد القارئ تمامًا (بنفس المدد) → مطابقة عالية واجتياز
const same = compareWithReciter(fakeUser(refDurations), ref, 0.8, true, ref.label);
check('المطابقة التامة تجتاز', !!same && same.passed, `${same?.matchPct}%`);
check('معامل السرعة ≈ ١', !!same && Math.abs(same.scale - 1) < 0.05, `${same?.scale.toFixed(3)}`);

// ٢) مستخدم أسرع من القارئ بمقدار ثابت (٥٠٪) لكن بالنسق نفسه → يظل مطابقًا (تعديل السرعة)
const fastDurs = refDurations.map((d) => Math.round(d * 0.5));
const fast = compareWithReciter(fakeUser(fastDurs), ref, 0.8, true, ref.label);
check('السرعة الموحّدة لا تُخفض المطابقة', !!fast && fast.passed, `${fast?.matchPct}% (scale ${fast?.scale.toFixed(2)})`);

// ٣) مستخدم يخالف النسق: يقصّر المدود الطويلة ويطيل القصيرة → لا يجتاز
const inverted = refDurations.map((d, i) => (i % 2 === 0 ? Math.round(d * 0.2) : Math.round(d * 2.4)));
const bad = compareWithReciter(fakeUser(inverted), ref, 0.8, true, ref.label);
check('خرق النسق يمنع الاجتياز', !!bad && !bad.passed, `${bad?.matchPct}%`);

// ٤) كلمة مسكوتة تُخفض المطابقة بشدة
const silentOne = [...refDurations];
silentOne[1] = 0;
const skp = compareWithReciter(fakeUser(silentOne), ref, 0.8, true, ref.label);
check('إسقاط كلمة يظهر في مطابقتها', !!skp && skp.perWord[1].sim < 0.15, `sim=${skp?.perWord[1].sim.toFixed(2)}`);

// ٥) البوابة النصّية: نصّ بعيد عن الآية يُخفّض المطابقة ولو طابق الزمن
const txt = compareWithReciter(fakeUser(refDurations), ref, 0.8, false, ref.label);
check('النصّ البعيد يمنع الاجتياز', !!txt && !txt.passed && !!txt.note, `${txt?.matchPct}%`);

// ٦) أطوال مختلفة → لا مقارنة (null)
const oddUser = fakeUser(refDurations).slice(0, 3);
const odd = compareWithReciter(oddUser, ref, 0.8, true, ref.label);
check('طول مختلف يُرجع null', odd === null);

if (fails) {
  console.error(`\nFAILED: ${fails}`);
  process.exit(1);
}
console.log('\nALL PASS');
