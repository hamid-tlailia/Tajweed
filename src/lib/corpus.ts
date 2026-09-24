// TAHQĪQ — تمييز المقروء: هل هو نصّ الآية، أم آيةٌ أخرى، أم كلامٌ عادي؟
//
// المرافقة الحية والتحليل الكامل كانا يقيسان المسموع إلى الآية المختارة وحدها:
// فإن لم يشبهها قيل «ليس الآية» بلا تفصيل. هنا يُقاس المسموع إلى **المصحف
// كلّه** (من النسخة المجمّعة public/quran.json) فيُقال للقارئ صراحةً:
//   • هذا نصّ الآية المختارة،
//   • أو قرأت آيةً أخرى (وتُسمّى له سورتُها ورقمُها)،
//   • أو ما سُمع كلامٌ عاديٌّ ليس من القرآن.
//
// الأداء: فهرسٌ مقلوب (كلمة → آياتها) للعدّ السريع، وتوسعةٌ ضبابية بثلاثيات
// الحروف (تحريفُ السماع اليسير لا يُسقط الآية)، ثم لا يُحسب ميزان المطابقة
// الكامل (LCS) إلا لأوائل المرشَّحين — فالتصنيف كلّه بضع عشراتٍ من الملّي ثانية.

import { collapseLetterNames, editClose, matchTokens, normalizeForMatch, scoreTranscriptMatch } from './match';
import { stripTashkeel } from './tajweed';

export interface CorpusAyah {
  /** فهرس الآية في المصفوفة (لا رقمها) */
  idx: number;
  surahId: number;
  ayah: number;
  text: string;
  tokens: string[];
}

export interface QuranCorpus {
  ayahs: CorpusAyah[];
  surahName: Map<number, string>;
  /** كلمةٌ موحَّدة → فهارس الآيات التي تحتويها */
  byToken: Map<string, number[]>;
  /** ثلاثية حروف → كلمات المصحف الحاوية لها (للتوسعة الضبابية) */
  byTrigram: Map<string, Set<string>>;
}

export interface SpeechIdentity {
  kind: 'target' | 'quran' | 'speech' | 'unknown';
  /** مطابقة المسموع لنصّ الآية المختارة (0..1) */
  targetMatch: number;
  /** أقرب آيةٍ أخرى إن وُجدت */
  best?: { surahId: number; surahName: string; ayah: number; match: number };
}

let corpusPromise: Promise<QuranCorpus> | null = null;

/** اسم السورة للعرض: بلا «سورة» ولا تشكيل */
export function surahDisplayName(name: string): string {
  const s = stripTashkeel(String(name ?? ''))
    .replace(/^سورة\s*/u, '')
    .replace(/^سوره\s*/u, '')
    .trim();
  return s || name;
}

/** تحويل الأرقام إلى الأرقام العربية المشرقية للعرض */
export function arabicDigits(n: number | string): string {
  return String(n).replace(/[0-9]/g, (d) => '٠١٢٣٤٥٦٧٨٩'[+d]);
}

function trigrams(w: string): string[] {
  const s = `^${w}$`;
  const out: string[] = [];
  for (let i = 0; i + 3 <= s.length; i++) out.push(s.slice(i, i + 3));
  if (!out.length) out.push(s); // كلمةٌ من حرفٍ واحد
  return out;
}

/** كلمات المسموع بعد التنقية والتوحيد الإملائي */
export function utteranceTokens(text: string): string[] {
  const arabic = String(text ?? '')
    .replace(/[^\u0600-\u06FF\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return arabic ? collapseLetterNames(matchTokens(arabic)) : [];
}

/** بناء الفهرس من بيانات المصحف المجمّعة (بصيغة public/quran.json) */
export function buildCorpus(json: { surahs?: { id: number; name: string; ayahs?: { n?: number; numberInSurah?: number; text: string }[] }[] }): QuranCorpus {
  const ayahs: CorpusAyah[] = [];
  const surahName = new Map<number, string>();
  const byToken = new Map<string, number[]>();
  const byTrigram = new Map<string, Set<string>>();
  for (const s of json.surahs ?? []) {
    surahName.set(s.id, s.name);
    for (const a of s.ayahs ?? []) {
      const text = String(a.text ?? '').replace(/[\u200A\u2060\u200C\uFEFF\n\r]/g, ' ');
      const tokens = normalizeForMatch(text).split(/\s+/).filter(Boolean);
      if (!tokens.length) continue;
      const idx = ayahs.length;
      ayahs.push({ idx, surahId: s.id, ayah: a.n ?? a.numberInSurah ?? 0, text, tokens });
      for (const tok of new Set(tokens)) {
        let list = byToken.get(tok);
        if (!list) byToken.set(tok, (list = []));
        list.push(idx);
        for (const tg of trigrams(tok)) {
          let set = byTrigram.get(tg);
          if (!set) byTrigram.set(tg, (set = new Set()));
          set.add(tok);
        }
      }
    }
  }
  return { ayahs, surahName, byToken, byTrigram };
}

/**
 * تحميل المصحف المجمّع وبنية فهرسه (مرةً واحدة). يعمل في الخيط الرئيس وفي
 * العامل على السواء (جلبٌ من أصل التطبيق نفسه).
 */
export function loadCorpus(): Promise<QuranCorpus> {
  if (!corpusPromise) {
    corpusPromise = (async () => {
      const r = await fetch('/quran.json', { cache: 'force-cache' });
      if (!r.ok) throw new Error(`corpus HTTP ${r.status}`);
      return buildCorpus(await r.json());
    })().catch((e) => {
      corpusPromise = null; // يُعاد المحاولة لاحقًا
      throw e;
    });
  }
  return corpusPromise;
}

/* ------------------------------------------------------------------ */

const FUZZY_WORD_CAP = 500;

/** فهارس آيات كلمةٍ مسموعة: المطابقة التامّة + ما قاربها لفظًا (تحريف السماع) */
function ayahsForToken(corpus: QuranCorpus, tok: string, cache: Map<string, number[]>): number[] {
  const hit = cache.get(tok);
  if (hit) return hit;
  const found = new Set<number>(corpus.byToken.get(tok) ?? []);
  // التوسعة الضبابية: كلماتٌ تشترك مع المسموعة في ثلاثيات الحروف ثم تقاربها
  const words = new Set<string>();
  let overflow = false;
  for (const tg of trigrams(tok)) {
    for (const w of corpus.byTrigram.get(tg) ?? []) {
      if (w === tok || w.length < 3 || Math.abs(w.length - tok.length) > 2) continue;
      words.add(w);
      if (words.size > FUZZY_WORD_CAP) {
        overflow = true;
        break;
      }
    }
    if (overflow) break;
  }
  if (!overflow) {
    for (const w of words) {
      if (!editClose(w, tok)) continue;
      for (const idx of corpus.byToken.get(w) ?? []) found.add(idx);
    }
  }
  const out = [...found];
  cache.set(tok, out);
  return out;
}

/**
 * أقرب آيات المصحف إلى المسموع: عدٌّ سريع بالحقائب ثم ميزان المطابقة الكامل
 * لأوائل المرشَّحين فحسب.
 */
export function identifyInCorpus(
  corpus: QuranCorpus,
  tokens: string[],
  opts: { top?: number; minCount?: number; isTarget?: (surahId: number, ayah: number) => boolean } = {},
): { surahId: number; surahName: string; ayah: number; match: number }[] {
  const top = opts.top ?? 16;
  if (!tokens.length || !corpus.ayahs.length) return [];
  const heard = tokens.join(' ');
  const cache = new Map<string, number[]>();
  const counts = new Int32Array(corpus.ayahs.length);
  for (const tok of tokens) for (const idx of ayahsForToken(corpus, tok, cache)) counts[idx]++;

  const minCount = Math.max(1, opts.minCount ?? (tokens.length >= 6 ? 2 : 1));
  const cand: number[] = [];
  for (let i = 0; i < counts.length; i++) if (counts[i] >= minCount) cand.push(i);
  cand.sort((a, b) => counts[b] - counts[a]);

  const out: { surahId: number; surahName: string; ayah: number; match: number }[] = [];
  for (const idx of cand.slice(0, Math.max(top * 3, 30))) {
    const a = corpus.ayahs[idx];
    if (opts.isTarget && opts.isTarget(a.surahId, a.ayah)) continue;
    const sc = scoreTranscriptMatch(heard, a.text);
    if (sc.match <= 0.02 && out.length >= top) continue;
    out.push({
      surahId: a.surahId,
      surahName: surahDisplayName(corpus.surahName.get(a.surahId) ?? `سورة ${a.surahId}`),
      ayah: a.ayah,
      match: sc.match,
    });
    if (out.length >= top * 2) break;
  }
  out.sort((x, y) => y.match - x.match);
  return out.slice(0, top);
}

/**
 * تصنيف المسموع: آيةٌ مختارة / آيةٌ أخرى / كلامٌ عادي / غير بيّن.
 *
 * @param targetText نصّ الآية المختارة (بأيّ رسم)
 * @param opts.targetMatch مطابقةُ الآية إن حُسبت من قبل (تُعاد وإلا حُسبت)
 * @param opts.isTarget   هل هذه الآية من المقطع المستهدف؟ (تُستثنى من «الأخرى»)
 */
export function classifyUtterance(
  corpus: QuranCorpus,
  tokens: string[],
  targetText: string,
  opts: { targetMatch?: number; isTarget?: (surahId: number, ayah: number) => boolean } = {},
): SpeechIdentity {
  const heard = tokens.join(' ');
  const targetMatch =
    opts.targetMatch ?? (heard ? scoreTranscriptMatch(heard, targetText).match : 0);
  if (!heard) return { kind: 'unknown', targetMatch: 0 };
  const hits = identifyInCorpus(corpus, tokens, { isTarget: opts.isTarget, top: 8 });
  const best = hits[0];
  const bm = best?.match ?? 0;
  let kind: SpeechIdentity['kind'];
  if (targetMatch >= 0.5 && targetMatch >= bm - 0.05) kind = 'target';
  else if (bm >= 0.45 && bm > targetMatch + 0.1) kind = 'quran';
  else if (Math.max(targetMatch, bm) < 0.3) kind = 'speech';
  else kind = 'unknown';
  return { kind, targetMatch, best: bm > 0 ? best : undefined };
}

/** عنوان آيةٍ للعرض: «سورة الفاتحة — الآية ٥» */
export function ayahLabel(hit: { surahName: string; ayah: number }): string {
  return `سورة ${hit.surahName} — الآية ${arabicDigits(hit.ayah)}`;
}
