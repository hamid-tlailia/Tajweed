// TAHQĪQ — خلاصة تعليمية بعد كل تلاوة: أين أخطأ القارئ وماذا يفعل
//
// لا يكفي وسم «أقصر من المطلوب»؛ المتعلّم يحتاج جملةً واحدةً لكل مخالفة
// تربط الحكم (مد/غنة/قلقلة…) بفعلٍ واضح.

import { stripTashkeel } from './tajweed';
import type { CoachTip, TextCheck, WordAlignment, WordStatus } from './types';
import { PASS_SCORE } from './types';
import type { WordTajweed } from './types';

function displayWord(w: string): string {
  return stripTashkeel(w) || w;
}

/**
 * نصيحة موجزة لكلمة بحكمها — تُستخدم في خلاصة التحليل الكامل وفي التنبيه
 * اللحظي أثناء القراءة الحية (بلا اعتماد على نتيجة محاذاة كاملة).
 */
export function liveTip(rawWord: string, tj: WordTajweed, status: WordStatus, index = 0): CoachTip | null {
  const word = displayWord(rawWord);
  const madd = tj.rules.find((x) => x.label.includes('مَدّ') || x.label.startsWith('مَدُّ'))?.label ?? tj.maddType;
  const ghunna = tj.rules.find((x) => x.label.includes('غُن'))?.label ?? tj.ghunnaType;
  const qalqala = tj.rules.find((x) => x.label.includes('قَلْقَل'))?.label;

  if (status === 'excellent' || status === 'ok') return null;

  if (status === 'silent') {
    return {
      index,
      word,
      status,
      title: 'لم تُسمع',
      action: `كلمة «${word}» لم يصل صوتها. قرِّب الميكروفون وأعد قراءتها بوضوح دون إسقاط حروف.`,
    };
  }

  if (status === 'short') {
    if (madd) {
      return {
        index,
        word,
        status,
        title: 'قصّرت المد',
        action: `قصّرت «${madd}» في «${word}». أطلِ حرف المد بمقدار حركاته ولا تقطعه مع نفسك.`,
      };
    }
    if (ghunna) {
      return {
        index,
        word,
        status,
        title: 'قصّرت الغنّة',
        action: `الغنّة في «${word}» أقصر من حركتين. أبقِ صوت الخيشوم واضحًا مقدار حركتين قبل أن تنتقل.`,
      };
    }
    if (qalqala) {
      return {
        index,
        word,
        status,
        title: 'خفّت القلقلة',
        action: `قلقلة «${word}» لم تظهر. أظهر قلقلة الحرف (قُطْبُ جَدٍّ) بانفراجٍ صوتيّ بعد سكونه، ولا تبتلعه.`,
      };
    }
    return {
      index,
      word,
      status,
      title: 'أسرع من المقدار',
      action: `«${word}» أسرع من مرتبة قراءتك. تمهّل على الحركات ولا تبلع الحرف.`,
    };
  }

  // long
  if (madd) {
    return {
      index,
      word,
      status,
      title: 'أطلت المد',
      action: `أطلت «${madd}» في «${word}» فوق مقداره. خفّف المد والتزم عدد حركاته.`,
    };
  }
  if (ghunna) {
    return {
      index,
      word,
      status,
      title: 'أطلت الغنّة',
      action: `غنّة «${word}» أطول من حركتين. اقطع الغنّة بعد حركتين وانتقل.`,
    };
  }
  return {
    index,
    word,
    status,
    title: 'أطول من المقدار',
    action: `«${word}» أُطيلت فوق مرتبة قراءتك. خفّف التمطيط قليلًا.`,
  };
}

function tipFor(w: WordAlignment): CoachTip | null {
  return liveTip(w.word, w.tajweed, w.status, w.index);
}

/** بوّابة النصّ كما تصل من التحليل (انظر AlignmentResult.textCheck) */
export interface TextGateInfo {
  textCheck: TextCheck;
  recall?: number;
  precision?: number;
  /** كلمات الآية التي لم تتبيّن في المسموع ولا ما يشبهها (مع ما سُمع بدلها إن سُمع) */
  missing?: { word: string; heard?: string }[];
}

/** «الفلق» (سُمع بدلها «الناس») */
function missingList(missing: { word: string; heard?: string }[], max = 3): string {
  return missing
    .slice(0, max)
    .map((m) => `«${displayWord(m.word)}»${m.heard ? ` (سُمع بدلها «${m.heard}»)` : ''}`)
    .join('، ');
}

/**
 * جملة بوّابة النصّ للخلاصة — لماذا لم يُعتمد النصّ، وماذا يفعل القارئ.
 * تُميّز بين: كلامٍ آخر، وآيةٍ أخرى/زيادةٍ عليها، وبعض الآية، وسماعٍ لم يجرِ.
 */
export function textGateMessage(info: TextGateInfo, transcriptMatch: number, n: number): string | null {
  const pct = Math.round(transcriptMatch * 100);
  const recall = info.recall ?? 0;
  const precision = info.precision ?? 0;
  const heard = Math.round(recall * n);
  const missing = info.missing ?? [];
  switch (info.textCheck) {
    case 'ok':
    case 'demo':
      return null;
    case 'unverified':
      return (
        'لم يُتحقَّق من نصّ التلاوة بعد (قِيست الأزمنة وحدها) — الاجتياز لا يُعتمد إلا بعد السماع الذكي: ' +
        'جهّزه من «الإعدادات» أو اضغط «إعادة تقييم».'
      );
    case 'weak':
      if (precision >= 0.6 && missing.length > Math.max(2, n / 3)) {
        return `سُمع بعضُ الآية فقط (${Math.max(0, n - missing.length)} من ${n} كلمة، تطابق ${pct}٪) — أكمل الآية كلَّها ليُعتمد الاجتياز.`;
      }
      if (transcriptMatch >= 0.5 && missing.length) {
        const subs = missing.filter((m) => m.heard).length;
        return (
          `${missing.length === 1 ? 'كلمةٌ من الآية لم تُسمع في موضعها' : `${missing.length} كلمات من الآية لم تُسمع في موضعها`}: ${missingList(missing)} — ` +
          (subs
            ? 'فما قُرئ ليس الآية بنصّها. اقرأ الآية كما في المصحف ليُعتمد الاجتياز.'
            : 'أعد التلاوة بنطقٍ أوضح لكل كلمة (وإن تكرّر ذلك فجرّب النموذج «الأدقّ»).')
        );
      }
      if (precision >= 0.6 && recall < 0.6) {
        return `سُمع بعضُ الآية فقط (${heard} من ${n} كلمة، تطابق ${pct}٪) — أكمل الآية كلَّها ليُعتمد الاجتياز.`;
      }
      return (
        `تبيّن بعضُ نصّ الآية فقط (تطابق ${pct}٪) — اقرأ الآية كاملةً بوضوحٍ وقربٍ من الميكروفون، ` +
        'وإن تكرّر ذلك فجرّب النموذج «الأدقّ» من الإعدادات.'
      );
    case 'mismatch':
    default:
      if (recall >= 0.6 && precision < 0.4) {
        return `سُمع نصُّ الآية ومعه زيادةٌ كثيرة عليه (تطابق ${pct}٪) — اقرأ الآية المختارة وحدها.`;
      }
      return (
        `ما سُمع من الألفاظ ليس نصَّ هذه الآية (تطابق ${pct}٪) — لعلّك قرأت آيةً غيرها أو كلامًا آخر. ` +
        'اقرأ الآية المختارة كما هي؛ فالأزمنة لا تُحتسب لنصٍّ غيرها.'
      );
  }
}

export function buildCoach(
  words: WordAlignment[],
  score: number,
  transcriptMatch: number,
  matchSource: 'transcript' | 'coverage' | 'demo',
  tempoScale = 1,
  text: TextGateInfo = { textCheck: matchSource === 'demo' ? 'demo' : matchSource === 'coverage' ? 'unverified' : 'ok' },
): { tips: CoachTip[]; summary: string; passed: boolean } {
  const tips = words.map(tipFor).filter((x): x is CoachTip => !!x);
  const n = words.length || 1;
  const silent = words.filter((w) => w.status === 'silent').length;
  const short = words.filter((w) => w.status === 'short').length;
  const long = words.filter((w) => w.status === 'long').length;
  const good = words.filter((w) => w.status === 'excellent' || w.status === 'ok').length;
  const textOk = text.textCheck === 'ok' || text.textCheck === 'demo';

  /**
   * بابٌ ثانٍ للاجتياز غير الدرجة: فالدرجةُ متوسِّطٌ، ومتوسِّطٌ قد يرتفع
   * بكلماتٍ صحيحةٍ كثيرة وإن خرجت كلماتٌ أخرى خروجًا بيّنًا عن الأوجه الجائزة
   * (كأن يقرأ الآية كلّها بإيقاعٍ واحد فلا يُميّز مدًّا من غيره). فلا تجتاز
   * تلاوةٌ كان ثلثُ كلماتها أو أكثر خارج المقدار — والكلمة المتروكة تُعدّ
   * بأكثر من خارجة، لأن إسقاط الكلمة أفحش من تطويلها أو تقصيرها.
   */
  const fault = short + long + Math.round(2.5 * silent);
  const allowedFault = Math.max(1, Math.round(n / 3));
  const withinFault = fault <= allowedFault;
  const timingPassed = score >= PASS_SCORE && withinFault;
  /**
   * والبابُ الأول قبل ذلك كلِّه: أن يكون المقروءُ هو الآية. فلا تُجاز تلاوةٌ
   * لم يُسمع نصُّها أو سُمع فخالف — مهما حسُنت أزمنتُها.
   */
  const passed = timingPassed && textOk;

  const parts: string[] = [];
  const gateMsg = textGateMessage(text, transcriptMatch, n);
  if (!textOk) {
    if (gateMsg) parts.push(gateMsg);
    if (text.textCheck === 'unverified') {
      parts.push(
        timingPassed
          ? `أزمنتك لحظيًّا حسنة (${score}%، ${good} من ${n} كلمة في المقدار) — وتُعتمد بعد التحقّق من النصّ.`
          : `وأزمنتك لحظيًّا ${score}%: ${good} من ${n} كلمة في المقدار.`,
      );
      if (tips[0]) parts.push(`ابدأ بإصلاح: ${tips[0].action}`);
    } else if (text.textCheck === 'weak' && tips[0]) {
      parts.push(`ومن جهة الأزمنة ابدأ بإصلاح: ${tips[0].action}`);
    }
  } else if (passed) {
    parts.push(`أحسنت — ${score}% درجة جيدة. ${good} من ${n} كلمة في المقدار.`);
    if (text.missing?.length) {
      parts.push(
        `غير أن ${text.missing.length === 1 ? 'كلمة' : 'كلمات'} ${missingList(text.missing)} لم تتبيّن في المسموع كما في المصحف — تحقّق من نطقها.`,
      );
    }
    if (tips.length) parts.push(`بقيَت ${tips.length} ملاحظة خفيفة راجعها قبل الآية التالية.`);
    else parts.push('لا ملاحظات على الأزمنة. انتقل للآية التالية متى شئت.');
  } else if (score >= PASS_SCORE) {
    parts.push(
      `الدرجة ${score}% بلغت حدّ الاجتياز، غير أن ${fault > n ? n : short + long + silent} من ${n} كلمة ` +
        `خرجت عن المقدار الجائز — والحدّ ثلثُ الكلمات (${allowedFault}).`,
    );
    if (silent) parts.push(`منها ${silent} كلمة لم تُسمع.`);
    if (short) parts.push(`و${short} كلمة أقصر من أدنى الأوجه (غالبًا مدّ أو غنّة ناقصة).`);
    if (long) parts.push(`و${long} كلمة أطول من أعلاها.`);
    if (tips[0]) parts.push(`ابدأ بإصلاح: ${tips[0].action}`);
  } else {
    parts.push(`الدرجة ${score}% — لم تبلغ حدّ الاجتياز (${PASS_SCORE}%).`);
    if (silent) parts.push(`${silent} كلمة لم تُسمع.`);
    if (short) parts.push(`${short} كلمة أقصر من المطلوب (غالبًا مدّ أو غنّة ناقصة).`);
    if (long) parts.push(`${long} كلمة أطول من المطلوب.`);
    if (tips[0]) parts.push(`ابدأ بإصلاح: ${tips[0].action}`);
    else parts.push('أعد التلاوة أوضح وأقرب من الميكروفون، وراجع مرتبة القراءة (حدر/تدوير/ترتيل).');
  }

  // ملاحظة السرعة لا معنى لها إن لم يكن المقروء هو الآية
  if (textOk && tempoScale && (tempoScale < 0.82 || tempoScale > 1.22)) {
    const dir = tempoScale < 1 ? 'أسرع' : 'أبطأ';
    parts.push(
      `قراءتك ${dir} من مرتبتك المختارة بنحو ${tempoScale.toFixed(2)}× — قِيسَتْ أحكامُك بعدلة سرعتك،` +
        ` والأزمنة المعروضة لك هي أزمنة مرتبتك أنت. قرِّب سرعتك من المرتبة المختارة ليصفو القياس.`,
    );
  }

  return { tips, summary: parts.join(' '), passed };
}
