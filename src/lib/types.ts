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
export type LiveWordStatus = WordStatus | 'pending' | 'current';

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
  words: { status: LiveWordStatus; measuredMs: number }[];
  currentVoicedMs: number;
  currentExpectedMs: number;
  stalledMs: number; // صمتٌ منذ آخر صوت (بعد البدء)
  lastAlert: LiveAlert | null;
  finished: boolean;
}

/** مقارنة كلمة من تلاوة المستخدم بنظيرتها عند القارئ المعتمد */
export interface ReciterWordCompare {
  index: number;
  word: string;
  userMs: number;
  refMs: number;
  scaledRefMs: number; // زمن القارئ بعد تعديله بسرعة المستخدم
  sim: number; // 0..1
}

/** نتيجة التحكيم: مقارنة تلاوة المستخدم بتلاوة القارئ المعتمد */
export interface ReciterCompare {
  refLabel: string; // اسم القارئ المرجعي
  matchPct: number; // 0..100
  passed: boolean;
  scale: number; // سرعة المستخدم نسبة إلى القارئ
  perWord: ReciterWordCompare[];
  note?: string;
}

/** أزمنة القارئ المعتمد المخزَّنة مرجعًا لكل آية/رواية/مرتبة */
export interface RefAlignment {
  label: string;
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

export interface AlignmentResult {
  targetKey: string;
  targetLabel: string;
  engine: EngineId;
  transcript: string;
  transcriptMatch: number; // 0..1 — captured target words ratio
  matchSource: 'transcript' | 'coverage' | 'demo';
  predWords: { word: string; ok: boolean }[];
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
  tips: CoachTip[];
  summary: string;
  passed: boolean;
  /** التحكيم بالقارئ المعتمد — يُملأ عند توافر مرجعٍ للآية */
  reciter?: ReciterCompare;
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
