// TAHQĪQ — اختبار المرافقة الحية: تتبّع الكلمات من تيار طاقة محاكى
import { LiveTajweedTracker } from '../src/lib/live';
import { analyzeWords } from '../src/lib/tajweed';
import type { WordStatus } from '../src/lib/types';

let fails = 0;
function check(name: string, cond: boolean, extra = '') {
  console.log(`${cond ? '✔' : '✘'} ${name}${extra ? `  →  ${extra}` : ''}`);
  if (!cond) fails++;
}

const WORDS = ['ٱلۡحَمۡدُ', 'لِلَّهِ', 'رَبِّ', 'ٱلۡعَـٰلَمِينَ'];
const tjs = analyzeWords(WORDS, 'hafs', 'tartil');

const events: { index: number; status: WordStatus; measuredMs: number }[] = [];
const tr = new LiveTajweedTracker(tjs, WORDS.map((w) => ({ word: w })), 0.8, (e) =>
  events.push({ index: e.index, status: e.status, measuredMs: e.measuredMs }),
);

// تيار الطاقة: 20 م.ث لكل نبضة تغذية
const STEP = 20;
let t = 0;
function voice(ms: number, level = 0.15) {
  for (let i = 0; i < ms / STEP; i++, t += STEP) tr.feed(level, t);
}
function silence(ms: number) {
  for (let i = 0; i < ms / STEP; i++, t += STEP) tr.feed(0.001, t);
}

silence(400); // صمت قبل البدء
const e0 = tjs[0].expectedMs;
voice(Math.round(e0 * 1.0)); // كلمة 1: في المقدار
silence(300);
voice(Math.round(tjs[1].expectedMs * 0.25)); // كلمة 2: أقصر بكثير → short
silence(300);
voice(Math.round(tjs[2].expectedMs * 2.2)); // كلمة 3: أطول بكثير → long
silence(400);
tr.finish(); // الكلمة 4 لم تُقرأ

const snap = tr.snapshot();

check('بدأت الجلسة بعد أول صوت', snap.started);
check('أُقفلت ٣ كلمات', snap.doneCount === 3, `${snap.doneCount}`);
check('الكلمة ١ في المقدار (ok/excellent)', ['ok', 'excellent'].includes(snap.words[0].status), snap.words[0].status);
check('الكلمة ٢ أقصر (short)', snap.words[1].status === 'short', snap.words[1].status);
check('الكلمة ٣ أطول (long)', snap.words[2].status === 'long', snap.words[2].status);
check('الكلمة ٤ بقيت معلَّقة (pending)', snap.words[3].status === 'pending', String(snap.words[3].status));
check('مخالفَتان محسوبتان', snap.violations === 2, `${snap.violations}`);
check('أُطلقت ٣ أحداث كلمات', events.length === 3, `${events.length}`);
check('تنبيه المخالفة يحمل شرحًا', !!snap.lastAlert && snap.lastAlert.action.length > 10, snap.lastAlert?.title ?? '—');
check('اللقطة مُنهية بعد finish()', snap.finished);
check('لا كلمة جارية بعد الانتهاء', snap.currentExpectedMs === 0);

// اختبار الإقفال القسري لكلمة ممتدة بلا سكتة
const tr2 = new LiveTajweedTracker(tjs, WORDS.map((w) => ({ word: w })), 0.8);
let t2 = 0;
for (let i = 0; i < 400; i++, t2 += 20) tr2.feed(0.2, t2); // ٨ ثوانٍ صوت متصل
const s2 = tr2.snapshot();
check('الصوت المتصل لا يعلق على كلمة واحدة', s2.doneCount >= 2, `${s2.doneCount} كلمات أُقفلت`);

if (fails) {
  console.error(`\nFAILED: ${fails}`);
  process.exit(1);
}
console.log('\nALL PASS');
