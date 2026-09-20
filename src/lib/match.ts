// TAHQĪQ — مطابقة نصّ التلاوة بالآية (كلمات + حروف)
//
// نموذج التعرّف قد يُرجع الكلمات بلا فواصل أو بحروف قريبة، فمطابقة الكلمات
// وحدها تُظهر 0٪ رغم أن القارئ قرأ الآية. لذلك نأخذ أعلى النسبة بين:
//   1) LCS على الكلمات بعد التوحيد
//   2) LCS على الحروف بعد حذف المسافات
//   3) تداخل ثلاثيات الحروف للسور الطويلة

import { normalizeArabic } from './tajweed';

export interface TranscriptScore {
  match: number; // 0..1
  predWords: { word: string; ok: boolean }[];
  /** لا حروف عربية في النصّ المسموع — يُلجأ عندها لتغطية الصوت */
  empty: boolean;
}

function arabicOnly(s: string): string {
  return s.replace(/[^\u0600-\u06FF\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function lcsLen(a: string, b: string): number {
  const n = a.length;
  const m = b.length;
  if (!n || !m) return 0;
  let prev = new Int32Array(m + 1);
  let cur = new Int32Array(m + 1);
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      cur[j] = a[i - 1] === b[j - 1] ? prev[j - 1] + 1 : prev[j] > cur[j - 1] ? prev[j] : cur[j - 1];
    }
    const tmp = prev;
    prev = cur;
    cur = tmp;
    cur.fill(0);
  }
  return prev[m];
}

function trigramJaccard(a: string, b: string): number {
  const grams = (s: string) => {
    const set = new Set<string>();
    const t = ` ${s} `;
    for (let i = 0; i + 2 < t.length; i++) set.add(t.slice(i, i + 3));
    return set;
  };
  const A = grams(a);
  const B = grams(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const g of A) if (B.has(g)) inter++;
  return inter / B.size;
}

function editClose(a: string, b: string): boolean {
  if (a === b) return true;
  const n = a.length;
  const m = b.length;
  if (Math.abs(n - m) > 2) return false;
  const maxD = Math.max(1, Math.floor(Math.max(n, m) / 3));
  // Wagner-Fischer bounded
  if (n * m > 800) return false;
  const dp: number[] = Array.from({ length: m + 1 }, (_, j) => j);
  for (let i = 1; i <= n; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= m; j++) {
      const tmp = dp[j];
      dp[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[j], dp[j - 1]);
      prev = tmp;
    }
  }
  return dp[m] <= maxD;
}

/** درجة تطابق ما سمعه التطبيق من التلاوة مع نصّ الآية */
export function scoreTranscriptMatch(pred: string, target: string): TranscriptScore {
  const arabic = arabicOnly(pred);
  const tNorm = normalizeArabic(target);
  if (!tNorm) return { match: 0, predWords: [], empty: true };
  if (!arabic) return { match: 0, predWords: [], empty: true };

  const p = arabic
    .split(/\s+/)
    .filter(Boolean)
    .map(normalizeArabic)
    .filter(Boolean);
  const t = tNorm.split(/\s+/).filter(Boolean);
  if (!t.length) return { match: 0, predWords: p.map((w) => ({ word: w, ok: false })), empty: false };
  if (!p.length) {
    // نصّ عربي متّصل بلا فواصل — نُطابق على الحروف
    const compactP = normalizeArabic(arabic).replace(/\s+/g, '');
    const compactT = tNorm.replace(/\s+/g, '');
    const char =
      compactP.length * compactT.length > 250_000
        ? trigramJaccard(compactP, compactT)
        : lcsLen(compactP, compactT) / compactT.length;
    return { match: char, predWords: [{ word: compactP, ok: char >= 0.6 }], empty: false };
  }

  const n = p.length;
  const m = t.length;
  let wordRatio = 0;
  const ok = new Array<boolean>(n).fill(false);

  if (n * m > 4_000_000) {
    const counts = new Map<string, number>();
    for (const w of p) counts.set(w, (counts.get(w) ?? 0) + 1);
    let matches = 0;
    for (const w of t) {
      const c = counts.get(w) ?? 0;
      if (c > 0) {
        matches++;
        counts.set(w, c - 1);
      }
    }
    wordRatio = matches / m;
  } else {
    const dp: Int32Array[] = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        const hit = p[i] === t[j] || editClose(p[i], t[j]);
        dp[i][j] = hit ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
    let i = 0;
    let j = 0;
    while (i < n && j < m) {
      if (p[i] === t[j] || editClose(p[i], t[j])) {
        ok[i] = true;
        i++;
        j++;
      } else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
      else j++;
    }
    wordRatio = dp[0][0] / m;
  }

  const compactP = p.join('');
  const compactT = t.join('');
  const charRatio =
    compactP.length * compactT.length > 250_000
      ? trigramJaccard(compactP, compactT)
      : compactT.length
        ? lcsLen(compactP, compactT) / compactT.length
        : 0;

  return {
    match: Math.max(0, Math.min(1, Math.max(wordRatio, charRatio))),
    predWords: p.map((w, k) => ({ word: w, ok: ok[k] })),
    empty: false,
  };
}
