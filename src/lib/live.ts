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

import { classifyWord } from './tajweed';
import { liveTip } from './coach';
import type { LiveAlert, LiveSnapshot, LiveWordStatus, WordStatus, WordTajweed } from './types';
import { clamp, median } from './util';

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
/** إشارة تقديرية بعد هذه النسبة من مقدار الكلمة الجاري (بلا إشارة صوتية) */
const MODEL_FORCE = 1.8;
/** وإشارة تقديرية قسرية للمدّ الممسوك بعد هذه النسبة (م.ث إضافية) */
const MODEL_HARD = 2.6;
const MODEL_HARD_ADD = 700;
/** لا تُسجَّل إشارتان أقرب من هذا (م.ث من الزمن المصوّت) */
const CUE_DEDUPE_V = 45;
/** أدنى ذيلٍ صوتي عند الإيقاف يُعدّ كلمة (دونه لا تُختلق كلمة) */
const TAIL_MIN_MS = 120;

/* ------------------------------------------------------------------ */
/* معاملات المطابقة (البرمجة الدينامية)                               */
/* ------------------------------------------------------------------ */
const DP_MAX_WORDS = 14;
const DP_MAX_CUES = 44;
/** كلفة تجاهل إشارة داخل مقطع الكلمة (نقرة مقطعٍ أو مدٍّ) */
const SKIP_CUE = 0.35;
/** كلفة إسناد كلمةٍ على أنها لم تُقرأ */
const SKIP_WORD = 1.5;
/**
 * كلفة نوع الإشارة: السكتة أدلّ على الحدّ (فهي مكافأةٌ يسيرة على استعمالها)،
 * والانخفاض أضعف، والتقدير من النموذج أضعفها.
 */
const CUE_COST: Record<LiveBoundary, number> = { gap: -0.25, dip: 0.02, model: 0.55 };
/**
 * وزن «التغطية»: عددُ الكلمات المُسندة يجب أن يملأ الزمن المصوّت المنقضي —
 * فبدونه تَرجُح للمطابقة كلمةٌ واحدة طويلة على كلمتين (إحداهما قصيرة) لأن
 * الانحراف النسبيّ عن المقدار فيها أقلّ. وهذا الحدّ هو الذي يضبط **عدد**
 * الكلمات لا مواضعها فحسب.
 */
const COVERAGE_W = 2.0;
/** عدد الإشارات التي تُترك بعد آخر كلمة يُبتّ فيها (تريَّثٌ يمنع التردّد) */
const COMMIT_LAG = 1;
/** الكلمة المتروكة لا يُبتّ فيها إلا بعد إشارتين (أشدّ تريّثًا) */
const SKIP_LAG = 2;

interface Cue {
  /** الزمن المصوّت التراكمي عند حدّ الكلمة (لا يدخل فيه الصمت) */
  v: number;
  kind: LiveBoundary;
  /** عمق الانخفاض 0..1 (للسكتة: طولها) — للأرجحية عند التعادل */
  depth: number;
  /** الطابع الزمني الحقيقي (لعرض التأخّر) */
  t: number;
}

const SKIPMARK = -2;

/** انحرافُ مقطعٍ عن مقدار كلمة — الكلفة الأساسية في المطابقة */
function durCost(len: number, exp: number): number {
  return clamp(Math.abs(len - exp) / Math.max(80, exp), 0, 4);
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
  private voicedTotal = 0;
  private lastVoiceT = 0;
  private silenceMs = 0;
  private gapCuePushed = false;

  /* --- الأغلفة --- */
  private envFast = 0;
  private envSlow = 0;
  private peakEnv = 0;
  private dipMs = 0;
  private dipStartV = 0;
  private steadyMs = 0;
  private floorEma = 0.0045;

  /* --- الإشارات والإسناد --- */
  private cues: Cue[] = [];
  private commitCueIdx = -1;
  private lastCommitV = 0;
  private committed = 0;
  /** كلمات أُسندت ولم يُبتّ فيها بعد (تنتظر التريّث) */
  private pendingAssigned = 0;

  /**
   * عدلة السرعة اللحظية: وسطيُ نِسَب ما قِيس من الكلمات إلى أزمنتها المتوقَّعة.
   * بغيرها يُحكم على قارئٍ سريعٍ بـ«أقصر» في كل كلمة — وهي ليست كذلك.
   */
  private ratios: number[] = [];
  private scale = 1;

  private results: { status: LiveWordStatus; measuredMs: number; boundary?: string }[] = [];
  private doneCount = 0;
  private okCount = 0;
  private violations = 0;
  private estimatedCount = 0;
  private lastAlert: LiveAlert | null = null;
  private lastBoundary: LiveBoundary | null = null;

  constructor(
    tjs: WordTajweed[],
    words: { word: string }[],
    tau: number,
    onWord: ((e: LiveWordEvent) => void) | null = null,
  ) {
    this.tjs = tjs;
    this.words = tjs.map((t, i) => ({ word: words[i]?.word ?? t.word, tajweed: t }));
    this.tau = tau;
    this.onWord = onWord;
    this.results = tjs.map(() => ({ status: 'pending' as LiveWordStatus, measuredMs: 0 }));
  }

  /* ------------------------------------------------------------------ */
  /* مقادير النموذج                                                      */
  /* ------------------------------------------------------------------ */
  private expectedOf(i: number): number {
    return Math.max(60, Math.round((this.tjs[i]?.expectedMs ?? 240) * this.scale));
  }

  /** نافذة الأوجه الجائزة بعدلة السرعة (قصْر/توسّط/إشباع حيث جازت) */
  private windowOf(i: number): { minMs: number; maxMs: number } {
    const t = this.tjs[i];
    if (!t) return { minMs: 60, maxMs: 600 };
    return {
      minMs: Math.max(60, Math.round(Math.min(t.minMs ?? t.expectedMs, t.expectedMs) * this.scale)),
      maxMs: Math.max(60, Math.round(Math.max(t.maxMs ?? t.expectedMs, t.expectedMs) * this.scale)),
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

    // أرضية ضجيج تكيّفية
    const thr = Math.max(this.floorEma * 2.1, START_THR * 0.6, 0.007);
    if (rms < thr) this.floorEma = this.floorEma * 0.985 + Math.min(rms, this.floorEma) * 0.015 + 0.00002;

    // غلافان: سريعٌ لكشف الانخفاض (زمنُه مستقلّ عن معدّل الإطارات)، وبطيءٌ للاستدامة
    const ka = 1 - Math.exp(-dt / TAU_ATTACK);
    const kr = 1 - Math.exp(-dt / TAU_RELEASE);
    this.envFast += (rms - this.envFast) * (rms > this.envFast ? ka : kr);
    this.envSlow += (rms - this.envSlow) * (1 - Math.exp(-dt / TAU_SLOW));

    if (rms > thr) {
      if (!this.started && rms > START_THR) this.started = true;
      this.lastVoiceT = tMs;
      this.voicedTotal += dt;
      this.silenceMs = 0;
      this.gapCuePushed = false;

      if (this.envFast > this.peakEnv) this.peakEnv = this.envFast;
      if (this.envSlow > this.peakEnv * STEADY_RATIO) this.steadyMs += dt;

      // إشارة الانخفاض: حرفُ الكلمة التالية يخفض الطاقة خفضًا بيّنًا
      const dipThr = Math.max(thr * 1.3, this.peakEnv * DIP_RATIO);
      if (this.envFast < dipThr && this.peakEnv > thr * DIP_MIN_PEAK) {
        if (this.dipMs === 0) this.dipStartV = Math.max(0, this.voicedTotal - dt);
        this.dipMs += dt;
        if (this.dipMs >= DIP_CONFIRM_MS) {
          const depth = clamp(1 - this.envFast / Math.max(1e-6, this.peakEnv), 0, 1);
          this.pushCue('dip', this.dipStartV, depth, tMs);
        }
      } else if (this.envFast >= dipThr) {
        this.dipMs = 0;
      }

      // إشارة تقديرية: مضى من الصوت ما يجاوز مقدار الكلمة الجاري بلا حدٍّ مسموع.
      // ولا يُقطع على مدٍّ ممسوك (صوتٍ مستديم) — فيُنتظر حدُّه الحقيقي.
      const fi = this.frontierIdx();
      if (fi < this.tjs.length) {
        const since = this.voicedTotal - this.lastCueV();
        const exp = this.expectedOf(fi);
        const steadyHold = since > exp * 0.6 && this.steadyMs > since * STEADY_SHARE;
        const lim = steadyHold ? exp * MODEL_HARD + MODEL_HARD_ADD : exp * MODEL_FORCE;
        if (since > lim) this.pushCue('model', this.voicedTotal, 0, tMs);
      }
    } else {
      this.silenceMs += dt;
      this.dipMs = 0;
      // إشارة السكتة: أقصرُ من مهلة الإصدار الأول بخمس مرات
      if (this.started && this.silenceMs >= GAP_CUE_MS && !this.gapCuePushed) {
        this.gapCuePushed = true;
        this.pushCue('gap', this.voicedTotal, clamp(this.silenceMs / 200, 0, 1), tMs);
      }
    }
  }

  /** تسجيل إشارة حدٍّ (مع منع التكرار) ثم مطابقة وإبتات */
  private pushCue(kind: LiveBoundary, v: number, depth: number, t: number): void {
    const last = this.cues[this.cues.length - 1];
    if (last && v - last.v < CUE_DEDUPE_V && kind !== 'model') {
      // إشارتان متقاربتان: تُحفظ الأقوى (سكتةٌ ثم انخفاضٌ = سكتة)
      if (kind === 'gap' && last.kind !== 'gap') {
        last.kind = 'gap';
        last.depth = Math.max(last.depth, depth);
      }
      return;
    }
    if (last && kind === 'model' && last.kind === 'model') return;
    this.cues.push({ v, kind, depth, t });
    // إعادة ضبط الذروة والاستدامة لبداية كلمة جديدة
    this.peakEnv = this.envFast;
    this.steadyMs = 0;
    this.dipMs = 0;
    this.solve(false);
  }

  /* ------------------------------------------------------------------ */
  /* المطابقة الجارية: برمجة دينامية على الإشارات                        */
  /* ------------------------------------------------------------------ */
  private solve(final: boolean): void {
    const n = this.tjs.length;
    const c0 = this.commitCueIdx + 1;
    const K = Math.min(this.cues.length - c0, DP_MAX_CUES);
    const W = Math.min(n - this.committed, DP_MAX_WORDS);
    if (K <= 0 || W <= 0) {
      this.pendingAssigned = 0;
      return;
    }
    const v0 = this.commitCueIdx >= 0 ? this.cues[this.commitCueIdx].v : this.lastCommitV;
    const V: number[] = new Array(K);
    const kinds: LiveBoundary[] = new Array(K);
    for (let i = 0; i < K; i++) {
      V[i] = this.cues[c0 + i].v;
      kinds[i] = this.cues[c0 + i].kind;
    }
    const E: number[] = new Array(W);
    for (let j = 0; j < W; j++) E[j] = this.expectedOf(this.committed + j);

    const INF = 1e9;
    // h[j][i]: أدنى كلفة لإسناد الكلمات j0..j على أن تنتهي الكلمة j عند الإشارة i
    const h: number[][] = [];
    const bk: number[][] = [];
    for (let j = 0; j < W; j++) {
      const hj = new Array<number>(K).fill(INF);
      const bj = new Array<number>(K).fill(-9);
      for (let i = 0; i < K; i++) {
        let best = INF;
        let bi = -9;
        // أ) الكلمة j تأخذ المقطع (V[i2], V[i]] — وi2 = -1 يعني بدايةَ الجلسة
        for (let i2 = j === 0 ? -1 : 0; i2 < i; i2++) {
          const prev = j === 0 ? (i2 === -1 ? 0 : INF) : h[j - 1][i2];
          if (prev >= INF) continue;
          const start = i2 === -1 ? v0 : V[i2];
          const skipped = i2 === -1 ? i : i - i2 - 1;
          const c =
            prev +
            durCost(V[i] - start, E[j]) +
            SKIP_CUE * skipped +
            CUE_COST[kinds[i]];
          if (c < best) {
            best = c;
            bi = i2;
          }
        }
        // ب) الكلمة j لم تُقرأ: لا مقطع لها، وتبقى الجبهة عند الإشارة i
        if (j > 0 && h[j - 1][i] + SKIP_WORD < best) {
          best = h[j - 1][i] + SKIP_WORD;
          bi = SKIPMARK;
        }
        hj[i] = best;
        bj[i] = bi;
      }
      h.push(hj);
      bk.push(bj);
    }

    // الجبهة: عدد الكلمات التي تملأ الزمن المصوّت حتى آخر إشارة، مع شرط
    // التغطية (مجموع مقادير الكلمات المُسندة ≈ الزمن المنقضي)
    let bestJ = -1;
    let bestC = INF;
    const elapsed = V[K - 1] - v0;
    let cumE = 0;
    for (let j = 0; j < W; j++) {
      cumE += E[j];
      const cov = elapsed > 60 ? Math.abs(cumE - elapsed) / elapsed : 0;
      const c = h[j][K - 1] + COVERAGE_W * cov;
      if (c < bestC) {
        bestC = c;
        bestJ = j;
      }
    }
    if (bestJ < 0) {
      this.pendingAssigned = 0;
      return;
    }

    // استرجاع الإسناد
    const assign: number[] = new Array(W).fill(-9);
    let j = bestJ;
    let i = K - 1;
    while (j >= 0 && i >= 0) {
      const b = bk[j][i];
      if (b === SKIPMARK) {
        assign[j] = SKIPMARK;
        j--;
        continue;
      }
      assign[j] = c0 + i;
      j--;
      i = b;
    }

    // الإبتات: ما تأخّرت عنه إشارةٌ (أو إشارتان للكلمة المتروكة)
    const lag = final ? 0 : COMMIT_LAG;
    const limit = c0 + K - 1 - lag;
    let k = 0;
    let committedNow = 0;
    while (k <= bestJ) {
      const a = assign[k];
      const absIdx = this.committed + committedNow;
      if (a === SKIPMARK) {
        const nxt = assign[k + 1];
        if (nxt === undefined || nxt === SKIPMARK || nxt < 0 || nxt > c0 + K - 1 - (final ? 0 : SKIP_LAG)) break;
        this.commitWord(absIdx, 0, 'skipped');
        committedNow++;
        k++;
        continue;
      }
      if (a < 0 || a > limit) break;
      const endV = this.cues[a].v;
      this.commitWord(absIdx, Math.max(0, endV - this.lastCommitV), this.cues[a].kind);
      this.lastCommitV = endV;
      this.commitCueIdx = a;
      committedNow++;
      k++;
    }
    this.committed += committedNow;
    this.pendingAssigned = Math.max(0, bestJ + 1 - committedNow);

    // ما تبقّى من الكلمات: «جارية» حتى يُبتّ فيها
    for (let q = this.committed; q < this.committed + this.pendingAssigned && q < n; q++) {
      if (this.results[q].status === 'pending') this.results[q] = { status: 'current', measuredMs: 0 };
    }
    if (this.committed < n && this.results[this.committed].status === 'pending') {
      this.results[this.committed] = { status: 'current', measuredMs: 0 };
    }
  }

  /** إبتات كلمة: حكمها، وتنبيهها، وتحديث عدلة السرعة */
  private commitWord(i: number, measuredRaw: number, boundary: LiveBoundary | 'skipped'): void {
    if (i < 0 || i >= this.tjs.length) return;
    const measured = Math.round(measuredRaw);
    const acoustic = boundary === 'gap' || boundary === 'dip';
    const expected = this.expectedOf(i);

    if (boundary === 'skipped') {
      this.results[i] = { status: 'silent', measuredMs: 0, boundary };
      this.doneCount++;
      this.violations++;
      this.lastBoundary = null;
      this.onWord?.({
        index: i,
        word: this.words[i].word,
        status: 'silent',
        measuredMs: 0,
        expectedMs: expected,
        boundary,
        measured: false,
      });
      const tip = liveTip(this.words[i].word, this.tjs[i], 'silent');
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

    if (acoustic) {
      if (measured >= MIN_VOICED_MS && this.tjs[i].expectedMs > 0) {
        this.ratios.push(measured / this.tjs[i].expectedMs);
        if (this.ratios.length >= 2) this.scale = clamp(median(this.ratios), 0.55, 2);
      }
    } else {
      this.estimatedCount++;
    }

    // الكلمة المقدَّرة من النموذج لا يُقضى عليها بقصرٍ ولا بطول: زمنُها لم
    // يُقس من الصوت — ويُترك الحكم للتحليل الكامل بعد الإيقاف.
    const status: WordStatus = acoustic
      ? classifyWord(measured, expected, this.tau, this.windowOf(i))
      : measured < MIN_VOICED_MS
        ? 'silent'
        : 'ok';

    this.results[i] = { status, measuredMs: measured, boundary };
    this.doneCount++;
    if (status === 'excellent' || status === 'ok') this.okCount++;
    else this.violations++;
    this.lastBoundary = boundary;

    const tip = acoustic ? liveTip(this.words[i].word, this.tjs[i], status) : null;
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

    this.onWord?.({
      index: i,
      word: this.words[i].word,
      status,
      measuredMs: measured,
      expectedMs: expected,
      boundary,
      measured: acoustic,
    });
  }

  /** عند إيقاف التسجيل: إشارةٌ ختامية ثم إبتاتُ كل ما أُسند */
  finish(): void {
    if (this.finished) return;
    const tail = this.voicedTotal - this.lastCueV();
    if (this.started && tail >= TAIL_MIN_MS) {
      this.cues.push({ v: this.voicedTotal, kind: 'gap', depth: 1, t: this.lastT });
      this.solve(true);
    } else if (this.cues.length) {
      this.solve(true);
    }
    this.finished = true;
    // ما لم يُبتّ فيه يبقى «معلَّقًا» — والتحليل الكامل هو الفيصل
    for (let q = this.committed; q < this.results.length; q++) {
      if (this.results[q].status === 'current') this.results[q] = { status: 'pending', measuredMs: 0 };
    }
    this.pendingAssigned = 0;
  }

  /** اللقطة اللحظية للعرض */
  snapshot(): LiveSnapshot {
    const n = this.tjs.length;
    const fi = this.frontierIdx();
    const idx = clamp(fi, 0, Math.max(0, n - 1));
    const win = this.windowOf(idx);
    const stalled = this.started && !this.finished && this.lastVoiceT ? this.lastT - this.lastVoiceT : 0;
    const inWord = fi < n && this.started && !this.finished;
    const curV = this.voicedTotal - this.lastCueV();
    return {
      cursor: fi,
      started: this.started,
      doneCount: this.doneCount,
      okCount: this.okCount,
      violations: this.violations,
      estimatedCount: this.estimatedCount,
      words: this.results.map((r) => ({ ...r })),
      currentVoicedMs: inWord ? Math.max(0, Math.round(curV)) : 0,
      currentExpectedMs: inWord ? this.expectedOf(idx) : 0,
      currentMinMs: inWord ? win.minMs : 0,
      currentMaxMs: inWord ? win.maxMs : 0,
      currentHarakat: inWord ? (this.tjs[idx]?.harakat ?? 0) : 0,
      stalledMs: Math.max(0, Math.round(stalled)),
      lastAlert: this.lastAlert,
      lastBoundary: this.lastBoundary,
      finished: this.finished,
    };
  }
}
