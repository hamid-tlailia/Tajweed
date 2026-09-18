#!/usr/bin/env node
/**
 * TAHQĪQ — build the offline Quran data bundle.
 * Fetches all 114 surahs (Uthmani text with full tashkeel) from the AlQuran Cloud API
 * and writes:
 *   public/quran.json    → full mushaf (offline fallback copy)
 *   public/surahs.json   → 114-surah metadata index
 *
 * Run with: npm run data
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'public');
const BASE = 'https://api.alquran.cloud/v1';

async function getJson(url, tries = 3) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(20000) });
      if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
      return await r.json();
    } catch (e) {
      lastErr = e;
      await new Promise((res) => setTimeout(res, 800 * (i + 1)));
    }
  }
  throw lastErr;
}

async function pool(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

const meta = await getJson(`${BASE}/surah`);
const surahsMeta = meta.data;
const fetchedAt = new Date().toISOString();
const source = 'https://api.alquran.cloud — edition ar.quran-uthmani (bundled offline copy)';

process.stdout.write(`Fetching ${surahsMeta.length} surahs from AlQuran Cloud…\n`);
const outSurahs = await pool(surahsMeta, 6, async (m) => {
  const r = await getJson(`${BASE}/surah/${m.number}/ar.quran-uthmani`);
  const d = r.data;
  process.stdout.write(`\r  ${m.number}/114  `);
  return {
    id: m.number,
    name: d.name,
    englishName: d.englishName,
    englishNameTranslation: d.englishNameTranslation ?? '',
    revelationType: d.revelationType,
    ayahs: d.ayahs.map((a) => ({ n: a.numberInSurah, text: a.text })),
  };
});
process.stdout.write('\n');

fs.mkdirSync(OUT_DIR, { recursive: true });
const quran = { source, fetchedAt, surahs: outSurahs };
const surahs = {
  source,
  fetchedAt,
  surahs: outSurahs.map(({ ayahs, ...rest }) => ({ ...rest, numberOfAyahs: ayahs.length })),
};
fs.writeFileSync(path.join(OUT_DIR, 'quran.json'), JSON.stringify(quran));
fs.writeFileSync(path.join(OUT_DIR, 'surahs.json'), JSON.stringify(surahs));
const kb = (p) => `${(fs.statSync(p).size / 1024).toFixed(0)} KB`;
console.log(`✔ public/quran.json   ${kb(path.join(OUT_DIR, 'quran.json'))}`);
console.log(`✔ public/surahs.json  ${kb(path.join(OUT_DIR, 'surahs.json'))}`);
console.log(`Surahs: ${outSurahs.length} · Total ayahs: ${outSurahs.reduce((a, s) => a + s.ayahs.length, 0)}`);
