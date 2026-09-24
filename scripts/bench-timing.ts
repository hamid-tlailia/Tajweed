// TAHQĪQ — مِعيار دقّة القياس (bench)
//
// السؤال: كم يبلغ خطأ «قياس» التطبيق لزمن الكلمة؟
// تُقاس على العرض التجريبي: صوتٌ مولَّد من نموذج الأزمنة نفسه بتذبذب ±٢٥٪،
// فتُعرف أزمنةُ كلماته الحقيقية بإعادة تشغيل مولِّد الأعداد، ويُقارن بها ما
// قاسه الخطّ الكامل. وهو أيضًا ميزان معايرة: إن سقطت الدرجات هنا عن حدّ
// الاجتياز فالمشكلة في النموذج أو في القياس لا في القارئ.
//
// قبل إصلاح محرّك القياس: متوسط درجة ٥٥.٨٪، اجتاز ١ من ١٢، وخطأ قياس ٣٠.٩٪.
// بعده:                                        ٨١٪ تقريبًا، ١٢ من ١٢، وخطأ ~٦٪.
import { readFileSync } from 'node:fs';
import { makeDemoSamples } from '../src/lib/audio';
import { runAlignment } from '../src/lib/alignment';
import { analyzeWords } from '../src/lib/tajweed';
import { buildTarget, stripSurahBasmala } from '../src/lib/quran';
import { mulberry32, mean } from '../src/lib/util';
import type { SurahData, Tempo } from '../src/lib/types';

const j = JSON.parse(readFileSync('public/quran.json', 'utf8'));
function surah(id: number): SurahData {
  const s = j.surahs.find((x: any) => x.id === id);
  return stripSurahBasmala({
    id,
    meta: { id, name: s.name, englishName: '', englishNameTranslation: '', revelationType: '', numberOfAyahs: s.ayahs.length },
    ayahs: s.ayahs.map((a: any) => ({ number: a.n, numberInSurah: a.n, text: a.text })),
  });
}
const d1 = surah(1);
const d2 = surah(2);
const d112 = surah(112);

/**
 * إعادة بناء الأزمنة الحقيقية التي وُلِّد منها صوت العرض التجريبي.
 * يجب محاكاة عدد استدعاءات مولِّد الأعداد تمامًا كما في makeDemoSamples:
 * مدة + f0 + f1 + (نداء واحد لكل عيّنة ضجيج) + سكتة.
 */
function truthOf(expected: number[], seed = 20260918): number[] {
  const sr = 16000;
  const rng = mulberry32(seed);
  return expected.map((e) => {
    const durSec = (e * (0.78 + rng() * 0.5)) / 1000;
    rng(); // f0
    rng(); // f1
    const n = Math.max(Math.floor(sr * 0.12), Math.floor(durSec * sr));
    for (let i = 0; i < n; i++) rng(); // ضجيج لكل عيّنة
    rng(); // سكتة
    return Math.round((n / sr) * 1000);
  });
}

async function run(label: string, data: SurahData, ayah: number, tempo: Tempo) {
  const target = buildTarget(data, 'ayah', ayah);
  const tjs = analyzeWords(target.words.map((w) => w.word), 'hafs', tempo);
  const truth = truthOf(tjs.map((t) => t.expectedMs));
  const samples = makeDemoSamples(tjs);
  const res = await runAlignment({ samples, demo: true }, { tau: 0.8, modelSize: 'tiny', target, riwayah: 'hafs', tempo }, { stage: () => {} });
  const rel = res.words.map((w, i) => ((w.endMs - w.startMs) - truth[i]) / truth[i]);
  const abs = rel.map(Math.abs);
  const bias = mean(rel);
  console.log(`\n### ${label} · ${tempo} · ${target.words.length} كلمة`);
  console.log(`  الدرجة ${res.overallScore}%  اجتياز=${res.passed}  (تغطية الصوت ${(res.transcriptMatch * 100).toFixed(0)}%)`);
  console.log(`  خطأ قياس زمن الكلمة: انحياز ${bias >= 0 ? '+' : ''}${(bias * 100).toFixed(1)}% · متوسط مطلق ${(mean(abs) * 100).toFixed(1)}% · أقصى ${(Math.max(...abs) * 100).toFixed(1)}%`);
  console.log('  كلمة | الحقيقي | المقاس | النسبة r | الحكم');
  res.words.forEach((w, i) => {
    const r = (w.endMs - w.startMs) / truth[i];
    console.log(`   ${String(w.word).replace(/[\u0640\u064B-\u065F\u0670\u06D6-\u06EF\u08F0-\u08FE]/g, '').padEnd(12)} ${String(truth[i]).padStart(5)} ${String(w.endMs - w.startMs).padStart(5)}  ${r.toFixed(2)}  ${w.status}`);
  });
  return { score: res.overallScore, meanAbsErr: mean(abs) };
}

async function main() {
  const out = [];
  for (const tempo of ['tartil', 'tadwir', 'hadr'] as Tempo[]) {
    out.push(await run('الفاتحة ١', d1, 1, tempo));
    out.push(await run('الفاتحة ٥', d1, 5, tempo));
    out.push(await run('الإخلاص ١', d112, 1, tempo));
    out.push(await run('آية الكرسي', d2, 255, tempo));
  }
  console.log('\n=== الخلاصة ===');
  console.log('متوسط الدرجة على ١٢ تلاوة مثالية (مولَّدة من نموذج التطبيق نفسه):', mean(out.map(o => o.score)).toFixed(1) + '%');
  console.log('عدد ما اجتاز ٧٠٪:', out.filter(o => o.score >= 70).length, 'من', out.length);
  console.log('متوسط خطأ القياس النسبي:', (mean(out.map(o => o.meanAbsErr)) * 100).toFixed(1) + '%');
  console.log('والمطلوب للاجتياز: متوسط |r-1| ≤ 20.5%');
}
main();
