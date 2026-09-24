// TAHQĪQ — معايرة سرعات القرّاء المعتمدين إلى نموذج الأزمنة في هذا المحرّك
//
// يقرأ أزمنةَ الكلمات لتلاوات القرّاء (بصيغة audio_files/verse_timings/segments التي
// يُخرجها Quran.com — segments: [رقم الكلمة، بدايتها، نهايتها] بالملي ثانية)، ثم يقيس
// كل كلمةٍ إلى زمنها في نموذج الترتيل (analyzeTargetWords) فيُخرج لكل قارئ:
//   • pace       — الوسيط المرجَّح لنسبة (المقيس ÷ النموذج) على الكلمات الصالحة مسطرةً
//                  (بلا مدٍّ لازم ولا فواتح ولا وقف) — وهو ما يُحفظ في reciter.ts.
//   • lazimRatio — نسبة كلمات المدّ اللازم إلى سرعته نفسها (كم يمطّ اللازم فوق ستّ حركات).
//
// الاستعمال (البيانات لا تُحفظ في المستودع):
//   git clone --depth 1 https://github.com/spa5k/quran_timings_api /tmp/qta
//   npx tsx scripts/calibrate-reciters.ts /tmp/qta/data
//
// يُعرف القارئ من رابط الصوت (audio_url) لا من اسم المجلد — ففي بعض النسخ تتبادل
// المجلدات أسماءها.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { analyzeTargetWords, normalizeArabic } from '../src/lib/tajweed';
import { weightedMedian } from '../src/lib/tempo';

const root = process.argv[2];
if (!root) {
  console.error('usage: npx tsx scripts/calibrate-reciters.ts <dir-with-timing-json>');
  process.exit(1);
}

const quran = JSON.parse(readFileSync(new URL('../public/quran.json', import.meta.url), 'utf8'));
const BASMALA = 'بسم الله الرحمن الرحيم';
function ayahWords(s: number, a: number): string[] {
  const ay = quran.surahs.find((x: any) => x.id === s)?.ayahs.find((x: any) => x.n === a);
  if (!ay) return [];
  let ws: string[] = ay.text.replace(/[\u200A\u2060\u200C\uFEFF]/g, '').split(/\s+/).filter(Boolean);
  if (a === 1 && s !== 1 && s !== 9 && ws.length >= 4 && ws.slice(0, 4).map(normalizeArabic).join(' ') === BASMALA) ws = ws.slice(4);
  return ws;
}

function* jsonFiles(dir: string): Generator<string> {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) yield* jsonFiles(p);
    else if (f.endsWith('.json')) yield p;
  }
}

/** علامات الوقف داخل الآية: الكلمة قبلها/بعدها قد يدخل فيها نَفَسٌ أو سكتة */
const WAQF_MARKS = /[\u06D6-\u06DC\u06DE]/;

interface Acc {
  x: number[];
  w: number[];
  lazim: number[];
  files: number;
}
const byReciter = new Map<string, Acc>();

for (const file of jsonFiles(root)) {
  let d: any;
  try {
    d = JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    continue;
  }
  const af = d?.audio_files?.[0];
  if (!af?.verse_timings) continue;
  const reciter = String(af.audio_url ?? '')
    .split('/')
    .slice(-3, -1)
    .join('/');
  const acc = byReciter.get(reciter) ?? { x: [], w: [], lazim: [], files: 0 };
  acc.files++;
  for (const v of af.verse_timings) {
    const [s, a] = String(v.verse_key).split(':').map(Number);
    const words = ayahWords(s, a);
    const segs: [number, number, number][] = (v.segments ?? []).filter((x: any) => Array.isArray(x) && x.length >= 3);
    if (!words.length || !segs.length || Math.max(...segs.map((x) => x[0])) !== words.length) continue;
    const count = new Map<number, number>();
    for (const sg of segs) count.set(sg[0], (count.get(sg[0]) ?? 0) + 1);
    const tjs = analyzeTargetWords(
      words.map((w) => ({ word: w, ayah: a })),
      'hafs',
      'tartil',
    );
    // الكلمة الأولى تحمل صمتَ ما قبل الآية في هذه البيانات، فتُترك
    for (let i = 1; i < words.length; i++) {
      if (count.get(i + 1) !== 1 || WAQF_MARKS.test(words[i]) || WAQF_MARKS.test(words[i - 1])) continue;
      const sg = segs.find((x) => x[0] === i + 1)!;
      const dur = sg[2] - sg[1];
      if (dur < 80 || dur > 12000) continue;
      const t = tjs[i];
      const ratio = dur / t.expectedMs;
      if ((t.stretchMs ?? 0) > 0 && !t.atWaqf) acc.lazim.push(ratio);
      const w = t.rulerWeight ?? 1;
      if (w >= 0.5) {
        acc.x.push(Math.log(ratio));
        acc.w.push(w);
      }
    }
  }
  byReciter.set(reciter, acc);
}

console.log('القارئ (من رابط الصوت)'.padEnd(40), 'كلمات', ' pace', ' lazimRatio');
for (const [name, acc] of [...byReciter.entries()].sort()) {
  if (acc.x.length < 200) continue;
  const pace = Math.exp(weightedMedian(acc.x, acc.w));
  const lz = acc.lazim.length ? [...acc.lazim].sort((p, q) => p - q)[Math.floor(acc.lazim.length / 2)] / pace : NaN;
  console.log(name.padEnd(40), String(acc.x.length).padStart(6), pace.toFixed(2).padStart(5), (Number.isFinite(lz) ? lz.toFixed(2) : '—').padStart(8));
}
