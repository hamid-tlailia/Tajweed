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
import { buildTarget } from '../src/lib/quran';
import { analyzeWords } from '../src/lib/tajweed';
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
  return {
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
  };
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

async function judge(data: SurahData, ayah: number, durationsMs: number[], tempo: Tempo = 'tartil') {
  const target = buildTarget(data, 'ayah', ayah);
  const tjs = analyzeWords(
    target.words.map((w) => w.word),
    'hafs',
    tempo,
  );
  const samples = recite(durationsMs);
  const res = await runAlignment(
    { samples, demo: true },
    { tau: 0.8, modelSize: 'tiny', target, riwayah: 'hafs', tempo },
    { stage: () => {} },
  );
  return { res, tjs, target };
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

  if (fails) {
    console.error(`\nFAILED: ${fails}`);
    process.exit(1);
  }
  console.log('\nALL PASS');
}

main();
