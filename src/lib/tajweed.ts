// TAHQĪQ — tajweed rule engine (text/tashkeel-based)
//
// Detects, per word (with next-word context):
//   مد: طبيعي · واجب متصل · واجب منفصل · تعويضي
//   غنّة: مَدِّية · إخفاء · إدغام (بغُنّة/بلا غُنّة) · إظهار
//   قَلْقَلَة · لاَم شمسيّة/قَمَريّة
// and builds the *expected duration* per word from syllables + rule bonuses,
// which classifyWord() compares against the measured duration via τ.

import type { WordStatus, WordTajweed } from './types';
import { clamp } from './util';

const HARAQA_RE = /[\u064B-\u0652\u0653-\u065F\u0670\u06D6-\u06ED\u0640]/;
const HARAKAT_RE = /[\u064B-\u0652\u0653-\u065F\u0670\u06D6-\u06ED]/g;

/** Strip all diacritics / decorative marks */
export function stripTashkeel(s: string): string {
  return s.replace(HARAKAT_RE, '').replace(/\u0640/g, '');
}

/** Normalize Arabic for comparison / tokenization (no diacritics, unified alef/ya/ta-marbuta) */
export function normalizeArabic(s: string): string {
  return s
    .replace(HARAKAT_RE, '')
    .replace(/\u0640/g, '')
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
  h: string; // primary haraka: fatha/kasra/damma/sukun/tanween/karakhan (may be '')
  sh: boolean; // shadda (gemination → the letter is at rest)
}

/** Split a tashkeeled word into base-letter tokens with their haraka + shadda */
function tokenize(word: string): Tok[] {
  const out: Tok[] = [];
  for (const c of word) {
    if (c >= '\u0600' && c <= '\u06FF' && !HARAQA_RE.test(c)) {
      out.push({ ch: c, h: '', sh: false });
    } else if (out.length && c === SHADDA) {
      out[out.length - 1].sh = true;
    } else if (HARAQA_RE.test(c) && out.length) {
      if (!out[out.length - 1].h) out[out.length - 1].h = c;
    }
  }
  return out;
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

const SHORT = new Set([FATHA, KASRA, DAMMA]);
const MADD_LETTERS = new Set(['ا', '\u0671', 'و', 'ي', 'ى']);
const HAMZA_CARRIERS = new Set(['أ', 'إ', 'ء', '\u0624', '\u0626']); // alef/waw/yaa carrying hamza
const QALQALA = new Set(['ق', 'ط', 'ب', 'ج', 'د']);
// nūn-sukūn rule sets (mutually exclusive, ordered by precedence)
const IZHAAR = new Set(['ا', 'ء', 'ه', 'ع', 'ح', 'غ', 'خ']); // 6/7 — no ghunna
const IGHFA = new Set(['ت', 'ث', 'ج', 'د', 'ذ', 'ز', 'س', 'ش', 'ص', 'ض', 'ط', 'ظ', 'ف', 'ق', 'ك']); // 15 — ghunna
const IDGHAM = new Set(['ي', 'ر', 'م', 'ل', 'ن']); // 5 — م ن with ghunna, ي ر ل without
const IDGHAM_GHUNNA = new Set(['م', 'ن']);
const IDGHAM_SHAFAWI = new Set(['ب', 'م', 'ل', 'ن', 'ي', 'ر']); // final mīm → no ghunna
const SHAMSIYYA = new Set(['ت', 'ث', 'د', 'ذ', 'ر', 'ز', 'س', 'ش', 'ص', 'ض', 'ط', 'ظ', 'ل', 'ن']);

export interface RuleBadge {
  label: string;
  tone: 'gold' | 'mint' | 'slate';
}

function firstBaseLetter(word: string): string {
  for (const c of word) if (!HARAQA_RE.test(c)) return c;
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

/** Does the word END with a madd (sustained long vowel)? */
function wordEndsWithMadd(toks: Tok[]): boolean {
  const last = toks[toks.length - 1];
  const prev = toks[toks.length - 2];
  if (!last) return false;
  if (last.h === KARAKHAN) return true; // uthmani final madd alef: كِتَٰبِ
  if (MADD_LETTERS.has(last.ch) && SHORT.has(last.h)) return true; // دَعَايَ (kasra+ya)
  if (last.ch === 'ا' && prev && SHORT.has(prev.h)) return true; // fatha+alef at end
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

  const rules: RuleBadge[] = [];

  // ---- syllables ≈ short-vowel marks + final sukun ----
  const syllables =
    (word.match(/[\u064E\u064F\u0650\u064B\u064C\u064D]/g) ?? []).length + (/\u0652$/.test(word) ? 1 : 0);

  // ================= مَدُود =================
  let maddMs = 0;
  let maddType: string | null = null;
  let isMadd = false;

  // مَدّ وَاجِب مُتَّصِل: a short vowel + hamza-carrying alef inside one word
  //   قَالَ (fatha+alef-hamza) · فَإِن (fatha+alef-hamza below) · ...
  let wajibMuttasil = false;
  for (let k = 1; k < toks.length; k++) {
    if (SHORT.has(toks[k - 1].h) && HAMZA_CARRIERS.has(toks[k].ch)) {
      wajibMuttasil = true;
      break;
    }
  }

  // مَدّ وَاجِب مُنْفَصِل: word ends with a madd + next word starts with hamza
  const wajibMunfasil = !wajibMuttasil && wordEndsWithMadd(toks) && firstHamzaCarrier(nextWord);

  // مَدّ تَعْويضي: word ends in an explicit sukun + next word starts with fatha
  const lastTok = toks[toks.length - 1];
  const maddTawaadi =
    !wajibMuttasil &&
    !wajibMunfasil &&
    !!lastTok &&
    lastTok.h === SUKUN &&
    firstHarakaIsFatha(nextWord);

  // مَدّ طَبِيعِي: madd letter after a short vowel, madda, or karakhan
  const naturalMadd =
    !wajibMuttasil &&
    !wajibMunfasil &&
    !maddTawaadi &&
    (word.includes(KARAKHAN) ||
      word.includes('\u0622') ||
      (() => {
        for (let k = 1; k < toks.length; k++) {
          if (SHORT.has(toks[k - 1].h) && MADD_LETTERS.has(toks[k].ch) && !HAMZA_CARRIERS.has(toks[k].ch)) return true;
        }
        return false;
      })());

  if (wajibMuttasil) {
    isMadd = true;
    maddType = 'مَدٌّ وَاجِبٌ مُتَّصِل';
    maddMs = 650;
  } else if (wajibMunfasil) {
    isMadd = true;
    maddType = 'مَدٌّ وَاجِبٌ مُنْفَصِل';
    maddMs = 650;
  } else if (maddTawaadi) {
    isMadd = true;
    maddType = 'مَدٌّ تَعْويضي';
    maddMs = 650;
  } else if (naturalMadd) {
    isMadd = true;
    maddType = 'مَدٌّ طَبِيعِي';
    maddMs = 350;
  }
  if (maddType) rules.push({ label: maddType, tone: 'gold' });

  // ================= غُنَن =================
  let ghunnaMs = 0;
  let ghunnaType: string | null = null;
  let isGhunna = false;

  // غُنّة مَدِّية: nūn/mīm with shadda
  const ghunnaMadd = word.includes('\u0645\u0651') || word.includes('\u0646\u0651');

  // nūn/mīm at rest (explicit sukun, shadda, tanween, or implicit final sukun)
  const nooNAtRest =
    !!lastTok && (lastTok.ch === 'ن' || lastTok.ch === 'م') &&
    (lastTok.h === SUKUN || lastTok.h === TANF || lastTok.h === TANM || lastTok.h === TANH || lastTok.h === '' || lastTok.sh);

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
  // qalqala letter at rest: shadda (geminated) anywhere, or final sukun/tanween
  let qalqala = false;
  for (const t of toks) {
    if (!QALQALA.has(t.ch)) continue;
    if (t.sh || t.h === SUKUN) {
      qalqala = true;
      break;
    }
    if (t === lastTok && (t.h === TANF || t.h === TANM || t.h === TANH || t.h === '')) {
      qalqala = true;
      break;
    }
  }
  if (qalqala) rules.push({ label: 'قَلْقَلَة', tone: 'gold' });

  // ================= لاَم (article) =================
  // decided by the following letter (the phonological rule)
  if (toks.length >= 3 && toks[0].ch === 'ا' && toks[1].ch === 'ل') {
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
