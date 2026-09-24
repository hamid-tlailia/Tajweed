// TAHQĪQ — القرّاء المعتمدون: مرجع كل تحليل
//
// كل تحليلٍ للتلاوة يُقاس إلى **قارئٍ معتمد** — ولو لم يختر المستخدم شيخًا:
// يُختار تلقائيًّا بحسب الرواية ومرتبة القراءة (حدر/تدوير/ترتيل) ونوع التلاوة
// (مرتَّل/مجوَّد)، ويُحفظ اختيار المستخدم إن اختار غيره.
//
// للقارئ المرجعي أثران:
//   ١) «مسطرة السرعة» — دائمًا، وبلا إنترنت: سرعته المقيسة (pace) هي مركز عدلة
//      السرعة في التحليل الكامل والمرافقة الحية (انظر tempo.ts)؛ فالآية القصيرة
//      (الٓمٓ · طه · يسٓ) تُقاس إلى سرعته لا إلى نفسها.
//   ٢) «التحكيم كلمةً كلمة» — متى أمكن الاتصال: يُجلب صوتُه للآية نفسها تلقائيًّا
//      ويُقاس بمحرّك التطبيق، ثم تُقارن به أزمنةُ كلمات المستخدم.
//
// سرعات القرّاء (pace) مقيسةٌ لا مقدَّرة: وسيطٌ مرجَّح لنسبة (زمن الكلمة عند القارئ
// ÷ زمنها في نموذج الترتيل بهذا المحرّك) على نحو ٥٠–١٠٠ ألف كلمة لكل قارئ من
// أزمنة كلمات تلاواتهم في Quran.com — والطريقة قابلةٌ للإعادة:
// scripts/calibrate-reciters.ts. (١ = نموذج الترتيل؛ الحدر في النموذج ٠٫٥٥،
// والتدوير ٠٫٧٦.) ومن لم يُقَس له أثرٌ بعدُ (قرّاء ورش) فسرعته null: يُقاس إلى
// نموذج المرتبة نفسه.
//
// صيغة الأسماء في أرشيف everyayah: SSSAAA.mp3 (رقم السورة ثم رقم الآية بثلاث خانات).

import type { Riwayah, SurahMeta, Tempo } from './types';

/** نوع التلاوة المرجعية */
export type RecitationStyle = 'murattal' | 'mujawwad';

export const STYLE_META: Record<RecitationStyle, { label: string; hint: string }> = {
  murattal: { label: 'مرتَّل', hint: 'تلاوة التعليم والصلاة — يُختار القارئ بحسب مرتبتك (حدر/تدوير/ترتيل)' },
  mujawwad: { label: 'مجوَّد', hint: 'تلاوة التحقيق والتطريب — أبطأ المراتب (نحو ١٫٥ من نموذج الترتيل)' },
};

export interface ReciterProfile {
  id: string;
  /** الاسم كما يظهر للمستخدم */
  name: string;
  riwayah: Riwayah;
  style: RecitationStyle;
  /** المراتب التي يُختار لها تلقائيًّا */
  autoFor: Tempo[];
  /** سرعته نسبةً إلى نموذج الترتيل (مقيسة)، أو null إن لم تُقس */
  pace: number | null;
  /** قوالب الروابط: {s3} السورة · {a3} الآية · {g} رقم الآية في المصحف كاملًا */
  templates: string[];
}

export const RECITER_LIST: ReciterProfile[] = [
  // ——— حفص عن عاصم · مرتَّل ———
  {
    id: 'sudais',
    name: 'عبد الرحمن السديس',
    riwayah: 'hafs',
    style: 'murattal',
    autoFor: ['hadr'],
    pace: 0.65,
    templates: [
      'https://everyayah.com/data/Abdurrahmaan_As-Sudais_192kbps/{s3}{a3}.mp3',
      'https://everyayah.com/data/Abdurrahmaan_As-Sudais_64kbps/{s3}{a3}.mp3',
    ],
  },
  {
    id: 'shatri',
    name: 'أبو بكر الشاطري',
    riwayah: 'hafs',
    style: 'murattal',
    autoFor: [],
    pace: 0.69,
    templates: [
      'https://everyayah.com/data/Abu_Bakr_Ash-Shaatree_128kbps/{s3}{a3}.mp3',
      'https://everyayah.com/data/Abu_Bakr_Ash-Shaatree_64kbps/{s3}{a3}.mp3',
    ],
  },
  {
    id: 'rifai',
    name: 'هاني الرفاعي',
    riwayah: 'hafs',
    style: 'murattal',
    autoFor: [],
    pace: 0.78,
    templates: [
      'https://everyayah.com/data/Hani_Rifai_192kbps/{s3}{a3}.mp3',
      'https://everyayah.com/data/Hani_Rifai_64kbps/{s3}{a3}.mp3',
    ],
  },
  {
    id: 'alafasy',
    name: 'مشاري العفاسي',
    riwayah: 'hafs',
    style: 'murattal',
    autoFor: ['tadwir'],
    pace: 0.81,
    templates: [
      'https://everyayah.com/data/Alafasy_128kbps/{s3}{a3}.mp3',
      'https://cdn.islamic.network/quran/audio/128/ar.alafasy/{g}.mp3',
    ],
  },
  {
    id: 'abdulbasit',
    name: 'عبد الباسط عبد الصمد (مرتَّل)',
    riwayah: 'hafs',
    style: 'murattal',
    autoFor: [],
    pace: 0.92,
    templates: [
      'https://everyayah.com/data/Abdul_Basit_Murattal_192kbps/{s3}{a3}.mp3',
      'https://everyayah.com/data/Abdul_Basit_Murattal_64kbps/{s3}{a3}.mp3',
    ],
  },
  {
    id: 'husary',
    name: 'محمود خليل الحصري',
    riwayah: 'hafs',
    style: 'murattal',
    autoFor: ['tartil'],
    pace: 1.19,
    templates: [
      'https://everyayah.com/data/Husary_128kbps/{s3}{a3}.mp3',
      'https://everyayah.com/data/Husary_64kbps/{s3}{a3}.mp3',
    ],
  },
  // ——— حفص عن عاصم · مجوَّد ———
  {
    id: 'abdulbasit-mujawwad',
    name: 'عبد الباسط عبد الصمد (مجوَّد)',
    riwayah: 'hafs',
    style: 'mujawwad',
    autoFor: ['hadr', 'tadwir', 'tartil'],
    pace: 1.49,
    templates: ['https://everyayah.com/data/Abdul_Basit_Mujawwad_128kbps/{s3}{a3}.mp3'],
  },
  {
    id: 'minshawi-mujawwad',
    name: 'محمد صديق المنشاوي (مجوَّد)',
    riwayah: 'hafs',
    style: 'mujawwad',
    autoFor: [],
    pace: 1.51,
    templates: [
      'https://everyayah.com/data/Minshawy_Mujawwad_192kbps/{s3}{a3}.mp3',
      'https://everyayah.com/data/Minshawy_Mujawwad_64kbps/{s3}{a3}.mp3',
    ],
  },
  // ——— ورش عن نافع (من طريق الأزرق) · مرتَّل ———
  // (مسارها في الأرشيف تحت data/warsh/ — وكان الرابط القديم يُسقط هذا الجزء فلا يُجلب شيء)
  {
    id: 'yassin-warsh',
    name: 'ياسين الجزائري',
    riwayah: 'warsh',
    style: 'murattal',
    autoFor: ['hadr', 'tadwir'],
    pace: null,
    templates: ['https://everyayah.com/data/warsh/warsh_yassin_al_jazaery_64kbps/{s3}{a3}.mp3'],
  },
  {
    id: 'dosary-warsh',
    name: 'إبراهيم الدوسري',
    riwayah: 'warsh',
    style: 'murattal',
    autoFor: ['tartil'],
    pace: null,
    templates: ['https://everyayah.com/data/warsh/warsh_ibrahim_aldosary_128kbps/{s3}{a3}.mp3'],
  },
  {
    id: 'abdulbasit-warsh',
    name: 'عبد الباسط عبد الصمد (ورش)',
    riwayah: 'warsh',
    style: 'murattal',
    autoFor: [],
    pace: null,
    templates: [
      'https://everyayah.com/data/warsh/warsh_Abdul_Basit_128kbps/{s3}{a3}.mp3',
      // بعض آياته مفقودة في الأرشيف: يُجرَّب قارئٌ آخر من الرواية نفسها بدلًا منها
      'https://everyayah.com/data/warsh/warsh_ibrahim_aldosary_128kbps/{s3}{a3}.mp3',
    ],
  },
];

const BY_ID = new Map(RECITER_LIST.map((r) => [r.id, r]));

export function reciterById(id: string | null | undefined): ReciterProfile | null {
  return (id && BY_ID.get(id)) || null;
}

/** القرّاء المتاحون لرواية (ونوعٍ إن حُدِّد) */
export function recitersFor(riwayah: Riwayah, style?: RecitationStyle): ReciterProfile[] {
  return RECITER_LIST.filter((r) => r.riwayah === riwayah && (!style || r.style === style));
}

/** الأنواع المتاحة لرواية (ورش: مرتَّل وحده) */
export function stylesFor(riwayah: Riwayah): RecitationStyle[] {
  return (['murattal', 'mujawwad'] as RecitationStyle[]).filter((s) => recitersFor(riwayah, s).length > 0);
}

/**
 * القارئ المرجعي التلقائي: بحسب الرواية والمرتبة ونوع التلاوة. يُقدَّم من نُصّ على
 * أنه مرجعُ هذه المرتبة (autoFor)، ثم أقربُهم سرعةً إلى نموذج المرتبة.
 */
export function autoReciter(riwayah: Riwayah, tempo: Tempo, style: RecitationStyle = 'murattal'): ReciterProfile {
  const pool = recitersFor(riwayah, style);
  const list = pool.length ? pool : recitersFor(riwayah);
  const named = list.find((r) => r.autoFor.includes(tempo));
  if (named) return named;
  const nominal = tempo === 'hadr' ? 0.55 : tempo === 'tadwir' ? 0.76 : 1;
  const measured = list.filter((r) => r.pace != null);
  if (measured.length) {
    return measured.reduce((a, b) =>
      Math.abs(Math.log((b.pace as number) / nominal)) < Math.abs(Math.log((a.pace as number) / nominal)) ? b : a,
    );
  }
  return list[0] ?? RECITER_LIST[0];
}

/**
 * القارئ المرجعي الفعلي: ما اختاره المستخدم (إن كان من روايته ونوعه)، وإلا فالتلقائي.
 * @param choice معرّف القارئ أو 'auto'
 */
export function resolveReciter(
  riwayah: Riwayah,
  tempo: Tempo,
  style: RecitationStyle = 'murattal',
  choice: string = 'auto',
): { reciter: ReciterProfile; auto: boolean } {
  const picked = choice !== 'auto' ? reciterById(choice) : null;
  if (picked && picked.riwayah === riwayah) return { reciter: picked, auto: false };
  return { reciter: autoReciter(riwayah, tempo, style), auto: true };
}

/** رقم الآية في المصحف كاملًا (١..٦٢٣٦) كما تحتاجه بعض مكتبات الصوت */
export function globalAyahNumber(surahs: SurahMeta[], surahId: number, ayahInSurah: number): number | null {
  if (!surahs?.length || surahs.length < 114) return null;
  let total = 0;
  for (const s of surahs) {
    if (s.id === surahId) return total + ayahInSurah;
    total += s.numberOfAyahs || 0;
  }
  return null;
}

/** كل روابط الآية الممكنة لقارئ بالترتيب (يُجرَّب الأول ثم ما بعده) */
export function ayahAudioUrls(
  reciter: ReciterProfile,
  surahId: number,
  ayahInSurah: number,
  globalAyah: number | null,
): string[] {
  const s3 = String(surahId).padStart(3, '0');
  const a3 = String(ayahInSurah).padStart(3, '0');
  return reciter.templates
    .filter((t) => !t.includes('{g}') || globalAyah != null)
    .map((t) =>
      t
        .replace('{s3}', s3)
        .replace('{a3}', a3)
        .replace('{g}', globalAyah != null ? String(globalAyah) : ''),
    );
}

/**
 * جلب صوت القارئ المعتمد لآية — عبر وسيط خادمنا (/api/reciter/ayah) لا مباشرةً
 * من الموقع الأصلي، فيعمل التقييم دون مشكلات CORS عند أي مصدر، ولا يُرسَل من
 * صوت المستخدم شيء (هذه الميزة تنزيلٌ فقط وتحتاج إنترنت).
 */
export async function fetchReciterBlob(reciterId: string, surahId: number, ayahInSurah: number): Promise<Blob> {
  const q = new URLSearchParams({
    reciter: reciterId,
    surah: String(surahId),
    ayah: String(ayahInSurah),
  });
  const res = await fetch(`/api/reciter/ayah?${q.toString()}`).catch(() => {
    throw new Error('OFFLINE');
  });
  if (!res.ok) {
    throw new Error('OFFLINE');
  }
  const blob = await res.blob();
  if (!blob.size) throw new Error('OFFLINE');
  return blob;
}
