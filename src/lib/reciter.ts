// TAHQĪQ — صوت القارئ المرجعي (اختياري)
//
// يسمع المتعلِّم الآيةَ من قارئٍ متقنٍ بالرواية المختارة قبل أن يقرأ، وهي —
// بخلاف بقية التطبيق — تحتاج اتصالًا بالإنترنت؛ ولذلك لا يُحمَّل منها شيء
// إلا عند الضغط على زرّ الاستماع، ويُعرض سبب واضح إن تعذّر الجلب.
//
// صيغة الأسماء: SSSAAA.mp3 (رقم السورة ثم رقم الآية بثلاث خانات) كما في
// أرشيف everyayah، مع بدائل يُجرَّب بعضها بعد بعض إن تعذّر الأول.

import type { Riwayah, SurahMeta } from './types';

export interface ReciterSource {
  /** الاسم كما يظهر للمستخدم */
  name: string;
  riwayah: Riwayah;
  /** قوالب الروابط: {s3} السورة · {a3} الآية · {g} رقم الآية في المصحف كاملًا */
  templates: string[];
}

export const RECITERS: Record<Riwayah, ReciterSource> = {
  hafs: {
    name: 'مشاري العفاسي',
    riwayah: 'hafs',
    templates: [
      'https://everyayah.com/data/Alafasy_128kbps/{s3}{a3}.mp3',
      'https://cdn.islamic.network/quran/audio/128/ar.alafasy/{g}.mp3',
    ],
  },
  warsh: {
    name: 'ياسين الجزائري',
    riwayah: 'warsh',
    templates: [
      'https://everyayah.com/data/warsh_yassin_al_jazaery_64kbps/{s3}{a3}.mp3',
      'https://everyayah.com/data/warsh_ibrahim_aldosary_128kbps/{s3}{a3}.mp3',
    ],
  },
};

/** رقم الآية في المصحف كاملًا (١..٦٢٣٦) كما تحتاجه بعض مكتبات الصوت */
export function globalAyahNumber(
  surahs: SurahMeta[],
  surahId: number,
  ayahInSurah: number,
): number | null {
  if (!surahs?.length || surahs.length < 114) return null;
  let total = 0;
  for (const s of surahs) {
    if (s.id === surahId) return total + ayahInSurah;
    total += s.numberOfAyahs || 0;
  }
  return null;
}

/** كل روابط الآية الممكنة بالترتيب (يُجرَّب الأول ثم ما بعده) */
export function ayahAudioUrls(
  riwayah: Riwayah,
  surahId: number,
  ayahInSurah: number,
  globalAyah: number | null,
): string[] {
  const s3 = String(surahId).padStart(3, '0');
  const a3 = String(ayahInSurah).padStart(3, '0');
  return RECITERS[riwayah].templates
    .map((t) =>
      t
        .replace('{s3}', s3)
        .replace('{a3}', a3)
        .replace('{g}', globalAyah != null ? String(globalAyah) : ''),
    )
    .filter((u) => !u.includes('//quran/audio') || globalAyah != null);
}
