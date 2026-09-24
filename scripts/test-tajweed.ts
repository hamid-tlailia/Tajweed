// Tajweed rule engine — اختبارات وحدة + تكامل على نصوص عثمانية حقيقية
// (تُقرأ الآيات نفسها من public/quran.json — نسخة ar.quran-uthmani)
// التشغيل: npx tsx scripts/test-tajweed.ts  أو  npm run test:rules
import { readFileSync } from 'node:fs';
import type { Riwayah } from '../src/lib/types.ts';
import { scoreTranscriptMatch } from '../src/lib/match.ts';
import { analyzeWord, analyzeWords, timingTraceOf, TEMPO_SCALE } from '../src/lib/tajweed.ts';
import { toNumberArray } from '../src/lib/whisper.ts';

const quran: any = JSON.parse(readFileSync(new URL('../public/quran.json', import.meta.url)));
const ayahText = (s: number, a: number): string =>
  quran.surahs.find((x: any) => x.id === s).ayahs.find((x: any) => x.n === a).text;
const wordsOf = (s: number, a: number): string[] =>
  ayahText(s, a)
    .trim()
    .replace(/[\u200a\u2060\u200c\ufeff]/g, '') // نفس تنظيف buildTarget في التطبيق
    .split(/\s+/)
    .filter((w: string) => /[\u0621-\u064A]/.test(w));

/** كلمة «مجردة»: حروف أساسية فقط (ٱ/أ/إ/آ→ا، ی/ى→ي) — لمطابقة آمنة بمعزل عن ترتيب الحركات */
const bare = (w: string) =>
  w
    .replace(/\u0640/g, '')
    .replace(/\u0670/g, '\u0627') // الألف الخنجرية حرف مدٍّ ألفي قائم بذاته في الرسم
    .replace(/[^\u0621-\u064A\u0671\u06CC\u0649]/g, '')
    .replace(/[\u0671\u0623\u0625\u0622]/g, '\u0627')
    .replace(/[\u06CC\u0649]/g, '\u064A');

type R = ReturnType<typeof analyzeWord>;
let fail = 0;
let pass = 0;

function check(ok: boolean, label: string, detail = '') {
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? '✔' : '✘'} ${label}${detail ? `  →  ${detail}` : ''}`);
}

const has = (r: R, label: string) => r.rules.some((x) => x.label === label);
const hasNot = (r: R, label: string) => !r.rules.some((x) => x.label === label);
const rulesOf = (r: R) => r.rules.map((x) => x.label).join('، ') || '—';

/** تحليل آية كاملة بالسياق */
function ayahRules(s: number, a: number): { ws: string[]; rs: R[] } {
  const ws = wordsOf(s, a);
  return { ws, rs: analyzeWords(ws) };
}
function findWord(s: number, a: number, pred: (bareWord: string, rawWord: string) => boolean): R | null {
  const { ws, rs } = ayahRules(s, a);
  const i = ws.findIndex((w) => pred(bare(w), w));
  return i >= 0 ? rs[i] : null;
}

console.log('════════ 1) المدود ════════');
{
  const w = findWord(69, 1, (b) => b === 'الحاقة');
  check(has(w!, 'مَدٌّ لَازِمٌ كَلِمِيٌّ مُثَقَّل'), 'ٱلۡحَاۤقَّةُ → لازم كلمي مُثقَّل (وليس متصلًا)', rulesOf(w!));
  check(hasNot(w!, 'مَدٌّ وَاجِبٌ مُتَّصِل'), 'ٱلۡحَاۤقَّةُ → لا يسمَّى متصلًا');
}
{
  const w = findWord(1, 7, (b) => b === 'الضالين');
  check(has(w!, 'مَدٌّ لَازِمٌ كَلِمِيٌّ مُثَقَّل'), 'ٱلضَّاۤلِّينَ → لازم كلمي مُثقَّل', rulesOf(w!));
}
{
  const w = findWord(2, 1, (b) => b === 'الم');
  check(has(w!, 'مَدٌّ لَازِمٌ حَرْفِيّ'), 'الٓمٓ (فاتحة البقرة) → لازم حرفي', rulesOf(w!));
}
{
  const w = findWord(2, 22, (b) => b === 'والسماء');
  check(has(w!, 'مَدٌّ وَاجِبٌ مُتَّصِل'), 'وَٱلسَّمَاۤءَ → واجب متصل', rulesOf(w!));
  const m = findWord(2, 22, (b) => b === 'ماء');
  check(has(m!, 'مَدٌّ وَاجِبٌ مُتَّصِل'), 'مَاۤءࣰ → واجب متصل (ألف ثم همز)', rulesOf(m!));
}
{
  const w = findWord(10, 49, (b) => b === 'جاء');
  check(has(w!, 'مَدٌّ وَاجِبٌ مُتَّصِل'), 'إِذَا جَاۤءَ → واجب متصل', rulesOf(w!));
}
{
  const w = findWord(10, 51, (b) => b === 'ءالان');
  check(has(w!, 'مَدٌّ لَازِمٌ كَلِمِيٌّ مُخَفَّف'), 'ءَاۤلۡـَٰنَ → لازم كلمي مُخفَّف', rulesOf(w!));
  check(hasNot(w!, 'مَدٌّ وَاجِبٌ مُتَّصِل'), 'ءَاۤلۡـَٰنَ → ليست متصلًا (السكون الأصلي يقدَّم)');
}
{
  const w = findWord(10, 90, (b) => b === 'لا');
  check(has(w!, 'مَدٌّ جَائِزٌ مُنْفَصِل'), 'لَاۤ إِلَـٰهَ → جائز منفصل', rulesOf(w!));
  const b = findWord(10, 90, (bb) => bb === 'بنوا');
  check(has(b!, 'مَدٌّ جَائِزٌ مُنْفَصِل'), 'بَنُوۤا۟ إِسۡرَ‌ٰ⁠ۤءِیلَ → جائز منفصل (واو الجماعة + ألف الفارقة)', rulesOf(b!));
}
{
  const w = findWord(2, 38, (b) => b === 'خوف');
  check(has(w!, 'مَدُّ اللِّين (عند الوقف)'), 'لَا خَوۡفٌ → مد لين (وقفًا)', rulesOf(w!));
}
{
  const w = findWord(1, 5, (b) => b === 'نعبد');
  check(Boolean(w) && !w.isMadd, 'نَعۡبُدُ → بلا مد (بنية قصيرة تمامًا)', w ? rulesOf(w) : 'الكلمة غير موجودة!');
}
{
  const w = findWord(1, 2, (b) => b === 'العالمين');
  check(has(w!, 'مَدٌّ طَبِيعِي'), 'ٱلۡعَـٰلَمِینَ → مد طبيعي (ألف خنجرية)', rulesOf(w!));
  check(w!.expectedMs > 1000, 'ٱلۡعَـٰلَمِینَ → زمن متوقع مركّب (طبيعيّان)', `${w!.expectedMs}ms`);
}
{
  const w = findWord(2, 2, (b) => b === 'لا');
  check(has(w!, 'مَدٌّ طَبِيعِي') && hasNot(w!, 'مَدٌّ لَازِمٌ حَرْفِيّ'), 'لَا (لَا رَیۡبَ) → طبيعي فقط', rulesOf(w!));
}
{
  const w = findWord(71, 6, (b) => b.includes('دعاء'));
  check(has(w!, 'مَدٌّ وَاجِبٌ مُتَّصِل') && has(w!, 'مَدٌّ جَائِزٌ مُنْفَصِل'), 'دُعَاۤءِیۤ إِلَّا → متصل + منفصل معًا', rulesOf(w!));
  const f = findWord(71, 6, (b) => b === 'فرارا');
  check(has(f!, 'مَدُّ الْعِوَض (عند الوقف على التنوين)'), 'فِرَارࣰا (آخر الآية) → مد العِوَض عند الوقف', rulesOf(f!));
}
{
  const w = findWord(12, 74, (b) => b.startsWith('جزاؤه'));
  check(has(w!, 'مَدٌّ وَاجِبٌ مُتَّصِل'), 'جَزَ ٰ⁠ۤؤُهُۥۤ → واجب متصل', rulesOf(w!));
  check(has(w!, 'مَدُّ الصِّلَة الْكُبْرَى'), 'جَزَٰؤُهُۥ إِن كُنتُم → صلة كبرى');
}
{
  const w = findWord(2, 22, (b) => b === 'به');
  check(has(w!, 'مَدُّ الصِّلَة الصُّغْرَى'), 'فَأَخۡرَجَ بِهِۦ مِنَ → صلة صغرى (بعلامة ۦ)', rulesOf(w!));
}
{
  const w = findWord(2, 80, (b) => b === 'عهده');
  check(has(w!, 'مَدُّ الصِّلَة الْكُبْرَى'), 'عَهۡدَهُۥۤ أَمۡ → صلة كبرى (بعلامة ۥ)', rulesOf(w!));
}
{
  const w = findWord(13, 11, (b) => b === 'له');
  check(has(w!, 'مَدُّ الصِّلَة الصُّغْرَى'), 'لَهُۥ مُعَقِّبَٰتࣱ → صلة صغرى (بعلامة ۥ)', rulesOf(w!));
}
{
  const w = findWord(78, 3, (b) => b === 'مختلفون');
  check(has(w!, 'مَدٌّ عَارِضٌ لِلسُّكُون (عند الوقف)'), 'مُخۡتَلِفُونَ → مد عارض للسكون عند الوقف', rulesOf(w!));
}
{
  const w = findWord(2, 212, (b) => b === 'ءامنوا');
  check(has(w!, 'مَدُّ الْبَدَل'), 'ءَامَنُوا۟ → مد بدل (همز ثم مد)', rulesOf(w!));
  check(hasNot(w!, 'مَدٌّ وَاجِبٌ مُتَّصِل'), 'ءَامَنُوا۟ → ليست متصلًا');
}
{ // صراط: مد طبيعي بالألف الخنجرية بعد التطويل + قلقلة في الطاء + عارض عند الوقف
  const w = findWord(1, 7, (b) => b === 'صراط');
  check(has(w!, 'مَدٌّ طَبِيعِي') && has(w!, 'قَلْقَلَة كبرى (عند الوقف)') && has(w!, 'مَدٌّ عَارِضٌ لِلسُّكُون (عند الوقف)'), 'صِرَٰطَ → طبيعي + قلقلة طاء + عارض (بعد لحام 200A)', rulesOf(w!));
}

console.log('\\n════════ 2) النون الساكنة والتنوين ════════');
{
  const w = findWord(2, 51, (b) => b === 'من');
  check(has(w!, 'إقلاب') && has(w!, 'غُنَّة الإقلاب'), 'مِنۢ بَعۡدِهِۦ → إقلاب + غُنّة (بعلامة ۢ)', rulesOf(w!));
}
{
  const w = findWord(2, 10, (b) => b === 'اليم');
  check(has(w!, 'إقلاب'), 'عَذَابٌ أَلِی۪مُۢ بِمَاۤ → إقلاب التنوين', rulesOf(w!));
}
{
  const w = findWord(13, 35, (b) => b === 'من');
  check(has(w!, 'إخفاء') && has(w!, 'غُنَّة الإخفاء'), 'تَجۡرِی مِن تَحۡتِهَا → إخفاء (نون + تاء)', rulesOf(w!));
}
{
  const r2 = analyzeWord('خَيۡرࣰا', 'إِن شَآءَ');
  check(has(r2, 'إظهار حلقي'), 'خَيۡرࣰا إِن → إظهار حلقي (تنوين + همزة)');
}
{
  const w = findWord(2, 29, (b) => b === 'عليم');
  check(Boolean(w) && hasNot(w!, 'إظهار حلقي'), 'شَيۡءٍ عَلِيمࣱ (آخر 2:29) → لا حكم عبوري', w ? rulesOf(w) : '');
}
{
  // نونٌ تحرّكت لالتقاء الساكنين (مِنَ ٱلۡجِنَّةِ · مِنَ ٱلسَّمَآءِ) خارجةٌ عن أحكام النون الساكنة:
  // تُنطق ظاهرةً بحركتها فلا إدغامَ ولا إخفاءَ. ويشهد له رسم المصحف: النون الساكنة المُدغَمة
  // تُكتب بلا حركة ويُشدَّد ما بعدها «مِّن لَّدُنۡهُ» (١٨:٢)، وهذه كُتبت بحركتها «مِنَ ٱللَّهِ» (٢:٦١).
  const w = findWord(114, 6, (b) => b === 'من');
  check(
    Boolean(w) && !w!.rules.some((x) => x.label.startsWith('إدغام') || x.label.startsWith('إخفاء') || x.label === 'إظهار حلقي'),
    'مِنَ ٱلۡجِنَّةِ → لا حكم للنون المتحركة لالتقاء الساكنين',
    w ? rulesOf(w) : '—',
  );
  const w2 = findWord(2, 22, (b) => b === 'من');
  check(
    Boolean(w2) && !w2!.rules.some((x) => x.label.startsWith('إدغام') || x.label.startsWith('إخفاء') || x.label === 'إظهار حلقي'),
    'مِنَ ٱلسَّمَآءِ → لا حكم للنون المتحركة لالتقاء الساكنين',
    w2 ? rulesOf(w2) : '—',
  );
}
{
  // أماكن الحكم تُعرَف من رسم المصحف نفسه: النونُ المدغَمة أو المخفاة تُعرَّى من السكون،
  // والمُحرَّكة لالتقاء الساكنين تُثبت حركتَها — فالحكم قائمٌ على ما رسمه المصحف، لا على تقدير.
  const r = findWord(18, 2, (b) => b === 'من');
  check(has(r!, 'إدغام بغير غُنّة') && hasNot(r!, 'غُنَّة الإدغام'), 'مِّن لَّدُنۡهُ (١٨:٢) → إدغام بغير غُنّة (نونٌ معرَّاةٌ من السكون)', rulesOf(r!));
  const r2 = findWord(2, 5, (b) => b === 'من');
  check(has(r2!, 'إدغام بغير غُنّة'), 'مِّن رَّبِّهِمۡ (٢:٥) → إدغام بغير غُنّة (ر)', rulesOf(r2!));
  const g = findWord(2, 8, (b) => b === 'من');
  check(has(g!, 'إدغام بغُنّة'), 'مَن یَقُولُ (٢:٨) → إدغام بغُنّة (ياء، نونٌ معرَّاة)', rulesOf(g!));
  const k = findWord(2, 255, (b) => b === 'من');
  check(Boolean(k) && has(k!, 'إخفاء'), 'مَن ذَا (٢:٢٥٥) → إخفاء (ذال، نونٌ معرَّاة)', k ? rulesOf(k) : '—');
}
{
  // تنوينٌ لقيت نونُه همزةَ وصل: يُكسَر ويُنطق ظاهرًا («خَيۡرًا ٱلۡوَصِيَّةُ» ← «خَيۡرِنِ ٱلۡوَصِيَّة»)
  // فلا إدغامَ فيه ولا إخفاءَ ولا إظهار؛ وعلامةُ ضبطه في المصحف تنوينٌ متراكبٌ ثم همزةُ وصل.
  const w = findWord(2, 180, (b) => b === 'خيرا');
  check(
    Boolean(w) && !w!.rules.some((x) => x.label.startsWith('إدغام') || x.label.startsWith('إخفاء') || x.label === 'إظهار حلقي'),
    'خَيۡرًا ٱلۡوَصِيَّةُ (٢:١٨٠) → لا حكم للتنوين قبل همزة الوصل',
    w ? rulesOf(w) : '—',
  );
}
{
  // النون الساكنة داخل الكلمة الواحدة: الحكمُ للحرف الذي يليها مباشرة (أصل شكوى «إخفاء لا يظهر»)
  const a = findWord(90, 2, (b) => b === 'وانت');
  check(has(a!, 'إخفاء داخل الكلمة') && has(a!, 'غُنَّة الإخفاء'), 'وَأَنتَ (٩٠:٢) → إخفاء داخل الكلمة (نون ساكنة + تاء)', rulesOf(a!));
  const z = findWord(2, 22, (b) => b === 'وانزل');
  check(has(z!, 'إخفاء داخل الكلمة'), 'وَأَنزَلَ (٢:٢٢) → إخفاء داخل الكلمة (زاي)', rulesOf(z!));
  const n = findWord(56, 84, (b) => b === 'تنظرون');
  check(has(n!, 'إخفاء داخل الكلمة'), 'تَنظُرُونَ (٥٦:٨٤) → إخفاء داخل الكلمة (ظاء)', rulesOf(n!));
  const s = findWord(2, 102, (b) => b === 'منهما');
  check(Boolean(s) && has(s!, 'إظهار داخل الكلمة'), 'مِنۡهُمَا (٢:١٠٢) → إظهار داخل الكلمة (هاء)', s ? rulesOf(s) : '—');
}
{
  // النون قبل الباء داخل الكلمة إقلابٌ (لا إخفاء) والميم الساكنة قبل الباء إخفاءٌ شفوي
  const q = findWord(2, 33, (b) => b === 'انبئهم');
  check(
    has(q!, 'إقلاب (داخل الكلمة)') && has(q!, 'إخفاء شفوي'),
    'أَنۢبِئۡهُم (٢:٣٣) → إقلابٌ داخليّ + إخفاء شفوي (ميمٌ ساكنة قبل الباء)',
    rulesOf(q!),
  );
  const labels = q!.rules.map((x) => x.label);
  check(labels.length === new Set(labels).size, 'أَنۢبِئۡهُم → لا شاراتٍ مكرَّرة', labels.join('، '));
  const h = findWord(1, 2, (b) => b === 'الحمد');
  check(has(h!, 'إظهار شفوي'), 'ٱلۡحَمۡدُ (١:٢) → إظهار شفوي (ميمٌ ساكنة + دال)', rulesOf(h!));
}
{
  const w = findWord(2, 2, (b) => b === 'هدي');
  check(has(w!, 'إدغام بغير غُنّة'), 'هُدࣰى لِّلۡمُتَّقِینَ → إدغام التنوين في اللام', rulesOf(w!));
}
{
  const w = findWord(36, 53, (b) => b === 'صيحة');
  check(has(w!, 'إدغام بغُنّة'), 'صَیۡحَةࣰ وَ ٰ⁠حِدَةࣰ → إدغام بغُنّة (تنوين + واو)', rulesOf(w!));
}
{
  const r = analyzeWord('مِنۡ', 'وَلِیࣲّ');
  check(has(r, 'إدغام بغُنّة') && has(r, 'غُنَّة الإدغام'), 'مِنۡ وَلِیࣲّ → إدغام بغُنّة (و في ينمو)', rulesOf(r));
  const r2 = analyzeWord('مِنۡ', 'يَنۡصُرُ');
  check(has(r2, 'إدغام بغُنّة'), 'مِنۡ يَنۡصُرُ → إدغام بغُنّة (ي)', rulesOf(r2));
  const r3 = analyzeWord('مِنۡ', 'مَّغۡفِرَةࣲ');
  check(has(r3, 'إدغام بغُنّة'), 'مِنۡ مَّغۡفِرَةࣲ → إدغام بغُنّة (م)', rulesOf(r3));
  const r4 = analyzeWord('مِنۡ', 'رَحۡمَةࣲ');
  check(has(r4, 'إدغام بغير غُنّة') && hasNot(r4, 'غُنَّة الإدغام'), 'مِنۡ رَحۡمَةࣲ → إدغام بغير غُنّة (ر)', rulesOf(r4));
  const r5 = analyzeWord('مِنۡ', 'خَوۡفࣲ');
  check(has(r5, 'إظهار حلقي'), 'مِنۡ خَوۡفࣲ → إظهار حلقي (خ)', rulesOf(r5));
  const r6 = analyzeWord('عَلِیمࣱ', 'حَكِیمࣱ');
  check(has(r6, 'إظهار حلقي'), 'عَلِیمࣱ حَكِیمࣱ → إظهار حلقي (تنوين + ح)', rulesOf(r6));
  const r7 = analyzeWord('مِنۡ', 'فَرَحࣲ');
  check(has(r7, 'إخفاء') && has(r7, 'غُنَّة الإخفاء'), 'مِنۡ فَرَحࣲ → إخفاء (ف)', rulesOf(r7));
}
{ // النون داخل الكلمة
  const w = findWord(13, 35, (b) => b === 'الانهار');
  check(has(w!, 'إظهار داخل الكلمة'), 'ٱلۡأَنۡهَٰرُ → إظهار داخل الكلمة', rulesOf(w!));
  const d = findWord(2, 212, (b) => b === 'الدنيا');
  check(d ? has(d, 'إخفاء داخل الكلمة') : true, 'ٱلدُّنۡیَا → إخفاء داخل الكلمة (الكلمات الأربع عند حفص)', d ? rulesOf(d) : '—');
}

console.log('\\n════════ 3) الميم الساكنة ════════');
{
  const w = findWord(105, 4, (b) => b === 'ترميهم');
  check(has(w!, 'إخفاء شفوي') && has(w!, 'غُنَّة الإخفاء الشفوي'), 'تَرۡمِیهِم بِحِجَارَةࣲ → إخفاء شفوي + غُنّة', rulesOf(w!));
}
{
  const w = findWord(5, 36, (b) => b === 'لهم');
  check(has(w!, 'إدغام متماثل صغير'), 'أَنَّ لَهُم مَّا → إدغام متماثل صغير + غُنّة', rulesOf(w!));
}
{
  const r = analyzeWord('عَلَيۡهِمۡ', 'وَلِیࣲّ');
  check(has(r, 'إظهار شفوي'), 'عَلَيۡهِمۡ وَلِیࣲّ → إظهار شفوي (و)', rulesOf(r));
  const r2 = analyzeWord('عَلَيۡهِمۡ', 'رَبِّهِمۡ');
  check(has(r2, 'إظهار شفوي'), 'عَلَيۡهِمۡ رَبِّهِمۡ → إظهار شفوي (ر)', rulesOf(r2));
}

console.log('\\n════════ 4) الغُنّة المدِّية ════════');
{
  const w = findWord(27, 34, (b) => b === 'ان');
  check(has(w!, 'غُنّة مَدِّية'), 'قَالَتۡ إِنَّ ٱلۡمُلُوكَ → غُنّة مدِّية (نون مشدَّدة)', rulesOf(w!));
  const r2 = analyzeWord('ثُمَّ', 'ٱجۡتَنَبُوا');
  check(has(r2, 'غُنّة مَدِّية'), 'ثُمَّ → غُنّة مدِّية (ميم مشدَّدة)');
  const r3 = analyzeWord('عَمَّ', 'وَحِیۡجُكُم');
  check(has(r3, 'غُنّة مَدِّية'), 'عَمَّ → غُنّة مدِّية');
}

console.log('\\n════════ 5) القلقلة ════════');
{
  const w = findWord(113, 1, (b) => b === 'الفلق');
  check(has(w!, 'قَلْقَلَة كبرى (عند الوقف)'), 'ٱلۡفَلَقِ → قلقلة كبرى (وقفًا)', rulesOf(w!));
}
{
  const w = findWord(2, 126, (b) => b === 'اجعل');
  check(has(w!, 'قَلْقَلَة صغرى'), 'رَبِّ ٱجۡعَلۡ → قلقلة صغرى (سكون أصلي وسط الكلمة)', rulesOf(w!));
}
{
  const w = findWord(26, 63, (b) => b === 'فرق');
  check(has(w!, 'راء يجوز فيها الوجهان'), 'فِرۡقࣲ → راء يجوز فيها الوجهان', rulesOf(w!));
  check(has(w!, 'قَلْقَلَة كبرى (عند الوقف)'), 'فِرۡقࣲ → قلقلة كبرى (ق آخرة بتنوين الوقف)', rulesOf(w!));
}
{
  const b = findWord(1, 1, (bb) => bb === 'بسم');
  check(b ? hasNot(b, 'قَلْقَلَة كبرى (عند الوقف)') && hasNot(b, 'قَلْقَلَة صغرى') : false, 'بِسۡمِ → لا قلقلة', b ? rulesOf(b) : 'غير موجودة');
}

console.log('\\n════════ 6) الراءات ════════');
{
  const w = findWord(89, 1, (b) => b === 'والفجر');
  check(has(w!, 'راء مرقَّقة'), 'وَٱلۡفَجۡرِ → راء مرقَّقة (مكسورة)', rulesOf(w!));
}
{
  const w = findWord(54, 16, (b) => b === 'ونذر');
  check(has(w!, 'راء مرقَّقة'), 'وَنُذُرِ → راء مرقَّقة (مكسورة وصلًا) ووقفًا تُفخَّم بعد الضم', rulesOf(w!));
}
{
  const r = analyzeWord('خَيۡرࣱ', 'بِهِۦ');
  check(has(r, 'راء يجوز فيها الوجهان'), 'خَيۡرࣱ → يجوز فيها الوجهان (ياء ساكنة بعد فتح) — الترقيق أولى عند حفص', rulesOf(r));
  const r2 = analyzeWord('رَبِّ', 'ٱلۡعَـٰلَمِینَ');
  check(has(r2, 'راء مفخَّمة'), 'رَبِّ → راء مفخَّمة (مفتوحة/مشدَّدة)', rulesOf(r2));
  const r3 = analyzeWord('ذُكۡرٌ', 'إِلَّا');
  check(has(r3, 'راء مفخَّمة'), 'ذُكۡرٌ → راء مفخَّمة (منوَّنة بضم/وقف: ساكنة بعد ضم)', rulesOf(r3));
  const r4 = analyzeWord('قِرۡطَاسࣰ', 'لَهُم مَّا');
  check(has(r4, 'راء مرقَّقة'), 'قِرۡطَاسࣰ → راء مرقَّقة (كسرة أصلية دون فاصلة استعلاء عند حفص)', rulesOf(r4));
  const r5 = analyzeWord('مِصۡرَۢ', 'أَهَبِطُوا');
  check(has(r5, 'راء يجوز فيها الوجهان'), 'مِصۡرَۢ → يجوز فيها الوجهان (استعلاء بين الراء والكسرة)', rulesOf(r5));
}

console.log('\\n════════ 7) اللام ════════');
{
  const w = findWord(1, 1, (b) => b === 'الله');
  check(has(w!, 'لام الجلالة مرقَّقة'), 'بِسۡمِ ٱللَّهِ → لام الجلالة مرقَّقة (بعد كسر)', rulesOf(w!));
}
{
  const w = findWord(2, 245, (b) => b === 'الله');
  check(has(w!, 'لام الجلالة مفخَّمة'), 'يُقۡرِضُ ٱللَّهَ → لام الجلالة مفخَّمة (بعد ضم)', rulesOf(w!));
}
{
  const w = findWord(7, 200, (b) => b === 'بالله');
  check(has(w!, 'لام الجلالة مرقَّقة'), 'فَٱسۡتَعِذۡ بِٱللَّهِ → لام الجلالة مرقَّقة (باء الجر)', rulesOf(w!));
}
{
  const r = analyzeWord('ٱلشَّهۡر', '');
  check(has(r, 'لاَم شمسيّة'), 'ٱلشَّهۡر → لام شمسيّة');
  const a = findWord(103, 1, (b) => b.endsWith('عصر'));
  check(has(a!, 'لاَم قَمَريّة'), 'وَٱلۡعَصۡرِ → لام قَمَريّة', rulesOf(a!));
}

console.log('\\n════════ 8) التفخيم الذاتي + حالات سالبة ════════');
{
  const w = findWord(86, 1, (b) => b === 'والطارق');
  check(has(w!, 'حرف استعلاء (تفخيم)'), 'وَٱلطَّارِقِ → حرف استعلاء (تفخيم)', rulesOf(w!));
}
{
  const r = analyzeWord('سَأَلَ');
  check(!r.isMadd && !r.isGhunna, 'سَأَلَ → لا مد إطلاقًا (همز بين حركتين ليس مدًّا)', rulesOf(r));
  const r2 = analyzeWord('عَلَيۡهِمۡ', 'خَوۡفࣲ');
  check(!r2.isMadd, 'عَلَيۡهِمۡ → لا مد (ياء بعد فتحة ليست مدًّا)', rulesOf(r2));
  const r3 = analyzeWord('يَوۡمࣱ', 'ذَ ٰ⁠لِكَ');
  check(!r3.isMadd, 'يَوۡمࣱ → لا مد طبيعي ولا لين (الواو وسط الكلمة)', rulesOf(r3));
  const r4 = analyzeWord('مَالِكًا');
  check(r4.isMadd && r4.maddType === 'مَدٌّ طَبِيعِي', 'مَالِكًا → مد طبيعي', rulesOf(r4));
}

console.log('\\n════════ 9) تكامل: الفاتحة 2 والصمد ════════');
{
  const { ws, rs } = ayahRules(1, 2);
  console.log('  ' + ws.map((w, i) => `${w}{${rulesOf(rs[i])}}`).join(' '));
  const { ws: ws3, rs: rs3 } = ayahRules(112, 2);
  console.log('  ' + ws3.map((w, i) => `${w}{${rulesOf(rs3[i])}}`).join(' '));
  check(rs.every((r) => r.expectedMs >= 240), 'الفاتحة 2: كل الأزمنة المتوقعة صحيحة');
  check(rs3.some((r) => has(r, 'غُنّة مَدِّية') || has(r, 'لام الجلالة مفخَّمة')), 'ٱللَّهُ ٱلصَّمَدُ → أحكام ظاهرة');
}

console.log('\\n════════ 10) تغطية المصحف كاملًا (فحص متانة + إحصاء) ════════');
{
  const counts = new Map<string, number>();
  let words = 0;
  let withRules = 0;
  let msInvalid = 0;
  const t0 = Date.now();
  for (const s of quran.surahs) {
    for (const a of s.ayahs) {
      const ws = a.text.trim().replace(/[\u200a\u2060\u200c\ufeff]/g, '').split(/\s+/).filter((w: string) => /[\u0621-\u064A]/.test(w));
      const rs = analyzeWords(ws);
      for (const r of rs) {
        words++;
        if (r.rules.length) withRules++;
        if (!Number.isFinite(r.expectedMs) || r.expectedMs < 200) msInvalid++;
        for (const b of r.rules) counts.set(b.label, (counts.get(b.label) ?? 0) + 1);
      }
    }
  }
  console.log(`  ${words} كلمة في ${Math.round((Date.now() - t0) / 100) / 10}s · ${withRules} كلمة تحمل حكمًا (${Math.round((100 * withRules) / words)}%)`);
  const sorted = [...counts.entries()].sort((x, y) => y[1] - x[1]);
  for (const [k, v] of sorted) console.log(`    ${v.toString().padStart(6)}  ${k}`);
  check(words > 77000 && msInvalid === 0, 'المصحف كاملًا دون استثناءات ولا أزمنة غير صالحة', `${words} كلمة، أزمنة غير صالحة: ${msInvalid}`);
  for (const must of ['إقلاب', 'إظهار حلقي', 'إدغام بغُنّة', 'إدغام بغير غُنّة', 'إخفاء', 'مَدٌّ طَبِيعِي', 'مَدٌّ وَاجِبٌ مُتَّصِل',
    'مَدٌّ جَائِزٌ مُنْفَصِل', 'مَدٌّ لَازِمٌ كَلِمِيٌّ مُثَقَّل', 'مَدٌّ لَازِمٌ حَرْفِيّ', 'مَدُّ الصِّلَة الصُّغْرَى', 'مَدُّ الصِّلَة الْكُبْرَى',
    'مَدُّ اللِّين (عند الوقف)', 'غُنّة مَدِّية', 'إخفاء شفوي', 'إظهار شفوي', 'راء مفخَّمة', 'راء مرقَّقة']) {
    const found = sorted.some(([k]) => k === must);
    check(found, `الحكم «${must}» مكتشف فعليًا في المصحف`);
  }
}

console.log('\n════════ 11) إصلاح BigInt: تطبيع مخرجات النموذج إلى أرقام ════════');
{
  // بعض نُسخ ONNX Runtime تُرجع معرفات الرموز int64 فتظهر BigInt وترمي عند أي حساب
  // عليها («Cannot convert a BigInt value to a number») — وهذا ما كان يُسقط التحليل.
  const big = new BigInt64Array([50257n, 1234n, 0n]);
  const nums = toNumberArray(big);
  check(
    nums.length === 3 && nums[0] === 50257 && nums[1] === 1234 && nums[2] === 0,
    'BigInt64Array ← أرقام عادية (بلا رمي)',
    nums.join('، '),
  );
  check(
    toNumberArray([1n, 2, 3]).every((v) => typeof v === 'number'),
    'خلط BigInt بأرقام عادية ← كلها numbers',
  );
  let ok = true;
  let sum = 0;
  try {
    sum = toNumberArray(big).reduce((a, b) => a + b, 0);
  } catch {
    ok = false;
  }
  check(ok && sum === 51491, 'الحساب على الناتج لا يرمي BigInt', String(sum));
  check(toNumberArray(new Int32Array([7, 8])).join(',') === '7,8', 'Int32Array يبقى كما هو');
  check(toNumberArray(null).length === 0 && toNumberArray(undefined).length === 0, 'الفارغ ← مصفوفة فارغة');
}

console.log('\n════════ 12) رواية ورش عن نافع (فروق الأصول) ════════');
{
  const wordsR = (s: number, a: number, r: Riwayah) => analyzeWords(wordsOf(s, a), r);
  const findR = (s: number, a: number, pred: (b: string) => boolean, r: Riwayah): R | null => {
    const ws = wordsOf(s, a);
    const rs = analyzeWords(ws, r);
    const i = ws.findIndex((w) => pred(bare(w)));
    return i >= 0 ? rs[i] : null;
  };

  // النقل: «عَلَیۡهِمۡ ءَأَنذَرۡتَهُمۡ» ← عَلَيْهِمَأَنْذَرْتَهُم
  const naql = findR(2, 6, (b) => b === 'عليهم', 'warsh');
  check(has(naql!, 'نَقْل حركة الهمزة'), 'عَلَیۡهِمۡ ءَأَنذَرۡتَهُمۡ → نَقْل حركة الهمزة (ورش)', rulesOf(naql!));
  check(hasNot(findR(2, 6, (b) => b === 'عليهم', 'hafs')!, 'نَقْل حركة الهمزة'), 'وعند حفص لا نَقْل');

  // إبدال الهمز الساكن: یُؤۡمِنُونَ ← يُومِنُونَ
  const ibdal = findR(2, 6, (b) => b === 'يؤمنون', 'warsh');
  check(has(ibdal!, 'إبدال الهمز الساكن'), 'یُؤۡمِنُونَ → إبدال الهمز الساكن (ورش)', rulesOf(ibdal!));
  check(hasNot(findR(2, 6, (b) => b === 'يؤمنون', 'hafs')!, 'إبدال الهمز الساكن'), 'وعند حفص تحقيق الهمزة');

  // الهمزتان في كلمة
  const hamz = findR(2, 6, (b) => b.includes('نذرت'), 'warsh');
  check(has(hamz!, 'الهمزتان في كلمة'), 'ءَأَنذَرۡتَهُمۡ → الهمزتان في كلمة (ورش)', rulesOf(hamz!));

  // تقليل ذوات الياء + استثناء (عَلَىٰ، إِلَىٰ، حَتَّىٰ)
  check(
    has(findR(2, 5, (b) => b === 'هدي', 'warsh')!, 'تقليل ذوات الياء'),
    'هُدࣰى → تقليل ذوات الياء (ورش)',
    rulesOf(findR(2, 5, (b) => b === 'هدي', 'warsh')!),
  );
  check(
    hasNot(findR(2, 5, (b) => b === 'عليا', 'warsh')!, 'تقليل ذوات الياء'),
    'عَلَىٰ → لا تقليل (من المستثنيات المفتوحة عند ورش)',
  );
  check(
    hasNot(findR(2, 5, (b) => b === 'هدي', 'hafs')!, 'تقليل ذوات الياء'),
    'وعند حفص لا تقليل في ذوات الياء',
  );

  // تقليل ذوات الراء: أَصۡحَـٰبُ ٱلنَّارِ
  const ra = findR(2, 39, (b) => b === 'النار', 'warsh');
  check(ra ? has(ra, 'تقليل ذوات الراء') : true, 'ٱلنَّارِ → تقليل ذوات الراء (ورش)', ra ? rulesOf(ra) : '—');

  // المدود: البدل والمتصل يطولان عند ورش
  const badalH = analyzeWord('ءَامَنُوا۟', '', '', 'hafs');
  const badalW = analyzeWord('ءَامَنُوا۟', '', '', 'warsh');
  check(
    badalW.expectedMs > badalH.expectedMs && /ثلاثة أوجه/.test(badalW.rules.find((r) => r.label === 'مَدُّ الْبَدَل')?.note ?? ''),
    'ءَامَنُوا۟ → البدل (٢/٤/٦) عند ورش أطول من حفص',
    `${badalH.expectedMs}ms ← ${badalW.expectedMs}ms`,
  );
  const muttH = analyzeWord('جَاۤءَ', '', '', 'hafs');
  const muttW = analyzeWord('جَاۤءَ', '', '', 'warsh');
  check(muttW.expectedMs > muttH.expectedMs, 'جَاۤءَ → المتصل ٦ عند ورش', `${muttH.expectedMs}ms ← ${muttW.expectedMs}ms`);
}

console.log('\n════════ 13) تغطية رواية ورش على المصحف كاملًا ════════');
{
  const counts = new Map<string, number>();
  let words = 0;
  let msInvalid = 0;
  const t0 = Date.now();
  for (const s of quran.surahs) {
    for (const a of s.ayahs) {
      const ws = a.text
        .trim()
        .replace(/[\u200a\u2060\u200c\ufeff]/g, '')
        .split(/\s+/)
        .filter((w: string) => /[\u0621-\u064A]/.test(w));
      for (const r of analyzeWords(ws, 'warsh')) {
        words++;
        if (!Number.isFinite(r.expectedMs) || r.expectedMs < 200) msInvalid++;
        for (const b of r.rules) counts.set(b.label, (counts.get(b.label) ?? 0) + 1);
      }
    }
  }
  console.log(`  ${words} كلمة في ${Math.round((Date.now() - t0) / 100) / 10}s`);
  check(words > 77000 && msInvalid === 0, 'المصحف كاملًا برواية ورش دون أزمنة غير صالحة', `${words} كلمة، غير صالحة: ${msInvalid}`);
  for (const must of ['نَقْل حركة الهمزة', 'إبدال الهمز الساكن', 'الهمزتان في كلمة', 'تقليل ذوات الياء', 'تقليل ذوات الراء']) {
    const n = counts.get(must) ?? 0;
    check(n > 0, `الحكم «${must}» مكتشف فعليًا برواية ورش`, `${n} كلمة`);
  }
}

console.log('\\n════════ 14) غُنّة المشدَّدتين عامة من المتون — لا تختصّ بكلمة ولا برواية ════════');
{
  // الحكم من تحفة الأطفال والجزرية: كل نون/ميم مشدَّدة تُغَنّ حركتين عند جميع القرّاء.
  const naffathat = (r: Riwayah) => {
    const ws = wordsOf(113, 4);
    const rs = analyzeWords(ws, r);
    const i = ws.findIndex((w) => bare(w).includes('النفاثات'));
    return i >= 0 ? rs[i] : null;
  };
  const h = naffathat('hafs');
  const w = naffathat('warsh');
  check(Boolean(h) && has(h!, 'غُنّة مَدِّية'), 'ٱلنَّفَّاثَاتِ → غُنّة المشدَّدة (حفص)', h ? rulesOf(h) : '—');
  check(Boolean(w) && has(w!, 'غُنّة مَدِّية'), 'ٱلنَّفَّاثَاتِ → غُنّة المشدَّدة (ورش) — الحكم عام', w ? rulesOf(w) : '—');
  check(has(h!, 'لاَم شمسيّة'), 'ٱلنَّفَّاثَاتِ → لام شمسية (إدغام اللام في النون)', rulesOf(h!));
  check(hasNot(h!, 'إخفاء') && hasNot(h!, 'إدغام بغُنّة'), 'النون متحركة مشدَّدة فلا إخفاء/إدغام في الفاء (حفص)', rulesOf(h!));
  check(hasNot(w!, 'إخفاء') && hasNot(w!, 'إدغام بغُنّة'), 'ولا عند ورش: لا أصل لإدغام النون في الفاء', rulesOf(w!));
  const note = h?.rules.find((r) => r.label === 'غُنّة مَدِّية')?.note ?? '';
  check(/جميع القرّاء|كل القراء|جميع القراء/.test(note), 'شرح الغُنّة ينصّ على اتفاق القرّاء', note.slice(0, 80) + '…');
  check(/تحفة|الجزري/.test(note), 'الشرح يستند إلى التحفة أو الجزرية', note.slice(0, 80) + '…');
  check(!/عند حفص/.test(note), 'لم يبقَ في شرح الغُنّة قصرُ الحكم على حفص');
  check(!/النَّفَّاثَاتِ/.test(note) && !/النفاثات/.test(note), 'الشرح عامّ لا يختصّ بكلمة النفاثات');
  const ikhfaNote =
    analyzeWord('مِنۡ', 'فَرَحࣲ', '', 'hafs').rules.find((r) => r.label === 'غُنَّة الإخفاء')?.note ?? '';
  check(!/عند حفص/.test(ikhfaNote), 'شرح غُنّة الإخفاء أيضًا عامٌّ لا حفصيّ');
  check(has(analyzeWord('إِنَّ', 'ٱللَّهَ'), 'غُنّة مَدِّية'), 'إِنَّ → غُنّة المشدَّدة');
  check(has(analyzeWord('ثُمَّ'), 'غُنّة مَدِّية'), 'ثُمَّ → غُنّة المشدَّدة');
  const nas = findWord(114, 1, (b) => b === 'الناس' || b.endsWith('ناس'));
  check(nas ? has(nas, 'غُنّة مَدِّية') : true, 'ٱلنَّاس → غُنّة نون مشدَّدة (لام شمسية)', nas ? rulesOf(nas) : '—');
}

console.log('\\n════════ 15) مراتب القراءة: الحدر والتدوير والترتيل ════════');
{
  const t = analyzeWord('مَا', 'خَلَقَ', '', 'hafs', 'tartil');
  const d = analyzeWord('مَا', 'خَلَقَ', '', 'hafs', 'tadwir');
  const hh = analyzeWord('مَا', 'خَلَقَ', '', 'hafs', 'hadr');
  check(has(t, 'مَدٌّ طَبِيعِي') && has(hh, 'مَدٌّ طَبِيعِي'), 'الأحكام لا تتغيّر بتغيّر المرتبة', `${rulesOf(t)} | ${rulesOf(hh)}`);
  check(hh.expectedMs < d.expectedMs && d.expectedMs < t.expectedMs, 'أزمنة الحدر < التدوير < الترتيل', `${hh.expectedMs} < ${d.expectedMs} < ${t.expectedMs}`);
  const ratio = hh.expectedMs / t.expectedMs;
  check(Math.abs(ratio - TEMPO_SCALE.hadr) < 0.08, 'نسبة الحدر/الترتيل تطابق مقياس المرتبة', ratio.toFixed(3));
}

console.log('\\n════════ 16) مطابقة النصّ: حروف متصلة لا تُظهر صفرًا ════════');
{
  const exact = scoreTranscriptMatch('من شر ما خلق', 'من شر ما خلق');
  check(exact.match === 1 && !exact.empty, 'مطابقة تامة للكلمات', String(exact.match));
  const glued = scoreTranscriptMatch('منشرماخلق', 'من شر ما خلق');
  check(glued.match >= 0.8 && !glued.empty, 'نصّ عربي بلا فواصل لا يُظهر 0٪', glued.match.toFixed(2));
  const empty = scoreTranscriptMatch('hello world', 'من شر ما خلق');
  check(empty.empty && empty.match === 0, 'نصّ لاتيني يُعدّ فارغًا عربيًّا');
  const close = scoreTranscriptMatch('من شر ما خالق', 'من شر ما خلق');
  check(close.match >= 0.7, 'كلمة قريبة لا تُسقط المطابقة', close.match.toFixed(2));
}

console.log('\n════════ 17) عدّ الحركات على الرسم العثماني: ما لا يُنطق لا يُحسب ════════');
{
  /** كلمةٌ في سياق آيتها (بروايةٍ معيّنة) — فالوصلُ والوقفُ من السياق */
  const inAyah = (s: number, a: number, b: string, r: Riwayah = 'hafs'): R | null => {
    const ws = wordsOf(s, a);
    const rs = analyzeWords(ws, r);
    const i = ws.findIndex((w) => bare(w) === b);
    return i >= 0 ? rs[i] : null;
  };
  const hOf = (r: R | null) => (r ? r.harakat : -1);
  const near = (r: R | null, h: number) => Math.abs(hOf(r) - h) < 0.011;

  // 1) همزة الوصل: تُنطق مبتدأً بها، وتسقط بعد حرفٍ سابق (وَ/بِ/لِ/كَ/فَ) فلا تُحسب ساكنًا
  const allahStart = inAyah(2, 255, 'الله'); // ٱللَّهُ — أوّل الآية
  const allahWasl = inAyah(1, 1, 'الله'); // ٱللَّهِ — بعد «بِسۡمِ»
  check(near(allahStart, 3.5), 'ٱللَّهُ مبتدأً بها: همزةُ الوصل حركةٌ كاملة', `${hOf(allahStart)} حركات`);
  check(near(allahWasl, 2.5), 'ٱللَّهِ وصلًا: همزةُ الوصل تسقط فلا تُحسب', `${hOf(allahWasl)} حركات`);
  const biHaqq = inAyah(2, 71, 'بالحق');
  check(near(biHaqq, 4), 'بِٱلۡحَقِّ: لا نصفَ حركةٍ لألف الوصل (٤ حركات)', `${hOf(biHaqq)} حركات`);

  // 2) ألفٌ خنجريةٌ اتُّخذت كُرسيًّا للهمزة: ليست مدًّا (فَٱدَّٰرَٰٔۡتُمۡ ← فادّارَأْتُم)
  const daratum = inAyah(2, 72, 'فاداراتم');
  check(
    hasNot(daratum!, 'مَدٌّ لَازِمٌ كَلِمِيٌّ مُخَفَّف') && hasNot(daratum!, 'مَدٌّ لَازِمٌ كَلِمِيٌّ مُثَقَّل'),
    'فَٱدَّٰرَٰٔۡتُمۡ: الخنجريةُ كُرسيُّ الهمزة فلا مدَّ لازم',
    rulesOf(daratum!),
  );
  check(near(daratum, 6.5), 'فَٱدَّٰرَٰٔۡتُمۡ: ٦٫٥ حركات (كانت ١٢ قبل ضبط الكُرسيّ)', `${hOf(daratum)} حركات`);

  // 3) خنجريةٌ مرسومةٌ على الهمزة نفسها ← مَدُّ بدل (قُرۡءَـٰنࣰا · ٱلۡـَٔـٰنَ · سَوۡءَٰتُهُمَا)
  const quranan = inAyah(12, 2, 'قرءانا');
  check(has(quranan!, 'مَدُّ الْبَدَل'), 'قُرۡءَـٰنࣰا → مَدُّ بدلٍ لا طبيعي', rulesOf(quranan!));
  check(near(quranan, 4.75), 'قُرۡءَـٰنࣰا: ألفُ التنوين لا مقطعَ لها (٤٫٧٥)', `${hOf(quranan)} حركات`);
  const alana = inAyah(10, 51, 'ءالان');
  check(
    has(alana!, 'مَدٌّ لَازِمٌ كَلِمِيٌّ مُخَفَّف') && has(alana!, 'مَدُّ الْبَدَل'),
    'ءَاۤلۡـَٔـٰنَ → لازمٌ كلميٌّ مخفَّف + مَدُّ بدل',
    rulesOf(alana!),
  );
  check(near(alana, 9.5), 'ءَاۤلۡـَٔـٰنَ: ٩٫٥ حركات (٦ لللازم و٢ للبدل)', `${hOf(alana)} حركات`);
  const qurananW = inAyah(12, 2, 'قرءانا', 'warsh');
  check(hOf(qurananW) > hOf(quranan), 'قُرۡءَـٰنࣰا عند ورش: البدلُ أربعٌ لا حركتان', `${hOf(quranan)} ← ${hOf(qurananW)}`);

  // 4) ألفُ التنوين المفتوح رسمٌ لحملة الفتحتين لا مقطعٌ زائد
  const arabiyyan = inAyah(12, 2, 'عربيا');
  check(near(arabiyyan, 4.25), 'عَرَبِیࣰّا: تنوينٌ وغُنّةٌ خفيفة ولا حركةَ للألف', `${hOf(arabiyyan)} حركات`);

  // 5) أثرُ عدّ الحركات: مجموعُ الخطوات = الحركات، ولكل خطوةٍ سببٌ معروض
  const tr = timingTraceOf('ٱلرَّحۡمَـٰنِ', 'ٱلرَّحِیمِ', 'بِسۡمِ', 'hafs', 'tartil');
  const sum = Math.round(tr.steps.reduce((a, s) => a + s.h, 0) * 100) / 100;
  check(Math.abs(sum - tr.harakat) < 0.011, 'خطواتُ الأثر تجمعُ حركاتِ الكلمة نفسها', `${sum} مقابل ${tr.harakat}`);
  check(tr.steps.every((s) => s.why.length > 0), 'لكل خطوةٍ سببٌ يُعرض على المتعلِّم', String(tr.steps.length));
  check(tr.expectedMs >= tr.minMs && tr.expectedMs <= tr.maxMs, 'الزمنُ المنتظر داخلَ نافذة الأوجه', `${tr.minMs}..${tr.expectedMs}..${tr.maxMs}`);

  // 6) ضابطٌ على المصحف كلّه: لا كلمةَ تجاوز مدًّا معقولًا (أطولُها فواتحُ السور)
  let over = 0;
  let longest = 0;
  let longestWord = '';
  for (const s of quran.surahs) {
    for (const a of s.ayahs) {
      const ws = a.text.trim().replace(/[\u200a\u2060\u200c\ufeff]/g, '').split(/\s+/).filter((w: string) => /[\u0621-\u064A]/.test(w));
      for (const r of analyzeWords(ws)) {
        if (r.harakat > longest) { longest = r.harakat; longestWord = r.word; }
        if (r.harakat > 24) over++;
      }
    }
  }
  check(over === 0, 'لا كلمةَ في المصحف تجاوز ٢٤ حركةً', `أطولها ${longestWord} = ${longest} حركات`);
}

console.log(`\n${fail === 0 ? 'ALL PASS' : `${fail} FAILURES / ${pass} passed`}`);
process.exit(fail ? 1 : 0);
