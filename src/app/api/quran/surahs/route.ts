import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const REMOTE = 'https://api.alquran.cloud/v1/surah';

/**
 * GET /api/quran/surahs
 * 1) live AlQuran Cloud (114 surahs metadata)
 * 2) bundled offline copy → /surahs.json
 */
export async function GET(req: Request) {
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 5000);
    const res = await fetch(REMOTE, { signal: ctl.signal });
    clearTimeout(t);
    if (res.ok) {
      const j = await res.json();
      const surahs = (j.data ?? []).map((s: any) => ({
        id: s.number,
        name: s.name,
        englishName: s.englishName,
        englishNameTranslation: s.englishNameTranslation ?? '',
        revelationType: s.revelationType,
        numberOfAyahs: s.numberOfAyahs,
      }));
      if (surahs.length >= 114) return NextResponse.json({ source: 'alquran.cloud', surahs });
    }
  } catch {
    /* fallback */
  }
  try {
    const origin = new URL(req.url).origin;
    const local = await fetch(`${origin}/surahs.json`);
    if (local.ok) {
      const j = await local.json();
      if (Array.isArray(j.surahs) && j.surahs.length >= 114) {
        return NextResponse.json({ source: 'local-bundle', surahs: j.surahs });
      }
    }
  } catch {
    /* fallback failed */
  }
  return NextResponse.json({ error: 'surah index unavailable' }, { status: 503 });
}
