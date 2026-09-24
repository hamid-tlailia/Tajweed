// TAHQĪQ — وسيط صوت القارئ المعتمد
//
// تقييم تلاوة القارئ المعتمد يحتاج فكّ الصوت إلى عيّنات رقمية، وهو ما يمنعه
// CORS عند الجلب المباشر من أرشيفات التلاوة. هذا المسار يجلب الملف من الخادم
// (لا قيود CORS بين الخوادم) ويعيده للصفحة من نطاقنا نفسه.
//
// ملاحظة خصوصية: هذا المسار تنزيلٌ صِرف لصوت القارئ المرجعي؛ لا يُرفَع إليه
// ولا يُسجَّل فيه شيء من صوت المستخدم أبدًا.

import { autoReciter, ayahAudioUrls, reciterById } from '@/lib/reciter';
import type { Riwayah } from '@/lib/types';

export const dynamic = 'force-dynamic';

/** أعداد آيات كل سورة (لحساب رقم الآية في المصحف كاملًا دون جلب الفهرس) */
const AYAH_COUNTS = [
  7, 286, 200, 176, 120, 165, 206, 75, 129, 109, 123, 111, 43, 52, 99, 128, 111, 110, 98, 135, 112, 78, 118, 64, 77,
  227, 93, 88, 69, 60, 34, 30, 73, 54, 45, 83, 182, 88, 75, 85, 54, 53, 89, 59, 37, 35, 38, 29, 18, 45, 60, 49, 62,
  55, 78, 96, 29, 22, 24, 13, 14, 11, 11, 18, 12, 12, 30, 52, 52, 44, 28, 28, 20, 56, 40, 31, 50, 40, 46, 42, 29, 19,
  36, 25, 22, 17, 19, 26, 30, 20, 15, 21, 11, 8, 8, 19, 5, 8, 8, 11, 11, 8, 3, 9, 5, 4, 7, 3, 6, 3, 5, 4, 5, 6,
];

function globalAyah(surah: number, ayah: number): number {
  let total = 0;
  for (let i = 1; i < surah && i <= 114; i++) total += AYAH_COUNTS[i - 1] ?? 0;
  return total + ayah;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  // القارئ بمعرّفه (reciter=husary…)؛ ويُقبل riwayah وحده توافقًا مع النسخ السابقة
  const riwayahParam = url.searchParams.get('riwayah');
  const reciterParam = url.searchParams.get('reciter');
  const reciter =
    reciterById(reciterParam) ??
    (riwayahParam === 'hafs' || riwayahParam === 'warsh' ? autoReciter(riwayahParam as Riwayah, 'tadwir') : null);
  const surah = Number(url.searchParams.get('surah'));
  const ayah = Number(url.searchParams.get('ayah'));

  if (!reciter || !Number.isInteger(surah) || surah < 1 || surah > 114 || !Number.isInteger(ayah) || ayah < 1) {
    return Response.json({ error: 'معاملات غير صحيحة' }, { status: 400 });
  }
  if (ayah > (AYAH_COUNTS[surah - 1] ?? 0)) {
    return Response.json({ error: 'رقم آية خارج السورة' }, { status: 400 });
  }

  const g = globalAyah(surah, ayah);
  const urls = ayahAudioUrls(reciter, surah, ayah, g);

  for (const u of urls) {
    try {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 15000);
      const res = await fetch(u, { signal: ctl.signal });
      clearTimeout(t);
      if (!res.ok || !res.body) continue;
      const buf = await res.arrayBuffer();
      if (!buf.byteLength) continue;
      return new Response(buf, {
        status: 200,
        headers: {
          'Content-Type': res.headers.get('content-type') ?? 'audio/mpeg',
          'Cache-Control': 'public, max-age=604800',
          'X-Ref-Reciter': encodeURIComponent(reciter.name),
        },
      });
    } catch {
      /* جرّب الرابط التالي */
    }
  }

  return Response.json(
    { error: 'تعذّر جلب صوت القارئ المعتمد من المصادر المتاحة — تحقّق من اتصال الإنترنت.' },
    { status: 502 },
  );
}
