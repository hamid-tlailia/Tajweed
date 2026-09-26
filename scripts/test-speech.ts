// TAHQĪQ — اختبار بوّابة الكلام: هل يعلم التطبيق ماذا قال القارئ؟
//
// الشكوى التي يُختبر لها هنا: «التطبيق لا يعرف ماذا قلت — الآية نفسها أم آيةً
// أخرى أم كلامًا عاديًّا، وحتى لو سكتُّ حسبها صحيحة».
//
// يُشغَّل **المحرّك نفسه** (`runAlignment`) على صوتٍ مولَّد، والسماعُ الذكيّ
// بديلٌ يُتحكَّم فيما يسمعه (scripts/asr-double.mjs) — فتُختبر البوّابات كلها
// كما تعمل في المتصفّح: كاشفُ الكلام، وبوّابةُ النصّ، ومطابقةُ المصحف كلّه،
// وإخفاق السماع على كلامٍ مسموع (لا يفتح الاجتياز بأزمنةٍ وحدها).
//
//   node --import ./scripts/asr-double.mjs  ← يُوجّه استيراد whisper إلى البديل

import { readFileSync } from 'node:fs';
import { asr } from './asr-double.mjs';
import { runAlignment } from '../src/lib/alignment';
import { speechPresence } from '../src/lib/audio';
import { buildTarget, stripSurahBasmala, targetTextOf } from '../src/lib/quran';
import { analyzeWords } from '../src/lib/tajweed';
import { autoReciter } from '../src/lib/reciter';
import { normalizeForMatch } from '../src/lib/match';
import { mulberry32 } from '../src/lib/util';
import type { SurahData } from '../src/lib/types';

let fails = 0;
function check(name: string, cond: boolean, extra = '') {
  console.log(`${cond ? '✔' : '✘'} ${name}${extra ? `  →  ${extra}` : ''}`);
  if (!cond) fails++;
}

/* ------------------------------------------------------------------ */
/* بيئة الاختبار: بيانات المصحف + فهرسه (بدل جلبه من الشبكة)           */
/* ------------------------------------------------------------------ */

const QURAN_PATH = new URL('../public/quran.json', import.meta.url);
const quran = JSON.parse(readFileSync(QURAN_PATH, 'utf8'));
(globalThis as any).fetch = async (url: string) => {
  if (String(url).includes('quran.json')) {
    return { ok: true, status: 200, json: async () => JSON.parse(readFileSync(QURAN_PATH, 'utf8')) };
  }
  throw new Error(`unexpected fetch in test: ${url}`);
};

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

function ayahText(id: number, n: number): string {
  const s = quran.surahs.find((x: any) => x.id === id);
  return s.ayahs.find((a: any) => a.n === n).text;
}

/* ------------------------------------------------------------------ */
/* توليد الصوت                                                         */
/* ------------------------------------------------------------------ */

const SR = 16000;

/** تلاوةٌ مولَّدة: مقاطع توافقية بأزمنة محدَّدة، بينها سكتات */
function recite(durationsMs: number[], gapMs = 90, amp = 0.34, seed = 7): Float32Array {
  const rng = mulberry32(seed);
  const parts: Float32Array[] = [];
  for (const ms of durationsMs) {
    const n = Math.max(0, Math.round((ms / 1000) * SR));
    if (!n) {
      parts.push(new Float32Array(Math.round((gapMs / 1000) * SR)));
      continue;
    }
    const seg = new Float32Array(n);
    const f0 = 108 + rng() * 90;
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      let v = 0;
      for (let h = 1; h <= 4; h++) v += Math.sin(2 * Math.PI * f0 * h * t) / h;
      seg[i] = v * amp + (rng() - 0.5) * 0.02;
    }
    parts.push(seg, new Float32Array(Math.round((gapMs / 1000) * SR)));
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

/** صمتٌ رقميّ (الميكروفون لم يلتقط شيئًا) */
function digitalSilence(sec: number): Float32Array {
  return new Float32Array(Math.round(sec * SR));
}

/** ضجيج غرفة (أبيض) — ما يلتقطه الهاتفُ في غرفةٍ ساكنة مع التضخيم التلقائي */
function roomNoise(sec: number, amp: number, seed = 3): Float32Array {
  const rng = mulberry32(seed);
  const n = Math.round(sec * SR);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = (rng() - 0.5) * 2 * amp;
  return out;
}

/** ضجيجٌ ورديّ (مروحة/شارع) — طيفُه كطيف الكلام في مستواه، فبه يُختبر الكاشف */
function pinkNoise(sec: number, amp: number, seed = 4): Float32Array {
  const rng = mulberry32(seed);
  const n = Math.round(sec * SR);
  const out = new Float32Array(n);
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  for (let i = 0; i < n; i++) {
    const w = (rng() - 0.5) * 2;
    b0 = 0.99765 * b0 + w * 0.099046;
    b1 = 0.963 * b1 + w * 0.2965164;
    b2 = 0.57 * b2 + w * 1.0526913;
    out[i] = (b0 + b1 + b2 + w * 0.1848) * amp;
  }
  return out;
}

/* ------------------------------------------------------------------ */

async function judge(
  data: SurahData,
  ayah: number,
  samples: Float32Array,
  opts: { fast?: boolean; tempo?: 'hadr' | 'tadwir' | 'tartil' } = {},
) {
  const target = buildTarget(data, 'ayah', ayah);
  const tempo = opts.tempo ?? 'tartil';
  const ref = autoReciter('hafs', tempo);
  return runAlignment(
    { samples, demo: false },
    {
      tau: 0.8,
      modelSize: 'tiny',
      target,
      riwayah: 'hafs',
      tempo,
      ...(opts.fast ? { fast: true } : {}),
      reference: { id: ref.id, name: ref.name, pace: ref.pace },
    },
    { stage: () => {} },
  );
}

async function main() {
  const d1 = surah(1);
  const d112 = surah(112);
  const d113 = surah(113);

  const target5 = buildTarget(d1, 'ayah', 5);
  const tjs5 = analyzeWords(
    target5.words.map((w) => w.word),
    'hafs',
    'tartil',
  );
  const good5 = tjs5.map((t) => Math.round(t.expectedMs * 0.95));
  const speech5 = recite(good5);
  const silent5 = digitalSilence(speech5.length / SR);
  const noisy5 = roomNoise(speech5.length / SR, 0.004);
  const pink5 = pinkNoise(speech5.length / SR, 0.02);

  console.log('════════ 1) كاشف الكلام: صمتٌ وضجيجٌ لا يُعدّان كلامًا ════════');
  {
    const cases: [string, Float32Array, boolean][] = [
      ['صمتٌ رقميّ', silent5, false],
      ['ضجيج غرفة خافت', noisy5, false],
      ['ضجيجٌ ورديّ (مروحة)', pink5, false],
      ['تلاوةٌ مولَّدة', speech5, true],
    ];
    for (const [name, s, expected] of cases) {
      const p = speechPresence(s);
      check(
        `${name}: ${expected ? 'كلام' : 'ليس كلامًا'}`,
        p.hasSpeech === expected,
        `كلام=${Math.round(p.speechMs)}م.ث صوت=${Math.round(p.voicedMs)}م.ث ذروة=${p.peakDb.toFixed(0)}dB (${p.reason})`,
      );
    }
  }

  console.log('\n════════ 2) السكوت لا يُجاز (الشكوى الأصلية) ════════');
  {
    asr.nothing();
    const r = await judge(d1, 5, silent5);
    check('الصمت: لا اجتياز', !r.passed, `${r.overallScore}% · ${r.textCheck}`);
    check('الصمت: الحكم «لم يُسمع كلام»', r.textCheck === 'nospeech' && !!r.noSpeech, r.textCheck);
    check('الصمت: كلُّ الكلمات «لم تُسمع»', r.words.every((w) => w.status === 'silent'), r.words.map((w) => w.status).join(','));
    check('الصمت: المطابقة صفر', r.transcriptMatch === 0, String(r.transcriptMatch));
    check('الصمت: الدرجة مقيَّدة (≤ ٢٠٪)', r.overallScore <= 20, `${r.overallScore}%`);
    check('الصمت: الخلاصة تطلب القراءة', /لم يُسمع في هذا التسجيل كلام/.test(r.summary), r.summary.slice(0, 80));
    check('الصمت: زمن الكلام المقاس صفر', (r.speechMs ?? -1) === 0, `${r.speechMs}`);

    asr.nothing();
    const r2 = await judge(d1, 5, noisy5);
    check('ضجيج الغرفة: لا اجتياز', !r2.passed && r2.textCheck === 'nospeech', `${r2.overallScore}% · ${r2.textCheck}`);
    check('ضجيج الغرفة: لا يُقال «أخفق السماع» (فلا حكم بقياس الصوت)', !r2.textUnavailable, String(r2.textUnavailable));

    asr.nothing();
    const r3 = await judge(d1, 5, pink5);
    check('الضجيج الورديّ المرتفع: لا اجتياز', !r3.passed && r3.textCheck === 'nospeech', `${r3.overallScore}% · ${r3.textCheck}`);

    asr.nothing();
    const r4 = await judge(d1, 5, silent5, { fast: true });
    check('التقييم اللحظي للصمت: «لم يُسمع كلام» لا «أزمنةٌ حسنة»', !r4.passed && r4.textCheck === 'nospeech', `${r4.overallScore}% · ${r4.textCheck}`);
  }

  console.log('\n════════ 3) الآية نفسها / آيةٌ أخرى / كلامٌ عادي ════════');
  {
    asr.say(normalizeForMatch(ayahText(1, 5)));
    const same = await judge(d1, 5, speech5);
    check('الآية نفسها: تجتاز', same.passed && same.textCheck === 'ok', `${same.overallScore}% · ${same.textCheck}`);
    check('الآية نفسها: تُنسب إليها', same.textKind === 'target', String(same.textKind));
    check('الآية نفسها: المطابقة تامّة', same.transcriptMatch > 0.9, same.transcriptMatch.toFixed(2));

    asr.say(normalizeForMatch(ayahText(1, 6)));
    const other = await judge(d1, 5, speech5);
    check('آيةٌ أخرى: لا اجتياز', !other.passed, `${other.overallScore}% · ${other.textCheck}`);
    check('آيةٌ أخرى: تُكشف آيةً أخرى', other.textKind === 'quran', String(other.textKind));
    check('آيةٌ أخرى: تُسمّى سورتُها ورقمُها', other.heardOf?.surahId === 1 && other.heardOf?.ayah === 6, JSON.stringify(other.heardOf));
    check('آيةٌ أخرى: الخلاصة تُسمّيها', /يُشبه سورة/.test(other.summary), other.summary.slice(0, 90));

    asr.say('انا ذاهب الى السوق لشراء الخبز');
    const speech = await judge(d1, 5, speech5);
    check('كلامٌ عادي: لا اجتياز', !speech.passed, `${speech.overallScore}% · ${speech.textCheck}`);
    check('كلامٌ عادي: لا يُدّعى أنه آيةٌ أخرى', speech.textKind !== 'quran', `${speech.textKind} · ${speech.heardOf ? `${speech.heardOf.surahName}:${speech.heardOf.ayah}` : '—'}`);
    check('كلامٌ عادي: يُكشف كلامًا', speech.textKind === 'speech', String(speech.textKind));
    check('كلامٌ عادي: الخلاصة تُصرّح', /كلامٌ عادي/.test(speech.summary), speech.summary.slice(0, 80));

    asr.say(normalizeForMatch(ayahText(113, 1)));
    const otherSurah = await judge(d112, 1, recite([420, 520, 420, 620]));
    check('الإخلاص وقُرئت الفلق: تُسمّى الفلق', otherSurah.textKind === 'quran' && otherSurah.heardOf?.surahId === 113, `${otherSurah.textKind} · ${otherSurah.heardOf?.surahName ?? '—'}`);
  }

  console.log('\n════════ 4) بعضُ الآية لا يُجيز ════════');
  {
    asr.say(normalizeForMatch(ayahText(1, 5)).split(/\s+/).slice(0, 2).join(' '));
    const half = await judge(d1, 5, speech5);
    check('نصف الآية: لا اجتياز', !half.passed, `${half.overallScore}% · ${half.textCheck}`);
    check('نصف الآية: الحكم «ضعيف»', half.textCheck === 'weak', half.textCheck);
  }

  console.log('\n════════ 5) إخفاق السماع على **كلامٍ مسموع** لا يُجيز الأزمنة وحدها ════════');
  {
    asr.nothing();
    const r = await judge(d1, 5, speech5);
    check('كلامٌ بيّن والسماع أخفق: اللفظ غير متحقَّق', !!r.textUnavailable && r.textCheck === 'unverified', `${r.textCheck} · ${r.textUnavailable}`);
    check('…ولا يُقال «لم يُسمع كلام»', r.textCheck !== 'nospeech' && !r.noSpeech, r.textCheck);
    check('…ولا يُجاز ولو حسُنت الأزمنة', !r.passed, `${r.overallScore}%`);
    check('…ويُصرَّح بأن الأزمنة غير معتمدة', /غير معتمدة|للتدريب|حتى يتبيّن/.test(r.summary), r.summary.slice(0, 100));

    asr.fail('model unavailable');
    const broken = await judge(d1, 5, speech5);
    check('تعذّر النموذج: نتيجةٌ لحظية لا تُجيز', !broken.passed && broken.textCheck === 'unverified', `${broken.textCheck}`);

    asr.fail('model unavailable');
    const brokenSilence = await judge(d1, 5, silent5);
    check('تعذّر النموذج + صمت: «لم يُسمع كلام»', brokenSilence.textCheck === 'nospeech' && !brokenSilence.passed, brokenSilence.textCheck);
  }

  console.log('\n════════ 6) السماع الذكيّ يُصدَّق على كاشف الكلام ════════');
  {
    // تلاوةٌ خافتة قد يشكّ فيها الكاشف: ما دام السماع أخرج نصًّا فهو الحَكَم
    const faint = recite(good5, 90, 0.02);
    asr.say(normalizeForMatch(ayahText(1, 5)));
    const r = await judge(d1, 5, faint);
    check('تلاوةٌ خافتة سمعها السماع: تُقاس بالنصّ لا بالكاشف', r.textCheck !== 'nospeech', `${r.textCheck} · ${r.overallScore}%`);
    check('…وتُجاز إن أحسنت', r.passed, `${r.overallScore}%`);
  }

  console.log('\n════════ 7) آيةٌ طويلة: سكوتٌ في أثنائها لا يُجاز ════════');
  {
    const t255 = analyzeWords(
      buildTarget(surah(2), 'ayah', 255)
        .words.map((w) => w.word),
      'hafs',
      'tartil',
    );
    const silence = digitalSilence(t255.reduce((a, t) => a + t.expectedMs, 0) / 1000 + 1);
    asr.nothing();
    const r = await judge(surah(2), 255, silence);
    check('آية الكرسي مع السكوت: لا اجتياز', !r.passed && r.textCheck === 'nospeech', `${r.overallScore}% · ${r.textCheck}`);
    check('…وكلماتُها كلها لم تُسمع', r.words.every((w) => w.status === 'silent'), `${r.words.filter((w) => w.status === 'silent').length}/${r.words.length}`);
  }

  console.log('\n════════ 8) الخلاصة تُبنى لكلّ حالة ════════');
  {
    const tj = analyzeWords(['ٱلۡحَمۡدُ'], 'hafs', 'tadwir')[0];
    const w = { index: 0, ayah: 2, word: 'ٱلۡحَمۡدُ', startMs: 0, endMs: tj.expectedMs, confidence: 0.2, status: 'silent', tajweed: tj, textHeard: false } as any;
    const c = (await import('../src/lib/coach')).buildCoach([w], 15, 0, 'coverage', 1, { textCheck: 'nospeech' });
    check('خلاصة «لم يُسمع كلام» تُذكر', /لم يُسمع في هذا التسجيل كلام/.test(c.summary) && !c.passed, c.summary.slice(0, 70));
    check('ولا تُساق فيها نصائحُ أزمنة', c.tips.length === 0, String(c.tips.length));
  }
}

main().then(() => {
  if (fails) {
    console.error(`\nFAILED: ${fails}`);
    process.exit(1);
  }
  console.log('\nALL PASS');
});
