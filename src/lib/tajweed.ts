// TAHQĪQ — محرِّك قواعد التجويد (رواية حفص عن عاصم من طريق الشاطبية)
//
// المرجع: الضبط المعتمد في المتون (تحفة الأطفال للجمزوري، المقدمة الجزريَّة)
// مع الاستناد إلى علامات المصحف العثماني نفسه (رسم مجمع الملك فهد عبر نسخة
// ar.quran-uthmani من AlQuran Cloud):
//   ۢ (U+06E2) ميم صغيرة فوق النون/التنوين  → علامة الإقلاب في المصحف
//   ۥ (U+06E5) واو صغيرة / ۦ (U+06E6) ياء صغيرة فوق هاء الضمير → علامة مد الصلة
//   ۤ (U+06E4) فوق الألف → همزٌ مبدَّل/مقرَّر (أَهۡوَاۤءَ، جَاۤءَ)
//   ࣰࣱࣲ (U+08F0–U+08F2) تنوين الفتح/الضم/الكسر في الرسم العثماني
//   ٰ (U+0670) ألف خنجرية (مد ألف)  ·  ۡ (U+06E1) سكون رأسي عثماني
//   ۖۗۚۛ (U+06D6–U+06DC) علامات الوقف → تُتجاوز وتُعرض كما هي
//
// يكتشف المحرِّك — لكل كلمة، مع سياق الكلمتين السابقة والتالية:
//   المدود: طبيعي · واجب متصل · جائز منفصل · بدل · لازم (كلمي مُثقَّل/مُخفَّف، حرفي فواتح)
//           · الصلة الصغرى/الكبرى · لين (وقفًا) · عارض للسكون (وقفًا) · العِوَض (وقفًا)
//   النون الساكنة والتنوين: إظهار حلقي · إدغام بغُنّة (ينمو) · إدغام بغير غُنّة (ل ر) · إقلاب (ب)
//           · إخفاء (١٥ حرفًا) · وداخل الكلمة الواحدة تُبنى أحكامُها على الحرف الذي يليها
//             (أَنتُم · مِنۡهَا · أُنزِلَ) — والمعوَّل على رسم المصحف: النون المدغَمة/المخفاة تُعرَّى
//             من السكون (مِّن لَّدُنۡهُ · مَن ذَا)، والمُحرَّكة لالتقاء الساكنين تُثبت حركتها
//             فلا حكمَ لها (مِنَ ٱللَّهِ · عَنِ ٱلۡمُنكَرِ) بل تُنطق ظاهرةً بحركتها
//   الميم الساكنة: إخفاء شفوي (ب) · إدغام متماثل صغير (م) · إظهار شفوي (باقي الحروف)
//           — داخل الكلمة وبين كلمتين
//   الغُنن: مدِّية (نّ/مّ مشددتان) · إخفاء · إدغام · إقلاب · شفوي · متماثل
//   القلقلة: صغرى (سكون أصلي وسط الكلمة) · كبرى (آخر الكلمة عند الوقف)
//   الراءات: مفخَّمة / مرقَّقة / يجوز فيها الوجهان (فِرۡقٍ ونظيرتها)
//   اللام: تعريف شمسية/قمرية · لفظ الجلالة مفخَّمة/مرقَّقة
//   التفخيم الذاتي لحروف الاستعلاء (خصّ ضغطٍ قِظْ)
// ويستنتج «الزمن النموذجي» لكل كلمة لمقارنته بالمُقاس وفق عتبة السماح τ.

import type { Riwayah, RuleBadge, Tempo, WordStatus, WordTajweed } from './types';
import { clamp } from './util';

/** مقياس زمن الحركة بحسب مرتبة القراءة — عدد حركات المدّ ثابت */
export const TEMPO_SCALE: Record<Tempo, number> = {
  hadr: 0.55,
  tadwir: 0.76,
  tartil: 1,
};

export const TEMPO_META: Record<Tempo, { label: string; hint: string }> = {
  hadr: { label: 'حدْر', hint: 'قراءة سريعة مع إتمام الأحكام — مناسبة للحفظ والمراجعة' },
  tadwir: { label: 'تدوير', hint: 'بين الحدر والترتيل — المرتبة الوسطى عند أهل الأداء' },
  tartil: { label: 'ترتيل', hint: 'قراءة متأنّية للتعليم؛ أوضح المدود والغنن' },
};

/* ------------------------------------------------------------------ */
/* الحركات والمحارف (مدروسة على الرسم العثماني)                        */
/* ------------------------------------------------------------------ */

const HARAKA_CLASSES =
  '\\u0640\\u064B-\\u0652\\u0653-\\u065F\\u0670\\u06D6-\\u06EF' +
  '\\u0883-\\u0885\\u0898-\\u089F\\u08A6\\u08AA-\\u08AF\\u08B2-\\u08B8' +
  '\\u08BA\\u08D3-\\u08D8\\u08E2-\\u08E5\\u08F0-\\u08FE';
const HARAKA_RE = new RegExp('[' + HARAKA_CLASSES + ']');
const HARAKAT_RE = new RegExp('[' + HARAKA_CLASSES + '\\u0640]', 'g');

/** إزالة كل الحركات والعلامات الزخرفية (آمنة على الرسم العثماني) */
export function stripTashkeel(s: string): string {
  return s.replace(HARAKAT_RE, '');
}

/** توحيد عربي للمقارنة/التجزئة (بلا تشكيل؛ توحيد الألف والياء والتاء المربوطة) */
export function normalizeArabic(s: string): string {
  return s
    .replace(HARAKAT_RE, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/[ىی]/g, 'ي') // ی فارسية والألف المقصورة → ي
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[\u200a\u2060\u200c\ufeff]/g, '')
    .replace(/[\u06DD\u06DE\u06E9]/g, ' ') // علامات المصحف (۝ ۞ ۩)
    .toLowerCase()
    .replace(/[^\u0600-\u06FFa-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/* ------------------------------------------------------------------ */
/* رموز الحركة                                                         */
/* ------------------------------------------------------------------ */

const FATHA = '\u064E';
const KASRA = '\u0650';
const DAMMA = '\u064F';
const SUKUN = '\u0652';
const TANF = '\u064B'; // تنوين فتح
const TANM = '\u064C'; // تنوين ضم
const TANH = '\u064D'; // تنوين كسر
const SHADDA = '\u0651';
const KARAKHAN = '\u0670'; // الألف الخنجرية (مد ألف)
const UT_SUKUN = '\u06E1'; // سكون عثماني رأسي
const UT_TANF = '\u08F0'; // تنوين فتح عثماني
const UT_TANMM = '\u08F1'; // تنوين ضم عثماني
const UT_TANKH = '\u08F2'; // تنوين كسر عثماني
const UT_HAMZA = '\u06E4'; // همزة افتراضية فوق الألف (همز مبدَّل)
const UT_QALB = '\u06E2'; // ميم صغيرة → علامة الإقلاب في المصحف
const UT_SILA_W = '\u06E5'; // واو صغيرة → صلة الضمة
const UT_SILA_Y = '\u06E6'; // ياء صغيرة → صلة الكسرة
const UT_MADDAH = '\u0653'; // مدّة (علامة فواتح/آ)

const SHORT = new Set([FATHA, KASRA, DAMMA]);
const TANWEE = new Set([TANF, TANM, TANH]);
const STOP_SIGN = /[\u06D6-\u06DC]/; // علامات الوقف (ۖۗۘۙۚۛۜ) — تُتجاوز
const SILENT_MARK = /[\u06DF\u06E0\u06E3\u06E7\u06E8\u065F]/; // علامات الصمت/الوقف المصغرة (۟ ۠ ۣ ۧ ۨ) — حرفها لا يُنطق بحركة

const HAMZA_CARRIERS = new Set(['أ', 'إ', 'ء', '\u0624', '\u0626']);
const QALQALA = new Set(['ق', 'ط', 'ب', 'ج', 'د']);
const ISTI_LA = new Set(['خ', 'ص', 'ض', 'ط', 'ظ', 'غ', 'ق']); // حروف الاستعلاء — مُفخَّمة دائمًا
const QAMARIYYA = new Set(['ب', 'ج', 'ح', 'خ', 'ع', 'غ', 'ف', 'ق', 'ك', 'م', 'ه', 'و', 'ي', 'ا', 'أ', 'إ', 'ء']);
const LAM_PREFIXES = ['و', 'ف', 'ب', 'ك', 'ل']; // حروف تتصل قبل (ال): وَال، فَال، بِال، كَال، لِل

/** حروف الإظهار الحلقي للنون الساكنة والتنوين: ء هـ ع ح غ خ */
const IZHAAR_HALQI = new Set(['ء', 'أ', 'إ', 'ه', 'ع', 'ح', 'غ', 'خ']);
/** حروف الإخفاء الخمسة عشر */
const IKHFA = new Set(['ت', 'ث', 'ج', 'د', 'ذ', 'ز', 'س', 'ش', 'ص', 'ض', 'ط', 'ظ', 'ف', 'ق', 'ك']);
/** يرملون: بغُنّة في (ينمو)، وبغير غُنّة في (ل ر) */
const IDGHAM_LA_RA = new Set(['ل', 'ر']);
const IDGHAM_GHUNNA = new Set(['ي', 'ن', 'م', 'و']);

/**
 * الكلمات الأربع التي لا يُدغم فيها لحفص نونٌ في الواو ولا في الياء — إذ لا إدغام
 * لنونٍ ساكنة في كلمةٍ واحدة — بل تُخفى النونُ بغُنّة: ٱلدُّنْيَا · بُنْيَان · قِنْوَان · صِنْوَان.
 */
const INNER_IKHFA_WORDS = new Set(['الدنيا', 'بنيان', 'قنوان', 'صنوان']);

/*
 * تنبيهٌ ضبطيّ مهم (لا كود هنا بعد الآن):
 *
 * في مثل «مِنَ ٱللَّهِ · مِنَ ٱلسَّمَآءِ · عَنِ ٱلۡمُنكَرِ · أَنِ ٱقۡتُلُوا۟ · يَكُنِ ٱلشَّيۡطَٰنُ» يظهر
 * آخرُ الكلمة بحركةٍ (فتحة أو كسرة) وإن كان ساكنًا في الأصل، وإنما حُرِّك لالتقاء الساكنين
 * حين سقطت همزة الوصل وصلًا. والنونُ المتحركةُ هذه **خارجةٌ عن أحكام النون الساكنة والتنوين**
 * (فتوى إسلام ويب ٣٣٩٩٠٧: «ينطق بها في حالة الوصل متحركة حركة كاملة… وبهذا تخرج عن أحكام
 * النون الساكنة والتنوين»)، فتُنطق ظاهرةً ولا تُدغَم ولا تُخفى: «مِنَ ٱلسَّمَآءِ» ← مِـنَـسْـسَمَاء.
 *
 * ويشهد له رسمُ المصحف نفسه: النونُ الساكنةُ إذا أُدغمت كُتبت بلا حركةٍ وجاء الحرفُ بعدها
 * مشدَّدًا «مِّن لَّدُنۡهُ» (١٨:٢) · «مِّن رَّبِّهِمۡ» (٢:٥)، وأمّا هذه فكُتبت بحركتها «مِنَ ٱللَّهِ» (٢:٦١).
 * فمن كتبها بلا حركةٍ فهو ساكنٌ (عليه الحكم)، ومن كتبها بحركةٍ فهو متحرّكٌ لا حكمَ له.
 */

/** فواتح السور المقطَّعة (فيها مد لازم حرفي) */
const FAWATIH = new Set([
  'الم', 'الر', 'المر', 'المص', 'كهيعص', 'حم', 'عسق', 'طه', 'طسم', 'طس', 'يس', 'ص', 'ق', 'ن',
]);

/** حروف الجر/العطف اللاصقة المؤثرة في لام الجلالة */
const ALLAH_PREFIXES = ['و', 'ف', 'ب', 'ك', 'ت'];

/* ------------------------------------------------------------------ */
/* فروق الروايتين: أزمنة المدود النموذجية (ملي ثانية)                  */
/* ------------------------------------------------------------------ */

/**
 * الزمن النموذجي لكل مدٍّ بحسب الرواية (حركة ≈ ١٧٥ م.ث في القراءة المرتَّلة):
 *   • بدل: حفص حركتان (٣٥٠) — ورش له ثلاثة أوجه: حركتان أو أربع أو ستّ،
 *     فاعتمدنا الوسط (٤ حركات ≈ ٧٠٠) ليكون أدنى الأوجه وأعلاها قريبًا من النافذة.
 *   • متصل ومنفصل: حفص أربع أو خمس (٧٠٠/٦٠٠) — ورش ستًّا مشبعًا (٩٠٠).
 *   • الصلة الكبرى: حفص ٤–٥ — ورش ستًّا. واللازم ستٌّ عندهما.
 */
/**
 * زمن الحركة الواحدة في مرتبة الترتيل بالملي ثانية.
 * كل زمنٍ في هذا الملف مشتقٌّ منه، فلا يُضبط حكمٌ بمعزل عن سواه:
 * الحركة القصيرة ≈ حركة واحدة، والمدُّ الطبيعي حركتان، والمتصل أربع/خمس،
 * واللازم ستٌّ — كما في تحفة الأطفال والجزريّة. ومقياس المرتبة (TEMPO_SCALE)
 * يقصّر الحركة لا عدد الحركات.
 */
export const HARAKA_MS = 260;

/** كل مدٍّ مقدَّرًا بعدد حركاته (لا بملي ثانية مطلقة) */
const MADD_HARAKAT: Record<Riwayah, Record<MaddKind, number>> = {
  hafs: {
    tabee: 2,
    badal: 2,
    muttasil: 4.5, // واجب متصل: ٤ أو ٥ حركات
    munfasil: 4, // جائز منفصل: ٤ أو ٥، وغالب عمل حفص ٤
    lazim: 6, // لازم كلمي/حرفي: ستّ حركات
    silaSughra: 2,
    silaKubra: 4,
    leen: 2,
    arid: 3, // عارض للسكون: ٢/٤/٦ وأوسطها ٣ عند التوسّط
    iwad: 2,
  },
  warsh: {
    tabee: 2,
    badal: 4, // لورش في البدل ثلاثة أوجه (٢/٤/٦) وأوسطها ٤
    muttasil: 6, // ورش يُشبع المتصل ستًّا
    munfasil: 6,
    lazim: 6,
    silaSughra: 2,
    silaKubra: 6,
    leen: 2,
    arid: 3,
    iwad: 2,
  },
};

/** الغُنّة حركتان في كل أحوالها */
const GHUNNA_HARAKAT = 2;

/** زمن ثابت لكل كلمة (بدء النطق وقطعه) فوق زمن مقاطعها */
const WORD_FIXED_MS = 70;
/** أدنى زمنٍ تُعطاه كلمة مهما قصرت */
const MIN_WORD_MS = 240;

const MADD_PROFILE: Record<Riwayah, Record<MaddKind, number>> = {
  hafs: Object.fromEntries(
    Object.entries(MADD_HARAKAT.hafs).map(([k, h]) => [k, Math.round(h * HARAKA_MS)]),
  ) as Record<MaddKind, number>,
  warsh: Object.fromEntries(
    Object.entries(MADD_HARAKAT.warsh).map(([k, h]) => [k, Math.round(h * HARAKA_MS)]),
  ) as Record<MaddKind, number>,
};

type MaddKind =
  | 'tabee'
  | 'badal'
  | 'muttasil'
  | 'munfasil'
  | 'lazim'
  | 'silaSughra'
  | 'silaKubra'
  | 'leen'
  | 'arid'
  | 'iwad';

/** كلمات تُفتح ألفها عند ورش وجوبًا (لا تقليل فيها) — بالصورة المجرَّدة */
const WARSH_FATH_ONLY = new Set([
  'الي', // إِلَى
  'علي', // عَلَى
  'حتي', // حَتَّى
  'لدي', // لَدَى
  'الربا',
  'ربا', // الرِّبَا
  'مرضات', // مَرْضَاتِ
  'كلاهما',
  'اوكلاهما', // أَوَكِلَاهُمَا
  'مازكي', // مَا زَكَى
  'مشكوه', // كَمِشْكَاةٍ
]);


/* ------------------------------------------------------------------ */
/* تجزئة الكلمة إلى محارف (حرف + علاماته)                               */
/* ------------------------------------------------------------------ */

interface Tok {
  ch: string; // الحرف الأساسي
  h: string; // الحركة الرئيسة (فتحة/كسرة/ضمة/سكون/تنوين) — '' عند غيابها
  sh: boolean; // مشدَّد
  hz: boolean; // ۤ همزة افتراضية فوق الألف (همز مبدَّل — علامة رسمية)
  hm: boolean; // ٔ/ٕ همزة حقيقية مرسومة على سطر/نبرة (تُنطق همزًا)
  qb: boolean; // ۢ علامة قلب (ميم صغيرة)
  sl: boolean; // ۥ/ۦ علامة مد الصلة
  kh: boolean; // ٰ ألف خنجرية (مد ألف على هذا الموضع)
}

function tokenize(word: string): Tok[] {
  const out: Tok[] = [];
  const last = () => out[out.length - 1];
  for (const c of word) {
    if (c >= '\u0600' && c <= '\u06D5' && !HARAKA_RE.test(c)) {
      out.push({ ch: c === '\u06CC' ? 'ي' : c, h: '', sh: false, hz: false, hm: false, qb: false, sl: false, kh: false });
    } else if (!out.length || c === '\u0640' || STOP_SIGN.test(c) || SILENT_MARK.test(c) || c === UT_MADDAH) {
      // تطويل + علامات الوقف + الصمت + مدَّة: لا أثر حكمي لها (حرفُها يبقى بلا حركة)
    } else if (c === SHADDA) {
      last().sh = true;
    } else if (c === '\u0654' || c === '\u0655') {
      // همزة حقيقية على نبرة/سطر — تُنطق همزًا (دَاۤىِٕمࣱ ← دَائِمࣱ).
      // إن كانت على ألف/ياء/واو بلا حركة فالنبرة نفسها هي همزة؛ وإلا نُضيف محرف همزة.
      if (last().h === '' && ['ا', 'ي', 'ى', 'و'].includes(last().ch)) {
        last().ch = 'ء';
        last().hm = true;
      } else {
        out.push({ ch: 'ء', h: '', sh: false, hz: false, hm: true, qb: false, sl: false, kh: false });
      }
    } else if (c === UT_SUKUN) {
      if (!last().h) last().h = SUKUN;
    } else if (c === UT_TANF) {
      if (!last().h) last().h = TANF;
    } else if (c === UT_TANMM) {
      if (!last().h) last().h = TANM;
    } else if (c === UT_TANKH) {
      if (!last().h) last().h = TANH;
    } else if (c === UT_HAMZA) {
      last().hz = true;
    } else if (c === UT_QALB) {
      last().qb = true;
    } else if (c === UT_SILA_W || c === UT_SILA_Y) {
      last().sl = true;
    } else if (c === KARAKHAN) {
      last().kh = true; // المد الألفي معلَّم على حامله (ٱلرَّحۡمَـٰنِ)
    } else if (HARAKA_RE.test(c)) {
      if (!last().h) last().h = c;
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* مساعدات حكمية                                                       */
/* ------------------------------------------------------------------ */

export type { RuleBadge };

const isSukun = (t: Tok | undefined): boolean => !!t && (t.h === '' || t.h === SUKUN);
const isTanween = (t: Tok | undefined): boolean => !!t && TANWEE.has(t.h);
const isHamzaCarrier = (t: Tok | undefined): boolean => !!t && HAMZA_CARRIERS.has(t.ch);
/** همزة تُنطق فعلًا: حرف همز صريح أو علامة همز على نبرة/سطر */
const isRealHamza = (t: Tok | undefined): boolean => !!t && (HAMZA_CARRIERS.has(t.ch) || t.hm);
/** ألف فارقة ختامية بعد واو الجماعة (فَعَلُوا۟، آمَنُوا): صامتة لا تُبنى عليها أحكام الختام */
const isSilentFinalAlef = (t: Tok | undefined, prev: Tok | undefined): boolean =>
  !!t && t.ch === 'ا' && t.h === '' && !t.kh && !!prev && prev.ch === 'و' && isSukun(prev);

/**
 * نوع المد إن كان toks[i] حرف مد صحيحًا:
 * ألف/ألف مقصورة بعد فتحة · واو ساكنة بعد ضمة · ياء ساكنة بعد كسرة · ألف خنجرية.
 * (وهذا يستثني ما ليس بمد: يَوۡمَ، عَلَيۡهِمۡ… إذ اشترط تجانس الحركة)
 */
function maddKindOf(toks: Tok[], i: number): 'alef' | 'waw' | 'ya' | null {
  const t = toks[i];
  if (!t || !t.ch) return null;
  if (t.kh) return 'alef';
  if (t.h !== '') return null; // حرف المد أصلًا ساكن بلا حركة
  const p = toks[i - 1];
  if (!p) return null;
  if (t.ch === 'ا' && p.h === FATHA) return 'alef';
  if (t.ch === 'ى' && p.h === FATHA) return 'alef';
  if (t.ch === 'و' && p.h === DAMMA) return 'waw';
  if (t.ch === 'ي' && p.h === KASRA) return 'ya';
  return null;
}

/** أول حرف أساسي من نص (يتجاوز العلامات، يوحِّد الياء الفارسية) */
function firstBaseLetter(word: string): string {
  for (const c of word) {
    if (c >= '\u0600' && c <= '\u06D5' && !HARAKA_RE.test(c)) return c === '\u06CC' ? 'ي' : c;
  }
  return '';
}

/**
 * أول حرفٍ أساسي من الكلمة التالية — يُبنى عليه حكمُ خاتمة الكلمة السابقة (نونًا كانت أو ميمًا).
 * ولا يُنظر عبر همزة الوصل (ٱ): فقد قُضي في analyzeWord أن خاتمةَ الكلمة قبلها لا حكمَ لها،
 * إذ يُحرَّك ساكنُها لالتقاء الساكنين فيُنطق ظاهرًا.
 */
export function ruleLetterOfNext(word: string): string {
  const t = tokenize(word);
  return t.length ? t[0].ch : '';
}

/** تبدأ الكلمة بهمزة قطع؟ (للمنفصل والصلة الكبرى) */
function startsWithHamza(word: string): boolean {
  return HAMZA_CARRIERS.has(firstBaseLetter(word));
}

/** آخر حركة ذات معنى من الكلمة السابقة (يُعتد بالساكن: يُنظر لما قبله) */
function prevVowelKind(prevToks: Tok[]): 'fatha' | 'damma' | 'kasra' | 'ya' | null {
  for (let i = prevToks.length - 1; i >= 0; i--) {
    const t = prevToks[i];
    if (SHORT.has(t.h)) {
      return t.h === KASRA ? 'kasra' : t.h === DAMMA ? 'damma' : 'fatha';
    }
    if (isSukun(t) && t.ch) {
      const b = prevToks[i - 1];
      if (t.ch === 'ي') return 'ya';
      if (b) return b.h === KASRA ? 'kasra' : b.h === DAMMA ? 'damma' : 'fatha';
      return null;
    }
  }
  return null;
}

function strippedBase(word: string): string {
  return normalizeArabic(word).replace(/\s/g, '');
}

/** ينتهي بتنوين فتح + ألف/ألف مقصورة؟ (فِرَارࣰا، هُدࣰى) */
function endsWithTanweenAlef(toks: Tok[]): boolean {
  const n = toks.length;
  for (let i = n - 1; i >= Math.max(0, n - 2); i--) {
    if (toks[i].h === TANF) {
      const after = toks[i + 1];
      return !!after && (after.ch === 'ا' || after.ch === 'ى') && after.h === '';
    }
  }
  return false;
}

/** يبدأ بلفظ الجلالة؟ (ٱللَّه، للَّه، وَٱللَّه، بِٱللَّه… وٱللَّهُمَّ) */
function allahStartIndex(toks: Tok[]): number {
  if (toks.length < 2) return -1;
  let i = 0;
  if (ALLAH_PREFIXES.includes(toks[0].ch) && toks.length >= 3) i = 1;
  const t0 = toks[i];
  const t1 = toks[i + 1];
  const t2 = toks[i + 2];
  const t3 = toks[i + 3];
  if ((t0.ch === 'ا' || t0.ch === '\u0671') && t1?.ch === 'ل' && t2?.ch === 'ل' && t3?.ch === 'ه') return i;
  if (t0.ch === 'ل' && t1?.ch === 'ل' && t1.sh && t2?.ch === 'ه') return i;
  return -1;
}

/** حركة ما قبل لام الجلالة (تقرِّر التفخيم/الترقيق) */
function allahPrefixVowel(toks: Tok[], prevToks: Tok[]): 'fatha' | 'damma' | 'kasra' | 'ya' | null {
  if (ALLAH_PREFIXES.includes(toks[0]?.ch ?? '') && SHORT.has(toks[0].h)) {
    return toks[0].h === KASRA ? 'kasra' : toks[0].h === DAMMA ? 'damma' : 'fatha';
  }
  if (toks[0]?.ch === 'ل' && toks[1]?.ch === 'ل' && toks[1].sh && SHORT.has(toks[0].h)) {
    return toks[0].h === KASRA ? 'kasra' : toks[0].h === DAMMA ? 'damma' : 'fatha';
  }
  return prevVowelKind(prevToks);
}

/** أحكام راء الكلمة — تُرجع شارة واحدة مُمثِّلة (الأهم) */
function raRule(toks: Tok[]): RuleBadge | null {
  const muraqqa = { label: 'راء مرقَّقة', tone: 'slate' as const, note: NOTE_RA_MURAQQA };
  const mufakkhama = { label: 'راء مفخَّمة', tone: 'slate' as const, note: NOTE_RA_MUFAKHKHAMA };
  const wajhan = { label: 'راء يجوز فيها الوجهان', tone: 'slate' as const, note: NOTE_RA_WAJHAN };
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (t.ch !== 'ر') continue;
    const prev = toks[i - 1];
    const next = toks[i + 1];
    const tanwin = isTanween(t);

    // بعد ياء ساكنة (خَيۡرࣱ، سَیِّرࣱ): كسرةٌ قبل الياء → ترقيق، وإلا فعند حفص يجوز الوجهان مع ترجيح الترقيق
    if (prev && prev.ch === 'ي' && isSukun(prev) && (isSukun(t) || tanwin)) {
      if (toks[i - 2]?.h === KASRA) return muraqqa;
      return wajhan;
    }
    // استعلاء حاجز بين الكسرة والراء (مِصۡرَۢ، إِصۡرࣱ) → يجوز الوجهان ولو تحرَّكت الراء (عند حفص)
    if (prev && ISTI_LA.has(prev.ch) && isSukun(prev) && toks[i - 2]?.h === KASRA) return wajhan;
    // متحركة بحركة قصيرة
    if (SHORT.has(t.h)) return t.h === KASRA ? muraqqa : mufakkhama;
    // منوَّنة: حركة التنوين حركةٌ موقوتة تُعامل كالقصيرة (ذُكۡرࣱ: مفخَّمة)
    if (tanwin) return t.h === TANH ? muraqqa : mufakkhama;
    if (isSukun(t) && prev) {
      // بعد همزة وصل مكسورة (ٱرۡجِعِي) → مرقَّقة (كسرة عارضة)
      if ((prev.ch === 'ا' || prev.ch === '\u0671') && prev.h === KASRA) return muraqqa;
      const kasraBefore = prev.h === KASRA || (isSukun(prev) && toks[i - 2]?.h === KASRA);
      if (kasraBefore) {
        // استعلاء بعد الراء مكسور الحركة (فِرۡقࣲ) → يجوز الوجهان
        if (next && ISTI_LA.has(next.ch) && (next.h === KASRA || next.h === TANH)) return wajhan;
        // استعلاء حاجز بين الكسرة والراء (مِصۡرَۢ) → يجوز الوجهان
        if (ISTI_LA.has(prev.ch) && isSukun(prev)) return wajhan;
        // وإلا فالكسرة الأصلية تُرقِّقها (فِرَارࣰا، قِرۡطَاسࣰ عند حفص)
        return muraqqa;
      }
      // ساكنة مسبوقة بفتح أو ضم (أو بساكن ليس قبله كسر) → مفخَّمة
      return mufakkhama;
    }
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* التحليل الرئيس                                                      */
/* ------------------------------------------------------------------ */

/** تحليل متسلسل: يُمرَّر سياق السابقة والتالية لكل كلمة */
export function analyzeWords(words: string[], riwayah: Riwayah = 'hafs', tempo: Tempo = 'tartil'): WordTajweed[] {
  return words.map((raw, i) =>
    analyzeWord(raw, i + 1 < words.length ? words[i + 1] : '', i > 0 ? words[i - 1] : '', riwayah, tempo),
  );
}

export function analyzeWord(
  raw: string,
  nextWord = '',
  prevWord = '',
  riwayah: Riwayah = 'hafs',
  tempo: Tempo = 'tartil',
): WordTajweed {
  const word = raw;
  const p = MADD_PROFILE[riwayah];
  const isWarsh = riwayah === 'warsh';
  const toks = tokenize(word);
  const prevToks = tokenize(prevWord);
  const n = toks.length;
  const stripped = strippedBase(word);

  const maddBadges: RuleBadge[] = [];
  const ghunnaBadges: RuleBadge[] = [];
  const otherBadges: RuleBadge[] = [];
  const madds: { label: string; ms: number }[] = [];
  const ghunnas: { label: string; ms: number }[] = [];
  let qalqalaMs = 0;

  const pushMadd = (kind: MaddKind, label: string) => {
    const ms = p[kind];
    madds.push({ label, ms });
    maddBadges.push({ label, tone: 'gold', note: maddNote(label, riwayah) });
  };
  const pushGhunna = (label: string, harakat: number = GHUNNA_HARAKAT) => {
    ghunnas.push({ label, ms: Math.round(harakat * HARAKA_MS) });
    ghunnaBadges.push({ label, tone: 'mint', note: GHUNNA_NOTES[label] ?? GHUNNA_NOTE });
  };

  // مقاطع تقريبية = الحركات القصيرة/التنوين + سكون ختامي
  const syllables =
    toks.reduce((a, t) => a + (SHORT.has(t.h) || TANWEE.has(t.h) ? 1 : 0), 0) +
    (n > 0 && !SHORT.has(toks[n - 1].h) && !TANWEE.has(toks[n - 1].h) ? 1 : 0);

  /* ==================== فواتح السور: مد لازم حرفي ==================== */
  const isFatiha =
    FAWATIH.has(stripped) && toks.length > 0 && toks.every((t) => !SHORT.has(t.h) && !TANWEE.has(t.h));
  if (isFatiha) pushMadd('lazim', 'مَدٌّ لَازِمٌ حَرْفِيّ');

  /* ==================== المدود (نقاط المد داخل الكلمة) ==================== */
  const nextHamza = startsWithHamza(nextWord);
  const trailingSilentAlef = isSilentFinalAlef(toks[n - 1], toks[n - 2]);

  for (let i = 0; i < n; i++) {
    if (!maddKindOf(toks, i)) continue;
    const next = toks[i + 1];
    const endsHere = i === n - 1 || (trailingSilentAlef && i === n - 2);
    const nextIsSilentAlef = trailingSilentAlef && i + 1 === n - 1;

    if (isFatiha) continue; // فواتح السور: يكفي اللازم الحرفي
    if (next && next.sh) {
      // لازم كلمي مُثقَّل: سكون أصلي مع شدة بعد المد (ٱلضَّاۤلِّينَ، ٱلۡحَاۤقَّةُ)
      pushMadd('lazim', 'مَدٌّ لَازِمٌ كَلِمِيٌّ مُثَقَّل');
    } else if (next && isSukun(next) && next.ch && !nextIsSilentAlef) {
      // لازم كلمي مُخفَّف: سكون أصلي غير مشدَّد بعد المد (ءَاۤلۡـَٔـٰنَ)
      pushMadd('lazim', 'مَدٌّ لَازِمٌ كَلِمِيٌّ مُخَفَّف');
    } else if (next && !nextIsSilentAlef && isRealHamza(next)) {
      // واجب متصل: همزٌ ملاصق لحرف المد في الكلمة (جَاۤءَ، ٱلسَّمَاۤءِ، دَاۤىِٕمࣱ)
      pushMadd('muttasil', 'مَدٌّ وَاجِبٌ مُتَّصِل');
    } else if (endsHere) {
      // ختامي: جائز منفصل إن بدأت التالية بهمزة قطع، وإلا فطبيعي
      if (nextHamza) {
        pushMadd('munfasil', 'مَدٌّ جَائِزٌ مُنْفَصِل');
        // إن كان المد بعد همزة اجتمع معه بدلٌ (دُعَاۤءِیۤ إِلَّا: للقارئ الوجهان)
        if (isRealHamza(toks[i - 1])) pushMadd('badal', 'مَدُّ الْبَدَل');
      } else if (isRealHamza(toks[i - 1])) {
        pushMadd('badal', 'مَدُّ الْبَدَل'); // البدل أخص من الطبيعي ختامًا (ءَامَنُوا۟)
      } else {
        pushMadd('tabee', 'مَدٌّ طَبِيعِي');
      }
    } else if (isRealHamza(toks[i - 1])) {
      // بدل: حرف المد جاء بعد همزة في غير ختام الكلمة (ءَامَنَ، إِيمَٰنَ)
      pushMadd('badal', 'مَدُّ الْبَدَل');
    } else {
      pushMadd('tabee', 'مَدٌّ طَبِيعِي');
    }
  }

  /* ==================== الصلة: هاء الضمير (بالعلامة أو بالبنية) ==================== */
  const lastTok = toks[n - 1];
  const beforeLast = toks[n - 2];
  const isAllah = n > 0 && allahStartIndex(toks) >= 0; // ≥0: لتشمل وَ/فَ/بِ/كَ/تَٱللَّه
  if (lastTok && lastTok.ch === 'ه' && !lastTok.sh && !isAllah) {
    const marked = lastTok.sl;
    const structural =
      isSukun(lastTok) &&
      !!beforeLast &&
      SHORT.has(beforeLast.h) &&
      !beforeLast.sh &&
      maddKindOf(toks, n - 2) === null &&
      beforeLast.ch !== 'ل';
    if (marked || structural) {
      if (nextHamza) pushMadd('silaKubra', 'مَدُّ الصِّلَة الْكُبْرَى');
      else if (nextWord || marked) pushMadd('silaSughra', 'مَدُّ الصِّلَة الصُّغْرَى');
    }
  }

  /* ==================== لين / عارض للسكون / العِوَض (أحكام الوقف) ==================== */
  // مد اللين: و/ي ساكنة مفتوح ما قبلها يليها حرف واحد يُسكَّن عند الوقف (خَوۡفٌ، بَيۡتٌ).
  // المفتوح لا يكون ياءً/واوًا (يَوۡمَ: لا لين — التحفة: «ولا لين في يوم لما تقدَّم»)
  if (n >= 3 && lastTok && !isFatiha) {
    const leen = toks[n - 2];
    const before = toks[n - 3];
    if (
      (leen.ch === 'و' || leen.ch === 'ي') &&
      isSukun(leen) &&
      !leen.sh &&
      !maddKindOf(toks, n - 2) &&
      !!before &&
      before.h === FATHA &&
      before.ch !== 'و' &&
      before.ch !== 'ي' &&
      (SHORT.has(lastTok.h) || isTanween(lastTok))
    ) {
      pushMadd('leen', 'مَدُّ اللِّين (عند الوقف)');
    }
  }
  if (
    n >= 2 &&
    lastTok &&
    (SHORT.has(lastTok.h) || (isTanween(lastTok) && !endsWithTanweenAlef(toks))) &&
    maddKindOf(toks, n - 2)
  ) {
    pushMadd('arid', 'مَدٌّ عَارِضٌ لِلسُّكُون (عند الوقف)');
  }
  if (!nextWord && endsWithTanweenAlef(toks)) {
    pushMadd('iwad', 'مَدُّ الْعِوَض (عند الوقف على التنوين)');
  }

  /* ==================== النون الساكنة والتنوين (بين كلمتين) ==================== */
  // النون الحاكمة: ن ساكنة ختامية غير مشددة، أو أي حرف عليه تنوين (الأصح: آخر واحد) أو علامة قلب ۢ
  let nunRuleIdx = -1;
  if (lastTok && lastTok.ch === 'ن' && isSukun(lastTok) && !lastTok.sh) nunRuleIdx = n - 1;
  // التنوين لا يكون إلا في آخر الكلمة (أو على ما قبل ألفٍ فارقة) — فيُلتقط أيَّ موضعٍ كان
  // (شَيۡـًٔا: التنوين على الياء لا على آخر محرفٍ من الكلمة).
  // أمّا علامة القلب ۢ فلا تُقبل بين كلمتين إلا على آخر حرفٍ في الكلمة (مِنۢ بَعۡدِ · حِلُّۢ بِهَٰذَا)؛
  // فإن وقعت على نونٍ داخلةٍ على الباء (أَنۢبِئۡهُمۡ · أَنۢبِئُهُم) فهي إقلابٌ داخل الكلمة تتولّاه كتلته.
  for (let i = 0; i < n; i++) {
    if (isTanween(toks[i])) nunRuleIdx = i;
    else if (toks[i].qb && i === n - 1) nunRuleIdx = i;
  }

  // همزة الوصل (ٱ) تسقط وصلًا، لكن إن ابتدأت الكلمةُ التالية بها فلا حكمَ على خاتمة الكلمة السابقة:
  // يُحرَّك ساكنُها لالتقاء الساكنين فيُنطق ظاهرًا بحركةٍ كاملة، ويُضبط ذلك في المصحف بالحركة نفسها
  // («هُمُ ٱلۡمُفۡلِحُونَ» · «مِنَ ٱللَّهِ» · «وَبِٱلۡیَوۡمِ ٱلۡـَٔاخِرِ»)، والتنوينُ يُكسَر
  // («خَیۡرًا ٱلۡوَصِیَّةُ» ← خَیۡرِنِ ٱلۡوَصِیَّة) — فخرجت بحركتها عن أحكام النون الساكنة والتنوين.
  // ولا يُوجد في المصحف ساكنٌ ختاميٌّ قبل همزة وصلٍ بغير حركة، فالرسمُ نفسه ناطقٌ بالحكم.
  const nextWasl = tokenize(nextWord)[0]?.ch === '\u0671';
  const fol = nextWasl ? '' : ruleLetterOfNext(nextWord);
  // ولا يُلتقط هنا نونٌ ظاهرةُ الحركة (مِنَ ٱللَّهِ · عَنِ ٱلۡمُنكَرِ · أَنِ ٱقۡتُلُوا۟): نونٌ خرجت
  // بحركتها عن أحكام النون الساكنة والتنوين فهي منطوقةٌ ظاهرة لا حكمَ لها فيما بعدها.
  // (وأما النون الساكنة التي رُسمت بلا حركةٍ وأُدغمت في لامٍ أو راءٍ مشدَّدتين مثل «مِّن لَّدُنۡهُ»
  // فتُلتقط من الشرط الأول: isSukun تقبل الحرفَ الخاليَ من الحركة.)
  if (nunRuleIdx >= 0 && fol) {
    const markedQalb = toks[nunRuleIdx].qb;
    if (markedQalb || fol === 'ب') {
      otherBadges.push({ label: 'إقلاب', tone: 'mint', note: NOTE_IQLAB });
      pushGhunna('غُنَّة الإقلاب');
    } else if (IZHAAR_HALQI.has(fol)) {
      otherBadges.push({ label: 'إظهار حلقي', tone: 'mint', note: NOTE_IZHAAR });
    } else if (IDGHAM_GHUNNA.has(fol)) {
      otherBadges.push({ label: 'إدغام بغُنّة', tone: 'mint', note: NOTE_IDGHAM_GHUNNA });
      pushGhunna('غُنَّة الإدغام');
    } else if (IDGHAM_LA_RA.has(fol)) {
      otherBadges.push({ label: 'إدغام بغير غُنّة', tone: 'mint', note: NOTE_IDGHAM_BILA });
    } else if (IKHFA.has(fol)) {
      otherBadges.push({ label: 'إخفاء', tone: 'mint', note: NOTE_IKHFA });
      pushGhunna('غُنَّة الإخفاء');
    }
  }

  /* ==================== غُنّة المشدَّدتين (نّ / مّ): غُنّة مدِّية ==================== */
  for (let i = 0; i < n; i++) {
    if ((toks[i].ch === 'ن' || toks[i].ch === 'م') && toks[i].sh) {
      pushGhunna('غُنّة مَدِّية');
      break;
    }
  }

  /* ==================== النون الساكنة داخل الكلمة ==================== */
  // النون الساكنة داخل الكلمة الواحدة تُبنى أحكامُها على الحرف الذي يليها مباشرةً:
  // ب ← إقلاب · حروف الحلق ← إظهار · الخمسة عشر ← إخفاء · (والواو والياء في الأربع كلمات ← إخفاء).
  for (let i = 0; i < n - 1; i++) {
    const t = toks[i];
    if (t.ch !== 'ن' || !isSukun(t) || t.sh) continue;
    const nx = toks[i + 1];
    const innerIkhfaNote = INNER_IKHFA_WORDS.has(stripped) ? NOTE_IKHFA_INNER_ONE : NOTE_IKHFA_INNER;
    if (nx.ch === 'ب' || t.qb || nx.qb) {
      // أُنۢبِئُهُمۡ: إقلاب داخل الكلمة — يؤكِّده قلم المصحف ۢ
      otherBadges.push({ label: 'إقلاب (داخل الكلمة)', tone: 'mint', note: NOTE_IQLAB_INNER });
      pushGhunna('غُنَّة الإقلاب');
    } else if (IZHAAR_HALQI.has(nx.ch)) {
      // أَنۡهَٰر · أَنۡعَمۡتَ · تَنۡحِتُونَ · ٱلۡمُنۡخَنِقَة · فَسَيُنۡغِضُونَ
      otherBadges.push({ label: 'إظهار داخل الكلمة', tone: 'slate', note: NOTE_IZHAAR_INNER });
    } else if (nx.ch === 'ي' || nx.ch === 'و') {
      // لا إدغام لنونٍ ساكنة في كلمةٍ واحدة عند حفص: تُخفى بغُنّة (ٱلدُّنۡیَا · بُنۡيَان · صِنۡوَان · قِنۡوَان)
      otherBadges.push({ label: 'إخفاء داخل الكلمة', tone: 'mint', note: innerIkhfaNote });
      pushGhunna('غُنَّة الإخفاء');
    } else if (IKHFA.has(nx.ch)) {
      // أَنتُم · مِنكُم · يُنفِقُونَ · أُنزِلَ · يَنظُرُونَ · عَنكَبُوتٌ: إخفاءٌ حقيقيّ داخل الكلمة
      otherBadges.push({ label: 'إخفاء داخل الكلمة', tone: 'mint', note: innerIkhfaNote });
      pushGhunna('غُنَّة الإخفاء');
    } else if (IDGHAM_LA_RA.has(nx.ch)) {
      // يُمكِن أن تقع اللام والراء بعد نونٍ ساكنة داخلةٍ على الكلمة (لا نظير لها في المصحف)
      otherBadges.push({ label: 'إدغام بغير غُنّة', tone: 'mint', note: NOTE_IDGHAM_BILA });
    } else {
      otherBadges.push({ label: 'إخفاء داخل الكلمة', tone: 'mint', note: innerIkhfaNote });
      pushGhunna('غُنَّة الإخفاء');
    }
    break; // نون داخلية واحدة تكفي
  }

  /* ==================== الميم الساكنة (ختامية بين كلمتين) ==================== */
  if (lastTok && lastTok.ch === 'م' && isSukun(lastTok) && !lastTok.sh && fol) {
    if (fol === 'ب') {
      otherBadges.push({ label: 'إخفاء شفوي', tone: 'mint', note: NOTE_IKHFA_SHAFAWI });
      pushGhunna('غُنَّة الإخفاء الشفوي');
    } else if (fol === 'م') {
      otherBadges.push({ label: 'إدغام متماثل صغير', tone: 'mint', note: NOTE_IDGHAM_MITHLAYN });
      pushGhunna('غُنَّة الإدغام');
    } else {
      otherBadges.push({ label: 'إظهار شفوي', tone: 'mint', note: NOTE_IZHAAR_SHAFAWI });
    }
  }

  /* ==================== الميم الساكنة داخل الكلمة ==================== */
  // كالميم الختامية: باءٌ ← إخفاء شفوي · ميمٌ ← إدغام متماثل · وما عداهما ← إظهار شفوي
  // (ٱلۡحَمۡدُ · أَمۡوَٰلُهُمۡ · أَنۡعَمۡتَ · يَمۡدُدۡكُمۡ).
  for (let i = 0; i < n - 1; i++) {
    const t = toks[i];
    if (t.ch !== 'م' || !isSukun(t) || t.sh) continue;
    const nx = toks[i + 1];
    if (nx.ch === 'ب') {
      otherBadges.push({ label: 'إخفاء شفوي', tone: 'mint', note: NOTE_IKHFA_SHAFAWI });
      pushGhunna('غُنَّة الإخفاء الشفوي');
    } else if (nx.ch === 'م') {
      otherBadges.push({ label: 'إدغام متماثل صغير', tone: 'mint', note: NOTE_IDGHAM_MITHLAYN });
      pushGhunna('غُنَّة الإدغام');
    } else {
      otherBadges.push({ label: 'إظهار شفوي', tone: 'mint', note: NOTE_IZHAAR_SHAFAWI });
    }
    break; // ميم داخلية واحدة تكفي
  }

  /* ==================== القلقلة ==================== */
  {
    // آخر حرف مؤثر: يتجاوز الألف التنوينية الصامتة (عَدࣰّا → الدال)
    let lastEff = n - 1;
    if (trailingSilentAlef && n >= 2 && isTanween(toks[n - 2])) lastEff = n - 2;
    let done = false;
    for (let i = 0; i < n && !done; i++) {
      const t = toks[i];
      if (!QALQALA.has(t.ch)) continue;
      if (i === lastEff) {
        // كبرى: آخر الكلمة يُسكَّن عند الوقف (ٱلۡفَلَقِ، عَدࣰّا، مُحِيطُۢ)
        otherBadges.push({ label: 'قَلْقَلَة كبرى (عند الوقف)', tone: 'gold', note: NOTE_QALQALA_KUBRA });
        qalqalaMs += 40;
        done = true;
      } else if (i < n - 1 && t.h === SUKUN && !t.sh) {
        // صغرى: سكون أصلي صريح في وسط الكلمة (ٱجۡعَلۡ)
        otherBadges.push({ label: 'قَلْقَلَة صغرى', tone: 'gold', note: NOTE_QALQALA_SUGHRA });
        qalqalaMs += 40;
        done = true;
      }
    }
  }

  /* ==================== الراءات ==================== */
  {
    const rb = raRule(toks);
    if (rb) otherBadges.push(rb);
  }

  /* ==================== اللام ==================== */
  if (isAllah) {
    const pv = allahPrefixVowel(toks, prevToks);
    if (pv === 'kasra' || pv === 'ya') {
      otherBadges.push({ label: 'لام الجلالة مرقَّقة', tone: 'slate', note: NOTE_LAM_ALLAH_TARQIQ });
    } else {
      otherBadges.push({ label: 'لام الجلالة مفخَّمة', tone: 'slate', note: NOTE_LAM_ALLAH_TAFKHIM });
    }
  } else if (n >= 3) {
    // لام التعريف: قد تسبقها عاطفة/جرّ متصلة (وَٱلۡعَصۡرِ، فَٱلِ، بِٱلۡحَقِّ، كَٱلۡحَبِّ)
    const pos = LAM_PREFIXES.includes(toks[0].ch) ? 1 : 0;
    const t0 = toks[pos];
    const l0 = toks[pos + 1];
    const follow = toks[pos + 2];
    if (t0 && (t0.ch === 'ا' || t0.ch === '\u0671') && l0 && l0.ch === 'ل' && follow?.ch) {
      // الشمسية في رسم المصحف: الحرف بعد اللام مشدَّد (ٱلنَّاس) ولو لم يُرسم سكون على اللام
      if (follow.sh) otherBadges.push({ label: 'لاَم شمسيّة', tone: 'slate', note: NOTE_LAM_SHAMS });
      else if (isSukun(l0) && QAMARIYYA.has(follow.ch)) otherBadges.push({ label: 'لاَم قَمَريّة', tone: 'slate', note: NOTE_LAM_QAMAR });
      else if (isSukun(l0)) otherBadges.push({ label: 'لاَم شمسيّة', tone: 'slate', note: NOTE_LAM_SHAMS });
    }
  }

  /* ==================== التفخيم الذاتي لحروف الاستعلاء ==================== */
  for (const t of toks) {
    if (ISTI_LA.has(t.ch) && (SHORT.has(t.h) || isTanween(t) || (t.h === SUKUN && t.sh))) {
      otherBadges.push({ label: 'حرف استعلاء (تفخيم)', tone: 'slate', note: NOTE_ISTILA });
      break;
    }
  }

  /* ==================== فروق رواية ورش عن نافع (من طريق الأزرق) ==================== */
  if (isWarsh) {
    // ١) النَّقْل: حركة الهمزة تنتقل إلى الساكن الصحيح المنفصل قبلها وتسقط الهمزة
    //    (مِنْ آمَنَ ← مِنَامَن)، ولا يُنقل إلى حرف مدٍّ ولا لين.
    if (startsWithHamza(nextWord) && n > 0) {
      const last = toks[n - 1];
      const isSakinConsonant =
        !!last &&
        !!last.ch &&
        !['ا', 'ى', 'و', 'ي'].includes(last.ch) &&
        !last.sh &&
        !TANWEE.has(last.h) &&
        (last.h === SUKUN || last.h === '') &&
        maddKindOf(toks, n - 1) === null &&
        !isSilentFinalAlef(last, toks[n - 2]);
      if (isSakinConsonant) {
        otherBadges.push({ label: 'نَقْل حركة الهمزة', tone: 'slate', note: NOTE_WARSH_NAQL });
      }
    }

    // ٢) إبدال الهمز الساكن حرفَ مدٍّ من جنس حركة ما قبله (يَأْكُلُ ← يَاكُلُ، يُؤْمِنُ ← يُومِنُ،
    //    الذِّئْبُ ← الذِّيبُ) — ويُترك على الأصل إن جاء بعده حرف مدّ.
    for (let i = 1; i + 1 < n; i++) {
      const t = toks[i];
      if (!isRealHamza(t) || !isSukun(t)) continue;
      const before = toks[i - 1];
      if (!before || !SHORT.has(before.h)) continue;
      // يُترك على الأصل إن جاء بعد الهمزة حرف علّة (نحو: مَأْوَى) أو همزةٌ أخرى،
      // وكذلك الهمزة المتطرّفة (نحو: ٱقۡرَأۡ) فحكمها حكم الوقف لا الإبدال.
      const after = toks[i + 1];
      if (!after?.ch || ['ا', 'و', 'ي', 'ى'].includes(after.ch) || isRealHamza(after)) continue;
      otherBadges.push({ label: 'إبدال الهمز الساكن', tone: 'mint', note: NOTE_WARSH_IBDAL });
      break;
    }

    // ٣) الهمزتان في كلمة: يحقّق ورش الأولى ويسهّل الثانية (أو يبدلها حرف مدّ من طريق الأزرق)
    for (let i = 0; i + 1 < n; i++) {
      if (isRealHamza(toks[i]) && isRealHamza(toks[i + 1])) {
        otherBadges.push({ label: 'الهمزتان في كلمة', tone: 'mint', note: NOTE_WARSH_HAMZATAIN });
        break;
      }
    }

    // ٤) تقليل ذوات الياء: كل ألفٍ انقلبت عن ياء أو رُسمت بها (هُدَى، مُوسَى، تَقْوَى، ٱشْتَرَى)
    const lastW = toks[n - 1];
    if (!!lastW && lastW.ch === 'ى' && lastW.h === '' && !WARSH_FATH_ONLY.has(stripped)) {
      otherBadges.push({ label: 'تقليل ذوات الياء', tone: 'slate', note: NOTE_WARSH_IMALA_YA });
    }

    // ٥) تقليل ذوات الراء: الألف التي قبل راءٍ مكسورة (ٱلنَّارِ، ٱلدَّارِ، ٱلْأَبْرَارِ، أَبْصَارِهِمْ)
    for (let i = 0; i + 1 < n; i++) {
      if (toks[i].ch === 'ا' && toks[i + 1].ch === 'ر' && toks[i + 1].h === KASRA) {
        otherBadges.push({ label: 'تقليل ذوات الراء', tone: 'slate', note: NOTE_WARSH_IMALA_RA });
        break;
      }
    }
  }

  /* ==================== النتيجة ==================== */
  // الترتيب مقصود: أحكامُ النون والميم والقلقلة واللام أوّلًا، ثم الغنن، ثم المدود.
  // الواجهة تقتصر على أول ثلاثة شارات (RuleBadges max=3 وجدول النتائج rules.slice(0, 3))،
  // فلو تأخّر حكمُ التجويد لابتلعته المدودُ الطويلةُ — وهو أصل شكوى «الحكم لا يظهر في الأحكام».
  // وتُزال الشارات المتطابقة بالاسم: للكلمة أحيانًا موضعان بالحكم نفسه (ميمٌ ساكنةٌ أوّلية
  // وأخرى ختامية مثلًا) فلا يُعرض الحكم مرّتين — والزمن محسوبٌ في مadds/ghunnas لا هنا.
  const ruleSeen = new Set<string>();
  const rules = [...otherBadges, ...ghunnaBadges, ...maddBadges].filter((b) =>
    ruleSeen.has(b.label) ? false : (ruleSeen.add(b.label), true),
  );
  const isMadd = madds.length > 0;
  const maddType = isMadd ? madds[0].label : null;
  const isGhunna = ghunnas.length > 0;
  const ghunnaType = isGhunna ? ghunnas[0].label : null;

  const scale = TEMPO_SCALE[tempo] ?? 1;
  // مقطعٌ قصير ≈ حركة، وعليه ثابتُ انطلاقٍ لبداية الكلمة ونهايتها
  let expectedMs = WORD_FIXED_MS + HARAKA_MS * Math.max(1, syllables);
  // سقفٌ يجمع مدود الكلمة الواحدة بلا مبالغة (أطولها لازمٌ بستّ حركات)
  expectedMs += Math.min(8 * HARAKA_MS, madds.reduce((a, m) => a + m.ms, 0));
  expectedMs += Math.min(4 * HARAKA_MS, ghunnas.reduce((a, g) => a + g.ms, 0));
  expectedMs += qalqalaMs;
  expectedMs = Math.max(Math.round(MIN_WORD_MS * scale), Math.round(expectedMs * scale));

  return { word, syllables, isMadd, maddType, isGhunna, ghunnaType, rules, expectedMs };
}

/* ------------------------------------------------------------------ */
/* الأزمنة والتصنيف                                                    */
/* ------------------------------------------------------------------ */

/** نافذة السماح: τ=0 → ±60% (مُيسَّر) · τ=1 → ±15% (صارم) */
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

/* ------------------------------------------------------------------ */
/* شروح موجزة موثوقة لكل حكم (تظهر للمتعلِّم في «دليل الأحكام»)       */
/* ------------------------------------------------------------------ */

const NOTE_IQLAB =
  'إذا جاء بعد النون الساكنة أو التنوين حرفُ باء قُلبت ميمًا مخفاةً بغُنّة (مِنۢ بَعۡدِ، عَلِيمُۢ بِمَا) — ويعلِّمها المصحف بميم صغيرة ۢ.';
const NOTE_IQLAB_INNER = 'قُلبت النون الساكنة ميمًا قبل الباء داخل الكلمة وخُفيت بغُنّة (أُنۢبِئُهُمۡ)، كما علَّمه المصحف بالميم الصغيرة.';
const NOTE_IZHAAR =
  'إذا جاء بعد النون الساكنة أو التنوين أحدُ حروف الحلق الستة (ء هـ ع ح غ خ) ظُهِّرت النونُ جهرًا بلا غُنّة.';
const NOTE_IDGHAM_GHUNNA =
  'إذا جاء بعد النون الساكنة أو التنوين أحدُ حروف (ي ن م و) أُدغمت فيه بحرف واحد مشدَّد مع غُنّة بمقدار حركتين.';
const NOTE_IDGHAM_BILA =
  'إذا جاء بعد النون الساكنة أو التنوين لامٌ أو راءٌ أُدغمت فيه كاملًا بلا غُنّة؛ ويُعرف في رسم المصحف بأن تُكتب النون بلا حركة ويُشدَّد الحرفُ بعدها: «مِّن لَّدُنۡهُ».';
const NOTE_IKHFA =
  'إذا جاء بعد النون الساكنة أو التنوين أحدُ الحروف الخمسة عشر الباقية خُفيت بين الإظهار والإدغام مع غُنّة بحركتين.';
const NOTE_IKHFA_SHAFAWI =
  'الميم الساكنة إذا جاء بعدها باء خُفيت خفاءً شفويًّا مع غُنّة بحركتين — داخل الكلمة وبين كلمتين (تَرۡمِيهِم بِحِجَارَةٍ · ٱرۡكَب مَّعَنَا).';
const NOTE_IDGHAM_MITHLAYN =
  'الميم الساكنة إذا جاء بعدها ميم أُدغمت فيها إدغامَ متماثلين صغيرًا مع غُنّة (لَهُم مَّا يَشَآءُ · لَهُم مِّنۡهُ).';
const NOTE_IZHAAR_SHAFAWI =
  'الميم الساكنة تُظهر عند جميع الحروف عدا الباء والميم — داخل الكلمة وبين كلمتين (ٱلۡحَمۡدُ · أَمۡوَٰلُهُمۡ · عَلَيۡهِمۡ وَلِيࣲّ).';
const NOTE_IKHFA_INNER =
  'إذا جاء بعد النون الساكنة داخل الكلمة الواحدة حرفٌ من حروف الإخفاء الخمسة عشر (ت ث ج د ذ ز س ش ص ض ط ظ ف ق ك) خُفيت بغُنّة بحركتين، نحو: أَنتُم · مِنكُم · يُنفِقُونَ · أُنزِلَ · يَنظُرُونَ · عَنكَبُوتٍ.';
const NOTE_IKHFA_INNER_ONE =
  'في (ٱلدُّنۡیَا · بُنۡيَان · صِنۡوَان · قِنۡوَان) لا يُدغم لحفص نونٌ في الواو ولا في الياء؛ إذ لا إدغام لنونٍ ساكنة في كلمةٍ واحدة، فتُخفى النونُ بغُنّةٍ بحركتين.';
const NOTE_IZHAAR_INNER =
  'النون الساكنة داخل الكلمة تُظهر إذا جاء بعدها حرفٌ من حروف الحلق (ء هـ ع ح غ خ)، نحو: مِنۡهَا · أَنۡعَمۡتَ · تَنۡحِتُونَ · وَٱلۡمُنۡخَنِقَة · فَسَيُنۡغِضُونَ.';
const NOTE_QALQALA_KUBRA = 'إذا وقف على حرف قلقلة (قطب جدَّ) قُلقل قويةً ظاهرة؛ وتزداد ظهورًا في المشدَّد (ٱلۡفَلَقِ، جَدࣲّ).';
const NOTE_QALQALA_SUGHRA = 'حرف قلقلة ساكن سكونًا أصليًّا في وسط الكلمة؛ يُقلقل برفق أثناء الوصل (ٱجۡعَلۡ).';
const NOTE_RA_MUFAKHKHAMA = 'الراء تُفخَّم إذا كانت مفتوحة أو مضمومة، أو ساكنة مسبوقة بفتح أو ضم — ومرتبة الفتح أعلاها.';
const NOTE_RA_MURAQQA = 'الراء تُرقَّق إذا كانت مكسورة، أو ساكنة مسبوقة بكسرة أصلية لم يفصل عنها حرف استعلاء.';
const NOTE_RA_WAJHAN =
  'يجوز فيها التفخيم والترقيق وصلًا (فِرۡقٍ، خَيۡرࣱ، مِصۡرَۢ): فمَن فخَّم اعتدَّ بحرف الاستعلاء أو الياء المفتوح ما قبلها، ومَن رقَّق اعتبر الكسرة — والترقيق أولى عند حفص، ووقفًا بالسكون فَالتفخيم.';
const NOTE_LAM_ALLAH_TAFKHIM = 'لام لفظ الجلالة تُفخَّم إذا كان ما قبلها مفتوحًا أو مضمومًا (قَالُواْ ٱللَّهَ، عَبۡدُ ٱللَّهِ).';
const NOTE_LAM_ALLAH_TARQIQ = 'لام لفظ الجلالة تُرقَّق إذا كان ما قبلها مكسورًا (بِسۡمِ ٱللَّهِ) أو سبِق بياء ساكنة (خَيۡرُ ٱللَّهِ).';
const NOTE_LAM_QAMAR = 'لام التعريف قبل حرف قمري (أ ب ج ح خ ع غ ف ق ك م هـ و ي): تُقرأ ساكنة ظاهرة.';
const NOTE_LAM_SHAMS =
  'لام التعريف قبل حرف شمسي (ت ث د ذ ر ز س ش ص ض ط ظ ل ن) تُدغم فيه ويُشدَّد الحرف (ٱلشَّهۡر، ٱلنَّاس). والغُنّة بعد إدغام اللام في النون هي غُنّة النون المشدَّدة، لا إدغام نونٍ ساكنة في ما بعدها.';
const NOTE_ISTILA = 'حروف الاستعلاء (خُصَّ ضَغْطٍ قِظْ) مفخَّمة دائمًا: يُرفع بها أقصى اللسان عند النطق.';
const GHUNNA_NOTE =
  'الغُنّة صوت يخرج من الخيشوم مقداره حركتان، وهي في هذا الموضع لازمة عند جميع القرّاء بلا خلاف بين الروايات (تحفة الأطفال والمقدمة الجزرية).';
const GHUNNA_NOTES: Record<string, string> = {
  'غُنّة مَدِّية':
    'كل نون أو ميم مشدَّدة في القرآن تُغَنّ أكملَ ما تكون الغنّة بمقدار حركتين، عند جميع القرّاء بلا استثناء. قال الجمزوري في التحفة: «وغُنَّ ميمًا ثم نونًا شُدِّدا / وسمِّ كلاً حرفَ غنّةٍ بدا»، وقال ابن الجزري: «وأظهِرِ الغنّةَ من نونٍ ومن / ميمٍ إذا ما شُدِّدا». والحكم عام في نحو إِنَّ وثُمَّ والنَّاس والجَنَّة، لا يختصّ برواية ولا بكلمة. والنون هنا متحرّكة مشدَّدة وليست ساكنة، فلا إدغام لها ولا إخفاء في الحرف بعدها (والفاء حرف إخفاء للنون الساكنة لا حرف إدغام).',
};

/* ------------------------------------------------------------------ */
/* فروق رواية ورش: شروح موجزة                                          */
/* ------------------------------------------------------------------ */

const NOTE_WARSH_NAQL =
  'النَّقْل من خصائص ورش: ينقل حركة الهمزة إلى الساكن الصحيح المنفصل قبلها ثم تسقط الهمزة، نحو «مِنْ آمَنَ» تُقرأ «مِنَامَن» — ولا يُنقل إلى حرف مدٍّ أو لين.';
const NOTE_WARSH_IBDAL =
  'يُبدل ورش الهمزة الساكنة حرفَ مدٍّ من جنس حركة ما قبلها: يَأْكُلُ ← يَاكُلُ، يُؤْمِنُ ← يُومِنُ، ٱلذِّئْبُ ← ٱلذِّيبُ — وحفص يحقّق الهمزة.';
const NOTE_WARSH_HAMZATAIN =
  'الهمزتان في كلمة (ءَأَنذَرْتَهُم): يُحقّق ورش الأولى ويسهّل الثانية بين بين، أو يُبدلها حرف مدٍّ من طريق الأزرق — وحفص يحقّقهما معًا.';
const NOTE_WARSH_IMALA_YA =
  'لورش في الألف المنقلبة عن ياء — أو المرسومة بها — وجهان: الفتح والتقليل، والتقليل مقدَّم أداءً (ٱلْهُدَى، مُوسَى، تَقْوَى، ٱشْتَرَى)، ويُفتح ما كان من نحو: إِلَى، عَلَى، حَتَّى، لَدَى، ٱلرِّبَا.';
const NOTE_WARSH_IMALA_RA =
  'الألف الواقعة قبل راءٍ مكسورة يُقلّلها ورش قولًا واحدًا (ٱلنَّارِ، ٱلدَّارِ، ٱلْأَبْرَارِ، أَبْصَارِهِمْ)، وفي (ٱلْجَارِ، ٱلْجَبَّارِينَ) له الفتح والتقليل مع تغليظ اللام.';

/** أحكام لا تظهر إلا في رواية ورش (تُوسَم في الواجهة «خاصة بورش») */
export const WARSH_ONLY_RULES = [
  'نَقْل حركة الهمزة',
  'إبدال الهمز الساكن',
  'الهمزتان في كلمة',
  'تقليل ذوات الياء',
  'تقليل ذوات الراء',
];

const WARSH_MADD_NOTES: Record<string, string> = {
  'مَدُّ الْبَدَل':
    'جاء حرف المد بعد همزة (ءَامَنُواْ، إِيمَٰنࣱ)؛ ولورش فيه ثلاثة أوجه: حركتان أو أربع أو ستّ، وحفص يقصره حركتين.',
  'مَدٌّ وَاجِبٌ مُتَّصِل': 'همزٌ بعد حرف المد في الكلمة نفسها (جَاۤءَ)؛ يمدّه ورش ستّ حركات مشبعةً، وحفص أربعًا أو خمسًا.',
  'مَدٌّ جَائِزٌ مُنْفَصِل': 'انتهت الكلمة بمدٍّ وجاء همزٌ في أول التي بعدها (هُوَ أَكۡرَمَ)؛ يمدّه ورش ستًّا، وحفص أربعًا أو خمسًا.',
  'مَدُّ الصِّلَة الْكُبْرَى': 'هاء ضمير جاء بعدها همز قطع (عَهۡدَهُۥۤ أَمۡ)؛ يمدّها ورش ستًّا، وحفص أربعًا أو خمسًا.',
};

/** شرح المدّ بحسب الرواية (الفروق في البدل والمتصل والمنفصل والصلة الكبرى) */
function maddNote(label: string, riwayah: Riwayah): string | undefined {
  if (riwayah === 'warsh') {
    const w = WARSH_MADD_NOTES[label];
    if (w) return w;
  }
  return MADD_NOTES[label];
}

const MADD_NOTES: Record<string, string> = {
  'مَدٌّ طَبِيعِي': 'يُمدّ بمقدار حركتين عند خلوّه من الهمز والسكون بعده (قَالَ، ٱلۡعَـٰلَمِينَ).',
  'مَدٌّ وَاجِبٌ مُتَّصِل': 'جاء بعد حرف المد همزٌ في الكلمة نفسها (جَاۤءَ، ٱلسَّمَاۤءِ)؛ يُمدّ أربع أو خمس حركات وجوبًا.',
  'مَدٌّ جَائِزٌ مُنْفَصِل': 'انتهت الكلمة بمد وجاء همز في أول التي بعدها (هُوَ أَكۡرَمَ)؛ لحفص يجوز مده أربع أو خمس حركات.',
  'مَدُّ الْبَدَل': 'جاء حرف المد بعد همزة (ءَامَنُواْ، إِيمَٰنࣱ)؛ يُقصر عند حفص حركتين.',
  'مَدٌّ لَازِمٌ كَلِمِيٌّ مُثَقَّل': 'بعد حرف المد سكون أصلي مع شِدَّة في كلمة (ٱلضَّاۤلِّينَ، ٱلۡحَاۤقَّةُ)؛ يُمدّ ست حركات لزومًا.',
  'مَدٌّ لَازِمٌ كَلِمِيٌّ مُخَفَّف': 'بعد حرف المد سكون أصلي غير مشدَّد في كلمة (ءَالۡـَٰنَ)؛ يُمدّ ست حركات لزومًا.',
  'مَدٌّ لَازِمٌ حَرْفِيّ': 'في الحروف المقطَّعة فواتح السور: يُمدّ ما كان من (نقصِ عسلك) وميمًا ستَّ حركات (الٓمٓ، يسٓ).',
  'مَدُّ الصِّلَة الصُّغْرَى': 'هاء ضمير بين متحركين لم يلها همز؛ تُمدّ حركتين وصلًا (بِهِۦ مِنَ) — وتعلِّمها المصحف بـ ۥ واوًا للضمة و ۦ ياءً للكسرة.',
  'مَدُّ الصِّلَة الْكُبْرَى': 'هاء ضمير جاء بعدها همز قطع (عَهۡدَهُۥۤ أَمۡ)؛ تُمدّ أربع أو خمس حركات.',
  'مَدُّ اللِّين (عند الوقف)': 'واو أو ياء ساكنة قبلها فتحة إذا وقف عليها (خَوۡفٍ، بَيۡتٍ)؛ يجوز قصره وتوسطه وإشباعه.',
  'مَدٌّ عَارِضٌ لِلسُّكُون (عند الوقف)':
    'وقفٌ على كلمة سُكِّن آخرها عارضًا وقبله مد أصلي (ٱلۡمُسۡتَقِيمَ، ٱلۡعَـٰلَمِينَ)؛ يجوز مدّه اثنتين أو أربعًا أو ستًّا.',
  'مَدُّ الْعِوَض (عند الوقف على التنوين)': 'إذا وقف على اسم منوَّن بالفتح عوِّض عن التنوين ألف تُمدّ حركتين (عَلِيمًا، فِرَارࣰا).',
};

/** فهرس شرح كل حكم — يُستخدم في «دليل الأحكام» بشاشة النتيجة */
export const RULE_GLOSSARY: Record<string, string> = {
  ...MADD_NOTES,
  'غُنّة مَدِّية': GHUNNA_NOTES['غُنّة مَدِّية'],
  'غُنَّة الإخفاء': GHUNNA_NOTE,
  'غُنَّة الإدغام': GHUNNA_NOTE,
  'غُنَّة الإقلاب': GHUNNA_NOTE,
  'غُنَّة الإخفاء الشفوي': GHUNNA_NOTE,
  إقلاب: NOTE_IQLAB,
  'إقلاب (داخل الكلمة)': NOTE_IQLAB_INNER,
  'إظهار حلقي': NOTE_IZHAAR,
  'إدغام بغُنّة': NOTE_IDGHAM_GHUNNA,
  'إدغام بغير غُنّة': NOTE_IDGHAM_BILA,
  إخفاء: NOTE_IKHFA,
  'إخفاء شفوي': NOTE_IKHFA_SHAFAWI,
  'إدغام متماثل صغير': NOTE_IDGHAM_MITHLAYN,
  'إظهار شفوي': NOTE_IZHAAR_SHAFAWI,
  'إظهار داخل الكلمة': NOTE_IZHAAR_INNER,
  'إخفاء داخل الكلمة': NOTE_IKHFA_INNER,
  'قَلْقَلَة كبرى (عند الوقف)': NOTE_QALQALA_KUBRA,
  'قَلْقَلَة صغرى': NOTE_QALQALA_SUGHRA,
  'راء مفخَّمة': NOTE_RA_MUFAKHKHAMA,
  'راء مرقَّقة': NOTE_RA_MURAQQA,
  'راء يجوز فيها الوجهان': NOTE_RA_WAJHAN,
  'لاَم قَمَريّة': NOTE_LAM_QAMAR,
  'لاَم شمسيّة': NOTE_LAM_SHAMS,
  'لام الجلالة مفخَّمة': NOTE_LAM_ALLAH_TAFKHIM,
  'لام الجلالة مرقَّقة': NOTE_LAM_ALLAH_TARQIQ,
  'حرف استعلاء (تفخيم)': NOTE_ISTILA,
  'نَقْل حركة الهمزة': NOTE_WARSH_NAQL,
  'إبدال الهمز الساكن': NOTE_WARSH_IBDAL,
  'الهمزتان في كلمة': NOTE_WARSH_HAMZATAIN,
  'تقليل ذوات الياء': NOTE_WARSH_IMALA_YA,
  'تقليل ذوات الراء': NOTE_WARSH_IMALA_RA,
};
