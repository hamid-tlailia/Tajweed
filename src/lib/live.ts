// TAHQĪQ — المرافقة الحية: تتبّع لحظي لتلاوتك أثناء التسجيل
//
// أثناء القراءة يُغذَّى هذا المتتبِّع بمستوى الطاقة من الميكروفون (إطارًا كل
// نحو ١٦ م.ث)، فيفصل الكلمات بفترات الصمت، ويقيس مدة كل كلمة لحظة انتهائها،
// ويحكم عليها بعتبة السماح τ نفسها التي يحكم بها التحليل الكامل:
//   • الكلمة الجارية تُضاء ذهبية ويُعرض حكمها المتوقَّع (مدّ/غنّة/قلقلة) وزمنها.
//   • الكلمة المقفلة تُصنَّف فورًا: متقنة/جيدة → خضراء، أقصر/أطول → تحذير
//     لحظي (اهتزاز ونغمة وبطاقة تنبيه)، لم تُسمع → أحمر.
// هذا تقديرٌ لحظي يهدي القراءة؛ والتحكيم النهائي الدقيق يبقى للتحليل الكامل
// بعد إيقاف التسجيل (ومقارنة القارئ المعتمد إن هُيّئت).

import { classifyWord } from './tajweed';
import { liveTip } from './coach';
import type { LiveAlert, LiveSnapshot, LiveWordStatus, WordStatus, WordTajweed } from './types';

/** مهلة إغلاق الكلمة: أطول سكتة تُعدّ فاصلة بين كلمتين (م.ث) */
const GAP_MS = 150;
/** سقف الزمن الذي تبقى الكلمة مفتوحة قبل إقفالها قسرًا (حماية من التيه) */
const MAX_OVER_MS = 900;
/** تثبيت أن الطوت بدأ: أول إطار صوتي */
const START_THR = 0.012;

export interface LiveWordEvent {
  index: number;
  word: string;
  status: WordStatus;
  measuredMs: number;
  expectedMs: number;
}

export class LiveTajweedTracker {
  private tjs: WordTajweed[];
  private words: { word: string; tajweed: WordTajweed }[];
  private tau: number;
  private onWord: ((e: LiveWordEvent) => void) | null;

  private cursor = -1;
  private inWord = false;
  private started = false;
  private finished = false;
  private voicedMs = 0;
  private silenceMs = 0;
  private lastVoiceT = 0;
  private lastT = 0;

  /** أرضية الضجيج التكيّفية */
  private floorEma = 0.0045;

  private results: { status: LiveWordStatus; measuredMs: number }[] = [];
  private doneCount = 0;
  private okCount = 0;
  private violations = 0;
  private lastAlert: LiveAlert | null = null;

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

  /** تغذية بإطار طاقة واحد (rms 0..~1) مع طابع زمني بالملي ثانية */
  feed(rms: number, tMs: number): void {
    if (this.finished || !this.tjs.length) return;
    const dt = this.lastT ? Math.max(0, Math.min(90, tMs - this.lastT)) : 16;
    this.lastT = tMs;

    // أرضية ضجيج تكيّفية (تصعد ببطء مع الهدوء، ولا تهبط تحت حدّ أدنى)
    const thr = Math.max(this.floorEma * 2.1, START_THR * 0.6, 0.007);
    if (rms < thr) this.floorEma = this.floorEma * 0.985 + Math.min(rms, this.floorEma) * 0.015 + 0.00002;
    const voiced = rms > thr;

    if (voiced) {
      this.lastVoiceT = tMs;
      if (!this.started && rms > START_THR) this.started = true;
      if (!this.inWord) {
        // بدء كلمة جديدة (لا تتجاوز عدد الكلمات)
        if (this.cursor + 1 >= this.tjs.length) return;
        this.cursor++;
        this.inWord = true;
        this.voicedMs = 0;
        this.silenceMs = 0;
        this.results[this.cursor] = { status: 'current', measuredMs: 0 };
      }
      this.voicedMs += dt;
      this.silenceMs = 0;

      // حماية: كلمة ممتدة أبعد من كل مقدار → أقفلها (ستُحكم طويلة)
      const exp = this.tjs[this.cursor].expectedMs;
      if (this.voicedMs > exp * 2.4 + MAX_OVER_MS) this.closeCurrent(tMs, false);
    } else if (this.inWord) {
      this.silenceMs += dt;
      if (this.silenceMs >= GAP_MS) this.closeCurrent(tMs, true);
    }
  }

  /** إقفال الكلمة الجارية وحكمها وإطلاق حدثها */
  private closeCurrent(_tMs: number, _byGap: boolean) {
    const i = this.cursor;
    if (i < 0 || i >= this.tjs.length) {
      this.inWord = false;
      return;
    }
    const measured = Math.round(this.voicedMs);
    const expected = this.tjs[i].expectedMs;
    const status = classifyWord(measured, expected, this.tau);
    this.results[i] = { status, measuredMs: measured };
    this.doneCount++;
    if (status === 'excellent' || status === 'ok') this.okCount++;
    else this.violations++;

    const tip = liveTip(this.words[i].word, this.tjs[i], status);
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

    this.inWord = false;
    this.voicedMs = 0;
    this.silenceMs = 0;
    this.onWord?.({ index: i, word: this.words[i].word, status, measuredMs: measured, expectedMs: expected });
  }

  /** عند إيقاف التسجيل: أقفل الكلمة الجارية وثبّت اللقطة الأخيرة */
  finish(): void {
    if (this.finished) return;
    if (this.inWord) this.closeCurrent(0, false);
    this.finished = true;
  }

  /** اللقطة اللحظية للعرض */
  snapshot(): LiveSnapshot {
    const nextIdx = this.inWord ? this.cursor : this.cursor + 1;
    const stalled = this.started && !this.finished && !this.inWord && this.lastVoiceT ? this.lastT - this.lastVoiceT : 0;
    return {
      cursor: Math.min(nextIdx, this.tjs.length),
      started: this.started,
      doneCount: this.doneCount,
      okCount: this.okCount,
      violations: this.violations,
      words: this.results.map((r) => ({ ...r })),
      currentVoicedMs: Math.round(this.voicedMs),
      currentExpectedMs: this.inWord ? this.tjs[this.cursor]?.expectedMs ?? 0 : 0,
      stalledMs: Math.max(0, Math.round(stalled)),
      lastAlert: this.lastAlert,
      finished: this.finished,
    };
  }
}
