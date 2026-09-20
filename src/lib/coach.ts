// TAHQĪQ — خلاصة تعليمية بعد كل تلاوة: أين أخطأ القارئ وماذا يفعل
//
// لا يكفي وسم «أقصر من المطلوب»؛ المتعلّم يحتاج جملةً واحدةً لكل مخالفة
// تربط الحكم (مد/غنة/قلقلة…) بفعلٍ واضح.

import { stripTashkeel } from './tajweed';
import type { CoachTip, WordAlignment, WordStatus } from './types';
import { PASS_SCORE } from './types';

function displayWord(w: string): string {
  return stripTashkeel(w) || w;
}

function firstMadd(w: WordAlignment): string | null {
  const r = w.tajweed.rules.find((x) => x.label.includes('مَدّ') || x.label.startsWith('مَدُّ'));
  return r?.label ?? w.tajweed.maddType;
}

function firstGhunna(w: WordAlignment): string | null {
  const r = w.tajweed.rules.find((x) => x.label.includes('غُن'));
  return r?.label ?? w.tajweed.ghunnaType;
}

function tipFor(w: WordAlignment): CoachTip | null {
  const word = displayWord(w.word);
  const madd = firstMadd(w);
  const ghunna = firstGhunna(w);
  const qalqala = w.tajweed.rules.find((x) => x.label.includes('قَلْقَل'));
  const status: WordStatus = w.status;

  if (status === 'excellent' || status === 'ok') return null;

  if (status === 'silent') {
    return {
      index: w.index,
      word,
      status,
      title: 'لم تُسمع',
      action: `كلمة «${word}» لم يصل صوتها. قرِّب الميكروفون وأعد قراءتها بوضوح دون إسقاط حروف.`,
    };
  }

  if (status === 'short') {
    if (madd) {
      return {
        index: w.index,
        word,
        status,
        title: 'قصّرت المد',
        action: `قصّرت «${madd}» في «${word}». أطلِ حرف المد بمقدار حركاته ولا تقطعه مع نفسك.`,
      };
    }
    if (ghunna) {
      return {
        index: w.index,
        word,
        status,
        title: 'قصّرت الغنّة',
        action: `الغنّة في «${word}» أقصر من حركتين. أبقِ صوت الخيشوم واضحًا مقدار حركتين قبل أن تنتقل.`,
      };
    }
    if (qalqala) {
      return {
        index: w.index,
        word,
        status,
        title: 'خفّت القلقلة',
        action: `قلقلة «${word}» لم تظهر. أظهر bounce الحرف (قطب جد) بوضوح عند النطق.`,
      };
    }
    return {
      index: w.index,
      word,
      status,
      title: 'أسرع من المقدار',
      action: `«${word}» أسرع من مرتبة قراءتك. تمهّل على الحركات ولا تبلع الحرف.`,
    };
  }

  // long
  if (madd) {
    return {
      index: w.index,
      word,
      status,
      title: 'أطلت المد',
      action: `أطلت «${madd}» في «${word}» فوق مقداره. خفّف المد والتزم عدد حركاته.`,
    };
  }
  if (ghunna) {
    return {
      index: w.index,
      word,
      status,
      title: 'أطلت الغنّة',
      action: `غنّة «${word}» أطول من حركتين. اقطع الغنّة بعد حركتين وانتقل.`,
    };
  }
  return {
    index: w.index,
    word,
    status,
    title: 'أطول من المقدار',
    action: `«${word}» أُطيلت فوق مرتبة قراءتك. خفّف التمطيط قليلًا.`,
  };
}

export function buildCoach(
  words: WordAlignment[],
  score: number,
  transcriptMatch: number,
  matchSource: 'transcript' | 'coverage' | 'demo',
): { tips: CoachTip[]; summary: string; passed: boolean } {
  const tips = words.map(tipFor).filter((x): x is CoachTip => !!x);
  const passed = score >= PASS_SCORE;
  const n = words.length || 1;
  const silent = words.filter((w) => w.status === 'silent').length;
  const short = words.filter((w) => w.status === 'short').length;
  const long = words.filter((w) => w.status === 'long').length;
  const good = words.filter((w) => w.status === 'excellent' || w.status === 'ok').length;

  const parts: string[] = [];
  if (passed) {
    parts.push(`أحسنت — ${score}% درجة جيدة. ${good} من ${n} كلمة في المقدار.`);
    if (tips.length) parts.push(`بقيَت ${tips.length} ملاحظة خفيفة راجعها قبل الآية التالية.`);
    else parts.push('لا ملاحظات على الأزمنة. انتقل للآية التالية متى شئت.');
  } else {
    parts.push(`الدرجة ${score}% — لم تبلغ حدّ الاجتياز (${PASS_SCORE}%).`);
    if (silent) parts.push(`${silent} كلمة لم تُسمع.`);
    if (short) parts.push(`${short} كلمة أقصر من المطلوب (غالبًا مدّ أو غنّة ناقصة).`);
    if (long) parts.push(`${long} كلمة أطول من المطلوب.`);
    if (tips[0]) parts.push(`ابدأ بإصلاح: ${tips[0].action}`);
    else parts.push('أعد التلاوة أوضح وأقرب من الميكروفون، وراجع مرتبة القراءة (حدر/تدوير/ترتيل).');
  }

  if (matchSource === 'coverage') {
    parts.push('السماع الذكي لم يميّز نصّ الآية، فاعتُمدت تغطية الكلمات المسموعة. إن أمكن جهّز السماع الأدقّ.');
  } else if (transcriptMatch < 0.45 && matchSource === 'transcript') {
    parts.push('ما سُمع من الألفاظ ابتعد عن نصّ الآية — تأكّد أنك تقرأ الآية المختارة دون زيادة أو نقص.');
  }

  return { tips, summary: parts.join(' '), passed };
}
