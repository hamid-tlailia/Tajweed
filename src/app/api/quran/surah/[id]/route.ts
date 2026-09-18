import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const REMOTE_BASE = 'https://api.alquran.cloud/v1/surah';

/**
 * GET /api/quran/surah/:id
 * 1) live AlQuran Cloud — edition ar.quran-uthmani (full tashkeel)
 * 2) bundled offline copy → /quran.json
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const n = Number(id);
  if (!Number.isInteger(n) || n < 1 || n > 114) {
    return NextResponse.json({ error: 'invalid surah id' }, { status: 400 });
  }

  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 6000);
    const res = await fetch(`${REMOTE_BASE}/${n}/editions/ar.quran-uthmani`, { signal: ctl.signal });
    clearTimeout(t);
    if (res.ok) {
      const j = await res.json();
      const d = j.data;
      if (d?.ayahs?.length) {
        return NextResponse.json({
          source: 'alquran.cloud',
          data: {
            id: d.number,
            meta: {
              id: d.number,
              name: d.name,
              englishName: d.englishName,
              englishNameTranslation: d.englishNameTranslation ?? '',
              revelationType: d.revelationType,
              numberOfAyahs: d.numberOfAyahs,
            },
            ayahs: d.ayahs.map((a: any) => ({
              number: a.number,
              numberInSurah: a.numberInSurah,
              text: a.text,
            })),
          },
        });
      }
    }
  } catch {
    /* fallback */
  }

  try {
    const origin = new URL(req.url).origin;
    const local = await fetch(`${origin}/quran.json`);
    if (local.ok) {
      const j = await local.json();
      const s = (j.surahs ?? []).find((x: any) => x.id === n);
      if (s) {
        return NextResponse.json({
          source: 'local-bundle',
          data: {
            id: s.id,
            meta: {
              id: s.id,
              name: s.name,
              englishName: s.englishName,
              englishNameTranslation: s.englishNameTranslation ?? '',
              revelationType: s.revelationType,
              numberOfAyahs: s.ayahs.length,
            },
            ayahs: s.ayahs.map((a: any) => ({ number: a.n, numberInSurah: a.n, text: a.text })),
          },
        });
      }
    }
  } catch {
    /* fallback failed */
  }

  return NextResponse.json({ error: 'surah unavailable' }, { status: 503 });
}
