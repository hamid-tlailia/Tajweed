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

// صوتٌ متصل متموّج (كلامٌ بلا سكتةٍ ولا حدٍّ بيّن): لا يعلق المتتبّع فيه
const tr2 = new LiveTajweedTracker(tjs, WORDS.map((w) => ({ word: w })), 0.8);
let t2 = 0;
for (let i = 0; i < 400; i++, t2 += 20) tr2.feed(0.2 * (0.72 + 0.28 * Math.sin((2 * Math.PI * t2) / 320)), t2);
const s2 = tr2.snapshot();
check('الصوت المتصل المتموّج لا يعلق على كلمة واحدة', s2.doneCount >= 2, `${s2.doneCount} كلمات أُقفلت`);
tr2.finish();

// نغمةٌ مستديمة محضة (لا مقاطع فيها): لا تُخترع كلماتٌ وهمية — فهي مدٌّ واحد
const tr3 = new LiveTajweedTracker(tjs, WORDS.map((w) => ({ word: w })), 0.8);
let t3 = 0;
for (let i = 0; i < 400; i++, t3 += 20) tr3.feed(0.2, t3);
const s3mid = tr3.snapshot();
check('النغمة المستديمة لا تُقطَّع قبل حدّها', s3mid.doneCount === 0, `${s3mid.doneCount}`);
tr3.finish();
const s3 = tr3.snapshot();
check('النغمة المستديمة تُحسب كلمةً واحدة ممدودة', s3.doneCount === 1, `${s3.doneCount} · ${s3.words[0]?.status}`);
check('وتُحكم أطول من المقدار', s3.words[0]?.status === 'long', String(s3.words[0]?.status));

/* ================================================================== */
/* التلاوة المتصلة: لا سكتة بين الكلمات — وهو ما كان يُوقف الإصدار الأول */
/* ================================================================== */
console.log('\n──── التلاوة المتصلة (بلا سكتات بين الكلمات) ────');

const CW = ['ٱلۡحَمۡدُ', 'لِلَّهِ', 'رَبِّ', 'ٱلۡعَـٰلَمِينَ', 'مَـٰلِكِ', 'یَوۡمِ', 'ٱلدِّینِ'];
const ctjs = analyzeWords(CW, 'hafs', 'tartil');
/** مضاعف مقصود لكل كلمة: قصيرةٌ جدًّا، وطويلةٌ جدًّا، والباقي في المقدار */
const MULT = [1, 1, 0.55, 1, 1.85, 1, 1];
const intended = ctjs.map((t, i) => Math.round(t.expectedMs * MULT[i]));

/**
 * توليد كلمة بمقاطعَ ذات غلاف متموّج وانحدارٍ بيّن عند حدّها — كالكلام الحقيقي:
 * لا صمتَ بين الكلمات إلا سكتةً يسيرة لا تكفي وحدها فصلًا.
 */
function continuous(
  gapMs: number,
  dtMs: number,
): { events: { index: number; measuredMs: number; status: WordStatus; boundary: string; measured: boolean }[]; snap: any } {
  const ev: any[] = [];
  const tr = new LiveTajweedTracker(ctjs, CW.map((w) => ({ word: w })), 0.8, (e) => ev.push(e));
  let t = 0;
  const feed = (rms: number, ms: number) => {
    for (let i = 0; i < Math.max(1, Math.round(ms / dtMs)); i++, t += dtMs) tr.feed(rms, t);
  };
  feed(0.0005, 300); // صمتٌ قبل البدء
  for (let w = 0; w < intended.length; w++) {
    const D = intended[w];
    const syl = Math.max(2, Math.round(D / 260));
    for (let sI = 0; sI < syl; sI++) {
      const seg = D / syl;
      const steps = Math.max(1, Math.round(seg / dtMs));
      for (let k = 0; k < steps; k++) {
        const p = k / steps;
        const hump = 0.55 + 0.45 * Math.sin(Math.PI * Math.min(1, p * 1.15));
        const edge = sI === syl - 1 && p > 0.72 ? 1 - ((p - 0.72) / 0.28) * 0.68 : 1;
        feed(Math.max(0.002, 0.42 * hump * edge), dtMs);
      }
    }
    if (gapMs > 0) feed(0.0008, gapMs); // سكتة يسيرة بين الكلمات
  }
  tr.finish();
  return { events: ev, snap: tr.snapshot() };
}

for (const [label, gap, dt] of [
  ['سكتاتٌ يسيرة (٤٥ م.ث) وإطارات ١٠ م.ث', 45, 10],
  ['بلا سكتات إطلاقًا (قراءةٌ متصلة محضة)', 0, 10],
  ['سكتات ١٤٠ م.ث وإطارات ٢٠ م.ث', 140, 20],
] as [string, number, number][]) {
  const { events, snap } = continuous(gap, dt);
  const ratio = events.map((e) => e.measuredMs / intended[e.index]);
  const acoustic = events.filter((e) => e.measured).length;
  check(
    `[${label}] الكلمات السبع تُقفل كلها ولا يتخلّف الضوء`,
    snap.doneCount === CW.length,
    `${snap.doneCount}/${CW.length} (مقدَّرة=${snap.estimatedCount})`,
  );
  check(
    `[${label}] الحدود مقيسة من الصوت (لا من تقدير النموذج)`,
    acoustic >= CW.length - 2,
    `${acoustic}/${CW.length}`,
  );
  const worst = Math.max(...ratio.map((r) => Math.abs(r - 1)));
  check(`[${label}] الأزمنة المقيسة تتبع المقصود (أسوأ انحراف < ٤٠٪)`, worst < 0.4, `${(worst * 100).toFixed(0)}%`);
  check(
    `[${label}] الكلمة المقصّرة تُكشف قصيرة`,
    events[2]?.status === 'short',
    `${events[2]?.status} (${events[2]?.measuredMs} م.ث)`,
  );
  check(
    `[${label}] الكلمة المطوَّلة تُكشف طويلة`,
    events[4]?.status === 'long',
    `${events[4]?.status} (${events[4]?.measuredMs} م.ث)`,
  );
  check(
    `[${label}] الكلمات السليمة لا تُخطَّأ`,
    [0, 1, 3, 5, 6].every((i) => ['ok', 'excellent'].includes(events[i]?.status)),
    [0, 1, 3, 5, 6].map((i) => events[i]?.status).join('، '),
  );
}

/* ================================================================== */
/* المدّ الممسوك: صوتٌ مستديم لا يُقطع على القارئ قبل حدّه              */
/* ================================================================== */
console.log('\n──── المدّ الممسوك ────');
{
  const ev: any[] = [];
  const tr = new LiveTajweedTracker(ctjs, CW.map((w) => ({ word: w })), 0.8, (e) => ev.push(e));
  let t = 0;
  const feed = (rms: number, ms: number) => {
    for (let i = 0; i < Math.round(ms / 10); i++, t += 10) tr.feed(rms, t);
  };
  feed(0.0005, 200);
  feed(0.3, intended[0]); // كلمة أولى مستديمة في مقدارها
  feed(0.0005, 120);
  // كلمة ثانية يمسكها القارئ ثلاثة أضعاف مقدارها بصوتٍ مستديم (مدٌّ أطاله)
  const held = Math.round(ctjs[1].expectedMs * 3);
  feed(0.3, held);
  feed(0.0005, 200);
  tr.finish();
  const second = ev.find((e) => e.index === 1);
  check('المدّ الممسوك يُقاس بطوله الحقيقي (لا يُقطع بالتقدير)', !!second && second.measured, second?.boundary ?? '—');
  check(
    'المدّ الممسوك يُحكم أطول من المقدار',
    second?.status === 'long',
    `${second?.status} مقيس=${second?.measuredMs} مقصود=${held}`,
  );
  check(
    'قياسُه قريب من الإمساك الحقيقي (±٢٥٪)',
    !!second && Math.abs(second.measuredMs - held) / held < 0.25,
    `${second?.measuredMs} مقابل ${held}`,
  );
}

if (fails) {
  console.error(`\nFAILED: ${fails}`);
  process.exit(1);
}
console.log('\nALL PASS');
