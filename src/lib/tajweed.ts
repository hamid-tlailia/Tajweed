// TAHQĪQ — tajweed heuristics
// Builds a *model expected duration* per word from its vocalization:
// syllable count + madd (مد) + ghunna (غنّة), then classifies a measured
// duration against the match threshold τ.

import type { WordStatus, WordTajweed } from './types';
import { clamp } from './util';

/** Strip all diacritics / decorative marks */
export function stripTashkeel(s: string): string {
  return s.replace(/[\u064B-\u0652\u0653-\u065F\u0670\u06D6-\u06ED\u0640]/g, '');
}

/** Normalize Arabic for comparison / tokenization (no diacritics, unified alef/ya/ta-marbuta) */
export function normalizeArabic(s: string): string {
  return s
    .replace(/[\u064B-\u0652\u0653-\u065F\u0670\u06D6-\u06ED\u0640]/g, '')
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

export function analyzeWord(raw: string): WordTajweed {
  const word = raw;
  // syllables ≈ short-vowel marks + final sukun
  const syllables =
    (word.match(/[\u064E\u064F\u0650\u064B\u064C\u064D]/g) ?? []).length +
    (/\u0652$/.test(word) ? 1 : 0);

  // madd detection:
  //  - letter with fatha/kasra/damma followed by plain alif: "مَالا"
  //  - karakhan (U+0670) which in Uthmani text marks the madd alif: "كِتَٰبِ"
  //  - madda above alif: "آ"
  const hasKarakhan = /\u0670/.test(word);
  const maddAlif = /[\u0621-\u064A][\u064E\u064F\u0650]ا/.test(word) || hasKarakhan;
  const madda = /آ/.test(word);
  const isMadd = maddAlif || madda;
  const maddType: string | null = isMadd
    ? /[\u064E\u064F\u0650]ا\u0651/.test(word)
      ? 'مَدٌّ لَازِم'
      : 'مَدٌّ طَبِيعِي'
    : null;

  // ghunna: nūn/mīm with shadda (ghunna maddiyya) or final sukun (ghunna khafiya)
  const ghunnaMadd = /[\u0645\u0646]\u0651/.test(word);
  const ghunnaSukun = /[\u0645\u0646]\u0652$/.test(word);
  const isGhunna = ghunnaMadd || ghunnaSukun;
  const ghunnaType: string | null = isGhunna
    ? ghunnaMadd
      ? 'غُنّة مَدِّية'
      : 'غُنّة خَفِيّة'
    : null;

  let expectedMs = 90 + 130 * Math.max(1, syllables);
  if (isMadd) expectedMs += 460; // ~2 harakat sustained
  if (isGhunna) expectedMs += 300; // sustained ghunna
  expectedMs = Math.max(240, expectedMs);

  return { word, syllables, isMadd, maddType, isGhunna, ghunnaType, expectedMs };
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
