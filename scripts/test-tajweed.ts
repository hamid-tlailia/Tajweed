// Tajweed rule engine — اختبارات وحدة + تكامل على نصوص عثمانية حقيقية
// (تُقرأ الآيات نفسها من public/quran.json — نسخة ar.quran-uthmani)
// التشغيل: npx tsx scripts/test-tajweed.ts  أو  npm run test:rules
import { readFileSync } from 'node:fs';
import { analyzeWord, analyzeWords } from '../src/lib/tajweed.ts';

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
  const w = findWord(114, 6, (b) => b === 'من');
  check(has(w!, 'إدغام بغير غُنّة'), 'مِنَ ٱلۡجِنَّةِ → إدغام بغير غُنّة (بعد همزة الوصل)', rulesOf(w!));
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

console.log(`\n${fail === 0 ? 'ALL PASS' : `${fail} FAILURES / ${pass} passed`}`);
process.exit(fail ? 1 : 0);
