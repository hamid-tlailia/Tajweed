// TAHQĪQ — اختبار المرافقة الحية: تتبّع الكلمات من تيار طاقة محاكى
import { LiveTajweedTracker } from '../src/lib/live';
import { analyzeTargetWords, analyzeWords } from '../src/lib/tajweed';
import type { WordStatus } from '../src/lib/types';

let fails = 0;
function check(name: string, cond: boolean, extra = '') {
  console.log(`${cond ? '✔' : '✘'} ${name}${extra ? `  →  ${extra}` : ''}`);
  if (!cond) fails++;
}

const WORDS = ['ٱلۡحَمۡدُ', 'لِلَّهِ', 'رَبِّ', 'ٱلۡعَـٰلَمِينَ'];
const tjs = analyzeWords(WORDS, 'hafs', 'tartil');

const events: { index: number; status: WordStatus; measuredMs: number; final?: boolean }[] = [];
const tr = new LiveTajweedTracker(tjs, WORDS.map((w) => ({ word: w })), 0.8, (e) =>
  events.push({ index: e.index, status: e.status, measuredMs: e.measuredMs, final: e.final }),
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
check('حُكم على الكلمات الأربع (لا كلمة بلا حكم بعد الإيقاف)', snap.doneCount === 4, `${snap.doneCount}`);
check('الكلمة ١ في المقدار (ok/excellent)', ['ok', 'excellent'].includes(snap.words[0].status), snap.words[0].status);
check('الكلمة ٢ أقصر (short)', snap.words[1].status === 'short', snap.words[1].status);
check('الكلمة ٣ أطول (long)', snap.words[2].status === 'long', snap.words[2].status);
check('الكلمة ٤ لم تُقرأ → «لم تُسمع» لا «معلَّقة»', snap.words[3].status === 'silent', String(snap.words[3].status));
check('ثلاث مخالفات محسوبة (قصر، طول، ترك)', snap.violations === 3, `${snap.violations}`);
check('أُطلقت ٤ أحداث كلمات', events.length === 4, `${events.length}`);
check('حكم الكلمة المتروكة موسومٌ ختاميًّا (لا اهتزاز له)', events[3]?.final === true && !events[0]?.final, `${events[3]?.final}`);
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
check(
  'النغمة المستديمة تُحسب كلمةً واحدة ممدودة (لا تُوزَّع على كلماتٍ وهمية)',
  s3.words[0]?.status === 'long' && s3.words.slice(1).every((w) => w.status === 'silent'),
  s3.words.map((w) => w.status).join(' · '),
);
check('وتُقاس بطولها كله', (s3.words[0]?.measuredMs ?? 0) >= 7000, `${s3.words[0]?.measuredMs}`);

// إيقافٌ بلا قراءة: لا يُحكم على شيء («معلَّقة» لا «لم تُسمع»)
const tr4 = new LiveTajweedTracker(tjs, WORDS.map((w) => ({ word: w })), 0.8);
let t4 = 0;
for (let i = 0; i < 60; i++, t4 += 20) tr4.feed(0.001, t4);
tr4.finish();
const s4 = tr4.snapshot();
check('الإيقاف بلا قراءة يترك الكلمات معلَّقة', s4.doneCount === 0 && s4.words.every((w) => w.status === 'pending'), `${s4.doneCount}`);

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

/* ================================================================== */
/* القارئ الأسرع من مرتبته: كانت الكلمة الأخيرة تبقى بلا حكم           */
/* ================================================================== */
{
  // مقاطع مصطنعة: نبضاتٌ لكل مقطع، وحافّة هابطة في آخر الكلمة
  function synth(
    words: string[],
    mult: number,
    gapMs: number,
    tailMs: number,
  ): { snap: ReturnType<LiveTajweedTracker['snapshot']>; ev: { index: number; status: WordStatus; final?: boolean }[] } {
    const wt = analyzeWords(words, 'hafs', 'tartil');
    const ev: { index: number; status: WordStatus; final?: boolean }[] = [];
    const trk = new LiveTajweedTracker(wt, words.map((w) => ({ word: w })), 0.8, (e) =>
      ev.push({ index: e.index, status: e.status, final: e.final }),
    );
    let tt = 0;
    const dt = 10;
    const feed = (rms: number, ms: number) => {
      for (let i = 0; i < Math.max(1, Math.round(ms / dt)); i++, tt += dt) trk.feed(rms, tt);
    };
    feed(0.0005, 300);
    words.forEach((_, w) => {
      const D = Math.round(wt[w].expectedMs * mult);
      const syl = Math.max(2, Math.round(D / 260));
      for (let sI = 0; sI < syl; sI++) {
        const steps = Math.max(1, Math.round(D / syl / dt));
        for (let k = 0; k < steps; k++) {
          const p = k / steps;
          const hump = 0.55 + 0.45 * Math.sin(Math.PI * Math.min(1, p * 1.15));
          const edge = sI === syl - 1 && p > 0.72 ? 1 - ((p - 0.72) / 0.28) * 0.68 : 1;
          feed(Math.max(0.002, 0.42 * hump * edge), dt);
        }
      }
      if (w < words.length - 1 && gapMs > 0) feed(0.0008, gapMs);
    });
    if (tailMs > 0) feed(0.0005, tailMs);
    trk.finish();
    return { snap: trk.snapshot(), ev };
  }
  const judged = (st: WordStatus | 'current') => st !== 'pending' && st !== 'current';
  const W2 = ['ٱلرَّحۡمَـٰنِ', 'ٱلرَّحِیمِ'];
  const W3 = ['مَـٰلِكِ', 'یَوۡمِ', 'ٱلدِّینِ'];
  const W4 = ['ٱلۡحَمۡدُ', 'لِلَّهِ', 'رَبِّ', 'ٱلۡعَـٰلَمِينَ'];
  const IKHLAS = ['قُلۡ', 'هُوَ', 'ٱللَّهُ', 'أَحَدٌ'];
  const FALAQ = ['قُلۡ', 'أَعُوذُ', 'بِرَبِّ', 'ٱلۡفَلَقِ'];

  for (const [label, words, mult, gap, tail] of [
    ['كلمتان ×٠٫٦ متصلتان ثم صمت', W2, 0.6, 0, 400],
    ['كلمتان ×٠٫٦ بسكتات ثم إيقاف فوري', W2, 0.6, 80, 0],
    ['كلمتان ×٠٫٥ متصلتان ثم صمت', W2, 0.5, 0, 400],
    ['ثلاث ×٠٫٦ متصلة ثم صمت (مراجعة الدمج)', W3, 0.6, 0, 400],
    ['ثلاث ×٠٫٥ بسكتات ثم صمت', W3, 0.5, 80, 400],
    ['أربع ×٠٫٦ متصلة ثم صمت', W4, 0.6, 0, 400],
    ['أربع ×٠٫٥ بسكتات ثم إيقاف فوري', W4, 0.5, 80, 0],
    ['أربع ×١٫٤ متصلة (أبطأ من المرتبة)', W4, 1.4, 0, 400],
    ['أربع ×١ بسكتات', W4, 1, 120, 300],
    ['الإخلاص ×٠٫٦ متصلة (كلمات قصار بلا حدٍّ مسموع → تقاسمٌ تقديري)', IKHLAS, 0.6, 0, 400],
    ['الفلق ×٠٫٥ متصلة («قل» القصيرة تندمج بما بعدها)', FALAQ, 0.5, 0, 400],
  ] as const) {
    const { snap: sn } = synth([...words], mult, gap, tail);
    const last = sn.words[sn.words.length - 1];
    check(
      `${label}: كل الكلمات محكومة والأخيرة مسموعة`,
      sn.words.every((w) => judged(w.status)) && last.status !== 'silent' && last.status !== 'pending',
      sn.words.map((w) => w.status).join(' · '),
    );
  }
  // القارئ الأسرع لا يُحكم على كلماته بالقصر كلِّها بعد أن تتبيّن سرعته
  {
    const { snap: sn } = synth([...W4], 0.6, 80, 300);
    const shorts = sn.words.filter((w) => w.status === 'short').length;
    check('القارئ الأسرع ×٠٫٦: بعد الكلمة الأولى تتكيّف العدلة (لا يُقصَّر الباقي)', shorts <= 1, `${shorts} قصيرة`);
  }
  // التوقّف المبكّر مع مقاطع حقيقية: ما لم يُقرأ «لم يُسمع» ولا تُخترع قراءة
  {
    const wt = analyzeWords([...W4], 'hafs', 'tartil');
    const ev: { index: number; status: WordStatus }[] = [];
    const trk = new LiveTajweedTracker(wt, W4.map((w) => ({ word: w })), 0.8, (e) => ev.push({ index: e.index, status: e.status }));
    let tt = 0;
    const feed = (rms: number, ms: number) => {
      for (let i = 0; i < Math.round(ms / 10); i++, tt += 10) trk.feed(rms, tt);
    };
    feed(0.0005, 300);
    for (let w = 0; w < 2; w++) {
      feed(0.3, wt[w].expectedMs);
      feed(0.0005, 150);
    }
    feed(0.0005, 400);
    trk.finish();
    const sn = trk.snapshot();
    check(
      'قراءة كلمتين من أربع ثم توقّف: الكلمتان الأخيرتان «لم تُسمعا»',
      ['ok', 'excellent'].includes(sn.words[0].status) &&
        ['ok', 'excellent'].includes(sn.words[1].status) &&
        sn.words[2].status === 'silent' &&
        sn.words[3].status === 'silent',
      sn.words.map((w) => w.status).join(' · '),
    );
    check('عدّاد المقروء يعكس ذلك', sn.doneCount === 4 && sn.okCount === 2, `${sn.doneCount}/${sn.okCount}`);
  }
}

/* ================================================================== */
/* البسملة قبل الآية: إعادة التأسيس (rebase) بعد أن يكشفها السماع اللحظي     */
/* ================================================================== */
{
  const BASMALA = ['بِسۡمِ', 'ٱللَّهِ', 'ٱلرَّحۡمَـٰنِ', 'ٱلرَّحِیمِ'];
  const AYAH = ['قُلۡ', 'هُوَ', 'ٱللَّهُ', 'أَحَدٌ'];
  const btjs = analyzeWords(BASMALA, 'hafs', 'tartil');
  const atjs = analyzeWords(AYAH, 'hafs', 'tartil');
  const ev: { index: number; status: WordStatus; prefix?: boolean }[] = [];
  const trk = new LiveTajweedTracker(atjs, AYAH.map((w) => ({ word: w })), 0.8, (e) => ev.push({ index: e.index, status: e.status, prefix: e.prefix }));
  let tt = 0;
  const feed = (rms: number, ms: number) => {
    for (let i = 0; i < Math.round(ms / 10); i++, tt += 10) trk.feed(rms, tt);
  };
  const say = (t: { expectedMs: number }[]) => {
    for (const w of t) {
      feed(0.3, w.expectedMs);
      feed(0.0005, 120);
    }
  };
  feed(0.0005, 300);
  say(btjs.slice(0, 2)); // «بسم الله» — قبل أن يكشفها السماع
  const before = trk.snapshot();
  check('قبل الكشف: كلمات البسملة تُحسب خطأً على الآية', before.doneCount >= 1, `${before.doneCount}`);
  trk.rebase(btjs, BASMALA.map((w) => ({ word: w })));
  const mid = trk.snapshot();
  check('بعد إعادة التأسيس: لا كلمةَ من الآية محكومة', mid.doneCount === 0 && mid.words.length === 4, `${mid.doneCount}/${mid.words.length}`);
  say(btjs.slice(2)); // «الرحمن الرحيم»
  const inP = trk.snapshot();
  check('أثناء البسملة: المؤشر قبل الآية (inPrefix)', inP.inPrefix || inP.cursor <= 0, `${inP.cursor} ${inP.inPrefix}`);
  say(atjs); // الآية
  feed(0.0005, 400);
  trk.finish();
  const sn = trk.snapshot();
  check(
    'الآية بعد البسملة: كلماتها الأربع في المقدار',
    sn.words.length === 4 && sn.words.every((w) => w.status === 'ok' || w.status === 'excellent'),
    sn.words.map((w) => w.status).join(' · '),
  );
  check('عدّاد الآية لا يشمل البسملة', sn.doneCount === 4 && sn.okCount === 4, `${sn.doneCount}/${sn.okCount}`);
  check('أحداث الآية بفهارسها (٠..٣) والبسملة موسومة prefix', ev.some((e) => e.prefix) && ev.filter((e) => !e.prefix).every((e) => e.index >= 0 && e.index < 4), JSON.stringify(ev.slice(-4)));
}

/* ================================================================== */
/* تراجعٌ كان يشكو منه القراء:                                          */
/*  ١) الكلمة الأخيرة (مدُّها) تُحكم «ناقصة» رغم إشباعها — لأن ذبول    */
/*     الصوت في آخر المدّ كان يُحسب حدًّا فيقطع قياسَه.                 */
/*  ٢) الضوء يسبق القارئ بإشاراتٍ تقديرية قبل أن يتمّ الكلمة.          */
/* ================================================================== */
console.log('\n──── تراجعات: مدّ الكلمة الأخيرة وتقدّم الضوء ────');
{
  // كـ«ٱلرَّحۡمَـٰنِ ٱلرَّحِیمِ»: أمسك القارئ مدَّ الكلمة الأخيرة وأشبعه بصوتٍ
  // يذبل تدريجيًّا (وهو الطبيعي في الأداء) ثم سكت
  const W = ['ٱلرَّحۡمَـٰنِ', 'ٱلرَّحِیمِ'];
  const wt = analyzeTargetWords(W.map((w) => ({ word: w, ayah: 1 })), 'hafs', 'tartil');
  const ev: { index: number; status: WordStatus; measuredMs: number; measured: boolean }[] = [];
  const trk = new LiveTajweedTracker(wt, W.map((w) => ({ word: w })), 0.8, (e) =>
    ev.push({ index: e.index, status: e.status, measuredMs: e.measuredMs, measured: e.measured }),
  );
  let tt = 0;
  const dt = 10;
  const feed = (rms: number, ms: number) => {
    for (let i = 0; i < Math.max(1, Math.round(ms / dt)); i++, tt += dt) trk.feed(rms, tt);
  };
  feed(0.0005, 300);
  feed(0.4, Math.round(wt[0].expectedMs)); // الكلمة الأولى في مقدارها
  feed(0.0005, 140); // سكتة بينهما
  // الكلمة الأخيرة: مبتدأٌ ثم مدٌّ ممسوك يذبل من ٠٫٤ إلى ٠٫٠٦ على مدى الإمساك
  const hold = Math.round(wt[1].expectedMs * 2.2);
  feed(0.4, 150);
  const steps = Math.max(1, Math.round(hold / dt));
  for (let k = 0; k < steps; k++) feed(Math.max(0.05, 0.4 - 0.34 * (k / steps)), dt);
  feed(0.0005, 500);
  trk.finish();
  const sn = trk.snapshot();
  const lastEv = [...ev].reverse().find((e) => e.index === 1);
  check('الكلمة الأخيرة: مدٌّ مُشبَع بصوتٍ ذابل لا يُحكم ناقصًا', sn.words[1].status !== 'short', `${sn.words[1].status} (${sn.words[1].measuredMs} م.ث)`);
  check('الكلمة الأخيرة: قياسها يغطي الإمساك الحقيقي (−٢٥٪ فأقل)', !!lastEv && lastEv.measuredMs >= hold * 0.75, `${lastEv?.measuredMs} مقابل ${hold}`);
  check('الكلمة الأخيرة حدُّها مقيس من الصوت (سكتةٌ بعد المدّ)', !!lastEv && lastEv.measured, `${lastEv ? 'مقيس' : 'تقدير'}`);
}
{
  // ضوء المرافقة لا يسبق القارئ: صوتٌ متصل يذبل بلا حدٍّ مسموع — لا يُقطع
  // على القارئ بإشارةٍ تقديرية قبل أن يأتي حدٌّ حقيقي
  const W = ['ٱلۡحَمۡدُ', 'لِلَّهِ', 'رَبِّ', 'ٱلۡعَـٰلَمِينَ'];
  const wt = analyzeWords(W, 'hafs', 'tartil');
  const trk = new LiveTajweedTracker(wt, W.map((w) => ({ word: w })), 0.8);
  let tt = 0;
  const dt = 10;
  const feed = (rms: number, ms: number) => {
    for (let i = 0; i < Math.max(1, Math.round(ms / dt)); i++, tt += dt) trk.feed(rms, tt);
  };
  feed(0.0005, 300);
  // صوتٌ يهبط درجًا درجًا (كمدٍّ يذبل) فوق عتبة الصوت — بلا صعودٍ ولا سكتة
  const dur = Math.round(wt[0].expectedMs * 2.4);
  const steps = Math.max(1, Math.round(dur / dt));
  for (let k = 0; k < steps; k++) feed(Math.max(0.05, 0.4 - 0.34 * (k / steps)), dt);
  const mid = trk.snapshot();
  check('لا يتقدّم الضوء على القارئ بلا حدٍّ حقيقي (عند ٢٫٤× مقدار الكلمة)', mid.doneCount === 0 && mid.cursor === 0, `منجز=${mid.doneCount} مؤشر=${mid.cursor}`);
  feed(0.0005, 400);
  trk.finish();
  const sn = trk.snapshot();
  check('عند الإيقاف تُقاس الكلمة بطولها كله ولا تُقطَّع', sn.words[0].measuredMs >= dur * 0.75 && sn.words.slice(1).every((w) => w.status === 'silent'), `${sn.words[0].measuredMs} م.ث`);
}

if (fails) {
  console.error(`\nFAILED: ${fails}`);
  process.exit(1);
}
console.log('\nALL PASS');
