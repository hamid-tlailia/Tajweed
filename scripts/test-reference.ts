// TAHQĪQ — اختبار «القارئ المرجعي مرجعُ كل تحليل»: الاختيار التلقائي، وضمّ التحكيم إلى النتيجة
//
// التشغيل: npm run test:reference
import { readFileSync } from 'node:fs';
import { runAlignment } from '../src/lib/alignment';
import { buildTarget, stripSurahBasmala } from '../src/lib/quran';
import { autoReciter, ayahAudioUrls, recitersFor, resolveReciter } from '../src/lib/reciter';
import { TEMPO_SCALE } from '../src/lib/tajweed';
import { priorCenter } from '../src/lib/tempo';
import { refKey, useTahqiq } from '../src/store';
import type { AlignmentResult, RefAlignment, SurahData } from '../src/lib/types';

let fails = 0;
function check(name: string, cond: boolean, extra = '') {
  console.log(`${cond ? '✔' : '✘'} ${name}${extra ? `  →  ${extra}` : ''}`);
  if (!cond) fails++;
}

console.log('════════ ١) الاختيار التلقائي بحسب الرواية والمرتبة ونوع التلاوة ════════');
check('حفص · حدر ← الحصري (قارئٌ معتمد للتعليم)', autoReciter('hafs', 'hadr').id === 'husary', autoReciter('hafs', 'hadr').name);
check('حفص · تدوير ← الحصري', autoReciter('hafs', 'tadwir').id === 'husary', autoReciter('hafs', 'tadwir').name);
check('حفص · ترتيل ← الحصري', autoReciter('hafs', 'tartil').id === 'husary', autoReciter('hafs', 'tartil').name);
check('حفص · مجوَّد ← عبد الباسط مجوَّدًا', autoReciter('hafs', 'tartil', 'mujawwad').id === 'abdulbasit-mujawwad');
check('ورش · تدوير ← ياسين الجزائري', autoReciter('warsh', 'tadwir').id === 'yassin-warsh');
check('ورش · مجوَّد (غير متاح) ← يعود إلى المرتَّل', autoReciter('warsh', 'tartil', 'mujawwad').riwayah === 'warsh');
check('الحصري مرجعًا للحدر: المسطرة نموذجُ الحدر لا سرعةُ الترتيل', priorCenter(1.19, TEMPO_SCALE.hadr) === 1);
check('الحصري مرجعًا للترتيل: المسطرة سرعتُه', Math.abs(priorCenter(1.19, TEMPO_SCALE.tartil) - 1.19) < 1e-9);
check('المنشاوي مرتَّلًا والحصري المعلِّم في القائمة', !!recitersFor('hafs', 'murattal').find((r) => r.id === 'minshawi') && !!recitersFor('hafs', 'murattal').find((r) => r.id === 'husary-muallim'));
const picked = resolveReciter('hafs', 'hadr', 'murattal', 'husary');
check('اختيار المستخدم مقدَّمٌ على التلقائي', picked.reciter.id === 'husary' && !picked.auto);
const wrong = resolveReciter('warsh', 'hadr', 'murattal', 'husary');
check('قارئٌ من روايةٍ أخرى لا يصلح مرجعًا (يعود التلقائي)', wrong.auto && wrong.reciter.riwayah === 'warsh', wrong.reciter.name);
const warshUrls = recitersFor('warsh').flatMap((r) => ayahAudioUrls(r, 2, 1, null));
check('روابط ورش تحت data/warsh/ (كان الجزء يسقط فلا يُجلب شيء)', warshUrls.length > 0 && warshUrls.every((u) => u.includes('/data/warsh/')), warshUrls[0]);
check('رابط الآية بصيغة SSSAAA', ayahAudioUrls(autoReciter('hafs', 'tartil'), 2, 1, null)[0].endsWith('/002001.mp3'));

console.log('\n════════ ٢) ضمّ التحكيم إلى النتيجة: لا تُجاز الآية بمخالفة القارئ ════════');
const quran = JSON.parse(readFileSync(new URL('../public/quran.json', import.meta.url), 'utf8'));
function surah(id: number): SurahData {
  const s = quran.surahs.find((x: any) => x.id === id);
  return stripSurahBasmala({
    id,
    meta: { id, name: s.name, englishName: '', englishNameTranslation: '', revelationType: '', numberOfAyahs: s.ayahs.length },
    ayahs: s.ayahs.map((a: any) => ({ number: a.n, numberInSurah: a.n, text: a.text })),
  });
}
/** صوتٌ مولَّد لكلمةٍ واحدة بطولٍ معلوم بين صمتين */
function tone(ms: number): Float32Array {
  const sr = 16000;
  const pad = Math.round(0.3 * sr);
  const n = Math.round((ms / 1000) * sr);
  const out = new Float32Array(n + 2 * pad);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    let v = 0;
    for (let h = 1; h <= 4; h++) v += Math.sin(2 * Math.PI * 140 * h * t) / h;
    out[pad + i] = v * 0.3;
  }
  return out;
}

async function main() {
  const d2 = surah(2);
  const target = buildTarget(d2, 'ayah', 1);
  const husary = autoReciter('hafs', 'tartil');
  const reference = { id: husary.id, name: husary.name, pace: husary.pace };
  const judge = async (ms: number): Promise<AlignmentResult> =>
    runAlignment(
      { samples: tone(ms), demo: false },
      { tau: 0.8, modelSize: 'tiny', target, riwayah: 'hafs', tempo: 'tartil', fast: true, reference },
      { stage: () => {} },
    );

  const st = useTahqiq.getState();
  useTahqiq.setState({
    surahCache: { 2: d2 },
    selectedSurahId: 2,
    selectedAyah: 1,
    scope: 'ayah',
    riwayah: 'hafs',
    tempo: 'tartil',
    referenceChoice: 'auto',
    recitationStyle: 'murattal',
    useReciterGate: true,
    progress: {},
    refCache: {},
  });
  check('القارئ المرجعي الفعلي للترتيل: الحصري', st.referenceOf().reciter.id === 'husary');

  // مرجع الحصري لـ«الٓمٓ» (≈٩٫٩ ث في تلاوته المرتَّلة)
  const ref: RefAlignment = { label: husary.name, reciterId: husary.id, quality: 'full', durationMs: 10500, score: 95, words: [{ startMs: 300, endMs: 10200 }] };
  useTahqiq.setState({ refCache: { [refKey(2, 1, husary.id)]: ref } });

  // تلاوةٌ «صحيحة» بمقاييس النموذج ذاتيًّا — لكن النتيجة لا تُحسب ناجحةً إلا إذا طابقت القارئ أيضًا
  const quick = await judge(920);
  // (التقييم اللحظي لا يُجيز لأنه لا يتحقّق من النصّ؛ فنعامله هنا كنتيجةٍ تحقّق نصُّها)
  useTahqiq.getState().setResult({ ...quick, textCheck: 'ok', instant: false, passed: quick.overallScore >= 70 });
  const r1 = useTahqiq.getState().result!;
  check('الٓمٓ في ٠٫٩٢ ث: تُضمّ إليها مقارنة الحصري تلقائيًّا', !!r1.reciter && r1.reciter.refLabel === husary.name, r1.reciter?.refLabel ?? '—');
  check('…ومطابقتها للقارئ ضعيفة ولا تُجاز', !!r1.reciter && r1.reciter.matchPct < 30 && !r1.passed, `${r1.reciter?.matchPct}% · passed=${r1.passed}`);
  check('…والكلمة ذاتيًّا «أقصر» (لا تناقض بين الحكمين)', r1.words[0].status === 'short' && r1.reciter?.perWord[0].dir === 'short', `${r1.words[0].status} / ${r1.reciter?.perWord[0].dir}`);

  // من حاكى القارئ: تُجاز
  const faithful = await judge(9600);
  useTahqiq.getState().setResult({ ...faithful, textCheck: 'ok', instant: false, passed: faithful.overallScore >= 70 });
  const r2 = useTahqiq.getState().result!;
  check('الٓمٓ بمطّ الحصري (٩٫٦ ث): تُجاز ذاتيًّا وبمطابقة القارئ', r2.passed && !!r2.reciter?.passed, `${r2.overallScore}% · ${r2.reciter?.matchPct}%`);
  check('…وتُفتح الآية في التقدّم', !!useTahqiq.getState().progress['2:hafs']?.[1]?.passed);

  // المرجع جاء بعد النتيجة وخالفته التلاوة: يُسحب الاجتياز الذي منحته الدرجة الذاتية وحدها
  useTahqiq.setState({ progress: {}, refCache: {} });
  const selfOk = await judge(5600);
  useTahqiq.getState().setResult({ ...selfOk, textCheck: 'ok', instant: false, passed: true });
  const before = useTahqiq.getState();
  check('بلا مرجعٍ بعدُ: تحكم الدرجة الذاتية (مؤقتًا)', before.result!.passed && !!before.progress['2:hafs']?.[1]?.passed);
  useTahqiq.setState({ refCache: { [refKey(2, 1, husary.id)]: { ...ref, words: [{ startMs: 300, endMs: 30300 }] } } });
  useTahqiq.getState().applyReference();
  const after = useTahqiq.getState();
  check('حضر المرجعُ فخالفته التلاوة بيّنًا: يُسحب الاجتياز', !after.result!.passed && !after.progress['2:hafs']?.[1]?.passed, `${after.result!.reciter?.matchPct}%`);

  // إيقاف مفتاح التحكيم: تبقى المطابقة معروضةً ويعود الحكم للدرجة الذاتية
  useTahqiq.getState().setUseReciterGate(false);
  const off = useTahqiq.getState().result!;
  check('مفتاح التحكيم متوقف: المطابقة معروضة والحكم للدرجة الذاتية', !!off.reciter && off.passed === off.selfPassed, `passed=${off.passed}`);

  if (fails) {
    console.error(`\nFAILED: ${fails}`);
    process.exit(1);
  }
  console.log('\nALL PASS');
  process.exit(0);
}

main();
