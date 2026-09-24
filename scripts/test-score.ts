// TAHQĪQ — اختبار الدرجة نفسها على الخطّ الكامل (توليد صوت → محاذاة → حكم)
//
// الغاية: ألّا تكون الدرجة مجاملة. تلاوةٌ صحيحة النسق تجتاز، وتلاوةٌ مخرومة
// النسق (مدودٌ مقصّرة وكلماتٌ ممدودة، أو إيقاعٌ موحّد، أو كلماتٌ مسقطة) تسقط.
// كما يُقاس خطأ القياس نفسه: هل يستعيد التطبيق زمن الكلمة الذي وُلِّد فعلًا؟
//
// يولَّد الصوت هنا بمقاطع ذات غلافٍ مسطّح وبداية/نهاية حادّة، فيكون الزمن
// المسموع هو الزمن المطلوب بالضبط (إلا تكميم الإطار)، ولا يبقى شكٌّ في المرجع.

import { readFileSync } from 'node:fs';
import { runAlignment } from '../src/lib/alignment';
import { buildTarget, stripSurahBasmala } from '../src/lib/quran';
import { analyzeWords } from '../src/lib/tajweed';
import { autoReciter } from '../src/lib/reciter';
import { mulberry32 } from '../src/lib/util';
import type { SurahData, Tempo } from '../src/lib/types';

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
    meta: {
      id,
      name: s.name,
      englishName: '',
      englishNameTranslation: '',
      revelationType: '',
      numberOfAyahs: s.ayahs.length,
    },
    ayahs: s.ayahs.map((a: any) => ({ number: a.n, numberInSurah: a.n, text: a.text })),
  });
}

/** توليد تلاوة من أزمنة محدَّدة لكل كلمة (غلاف مسطّح، وفواصل صمت) */
function recite(durationsMs: number[], gapMs = 90, seed = 7): Float32Array {
  const sr = 16000;
  const rng = mulberry32(seed);
  const parts: Float32Array[] = [];
  for (const ms of durationsMs) {
    const n = Math.max(0, Math.round((ms / 1000) * sr));
    if (!n) {
      parts.push(new Float32Array(Math.round((gapMs / 1000) * sr)));
      continue;
    }
    const seg = new Float32Array(n);
    const f0 = 108 + rng() * 90;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      let v = 0;
      for (let h = 1; h <= 4; h++) v += Math.sin(2 * Math.PI * f0 * h * t) / h;
      seg[i] = v * 0.34 + (rng() - 0.5) * 0.02;
    }
    parts.push(seg);
    parts.push(new Float32Array(Math.round((gapMs / 1000) * sr)));
  }
  const total = parts.reduce((a, b) => a + b.length, 0);
  const out = new Float32Array(total);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

async function judge(
  data: SurahData,
  ayah: number,
  durationsMs: number[],
  tempo: Tempo = 'tartil',
  reference?: { id: string; name: string; pace: number | null },
) {
  const target = buildTarget(data, 'ayah', ayah);
  const tjs = analyzeWords(
    target.words.map((w) => w.word),
    'hafs',
    tempo,
  );
  const samples = recite(durationsMs);
  const res = await runAlignment(
    { samples, demo: true },
    { tau: 0.8, modelSize: 'tiny', target, riwayah: 'hafs', tempo, reference },
    { stage: () => {} },
  );
  return { res, tjs, target };
}

/** القارئ المرجعي التلقائي لمرتبة (كما يمرّره التطبيق في كل تحليل) */
function refFor(tempo: Tempo) {
  const r = autoReciter('hafs', tempo);
  return { id: r.id, name: r.name, pace: r.pace };
}

async function main() {
  const d1 = surah(1);
  const d112 = surah(112);
  const d2 = surah(2);

  console.log('════════ 1) دقّة القياس: هل يُستعاد الزمن المولَّد؟ ════════');
  {
    const target = buildTarget(d112, 'ayah', 1);
    const tjs = analyzeWords(
      target.words.map((w) => w.word),
      'hafs',
      'tartil',
    );
    const truth = tjs.map((t) => Math.round(t.expectedMs * 0.95));
    const { res } = await judge(d112, 1, truth);
    const rel = res.words.map((w, i) => Math.abs((w.endMs - w.startMs - truth[i]) / truth[i]));
    const worst = Math.max(...rel);
    const meanErr = rel.reduce((a, b) => a + b, 0) / rel.length;
    check('متوسط خطأ قياس زمن الكلمة دون ١٥٪', meanErr < 0.15, `${(meanErr * 100).toFixed(1)}% (أسوأ كلمة ${(worst * 100).toFixed(0)}%)`);
    check('لا كلمة مسموعة تُحكم «لم تُسمع»', res.words.every((w) => w.status !== 'silent'), res.words.map((w) => w.status).join('، '));
  }

  console.log('\n════════ 2) تلاوة صحيحة النسق تجتاز ════════');
  for (const [label, data, ayah] of [
    ['الفاتحة ١', d1, 1],
    ['الفاتحة ٥', d1, 5],
    ['الإخلاص ١', d112, 1],
    ['آية الكرسي', d2, 255],
  ] as [string, SurahData, number][]) {
    const target = buildTarget(data, 'ayah', ayah);
    const tjs = analyzeWords(
      target.words.map((w) => w.word),
      'hafs',
      'tartil',
    );
    const rng = mulberry32(1234);
    const good = tjs.map((t) => Math.round(t.expectedMs * (0.88 + rng() * 0.24)));
    const { res } = await judge(data, ayah, good);
    check(`${label}: تجتاز`, res.passed && res.overallScore >= 70, `${res.overallScore}% · عدلة السرعة ${res.tempoScale.toFixed(2)}`);
  }

  console.log('\n════════ 3) تلاوة مخرومة النسق تسقط ════════');
  {
    // المدود تُقصَّر والكلمات القصيرة تُمطَّط — عين ما يفعله من لا يضبط الأحكام
    const target = buildTarget(d2, 'ayah', 255);
    const tjs = analyzeWords(
      target.words.map((w) => w.word),
      'hafs',
      'tartil',
    );
    const inverted = tjs.map((t) => (t.isMadd || t.isGhunna ? Math.round(t.expectedMs * 0.4) : Math.round(t.expectedMs * 1.9)));
    const { res } = await judge(d2, 255, inverted);
    check('آية الكرسي بنسقٍ مقلوب لا تجتاز', !res.passed, `${res.overallScore}%`);

    const flat = tjs.map(() => Math.round((tjs.reduce((a, b) => a + b.expectedMs, 0) / tjs.length) * 0.9));
    const r2 = await judge(d2, 255, flat);
    check('آية الكرسي بإيقاعٍ موحّد (لا تمييز بين المدّ وغيره) لا تجتاز', !r2.res.passed, `${r2.res.overallScore}%`);

    const dropped = tjs.map((t, i) => (i % 5 === 3 ? 0 : Math.round(t.expectedMs * 0.95)));
    const r3 = await judge(d2, 255, dropped);
    check('إسقاط كلمات يظهر «لم تُسمع» ويسقط الدرجة', !r3.res.passed && r3.res.words.some((w) => w.status === 'silent'), `${r3.res.overallScore}%`);
  }

  console.log('\n════════ 4) السرعة الموحّدة لا تُعاقب، لكنّها تُذكر ════════');
  {
    const target = buildTarget(d1, 'ayah', 5);
    const tjs = analyzeWords(
      target.words.map((w) => w.word),
      'hafs',
      'tartil',
    );
    const fast = tjs.map((t) => Math.round(t.expectedMs * 0.62));
    const { res } = await judge(d1, 5, fast);
    check('قراءة أسرع بنسقٍ صحيح تجتاز بعدلة السرعة', res.passed, `${res.overallScore}% · عدلة ${res.tempoScale.toFixed(2)}`);
    check('تُذكر سرعة القارئ في الخلاصة', res.tempoScale < 0.82 && /أسرع|أبطأ/.test(res.summary), res.summary.slice(0, 90));
    check('الأزمنة المعروضة هي أزمنة مرتبته (لا النموذج المطلق)', res.words.every((w) => w.tajweed.expectedMs < tjs[w.index].expectedMs), '—');
  }

  console.log('\n════════ 5) العتبات: عتبة السماح تُغيّر الحكم فعلًا ════════');
  {
    const target = buildTarget(d112, 'ayah', 1);
    const tjs = analyzeWords(
      target.words.map((w) => w.word),
      'hafs',
      'tartil',
    );
    const jitter = tjs.map((t, i) => Math.round(t.expectedMs * (i % 2 ? 0.6 : 1.45)));
    const { res } = await judge(d112, 1, jitter);
    check('تذبذب ±٤٥٪ بين كلمة وأخرى لا يجتاز', !res.passed, `${res.overallScore}%`);
  }

  console.log('\n════════ 6) آيةٌ من كلمةٍ واحدة لا تُقاس بنفسها (الٓمٓ) ════════');
  {
    // شكوى القارئ: قرأ «الم» كلمةً عادية في ٠٫٩٢ ث حدرًا فحُكمت «متقنة» بدرجة ٧٩٪ —
    // لأن عدلة السرعة كانت نسبةَ الكلمة نفسها (٠٫٩٢ ÷ ٢٫٥٨ ≈ ×٠٫٣٦) فطابق المتوقَّعُ المقيس.
    for (const [label, ref] of [
      ['بلا قارئ مرجعي', undefined],
      ['بالقارئ المرجعي للحدر', refFor('hadr')],
    ] as const) {
      const { res } = await judge(d2, 1, [920], 'hadr', ref);
      const w = res.words[0];
      check(`الٓمٓ في ٠٫٩٢ ث حدرًا (${label}): «أقصر» لا «متقن»`, w.status === 'short', `${w.status} · ${w.endMs - w.startMs}/${w.tajweed.expectedMs} م.ث`);
      check(`الٓمٓ في ٠٫٩٢ ث حدرًا (${label}): لا تجتاز`, !res.passed && res.overallScore < 70, `${res.overallScore}%`);
      check(`الٓمٓ في ٠٫٩٢ ث حدرًا (${label}): الزمن المنتظر ≥ ٢ ث`, w.tajweed.expectedMs >= 2000, `${w.tajweed.expectedMs} م.ث`);
      check(`الٓمٓ في ٠٫٩٢ ث حدرًا (${label}): الخلاصة تنبّه على إتمام المدود`, /أسرع|أقصر|المد/.test(res.summary), res.summary.slice(0, 110));
    }
    {
      const exp = analyzeWords([buildTarget(d2, 'ayah', 1).words[0].word], 'hafs', 'hadr')[0].expectedMs;
      const { res } = await judge(d2, 1, [Math.round(exp * 1.05)], 'hadr', refFor('hadr'));
      check('الٓمٓ بمقاديرها (ستٌّ للّام وستٌّ للميم) تجتاز', res.passed && ['ok', 'excellent'].includes(res.words[0].status), `${res.words[0].status} · ${res.overallScore}%`);
    }
    {
      // القرّاء المعتمدون يمطّون اللازم فوق الستّ: السديس نحو ٦٫٧ ث، والحصري نحو ٩٫٩ ث
      const a = await judge(d2, 1, [6700], 'hadr', refFor('hadr'));
      check('الٓمٓ بمطّ السديس (٦٫٧ ث حدرًا) لا تُحكم طويلة', ['ok', 'excellent'].includes(a.res.words[0].status), `${a.res.words[0].status} · ${a.res.overallScore}%`);
      const b = await judge(d2, 1, [9900], 'tartil', refFor('tartil'));
      check('الٓمٓ بمطّ الحصري (٩٫٩ ث ترتيلًا) لا تُحكم طويلة', ['ok', 'excellent'].includes(b.res.words[0].status), `${b.res.words[0].status} · ${b.res.overallScore}%`);
    }
    {
      // «طه» و«يسٓ» و«حمٓ» كذلك: آياتٌ من كلمةٍ واحدة
      const { res } = await judge(surah(36), 1, [420], 'tadwir', refFor('tadwir'));
      check('يسٓ في ٠٫٤٢ ث (كلمةً عادية) تدويرًا: «أقصر»', res.words[0].status === 'short', `${res.words[0].status}`);
    }
  }

  console.log('\n════════ 7) القارئ المرجعي مسطرةٌ في كل تحليل ════════');
  {
    const target = buildTarget(d1, 'ayah', 5);
    const tjs = analyzeWords(
      target.words.map((w) => w.word),
      'hafs',
      'tartil',
    );
    const good = tjs.map((t) => Math.round(t.expectedMs * 1.02));
    const { res } = await judge(d1, 5, good, 'tartil', refFor('tartil'));
    check('التحليل يحمل اسم القارئ المرجعي (مسطرة السرعة)', !!res.reference?.name && res.reference.id === 'husary', res.reference?.name ?? '—');
    check('تلاوةٌ صحيحة النسق تجتاز بمرجع الترتيل', res.passed, `${res.overallScore}% · عدلة ${res.tempoScale.toFixed(2)}`);
    const fast = tjs.map((t) => Math.round(t.expectedMs * 0.62));
    const r2 = await judge(d1, 5, fast, 'tartil', refFor('tartil'));
    check('الأسرع من مرجعه بنسقٍ صحيح يجتاز، وتُذكر سرعته نسبةً إلى القارئ', r2.res.passed && /القارئ المرجعي/.test(r2.res.summary), `${r2.res.overallScore}% · ${r2.res.summary.slice(0, 80)}`);
    // آيةٌ طويلة: تحكمها سرعة قارئها لا المرجع (عدلةٌ قريبة من سرعته الفعلية)
    const t255 = analyzeWords(buildTarget(d2, 'ayah', 255).words.map((w) => w.word), 'hafs', 'tartil');
    const r3 = await judge(d2, 255, t255.map((t) => Math.round(t.expectedMs * 0.8)), 'tartil', refFor('tartil'));
    check('آية الكرسي بسرعة ×٠٫٨: العدلة تتبع القارئ (لا المرجع)', Math.abs(r3.res.tempoScale - 0.8) < 0.1 && r3.res.passed, `عدلة ${r3.res.tempoScale.toFixed(2)} · ${r3.res.overallScore}%`);
  }

  console.log('\n════════ 6) الصمت قبل التلاوة لا يُحسب من الكلمة الأولى ════════');
  {
    // «الٓمٓ» بلا مدٍّ (٠٫٨ ث) بعد ٢٫٥ ث من السكوت: كانت تُقاس ٣٫٢ ث (من أول التسجيل) فتُحكم «جيدة»
    const target = buildTarget(d2, 'ayah', 1);
    const sr = 16000;
    const lead = new Float32Array(Math.round(2.5 * sr));
    const body = recite([800]);
    const samples = new Float32Array(lead.length + body.length + sr);
    samples.set(body, lead.length);
    const res = await runAlignment(
      { samples, demo: true },
      { tau: 0.8, modelSize: 'tiny', target, riwayah: 'hafs', tempo: 'hadr', reference: refFor('hadr') },
      { stage: () => {} },
    );
    const w = res.words[0];
    check('﴿الٓمٓ﴾ بلا مدّ بعد سكوت: «أقصر» ولا تجتاز', w.status === 'short' && !res.passed, `${w.startMs}–${w.endMs} م.ث · ${w.status}`);

    // آيةٌ تامّة النسق بعد سكوتٍ ٠٫٨ ث: الأولى لا تُحكم «أطول» والأخيرة لا تُحكم «أقصر»
    const t4 = buildTarget(d1, 'ayah', 4);
    const tjs = analyzeWords(t4.words.map((x) => x.word), 'hafs', 'tartil');
    const b2 = recite(tjs.map((t) => t.expectedMs));
    const s2 = new Float32Array(Math.round(0.8 * sr) + b2.length);
    s2.set(b2, Math.round(0.8 * sr));
    const r2 = await runAlignment(
      { samples: s2, demo: true },
      { tau: 0.8, modelSize: 'tiny', target: t4, riwayah: 'hafs', tempo: 'tartil' },
      { stage: () => {} },
    );
    check(
      'سكوتٌ قبل الآية: الأولى والأخيرة في المقدار',
      r2.words[0].status !== 'long' && r2.words.at(-1)!.status !== 'short' && r2.passed,
      r2.words.map((x) => `${x.endMs - x.startMs}:${x.status}`).join(' '),
    );
  }

  if (fails) {
    console.error(`\nFAILED: ${fails}`);
    process.exit(1);
  }
  console.log('\nALL PASS');
}

main();
