// TAHQĪQ — اختبار بوّابة النصّ: لا تُجاز تلاوةٌ بأزمنتها إن لم يكن المقروء هو الآية
//
// الشكوى التي أُصلحت: «يأكل تفاحة» بدل «الرحمن الرحيم» اجتازت، وآيةٌ من سورةٍ
// أخرى اجتازت — لأن المطابقة النصّية كانت استدعاءً فحسب (وتُعاد تسميتُها
// «تغطية» إن تدنّت) فيبقى الحكمُ للأزمنة وحدها.
// التشغيل: npm run test:text

import { readFileSync } from 'node:fs';
import { runAlignment } from '../src/lib/alignment';
import { buildCoach } from '../src/lib/coach';
import { normalizeForMatch, scoreTranscriptMatch, textCheckOf, TEXT_GATE_OK } from '../src/lib/match';
import { buildTarget, targetTextOf, stripSurahBasmala } from '../src/lib/quran';
import { analyzeWords, normalizeArabic } from '../src/lib/tajweed';
import type { SurahData, WordAlignment } from '../src/lib/types';

let fails = 0;
function check(name: string, cond: boolean, extra = '') {
  console.log(`${cond ? '✔' : '✘'} ${name}${extra ? `  →  ${extra}` : ''}`);
  if (!cond) fails++;
}

const quran = JSON.parse(readFileSync(new URL('../public/quran.json', import.meta.url), 'utf8'));
function surah(id: number): SurahData {
  const s = quran.surahs.find((x: any) => x.id === id);
  return stripSurahBasmala({
    id,
    meta: { id, name: s.name, englishName: '', englishNameTranslation: '', revelationType: '', numberOfAyahs: s.ayahs.length },
    ayahs: s.ayahs.map((a: any) => ({ number: a.n, numberInSurah: a.n, text: a.text })),
  });
}
const ayahText = (s: number, a: number): string => targetTextOf(buildTarget(surah(s), 'ayah', a));

const gate = (pred: string, s: number, a: number) => scoreTranscriptMatch(pred, ayahText(s, a));
const pct = (x: number) => `${Math.round(100 * x)}٪`;

console.log('════════ 1) التوحيد الإملائي: الرسم العثماني يلتقي برسم السماع ════════');
{
  const pairs: [string, string][] = [
    ['ٱلۡعَـٰلَمِينَ', 'العالمين'],
    ['ٱلرَّحۡمَـٰنِ', 'الرحمان'],
    ['ٱلصَّلَوٰةَ', 'الصلاه'],
    ['ءَامَنُوا۟', 'امنوا'],
    ['ٱلۡقُرۡءَانِ', 'القران'],
    ['ٱلۡكِتَـٰبُ', 'الكتاب'],
    ['إِبۡرَٰهِـۧمَ', 'ابراهيم'],
    ['ٱلسَّمَـٰوَٰتِ', 'السماوات'],
    ['ذَٰلِكَ', 'ذالك'],
  ];
  for (const [uth, expect] of pairs) {
    check(`«${normalizeArabic(uth)}» → «${expect}»`, normalizeForMatch(uth) === expect, normalizeForMatch(uth));
  }
  // محرّك الأحكام لا يتأثّر: normalizeArabic كما هو (يُسقط الخنجرية)
  check('normalizeArabic لم يتغيّر (إِلَىٰ → الي)', normalizeArabic('إِلَىٰ') === 'الي', normalizeArabic('إِلَىٰ'));
}

console.log('\n════════ 1ب) البسملة ليست من أول السورة (إلا الفاتحة) ════════');
{
  const t112 = buildTarget(surah(112), 'ayah', 1);
  check('الإخلاص ١ أربع كلمات بلا بسملة', t112.words.length === 4 && normalizeArabic(t112.words[0].word) === 'قل', t112.words.map((w) => w.word).join(' '));
  const t1 = buildTarget(surah(1), 'ayah', 1);
  check('الفاتحة ١ هي البسملة', t1.words.length === 4 && normalizeArabic(t1.words[0].word) === 'بسم', t1.words.map((w) => w.word).join(' '));
  const t9 = buildTarget(surah(9), 'ayah', 1);
  check('براءة ١ بلا بسملة أصلًا', normalizeArabic(t9.words[0].word) !== 'بسم', t9.words[0].word);
  const t2 = buildTarget(surah(2), 'ayah', 1);
  check('البقرة ١ = ﴿الۤمۤ﴾ وحدها', t2.words.length === 1, t2.words.map((w) => w.word).join(' '));
}

console.log('\n════════ 2) كلامٌ آخر وآيةٌ أخرى لا يجتازان البوّابة ════════');
{
  const cases: [string, string, number, number][] = [
    ['«يأكل تفاحة» بدل الرحمن الرحيم', 'ياكل تفاحة', 1, 3],
    ['«يأكل تفاحة» ملتصقة', 'ياكلتفاحه', 1, 3],
    ['الإخلاص بدل الفاتحة ٣', 'قل هو الله أحد', 1, 3],
    ['الكوثر بدل الفاتحة ٣', 'إنا أعطيناك الكوثر', 1, 3],
    ['آية الكرسي بدل الفاتحة ٣ (تحوي كلماتها)', 'الله لا إله إلا هو الحي القيوم لا تأخذه سنة ولا نوم له ما في السماوات وما في الأرض', 1, 3],
    ['الفاتحة ٢ بدل الفاتحة ٥', 'الحمد لله رب العالمين', 1, 5],
    ['الفلق ٢ بدل الفلق ٣', 'من شر ما خلق', 113, 3],
    ['آية أخرى ملتصقة بلا مسافات', 'اللهلاالهالاهوالحيالقيوملاتاخذهسنهولانوم', 113, 2],
  ];
  for (const [label, pred, s, a] of cases) {
    const r = gate(pred, s, a);
    check(`${label}: mismatch`, textCheckOf(r) === 'mismatch', `${pct(r.match)} (استدعاء ${pct(r.recall)} · دقّة ${pct(r.precision)})`);
  }
}

console.log('\n════════ 3) التلاوة الصحيحة (ولو بتحريف السماع اليسير) تجتاز ════════');
{
  const cases: [string, string, number, number][] = [
    ['الفاتحة ٣ مضبوطة', 'الرحمن الرحيم', 1, 3],
    ['الفاتحة ٣ بألف', 'الرحمان الرحيم', 1, 3],
    ['الفاتحة ٢', 'الحمد لله رب العالمين', 1, 2],
    ['الفاتحة ٢ بلا ألف العالمين', 'الحمد لله رب العلمين', 1, 2],
    ['الفاتحة ٢ الحمد ولله ملتصقتان', 'الحمدلله رب العالمين', 1, 2],
    ['الفاتحة ٢ ملتصقة كلها', 'الحمدللهربالعالمين', 1, 2],
    ['الفاتحة ٦', 'اهدنا الصراط المستقيم', 1, 6],
    ['الفلق ٢ بتحريف حرف', 'من شر ما خالق', 113, 2],
    ['الإخلاص ١ (نصّ الآية بلا بسملة)', 'قل هو الله أحد', 112, 1],
    ['الإخلاص ١ وقد ابتدأ القارئ بالبسملة (تُخرج من الحساب)', 'بسم الله الرحمن الرحيم قل هو الله أحد', 112, 1],
    ['آية الكرسي كاملة', 'الله لا إله إلا هو الحي القيوم لا تأخذه سنة ولا نوم له ما في السماوات وما في الأرض من ذا الذي يشفع عنده إلا بإذنه يعلم ما بين أيديهم وما خلفهم ولا يحيطون بشيء من علمه إلا بما شاء وسع كرسيه السماوات والأرض ولا يئوده حفظهما وهو العلي العظيم', 2, 255],
    ['الكوثر ١ بلا بسملة', 'إنا أعطيناك الكوثر', 108, 1],
    ['البقرة ٢', 'ذلك الكتاب لا ريب فيه هدى للمتقين', 2, 2],
  ];
  for (const [label, pred, s, a] of cases) {
    const r = gate(pred, s, a);
    check(`${label}: ok`, textCheckOf(r) === 'ok', `${pct(r.match)} — ${r.predWords.map((w) => (w.prefix ? `[${w.word}]` : w.ok ? w.word : `✗${w.word}`)).join(' ')}`);
  }
  const bsm = gate('بسم الله الرحمن الرحيم قل هو الله أحد', 112, 1);
  check('البسملة قبل الآية تُعلَّم بادئةً لا زيادة', bsm.basmalaPrefix && bsm.predWords.filter((w) => w.prefix).length === 4 && bsm.precision === 1, JSON.stringify(bsm.predWords.slice(0, 5)));
  const onlyBsm = gate('بسم الله الرحمن الرحيم', 112, 1);
  check('البسملة وحدها ليست الآية', textCheckOf(onlyBsm) === 'mismatch', pct(onlyBsm.match));
  const fatiha1 = gate('بسم الله الرحمن الرحيم', 1, 1);
  check('في الفاتحة البسملة هي الآية الأولى', textCheckOf(fatiha1) === 'ok', pct(fatiha1.match));
  // نصف الآية يمرّ من البوّابة (ويحسمه حكمُ الأزمنة: كلماتٌ «لم تُسمع»)
  const half = gate('الله لا إله إلا هو الحي القيوم لا تأخذه سنة ولا نوم له ما في السماوات وما في الأرض', 2, 255);
  check('نصف آية الكرسي: ضعيف (كلماتٌ كثيرة لم تُقرأ) لا «بعيد»', textCheckOf(half) === 'weak', pct(half.match));
  const superset = gate('الرحمن الرحيم مالك يوم الدين', 1, 3);
  check('الآية مع التي تليها تمرّ (زيادةٌ لا نقص)', textCheckOf(superset) === 'ok', pct(superset.match));
  // آيتان لا تختلفان إلا في كلمة: النسبة الكلية عالية (٣ من ٤) لكن كلمةً بُدّلت → لا تمرّ
  const near = gate('قل أعوذ برب الناس', 113, 1);
  check(
    'الناس ١ بدل الفلق ١: لا تمرّ — «الفلق» غائبة وسُمع بدلها «الناس»',
    textCheckOf(near) === 'weak' && near.missing.length === 1 && near.missing[0].heard === 'الناس' && near.predWords[3].ok === false,
    `${pct(near.match)} — ${JSON.stringify(near.missing)}`,
  );
  const subst = gate('قل هو الله الصمد', 112, 1);
  check('«الصمد» موضع «أحد»: إبدالٌ يُغلق البوّابة', textCheckOf(subst) === 'weak' && subst.missing[0]?.heard === 'الصمد', JSON.stringify(subst.missing));
  const dropped = gate('الحمد لله رب', 1, 2);
  check('إسقاط آخر كلمة في آيةٍ قصيرة يُغلق البوّابة', textCheckOf(dropped) === 'weak' && dropped.missing[0]?.word === 'العالمين' && !dropped.missing[0]?.heard, JSON.stringify(dropped.missing));
  const garbled = gate('اهدنا الصراط المستقين', 1, 6);
  check('تحريف سماعٍ يسير («المستقين») لا يُغلقها', textCheckOf(garbled) === 'ok', `${pct(garbled.match)} garbled=${garbled.garbled}`);
  const longDrop = gate(
    'الله لا إله إلا هو الحي القيوم لا تأخذه سنة ولا نوم له ما في السماوات وما في الأرض من ذا الذي يشفع عنده إلا بإذنه يعلم ما بين أيديهم وما خلفهم ولا يحيطون بشيء من علمه إلا بما شاء وسع كرسيه السماوات والأرض ولا يئوده حفظهما وهو العظيم',
    2,
    255,
  );
  check('آية الكرسي ناقصةً كلمةً واحدة (العلي): تُغتفر في الطوال', textCheckOf(longDrop) === 'ok' && longDrop.missing.length === 1, JSON.stringify(longDrop.missing));
  const empty = scoreTranscriptMatch('hello world', ayahText(1, 3));
  check('نصّ لاتيني = فارغ', empty.empty && empty.match === 0);
}

console.log('\n════════ 4) الخلاصة والاجتياز يحترمان البوّابة ════════');
{
  const words = buildTarget(surah(1), 'ayah', 3).words;
  const tjs = analyzeWords(words.map((w) => w.word), 'hafs', 'tartil');
  const perfect: WordAlignment[] = words.map((w, i) => ({
    index: i,
    ayah: w.ayah,
    word: w.word,
    startMs: i * 1500,
    endMs: i * 1500 + tjs[i].expectedMs,
    confidence: 0.9,
    status: 'excellent',
    tajweed: tjs[i],
  }));
  const ok = buildCoach(perfect, 95, 1, 'transcript', 1, { textCheck: 'ok', recall: 1, precision: 1 });
  check('نصّ صحيح + أزمنة ممتازة → اجتياز', ok.passed, ok.summary.slice(0, 60));
  const bad = buildCoach(perfect, 95, 0, 'transcript', 1, { textCheck: 'mismatch', recall: 0, precision: 0 });
  check('نصّ مخالف + أزمنة ممتازة → لا اجتياز', !bad.passed && /ليس نصَّ/.test(bad.summary), bad.summary.slice(0, 80));
  const weak = buildCoach(perfect, 95, 0.4, 'transcript', 1, { textCheck: 'weak', recall: 0.5, precision: 1 });
  check('بعض الآية + أزمنة ممتازة → لا اجتياز', !weak.passed && /بعض/.test(weak.summary), weak.summary.slice(0, 80));
  const unv = buildCoach(perfect, 95, 1, 'coverage', 1, { textCheck: 'unverified' });
  check('بلا سماع ذكي (لحظي) → لا اجتياز حتى يُتحقَّق', !unv.passed && /لم يُتحقَّق/.test(unv.summary), unv.summary.slice(0, 80));
  const demo = buildCoach(perfect, 95, 1, 'demo', 1, { textCheck: 'demo' });
  check('العرض التجريبي يجتاز', demo.passed);
}

console.log('\n════════ 5) الخطّ الكامل: التقييم اللحظي لا يُجيز، والعرض التجريبي يُجيز ════════');
async function pipeline() {
  const data = surah(1);
  const target = buildTarget(data, 'ayah', 3);
  const tjs = analyzeWords(target.words.map((w) => w.word), 'hafs', 'tartil');
  // تلاوة مصطنعة بأزمنة النموذج نفسها (مقاطع مسطّحة بفواصل صمت)
  const sr = 16000;
  const parts: Float32Array[] = [];
  for (const t of tjs) {
    const n = Math.round((t.expectedMs / 1000) * sr);
    const seg = new Float32Array(n);
    for (let i = 0; i < n; i++) seg[i] = 0.3 * Math.sin((2 * Math.PI * 140 * i) / sr) + 0.1 * Math.sin((2 * Math.PI * 280 * i) / sr);
    parts.push(seg, new Float32Array(Math.round(0.09 * sr)));
  }
  const total = parts.reduce((a, b) => a + b.length, 0);
  const samples = new Float32Array(total);
  let o = 0;
  for (const p of parts) {
    samples.set(p, o);
    o += p.length;
  }
  const instant = await runAlignment(
    { samples, demo: false },
    { tau: 0.8, modelSize: 'tiny', target, riwayah: 'hafs', tempo: 'tartil', fast: true },
    { stage: () => {} },
  );
  check('اللحظي: النصّ غير متحقَّق', instant.textCheck === 'unverified', instant.textCheck);
  check('اللحظي: لا اجتياز مهما حسُنت الأزمنة', !instant.passed, `${instant.overallScore}% · ${instant.summary.slice(0, 70)}`);
  check('اللحظي: الدرجة نفسها تُعرض (لا تُقيَّد)', instant.overallScore >= 70, `${instant.overallScore}%`);

  const demo = await runAlignment(
    { samples, demo: true },
    { tau: 0.8, modelSize: 'tiny', target, riwayah: 'hafs', tempo: 'tartil' },
    { stage: () => {} },
  );
  check('التجريبي: يجتاز', demo.passed && demo.textCheck === 'demo', `${demo.overallScore}%`);
  check(`حدّ البوّابة ${TEXT_GATE_OK}`, TEXT_GATE_OK === 0.5);
}

pipeline().then(() => {
  if (fails) {
    console.error(`\nFAILED: ${fails}`);
    process.exit(1);
  }
  console.log('\nALL PASS');
});
