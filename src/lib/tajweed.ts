// TAHQĪQ — tajweed rule engine (text/tashkeel-based, Uthmani-aware)
//
// Handles the Uthmani orthography special marks used by AlQuran Cloud:
//   U+06E1 small-high sukun (final sukun) · U+08F0 charatīn (tanwīn fath)
//   U+06E4 small-high yāʾ w/ hamza (virtual hamza on the preceding letter)
//   U+0670 karakhan (final madd alef) · U+06D6-06EF small high letters
//
// Detects, per word (with next-word context):
//   مد: طبيعي · واجب متصل · واجب منفصل · تعويضي  (a word may carry two)
//   غنّة: مدّية · إخفاء (15) · إدغام لغوي بغُنّة/بلا غُنّة · شفويّ · إظهار
//   قَلْقَلَة (at rest only) · لاَم شمسيّة/قَمَريّة
// and builds the *expected duration* per word for τ-based timing.

import type { WordStatus, WordTajweed } from './types';
import { clamp } from './util';

const HARAKA_CLASSES =
  '\\u064B-\\u0652\\u0653-\\u065F\\u0670\\u06D6-\\u06EF' +
  '\\u0883-\\u0885\\u0898-\\u089F\\u08A6\\u08AA-\\u08AF\\u08B2-\\u08B8' +
  '\\u08BA\\u08D3-\\u08D8\\u08E2-\\u08E5\\u08F0-\\u08FE';
const HARAQA_RE = new RegExp('[' + HARAKA_CLASSES + '\\u0640]');
const HARAKAT_RE = new RegExp('[' + HARAKA_CLASSES + '\\u0640]', 'g');

/** Strip all diacritics / decorative marks (Uthmani-aware) */
export function stripTashkeel(s: string): string {
  return s.replace(HARAKAT_RE, '');
}

/** Normalize Arabic for comparison / tokenization (no diacritics, unified alef/ya/ta-marbuta) */
export function normalizeArabic(s: string): string {
  return s
    .replace(HARAKAT_RE, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/\u200c/g, '')
    .toLowerCase()
    .replace(/[^\u0600-\u06FFa-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

interface Tok {
  ch: string; // base letter
  h: string; // primary haraka (fatha/kasra/damma/sukun/tanween/karakhan), '' if none
  sh: boolean; // shadda (gemination)
  hz: boolean; // U+06E4 — the letter carries a hamza (virtual hamza carrier)
}

const FATHA = '\u064E';
const KASRA = '\u0650';
const DAMMA = '\u064F';
const SUKUN = '\u0652';
const TANF = '\u064B';
const TANM = '\u064C';
const TANH = '\u064D';
const SHADDA = '\u0651';
const KARAKHAN = '\u0670';
const SMALL_SUKUN = '\u06E1';
const CHARATIN = '\u08F0';
const SMALL_HAMZA_YA = '\u06E4';

const SHORT = new Set([FATHA, KASRA, DAMMA]);
const MADD_LETTERS = new Set(['ا', '\u0671', 'و', 'ي', 'ى']);
const HAMZA_CARRIERS = new Set(['أ', 'إ', 'ء', '\u0624', '\u0626']);
const QALQALA = new Set(['ق', 'ط', 'ب', 'ج', 'د']);
// nūn-sukūn rule sets (mutually exclusive, ordered by precedence)
const IZHAAR = new Set(['ا', 'ء', 'ه', 'ع', 'ح', 'غ', 'خ']); // no ghunna
const IGHFA = new Set(['ت', 'ث', 'ج', 'د', 'ذ', 'ز', 'س', 'ش', 'ص', 'ض', 'ط', 'ظ', 'ف', 'ق', 'ك']); // ghunna
const IDGHAM = new Set(['ي', 'ر', 'م', 'ل', 'ن']); // م ن with ghunna · ي ر ل without
const IDGHAM_GHUNNA = new Set(['م', 'ن']);
const IDGHAM_SHAFAWI = new Set(['ب', 'م', 'ل', 'ن', 'ي', 'ر']); // final mīm
const SHAMSIYYA = new Set(['ت', 'ث', 'د', 'ذ', 'ر', 'ز', 'س', 'ش', 'ص', 'ض', 'ط', 'ظ', 'ل', 'ن']);

/** Split a tashkeeled (Uthmani) word into base-letter tokens with marks */
function tokenize(word: string): Tok[] {
  const out: Tok[] = [];
  const last = () => out[out.length - 1];
  for (const c of word) {
    if (c >= '\u0600' && c <= '\u06D5' && !HARAQA_RE.test(c)) {
      // normalize uthmani yāʾ (U+06CC) → ي for rule-set membership
      out.push({ ch: c === '\u06CC' ? 'ي' : c, h: '', sh: false, hz: false });
    } else if (out.length && c === SHADDA) {
      last().sh = true;
    } else if (out.length && c === SMALL_SUKUN) {
      if (!last().h) last().h = SUKUN; // uthmani small final sukun
    } else if (out.length && c === CHARATIN) {
      if (!last().h) last().h = TANF; // uthmani variant tanween fath
    } else if (out.length && c === SMALL_HAMZA_YA) {
      last().hz = true; // virtual hamza on the preceding letter
    } else if (out.length && HARAQA_RE.test(c)) {
      if (!last().h) last().h = c;
    }
  }
  return out;
}

export interface RuleBadge {
  label: string;
  tone: 'gold' | 'mint' | 'slate';
}

function firstBaseLetter(word: string): string {
  for (const c of word) {
    if (!HARAQA_RE.test(c)) return c === '\u06CC' ? 'ي' : c;
  }
  return '';
}
function firstHamzaCarrier(word: string): boolean {
  const c = firstBaseLetter(word);
  return HAMZA_CARRIERS.has(c);
}
function firstHarakaIsFatha(word: string): boolean {
  for (const c of word) {
    if (HARAQA_RE.test(c)) return c === FATHA;
    return false;
  }
  return false;
}

const TANWEE = new Set([TANF, TANM, TANH]);

/** Does the word END with a madd (sustained long vowel)? */
function wordEndsWithMadd(toks: Tok[]): boolean {
  const lastTok = toks[toks.length - 1];
  const prev = toks[toks.length - 2];
  if (!lastTok) return false;
  if (lastTok.h === KARAKHAN) return true; // uthmani final madd alef: كِتَٰبِ
  if (MADD_LETTERS.has(lastTok.ch) && SHORT.has(lastTok.h)) return true; // explicit: ـُو / ـِ
  if (!prev) return false;
  // a short vowel on the letter BEFORE a final madd/hamza letter: the long vowel
  // is spelled across two letters — دُعَاۤءِیۤ (اِ + یۤ), قَالُوا (و + ا), لَاۤ (لَ + اۤ), لِي
  if (SHORT.has(prev.h) && (MADD_LETTERS.has(lastTok.ch) || HAMZA_CARRIERS.has(lastTok.ch) || lastTok.hz)) return true;
  // final alef after a shadda letter (إِلَّا) — but NOT after tanween (the alef of عَدًّا is not a madd)
  if (lastTok.ch === 'ا' && prev.sh && !TANWEE.has(prev.h)) return true;
  return false;
}

/**
 * Context-aware tajweed analysis. `words` is the full sequence so that
 * inter-word rules (مَدّ واجب منفصل، إظهار/إخفاء/إدغام crossing word
 * boundaries) can be detected.
 */
export function analyzeWords(words: string[]): WordTajweed[] {
  return words.map((raw, i) => analyzeWord(raw, i + 1 < words.length ? words[i + 1] : ''));
}

export function analyzeWord(raw: string, nextWord = ''): WordTajweed {
  const word = raw;
  const toks = tokenize(word);
  const lastTok = toks[toks.length - 1];

  const rules: RuleBadge[] = [];

  // ---- syllables ≈ short-vowel marks + final sukun ----
  const syllables =
    (word.match(/[\u064E\u064F\u0650\u064B\u064C\u064D\u06E1]/g) ?? []).length + (/\u0652$/.test(word) ? 1 : 0);

  // ================= مَدُود (a word may carry two: muttasil + munfasil) =================
  const isHamzaCarrier = (t: Tok) => HAMZA_CARRIERS.has(t.ch) || t.hz;

  const endsMadd = wordEndsWithMadd(toks);
  const nextWordHamza = firstHamzaCarrier(nextWord);
  // واجب متصل: short vowel + hamza carrier INSIDE the word (not the final madd letter)
  // — قَالَ، سَأَلَ، ٱلۡحَاۤقَّةُ، دُعَاۤءِـ
  const wajibMuttasil = toks.some(
    (t, k) => k > 0 && k < toks.length - 1 && SHORT.has(toks[k - 1].h) && isHamzaCarrier(t),
  );
  // final madd letter bearing a virtual hamza mark (وَمَاۤ / ـِیۤ):
  //  • next word starts with a hamza → the mark is the elided join → منفصل
  //  • otherwise the hamza belongs inside the word → متصل
  const endHamzaMadd = endsMadd && !!lastTok && lastTok.hz;
  // واجب منفصل: word ends with a madd + next word starts with a hamza — وَمَاۤ أَدۡرَىٰكَ
  const wajibMunfasil = endsMadd && nextWordHamza;
  // تعويضي: explicit final sukun + next word starts with fatha
  // (not when the final mīm merges — إدغام شفويّ consumes the sukun)
  const maddTawaadi =
    !!lastTok && lastTok.h === SUKUN &&
    (lastTok.ch !== 'م' || !IDGHAM_SHAFAWI.has(firstBaseLetter(nextWord))) &&
    firstHarakaIsFatha(nextWord);
  // طبيعي: madd letter after a short vowel, madda (آ), or karakhan (مَٰ / ـِٰ)
  const naturalMadd =
    word.includes(KARAKHAN) ||
    word.includes('\u0622') ||
    toks.some((t, k) => k > 0 && SHORT.has(toks[k - 1].h) && MADD_LETTERS.has(t.ch));

  const madds: { label: string; ms: number }[] = [];
  if (wajibMuttasil) madds.push({ label: 'مَدٌّ وَاجِبٌ مُتَّصِل', ms: 650 });
  if (wajibMunfasil) madds.push({ label: 'مَدٌّ وَاجِبٌ مُنْفَصِل', ms: 650 });
  else if (endHamzaMadd && !wajibMuttasil) madds.push({ label: 'مَدٌّ وَاجِبٌ مُتَّصِل', ms: 650 });
  if (maddTawaadi) madds.push({ label: 'مَدٌّ تَعْويضي', ms: 650 });
  if (!madds.length && naturalMadd) madds.push({ label: 'مَدٌّ طَبِيعِي', ms: 350 });

  let isMadd = madds.length > 0;
  let maddType: string | null = isMadd ? madds[0].label : null;
  let maddMs = isMadd ? Math.min(1100, madds.reduce((a, m) => a + m.ms, 0)) : 0;
  for (const m of madds) rules.push({ label: m.label, tone: 'gold' });

  // ================= غُنَن =================
  let ghunnaMs = 0;
  let ghunnaType: string | null = null;
  let isGhunna = false;

  // غُنّة مَدِّية: nūn/mīm with shadda
  const ghunnaMadd = word.includes('\u0645\u0651') || word.includes('\u0646\u0651');

  // nūn/mīm at rest (explicit/implicit sukun, small sukun, shadda, or tanween)
  const nooNAtRest =
    !!lastTok && (lastTok.ch === 'ن' || lastTok.ch === 'م') &&
    (lastTok.h === SUKUN || lastTok.h === TANF || lastTok.h === TANM || lastTok.h === TANH ||
      lastTok.h === '' || lastTok.sh);

  if (ghunnaMadd) {
    isGhunna = true;
    ghunnaType = 'غُنّة مَدِّية';
    ghunnaMs = 300;
  } else if (nooNAtRest) {
    const following = firstBaseLetter(nextWord);
    if (lastTok.ch === 'م') {
      // final mīm: shafawi (lip) idgham into ب م ل ن ي ر — no ghunna
      if (IDGHAM_SHAFAWI.has(following)) {
        rules.push({ label: 'إدغام شفويّ', tone: 'mint' });
      } else if (!following) {
        isGhunna = true;
        ghunnaType = 'غُنّة خَفِيّة';
        ghunnaMs = 220;
      }
    } else if (IGHFA.has(following)) {
      isGhunna = true;
      ghunnaType = 'غُنّة إخفاء';
      ghunnaMs = 300;
      rules.push({ label: 'إخفاء', tone: 'slate' });
    } else if (IDGHAM.has(following)) {
      if (IDGHAM_GHUNNA.has(following)) {
        isGhunna = true;
        ghunnaType = 'غُنّة إدغام';
        ghunnaMs = 300;
        rules.push({ label: 'إدغام بغُنّة', tone: 'mint' });
      } else {
        rules.push({ label: 'إدغام بلا غُنّة', tone: 'mint' });
      }
    } else if (IZHAAR.has(following)) {
      rules.push({ label: 'إظهار حلقي', tone: 'slate' });
    } else if (!following) {
      // resting nūn with nothing after → quiet rest (khafiya)
      isGhunna = true;
      ghunnaType = 'غُنّة خَفِيّة';
      ghunnaMs = 220;
    }
  }
  if (ghunnaType) rules.push({ label: ghunnaType, tone: 'mint' });

  // ================= قَلْقَلَة =================
  // qalqala fires only at actual REST:
  //  • final letter with sukun/tanween (reciter may pause there), or
  //  • a geminated (shadda) qalqala letter at the END of the word
  //    (e.g. عَدًّا / مَسْجِدًا — pause lands on the doubled letter).
  // Mid-word sukun/shadda (بِسْمِ، ٱلۡحَاۤقَّةُ) are passing rests — NO qalqala.
  let qalqala = false;
  for (let idx = 0; idx < toks.length; idx++) {
    const t = toks[idx];
    if (!QALQALA.has(t.ch)) continue;
    if (idx === toks.length - 1 && (t.h === SUKUN || t.h === TANF || t.h === TANM || t.h === TANH || t.h === '')) {
      qalqala = true;
      break;
    }
    if (t.sh) {
      const rest = toks.slice(idx + 1);
      if (rest.length === 0) {
        qalqala = true;
        break;
      }
      // geminate + tanween + final alef: ـًّ ا (عَدًّا)
      if (rest.length === 1 && rest[0].ch === 'ا' && (t.h === TANF || t.h === TANM || t.h === TANH)) {
        qalqala = true;
        break;
      }
    }
  }
  if (qalqala) rules.push({ label: 'قَلْقَلَة', tone: 'gold' });

  // ================= لاَم (article) =================
  // decided by the following letter (the phonological rule)
  if (toks.length >= 3 && (toks[0].ch === 'ا' || toks[0].ch === '\u0671') && toks[1].ch === 'ل') {
    const fol = toks[2].ch;
    if (SHAMSIYYA.has(fol)) rules.push({ label: 'لاَم شمسيّة', tone: 'slate' });
    else rules.push({ label: 'لاَم قَمَريّة', tone: 'slate' });
  }

  let expectedMs = 90 + 130 * Math.max(1, syllables);
  if (isMadd) expectedMs += maddMs;
  if (ghunnaMs) expectedMs += ghunnaMs;
  if (qalqala) expectedMs += 40;
  expectedMs = Math.max(240, expectedMs);

  return { word, syllables, isMadd, maddType, isGhunna, ghunnaType, rules, expectedMs };
}

/** Tolerance window: τ=0 → ±60% (lenient) · τ=1 → ±15% (strict tajwid) */
export function tauTolerance(tau: number): number {
  return 0.6 - 0.45 * clamp(tau, 0, 1);
}

export function classifyWord(measuredMs: number, expectedMs: number, tau: number): WordStatus {
  if (measuredMs < 70) return 'silent';
  const tol = tauTolerance(tau);
  const r = measuredMs / Math.max(60, expectedMs);
  if (r < 1 - tol) return 'short';
  if (r > 1 + tol) return 'long';
  if (Math.abs(r - 1) <= 0.35 * tol) return 'excellent';
  return 'ok';
}

export function tajweedScore(measuredMs: number, expectedMs: number, tau: number): number {
  if (measuredMs < 70) return 0.1;
  const tol = tauTolerance(tau);
  const r = measuredMs / Math.max(60, expectedMs);
  return clamp(1 - Math.abs(r - 1) / (2 * tol), 0, 1);
}

export function verdictFor(score: number): string {
  if (score >= 85) return 'مُتقَن — أداء ممتاز';
  if (score >= 70) return 'جيد — مطابقة قوية';
  if (score >= 50) return 'مقبول — يحتاج مراجعة';
  return 'يحتاج إتقانًا أكبر';
}
