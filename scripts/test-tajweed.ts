// Tajweed rule engine — unit tests (real Uthmani encodings from AlQuran Cloud)
import { analyzeWord, analyzeWords } from '../src/lib/tajweed.ts';

// --- real Uthmani strings (codepoints verified against public/quran.json) ---
const MA = 'م\u064E\u0627'; // مَا
const ALHAQQAH = '\u0671\u0644\u06E1\u062D\u064E\u0627\u06E4\u0642\u0651\u064E\u0629\u064F'; // ٱلۡحَاۤقَّةُ
const WAMA = 'و\u064E\u0645\u064E\u0627\u06E4'; // وَمَاۤ
const ADRAR = '\u0623\u064E\u062F\u06E1\u0631\u064E\u064A\u0670\u0643\u064E'; // أَدۡرَىٰكَ
const BISM = 'ب\u0650\u0633\u06E1\u0645\u0650'; // بِسۡمِ
const DUAA = 'د\u064F\u0639\u064E\u0627\u06E4\u0627\u0650\u064A\u06E4'; // دُعَاۤءِیۤ (real uthmani: 062F 064F 0639 064E 0627 06E4 0627 0650 064A 06E4)
const ILLA = '\u0625\u0650\u0644\u0651\u064E\u0627'; // إِلَّا
// نوح 71:7 — فلم يزدهم دعائي إلا فراراً
const NOO7 = [
  'ف\u064E\u0644\u064E\u0645\u06E1', // فَلَمۤ
  '\u06CC\u064E\u0632\u0650\u062F\u06E1\u0647\u064F\u0645\u06E1', // یَزِدۡهُمۤ
  DUAA,
  ILLA,
  'ف\u0650\u0631\u064E\u0627\u0631\u08F0\u0627', // فِرَارࣰا
];

type R = ReturnType<typeof analyzeWord>;
const cases: [string, string, (r: R) => boolean, string][] = [
  [ALHAQQAH, '', (r) => r.maddType === 'مَدٌّ وَاجِبٌ مُتَّصِل', 'madd wajib MUTTASIL — ٱلۡحَاۤقَّةُ (virtual hamza alef)'],
  [ALHAQQAH, '', (r) => !r.rules.some((x) => x.label === 'قَلْقَلَة'), 'NO qalqala for mid-word shadda — ٱلۡحَاۤقَّةُ'],
  [ALHAQQAH, '', (r) => r.rules.some((x) => x.label === 'لاَم قَمَريّة'), 'lam qamariyya — ٱلۡحَاۤقَّةُ'],
  [WAMA, ADRAR, (r) => r.maddType === 'مَدٌّ وَاجِبٌ مُنْفَصِل', 'madd wajib MUNFASIL — وَمَاۤ أَدۡرَىٰكَ'],
  [MA, ALHAQQAH, (r) => r.maddType === 'مَدٌّ طَبِيعِي', 'madd tabii — مَا (particle)'],
  [DUAA, ILLA, (r) => r.maddType === 'مَدٌّ وَاجِبٌ مُتَّصِل' && r.rules.some((x) => x.label === 'مَدٌّ وَاجِبٌ مُنْفَصِل'), 'دُعَاۤءِیۤ + إِلَّا — BOTH wajib muttasil AND munfasil'],
  ['و\u064E\u0645\u064E\u0627\u06E4', 'ذَ\u0650\u0644\u0650\u0643', (r) => r.maddType === 'مَدٌّ وَاجِبٌ مُتَّصِل', 'وَمَاۤ + non-hamza word → muttasil (in-word hamza)'],
  ['\u0671\u0644\u0631\u0651\u064E\u062D\u06E1\u0645\u06E1\u0640\u0670\u0646\u0650', '', (r) => r.maddType === 'مَدٌّ طَبِيعِي', 'madd tabii via karakhan — ٱلرَّحۡمَـٰنِ'],
  ['لِي', '', (r) => r.maddType === 'مَدٌّ طَبِيعِي', 'final kasra-yā = madd tabii (لِي)'],
  ['قَ\u0623لَ', '', (r) => r.maddType === 'مَدٌّ وَاجِبٌ مُتَّصِل', 'madd wajib muttasil (قَالَ)'],
  ['سَأَلَ', '', (r) => r.maddType === 'مَدٌّ وَاجِبٌ مُتَّصِل', 'madd wajib muttasil (سَأَلَ)'],
  ['مَالِكًا', '', (r) => r.maddType === 'مَدٌّ طَبِيعِي', 'madd tabii (مَالِكًا)'],
  [BISM, '', (r) => !r.rules.some((x) => x.label === 'قَلْقَلَة'), 'no qalqala for mid-word sukun (بِسۡمِ)'],
  ['مِن', 'خَوْفٍ', (r) => r.rules.some((x) => x.label === 'إظهار حلقي'), 'izhar (مِنْ خَوْفٍ)'],
  ['مِن', 'فَرَحٍ', (r) => r.ghunnaType === 'غُنّة إخفاء', 'ikhfa (مِنْ فَرَحٍ)'],
  ['مِن', 'مَغْفِرَةٍ', (r) => r.rules.some((x) => x.label === 'إدغام بغُنّة'), 'idgham bughunna (مِنْ مَغْفِرَةٍ)'],
  ['مِن', 'يَنْصُر', (r) => r.rules.some((x) => x.label === 'إدغام بلا غُنّة'), 'idgham bilaghunna (مِنْ يَنْصُر)'],
  ['عَلَيْهِم', 'بِعَذَابٍ', (r) => r.rules.some((x) => x.label === 'إدغام شفويّ'), 'idgham shafawi (عَلَيْهِمْ بِـ)'],
  ['جِدًّا', '', (r) => r.rules.some((x) => x.label === 'قَلْقَلَة'), 'qalqala (جِدَّ)'],
  ['الشَّهْر', '', (r) => r.rules.some((x) => x.label === 'لاَم شمسيّة'), 'lam shamsiyya (الشهر)'],
  ['الْعَصْرِ', '', (r) => r.rules.some((x) => x.label === 'لاَم قَمَريّة'), 'lam qamariyya (العصر)'],
  ['عَلَىٰ', 'أَنْ', (r) => r.maddType === 'مَدٌّ وَاجِبٌ مُنْفَصِل', 'madd wajib munfasil (عَلَىٰ أَنْ)'],
];

let fail = 0;
for (const [w, nx, check, label] of cases) {
  const r = analyzeWord(w, nx);
  const ok = check(r);
  if (!ok) fail++;
  console.log(
    `${ok ? '✔' : '✘'} ${label}  →  madd:${r.maddType ?? '-'} ghunna:${r.ghunnaType ?? '-'} rules:[${r.rules
      .map((x) => x.label)
      .join(', ') || '-'}] exp:${r.expectedMs}ms`,
  );
}

console.log('\n— نوح 71:7 فلم يزدهم دعائي إلا فرارا (real Uthmani text) —');
const noo = analyzeWords(NOO7);
for (const r of noo) {
  console.log(`${r.word}: ${r.maddType ?? r.ghunnaType ?? '-'} [${r.rules.map((x) => x.label).join('، ') || '—'}] ${r.expectedMs}ms`);
}
const nChecks: [boolean, string][] = [
  [noo[0].rules.some((x) => x.label === 'إدغام شفويّ'), 'فَلَمۤ → idgham shafawi into يَزِدۡهُمۤ'],
  [noo[1].maddType === null, 'یَزِدۡهُمۤ → no madd (final mīm at rest)'],
  [noo[2].maddType === 'مَدٌّ وَاجِبٌ مُتَّصِل' && noo[2].rules.some((x) => x.label === 'مَدٌّ وَاجِبٌ مُنْفَصِل'), 'دُعَاۤءِیۤ → both muttasil (alef-hamza) and munfasil (final ـِي + إِلَّا)'],
  [noo[3].maddType === 'مَدٌّ طَبِيعِي', 'إِلَّا → madd tabii (final shadda-alef)'],
  [noo.every((r) => !r.rules.some((x) => x.label === 'قَلْقَلَة')), 'no qalqala anywhere in 71:7 (no word ends at rest on a qalqala letter)'],
];
for (const [ok, label] of nChecks) {
  if (!ok) fail++;
  console.log(`${ok ? '✔' : '✘'} ${label}`);
}

console.log(`\n${fail === 0 ? 'ALL PASS' : `${fail} FAILURES`}`);
process.exit(fail ? 1 : 0);
