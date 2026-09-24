// TAHQĪQ — shared domain types

export type ModelSize = 'tiny' | 'base';
export type EngineId = 'whisper-attn' | 'whisper-ts' | 'whisper-energy' | 'offline-dtw';
export type ModelStatus = 'idle' | 'loading' | 'ready' | 'error';

/** الرواية المقروء بها — لكل رواية أصولُها في المدود والهمز والإمالة */
export type Riwayah = 'hafs' | 'warsh';

/**
 * مراتب القراءة الثلاثة المعروفة عند أهل الأداء (النشر لابن الجزري):
 * الترتيل أتمّها بيانًا، ثم التدوير، ثم الحدر أسرعها مع بقاء الأحكام.
 * تتغيّر مدة الحركة لا عدد الحركات.
 */
export type Tempo = 'hadr' | 'tadwir' | 'tartil';

/** الوضع اللوني: ليلي (افتراضي) أو نهاري */
export type ThemeMode = 'night' | 'day';

export type AppTab = 'practice' | 'settings' | 'result' | 'progress';

/** درجة «جيد» فأعلى تُعدّ اجتيازًا للآية ويُفتح ما بعدها */
export const PASS_SCORE = 70;

/** كلمة في الجلسة الحية: حكمها اللحظي أثناء القراءة */
/** read: تقدّم عليها الضوء (انتهى صوتها) وحكمُها قيد التريّث */
export type LiveWordStatus = WordStatus | 'pending' | 'current' | 'read';

export interface LiveWordResult {
  index: number;
  status: WordStatus;
  measuredMs: number;
  expectedMs: number;
}

export interface LiveAlert {
  index: number;
  word: string;
  title: string;
  action: string;
  tone: 'warn' | 'danger' | 'mint';
  at: number;
}

/** لقطة لحظية للمرافقة الحية تُعرض أثناء التسجيل */
export interface LiveSnapshot {
  cursor: number; // فهرس الكلمة الجارية (-1 قبل البدء)
  started: boolean; // سُمع صوت أول كلمة؟
  doneCount: number;
  violations: number;
  okCount: number;
  /** كم كلمة تقدّم بها الضوء على تقدير النموذج (بلا سكتةٍ ولا انخفاض صوت) */
  estimatedCount: number;
  /** لكل كلمة: حالتها وزمنها المقيس، ومقدارها ونافذة أوجهها بعدلة السرعة الجارية (لشريطها تحتها) */
  words: { status: LiveWordStatus; measuredMs: number; boundary?: string; expectedMs?: number; minMs?: number; maxMs?: number }[];
  currentVoicedMs: number;
  currentExpectedMs: number;
  /** نافذة الأوجه الجائزة للكلمة الجارية (قصْر/توسّط/إشباع حيث جازت) */
  currentMinMs: number;
  currentMaxMs: number;
  /** مَطُّ المدّ اللازم المتسامَح فيه للكلمة الجارية (0 إن لم يكن فيها لازم) */
  currentStretchMs?: number;
  /** مقدار الكلمة الجارية بالحركات — يُعرض للمتعلِّم مع الزمن */
  currentHarakat: number;
  stalledMs: number; // صمتٌ منذ آخر صوت (بعد البدء)
  lastAlert: LiveAlert | null;
  /** كيف أُقفلت آخر كلمة: سكتة/انخفاض/تقدير نموذج/تجاوز */
  lastBoundary: 'gap' | 'dip' | 'model' | 'timeout' | null;
  finished: boolean;
  /** مجموع الزمن المصوّت منذ البدء (م.ث) */
  voicedMs: number;
  /** جُمّدت المرافقة: تبيّن أن المقروء ليس نصّ الآية */
  frozen: boolean;
  /** القارئ في البسملة التي ابتدأ بها قبل الآية (ليست من الآية ولا تُحسب) */
  inPrefix: boolean;
}

/**
 * التحقّق اللحظي من النصّ أثناء المرافقة الحية (بالسماع الذكي في الخلفية):
 *   off        السماع الذكي غير جاهز — يُتحقَّق بعد الإيقاف
 *   checking   لم يُسمع بعدُ ما يكفي للحكم
 *   same       ما سُمع حتى الآن من هذه الآية
 *   unsure     بين بين (سماعٌ مضطرب)
 *   warn       ما سُمع لا يشبه الآية — إنذارٌ أول
 *   other      تأكّد: المقروء ليس نصّ الآية — جُمّدت المرافقة
 */
export interface LiveTextCheck {
  status: 'off' | 'checking' | 'same' | 'unsure' | 'warn' | 'other';
  /** عدد الكلمات المسموعة حتى الآن */
  heard: number;
  /** نسبة المسموع الذي من الآية */
  precision: number;
  /** آخر نصٍّ سُمع (للعرض) */
  text: string;
  /**
   * ماذا يشبه المسموع؟ (من مطابقة المصحف كلّه)
   *   target  نصّ الآية المختارة
   *   quran   آيةٌ أخرى (تُذكر في otherLabel)
   *   speech  كلامٌ عاديٌّ ليس من القرآن
   *   unknown غير بيّن
   */
  kind?: 'target' | 'quran' | 'speech' | 'unknown';
  /** إن كان آيةً أخرى: مسماها («سورة الفاتحة — الآية ٥») */
  otherLabel?: string;
}

/** مقارنة كلمة من تلاوة المستخدم بنظيرتها عند القارئ المعتمد */
export interface ReciterWordCompare {
  index: number;
  word: string;
  userMs: number;
  refMs: number;
  scaledRefMs: number; // زمن القارئ بعد تعديله بسرعة المستخدم
  sim: number; // 0..1
  /** اتجاه المخالفة إن خرجت الكلمة عن نسق القارئ: أقصر/أطول/لم تُسمع */
  dir?: 'ok' | 'short' | 'long' | 'silent';
}

/** نتيجة التحكيم: مقارنة تلاوة المستخدم بتلاوة القارئ المعتمد */
export interface ReciterCompare {
  refLabel: string; // اسم القارئ المرجعي
  matchPct: number; // 0..100
  passed: boolean;
  scale: number; // سرعة المستخدم نسبة إلى القارئ (المطبَّقة بعد الترجيح والحدود)
  /** سرعة المستخدم الخام نسبةً إلى القارئ (قبل الترجيح والحدود) */
  rawScale?: number;
  /** الآية قصيرة أو كلماتها مدودٌ لازمة: قُورنت أزمنتها بأزمنة القارئ كما هي تقريبًا */
  anchored?: boolean;
  perWord: ReciterWordCompare[];
  note?: string;
}

/** أزمنة القارئ المعتمد المخزَّنة مرجعًا لكل آية وقارئ */
export interface RefAlignment {
  label: string;
  /** معرّف القارئ (reciter.ts) */
  reciterId?: string;
  /** full: قيس بالسماع الذكي · fast: بقياس الصوت وحده (يُرقّى متى جُهِّز السماع) */
  quality?: 'full' | 'fast';
  durationMs: number;
  score: number; // درجة القارئ على قياس التطبيق نفسه
  words: { startMs: number; endMs: number }[];
}

export interface SurahMeta {
  id: number;
  name: string;
  englishName: string;
  englishNameTranslation: string;
  revelationType: string; // 'Meccan' | 'Medinan'
  numberOfAyahs: number;
}

export interface Ayah {
  number: number;
  numberInSurah: number;
  text: string; // Uthmani text with full tashkeel
}

export interface SurahData {
  id: number;
  meta: SurahMeta;
  ayahs: Ayah[];
}

export interface RuleBadge {
  label: string;
  tone: 'gold' | 'mint' | 'slate';
  note?: string; // شرح موجز موثوق للحكم (يظهر في التلميح و«دليل الأحكام»)
}

export interface WordTajweed {
  word: string;
  syllables: number;
  isMadd: boolean;
  maddType: string | null; // أول حكم مد مكتشف (للعرض المختصر)
  isGhunna: boolean;
  ghunnaType: string | null; // أول حكم غُنّة مكتشف (للعرض المختصر)
  rules: RuleBadge[]; // كل الأحكام المكتشفة (مدود أولًا، ثم غُنن، ثم أحكام الحروف)
  expectedMs: number; // model expected duration for tajweed timing
  /**
   * نافذة الأوجه الجائزة لزمن الكلمة (بالملي ثانية): من قرأ بالقصر أو التوسط
   * أو الإشباع حيث جازت لم يُخطَّأ. وتساوي expectedMs حين لا أوجه للكلمة.
   */
  minMs: number;
  maxMs: number;
  /**
   * أعلى زمنٍ يُتسامح فيه قبل الحكم بالطول — للمدّ اللازم وحده (والفواتح منه):
   * القرّاء المعتمدون يمدّونه أطول من ستّ حركاتِ مقطعٍ بسرعتهم، فلا يُخطَّأ من
   * حاكاهم. (الحدّ الأدنى باقٍ ستَّ حركات: فمن قصّر أُخذ به.)
   */
  stretchMs?: number;
  /**
   * وزنُ الكلمة في تقدير سرعة القارئ (٠..١): المدود اللازمة والفواتح وما فيه
   * أوجهٌ واسعة أو وقف لا تصلح «مسطرةً» للسرعة — فهي موضع الامتحان نفسه.
   */
  rulerWeight?: number;
  /** مقدار الكلمة بالحركات (وحدة القياس في التجويد) — للعرض التعليمي */
  harakat: number;
  /** الكلمة في موضع وقفٍ (آخر الآية/المقطع) — تُحسب فيها أحكام الوقف */
  atWaqf?: boolean;
  /** من فواتح السور (تُهجَّى بأسماء حروفها: الٓمٓ ← أَلِفْ لَامْ مِيمْ) */
  fatiha?: boolean;
}

export type WordStatus = 'excellent' | 'ok' | 'short' | 'long' | 'silent';

export interface WordAlignment {
  index: number;
  ayah: number;
  word: string;
  startMs: number;
  endMs: number;
  confidence: number; // 0..1
  status: WordStatus;
  tajweed: WordTajweed;
  /**
   * هل تبيّن لفظُ الكلمة في المسموع (بالسماع الذكي)؟ false: استمع فلم يسمعها
   * (أُسقطت أو أُبدلت، أو المقروء ليس الآية) — فلا يُحكم على زمنها «جيدًا».
   * غيرُ معرَّف: لم يُستمع بالألفاظ (نتيجةٌ لحظية) أو عرضٌ تجريبي.
   */
  textHeard?: boolean;
}

export interface CoachTip {
  index: number;
  word: string;
  status: WordStatus;
  title: string;
  action: string;
}

export interface AyahRecord {
  bestScore: number;
  lastScore: number;
  passed: boolean;
  at: number;
}

export type TextCheck = 'ok' | 'weak' | 'mismatch' | 'unverified' | 'demo';

export interface AlignmentResult {
  targetKey: string;
  targetLabel: string;
  engine: EngineId;
  transcript: string;
  transcriptMatch: number; // 0..1 — درجة مطابقة النصّ (F1 على الكلمات) أو تغطية الصوت
  matchSource: 'transcript' | 'coverage' | 'demo';
  predWords: { word: string; ok: boolean; prefix?: boolean }[];
  /**
   * بوّابة النصّ — هل قُرئت **هذه** الآية؟
   *   ok         تبيّن نصّ الآية في المسموع (يجوز الاجتياز)
   *   weak       تبيّن بعضُه فقط (نصفُ آية، أو سماعٌ رديء) — لا اجتياز
   *   mismatch   المسموع بعيدٌ عن الآية (كلامٌ آخر أو آيةٌ أخرى) — لا اجتياز
   *   unverified لم يُستمع بالألفاظ (نتيجةٌ لحظية، أو تعذّر السماع الذكي) — لا اجتياز
   *   demo       عرضٌ تجريبي
   */
  textCheck: TextCheck;
  /** نسبة كلمات الآية التي سُمعت / نسبة المسموع الذي من الآية (عند السماع بالألفاظ) */
  textRecall?: number;
  textPrecision?: number;
  /**
   * ماذا يشبه المسموع؟ (بمطابقة المصحف كلّه، لا الآية وحدها)
   *   target  نصّ الآية المختارة
   *   quran   آيةٌ أخرى — تُذكر في heardOf
   *   speech  كلامٌ عاديٌّ ليس من القرآن
   *   unknown غير بيّن (لم يُسمع بالألفاظ، أو التبس الأمر)
   */
  textKind?: 'target' | 'quran' | 'speech' | 'unknown';
  /** أقرب آيةٍ أخرى إلى المسموع إن كان «آيةً أخرى» */
  heardOf?: { surahId: number; surahName: string; ayah: number; match: number };
  overallScore: number; // 0..100
  verdict: string;
  durationMs: number;
  words: WordAlignment[];
  demo: boolean;
  createdAt: number;
  audioUrl: string | null;
  samples: Float32Array | null;
  tempo: Tempo;
  /**
   * سرعة القارئ الفعلية نسبةً إلى مرتبته المختارة (وسيط نِسَب أزمنة كلماته).
   * تُضرب فيها أزمنة النموذج قبل الحكم، فلا يُعاقَب القارئ على مرتبته بل على
   * خروجه عن نسق الأحكام داخل تلاوته.
   */
  tempoScale: number;
  /**
   * سرعة القارئ الخام نسبةً إلى القارئ المرجعي (١ = بسرعته). تُعرض في الملاحظة
   * وتدخل في الدرجة قليلًا؛ ولا تُطبَّق كما هي — المطبَّق tempoScale المحدود.
   */
  tempoRelative?: number;
  /** غلب المرجعُ على تقدير السرعة (آيةٌ قصيرة أو كلماتها مدودٌ لازمة) */
  tempoAnchored?: boolean;
  /** القارئ المرجعي الذي قِيس إليه هذا التحليل (مسطرة السرعة) */
  reference?: { id: string; name: string; pace: number | null };
  tips: CoachTip[];
  summary: string;
  passed: boolean;
  /** التحكيم بالقارئ المعتمد — يُملأ عند توافر مرجعٍ للآية */
  reciter?: ReciterCompare;
  /** اجتياز الدرجة الذاتية وحدها (قبل ضمّ مطابقة القارئ) — ليُعاد الضمّ متى تغيّر المرجع */
  selfPassed?: boolean;
  /** هذه النتيجة هي التي فتحت الآية في التقدّم (فيُسحب الفتح إن خالفها مرجعٌ جاء بعدها) */
  progressGranted?: boolean;
  /**
   * نتيجةٌ لحظية (قياس الصوت وحده بلا سماع ذكي): تظهر فور إيقاف التسجيل،
   * ثم يُستأنف التحليل الأدقّ في الخلفية إن كان السماع الذكي مُجهَّزًا.
   */
  instant?: boolean;
}

export interface TargetSpec {
  key: string;
  label: string;
  words: { word: string; ayah: number }[];
}

export interface ModelEvent {
  status: 'loading' | 'ready' | 'error';
  progress?: number;
  message?: string;
}
