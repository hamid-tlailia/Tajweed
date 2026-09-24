// TAHQĪQ — Quran data access
// Primary: Next.js API proxy → AlQuran Cloud (live, open API)
// Fallback: bundled offline copy (public/surahs.json + public/quran.json)

import type { SurahData, SurahMeta, TargetSpec } from './types';
import { normalizeForMatch } from './match';
import { normalizeArabic } from './tajweed';

async function getJson(url: string, timeoutMs = 8000): Promise<any> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { signal: ctl.signal, cache: 'no-store' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally {
    clearTimeout(t);
  }
}

export async function fetchSurahs(): Promise<SurahMeta[]> {
  try {
    const j = await getJson('/api/quran/surahs', 8000);
    if (Array.isArray(j?.surahs) && j.surahs.length >= 114) return j.surahs as SurahMeta[];
  } catch {
    /* fall through to local bundle */
  }
  const j = await getJson('/surahs.json', 8000);
  if (Array.isArray(j?.surahs) && j.surahs.length >= 114) return j.surahs as SurahMeta[];
  throw new Error('تعذّر جلب فهرس السور');
}

/** كلمات البسملة بالرسم العثماني (كما ترد في نصّ المصحف) */
export const BASMALA_WORDS = ['بِسۡمِ', 'ٱللَّهِ', 'ٱلرَّحۡمَـٰنِ', 'ٱلرَّحِیمِ'] as const;
const BASMALA_KEY = 'بسم الله الرحمن الرحيم';

/** هل تبدأ هذه الكلمات بالبسملة (بأيّ رسم)؟ */
export function startsWithBasmalaWords(words: string[]): boolean {
  if (words.length < 4) return false;
  return words.slice(0, 4).map(normalizeArabic).join(' ') === BASMALA_KEY;
}

/**
 * البسملة ليست من أول آيةٍ في السورة (إلا في الفاتحة، وليست في براءة أصلًا)،
 * ونصُّ المصحف الوارد من المصدر يُلصقها بالآية الأولى — فتُنزَع منه هنا عند
 * التحميل، فلا تُعرض ولا تُقاس ولا تدخل في المطابقة على أنها من الآية.
 */
export function stripSurahBasmala(data: SurahData): SurahData {
  if (data.id === 1 || data.id === 9) return data;
  const first = data.ayahs.find((a) => a.numberInSurah === 1);
  if (!first) return data;
  const clean = first.text.replace(/[\u200A\u2060\u200C\uFEFF]/g, '');
  const words = clean.split(/\s+/).filter(Boolean);
  if (!startsWithBasmalaWords(words)) return data;
  const rest = words.slice(4).join(' ');
  return {
    ...data,
    ayahs: data.ayahs.map((a) => (a === first ? { ...a, text: rest } : a)),
  };
}

export async function fetchSurah(id: number): Promise<SurahData> {
  try {
    const j = await getJson(`/api/quran/surah/${id}`, 8000);
    if (j?.data?.ayahs?.length) return stripSurahBasmala(j.data as SurahData);
  } catch {
    /* fall through to local bundle */
  }
  const j = await getJson('/quran.json', 30000);
  const s = (j?.surahs ?? []).find((x: any) => x.id === id);
  if (s) {
    return stripSurahBasmala({
      id: s.id,
      meta: {
        id: s.id,
        name: s.name,
        englishName: s.englishName ?? '',
        englishNameTranslation: s.englishNameTranslation ?? '',
        revelationType: s.revelationType ?? '',
        numberOfAyahs: s.ayahs.length,
      },
      ayahs: s.ayahs.map((a: any) => ({ number: a.n, numberInSurah: a.n, text: a.text })),
    });
  }
  throw new Error('تعذّر جلب نصّ السورة');
}

/** Build the forced-alignment target from a surah + scope + selected ayah */
export function buildTarget(data: SurahData, scope: 'ayah' | 'surah', ayah: number): TargetSpec {
  const ayahs = scope === 'ayah' ? data.ayahs.filter((a) => a.numberInSurah === ayah) : data.ayahs;
  const words: TargetSpec['words'] = [];
  for (const a of ayahs) {
    // نص المصحف يتضمّن U+200A (مسافة شعرية) و U+2060 (موصِل كلمة) يقسِّمان بعض الكلمات
    // فتتفتت في التحليل والعرض — تُزال لتبقى الكلمة القرآنية واحدة.
    const clean = a.text.replace(/[\u200A\u2060\u200C\uFEFF]/g, '');
    for (const w of clean.split(/\s+/).filter((w) => /[\u0621-\u064A]/.test(w))) {
      words.push({ word: w, ayah: a.numberInSurah });
    }
  }
  return {
    key: `${data.id}:${scope}:${scope === 'ayah' ? ayah : 'all'}`,
    label: scope === 'ayah' ? `${data.meta.name} — الآية ${ayah}` : `${data.meta.name} — السورة كاملة`,
    words,
  };
}

/**
 * نصّ الآية للمطابقة النصّية: بالتوحيد الإملائيّ (الألف الخنجرية → ألف …) لا
 * بـ`normalizeArabic` وحده — فذاك يُسقط الألف الخنجرية فتصير «العالمين» «العلمين»
 * ولا تُطابق ما يُخرجه السماع الآلي.
 */
export function targetTextOf(target: TargetSpec): string {
  return target.words.map((w) => normalizeForMatch(w.word)).join(' ');
}
