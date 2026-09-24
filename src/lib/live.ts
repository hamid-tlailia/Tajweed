// TAHQĪQ — المرافقة الحية: تتبّع لحظي لتلاوتك أثناء القراءة
//
// ============================ لماذا أُعيد بناؤها ============================
// الإصدار الأول كان يفصل بين الكلمات بالسكتة وحدها (١٥٠ م.ث من الصمت)،
// والتلاوةُ الصحيحة **متصلةٌ** في أصلها: فلا سكتة بين الكلمات إلا ما شاء
// الله. فكان المتتبِّع ينتظر سكتةً لا تأتي، ولا يتقدّم إلا بعد ثوانٍ — ولهذا
// كان القارئ «يقرأ كلمةً كلمة».
//
// ============================== البنية الجديدة ==============================
// المتتبِّع لم يعد يُخمِّن حدًّا واحدًا في كل مرة، بل **يُطابِق مطابقةً جارية**:
//
//   ١) يجمع من تيار الطاقة «إشارات حدّ» (cues): سكتةٌ قصيرة، أو انخفاضٌ بيّن
//      في الطاقة (أثرُ الحرف الذي تُبتدأ به الكلمة التالية)، أو — إن مضى من
//      الصوت ما يجاوز مقدار الكلمة بلا إشارة — إشارةٌ تقديرية من النموذج.
//   ٢) يُجري على آخر هذه الإشارات **برمجةً دينامية** تُسنِد الكلمات إلى
//      المقاطع بينها إسنادًا يقلّل مجموع الانحراف عن أزمنة الكلمات المتوقَّعة
//      (من محرك التجويد)، مع كلفةٍ لتجاهل إشارة (نقرة مقطع داخل الكلمة)
//      وكلفةٍ لكلمة لم تُقرأ. فالإشارة الواحدة لا تُصدَّق وحدها، وإنما تُوزن
//      مع جاراتها بمقدار الكلمة — وهذا ما يميّز انخفاضَ حدِّ الكلمة من
//      انخفاضِ مقطعٍ داخلها.
//   ٣) يُبتّ في الكلمة ويُنشر حكمها متى تأخّرت عنها إشارةٌ واحدة (تريَّثٌ
//      يسير يمنع التردّد)، فتظهر النتيجة **أثناء القراءة** لا بعدها.
//
// وبذلك يسير الضوء مع القارئ في التلاوة المتصلة والمقطَّعة سواء، وتُقاس
// الكلمة الممسوكة (مدٌّ أطاله القارئ) بقياسها الحقيقي لا بالتقدير: فالصوتُ
// المستديم لا يُقطع عليه حتى يأتي حدُّه.
//
// وأما التحكيم النهائي الدقيق (بتمييز الألفاظ) فيبقى للتحليل الكامل بعد
// إيقاف التسجيل — انظر alignment.ts.

import { classifyWord, scaledWindow } from './tajweed';
import { liveTip } from './coach';
import { NEUTRAL_PRIOR, estimateTempo, lenientMin } from './tempo';
import type { TempoPrior, TempoSample } from './tempo';
import type { LiveAlert, LiveSnapshot, LiveWordStatus, WordStatus, WordTajweed } from './types';
import { clamp } from './util';

/** كيف حُدِّدت نهاية الكلمة: سكتةٌ أو انخفاضٌ (قياس) أم تقديرٌ من النموذج */
export type LiveBoundary = 'gap' | 'dip' | 'model';

export interface LiveWordEvent {
  index: number;
  word: string;
  status: WordStatus;
  measuredMs: number;
  expectedMs: number;
  boundary: LiveBoundary | 'skipped';
  /** الحدود مقيسة من الصوت فعلًا؟ (false = تقديرٌ من النموذج أو كلمة متروكة) */
  measured: boolean;
  /** حكمٌ صدر عند الإيقاف (الحكم الختامي) لا أثناء التلاوة — فلا تنبيهَ لحظيًّا له */
  final?: boolean;
  /** كلمةٌ من البادئة (البسملة قبل الآية) — ليست من الآية */
  prefix?: boolean;
  /**
   * نهاية الكلمة لم تُسمع: أُوقف التسجيل والقارئ ما يزال يُصوِّت — فزمنُها المقيس
   * حدٌّ أدنى لا زمنُها كله، فلا يُحكم عليها بالقصر (ويُترك الحكم للتحليل الكامل).
   */
  cut?: boolean;
}

/* ------------------------------------------------------------------ */
/* معاملات كشف الإشارات                                                */
/* ------------------------------------------------------------------ */
/** عتبة ابتداء التلاوة (فوق أرضية الضجيج) */
const START_THR = 0.012;
/** أدنى زمنٍ يُعدّ كلمة مسموعة */
const MIN_VOICED_MS = 70;
/** صمتٌ يُولِّد إشارة حدّ (م.ث) — أقصر بكثير من مهلة الإصدار الأول */
const GAP_CUE_MS = 55;
/** انخفاض الطاقة إلى هذه النسبة من ذروة الكلمة يُعدّ مرشَّحًا لحدّ */
const DIP_RATIO = 0.55;
/** زمن الانخفاض الذي يؤكّده (م.ث) */
const DIP_CONFIRM_MS = 26;
/** لا يُبحث عن انخفاض قبل ذروةٍ بيّنة (نسبةً إلى العتبة) */
const DIP_MIN_PEAK = 2.2;
/** ثوابت الغلاف الزمني (م.ث): هجومٌ سريع، تحرّرٌ أسرع من القديم، وبطيء للاستدامة */
const TAU_ATTACK = 12;
const TAU_RELEASE = 20;
const TAU_SLOW = 110;
/** الاستدامة: فوق هذه النسبة من الذروة يُعدّ الصوت ممسوكًا (مدًّا) لا مقاطع */
const STEADY_RATIO = 0.75;
const STEADY_SHARE = 0.7;
/**
 * إشارة تقديرية بعد هذه النسبة من مقدار الكلمة الجاري (بلا إشارة صوتية).
 *
 * رُفعت من ١٫٨ إلى ٢٫٦: الإشارة التقديرية تُقدِّم المطابقةَ كلمةً، والضوء
 * المعروض لا يتبعها مباشرةً (المؤشّر مربوطٌ بـ committed — انظر snapshot)،
 * فلا يسبق القارئ. والحدّ الحقيقي (سكتةٌ أو انخفاضٌ يعقبه صعود) أوثق منها.
 */
const MODEL_FORCE = 2.6;
/** وإشارة تقديرية قسرية للمدّ الممسوك بعد هذه النسبة (م.ث إضافية) */
const MODEL_HARD = 2.6;
const MODEL_HARD_ADD = 700;
/** لا تُسجَّل إشارتان أقرب من هذا (م.ث من الزمن المصوّت) */
const CUE_DEDUPE_V = 45;
/** أدنى ذيلٍ صوتي عند الإيقاف يُعدّ كلمة (دونه لا تُختلق كلمة) */
const TAIL_MIN_MS = 90;

/* ------------------------------------------------------------------ */
/* معاملات المطابقة (البرمجة الدينامية)                               */
/* ------------------------------------------------------------------ */
const DP_MAX_WORDS = 14;
const DP_MAX_CUES = 44;
/** كلفة تجاهل إشارة داخل مقطع الكلمة (نقرة مقطعٍ أو مدٍّ) */
const SKIP_CUE = 0.35;
/**
 * زيادةٌ على كلفة تجاهل **السكتة** بحسب طولها (٠ عند أقصر سكتة → ١ عند ٢٠٠ م.ث
 * فأكثر): فالصمتُ الطويل بين مقطعين حدُّ كلمةٍ على الأرجح، والسكتةُ اليسيرة قد
 * تكون إطباقَ حرفٍ شديد (ق ط ك ب د) داخل الكلمة. وبها لا يُدمج القارئُ
 * الأسرعُ من مرتبته كلمتين فصل بينهما بسكتةٍ بيّنة في مقطعٍ واحد.
 */
const GAP_SKIP_W = 0.8;
/** كلفة إسناد كلمةٍ على أنها لم تُقرأ */
const SKIP_WORD = 1.5;
/**
 * كلفة نوع الإشارة: السكتة أدلّ على الحدّ (فهي مكافأةٌ يسيرة على استعمالها)،
 * والانخفاض أضعف، والتقدير من النموذج أضعفها.
 */
const CUE_COST: Record<LiveBoundary, number> = { gap: -0.25, dip: 0.02, model: 0.55 };
/*
 * عددُ الكلمات المُسندة (الجبهة) لا يُضبط بحدّ «تغطيةٍ» يقيس الزمن المنقضي على
 * مقدار المرتبة الاسمية (كما كان) — فذاك يُخطئ القارئَ الأسرع من مرتبته: يدمج
 * كلمتيه في كلمةٍ ويترك آخر الآية بلا حكم. بل لكل فرضٍ عن عدد الكلمات سرعةٌ
 * ضمنية تُقاس بها مقاطعُه مع عدلة سرعةٍ حرّةٍ في مدًى (انظر TEMPO_* أدناه).
 */
/** عدد الإشارات التي تُترك بعد آخر كلمة يُبتّ فيها (تريَّثٌ يمنع التردّد) */
const COMMIT_LAG = 1;
/** الكلمة المتروكة لا يُبتّ فيها إلا بعد إشارتين (أشدّ تريّثًا) */
const SKIP_LAG = 2;

/* ------------------------------------------------------------------ */
/* الإسناد الختامي (عند إيقاف التسجيل)                                 */
/* ------------------------------------------------------------------ */
/**
 * السرعة الضمنية في اختيار الجبهة (أثناء التلاوة وعند الإيقاف): لكل فرضٍ عن
 * عدد الكلمات المقروءة سرعةٌ ضمنية (الزمن المصوّت ÷ مجموع مقاديرها) تُقاس بها
 * المقاطع، ولا يُعاقَب الفرض ما دامت سرعته ضمن هذا المدى حول العدلة الجارية
 * (بالأوكتاف: ٠٫٤٥ ≈ ×١٫٣٧)، ثم كلفةٌ خطّية لكل أوكتافٍ يزيد.
 */
const TEMPO_FREE_OCT = 0.45;
const TEMPO_W = 1.5;
/** حدود السرعة الضمنية المقبولة (نسبةً إلى العدلة الجارية) */
const TEMPO_MIN = 0.35;
const TEMPO_MAX = 3;
/**
 * عند الإيقاف انتهت التلاوة، فكل كلمةٍ لم تُسنَد كلمةٌ **لم تُقرأ** — لا كلمةٌ
 * «لم تأتِ بعد». لذلك تحمل كل كلمة متخلّفة عن الجبهة كلفةَ تركٍ في الحكم
 * الختامي (وهي أخفّ من كلفة الترك وسط التلاوة: فالتوقّف قبل التمام أهون من
 * إسقاط كلمةٍ من وسط الآية).
 */
const SKIP_FINAL = 1.0;
/**
 * توزيع ما بقي: إن قلّت الإشارات عن الكلمات المتبقية عند الإيقاف (قراءةٌ متصلة
 * بلا حدودٍ مسموعة) وكان الزمن المصوّت يسع الكلمات كلَّها بسرعةٍ معقولة، وُزّعت
 * الكلمات على الزمن بمقاديرها تقديرًا (لا حكمَ بقصرٍ أو طول) بدل تركها معلَّقة.
 */
const SPREAD_MIN_TEMPO = 0.4;
/** تُسنَد حدود التوزيع إلى إشارةٍ حقيقية إن قربت منها (نسبةً من مقدار الكلمة) */
const SPREAD_SNAP = 0.3;
/**
 * إعادة الإسناد الشاملة عند الإيقاف: تُعاد مطابقة **كل** الإشارات على **كل**
 * الكلمات بعلم التسجيل كاملًا (زمنُه المصوّت كله معلوم، فسرعةُ القارئ تُقدَّر
 * من الآية كلها لا من كلمتها الأولى). حدود الحجم تحفظ زمن الإيقاف قصيرًا.
 */
const GLOBAL_MAX_WORDS = 48;
const GLOBAL_MAX_CUES = 320;
/** السرعة الضمنية المقبولة لتفسير «قُرئت كلها أسرع» (نسبةً إلى المرتبة الاسمية) */
const RECONSIDER_TEMPO_MIN = 0.45;
const RECONSIDER_TEMPO_MAX = 2.2;
/** لا يُبدَّل الإسناد القائم إلا إن كان البديل أرخصَ منه بهذا الهامش */
const RECONSIDER_MARGIN = 0.3;
/**
 * في مراجعة الدمج: كلماتٌ قصار متتالية (كـ«قل هو») قد لا يُسمع بينها حدٌّ أصلًا،
 * فيُسمح لها بتقاسم مقطعٍ واحد بحدودٍ تقديرية — بكلفة حدٍّ تقديري لكل قسمة،
 * وبحدٍّ أقصى من الكلمات للمقطع الواحد.
 */
const GROUP_SPLIT = 0.55;
const MAX_GROUP = 3;
/** الكلمة «القصيرة» (بسرعة الفرض): دون هذا الزمن قد يفوت حدُّها كاشفَ الطاقة */
const GROUP_SHORT_MS = 380;
/** أقصى عدد إشاراتٍ تُتجاهَل داخل كلمةٍ واحدة (يحدّ زمن الجدول) */
const MAX_LOOKBACK = 14;

interface Cue {
  /** الزمن المصوّت التراكمي عند حدّ الكلمة (لا يدخل فيه الصمت) */
  v: number;
  kind: LiveBoundary;
  /** عمق الانخفاض 0..1 (للسكتة: طولها) — للأرجحية عند التعادل */
  depth: number;
  /** الطابع الزمني الحقيقي (لعرض التأخّر) */
  t: number;
  /**
   * إشارةٌ تقديرية قُسرت على صوتٍ مستديم (مدٍّ ممسوك) لتقدّم العرضَ فحسب —
   * لا تُعدّ حدًّا في الحكم الختامي (فلا يُقطَّع الصوتُ الواحد كلماتٍ وهمية).
   */
  steady?: boolean;
  /** حدٌّ صنعه الإيقافُ والصوتُ لم ينقطع بعد: نهاية الكلمة لم تُسمع */
  cut?: boolean;
}

const SKIPMARK = -2;

/** نافذة إشاراتٍ مفتوحة للمطابقة (بإحداثيات محلية، وidx فهارسها المطلقة) */
interface OpenCues {
  c0: number;
  K: number;
  v0: number;
  V: number[];
  kinds: LiveBoundary[];
  skip: number[];
  idx: number[];
}

/** انحرافُ مقطعٍ عن مقدار كلمة — الكلفة الأساسية في المطابقة */
function durCost(len: number, exp: number): number {
  return clamp(Math.abs(len - exp) / Math.max(80, exp), 0, 4);
}

/**
 * عدلة السرعة من نِسَب الكلمات المقيسة (مقيس ÷ مقدار) — مرجَّحةً بسرعة القارئ
 * المرجعي ومحدودةً حولها (tempo.ts)، بأوزان الكلمات «مسطرةً»:
 *   - قبل أول كلمةٍ مقيسة: سرعة القارئ المرجعي نفسها (لا المرتبة الاسمية).
 *   - كلمةٌ واحدة: وسطٌ هندسيٌّ بينها وبين المرجع — فلا تبقى المطابقةُ على مقدار
 *     المرجع لقارئٍ أسرع منه (فتدمج كلمتين في مقطعٍ واحد)، ولا تنقاد لكلمةٍ شاذّة.
 *   - ثم يغلب الدليلُ المرجعَ كلما كثرت الكلمات.
 * والمدّ اللازم والفواتح وكلمة الوقف لا تُحرِّك العدلة إلا قليلًا (فهي موضع الامتحان):
 * فكلمةٌ أولى مُطالةٌ لا ترفع العدلة فتُقصِّر الكلماتِ بعدها — ومنها الأخيرة.
 */
function scaleFromSamples(samples: TempoSample[], prior: TempoPrior): number {
  return estimateTempo(samples, prior).scale;
}

export class LiveTajweedTracker {
  private tjs: WordTajweed[];
  private words: { word: string; tajweed: WordTajweed }[];
  private tau: number;
  private onWord: ((e: LiveWordEvent) => void) | null;

  /* --- حالة التيار --- */
  private lastT = 0;
  private started = false;
  private finished = false;
  /** جُمّدت: المقروء ليس نصّ الآية (لا تقدّم ولا أحكام بعدها) */
  private frozen = false;
  /** عدد كلمات البادئة (بسملةٌ ابتدأ بها القارئ قبل الآية) في أول القائمة — لا تُعرض ولا تُحسب */
  private prefixCount = 0;
  private voicedTotal = 0;
  private lastVoiceT = 0;
  private silenceMs = 0;
  private gapCuePushed = false;

  /* --- الأغلفة --- */
  private envFast = 0;
  private envSlow = 0;
  private peakEnv = 0;
  private dipMs = 0;
  /** قاع الانخفاض الجاري: زمنُه المصوّت ومستواه — منه تُصنع إشارة الحدّ */
  private dipTroughV = 0;
  private dipTroughE = Infinity;
  /**
   * انخفاضٌ تأكد هبوطُه وينتظر **صعود الصوت من جديد** ليُعدّ حدّ كلمة:
   * فالانخفاض وحده قد يكون ذُبولَ مدٍّ في آخر الكلمة (صوتٌ يخفت ولا ينقطع) —
   * فإن خفت الصوت حتى الصمت كانت السكتةُ هي الحدّ، لا الانخفاض.
   */
  private pendingDip: { v: number; depth: number } | null = null;
  private steadyMs = 0;
  private floorEma = 0.0045;
  /** أُوقف التسجيل والقارئ ما يزال يُصوِّت (لم تُسمع بعد آخر صوتٍ سكتةٌ) */
  private cutAtStop = false;

  /* --- الإشارات والإسناد --- */
  private cues: Cue[] = [];
  private commitCueIdx = -1;
  private lastCommitV = 0;
  private committed = 0;
  /** كلمات أُسندت ولم يُبتّ فيها بعد (تنتظر التريّث) */
  private pendingAssigned = 0;
  /**
   * ما يتقدّم به **الضوء المعروض** على المُبتَّت: كلماتٌ أُسندت إلى حدٍّ مسموع
   * حقيقي (سكتة أو انخفاض — لا تقدير النموذج) ولم يُبتّ حكمُها بعد. كان الضوء
   * مربوطًا بالمُبتَّت وحده، والبتّ ينتظر حدًّا بعد الكلمة (تريّث) — فكان يتخلّف
   * عن القارئ كلمةً ثم يقفز كلماتٍ دفعةً واحدة. الآن يسير معه: الكلمة التي
   * انتهى صوتُها تُطفأ، والتي بعدها تُضاء — والحكم يلحق بعد التريّث.
   */
  private displayAhead = 0;
  /** الزمن المصوّت عند نهاية آخر كلمةٍ تقدّم عليها الضوء */
  private displayEndV = 0;
  /**
   * كلماتٌ من الآية أثبت السماعُ الذكي أثناء التسجيل أنها قُرئت (بالترتيب):
   * لا يتخلّف الضوء عنها وإن لم يُسمع لها حدٌّ في الطاقة (قراءةٌ متصلة).
   */
  private asrHeard = 0;

  /**
   * عدلة السرعة اللحظية: وسطيُ نِسَب ما قِيس من الكلمات إلى أزمنتها المتوقَّعة.
   * بغيرها يُحكم على قارئٍ سريعٍ بـ«أقصر» في كل كلمة — وهي ليست كذلك.
   */
  private samples: TempoSample[] = [];
  private prior: TempoPrior;
  private scale = 1;

  private results: { status: LiveWordStatus; measuredMs: number; boundary?: string }[] = [];
  private doneCount = 0;
  private okCount = 0;
  private violations = 0;
  private estimatedCount = 0;
  private lastAlert: LiveAlert | null = null;
  private lastBoundary: LiveBoundary | null = null;

  /**
   * @param prior مرجع السرعة: سرعة القارئ المعتمد للمرتبة نسبةً إلى نموذجها
   *              (انظر priorCenter) — ويُبدأ منها قبل أول كلمةٍ مقيسة.
   */
  constructor(
    tjs: WordTajweed[],
    words: { word: string }[],
    tau: number,
    onWord: ((e: LiveWordEvent) => void) | null = null,
    prior: TempoPrior = NEUTRAL_PRIOR,
  ) {
    this.tjs = tjs;
    this.words = tjs.map((t, i) => ({ word: words[i]?.word ?? t.word, tajweed: t }));
    this.tau = tau;
    this.onWord = onWord;
    this.prior = prior;
    this.scale = scaleFromSamples([], prior);
    this.results = tjs.map(() => ({ status: 'pending' as LiveWordStatus, measuredMs: 0 }));
  }

  /* ------------------------------------------------------------------ */
  /* مقادير النموذج                                                      */
  /* ------------------------------------------------------------------ */
  private expectedOf(i: number): number {
    return Math.max(60, Math.round((this.tjs[i]?.expectedMs ?? 240) * this.scale));
  }

  /** نافذة الأوجه الجائزة بعدلة السرعة (قصْر/توسّط/إشباع حيث جازت، ومَطّ اللازم) */
  private windowOf(i: number): { minMs: number; maxMs: number; stretchMs?: number } {
    const t = this.tjs[i];
    if (!t) return { minMs: 60, maxMs: 600 };
    const w = scaledWindow(t, this.scale);
    return {
      minMs: Math.round(w.minMs),
      maxMs: Math.round(w.maxMs),
      ...(w.stretchMs ? { stretchMs: Math.round(w.stretchMs) } : {}),
    };
  }

  /** الكلمة الجاري قراءتها (ما أُسند بعدها) */
  private frontierIdx(): number {
    return clamp(this.committed + this.pendingAssigned, 0, this.tjs.length);
  }

  /** الزمن المصوّت عند آخر إشارة (أو عند آخر حدٍّ مُبتَّت) */
  private lastCueV(): number {
    if (this.cues.length) return this.cues[this.cues.length - 1].v;
    return this.lastCommitV;
  }

  /* ------------------------------------------------------------------ */
  /* التغذية                                                             */
  /* ------------------------------------------------------------------ */
  /** تغذية بإطار طاقة واحد (rms 0..~1) مع طابع زمني بالملي ثانية */
  feed(rms: number, tMs: number): void {
    if (this.finished || !this.tjs.length) return;
    const dt = this.lastT ? Math.max(0, Math.min(90, tMs - this.lastT)) : 16;
    this.lastT = tMs;
    if (this.frozen) return; // لا تقدّم بعد التجميد (المقروء ليس الآية)

    // أرضية ضجيج تكيّفية
    const thr = Math.max(this.floorEma * 2.1, START_THR * 0.6, 0.007);
    // عتبة الامتداد (hysteresis): الصوت الجاري يبقى صوتًا ما دام فوق نصف العتبة —
    // فذيلُ المدّ الممسوك يخفت تدريجًا (ولا سيّما عند الوقف آخر الآية، ومع كابت
    // الضجيج في الهواتف)، وكانت العتبة الواحدة تُسقط آخره فتبدو الكلمة الأخيرة
    // «أقصر» دائمًا. البدء وحده يحتاج العتبة الكاملة.
    const voiced = rms > thr || (this.silenceMs === 0 && this.lastVoiceT > 0 && rms > Math.max(this.floorEma * 1.4, thr * 0.45));
    if (!voiced) this.floorEma = this.floorEma * 0.985 + Math.min(rms, this.floorEma) * 0.015 + 0.00002;

    // غلافان: سريعٌ لكشف الانخفاض (زمنُه مستقلّ عن معدّل الإطارات)، وبطيءٌ للاستدامة
    const ka = 1 - Math.exp(-dt / TAU_ATTACK);
    const kr = 1 - Math.exp(-dt / TAU_RELEASE);
    this.envFast += (rms - this.envFast) * (rms > this.envFast ? ka : kr);
    this.envSlow += (rms - this.envSlow) * (1 - Math.exp(-dt / TAU_SLOW));

    if (voiced) {
      if (!this.started && rms > START_THR) this.started = true;
      this.lastVoiceT = tMs;
      this.voicedTotal += dt;
      this.silenceMs = 0;
      this.gapCuePushed = false;

      if (this.envFast > this.peakEnv) this.peakEnv = this.envFast;
      if (this.envSlow > this.peakEnv * STEADY_RATIO) this.steadyMs += dt;

      // إشارة الانخفاض: حرفُ الكلمة التالية يخفض الطاقة خفضًا بيّنًا — لكن
      // الانخفاض وحده ليس حدًّا: المدُّ الممسوك في آخر الكلمة يذبل صوته دون
      // ٥٥٪ من ذروته فيُحسب انخفاضًا ويُنقص قياسُه (وهو ما كان يحكم الكلمة
      // الأخيرة «ناقصة المدّ» رغم إشباعها). لذلك يُنتظر **صعودُ الصوت من
      // جديد** (ابتداءُ الكلمة التالية) قبل أن يُعدّ الحدّ، وتُوضع الإشارة عند
      // قاع الانخفاض بينهما. فإن ذهب الصوت إلى صمتٍ كانت إشارتُه (السكتة) هي
      // الحدّ وأُلغي الانخفاض المعلَّق.
      const dipThr = Math.max(thr * 1.3, this.peakEnv * DIP_RATIO);
      if (this.envFast < dipThr && this.peakEnv > thr * DIP_MIN_PEAK) {
        this.dipMs += dt;
        if (this.envFast < this.dipTroughE) {
          this.dipTroughE = this.envFast;
          this.dipTroughV = this.voicedTotal;
        }
        if (this.dipMs >= DIP_CONFIRM_MS && !this.pendingDip) {
          const depth = clamp(1 - this.dipTroughE / Math.max(1e-6, this.peakEnv), 0, 1);
          this.pendingDip = { v: this.dipTroughV, depth };
        }
      } else if (this.envFast >= dipThr) {
        // صعود الصوت بعد انخفاضٍ مؤكَّد = حدّ كلمةٍ حقيقي بين الكلمتين
        if (this.pendingDip) {
          const pd = this.pendingDip;
          this.pendingDip = null;
          this.pushCue('dip', pd.v, pd.depth, tMs);
        }
        this.dipMs = 0;
        this.dipTroughE = Infinity;
      }

      // إشارة تقديرية: مضى من الصوت ما يجاوز مقدار الكلمة الجاري بلا حدٍّ
      // مسموع. وهي أضعف الإشارات — لا تُستعمل إلا حيث لا سكتةَ ولا انخفاض:
      //   • لا يُقطع على مدٍّ ممسوك (صوتٍ مستديم) — يُنتظر حدُّه الحقيقي.
      //   • حدُّها مبنيٌّ على **أعلى الأوجه الجائزة** للكلمة (لا وسطها): فمن
      //     أشبع المدَّ ستَّ حركاتٍ لم يُقطع عليه عند حركتين ونصف.
      //   • والضوء المعروض لا يتقدّم عليها: المؤشّر مربوطٌ بـ committed.
      const fi = this.frontierIdx();
      if (fi < this.tjs.length) {
        const since = this.voicedTotal - this.lastCueV();
        const exp = this.expectedOf(fi);
        const faceMax = Math.max(exp, this.windowOf(fi).maxMs);
        const steadyHold = since > exp * 0.6 && this.steadyMs > since * STEADY_SHARE;
        const lim = steadyHold
          ? Math.max(exp * MODEL_HARD + MODEL_HARD_ADD, faceMax * 2.2 + 1500)
          : Math.max(exp * MODEL_FORCE, faceMax * 1.35 + 400);
        if (since > lim) this.pushCue('model', this.voicedTotal, 0, tMs, steadyHold);
      }
    } else {
      this.silenceMs += dt;
      this.dipMs = 0;
      this.dipTroughE = Infinity;
      // انخفاضٌ معلَّق دخل الصمت: السكتةُ القصيرة (دون عتبة إشارة السكتة) لا
      // تُلغيه — فإن عاد الصوت ارتفعَ وأكّده حدًّا، وإن اكتملت السكتةُ كانت
      // إشارتُها هي الحدّ وأُلغي. ويُقدَّم موضعُه إلى آخر الصوت المصوّت.
      if (this.pendingDip) this.pendingDip.v = this.voicedTotal;
      // إشارة السكتة: أقصرُ من مهلة الإصدار الأول بخمس مرات
      if (this.started && this.silenceMs >= GAP_CUE_MS && !this.gapCuePushed) {
        this.gapCuePushed = true;
        this.pendingDip = null; // السكتةُ أدلّ على الحدّ من الانخفاض
        this.pushCue('gap', this.voicedTotal, clamp(this.silenceMs / 200, 0, 1), tMs);
      } else if (this.gapCuePushed) {
        // تمتدّ السكتة: يزداد وزنُ إشارتها (سكتةٌ طويلة = حدُّ كلمةٍ أرجح)
        const last = this.cues[this.cues.length - 1];
        if (last && last.kind === 'gap' && this.voicedTotal - last.v <= CUE_DEDUPE_V) {
          last.depth = Math.max(last.depth, clamp(this.silenceMs / 200, 0, 1));
        }
      }
    }
  }

  /** تسجيل إشارة حدٍّ (مع منع التكرار) ثم مطابقة وإبتات */
  private pushCue(kind: LiveBoundary, v: number, depth: number, t: number, steady = false): void {
    const last = this.cues[this.cues.length - 1];
    if (last && v - last.v < CUE_DEDUPE_V && kind !== 'model') {
      // إشارتان متقاربتان: تُحفظ الأقوى (سكتةٌ ثم انخفاضٌ = سكتة)
      if (kind === 'gap' && last.kind !== 'gap') {
        last.kind = 'gap';
        last.depth = Math.max(last.depth, depth);
        last.steady = false;
      }
      return;
    }
    if (last && kind === 'model' && last.kind === 'model') return;
    this.cues.push({ v, kind, depth, t, steady: kind === 'model' && steady });
    // إعادة ضبط الذروة والاستدامة لبداية كلمة جديدة
    this.peakEnv = this.envFast;
    this.steadyMs = 0;
    this.dipMs = 0;
    this.solve();
  }

  /* ------------------------------------------------------------------ */
  /* المطابقة الجارية: برمجة دينامية على الإشارات                        */
  /* ------------------------------------------------------------------ */
  /** الإشارات غير المُبتَّتة بعد (بإحداثيات محلية) والزمن المصوّت عند آخر حدٍّ مُبتَّت */
  private openCues(final = false): OpenCues {
    const c0 = this.commitCueIdx + 1;
    const v0 = this.commitCueIdx >= 0 ? this.cues[this.commitCueIdx].v : this.lastCommitV;
    return this.cueWindow(c0, v0, DP_MAX_CUES, final);
  }

  /** نافذة إشارات من الفهرس c0 (بلا الإشارات التقديرية المستديمة في الحكم الختامي) */
  private cueWindow(c0: number, v0: number, maxK: number, final: boolean): OpenCues {
    const idx: number[] = [];
    for (let i = c0; i < this.cues.length && idx.length < maxK; i++) {
      if (final && this.cues[i].steady) continue;
      idx.push(i);
    }
    const K = idx.length;
    const V: number[] = new Array(K);
    const kinds: LiveBoundary[] = new Array(K);
    const skip: number[] = new Array(K);
    for (let i = 0; i < K; i++) {
      const c = this.cues[idx[i]];
      V[i] = c.v;
      kinds[i] = c.kind;
      // كلفة تجاهل هذه الإشارة: ثابتٌ، يزيد للسكتة بطولها
      skip[i] = c.kind === 'model' ? 0 : SKIP_CUE + (c.kind === 'gap' ? GAP_SKIP_W * clamp(c.depth, 0, 1) : 0);
    }
    return { c0, K, v0, V, kinds, skip, idx };
  }

  /**
   * جدول البرمجة الدينامية: h[j][i] أدنى كلفة لإسناد الكلمات 0..j (بمقاديرها E)
   * على أن تنتهي الكلمة j عند الإشارة i؛ وbk للاسترجاع (SKIPMARK = كلمة لم تُقرأ).
   */
  private buildDp(
    E: number[],
    V: number[],
    kinds: LiveBoundary[],
    skip: number[],
    v0: number,
    allowSkip = true,
    maxGroup = 1,
  ): { h: number[][]; bk: number[][]; bg: number[][] } {
    const W = E.length;
    const K = V.length;
    const INF = 1e9;
    // مجموع كلف التجاهل التراكمي: skipSum[i] = مجموع كلف الإشارات 0..i-1
    const skipSum = new Array<number>(K + 1).fill(0);
    for (let i = 0; i < K; i++) skipSum[i + 1] = skipSum[i] + skip[i];
    const h: number[][] = [];
    const bk: number[][] = [];
    const bg: number[][] = []; // حجم المجموعة: كم كلمةً تقاسمت المقطع المنتهي عند i (١ = كلمة واحدة)
    for (let j = 0; j < W; j++) {
      const hj = new Array<number>(K).fill(INF);
      const bj = new Array<number>(K).fill(-9);
      const gj = new Array<number>(K).fill(1);
      for (let i = 0; i < K; i++) {
        let best = INF;
        let bi = -9;
        let bgv = 1;
        // أ) الكلمات j-g+1..j تأخذ المقطع (V[i2], V[i]] — وi2 = -1 يعني بدايةَ الجلسة.
        //    g = 1 هو الأصل؛ وg > 1 (في الحكم الختامي فقط) كلماتٌ متتالية لم يُسمع
        //    بينها حدٌّ فتقاسمت مقطعًا واحدًا بحدودٍ تقديرية (بكلفة حدٍّ تقديري لكل قسمة).
        let Eg = 0;
        let shortInGroup = 0;
        for (let g = 1; g <= Math.min(maxGroup, j + 1); g++) {
          Eg += E[j - g + 1];
          if (E[j - g + 1] < GROUP_SHORT_MS) shortInGroup++;
          // لا تتقاسم كلماتٌ مقطعًا إلا إذا كانت القصارُ فيها (التي يفوت حدُّها
          // الكاشفَ) كلَّها إلا واحدةً على الأكثر — فلا يُعاد تفسير كلماتٍ طوال
          // قُرئت خطأً على أنها كلماتٌ اندمجت.
          if (g > 1 && shortInGroup < g - 1) continue;
          const jPrev = j - g;
          const lo = Math.max(jPrev < 0 ? -1 : 0, i - MAX_LOOKBACK - 1);
          for (let i2 = lo; i2 < i; i2++) {
            const prev = jPrev < 0 ? (i2 === -1 ? 0 : INF) : h[jPrev][i2];
            if (prev >= INF) continue;
            const start = i2 === -1 ? v0 : V[i2];
            const skippedCost = skipSum[i] - skipSum[i2 + 1]; // الإشارات بين i2 وi (غير شاملة)
            const c = prev + durCost(V[i] - start, Eg) + skippedCost + CUE_COST[kinds[i]] + GROUP_SPLIT * (g - 1);
            if (c < best) {
              best = c;
              bi = i2;
              bgv = g;
            }
          }
        }
        // ب) الكلمة j لم تُقرأ: لا مقطع لها، وتبقى الجبهة عند الإشارة i
        if (allowSkip && j > 0 && h[j - 1][i] + SKIP_WORD < best) {
          best = h[j - 1][i] + SKIP_WORD;
          bi = SKIPMARK;
          bgv = 1;
        }
        hj[i] = best;
        bj[i] = bi;
        gj[i] = bgv;
      }
      h.push(hj);
      bk.push(bj);
      bg.push(gj);
    }
    return { h, bk, bg };
  }

  /**
   * استرجاع الإسناد مع المجموعات: لكل كلمةٍ حتى bestJ نهايتُها (زمنًا مصوّتًا)
   * ونوعُ حدّها — والكلمات المتقاسمة مقطعًا تُقسم بمقاديرها بحدودٍ «تقديرية».
   */
  private backtrackGroups(
    dp: { bk: number[][]; bg: number[][] },
    bestJ: number,
    open: OpenCues,
    E: number[],
  ): ({ endV: number; kind: LiveBoundary; cue: number } | null)[] {
    const out: ({ endV: number; kind: LiveBoundary; cue: number } | null)[] = new Array(bestJ + 1).fill(null);
    let j = bestJ;
    let i = open.K - 1;
    while (j >= 0 && i >= 0) {
      const b = dp.bk[j][i];
      if (b === SKIPMARK) {
        out[j] = null;
        j--;
        continue;
      }
      if (b < -1) break;
      const g = dp.bg[j][i];
      const start = b === -1 ? open.v0 : open.V[b];
      const end = open.V[i];
      let Etot = 0;
      for (let q = j - g + 1; q <= j; q++) Etot += E[q];
      let acc = 0;
      for (let q = j - g + 1; q <= j; q++) {
        acc += E[q];
        out[q] =
          q === j
            ? { endV: end, kind: open.kinds[i], cue: open.idx[i] }
            : { endV: start + (acc / Math.max(1, Etot)) * (end - start), kind: 'model', cue: -1 };
      }
      j -= g;
      i = b;
    }
    return out;
  }

  /** استرجاع الإسناد من الجدول: لكل كلمةٍ حتى bestJ فهرسُ إشارة نهايتها (مطلقًا) أو SKIPMARK */
  private backtrack(bk: number[][], bestJ: number, open: OpenCues, endI = open.K - 1): number[] {
    const assign: number[] = new Array(bestJ + 1).fill(-9);
    let j = bestJ;
    let i = endI;
    while (j >= 0 && i >= 0) {
      const b = bk[j][i];
      if (b === SKIPMARK) {
        assign[j] = SKIPMARK;
        j--;
        continue;
      }
      assign[j] = open.idx[i];
      j--;
      i = b;
    }
    return assign;
  }

  /**
   * الإبتات: تُبتّ الكلمات المُسندة بالترتيب ما تأخّرت عنها إشارةٌ (lag) —
   * وتُرجع عدد ما بُتّ فيه. (final = بلا تريّث: كل ما أُسند يُبتّ.)
   */
  private commitAssigned(assign: number[], open: OpenCues, final: boolean): number {
    // لا يُبتّ (أثناء التلاوة) إلا فيما تأخّرت عنه إشارةٌ أو إشارتان (تريّث)
    const lastAbs = open.idx[open.K - 1];
    const lagPos = open.K - 1 - COMMIT_LAG;
    const skipPos = open.K - 1 - SKIP_LAG;
    const limit = final ? lastAbs : lagPos >= 0 ? open.idx[lagPos] : -1;
    const skipLimit = final ? lastAbs : skipPos >= 0 ? open.idx[skipPos] : -1;
    let k = 0;
    let committedNow = 0;
    while (k < assign.length) {
      const a = assign[k];
      const absIdx = this.committed + committedNow;
      if (a === SKIPMARK) {
        const nxt = assign[k + 1];
        if (!final && (nxt === undefined || nxt === SKIPMARK || nxt < 0 || nxt > skipLimit)) break;
        this.commitWord(absIdx, 0, 'skipped', { final });
        committedNow++;
        k++;
        continue;
      }
      if (a < 0 || a > limit) break;
      const endV = this.cues[a].v;
      this.commitWord(absIdx, Math.max(0, endV - this.lastCommitV), this.cues[a].kind, { final, cut: !!this.cues[a].cut });
      this.lastCommitV = endV;
      this.commitCueIdx = a;
      committedNow++;
      k++;
    }
    this.committed += committedNow;
    return committedNow;
  }

  /**
   * وسم الكلمة الجارية وحدها «جاريًا» — لا كل ما أُسند ولم يُبتّ: فالكلمات
   * المُسندة بانتظار التريّث ما زالت «قادمة»، ولا تُضاء قبل أن يصل إليها
   * القارئ. (كان وسمُها جميعًا يجعل الضوء يسبق القارئ كلمةً أو أكثر.)
   */
  private markCurrent(): void {
    const n = this.tjs.length;
    for (let q = this.committed + 1; q < n; q++) {
      if (this.results[q].status === 'current') this.results[q] = { status: 'pending', measuredMs: 0 };
    }
    if (this.committed < n && (this.results[this.committed].status === 'pending' || this.results[this.committed].status === 'current')) {
      this.results[this.committed] = { status: 'current', measuredMs: 0 };
    }
  }

  /**
   * المطابقة الجارية (أثناء التلاوة): الجبهة هي عدد الكلمات التي تملأ الزمن
   * المصوّت حتى آخر إشارة، مع شرط التغطية (مجموع مقادير الكلمات المُسندة ≈
   * الزمن المنقضي) — فالكلمات التي بعد الجبهة «لم تأتِ بعد» ولا كلفة عليها.
   */
  private solve(): void {
    const n = this.tjs.length;
    const open = this.openCues();
    const W = Math.min(n - this.committed, DP_MAX_WORDS);
    if (open.K <= 0 || W <= 0) {
      this.pendingAssigned = 0;
      return;
    }
    const pick = this.pickFrontier(open, W, false);
    if (!pick) {
      this.pendingAssigned = 0;
      return;
    }
    if (pick.bestJ < 0) {
      // الكلمة الأولى المنتظرة ما تزال تُقرأ: لا كلمة تمّت منذ آخر حكم
      this.pendingAssigned = 0;
      this.updateDisplay([]);
      this.markCurrent();
      return;
    }
    const assign = this.backtrack(pick.bk, pick.bestJ, open, pick.endI);
    const committedNow = this.commitAssigned(assign, open, false);
    this.pendingAssigned = Math.max(0, pick.bestJ + 1 - committedNow);
    this.updateDisplay(assign.slice(committedNow));
    this.markCurrent();
  }

  /**
   * تقدّم الضوء المعروض: ما أُسند (ولم يُبتّ) إلى حدٍّ مسموعٍ حقيقي، وقد بلغ
   * زمنُه نصفَ أدنى أوجهه على الأقل — فانخفاضٌ عابرٌ في أول الكلمة لا يُطفئها.
   */
  private updateDisplay(pending: number[]): void {
    let ahead = 0;
    let prevV = this.lastCommitV;
    for (const a of pending) {
      if (a < 0 || !this.cues[a]) break; // كلمةٌ متروكة أو بلا إشارة
      const cue = this.cues[a];
      if (cue.kind === 'model' || cue.steady) break;
      const idx = this.committed + ahead;
      if (cue.v - prevV < 0.5 * this.windowOf(idx).minMs) break;
      prevV = cue.v;
      ahead++;
    }
    this.displayAhead = ahead;
    this.displayEndV = prevV;
  }

  /**
   * السماع الذكي أثناء التسجيل أثبت أن أول `count` كلمة من الآية قد قُرئت —
   * فلا يتخلّف الضوء عنها (المرافقة بالطاقة وحدها قد لا تجد حدًّا في التلاوة المتصلة).
   */
  noteHeard(count: number): void {
    if (this.finished || this.frozen) return;
    this.asrHeard = Math.max(this.asrHeard, Math.max(0, Math.floor(count)));
  }

  /** الكلمة التي يُضاء عليها الآن (بفهرس القائمة كاملةً، بما فيها البادئة) */
  private displayIdx(): number {
    const n = this.tjs.length;
    return clamp(Math.max(this.committed + this.displayAhead, this.prefixCount + this.asrHeard), 0, n);
  }

  /**
   * اختيار الجبهة (عدد الكلمات المقروءة حتى آخر إشارة) مع تقدير السرعة معًا:
   *
   * كان الاختيار يقيس كل فرضٍ على مقدار المرتبة الاسمية (بعدلةٍ لا تستقرّ إلا
   * بعد كلمتين مقيستين)، فكان القارئُ الأسرع من مرتبته تُدمَج كلمتاه في مقطعٍ
   * واحد يوافق مقدار كلمةٍ واحدة بالسرعة الاسمية — ولا تتعلّم العدلةُ من الدمج
   * شيئًا لأنه يوافق المقدار — فتتخلّف آخر الآية بلا حكم. الآن لكل فرضٍ عن
   * عدد الكلمات **سرعتُه الضمنية** (الزمن المصوّت ÷ مجموع مقاديرها) تُقاس بها
   * مقاطعُه، ويُحاسَب على بُعد سرعته عن العدلة الجارية فحسب (ضمن مدًى حرٍّ لا
   * كلفة فيه). فيُفرَّق بين «كلمتين سريعتين فصلت بينهما سكتة» و«كلمةٍ واحدة على
   * مهل» ببنية الإشارات، لا بالسرعة الاسمية وحدها.
   *
   * @param final عند الإيقاف: كل كلمةٍ بعد الجبهة كلمةٌ متروكة تحمل كلفتها؛
   *              وأثناء التلاوة: ما بعد الجبهة «لم يأتِ بعد» بلا كلفة، ويبقى
   *              شرطُ التغطية الجزئية (الكلمة الجارية قد تكون في وسطها).
   */
  private pickFrontier(
    open: OpenCues,
    W: number,
    final: boolean,
  ): { bestJ: number; bk: number[][]; endI: number } | null {
    const { K, v0, V, kinds, skip } = open;
    const E: number[] = new Array(W);
    for (let j = 0; j < W; j++) E[j] = this.expectedOf(this.committed + j);
    const elapsed = V[K - 1] - v0;
    const skipSum = new Array<number>(K + 1).fill(0);
    for (let i = 0; i < K; i++) skipSum[i + 1] = skipSum[i] + skip[i];
    /**
     * كلفة «الكلمة التالية ما تزال تُقرأ»: الإشارات بعد آخر كلمةٍ تمّت داخلَ
     * الكلمة الجارية (مقاطعُها: إطباقُ حرفٍ شديد، أو انخفاضٌ بين مقطعين) — فتُتجاهل
     * بكلفتها، ويُحاسَب المقطع الجاري إن جاوز مقدار الكلمة بيّنًا (كان ينبغي أن يُرى
     * حدُّها). كان كلُّ انخفاضٍ جديد يُعدّ نهايةَ كلمةٍ حتمًا، فيسبق الضوءُ القارئ
     * مقطعًا مقطعًا ويُحكم على الكلمات قبل تمامها.
     */
    const partialCost = (fromI: number, nextE: number): number => {
      const start = fromI < 0 ? v0 : V[fromI];
      const L = V[K - 1] - start;
      const over = nextE > 0 ? Math.max(0, L - nextE * 1.2) / Math.max(80, nextE) : 0;
      return skipSum[K] - skipSum[fromI + 1] + clamp(over, 0, 4);
    };

    const INF = 1e9;
    let bestJ = -1;
    let bestC = INF;
    let bestBk: number[][] | null = null;
    let bestI = K - 1;
    // لم تتمّ كلمةٌ بعد: الأولى المنتظرة تُقرأ منذ آخر حكم
    if (!final) {
      bestC = partialCost(-1, E[0]);
      bestBk = [];
    }
    let cumE = 0;
    for (let j = 0; j < W; j++) {
      cumE += E[j];
      // السرعة الضمنية لهذا الفرض (نسبةً إلى العدلة الجارية)
      const s = elapsed > 60 ? clamp(elapsed / cumE, TEMPO_MIN, TEMPO_MAX) : 1;
      const Ej = E.slice(0, j + 1).map((e) => e * s);
      const { h, bk } = this.buildDp(Ej, V, kinds, skip, v0);
      const tempoPen = Math.max(0, Math.abs(Math.log2(s)) - TEMPO_FREE_OCT);
      if (h[j][K - 1] < INF) {
        const c = h[j][K - 1] + TEMPO_W * tempoPen + (final ? SKIP_FINAL * (W - 1 - j) : 0);
        if (c < bestC) {
          bestC = c;
          bestJ = j;
          bestBk = bk;
          bestI = K - 1;
        }
      }
      if (final || j + 1 >= W) continue;
      // الكلمات 0..j تمّت عند إشارةٍ سابقة، والكلمة j+1 تُقرأ الآن (بسرعةٍ تفترض نصفها)
      const sp = elapsed > 60 ? clamp(elapsed / (cumE + 0.5 * E[j + 1]), TEMPO_MIN, TEMPO_MAX) : 1;
      const Ep = E.slice(0, j + 1).map((e) => e * sp);
      const dpP = this.buildDp(Ep, V, kinds, skip, v0);
      const penP = Math.max(0, Math.abs(Math.log2(sp)) - TEMPO_FREE_OCT);
      for (let i = Math.max(0, K - 1 - MAX_LOOKBACK); i < K - 1; i++) {
        if (dpP.h[j][i] >= INF) continue;
        const c = dpP.h[j][i] + TEMPO_W * penP + partialCost(i, E[j + 1] * sp);
        if (c < bestC) {
          bestC = c;
          bestJ = j;
          bestBk = dpP.bk;
          bestI = i;
        }
      }
    }
    if (!bestBk) return null;
    return { bestJ, bk: bestBk, endI: bestI };
  }

  /**
   * الحكم الختامي (عند الإيقاف): التلاوة انتهت، فلا «كلمةٌ لم تأتِ بعد» —
   * كل كلمةٍ بعد الجبهة كلمةٌ متروكة تحمل كلفتها. ولأن عدلة السرعة قد لا تكون
   * قد استقرّت بعد (آيةٌ من كلمتين لقارئٍ أسرع من مرتبته)، لا يُفرَض على
   * الفرض «قُرئت الكلمات كلها» مقدارُ المرتبة الاسمية: لكل فرضٍ عن عدد الكلمات
   * سرعةٌ ضمنية تُقاس بها مقاطعُه، ويُحاسَب على بُعدها عن العدلة الجارية
   * فحسب. وبهذا لا تبقى الكلمة الأخيرة «معلَّقة» لمن قرأ أسرع من مرتبته —
   * وهو ما كان يقع: تُحكم الكلمات كلها إلا الأخيرة.
   */
  private solveFinal(): void {
    const n = this.tjs.length;
    for (let guard = 0; guard < 8 && this.committed < n; guard++) {
      const open = this.openCues(true);
      const W = Math.min(n - this.committed, DP_MAX_WORDS);
      if (open.K <= 0 || W <= 0) break;
      const pick = this.pickFrontier(open, W, true);
      if (!pick) break;
      const assign = this.backtrack(pick.bk, pick.bestJ, open);
      const committedNow = this.commitAssigned(assign, open, true);
      if (!committedNow) break;
      // بقيت كلماتٌ وإشاراتٌ (أكثر من سعة الجدول): جولةٌ أخرى
      if (this.commitCueIdx >= this.cues.length - 1) break;
    }
    this.pendingAssigned = 0;
  }

  /**
   * تسوية ما بقي بلا حكم بعد الإسناد الختامي — فلا تبقى كلمةٌ «معلَّقة» بعد
   * الإيقاف:
   *   - إن كانت الإشارات أقلَّ من الكلمات المتبقية (قراءةٌ متصلة لم يُسمع فيها
   *     حدٌّ) والزمنُ المصوّت يسعها بسرعةٍ معقولة → تُوزَّع عليه بمقاديرها
   *     **تقديرًا** (حدودٌ من النموذج: لا حكم بقصرٍ ولا طول، وتُعدّ في «تقديرًا»).
   *   - وإلا فالكلمات المتبقية لم تُقرأ → «لم تُسمع».
   * يُستدعى بعد solveFinal، فما وصل هنا إمّا لم تكفِه الإشارات وإمّا رآه
   * الحكم الختامي متروكًا.
   */
  private settleRemainder(): void {
    const n = this.tjs.length;
    if (this.committed >= n) return;
    const rem = n - this.committed;
    const leftover = Math.max(0, this.voicedTotal - this.lastCommitV);
    const E: number[] = [];
    for (let j = this.committed; j < n; j++) E.push(this.expectedOf(j));
    const cumE = E.reduce((a, b) => a + b, 0);
    const open = this.cues
      .slice(this.commitCueIdx + 1)
      .filter((c) => !c.steady)
      .map((c) => c.v);
    const spread = leftover >= MIN_VOICED_MS && leftover >= SPREAD_MIN_TEMPO * cumE && open.length < rem;
    if (!spread) {
      for (let j = this.committed; j < n; j++) this.commitWord(j, 0, 'skipped', { final: true });
      this.committed = n;
      return;
    }
    // توزيع الزمن المتبقي على الكلمات بمقاديرها، مع الإسناد إلى إشارةٍ حقيقية إن قربت
    let v = this.lastCommitV;
    let acc = 0;
    for (let k = 0; k < rem; k++) {
      const idx = this.committed + k;
      acc += E[k];
      let endV = k === rem - 1 ? this.voicedTotal : this.lastCommitV + (acc / cumE) * leftover;
      let kind: LiveBoundary = 'model';
      if (k < rem - 1) {
        let bestD = Infinity;
        for (const cv of open) {
          const d = Math.abs(cv - endV);
          if (cv > v + MIN_VOICED_MS && d < bestD && d <= SPREAD_SNAP * E[k]) {
            bestD = d;
            endV = cv;
            kind = 'model'; // الحدّ اقتُرح من النموذج وإن وافق إشارةً — يبقى تقديرًا
          }
        }
      }
      this.commitWord(idx, Math.max(0, endV - v), kind, { final: true, cut: k === rem - 1 && this.cutAtStop });
      v = endV;
    }
    this.lastCommitV = this.voicedTotal;
    this.commitCueIdx = this.cues.length - 1;
    this.committed = n;
  }

  /** إبتات كلمة: حكمها، وتنبيهها، وتحديث عدلة السرعة */
  private commitWord(
    i: number,
    measuredRaw: number,
    boundary: LiveBoundary | 'skipped',
    opts: { final?: boolean; quiet?: boolean; adapt?: boolean; cut?: boolean } = {},
  ): void {
    if (i < 0 || i >= this.tjs.length) return;
    const measured = Math.round(measuredRaw);
    const acoustic = boundary === 'gap' || boundary === 'dip';
    const expected = this.expectedOf(i);
    const adapt = opts.adapt !== false;
    /** نهاية الكلمة لم تُسمع (قطعها الإيقاف والصوت قائم): زمنها حدٌّ أدنى لا يُحكم منه بالقصر */
    const cut = !!opts.cut;

    if (boundary === 'skipped') {
      this.results[i] = { status: 'silent', measuredMs: 0, boundary };
      this.doneCount++;
      this.violations++;
      this.lastBoundary = null;
      if (!opts.quiet) {
        this.onWord?.({
          index: i - this.prefixCount,
          word: this.words[i].word,
          status: 'silent',
          measuredMs: 0,
          expectedMs: expected,
          boundary,
          measured: false,
          final: !!opts.final,
          prefix: i < this.prefixCount,
        });
      }
      const tip = opts.quiet ? null : liveTip(this.words[i].word, this.tjs[i], 'silent');
      if (tip) {
        this.lastAlert = {
          index: i,
          word: tip.word,
          title: tip.title,
          action: tip.action,
          tone: 'danger',
          at: Date.now(),
        };
      }
      return;
    }

    // الحكم بعدلة السرعة المتعلَّمة **قبل** هذه الكلمة (سببيًّا): فلا يزحزح زمنُ
    // الكلمة نافذةَ حكمها هي — ثم تُحدَّث العدلة بها لما بعدها.
    // والكلمة المقدَّرة من النموذج لا يُقضى عليها بقصرٍ ولا بطول: زمنُها لم
    // يُقس من الصوت — ويُترك الحكم للتحليل الكامل بعد الإيقاف.
    const win = this.windowOf(i);
    const evidence = this.samples.reduce((a, x) => a + x.weight, 0);
    win.minMs = Math.round(lenientMin(win.minMs, this.scale, evidence, this.tjs[i].rulerWeight ?? 1));
    let status: WordStatus = acoustic
      ? classifyWord(measured, expected, this.tau, win)
      : measured < MIN_VOICED_MS
        ? 'silent'
        : 'ok';
    // الكلمة المقطوعة بالإيقاف: قد تكون أطول مما سُمع — فلا «قصر» ولا «لم تُسمع»
    // عليها، ويبقى الحكم بالطول إن جاوزت المقدار فيما سُمع منها.
    const cutUnjudged = cut && (status === 'short' || status === 'silent') && measured > 0;
    if (cutUnjudged) status = 'ok';

    if (acoustic && !cutUnjudged) {
      if (adapt && !cut && measured >= MIN_VOICED_MS && this.tjs[i].expectedMs > 0) {
        this.samples.push({ ratio: measured / this.tjs[i].expectedMs, weight: this.tjs[i].rulerWeight ?? 1 });
        this.scale = scaleFromSamples(this.samples, this.prior);
      }
    } else {
      this.estimatedCount++;
    }

    this.results[i] = { status, measuredMs: measured, boundary: cutUnjudged ? 'model' : boundary };
    this.doneCount++;
    if (status === 'excellent' || status === 'ok') this.okCount++;
    else this.violations++;
    this.lastBoundary = boundary;

    const tip = acoustic && !cutUnjudged && !opts.quiet ? liveTip(this.words[i].word, this.tjs[i], status) : null;
    if (tip) {
      this.lastAlert = {
        index: i,
        word: tip.word,
        title: tip.title,
        action: tip.action,
        tone: status === 'silent' ? 'danger' : 'warn',
        at: Date.now(),
      };
    }

    if (!opts.quiet) {
      this.onWord?.({
        index: i - this.prefixCount,
        word: this.words[i].word,
        status,
        measuredMs: measured,
        expectedMs: expected,
        boundary: cutUnjudged ? 'model' : boundary,
        measured: acoustic && !cutUnjudged,
        final: !!opts.final,
        prefix: i < this.prefixCount,
        ...(cut ? { cut: true } : {}),
      });
    }
  }

  /**
   * إعادة التأسيس على بادئة: تبيّن (بالسماع اللحظي) أن القارئ ابتدأ بالبسملة
   * وليست من الآية — فتُقدَّم كلماتُها على قائمة الكلمات، وتُعاد مطابقة كل
   * الإشارات من أولها، ثم تستمرّ المرافقة. كلمات البادئة لا تُعرض ولا تُحسب في
   * عدّاد الآية. يُستدعى مرةً واحدة، وقبل الإيقاف.
   */
  rebase(prefixTjs: WordTajweed[], prefixWords: { word: string }[]): void {
    if (this.prefixCount || this.finished || !prefixTjs.length) return;
    this.prefixCount = prefixTjs.length;
    this.tjs = [...prefixTjs, ...this.tjs];
    this.words = [...prefixTjs.map((t, i) => ({ word: prefixWords[i]?.word ?? t.word, tajweed: t })), ...this.words];
    this.results = this.tjs.map(() => ({ status: 'pending' as LiveWordStatus, measuredMs: 0 }));
    this.doneCount = 0;
    this.okCount = 0;
    this.violations = 0;
    this.estimatedCount = 0;
    this.samples = [];
    this.scale = scaleFromSamples([], this.prior);
    this.committed = 0;
    this.lastCommitV = 0;
    this.commitCueIdx = -1;
    this.pendingAssigned = 0;
    this.displayAhead = 0;
    this.displayEndV = 0;
    this.pendingDip = null;
    this.dipMs = 0;
    this.dipTroughE = Infinity;
    this.lastAlert = null;
    this.lastBoundary = null;
    // إعادة المطابقة على ما تجمّع من إشارات (بلا تنبيهات: أحكامٌ أُعيد بناؤها)
    const cb = this.onWord;
    this.onWord = null;
    if (this.cues.length) this.solve();
    this.onWord = cb;
  }

  /**
   * مراجعة الدمج عند الإيقاف (بعد الحكم الختامي التزايدي).
   *
   * إن بقيت كلماتٌ بلا صوت بعد أن استُهلك الصوتُ كلُّه في كلماتٍ قبلها، فأحد
   * أمرين: توقّف القارئ قبل تمام الآية، أو قرأها كلَّها أسرعَ من مرتبته
   * فدُمجت كلمتان في مقطعٍ واحد في أول التلاوة (قبل أن تستقرّ عدلة السرعة)
   * وتزحزحت الكلمات كلمةً حتى بقيت الأخيرة بلا صوت. يُجرَّب هنا التفسير
   * الثاني: إعادةُ إسناد الإشارات كلِّها على الكلمات كلِّها **بلا ترك كلمةٍ
   * من الوسط** وبسرعةٍ ضمنية تُقدَّر من الآية كلها — ولا يُقبل إلا إن كان
   * أرخصَ بيّنًا من الإسناد القائم (بكلفة ما تُرك منه)، مع سرعةٍ ضمنية معقولة.
   * ولا يُعاد النظر في جلسةٍ اكتملت كلماتُها: فالأحكام التي رآها القارئ أثناء
   * تلاوته لا تُبدَّل بأثرٍ رجعي إلا لهذا الداعي.
   */
  private reconsiderMerged(): boolean {
    const n = this.tjs.length;
    if (this.committed >= n || this.committed < 1) return false;
    if (n > GLOBAL_MAX_WORDS || this.cues.length > GLOBAL_MAX_CUES) return false;
    const open = this.cueWindow(0, 0, GLOBAL_MAX_CUES, true);
    const K = open.K;
    if (K < 1) return false;
    const elapsed = open.V[K - 1];
    if (elapsed < MIN_VOICED_MS) return false;

    // كلفة الإسناد القائم بنموذج الكلفة نفسه (بالعدلة الجارية)
    let cur = 0;
    let vPrev = 0;
    let readWords = 0;
    for (let k = 0; k < this.committed; k++) {
      const r = this.results[k];
      if (r.status === 'silent' && !r.measuredMs) {
        cur += SKIP_WORD;
        continue;
      }
      readWords++;
      const vEnd = vPrev + r.measuredMs;
      cur += durCost(r.measuredMs, this.expectedOf(k));
      for (let i = 0; i < K; i++) {
        if (open.V[i] > vPrev + 1 && open.V[i] < vEnd - 1) cur += open.skip[i];
      }
      const kindIdx = open.V.findIndex((x) => Math.abs(x - vEnd) <= 1);
      cur += kindIdx >= 0 ? CUE_COST[open.kinds[kindIdx]] : CUE_COST.model;
      vPrev = vEnd;
    }
    cur += SKIP_FINAL * (n - this.committed);
    cur += TEMPO_W * Math.max(0, Math.abs(Math.log2(this.scale / this.prior.center)) - TEMPO_FREE_OCT);
    if (!readWords) return false;

    // التفسير البديل: j+1 كلمة (أكثر مما أُسند) بلا تركٍ من الوسط
    const Ebase = this.tjs.map((t) => Math.max(60, t.expectedMs));
    const INF = 1e9;
    let bestC = INF;
    let bestJ = -1;
    let bestDp: { dp: { h: number[][]; bk: number[][]; bg: number[][] }; E: number[] } | null = null;
    let cumE = 0;
    for (let j = 0; j < n; j++) {
      cumE += Ebase[j];
      if (j < this.committed) continue;
      const s = elapsed / cumE;
      // السرعة الضمنية تُقاس إلى سرعة القارئ المرجعي (مركز العدلة) لا إلى المرتبة الاسمية
      const sRel = s / this.prior.center;
      if (sRel < RECONSIDER_TEMPO_MIN || sRel > RECONSIDER_TEMPO_MAX) continue;
      const E = Ebase.slice(0, j + 1).map((e) => e * s);
      const dp = this.buildDp(E, open.V, open.kinds, open.skip, 0, false, MAX_GROUP);
      if (dp.h[j][K - 1] >= INF) continue;
      const c = dp.h[j][K - 1] + TEMPO_W * Math.max(0, Math.abs(Math.log2(sRel)) - TEMPO_FREE_OCT) + SKIP_FINAL * (n - 1 - j);
      if (c < bestC) {
        bestC = c;
        bestJ = j;
        bestDp = { dp, E };
      }
    }
    if (bestJ < 0 || !bestDp || bestC > cur - RECONSIDER_MARGIN) return false;
    const plan = this.backtrackGroups(bestDp.dp, bestJ, open, bestDp.E);
    if (plan.some((x) => !x)) return false;

    // إعادة الأحكام: ما سبق حكمُه يُحدَّث بصمت، وما لم يُحكم يُعلَن حكمًا ختاميًا
    const wasJudged = this.results.map((r) => r.status !== 'pending' && r.status !== 'current');
    this.results = this.tjs.map(() => ({ status: 'pending' as LiveWordStatus, measuredMs: 0 }));
    this.doneCount = 0;
    this.okCount = 0;
    this.violations = 0;
    this.estimatedCount = 0;
    const segs = plan.map((x, k) => ({
      measured: Math.max(0, x!.endV - (k ? plan[k - 1]!.endV : 0)),
      kind: x!.kind,
    }));
    const lastCue = plan[bestJ]!.cue;
    const lastCut = lastCue >= 0 && !!this.cues[lastCue]?.cut;
    // عدلة السرعة من المقاطع المقيسة (مرجَّحةً بالمرجع) — كما في التحليل الكامل
    const samples: TempoSample[] = [];
    segs.forEach((sg, k) => {
      if (lastCut && k === bestJ) return;
      if ((sg.kind === 'gap' || sg.kind === 'dip') && sg.measured >= MIN_VOICED_MS && this.tjs[k].expectedMs > 0) {
        samples.push({ ratio: sg.measured / this.tjs[k].expectedMs, weight: this.tjs[k].rulerWeight ?? 1 });
      }
    });
    this.samples = samples;
    this.scale = scaleFromSamples(samples, this.prior);
    segs.forEach((sg, k) =>
      this.commitWord(k, sg.measured, sg.kind, { final: true, quiet: wasJudged[k], adapt: false, cut: lastCut && k === bestJ }),
    );
    this.committed = bestJ + 1;
    this.lastCommitV = plan[bestJ]!.endV;
    if (lastCue >= 0) this.commitCueIdx = lastCue;
    this.pendingAssigned = 0;
    return true;
  }

  /**
   * عند إيقاف التسجيل: إشارةٌ ختامية، ثم الحكم الختامي على كل ما بقي —
   * فلا تُترك كلمةٌ بلا حكم: إمّا قِيست، أو قُدِّرت (قراءةٌ متصلة بلا حدٍّ
   * مسموع)، أو «لم تُسمع» (توقّف القارئ قبلها). والتحليل الكامل هو الفيصل.
   *
   * ولا يبدأ الحكم قبل أن يُسمع صوت: من أوقف التسجيل بلا قراءة بقيت كلماته
   * «معلَّقة» لا «لم تُسمع».
   */
  finish(): void {
    if (this.finished) return;
    // هل أُوقف التسجيل والقارئ ما يزال يُصوِّت؟ — كان هذا أصلَ شكوى «الكلمة الأخيرة
    // قصيرةٌ دائمًا»: يضغط القارئ الإيقاف مع آخر حرفٍ (أو قبل أن يصل ذيلُ الصوت من
    // الميكروفون)، فيُقطع مدُّ الكلمة الأخيرة ويُقاس ما سُمع منه على أنه كلُّه.
    // فإن لم تُسمع بعد آخر صوتٍ سكتةٌ تُعدّ حدًّا، فنهاية الكلمة الأخيرة لم تُسمع:
    // لا يُحكم عليها بالقصر (انظر commitWord) ويبقى الفيصلُ التحليلَ الكامل.
    this.cutAtStop = this.started && !this.frozen && this.silenceMs < GAP_CUE_MS && this.voicedTotal > this.lastCommitV;
    // الإيقاف حدٌّ حقيقي: تُختم الإشارات بسكتةٍ عند آخر الصوت إن كان بعد آخر حدٍّ
    // حقيقي ذيلٌ يُعتدّ به (والإشارة التقديرية المستديمة ليست حدًّا حقيقيًا)
    let lastReal = this.lastCommitV;
    for (let i = this.cues.length - 1; i >= 0; i--) {
      if (!this.cues[i].steady) {
        lastReal = Math.max(lastReal, this.cues[i].v);
        break;
      }
    }
    const tail = this.voicedTotal - lastReal;
    if (this.started && tail >= TAIL_MIN_MS) {
      const last = this.cues[this.cues.length - 1];
      if (last && last.steady && this.voicedTotal - last.v < CUE_DEDUPE_V) {
        last.kind = 'gap';
        last.depth = 1;
        last.steady = false;
        last.v = this.voicedTotal;
        last.cut = this.cutAtStop;
      } else {
        this.cues.push({ v: this.voicedTotal, kind: 'gap', depth: 1, t: this.lastT, cut: this.cutAtStop });
      }
    } else {
      // الذيل دون حدّ الكلمة: آخر كلمةٍ انتهت عند حدٍّ مسموع قبله، فنهايتها مسموعة
      this.cutAtStop = false;
    }
    if (this.started && !this.frozen) {
      if (this.cues.length) {
        this.solveFinal();
        this.reconsiderMerged();
      }
      this.settleRemainder();
    }
    this.finished = true;
    for (let q = this.committed; q < this.results.length; q++) {
      if (this.results[q].status === 'current') this.results[q] = { status: 'pending', measuredMs: 0 };
    }
    this.pendingAssigned = 0;
  }

  /** اللقطة اللحظية للعرض */
  snapshot(): LiveSnapshot {
    const n = this.tjs.length;
    const P = this.prefixCount;
    /**
     * المؤشر = الكلمة الجاري قراءتها فعلًا (أول غير مُبتَّتة)، لا جبهة
     * البرمجة الدينامية: فالجبهة قد تتقدّم بكلماتٍ أُسندت ولم تُبتّ بعد
     * (تريّث COMMIT_LAG)، وكان ذلك يجعل الضوء يسبق القارئ كلمةً أو أكثر.
     * زمنُ الكلمة الجارية يُقاس من آخر حدٍّ مُبتَّت (lastCommitV) لا من
     * آخر إشارةٍ قد تكون تقديريةً متقدّمة.
     */
    const shown = this.finished || this.frozen ? this.committed : this.displayIdx();
    const cur = clamp(shown, 0, Math.max(0, n - 1));
    const win = this.windowOf(cur);
    const stalled = this.started && !this.finished && this.lastVoiceT ? this.lastT - this.lastVoiceT : 0;
    const inPrefix = shown < P && this.started && !this.finished;
    const inWord = shown < n && shown >= P && this.started && !this.finished && !this.frozen;
    // زمن الكلمة المضاءة: من نهاية الكلمة التي قبلها (مُبتَّتةً أو متقدَّمًا عليها بحدٍّ حقيقي)
    const fromV =
      shown === this.committed
        ? this.lastCommitV
        : shown === this.committed + this.displayAhead
          ? this.displayEndV
          : this.lastCueV();
    const curV = this.voicedTotal - fromV;
    // العدّادات لكلمات الآية وحدها (لا البادئة)
    const vis = this.results.slice(P);
    const judged = (st: LiveWordStatus) => st !== 'pending' && st !== 'current';
    // الكلمات التي تقدّم عليها الضوء ولم يُبتّ حكمُها بعد: «قُرئت» (الحكم يلحق)
    const words = vis.map((r, k) => {
      const win = this.windowOf(k + P);
      const base =
        !this.finished && k + P >= this.committed && k + P < shown && (r.status === 'pending' || r.status === 'current')
          ? { status: 'read' as LiveWordStatus, measuredMs: 0 }
          : { ...r };
      return { ...base, expectedMs: this.expectedOf(k + P), minMs: win.minMs, maxMs: win.maxMs };
    });
    return {
      cursor: shown - P,
      started: this.started,
      doneCount: vis.filter((r) => judged(r.status)).length,
      okCount: vis.filter((r) => r.status === 'ok' || r.status === 'excellent').length,
      violations: vis.filter((r) => r.status === 'short' || r.status === 'long' || r.status === 'silent').length,
      estimatedCount: vis.filter((r) => r.boundary === 'model' && judged(r.status)).length,
      words,
      currentVoicedMs: inWord ? Math.max(0, Math.round(curV)) : 0,
      currentExpectedMs: inWord ? this.expectedOf(cur) : 0,
      currentMinMs: inWord ? win.minMs : 0,
      currentMaxMs: inWord ? win.maxMs : 0,
      currentStretchMs: inWord ? (win.stretchMs ?? 0) : 0,
      currentHarakat: inWord ? (this.tjs[cur]?.harakat ?? 0) : 0,
      stalledMs: Math.max(0, Math.round(stalled)),
      lastAlert: this.lastAlert && this.lastAlert.index >= P ? { ...this.lastAlert, index: this.lastAlert.index - P } : null,
      lastBoundary: this.lastBoundary,
      finished: this.finished,
      voicedMs: Math.round(this.voicedTotal),
      frozen: this.frozen,
      inPrefix,
    };
  }

  /** مجموع الزمن المصوّت منذ البدء (م.ث) */
  get voiced(): number {
    return this.voicedTotal;
  }

  /**
   * تجميد المرافقة: تبيّن (بالسماع الذكي أثناء التسجيل) أن المقروء ليس نصّ
   * هذه الآية، فلا يتقدّم الضوء بعدُ على كلماتها ولا تُحكم كلمةٌ أخرى — فالمرافقة
   * الحية إنما تُرافق **هذه** الآية. ما بقي يُترك «معلَّقًا» لا «لم يُسمع».
   */
  freeze(): void {
    if (this.frozen) return;
    this.frozen = true;
    for (let q = this.committed; q < this.results.length; q++) {
      if (this.results[q].status === 'current') this.results[q] = { status: 'pending', measuredMs: 0 };
    }
    this.pendingAssigned = 0;
  }
}
