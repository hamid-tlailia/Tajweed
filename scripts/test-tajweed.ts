import { analyzeWord, analyzeWords } from '../src/lib/tajweed.ts';

const cases: [string, string, (r: any) => boolean, string][] = [
  // word, nextWord, check, label
  ['عَلَىٰ', 'أَنْ', (r) => r.maddType === 'مَدٌّ وَاجِبٌ مُنْفَصِل', 'madd wajib munfasil (عَلَىٰ أَنْ)'],
  ['دُعَائِي', 'إِلَّا', (r) => r.maddType === 'مَدٌّ طَبِيعِي', 'madd tabii only (دُعَائِي — final ya is short)'],
  ['قَ\u0623لَ', '', (r) => r.maddType === 'مَدٌّ وَاجِبٌ مُتَّصِل', 'madd wajib muttasil (قَالَ)'],
  ['سَأَلَ', '', (r) => r.maddType === 'مَدٌّ وَاجِبٌ مُتَّصِل', 'madd wajib muttasil (سَأَلَ)'],
  ['مَالِكًا', '', (r) => r.maddType === 'مَدٌّ طَبِيعِي', 'madd tabii (مَالِكًا)'],
  ['مِن', 'خَوْفٍ', (r) => r.rules.some((x) => x.label === 'إظهار حلقي'), 'izhar (مِنْ خَوْفٍ)'],
  ['مِن', 'فَرَحٍ', (r) => r.ghunnaType === 'غُنّة إخفاء', 'ikhfa (مِنْ فَرَحٍ)'],
  ['مِن', 'مَغْفِرَةٍ', (r) => r.rules.some((x) => x.label === 'إدغام بغُنّة'), 'idgham bughunna (مِنْ مَغْفِرَةٍ)'],
  ['مَٰلِكُ', 'يَوْمِ', (r) => r.rules.length > 0, 'rules detected (مَالِكُ)'],
  ['عَلَيْهِم', 'بِعَذَابٍ', (r) => r.rules.some((x) => x.label === 'إدغام شفويّ'), 'idgham shafawi (عَلَيْهِمْ بـ)'],
  ['جِدًّا', '', (r) => r.rules.some((x) => x.label === 'قَلْقَلَة'), 'qalqala (جِدَّ)'],
  ['زِذْهُمْ', 'دُعَائِي', (r) => r.rules.length === 0, 'no qalqala for dhal (زِدْهُمْ)'],
  ['الشَّهْر', '', (r) => r.rules.some((x) => x.label === 'لاَم شمسيّة'), 'lam shamsiyya (الشهر)'],
  ['الْعَصْرِ', '', (r) => r.rules.some((x) => x.label === 'لاَم قَمَريّة'), 'lam qamariyya (العصر)'],
  ['عَن', 'نَصْرٍ', (r) => r.rules.some((x) => x.label === 'إدغام بغُنّة'), 'idgham bughunna (عَنْ نَصْرٍ)'],
  ['عَن', 'قَدَرٍ', (r) => r.ghunnaType === 'غُنّة إخفاء', 'ikhfa (عَنْ قَدَرٍ)'],
  ['عَن', 'حَبْلٍ', (r) => r.rules.some((x) => x.label === 'إظهار حلقي'), 'izhar (عَنْ حَبْلٍ)'],
];

let fail = 0;
for (const [w, nx, check, label] of cases) {
  const r = analyzeWord(w, nx);
  const ok = check(r);
  if (!ok) fail++;
  console.log(`${ok ? '✔' : '✘'} ${label}  →  madd:${r.maddType ?? '-'} ghunna:${r.ghunnaType ?? '-'} rules:[${r.rules.map((x: any) => x.label).join(', ') || '-'}] expected:${r.expectedMs}ms`);
}

// full verse (Hud 64 region) context check
const verse = analyzeWords(['فَلَمَّا', 'زِذْهُمْ', 'دُعَائِي', 'إِلَّا', 'فَرَارًا']);
console.log('\n— verse words —');
for (const w of verse) console.log(`${w.word}: ${w.maddType ?? w.ghunnaType ?? '-'} [${w.rules.map((x) => x.label).join(', ') || '—'}] ${w.expectedMs}ms`);

console.log(fail ? `\n${fail} FAILURES` : '\nALL PASS');
