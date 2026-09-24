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

// ٢) مستخدم أسرع من القارئ بمقدار ثابت (٣٠٪) لكن بالنسق نفسه → يظل مطابقًا (تعديل السرعة)
const fastDurs = refDurations.map((d) => Math.round(d * 0.7));
const fast = compareWithReciter(fakeUser(fastDurs), ref, 0.8, true, ref.label);
check('السرعة الموحّدة (×٠٫٧) لا تُخفض المطابقة', !!fast && fast.passed, `${fast?.matchPct}% (scale ${fast?.scale.toFixed(2)})`);
// …لكن العدلة محدودةٌ حول القارئ: من قرأ بضعف سرعة قارئه المرجعي لم يُطابقه
const veryFast = compareWithReciter(fakeUser(refDurations.map((d) => Math.round(d * 0.4))), ref, 0.8, true, ref.label);
check('ضعفُ سرعة القارئ المرجعي (×٠٫٤) لا يُعدّ مطابقة', !!veryFast && !veryFast.passed && veryFast.scale >= 0.59, `${veryFast?.matchPct}% (scale ${veryFast?.scale.toFixed(2)})`);

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

// ٧) آيةٌ من كلمةٍ واحدة (الٓمٓ): لا يُستخرج معامل السرعة من الكلمة نفسها
//    (كان يُحدّ عند ×٠٫٢٥ فيُعرض «≈٠٫٢٥× من سرعته» وتبقى الدرجة الذاتية ٧٩٪)
{
  const ALM = 'الۤمۤ';
  const almTj = analyzeWords([ALM], 'hafs', 'hadr')[0];
  const one = (userMs: number): WordAlignment[] => [
    { index: 0, ayah: 1, word: ALM, startMs: 100, endMs: 100 + userMs, confidence: 0.8, status: 'ok', tajweed: almTj },
  ];
  const refOf = (ms: number): RefAlignment => ({ label: 'القارئ', durationMs: ms + 300, score: 95, words: [{ startMs: 150, endMs: 150 + ms }] });
  const quick = compareWithReciter(one(920), refOf(7200), 0.8, true, 'العفاسي', 'ok', { tempo: 'tadwir', refPace: 0.81 });
  check('الٓمٓ في ٠٫٩٢ ث مقابل ٧٫٢ ث للقارئ: لا مطابقة', !!quick && !quick.passed && quick.matchPct < 20, `${quick?.matchPct}%`);
  check('…ومعامل السرعة لا ينهار إلى نسبة الكلمة نفسها', !!quick && quick.scale > 0.85 && !!quick.anchored, `scale ${quick?.scale.toFixed(2)}`);
  check('…والكلمة موسومةٌ «أقصر»', quick?.perWord[0].dir === 'short', String(quick?.perWord[0].dir));
  check('…وملاحظةٌ تشرح أن الآية قُورنت بأزمنة القارئ كما هي', !!quick?.note && /قصيرة/.test(quick.note), quick?.note ?? '—');
  const faithful = compareWithReciter(one(6900), refOf(7200), 0.8, true, 'العفاسي', 'ok', { tempo: 'tadwir', refPace: 0.81 });
  check('الٓمٓ بزمن القارئ نفسه تقريبًا: تجتاز', !!faithful && faithful.passed, `${faithful?.matchPct}%`);
  // من اقتصر على ستّ حركاتٍ بسرعة الحدر (٢٫٧ ث) والقارئ يمطّ (٦٫٧ ث): مطابقةٌ جزئية لا صفر
  const textbook = compareWithReciter(one(2700), refOf(6700), 0.8, true, 'السديس', 'ok', { tempo: 'hadr', refPace: 0.65 });
  const sim = textbook?.perWord[0].sim ?? 0;
  check('الستُّ بسرعة الحدر مقابل مطّ القارئ: مطابقةٌ جزئية (لا صفر ولا تامة)', sim > 0.3 && sim < 0.9, `sim=${sim.toFixed(2)}`);
}

// ٨) الأوجه الجائزة: القارئ وقف على العارض بستّ والمستخدم بحركتين — لا مخالفة
{
  const ws = ['ٱلرَّحۡمَـٰنِ', 'ٱلرَّحِیمِ'];
  const t2 = analyzeWords(ws, 'hafs', 'tartil', [
    { atEnd: false, atStart: true },
    { atEnd: true, atStart: false },
  ]);
  const user: WordAlignment[] = t2.map((tj, i) => ({
    index: i,
    ayah: 1,
    word: ws[i],
    startMs: i ? t2[0].expectedMs + 100 : 0,
    endMs: (i ? t2[0].expectedMs + 100 : 0) + (i ? tj.minMs : tj.expectedMs),
    confidence: 0.8,
    status: 'ok',
    tajweed: tj,
  }));
  const r: RefAlignment = {
    label: 'القارئ',
    durationMs: 5000,
    score: 95,
    words: [
      { startMs: 0, endMs: t2[0].expectedMs },
      { startMs: t2[0].expectedMs + 100, endMs: t2[0].expectedMs + 100 + t2[1].maxMs },
    ],
  };
  const c = compareWithReciter(user, r, 0.8, true, 'القارئ');
  check('العارض للسكون: وجهُ القصر عند المستخدم والإشباعُ عند القارئ — لا مخالفة', !!c && c.perWord[1].sim >= 0.8, `sim=${c?.perWord[1].sim.toFixed(2)}`);
}

if (fails) {
  console.error(`\nFAILED: ${fails}`);
  process.exit(1);
}
console.log('\nALL PASS');
