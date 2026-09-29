// TAHQĪQ — مطابقة الرسم العثماني بما يسمعه محرّك التعرّف
//
// منقولٌ من مستودع المؤلف نفسه «Contemplating» (js/app.js) بتصرّفٍ يسير:
// تحويلٌ إلى TypeScript، وتسميةُ `normalizeArabic` هناك `normalizeRasm` هنا
// لئلا تلتبس بدالّة محرّك الأحكام (tajweed.ts) وهي غيرها.
//
// وسببُ النقل: مطابقةُ هذا التطبيق كانت تردّ تلاوةً صحيحة — ﴿الٓمٓ﴾ تُحكم
// «كلامًا عاديًّا ليس من القرآن»، و﴿ذَٰلِكَ ٱلۡكِتَٰبُ﴾ يُسمع «دانك الكتاب لا رايب
// فيه دلن المتقين» فلا يُطابَق إلا شطرُه. وهذه المطابقةُ مقيسةٌ على المصحف
// كلّه: «١٫٥٦٪ من الكلمات كانت تفشل قبلها، و٠٫٠٨٪ بعد أول مرحلة، ولا شيء الآن».
//
// وهي تعالج ما لا يعالجه محرّكُنا:
//   • الفواتح تُهجَّى («الف لام ميم»)، أو تُمدّ فتُكتب «الاااام»، أو يُقطع اسمُ
//     الحرف نصفين («لا ام»)، أو تُوصل الأسماء («حاميم»).
//   • المدّ يجعل المحرّكَ يكتب الكلمة مرتين: «الباس الباساء».
//   • الواو والفاء تنفصلان عمّا بعدهما.
//   • الاستعاذة والبسملة تُقالان قبل الآية ولا تُعدّان منها.
//   • واختلافُ الرسم العثماني عن الإملائي قاعدةً قاعدةً (الألف الخنجرية،
//     والشدّة، والهمزة بلا كرسي، والألف الصامتة بعد واو الجماعة…).
//
// ولم يُنقل منه ما يخصّ الكتابة (فهذا تطبيقُ تلاوةٍ لا إملاء).

export function mergeDetachedConjunctions(text: string): string {
  return (text || "").replace(/(^|\s)([\u0648\u0641])\s+(?=\S)/g, "$1$2");
}


// Nobody recites it as "alam", and asking for that to make it pass is asking
// for a mistake. So where the text has a fawatih group, the letters spelled
// out are accepted for it - matched against that word specifically, never
// collapsed on sight, because عَيْن and نُون and يَا are ordinary words
// elsewhere and must stay ordinary.
const ARABIC_LETTER_NAMES: Record<string, string> = {
  "الف": "\u0627", "أَلِف": "\u0627", "ألف": "\u0627",
  "با": "\u0628", "باء": "\u0628",
  "تا": "\u062A", "تاء": "\u062A",
  "حا": "\u062D", "حاء": "\u062D",
  "را": "\u0631", "راء": "\u0631",
  "سين": "\u0633",
  "صاد": "\u0635",
  "طا": "\u0637", "طاء": "\u0637",
  "عين": "\u0639",
  "قاف": "\u0642",
  "كاف": "\u0643",
  "لام": "\u0644",
  "ميم": "\u0645",
  "نون": "\u0646",
  "ها": "\u0647", "هاء": "\u0647",
  "يا": "\u064A", "ياء": "\u064A",
};
const MUQATTAAT_LETTERS = new Set("\u0627\u0644\u0645\u0635\u0631\u0643\u0647\u064A\u0639\u0637\u0633\u062D\u0642\u0646".split(""));

// The fawatih are not a pattern, they are a list - fourteen groups, and the
// Quran has no fifteenth. Reading them as "short, and made of those letters"
// swept in ordinary words: ٱلْحَقَّ is four letters and every one of them is in
// the set, so every word of ٱلْبَقَرَة 42 was being taken apart letter by letter
// looking for a group that was never there. Naming them costs nothing and is
// exact.
const MUQATTAAT_WORDS = new Set([
  "\u0627\u0644\u0645", "\u0627\u0644\u0631", "\u0627\u0644\u0645\u0635", "\u0627\u0644\u0645\u0631",
  "\u0643\u0647\u064A\u0639\u0635", "\u0637\u0647", "\u0637\u0633\u0645", "\u0637\u0633",
  "\u064A\u0633", "\u0635", "\u062D\u0645", "\u0639\u0633\u0642", "\u0642", "\u0646",
]);
export function isMuqattaatWord(word: string): boolean {
  return MUQATTAAT_WORDS.has(normalizeRasm(word || ""));
}

// ── الفواتح والمدّ ────────────────────────────────────────────────────────
//
// The fawatih are not read as words, they are spelled out - and spelled out
// with the longest مدّ in the Quran, six harakat on لآاااام and مييييم. The
// engine writes what it hears, so the name of one letter comes back stretched
// («لاااام»), or torn in two («لا ام»), or run into the next one («حاميم»),
// or with the stretch written inside the group itself («الاااام» for الٓمٓ).
// None of that was being recognized, and a reciter had to say الٓمٓ flat and
// wrong to be let past.
//
// A مدّ is a letter held, so the same letter written many times over is that
// letter once. None of the letters' names has a doubled letter in it, so the
// folding can only help here.
function collapseLetterRuns(s: string): string {
  return String(s || "").replace(/(.)\1+/gu, "$1");
}

// The one letter a spoken token names, however it came out.
function letterNameLetter(token: string): string {
  const w = normalizeRasm(token || "");
  if (!w) return "";
  return ARABIC_LETTER_NAMES[w]
    || ARABIC_LETTER_NAMES[collapseLetterRuns(w)]
    // Some engines give the letter itself rather than its name.
    || (w.length === 1 && MUQATTAAT_LETTERS.has(w) ? w : "");
}

/** أسماء الحروف موحَّدةً ومرتَّبةً من الأطول (يُقرأ بالجشع فيُقدَّم الأطول) */
const LETTER_NAME_KEYS: string[] = Object.keys(ARABIC_LETTER_NAMES)
  .map((k) => normalizeRasm(k))
  .sort((a, b) => b.length - a.length);

// One token that is several names run together: «حاميم» is حا + ميم, «ياسين»
// is يا + سين, «طاها» is طا + ها. Read greedily, longest name first, and only
// accepted if the whole token is consumed by names.
function spellOutToken(token: string): string {
  // يُجرَّب المطويّ أولًا (المدّ يكرّر الحرف)، ثم غيرُ المطويّ: أسماءُ الحروف
  // إذا وُصلت أحدثت حرفًا مضاعفًا عند مفصلها («لام»+«ميم» ← «لامميم») فيطويه
  // الطيُّ فيُفسدها. (زيادةٌ على الأصل المنقول.)
  for (const form of [collapseLetterRuns(normalizeRasm(token || "")), normalizeRasm(token || "")]) {
    const got = spellOutForm(form);
    if (got) return got;
  }
  return "";
}

function spellOutForm(w: string): string {
  if (w.length < 3) return "";
  const names = LETTER_NAME_KEYS;
  const walk = (at: number): string | null => {
    if (at === w.length) return "";
    for (const name of names) {
      if (!name || !w.startsWith(name, at)) continue;
      const rest = walk(at + name.length);
      if (rest != null) return ARABIC_LETTER_NAMES[name] + rest;
    }
    return null;
  };
  const out = walk(0);
  // One name alone is not "run together" - that is the ordinary lookup, and
  // letting it through here would make «لام» spell itself.
  return out && out.length > 1 ? out : "";
}

// "الف لام ميم" -> "الم". Null unless every token is accounted for.
function joinLetterNames(tokens: string[]): string | null {
  let out = "";
  for (let i = 0; i < tokens.length; ) {
    const one = letterNameLetter(tokens[i]);
    if (one) { out += one; i += 1; continue; }
    const many = spellOutToken(tokens[i]);
    if (many) { out += many; i += 1; continue; }
    // A مدّ long enough can put a break in the middle of one letter's name -
    // «لاااام» comes back as «لا ام», «مييييم» as «مي يم» - so the two are
    // tried as the one name they were.
    if (i + 1 < tokens.length) {
      const pair = letterNameLetter(tokens[i] + tokens[i + 1])
        || spellOutToken(tokens[i] + tokens[i + 1]);
      if (pair) { out += pair; i += 2; continue; }
    }
    return null;
  }
  return out;
}

// The group said as one word with the مدّ written into it: «الاااام» for الٓمٓ,
// «حام» for حمٓ. Every letter of the group must be there and in its order, and
// nothing may be between them but the letters a مدّ is written with.
const MADD_LETTERS = new Set(["\u0627", "\u0648", "\u064A"]);
/**
 * الحروفُ وحدها، **بتكرارها كما نُطق**: توحيدٌ للحرف بلا طيّ التكرار.
 * (`normalizeRasm` يطوي «ااا» إلى «ا»، فيمحو علامةَ المدّ التي نحتاجها هنا.)
 */
function baseLetters(s: string): string {
  return (s || "")
    .replace(/[\u200A\u200C\u2060\uFEFF\u0640]/g, "")
    .replace(/\u06CC/g, "\u064A")
    .replace(/\u06A9/g, "\u0643")
    .replace(/\p{Mn}/gu, "")
    .replace(/[\u0621\u0624\u0626]/g, "")
    .replace(/[\u0625\u0623\u0622\u0671\u0627]/g, "\u0627")
    .replace(/\u0649/g, "\u064A")
    .replace(/\u0629/g, "\u0647")
    .replace(/[^\u0621-\u064A]/g, "");
}

function muqattaatSpokenMatch(said: string, expected: string): boolean {
  const src = baseLetters(said || "");
  const b = normalizeRasm(expected || "");
  if (!src || !b || src[0] !== b[0]) return false;
  // زيادةٌ على الأصل المنقول: لا يُتجاوَز حرفُ مدٍّ إلا إن كان **ممدودًا فعلًا**،
  // أي جاء مكرَّرًا في المسموع. كان يُتجاوَز كلُّ ا/و/ي فتُقبل «اليوم» فاتحةً
  // ﴿الٓمٓ﴾ (ا ل [ي و متجاوَزان] م) — وهي كلمةٌ عاديّة. والمدُّ في «الاااام»
  // تكرارٌ بيّن، فالتكرارُ هو علامتُه.
  const runs: { ch: string; len: number }[] = [];
  for (const ch of src) {
    const last = runs[runs.length - 1];
    if (last && last.ch === ch) last.len++;
    else runs.push({ ch, len: 1 });
  }
  if (runs.length < b.length) return false;
  let j = 0;
  for (const r of runs) {
    if (j < b.length && r.ch === b[j]) { j++; continue; }
    if (MADD_LETTERS.has(r.ch) && r.len > 1) continue; // حرفٌ مُسك: مدٌّ لا حرف
    return false;
  }
  return j === b.length;
}

// How many spoken tokens starting at i spell the expected word, or 0.
function spelledLettersMatch(words: string[], i: number, expected: string): number {
  if (!isMuqattaatWord(expected)) return 0;
  if (muqattaatSpokenMatch(words[i], expected)) return 1;
  // Five letters is the longest group, and a مدّ can break each of them in
  // two - so twice five is as far as a group can be spread.
  const maxRun = Math.min(10, words.length - i);
  for (let n = maxRun; n >= 1; n--) {
    const joined = joinLetterNames(words.slice(i, i + n));
    if (joined && answerMatchesQuranWord(expected, joined, HEARD)) return n;
  }
  return 0;
}

// The same acceptance, for the paths that compare two finished texts rather
// than follow a pointer: a run of letter names is folded into the one word
// it spells, but only where the ayah actually has that word.
export function collapseSpelledLetters(text: string, correctWords: string[]): string {
  const targets = (correctWords || []).filter(isMuqattaatWord);
  if (!targets.length) return text;
  const words = String(text || "").split(/\s+/).filter(Boolean);
  const out: string[] = [];
  for (let i = 0; i < words.length; ) {
    let used = 0;
    for (const target of targets) {
      // One token is enough now: a group said as one word with the مدّ inside
      // it («الاااام») is a spelling of it just as «الف لام ميم» is.
      used = spelledLettersMatch(words, i, target);
      if (used) { out.push(target); break; }
    }
    if (!used) { out.push(words[i]); used = 1; }
    i += used;
  }
  return out.join(" ");
}

export function mergeMaddSplits(text: string): string {
  const words = String(text || "").split(/\s+/).filter(Boolean);
  const out: string[] = [];
  const swallows = (shortW: string, longW: string) => {
    const a = normalizeRasm(shortW), b = normalizeRasm(longW);
    return a.length >= 3 && b.length > a.length && b.length - a.length <= 3
      && a.length / b.length >= 0.6 && b.startsWith(a);
  };
  for (const w of words) {
    const prev = out[out.length - 1];
    if (prev && swallows(prev, w)) { out[out.length - 1] = w; continue; }
    if (prev && swallows(w, prev)) continue;
    out.push(w);
  }
  return out.join(" ");
}

// Comparing a typed answer with the Quran's text is comparing two different
// orthographies. The Uthmani rasm and the spelling people actually type
// disagree systematically - not by exceptions that could be listed in a
// dictionary, but by rules:
//
//   ٱلصَّلَوٰةَ / الصلاة      a long ā carried by و or ى plus a dagger alef
//   ٱلسَّمَٰوَٰتِ / السماوات    a dagger alef standing in for a written alef
//   إِبْرَٰهِۦمَ / إبراهيم      a superscript small yeh/waw standing for a full letter
//   شَيْـًۭٔا / شيئًا          a bare hamza on a tatweel instead of on a seat
//   ٱلَّيْلِ / الليل           a shadda where the modern spelling doubles the letter
//   أُو۟لُوا۟ / أولو           the silent alef after a final و
//
// So this normalizes both sides by those rules rather than matching literally.
// Where a rule is genuinely ambiguous - a dagger alef after و/ى can mean
// either "this letter IS the alef" (الصلوة) or "put an alef after it"
// (السمٰوٰت) - both readings are produced and either may match. Measured
// against the API's own modern-spelling edition, word for word across every
// ayah in the Quran: 1.56% of words failed to match before any of this, 0.08%
// after the first pass, and none now.

const ARABIC_SUPERSCRIPT_LETTERS: Record<string, string> = { "\u06E5": "\u0648", "\u06E6": "\u064A", "\u06E7": "\u064A", "\u06E8": "\u0646" };

export function normalizeRasm(s: string): string {
  return (s || "")
    // ── تكييفٌ لنسخة المصحف التي يشحنها هذا التطبيق (ليس من الأصل المنقول) ──
    // نصُّها يفصل داخل الكلمة الواحدة بمسافةٍ شعرية وموصِل كلمة («ذَ ٰلِكَ»)،
    // ويكتب الياء بالياء الفارسية ی (U+06CC) والكاف أحيانًا بـک (U+06A9).
    // وهذه خارج نطاق \u0621-\u064A فتُحذف في القاعدة أدناه، فتصير «فِیهِ» = «فه».
    .replace(/[\u200A\u200C\u2060\uFEFF]/g, "")
    .replace(/\u06CC/g, "\u064A")
    .replace(/\u06A9/g, "\u0643")
    .replace(/\p{Mn}/gu, "")
    .replace(/\u0640/g, "") // tatweel: a stretch of the pen, never a letter
    .replace(/[\u0621\u0624\u0626]/g, "")
    .replace(/[\u0625\u0623\u0622\u0671\u0627]/g, "\u0627")
    // The Uthmani rasm often writes a hamza with no seat at all where the
    // modern spelling gives it one (ء ؤ ئ) - and almost nobody types the
    // seat the same way twice. Dropped on both sides like a diacritic.
    .replace(/\u0649/g, "\u064A")
    .replace(/\u0629/g, "\u0647")
    // Everything that is not a letter goes here, BEFORE the rules below that
    // look for the end of a word: a superscript letter left dangling past the
    // final \u0647 (\u0639\u064e\u062f\u064f\u0648\u0651\u0650\u0647\u0650\u06e6) hid that end from them.
    .replace(/[^\u0621-\u064A\s]/g, "")
    // Classical rasm spells the long vowel before a final \u0629 with \u0648 in a
    // handful of very common words (\u0627\u0644\u0635\u0644\u0648\u0629, \u0627\u0644\u0632\u0643\u0648\u0629, \u0627\u0644\u062d\u064a\u0648\u0629...). A typed or
    // spoken answer will use the modern spelling with \u0627, so fold that \u0648 back
    // to \u0627 once it's already sitting right before the (already-folded) \u0647.
    .replace(/\u0648(?=\u0647(?:\s|$))/g, "\u0627")
    // The silent alef after a plural-verb waw, written in the rasm and
    // dropped in modern spelling (أُو۟لُوا۟ / أولو، يَتْلُوا۟ / يتلو).
    .replace(/\u0648\u0627(?=\s|$)/g, "\u0648")
    // The rasm writes one yeh where the modern spelling writes the two it
    // hears (\u064a\u064f\u062d\u0652\u0649\u0650 / \u064a\u064f\u062d\u0652\u064a\u0650\u064a, \u0644\u064e\u0645\u064f\u062d\u0652\u0649\u0650 / \u0644\u064e\u0645\u064f\u062d\u0652\u064a\u0650\u064a).
    .replace(/\u064A\u064A(?=\s|$)/g, "\u064A")
    // Writing a shadda out can leave three of a letter where the modern
    // spelling already had two; two is the most Arabic ever writes. And a
    // doubled alef is never written at all - it only appears here when a
    // rasm alef meets one this produced (ٱلرِّبَوٰا۟ / الربا).
    .replace(/(.)\1{2,}/g, "$1$1")
    .replace(/\u0627\u0627/g, "\u0627")
    .replace(/\s+/g, " ")
    .trim();
}

// What is left once the rules above have done their work. Checked word for
// word against the modern-spelling edition of all 6,236 ayahs: these are the
// only places in the Quran where the two orthographies differ by something no
// rule explains, so they are listed rather than guessed at. Keys are the
// rasm's normalized form; a \u0648/\u0641/\u0644/\u0628/\u0643 in front of a whole-word key is allowed for.
const RASM_SPELLING_SWAPS: [string, string][] = [
  ["\u0628\u0635\u0637", "\u0628\u0633\u0637"],      // \u0628\u064e\u0635\u0652\u0637\u064e\u0629\u064b / \u0628\u0633\u0637\u0629\u060c \u0648\u064e\u064a\u064e\u0628\u0652\u0635\u064f\u0637\u064f / \u0648\u064a\u0628\u0633\u0637
  ["\u0635\u064A\u0637\u0631", "\u0633\u064A\u0637\u0631"], // \u0627\u0644\u0645\u064f\u0635\u064e\u064a\u0652\u0637\u0650\u0631\u064f\u0648\u0646\u064e / \u0627\u0644\u0645\u0633\u064a\u0637\u0631\u0648\u0646\u060c \u0628\u0650\u0645\u064f\u0635\u064e\u064a\u0652\u0637\u0650\u0631\u064d / \u0628\u0645\u0633\u064a\u0637\u0631
];
const RASM_WORD_SWAPS = new Map<string, string>([
  // A final alef the modern spelling writes as an alef maqsura. Nothing in
  // the rasm says which word takes which, and folding every final alef into
  // \u0649 would make \u0623\u0646\u0632\u0644\u0646\u0627 the same word as \u0623\u0646\u0632\u0644\u0646\u064a - so, by word.
  ["\u0631\u0627", "\u0631\u064A"],           // \u0631\u064e\u0621\u064e\u0627 / \u0631\u0623\u0649
  ["\u062A\u0631\u0627", "\u062A\u0631\u0627\u064A"],      // \u062a\u064e\u0631\u064e\u0670\u0653\u0621\u064e\u0627 / \u062a\u0631\u0627\u0621\u0649
  ["\u0627\u0642\u0635\u0627", "\u0627\u0642\u0635\u064A"],   // \u0623\u064e\u0642\u0652\u0635\u064e\u0627 / \u0623\u0642\u0635\u0649
  ["\u0627\u0644\u0627\u0642\u0635\u0627", "\u0627\u0644\u0627\u0642\u0635\u064A"], // \u0627\u0644\u0623\u064e\u0642\u0652\u0635\u064e\u0627 / \u0627\u0644\u0623\u0642\u0635\u0649
  ["\u0644\u062F\u0627", "\u0644\u062F\u064A"],         // \u0644\u064e\u062f\u064e\u0627 / \u0644\u062f\u0649
  ["\u0637\u063A\u0627", "\u0637\u063A\u064A"],         // \u0637\u064e\u063a\u064e\u0627 / \u0637\u063a\u0649
  ["\u062A\u062A\u0631\u0627", "\u062A\u062A\u0631\u064A"],     // \u062a\u064e\u062a\u0652\u0631\u064e\u0627 / \u062a\u062a\u0631\u0649
  ["\u0646\u0627", "\u0646\u0627\u064A"],           // \u0648\u064e\u0646\u064e\u0640\u064e\u0654\u0627 / \u0648\u0646\u0623\u0649
  // And four one-off spellings.
  ["\u0644\u064A\u0643\u0647", "\u0627\u0644\u064A\u0643\u0647"],   // \u0644\u0652\u0640\u064e\u0654\u064a\u0643\u064e\u0629\u0650 / \u0627\u0644\u0623\u064a\u0643\u0629 - written both ways in the Quran itself
  ["\u0644\u062A\u062E\u0630\u062A", "\u0644\u0627\u062A\u062E\u0630\u062A"], // \u0644\u064e\u062a\u064e\u0651\u062e\u064e\u0630\u0652\u062a\u064e / \u0644\u0627\u062a\u062e\u0630\u062a
  ["\u064A\u0628\u0646\u0645", "\u064A\u0627\u0628\u0646\u0645"],   // \u064a\u064e\u0628\u0652\u0646\u064e\u0624\u064f\u0645\u064e\u0651 / \u064a\u0627 \u0627\u0628\u0646 \u0623\u0645\u0651
  ["\u0648\u0644\u0644\u0648", "\u0648\u0646\u0644\u0648"],     // \u0648\u064e\u0623\u064e\u0644\u064e\u0651\u0648\u0650 / \u0648\u0623\u0646 \u0644\u0648
]);

// Every reading of a word that the two orthographies could plausibly agree
// on. Small set, cached: this runs inside the recitation diff's DP, which
// calls it O(n*m) times per ayah.
const arabicVariantCache = new Map<string, string[]>();
// Words written وا۟ whose واو is the third letter of the root, not the plural
// pronoun. Read out of the Uthmani text, every occurrence of every one of
// them checked in its ayah: يَتْلُوا۟ عَلَيْهِمْ ءَايَٰتِهِۦ, فَمَن كَانَ يَرْجُوا۟ لِقَآءَ
// رَبِّهِۦ, إِنَّمَآ أَشْكُوا۟ بَثِّى - all of them one man doing something, none of
// them a plural.
// Held in the form normalizeArabic leaves them in - the silent alef is
// already folded away by then, so يَدْعُوا۟ and يَدْعُو are one key, as they are
// one word. تَدْعُوا۟ is not here: it is both - «أَيًّۭا مَّا تَدْعُوا۟» is one man
// calling, «لَّا تَدْعُوا۟ ٱلْيَوْمَ ثُبُورًۭا» is many being told not to - and where
// the word itself cannot say which, leniency is the safer error.
const RADICAL_WAW_WORDS = new Set([
  "\u064A\u062F\u0639\u0648", "\u0646\u062F\u0639\u0648",
  "\u064A\u062A\u0644\u0648", "\u062A\u062A\u0644\u0648", "\u0646\u062A\u0644\u0648", "\u0627\u062A\u0644\u0648",
  "\u064A\u0631\u062C\u0648", "\u062A\u0631\u062C\u0648",
  "\u064A\u0645\u062D\u0648", "\u064A\u0631\u0628\u0648",
  "\u064A\u0639\u0641\u0648", "\u062A\u0628\u0644\u0648", "\u0627\u0634\u0643\u0648",
]);

function arabicWordVariants(word: string, spokenElision = false): string[] {
  const key = (spokenElision ? "s\u0000" : "w\u0000") + word;
  const cached = arabicVariantCache.get(key);
  if (cached) return cached;
  const merged = mergeDetachedConjunctions(word);
  // Each axis below is a place where the two orthographies can be read two
  // ways. Every combination is produced; a match on any one of them is a
  // match.
  const axes: ((w: string) => string[])[] = [
    // A superscript small waw/yeh is a letter in some words (إِبْرَٰهِۦمَ /
    // إبراهيم، دَاوُۥدَ / داوود) and silent in others (بِهِۦ / به).
    (w) => [w, w.replace(/[\u06E5-\u06E8]/g, (c) => ARABIC_SUPERSCRIPT_LETTERS[c])],
    // A dagger alef either stands in for a written alef (ٱلسَّمَٰوَٰتِ /
    // السماوات), or - when it sits on a و/ى - means that letter IS the alef
    // (ٱلصَّلَوٰةَ / الصلاة), or is simply not written at all (ٱلرَّحْمَٰنِ /
    // الرحمن). A word can carry more than one, and they need not be read the
    // same way: يَٰمُوسَىٰ is يا موسى - the first written out, the second not -
    // so each one is decided on its own rather than all of them together.
    (w) => {
      let forms: string[] = [w];
      for (let pass = 0; pass < 4 && forms.some((f) => f.includes("\u0670")); pass++) {
        forms = forms.flatMap((f) => {
          const at = f.indexOf("\u0670");
          if (at < 0) return [f];
          const before = f.slice(0, at);
          const after = f.slice(at + 1);
          const carrier = f[at - 1];
          const readings = [before + after, before + "\u0627" + after];
          if (carrier === "\u0648" || carrier === "\u0649") readings.push(before.slice(0, -1) + "\u0627" + after);
          return readings;
        });
      }
      return forms;
    },
    // A shadda IS a doubled letter, and the two spellings disagree about
    // writing it out: the rasm has ٱلَّيْلِ where the modern has اللَّيْلِ.
    // Never for a word's first letter, where the shadda belongs to an
    // assimilated word before it (مِن رَّبِّهِمْ) the modern text lacks.
    (w) => [w, w.replace(/(\S)([\u0621-\u064A])([\u064B-\u0650\u0652-\u065F\u0670]*)\u0651/g, "$1$2$3$2")],
    // \u0633\u0623\u0644 after a one-letter prefix is the one place the rasm drops the alef
    // of a connecting hamza the modern spelling writes: \u0641\u064e\u0633\u0652\u0640\u064e\u0654\u0644\u0652 / \u0641\u0627\u0633\u0623\u0644\u060c
    // \u0648\u064e\u0633\u0652\u0640\u064e\u0654\u0644\u0652\u0647\u064f\u0645\u0652 / \u0648\u0627\u0633\u0623\u0644\u0647\u0645. Narrow on purpose: dropping that alef wherever
    // it appears would make \u0648\u0627\u0639\u0645\u0644\u0648\u0627 the same word as \u0648\u0639\u0645\u0644\u0648\u0627, and \u0643\u0627\u0641\u0631 as \u0643\u0641\u0631.
    (w) => [w, w.replace(/^([\u0648\u0641\u0644\u0628\u0643])([\u064B-\u0652\u0670]*)\u0627(?=\u0633[\u064B-\u0652\u0670]*[\u0621\u0623\u0624\u0626\u0654])/, "$1$2")],
    // Where the modern spelling seats a medial hamza on an alef
    // (يَسْأَلُونَ), the rasm writes the hamza alone with nothing under it
    // (يَسْـَٔلُونَ). Only medial: a word-initial أ/إ is written in both, and
    // dropping it would fold أمر into مر.
    (w) => [w, w.replace(/(\S)[\u0623\u0625]/g, "$1").replace(/(\S)[\u0623\u0625]/g, "$1")],
    // A letter carrying the small round zero is not pronounced (U+06DF always,
    // U+06E0 only when the reading runs on). Sometimes the modern spelling
    // drops it too (\u0648\u064e\u062b\u064e\u0645\u064f\u0648\u062f\u064e\u0627\u06df / \u0648\u062b\u0645\u0648\u062f\u060c \u0633\u064e\u0623\u064f\u0648\u06df\u0631\u0650\u064a\u0643\u064f\u0645\u0652 / \u0633\u0623\u0631\u064a\u0643\u0645) and
    // sometimes it keeps it (\u0623\u064f\u0648\u06df\u0644\u064e\u0670\u0653\u0626\u0650\u0643\u064e / \u0623\u0648\u0644\u0626\u0643), so both readings stand.
    (w) => [w, w.replace(/[\u0621-\u064A][\u064B-\u0652\u0670]*[\u06DF\u06E0]/g, "")],
    // The rasm joins some words the modern spelling writes apart - above all
    // the vocative يا (يَٰبَنِىٓ, يَٰٓأَيُّهَا, يَٰقَوْمِ). Only user input ever
    // carries a space here, since the ayah's own words are split on
    // whitespace, so this is what lets "يا بني" be typed for يَٰبَنِىٓ.
    (w) => [w, w.replace(/\s+/g, "")],
  ];
  // Heard, not written: واو الجماعة with its silent alef (تَكْتُمُوا۟) is
  // joined to what follows it in recitation, its vowel is not a syllable of
  // its own, and speech engines return تكتم. That is a fact about listening,
  // so it is allowed only when comparing a recitation - typing تكتم for
  // تَكْتُمُوا۟ is still a missing letter, and still wrong.
  //
  // Except where that واو is not the pronoun at all but the last letter of
  // the word: يَدْعُوا۟ is يدعو, and دعا is its root - dropping it leaves يدع,
  // another word. The rasm gives no sign of the difference; both are written
  // وا۟ with the same silent alef. So the words where it is radical are named,
  // and they are few: the shape is a مضارع of a defective root, and every
  // such word in the Quran was read in its place to be sure of it - تُزَكُّوٓا۟
  // looks the same and is a plural, so it is not among them.
  if (spokenElision && !RADICAL_WAW_WORDS.has(normalizeRasm(merged))) {
    axes.push((w) => [w, w.replace(/\u0648[\u064B-\u065F\u0670]*\u0627(?=[\u064B-\u065F\u0670\u06D6-\u06ED]*$)/g, "")]);
  }
  let forms: string[] = [merged];
  // Deduplicated at every step: an axis that doesn't apply returns the form
  // unchanged, and without this each of them would double the list anyway -
  // 2^axes identical copies of a word nothing touched.
  for (const axis of axes) forms = [...new Set(forms.flatMap(axis))];
  const variants = new Set<string>(forms.map((f) => normalizeRasm(f)));
  for (const v of [...variants]) {
    for (const [rasm, modern] of RASM_SPELLING_SWAPS) if (v.includes(rasm)) variants.add(v.split(rasm).join(modern));
    const whole = RASM_WORD_SWAPS.get(v);
    if (whole) variants.add(whole);
    if (v.length > 1 && "\u0648\u0641\u0644\u0628\u0643".includes(v[0])) {
      const prefixed = RASM_WORD_SWAPS.get(v.slice(1));
      if (prefixed) variants.add(v[0] + prefixed);
    }
  }
  variants.delete("");
  const list = [...variants];
  if (arabicVariantCache.size > 8000) arabicVariantCache.clear();
  arabicVariantCache.set(key, list);
  return list;
}

export function arabicWordsMatch(a: string, b: string, { spokenElision = false }: { spokenElision?: boolean } = {}): boolean {
  const variantsA = arabicWordVariants(a, spokenElision);
  const variantsB = arabicWordVariants(b, spokenElision);
  return variantsA.some((va) => variantsB.includes(va));
}

// The rasm drops the yeh of a منقوص word and of the speaker's own ياء -
// ٱلدَّاعِ is read الداعي, أَطِيعُونِ is أطيعوني, يَٰعِبَادِ is يا عبادي - and it is
// pronounced, so a RECITER who says it has said the word right and a speech
// engine will write the yeh whether he asked it to or not.
//
// Heard, not written. Typing it is another matter: the letter is not in the
// mushaf, and the whole of the writing exercise is writing what is there.
// «الداعي» typed for ٱلدَّاعِ was being called correct - a letter added to the
// text and passed. One direction only even when listening: the answer may
// carry a yeh the ayah's word ends a kasra without, and never the reverse,
// which would let عبادي pass for عِبَادَ.
export function answerMatchesQuranWord(quranWord: string, answer: string, opts?: { spokenElision?: boolean }): boolean {
  if (arabicWordsMatch(quranWord, answer, opts)) return true;
  if (!opts || !opts.spokenElision) return false;
  if (!/\u064A\s*$/.test(answer || "") || !/\u0650[\u06D6-\u06ED]*$/.test(quranWord || "")) return false;
  return arabicWordsMatch(quranWord, answer.replace(/\u064A(?=\s*$)/, ""), opts);
}

// Some Quran text editions attach waqf (pause) annotations - "صلى"
// (continuing is preferable), "قلى" (pausing is preferable) and similar -

// words that don't belong - unless the ayah IS the basmala, as it is in
// Al-Fatiha.
export const HEARD = { spokenElision: true };
const RECITATION_PREAMBLES = [
  "اعوذ بالله من الشيطان الرجيم",
  "اعوذ بالله السميع العليم من الشيطان الرجيم",
  "بسم الله الرحمن الرحيم",
];
export function stripRecitationPreamble(transcript: string, correctWords: string[]): string {
  let words = String(transcript || "").trim().split(/\s+/).filter(Boolean);
  for (let pass = 0; pass < 2; pass++) {
    for (const preamble of RECITATION_PREAMBLES) {
      const p = preamble.split(" ");
      if (words.length <= p.length) continue;
      // Never strip what the ayah itself opens with.
      if (p.every((w: string, k: number) => correctWords[k] && arabicWordsMatch(correctWords[k], w, HEARD))) continue;
      if (p.every((w: string, k: number) => arabicWordsMatch(words[k], w, HEARD))) {
        words = words.slice(p.length);
        break;
      }
    }
  }
  return words.join(" ");
}
