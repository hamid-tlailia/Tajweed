// TAHQĪQ — forced alignment engine (orchestrator)
//
// Engine chain (automatic fallback on any failure):
//   1. whisper-attn   — Whisper (ONNX/WASM) teacher-forced pass + cross-attention timing
//   2. whisper-energy — Whisper transcription (similarity) + energy-peak forced alignment
//   3. offline-dtw    — pure in-browser energy/DTW-style forced alignment (no AI, always works)

import { energyEnvelope, speechPresence } from './audio';
import { buildCoach } from './coach';
import { ayahLabel, classifyUtterance, loadCorpus, utteranceTokens } from './corpus';
import { editClose, normalizeForMatch, scoreTranscriptMatch, textCheckOf } from './match';
import type { TranscriptScore } from './match';
import { BASMALA_WORDS, startsWithBasmalaWords, targetTextOf } from './quran';
import { TEMPO_SCALE, analyzeTargetWords, classifyWord, normalizeArabic, scaledWindow, tajweedScore, verdictFor } from './tajweed';
import { estimateTempo, lenientMin, priorCenter } from './tempo';
import type { TextCheck } from './types';
import type {
  AlignmentResult,
  EngineId,
  ModelEvent,
  ModelSize,
  Riwayah,
  TargetSpec,
  Tempo,
  WordAlignment,
  WordTajweed,
} from './types';
import { clamp, mean } from './util';
import { loadWhisper, whisperForcedAlignment, whisperTranscribeChunked, type TsChunk } from './whisper';

export interface AlignInput {
  samples: Float32Array;
  sampleRate?: number;
  url?: string | null;
  demo?: boolean;
}

export interface AlignOpts {
  tau: number;
  modelSize: ModelSize;
  target: TargetSpec;
  riwayah: Riwayah;
  tempo: Tempo;
  /**
   * التقييم اللحظي: تحليلٌ فوريّ بقياس الصوت وحده (بلا سماع ذكي)، فيظهر
   * الحكم خلال عُشر ثانية بدلًا من ثوانٍ. وهو أدنى دقةً في تمييز الألفاظ
   * (لا نصّ مسموعًا) لكن أزمنةَ الكلمات تُقاس بالمحرّك نفسه.
   */
  fast?: boolean;
  /**
   * القارئ المرجعي (المختار أو التلقائي بحسب المرتبة ونوع التلاوة): سرعته المقيسة
   * مركزُ عدلة السرعة — فكل تحليلٍ يُقاس إلى قارئٍ معتمد لا إلى نفسه.
   */
  reference?: { id: string; name: string; pace: number | null };
  /** نص مساعد التقطته واجهة Speech-to-Text الأصلية في المتصفح بالتوازي.
   * نختار بينه وبين Whisper بحسب الأعلى مطابقةً، ولا نثق به لمجرد وجوده. */
  browserTranscript?: string;
}

export interface AlignHooks {
  stage: (s: string) => void;
  model?: (e: ModelEvent) => void;
}

const ATTN_MAX_WORDS = 60; // attention matrix size guard
const ATTN_MAX_SEC = 31; // whisper context window guard

/** طول إطار الطاقة (م.ث) — ٢٠ م.ث تُعطي حدودًا أدقّ من ٤٠ للكلمات القصيرة */
const FRAME_MS = 20;
/** أدنى زمنٍ يُعدّ كلمة مسموعة؛ دونه تُحكم الكلمة «لم تُسمع» */
const MIN_VOICED_MS = 70;
/** أدنى عرضٍ يبقى للكلمة عند فضّ تداخل الحدود (إطاران) */
const MIN_SPAN_MS = 2 * FRAME_MS;
/** أدنى زمن كلامٍ يميّز إخفاق السماع عن الصمت/الضجيج (م.ث) */
const MIN_FALLBACK_SPEECH_MS = 600;

export async function runAlignment(input: AlignInput, opts: AlignOpts, hooks: AlignHooks): Promise<AlignmentResult> {
  const sr = input.sampleRate ?? 16000;
  const samples = input.samples;
  const durationMs = (samples.length / sr) * 1000;
  const ayahWords = opts.target.words;
  const tempo = opts.tempo ?? 'tartil';
  /**
   * كلمات المحاذاة: كلمات الآية — وقد تُسبَق بالبسملة إن تبيّن من المسموع أن
   * القارئ ابتدأ بها (أول السورة) وليست من نصّ الآية: فتُحاذى معها لئلا يُحسب
   * صوتُها على أول كلمات الآية، ثم تُحذف من النتيجة (لا تُحكم ولا تدخل الدرجة).
   */
  let words = ayahWords;
  let tjs: WordTajweed[] = analyzeTargetWords(words, opts.riwayah, tempo);
  let prefixCount = 0;

  hooks.stage('تهيئة الصوت المسجَّل…');
  const energy = energyEnvelope(samples, FRAME_MS);
  /**
   * هل في التسجيل كلامُ إنسانٍ أصلًا؟ (انظر audio.speechPresence)
   *
   * لا يُعتمد على عتبة الصوت وحدها: فهي نسبية، فتسجيلٌ ليس فيه إلا ضجيجُ الغرفة
   * يُعدّ كلُّه «صوتًا»، ثم يُوزَّع على كلمات الآية بأوزان أزمنتها المتوقَّعة
   * فتخرج أزمنةُ الكلمات مطابقةً للمتوقَّع — وكانت النتيجة أن **السكوت يُجاز**:
   * درجةٌ حسنة وكلماتٌ «في المقدار» لقارئٍ لم ينطق حرفًا.
   */
  const presence = speechPresence(samples, FRAME_MS);
  /**
   * السؤال هنا: **هل تكلّم أحدٌ أصلًا؟** — لا «هل أتمّ الآية؟». فلا يُربط الحدّ
   * بزمن الآية المتوقَّع: من قرأ ﴿الٓمٓ﴾ في ثانيةٍ (وهي تمدّ ستّ حركات) تكلّم
   * وقصّر، فحكمُه «أقصر» لا «لم يُسمع كلام». وأمّا القصر والإسقاط فيتولّاهما
   * بوّابةُ النصّ وبوّابةُ الأزمنة.
   */
  const noSpeech = !input.demo && !presence.hasSpeech;

  let engine: EngineId = 'offline-dtw';
  let perWord: { midMs: number; conf: number }[] | null = null;
  let transcript = '';
  let transcriptMatch = 0;
  let matchSource: AlignmentResult['matchSource'] = 'coverage';
  let predWords: { word: string; ok: boolean }[] = [];
  let textRecall: number | undefined;
  let textPrecision: number | undefined;
  /** نتيجة مطابقة النصّ (إن سُمع بالألفاظ) */
  let scored: TranscriptScore | null = null;
  /** كلمات الآية التي لم تتبيّن في المسموع ولا ما يشبهها (لتُذكر في الخلاصة) */
  let textMissing: { word: string; heard?: string }[] = [];
  /** ماذا يشبه المسموع بمطابقة المصحف كلّه: الآية / آية أخرى / كلام عادي */
  let textKind: AlignmentResult['textKind'];
  let heardOf: AlignmentResult['heardOf'];
  /** السماع الذكي استمع فعلًا فلم يتبيّن في الصوت لفظٌ عربيٌّ واحد */
  let heardNothing = false;

  if (!input.demo && !opts.fast) {
    try {
      hooks.model?.({ status: 'loading', progress: 0 });
      const b = await loadWhisper(opts.modelSize, (p) =>
        hooks.model?.({ status: 'loading', progress: p.progress ?? 0 }),
      );
      hooks.model?.({ status: 'ready', progress: 1 });

      hooks.stage('الاستماع إلى التلاوة…');
      const tsOut = await whisperTranscribeChunked(b, samples, 4, (i, total) =>
        hooks.stage(
          total > 1 ? `الاستماع — المقطع ${i + 1} من ${total}…` : 'الاستماع إلى التلاوة…',
        ),
      );
      transcript = tsOut.text;
      // Web Speech أدقّ غالبًا في العربية القصيرة، وWhisper أنفع حين لا يدعمه
      // المتصفح. نقارن التفريغين إلى الهدف ونأخذ الأقوى بدل دمجهما (فالدمج
      // يكرر الكلمات ويخفض الدقة). ومع التعادل نفضّل نص المتصفح غير الفارغ.
      const whisperScore = scoreTranscriptMatch(transcript, targetTextOf(opts.target));
      const browserText = String(opts.browserTranscript ?? '').trim();
      const browserScore = browserText ? scoreTranscriptMatch(browserText, targetTextOf(opts.target)) : null;
      if (browserScore && browserScore.match >= whisperScore.match) transcript = browserText;
      const sc = browserScore && browserScore.match >= whisperScore.match ? browserScore : whisperScore;
      transcriptMatch = sc.match;
      predWords = sc.predWords;
      heardNothing = sc.empty;
      if (!sc.empty) {
        scored = sc;
        matchSource = 'transcript';
        textRecall = sc.recall;
        textPrecision = sc.precision;
        textMissing = sc.missing.map((m) => ({ word: ayahWords[m.index]?.word ?? m.word, heard: m.heard }));
        if (sc.basmalaPrefix && !startsWithBasmalaWords(ayahWords.map((w) => w.word))) {
          const prefix = BASMALA_WORDS.map((w) => ({ word: w, ayah: ayahWords[0]?.ayah ?? 1 }));
          words = [...prefix, ...ayahWords];
          tjs = analyzeTargetWords(words, opts.riwayah, tempo);
          prefixCount = prefix.length;
        }
      }

      // ماذا يشبه المسموع؟ يُقاس إلى المصحف كلّه (لا الآية وحدها) فيُقال
      // للقارئ: قرأت آيةً أخرى (وتُسمّى له)، أو ما سُمع كلامًا عاديًّا.
      if (!sc.empty) {
        try {
          const corpus = await loadCorpus();
          const [sidStr, scopeStr, ayahStr] = opts.target.key.split(':');
          const sid = Number(sidStr);
          const ident = classifyUtterance(corpus, utteranceTokens(transcript), targetTextOf(opts.target), {
            targetMatch: sc.match,
            isTarget: (s, a) => s === sid && (scopeStr === 'all' || a === Number(ayahStr)),
          });
          textKind = ident.kind;
          if (ident.kind === 'quran' && ident.best) {
            heardOf = { ...ident.best };
            hooks.stage(`المسموع يشبه ${ayahLabel(heardOf)}…`);
          }
        } catch (e) {
          console.warn('[TAHQIQQ] corpus identification unavailable:', e);
        }
      }

      // 1) best precision: teacher-forced cross-attention matrix
      if (words.length <= ATTN_MAX_WORDS && durationMs / 1000 <= ATTN_MAX_SEC) {
        hooks.stage('مطابقة الكلمات مواضعَ الصوت بدقةٍ عالية…');
        const fa = await whisperForcedAlignment(b, samples, words.map((w) => w.word));
        if (fa) {
          engine = 'whisper-attn';
          perWord = attentionToWords(fa, tjs, energy, durationMs);
        }
      }
      // 2) robust path: Whisper's own timestamp tokens matched to the target words
      if (!perWord && tsOut.chunks.length) {
        hooks.stage('مطابقة الكلمات مواضعَ الصوت…');
        perWord = timestampsToWords(tsOut.chunks, transcript, tjs);
        if (perWord) engine = 'whisper-ts';
      }
      if (!perWord) engine = 'whisper-energy';
    } catch (e: any) {
      console.warn('[TAHQIQQ] Whisper engine failed → fallback Energy-DTW:', e);
      hooks.model?.({ status: 'error', message: e?.message ?? String(e) });
      engine = 'offline-dtw';
    }
  }

  /**
   * بوّابة الكلام: لم يُسمع كلامٌ في التسجيل، ولم يُخرج السماعُ الذكيّ نصًّا.
   *
   * تُقدَّم بيّنةُ السماع الذكيّ على القياس الصوتيّ: فإن أخرج Whisper نصًّا
   * عربيًّا صُدِّق (ولو قال القياسُ الصوتيّ إنه لا كلام) — فإخفاقُ الكاشف أهونُ
   * من أن يُردّ قارئٌ قرأ فعلًا. وأمّا إن لم يُخرج نصًّا ولم يجد الكاشفُ كلامًا
   * فالتسجيل صمتٌ أو ضجيج، ولا تُقاس أزمنةُ كلماتٍ لم تُقرأ.
   */
  const noSpeechGate = noSpeech && matchSource !== 'transcript';

  if (!perWord) {
    hooks.stage('قياس الصوت لمطابقة الكلمات…');
    perWord = energyForcedAlignment(tjs, energy, durationMs);
  }

  const N = words.length;
  const expectedList = tjs.map((t) => t.expectedMs);
  /** من مواضع الكلمات إلى حدودها: ترتيبٌ صاعد ثم قياسُ المصوَّت حول كل موضع */
  const spansFrom = (pw: { midMs: number }[]) => {
    const mids = pw.map((p) => p.midMs);
    for (let i = 1; i < N; i++) if (mids[i] < mids[i - 1]) mids[i] = mids[i - 1] + 40; // enforce monotonicity
    return computeWordSpans(energy, mids, expectedList, durationMs);
  };

  // precise start/end via per-word voiced-span VAD around each midpoint
  const spans = spansFrom(perWord);
  const measuredMs = spans.map((sp) => Math.max(0, sp.endMs - sp.startMs));
  // صوتٌ مسموعٌ خارج كلمات الآية كلها (كلامٌ قبلها أو بعدها، أو آيةٌ أخرى):
  // لا يُعرف لفظُه بلا سماعٍ ذكي، لكن يُنبَّه إليه في النتيجة اللحظية بدل السكوت عنه
  const extraVoiceMs = (() => {
    const { thr } = vadThreshold(energy);
    const ayahSpans = spans.slice(prefixCount);
    let total = 0;
    let extra = 0;
    for (let f = 0; f < energy.length; f++) {
      if (energy[f] < thr) continue;
      total++;
      const t = f * FRAME_MS + FRAME_MS / 2;
      if (!ayahSpans.some((sp) => t >= sp.startMs && t < sp.endMs)) extra++;
    }
    return extra * FRAME_MS >= 700 && extra >= 0.35 * total ? extra * FRAME_MS : 0;
  })();

  // عدلة السرعة — مرجَّحةٌ بالقارئ المرجعي ومحدودةٌ حوله (انظر tempo.ts):
  // لا يُعاقَب من قرأ أسرع أو أبطأ قليلًا من مرتبته بـ«أقصر/أطول» على كل كلمة،
  // ولا يقيس القارئُ نفسَه بنفسه — فآيةٌ من كلمةٍ واحدة (الٓمٓ) كانت نسبتُها هي
  // العدلة، فيطابق المقيسُ المتوقَّعَ أيًّا كان. والسرعة تُقدَّر من الكلمات
  // الصالحة «مسطرةً» وحدها (بلا مدٍّ لازم ولا فواتح ولا وقف).
  const tempoEst = estimateTempo(
    measuredMs.map((m, i) => ({
      ratio: m >= MIN_VOICED_MS && tjs[i].expectedMs > 0 ? m / tjs[i].expectedMs : NaN,
      weight: tjs[i].rulerWeight ?? 1,
    })),
    { center: priorCenter(opts.reference?.pace, TEMPO_SCALE[tempo] ?? 1) },
  );
  const tempoScale = tempoEst.scale;
  const refMs = tjs.map((t) => Math.max(60, t.expectedMs * tempoScale));
  // نافذة الأوجه الجائزة بعدلة السرعة نفسها: فمن قرأ بالقصر أو التوسط أو
  // الإشباع حيث جازت لم يُخطَّأ، ومن نقص عن أدنى الأوجه أُخذ به.
  const refWin = tjs.map((t) => {
    const w = scaledWindow(t, tempoScale);
    return { ...w, minMs: lenientMin(w.minMs, tempoScale, tempoEst.evidence, t.rulerWeight ?? 1) };
  });

  const alignWords: WordAlignment[] = ayahWords.map((w, k) => {
    const i = k + prefixCount; // فهرس الكلمة في قائمة المحاذاة (بعد البسملة إن وُجدت)
    const { startMs, endMs } = spans[i];
    // لا كلام في التسجيل: أزمنةُ الكلمات اختلقها توزيعُ الضجيج على الأوزان، فكلُّ
    // كلمةٍ «لم تُسمع» — ولا يُنصح في زمنٍ لم يُقرأ.
    const status = noSpeechGate ? 'silent' : classifyWord(measuredMs[i], refMs[i], opts.tau, refWin[i]);
    let conf = perWord[i].conf;
    if (engine === 'whisper-attn') conf = clamp(0.7 * conf + 0.3 * transcriptMatch, 0.05, 0.99);
    else if (engine === 'whisper-ts') conf = clamp(0.7 * conf + 0.3 * transcriptMatch, 0.05, 0.99);
    else if (engine === 'whisper-energy') conf = clamp(0.55 * conf + 0.45 * transcriptMatch, 0.05, 0.99);
    if (noSpeechGate) conf = Math.min(conf, 0.15);
    return {
      index: k,
      ayah: w.ayah,
      word: w.word,
      startMs,
      endMs: Math.max(startMs + 20, endMs),
      confidence: conf,
      status,
      // الزمن المرجعيّ المعروض هو نفسه الذي حُكمت به الكلمة: بعدلة سرعة القارئ
      tajweed: {
        ...tjs[i],
        expectedMs: Math.round(refMs[i]),
        minMs: Math.round(refWin[i].minMs),
        maxMs: Math.round(refWin[i].maxMs),
        ...(refWin[i].stretchMs ? { stretchMs: Math.round(refWin[i].stretchMs!) } : {}),
      },
    };
  });

  const meanConf = mean(alignWords.map((w) => w.confidence));
  // انتظام النسق: مطابقة الأزمنة بعدلة السرعة (وهو ما يُقاس عليه المتعلّم فعلًا) — لكلمات الآية دون البسملة
  const rhythm = mean(
    measuredMs.slice(prefixCount).map((m, k) => tajweedScore(m, refMs[k + prefixCount], opts.tau, refWin[k + prefixCount])),
  );
  // ملاءمة سرعة القارئ المرجعي: انحراف السرعة وحده لا يُسقط الدرجة، لكن أثره يظهر فيها
  const tempoFit = clamp(1 - Math.abs(Math.log2(Number.isFinite(tempoEst.raw) ? tempoEst.relative : 1)) / 2.4, 0, 1);
  const meanTj = 0.85 * rhythm + 0.15 * tempoFit;
  const voiced = alignWords.length ? alignWords.filter((w) => w.status !== 'silent').length / alignWords.length : 0;

  /**
   * بوّابة النصّ: الاجتياز يحتاج أن يتبيّن نصُّ **هذه** الآية في المسموع.
   * كان ما دون ١٢٪ من المطابقة يُعاد وسمُه «تغطيةً» (لئلا يُعرض ٠٪) فيُجاز
   * القارئ بأزمنته وحده — فمرّ «يأكل تفاحة» بدل «الرحمن الرحيم»، ومرّت آيةٌ من
   * سورةٍ أخرى. الآن: ما لم يُسمع النصّ، أو سُمع فخالف، فلا اجتياز — والنتيجة
   * اللحظية (قياسُ الأزمنة وحده) تُعرض ولا تُجيز حتى يستكملها السماع الذكي.
   */
  let textCheck: TextCheck;
  if (input.demo) {
    transcriptMatch = 1;
    matchSource = 'demo';
    predWords = ayahWords.map((w) => ({ word: normalizeArabic(w.word), ok: true }));
    textCheck = 'demo';
  } else if (noSpeechGate) {
    // صمتٌ أو ضجيج: لا نصَّ ولا كلام — فلا تُعرض «تغطيةُ كلمات» لا وجود لها
    transcriptMatch = 0;
    matchSource = 'coverage';
    predWords = [];
    textCheck = 'nospeech';
  } else if (matchSource !== 'transcript') {
    // (ومنه التقييم اللحظي: لا يستمع بالألفاظ، فتُعرض تغطية الكلمات المسموعة — بلا اجتياز)
    transcriptMatch = voiced;
    matchSource = 'coverage';
    textCheck = 'unverified';
  } else {
    textCheck = scored ? textCheckOf(scored) : textCheckOf(transcriptMatch);
  }

  const textOk = textCheck === 'ok' || textCheck === 'demo';

  /**
   * أخفق السماعُ الذكي: استمع إلى **كلامٍ بيّن** فلم يُخرج لفظًا عربيًّا واحدًا.
   * وهذا **غير** أن يسمع القارئَ يقول غير الآية: فلا يُقال لكلماته «لم يُسمع
   * لفظُها» (كان يُقال ذلك لتلاوةٍ سليمة فتُردّ)، بل يُقال إن اللفظ لم يُتحقَّق
   * منه — فتُعرض أزمنتُها كما قِيست للتدريب والتشخيص، ولا تُعتمد للاجتياز حتى
   * يتبيّن أن المقروء هو الآية المختارة.
   *
   * وشرطُه الآن أن يكون في التسجيل كلامٌ فعلًا (لا صمتٌ ولا ضجيج): كانت تُقبل
   * فيه ٣٠٠ م.ث من «الصوت» بحسب العتبة النسبية، فضجيجُ الغرفة وحده كان يُدخل
   * التسجيلَ في هذا الباب.
   */
  const textUnavailable = heardNothing && !input.demo && presence.speechMs >= MIN_FALLBACK_SPEECH_MS;

  // لكل كلمة: هل تبيّن لفظُها؟ — كانت الكلمة تُوسم «جيد» بزمنها وحده ولو سُمع في
  // موضعها لفظٌ آخر. فما لم يُسمع لا يُحكم على زمنه ولا يُنصح فيه.
  if (textCheck === 'mismatch' || textCheck === 'nospeech') {
    for (const w of alignWords) w.textHeard = false;
  } else if (matchSource === 'transcript' && scored) {
    const miss = new Set(scored.missing.map((m) => m.index));
    for (const w of alignWords) w.textHeard = !miss.has(w.index);
  }
  const asrOk = matchSource === 'transcript' && textOk;
  let overallScore = Math.round(100 * (asrOk ? 0.4 * meanConf + 0.6 * meanTj : 0.2 * meanConf + 0.8 * meanTj));
  if (textCheck === 'weak' || textCheck === 'mismatch') {
    // الأزمنة لا تُحتسب لنصٍّ غير الآية: الدرجة تُقيَّد بمقدار ما تبيّن من النصّ
    overallScore = Math.min(overallScore, Math.round(100 * (0.25 + 0.5 * transcriptMatch)));
  }
  if (noSpeechGate) {
    // ولا تُحتسب أزمنةٌ قِيست من ضجيج: فما وُزِّع على الكلمات إنما هو أوزانُها
    overallScore = Math.min(overallScore, 20);
  }
  const coach = buildCoach(
    alignWords,
    overallScore,
    transcriptMatch,
    matchSource,
    tempoScale,
    {
      textCheck,
      recall: textRecall,
      precision: textPrecision,
      missing: textMissing,
      kind: textKind,
      heardOf,
      textUnavailable,
      extraVoiceMs: textCheck === 'unverified' ? extraVoiceMs : 0,
    },
    Number.isFinite(tempoEst.raw)
      ? { relative: tempoEst.relative, anchored: tempoEst.anchored, refName: opts.reference?.name }
      : undefined,
  );

  return {
    targetKey: opts.target.key,
    targetLabel: opts.target.label + (input.demo ? ' (عرض تجريبي)' : ''),
    engine,
    transcript,
    transcriptMatch,
    matchSource,
    predWords,
    textCheck,
    textUnavailable,
    noSpeech: noSpeechGate,
    speechMs: Math.round(presence.speechMs),
    textRecall,
    textPrecision,
    textKind,
    heardOf,
    overallScore,
    verdict: verdictFor(overallScore),
    durationMs,
    words: alignWords,
    demo: !!input.demo,
    createdAt: Date.now(),
    audioUrl: input.url ?? null,
    samples,
    tempo,
    tempoScale,
    tempoRelative: Number.isFinite(tempoEst.raw) ? tempoEst.relative : undefined,
    tempoAnchored: tempoEst.anchored,
    reference: opts.reference ? { ...opts.reference } : undefined,
    tips: coach.tips,
    summary: coach.summary,
    passed: coach.passed,
    instant: !!opts.fast,
  };
}

/**
 * عتبة الصوت/الصمت لمغلَّف الطاقة.
 *
 * لا يُبنى الحدّ على «المتوسط + انحراف» ولا على عُشرٍ مئويّ ثابت: التلاوة المتصلة
 * (وهي الأصل في الأداء) لا تكاد تحتوي صمتًا، فأيّ عتبةٍ تُشتقّ من توزيعها تقع
 * فوق معظم إطاراتها وتُسقِط الكلمات كلها. لذلك تُقاس أرضية الضجيج من أخمس
 * الإطارات همودًا، ومستوى الكلام من أعلاها (بترك ذروة الانفجارات)، وتُؤخذ
 * العتبة أبعدَ الحدّين عن الأرضية — فتعمل مع تسجيلٍ كثيرِ السكتات وآخرَ متصلٍ.
 */
export function vadThreshold(energy: Float32Array): { thr: number; noiseFloor: number; speechLevel: number } {
  const n = energy.length;
  if (!n) return { thr: 1e-5, noiseFloor: 0, speechLevel: 0 };
  const sorted = Float64Array.from(energy).sort();
  const avg = (a: number, b: number) => {
    const lo = Math.max(0, Math.floor(a));
    const hi = Math.min(n, Math.max(lo + 1, Math.ceil(b)));
    let s = 0;
    for (let i = lo; i < hi; i++) s += sorted[i];
    return s / (hi - lo);
  };
  const noiseFloor = avg(0, n * 0.05);
  const speechLevel = avg(n * 0.7, n * 0.95);
  // تسجيلٌ مقصوصٌ لا يكاد يكون فيه صمت (آيةٌ من كلمةٍ واحدة سُجّلت بإحكام، أو مقطعُ
  // القارئ المعتمد من الأرشيف): أخمسُ إطاراته صوتٌ لا ضجيج، فكانت «الأرضية» × ٣ تعلو
  // مستوى الكلام نفسه فلا يُعدّ إطارٌ واحدٌ مسموعًا ويُخترع للكلمة زمن. فلا تعلو
  // العتبة نصفَ مستوى الكلام أبدًا.
  const thr = Math.max(Math.min(Math.max(noiseFloor * 3, speechLevel * 0.15), speechLevel * 0.5), 1e-5);
  return { thr, noiseFloor, speechLevel };
}

/* ------------------------------------------------------------------ */

/**
 * Given a midpoint per word (from any engine), refine start/end to the actual
 * voiced span around that midpoint.
 *
 * Three things this must get right, because the whole verdict rests on them:
 *  1. The voiced/unvoiced threshold comes from the **recording's** speech level,
 *     not from the peak inside the word's own window. A madd tail decays well
 *     below the word's onset peak, so a local-peak threshold silently amputates
 *     exactly the part the learner is being asked to hold.
 *  2. A word may never be limited by its own expected duration — that would make
 *     the measurement circular (the model would grade itself). The search window
 *     is bounded by the neighbouring midpoints, widened by the prior.
 *  3. Overlapping spans are cut at the **quietest frame** between them, never at
 *     an arbitrary halfway point, and never in a way that inverts a span (which
 *     used to collapse real words to 20 ms and report them as "not heard").
 */
export function computeWordSpans(
  energy: Float32Array,
  midsMs: number[],
  expectedMs: number[],
  durationMs: number,
): { startMs: number; endMs: number }[] {
  const frameMs = FRAME_MS;
  const n = energy.length;
  const out: { startMs: number; endMs: number }[] = [];
  if (!n) return midsMs.map((m) => ({ startMs: m, endMs: m }));

  // speech level & noise floor over the whole envelope
  const { thr, noiseFloor, speechLevel } = vadThreshold(energy);
  /**
   * عتبة الامتداد (hysteresis): الكلمة تبتدئ من إطارٍ فوق `thr`، ثم تمتدّ ما
   * دام الصوت فوق هذه العتبة الأدنى. فذيلُ المدّ الممسوك يخفت تدريجًا (ولا
   * سيّما عند الوقف آخرَ الآية، ومع كابت الضجيج في الهواتف) — وكانت العتبة
   * الواحدة تبتر آخره فتُحكم الكلمةُ الأخيرة «أقصر» دائمًا. وكذلك البدءُ
   * الليّن (همزةٌ خفيفة، ألفُ الوصل).
   */
  const relThr = Math.min(thr, Math.max(noiseFloor * 2, speechLevel * 0.06, 1e-5));
  const DIP = 3; // frames of momentary dip tolerated inside a word (~60 ms)

  const frameOf = (ms: number) => Math.max(0, Math.min(n - 1, Math.round(ms / frameMs)));

  for (let i = 0; i < midsMs.length; i++) {
    const midF = frameOf(midsMs[i]);
    // search window: towards the neighbouring midpoints, widened by the prior.
    // الكلمة الأخيرة تُوسَّع إلى نهاية التسجيل: فالمدّ الممسوك عند الوقف
    // (عارض/لازم) قد يُشبع فوق المقدار الاسمي، ولا جارة بعدها تحدّه — فلا
    // يُقطع القياس عند ١٫٢× المتوقع فيُحكم «ناقصًا» رغم الإشباع.
    const priorHalf = Math.max(4, Math.round((expectedMs[i] * 1.2) / frameMs));
    const lastPad = Math.max(priorHalf, Math.round((expectedMs[i] * 3.5) / frameMs));
    const lo = Math.max(0, Math.min(i > 0 ? frameOf(midsMs[i - 1]) : 0, midF - priorHalf));
    const hi = Math.min(
      n - 1,
      Math.max(
        i < midsMs.length - 1 ? frameOf(midsMs[i + 1]) : n - 1,
        midF + (i === midsMs.length - 1 ? lastPad : priorHalf),
      ),
    );

    // walk back to the last frame above threshold, tolerating short dips
    let s = midF;
    let dip = 0;
    let lastVoiced = energy[midF] >= thr ? midF : -1;
    let firstVoiced = lastVoiced;
    while (s > lo) {
      s--;
      if (energy[s] >= relThr) {
        firstVoiced = s;
        if (energy[s] >= thr) lastVoiced = Math.max(lastVoiced, s);
        dip = 0;
      } else if (++dip > DIP) break;
    }
    // walk forward
    let e = midF;
    let endVoiced = lastVoiced;
    dip = 0;
    while (e < hi) {
      e++;
      if (energy[e] >= relThr) {
        if (energy[e] >= thr) lastVoiced = Math.max(lastVoiced, e);
        endVoiced = Math.max(endVoiced, e);
        dip = 0;
      } else if (++dip > DIP) break;
    }

    // لا بدّ من صوتٍ صريح (فوق العتبة) في الكلمة؛ والعتبة الأدنى تمدّ حدودها فحسب
    if (lastVoiced < 0 || (endVoiced - firstVoiced + 1) * frameMs < MIN_VOICED_MS) {
      // nothing voiced around this midpoint → honest "not heard", no invented span
      out.push({ startMs: midsMs[i], endMs: midsMs[i] });
      continue;
    }
    out.push({ startMs: Math.max(0, firstVoiced) * frameMs, endMs: (endVoiced + 1) * frameMs });
  }

  // Resolve overlaps at the quietest frame between the two words. Guarantees
  // monotonic, non-inverted spans.
  for (let i = 1; i < out.length; i++) {
    const a = out[i - 1];
    const b = out[i];
    if (b.startMs >= a.endMs) continue;
    const loBound = a.startMs + MIN_SPAN_MS;
    const hiBound = b.endMs - MIN_SPAN_MS;
    if (loBound > hiBound) {
      // both words shorter than the minimum together → split by expected weight
      const wA = Math.max(1, expectedMs[i - 1]);
      const wB = Math.max(1, expectedMs[i]);
      const cut = a.startMs + (b.endMs - a.startMs) * (wA / (wA + wB));
      a.endMs = cut;
      b.startMs = cut;
      continue;
    }
    // الحدّ يُبحث عنه قرب منتصف المسافة بين منتصفي الكلمتين (وهو أفضل ما لدى
    // محرك المحاذاة)، ولا يُترك حرًّا في كل منطقة التداخل: فحين تتصل التلاوة
    // بلا سكتات يكون ملفّ الطاقة شبه مستوٍ، وأهدأ إطارٍ فيه قد يقع في أيّ
    // موضع — وقد كان ذلك يطوي كلمةً كاملة إلى ٤٠ م.ث فيحكمها «لم تُسمع».
    const prior = (midsMs[i - 1] + midsMs[i]) / 2;
    const reach = Math.max(MIN_SPAN_MS, (midsMs[i] - midsMs[i - 1]) * 0.35);
    const f0 = Math.max(0, Math.round(Math.max(loBound, prior - reach) / frameMs));
    const f1 = Math.min(n - 1, Math.round(Math.min(hiBound, prior + reach) / frameMs));
    let cutF = Math.round(prior / frameMs);
    let best = Infinity;
    for (let f = f0; f <= f1; f++) {
      if (energy[f] < best) {
        best = energy[f];
        cutF = f;
      }
    }
    const cut = Math.max(loBound, Math.min(hiBound, cutF * frameMs));
    a.endMs = cut;
    b.startMs = cut;
  }

  // ==== كلمةٌ بلا صوت وبجوارها صوتٌ ليس لها ====
  // قد يُخطئ محرّك المحاذاة في موضع كلمة (ولا سيّما إذا لم يتبيّن للسماع الذكي
  // لفظٌ فيبني على تخمين) فيقع موضعُها في السكوت الذي قبل التلاوة — فتُقاس
  // «بعشرين جزءًا من الثانية» وتُحكم «لم تُسمع» رغم قراءتها، وتزحف أزمنةُ ما
  // بعدها فتفسد مقارنةُ القارئ. وللصوت الذي كان لها حالان:
  //   (أ) بقي مهمَلًا بين جارتيها فتأخذه، أو
  //   (ب) ابتلعته جارتُها فجاءت أطولَ من مقدارها بمقدار كلمةٍ زائدة، فيُقسم بينهما.
  // ولا يُصلح هذا كلمةً متروكة حقًّا: ليس بجوارها صوتٌ مهمَل، ولا جارتُها أطولَ
  // من مقدارها بمقدارِ كلمةٍ أخرى.
  {
    /** يقسم مقطعًا صوتيًّا على كلماتٍ متتالية بمقادير أزمنتها */
    const share = (from: number, to: number, idx: number[]) => {
      let total = 0;
      for (const q of idx) total += Math.max(1, expectedMs[q]);
      let acc = 0;
      for (const q of idx) {
        const a = from + ((to - from) * acc) / total;
        acc += Math.max(1, expectedMs[q]);
        const b = from + ((to - from) * acc) / total;
        out[q] = { startMs: a, endMs: Math.max(a + frameMs, b) };
      }
    };
    /**
     * الصوت المهمَل في نافذة: يُبحث أولًا بعتبة الكلام، فإن لم يُوجد شيء فبالعتبة
     * الأدنى — فآخرُ الآية يخفت صوتُه (مدٌّ عارضٌ عند الوقف، وكابتُ الضجيج في
     * الهواتف يزيده خفوتًا) فيقع دون عتبة الكلام كلِّه، فتُحكم الكلمة الأخيرة
     * «لم تُسمع» وقد قُرئت. ويُشترط في الخافت أن يعلو أرضيةَ الضجيج بيّنًا لئلا
     * يُتَّخذ نفَسٌ أو ضجيجٌ كلمةً.
     */
    const voicedSpan = (fromMs: number, toMs: number): [number, number] | null => {
      const a = Math.max(0, Math.ceil(fromMs / frameMs));
      const b = Math.min(n - 1, Math.floor(toMs / frameMs) - 1);
      for (const level of [thr, relThr]) {
        let first = -1;
        let last = -1;
        let peak = 0;
        for (let f = a; f <= b; f++) {
          if (energy[f] < level) continue;
          if (first < 0) first = f;
          last = f;
          if (energy[f] > peak) peak = energy[f];
        }
        if (first < 0 || (last - first + 1) * frameMs < MIN_VOICED_MS) continue;
        // الخافتُ يُقبل إن علا أرضيةَ الضجيج بيّنًا — لا إن كان الضجيجَ نفسَه
        if (level < thr && peak < Math.max(noiseFloor * 3, 1e-5)) continue;
        return [first * frameMs, (last + 1) * frameMs];
      }
      return null;
    };
    const sizeOf = (k: number) => out[k].endMs - out[k].startMs;

    for (let i = 0; i < out.length; i++) {
      if (sizeOf(i) >= MIN_VOICED_MS) continue;
      let j = i;
      while (j + 1 < out.length && sizeOf(j + 1) < MIN_VOICED_MS) j++;
      const group: number[] = [];
      for (let q = i; q <= j; q++) group.push(q);
      let need = 0;
      for (const q of group) need += Math.max(1, expectedMs[q]);

      // (أ) صوتٌ مهمَلٌ بين الجارتين المسموعتين
      const lo = i > 0 ? out[i - 1].endMs : 0;
      const hi = j < out.length - 1 ? out[j + 1].startMs : durationMs;
      const orphan = hi > lo ? voicedSpan(lo, hi) : null;
      if (orphan) {
        share(orphan[0], orphan[1], group);
        i = j;
        continue;
      }

      // (ب) جارةٌ ابتلعت صوتها: تسع مقدارَها ومقدارَ المجموعة، فيُقسم بينهما
      const after = j + 1 < out.length ? j + 1 : -1;
      const before = i > 0 ? i - 1 : -1;
      for (const nb of [after, before]) {
        if (nb < 0 || sizeOf(nb) < MIN_VOICED_MS) continue;
        const fit = (need + Math.max(1, expectedMs[nb])) * 0.8;
        if (sizeOf(nb) < fit) continue;
        share(out[nb].startMs, out[nb].endMs, nb === after ? [...group, nb] : [nb, ...group]);
        break;
      }
      i = j;
    }
  }

  // ==== هل سُمعت الكلمةُ فعلًا؟ (تمييز الكلمة المُسقَطة من التلاوة المتعثّرة) ====
  // قد يُسقط القارئ كلمةً فيبقى مكانَها سكوتٌ لا صوتَ فيه، ثم تتقدّم الكلمةُ التالية إليه
  // فيبدو زمنُها المقاس أطولَ كثيرًا (وهو ما ترصده الدالةُ أعلاه «طويلة» لا «لم تُسمع»).
  // فأمارةُ الإسقاط: أن تبتدئ الكلمةُ بعد فجوةِ سكوتٍ صريحة (١٢٠ م.ث فأكثر: لا يتّسع لها
  // داخل الكلمة عادةً) ويكون زمنُها المقاس — مع ذلك — يزيد على ١٫٣ من وتيرة القارئ نفسه.
  // حينئذٍ يُبطَل زمنُها وتُحكم «لم تُسمع» — وهو ما لا يُدركه قياسُ الزمن وحده.
  {
    const holes: { from: number; to: number }[] = [];
    let hFrom = -1;
    for (let f = 0; f <= n; f++) {
      const quiet = f < n && energy[f] < thr;
      if (quiet && hFrom < 0) hFrom = f;
      else if (!quiet && hFrom >= 0) {
        if (f - hFrom >= 5) holes.push({ from: hFrom, to: f - 1 });
        hFrom = -1;
      }
    }
    if (holes.length) {
      // فجوةٌ تُعدّ سكتةً معتبرة: ١٢٠ م.ث فأكثر (تتجاوز ما يتسامح فيه داخل الكلمة)
      const HOLE_MIN = 6;
      const ratios: number[] = [];
      for (let i = 0; i < out.length; i++) {
        const m = out[i].endMs - out[i].startMs;
        if (expectedMs[i] > 0 && m >= MIN_VOICED_MS) ratios.push(m / expectedMs[i]);
      }
      ratios.sort((a, b) => a - b);
      const scale = ratios.length ? ratios[Math.floor(ratios.length / 2)] : 1;
      for (let i = 0; i < out.length; i++) {
        const sp = out[i];
        if (expectedMs[i] <= 0 || sp.startMs <= 2 * frameMs) continue;
        const measured = sp.endMs - sp.startMs;
        if (measured < 1.3 * scale * expectedMs[i]) continue;
        // فجوةٌ يبتدئ الصوتُ بعدها: بدايةُ الكلمة داخل سكوتٍ لا صوتَ فيه
        const hit = holes.find(
          (h) => sp.startMs >= h.from * frameMs - 2 * frameMs && sp.startMs <= (h.to + 1) * frameMs + 2 * frameMs,
        );
        if (!hit || hit.to - hit.from + 1 < HOLE_MIN) continue;
        out[i] = { startMs: midsMs[i], endMs: midsMs[i] };
      }
    }
  }

  // (كانت بدايةُ الكلمة الأولى تُسحب إلى أول التسجيل دائمًا — فيُحسب الصمتُ قبل
  // التلاوة من زمنها: «الٓمٓ» قُرئت في ٠٫٨ ث بعد ٢٫٥ ث من السكوت فقيست ٣٫٢ ث
  // وحُكمت «جيدة»، وكانت أول كلمةٍ في كل آية «أطول» فتنتفخ عدلةُ السرعة وتبدو
  // الأخيرةُ «أقصر». الآن تبتدئ حيث يبتدئ صوتها.)
  for (const o of out) {
    o.startMs = Math.max(0, Math.min(durationMs, o.startMs));
    o.endMs = Math.max(o.startMs, Math.min(durationMs, o.endMs));
  }
  return out;
}

/* ------------------------------------------------------------------ */

function softmaxIfNeeded(row: Float32Array): Float32Array {
  let max = -Infinity;
  let min = Infinity;
  let sum = 0;
  for (const v of row) {
    if (v > max) max = v;
    if (v < min) min = v;
    sum += v;
  }
  if (max > 0 && min >= -1e-6 && max <= 5 && Math.abs(sum - 1) < 0.6) return row; // already probabilities
  const out = new Float32Array(row.length);
  let z = 0;
  for (let i = 0; i < row.length; i++) {
    out[i] = Math.exp(row[i] - max);
    z += out[i];
  }
  if (z <= 0) return row;
  for (let i = 0; i < row.length; i++) out[i] /= z;
  return out;
}

/** Convert cross-attention rows (per token) into per-word midpoints + confidences */
function attentionToWords(
  fa: { rows: Float32Array[]; spans: [number, number][] },
  tjs: WordTajweed[],
  energy: Float32Array,
  durationMs: number,
): { midMs: number; conf: number }[] {
  const frameMs = FRAME_MS;
  const Ntok = fa.rows.length - 1; // drop final row (SOT shift)
  const mids: number[] = [];
  const confs: number[] = [];
  for (let j = 0; j < Ntok; j++) {
    const row = softmaxIfNeeded(fa.rows[j]);
    const z = row.reduce((a, b) => a + b, 0) || 1;
    let maxp = 0;
    for (const v of row) maxp = Math.max(maxp, v / z);
    let num = 0;
    let den = 0;
    for (let s = 0; s < row.length; s++) {
      const p = row[s] / z;
      const wgt = p * p; // sharpen toward the peak
      num += wgt * s;
      den += wgt;
    }
    mids.push(den > 1e-9 ? (num / den) * frameMs + frameMs / 2 : (j / Math.max(1, Ntok)) * durationMs);
    confs.push(clamp((maxp - 1 / row.length) / (1 - 1 / row.length), 0, 1));
  }
  return tjs.map((_, wi) => {
    const span: [number, number] = fa.spans[wi] ?? [0, 1];
    const a = Math.max(0, span[0]);
    const b = Math.min(span[1], Ntok, mids.length);
    let m = 0;
    let c = 0;
    let cnt = 0;
    for (let j = a; j < b; j++) {
      m += mids[j];
      c += confs[j];
      cnt++;
    }
    const mid0 = cnt ? m / cnt : (wi / Math.max(1, tjs.length)) * durationMs;
    const conf0 = cnt ? c / cnt : 0.3;
    // blend with the local energy peak for robustness
    const eStart = Math.max(0, Math.floor((mid0 - 320) / frameMs));
    const eEnd = Math.min(energy.length - 1, Math.floor((mid0 + 320) / frameMs));
    let peak = eStart;
    let pv = -1;
    for (let i = eStart; i <= eEnd; i++) if (energy[i] > pv) {
      pv = energy[i];
      peak = i;
    }
    const midE = peak * frameMs + frameMs / 2;
    const mid = pv > 0 ? 0.65 * mid0 + 0.35 * midE : mid0;
    return { midMs: mid, conf: clamp(0.65 * conf0 + 0.35 * (pv > 0 ? 0.55 : 0.25), 0.05, 0.98) };
  });
}

/**
 * Robust timing path: match transcript words (from Whisper timestamp chunks)
 * to target words via LCS and take per-word midpoints from the chunk timings.
 * Returns null when the transcript is too far from the target (<20% match).
 */
function timestampsToWords(
  chunks: TsChunk[],
  _transcript: string,
  tjs: WordTajweed[],
): { midMs: number; conf: number }[] | null {
  // 1) flatten chunks into timed words (even split inside multi-word chunks)
  const timed: { w: string; mid: number; conf: number }[] = [];
  for (const c of chunks) {
    const ws = c.text.split(/\s+/).filter(Boolean);
    if (!ws.length) continue;
    const dur = Math.max(80, c.endMs - c.startMs);
    ws.forEach((w, k) => {
      const start = c.startMs + (k / ws.length) * dur;
      timed.push({ w: normalizeForMatch(w), mid: start + dur / ws.length / 2, conf: 0.85 });
    });
  }
  if (!timed.length) return null;

  const target = tjs.map((t) => normalizeForMatch(t.word));
  const pairs = lcsPairs(timed.map((t) => t.w), target);
  if (!pairs.length) return null;
  if (pairs.length / target.length < 0.2) return null;

  const matchAt = new Map<number, number>(); // target idx → timed idx
  for (const [ti, pi] of pairs) matchAt.set(ti, pi);

  // 2) per-target-word midpoint: matched → chunk midpoint; unmatched → interpolate
  const mids: number[] = [];
  const confs: number[] = [];
  for (let i = 0; i < target.length; i++) {
    const pi = matchAt.get(i);
    if (pi != null) {
      mids.push(timed[pi].mid);
      confs.push(timed[pi].conf);
    } else {
      let prevI = i - 1;
      while (prevI >= 0 && !matchAt.has(prevI)) prevI--;
      let nextI = i + 1;
      while (nextI < target.length && !matchAt.has(nextI)) nextI++;
      if (prevI >= 0 && nextI < target.length) {
        const a = timed[matchAt.get(prevI)!].mid;
        const b = timed[matchAt.get(nextI)!].mid;
        const f = (i - prevI) / (nextI - prevI);
        mids.push(a + (b - a) * f);
        confs.push(0.4);
      } else if (nextI < target.length) {
        mids.push(timed[matchAt.get(nextI)!].mid - (nextI - i) * 260);
        confs.push(0.4);
      } else if (prevI >= 0) {
        mids.push(timed[matchAt.get(prevI)!].mid + (i - prevI) * 260);
        confs.push(0.4);
      } else {
        mids.push((i / Math.max(1, target.length)) * 2000);
        confs.push(0.25);
      }
    }
  }
  return mids.map((m, i) => ({ midMs: m, conf: confs[i] }));
}

/**
 * LCS returning matched index pairs [targetIdx, predIdx] (order preserved) —
 * بمطابقةٍ ضبابية للكلمة: تحريفُ السماع اليسير لا يُسقطها.
 */
function lcsPairs(p: string[], t: string[]): [number, number][] {
  const n = p.length;
  const m = t.length;
  if (!n || !m || n * m > 4_000_000) return [];
  const same = (a: string, b: string) => a === b || editClose(a, b);
  const dp: Int32Array[] = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = same(p[i], t[j]) ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const pairs: [number, number][] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (same(p[i], t[j])) {
      pairs.push([j, i]);
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
    else j++;
  }
  return pairs;
}

/** مقاطع الصوت المتصلة (VAD): تُدمج الفجوات القصيرة وتُهمل النُبَذ الضئيلة */
export function voicedRuns(
  energy: Float32Array,
  thr: number,
  mergeGapFrames = 5,
  minRunFrames = 2,
): { from: number; to: number }[] {
  const n = energy.length;
  const runs: { from: number; to: number }[] = [];
  let cur: { from: number; to: number } | null = null;
  let gap = 0;
  for (let f = 0; f < n; f++) {
    if (energy[f] >= thr) {
      if (cur) cur.to = f;
      else cur = { from: f, to: f };
      gap = 0;
    } else if (cur) {
      if (++gap > mergeGapFrames) {
        runs.push(cur);
        cur = null;
        gap = 0;
      }
    }
  }
  if (cur) runs.push(cur);
  return runs.filter((r) => r.to - r.from + 1 >= minRunFrames);
}

/**
 * Fallback forced alignment (no AI): VAD on the energy envelope, then the voiced
 * frames are split between the target words **in proportion to the tajweed
 * duration priors**, monotonically and without a moving cursor.
 *
 * The previous version hunted for the loudest frame inside a sliding window and
 * advanced a cursor past it. One word that grabbed a neighbour's peak pushed
 * every following word further off, so the last words of an ayah regularly ended
 * up beyond the end of the recording and were reported as "not heard" — the
 * learner was blamed for words the engine had simply lost. Proportional
 * allocation on the voiced timeline cannot drift: each word's share is fixed by
 * the priors, and the mapping back to real time is monotonic by construction.
 */
export function energyForcedAlignment(
  tjs: WordTajweed[],
  energy: Float32Array,
  durationMs: number,
): { midMs: number; conf: number }[] {
  const frameMs = FRAME_MS;
  const n = energy.length;
  const N = tjs.length;
  if (!n || !N) return tjs.map((_, i) => ({ midMs: (i / Math.max(1, N)) * durationMs, conf: 0.2 }));

  const { thr, speechLevel } = vadThreshold(energy);

  const runs = voicedRuns(energy, thr, 3);
  if (!runs.length) return tjs.map((_, i) => ({ midMs: ((i + 0.5) / N) * durationMs, conf: 0.15 }));

  const timeOf = (f: number) => f * frameMs + frameMs / 2;
  const peakConf = speechLevel > 0 ? clamp((Math.max(...Array.from(energy)) - thr) / (2 * speechLevel) + 0.45, 0.15, 0.9) : 0.3;

  // ١) مقاطع الصوت أكثر من الكلمات أو تساويها → إسناد monotonic أمثل:
  //    كل كلمة تأخذ مجموعةً متصلة من المقاطع، ويُختار التقسيم الذي تُقارب فيه
  //    الأزمنةُ المقاسة أزمنةَ النموذج. هذا يمنع الانزياح التراكميّ الذي كان
  //    يفقد الكلمات في أواخر الآية.
  if (runs.length >= N && runs.length * runs.length * N <= 4_000_000) {
    const fit = matchRunsToWords(runs, tjs.map((t) => Math.max(1, t.expectedMs)), frameMs);
    if (fit) {
      return fit.map((f) => ({ midMs: f.midMs, conf: clamp(peakConf + 0.08 - f.penalty, 0.15, 0.95) }));
    }
  }

  // ٢) خلاف ذلك: توزيع إطارات الصوت على الكلمات بأوزان الأزمنة المتوقَّعة
  const voicedFrames: number[] = [];
  for (const r of runs) for (let f = r.from; f <= r.to; f++) voicedFrames.push(f);
  const V = voicedFrames.length;
  const weights = tjs.map((t) => Math.max(1, t.expectedMs));
  const totalW = weights.reduce((a, b) => a + b, 0);

  // حدود الكلمات على خطّ الصوت (بالإطارات الصوتية) — تراكمية، فلا انزياح
  const bounds: number[] = [0];
  let acc = 0;
  for (let i = 0; i < N; i++) {
    acc += weights[i];
    bounds.push(i === N - 1 ? V : Math.min(V, Math.round((acc / totalW) * V)));
  }
  for (let i = 1; i <= N; i++) if (bounds[i] < bounds[i - 1]) bounds[i] = bounds[i - 1];

  // ملاءمة الحدود: إن كان الحدّ قريبًا من سكتةٍ حقيقية فليُسنَد إليها
  const gaps: number[] = [];
  for (let k = 1; k < runs.length; k++) gaps.push(Math.round((runs[k - 1].to + runs[k].from) / 2));
  const gapIdx = gaps.map((g) => voicedFrames.findIndex((f) => f >= g));

  const out: { midMs: number; conf: number }[] = [];
  for (let i = 0; i < N; i++) {
    let a = bounds[i];
    let b = bounds[i + 1];
    const idealSpan = (weights[i] / totalW) * V;
    for (const gi of gapIdx) {
      if (gi <= 0) continue;
      if (Math.abs(gi - a) <= idealSpan * 0.35 && Math.abs(gi - a) < Math.abs(nearestGap(gapIdx, a) - a)) a = gi;
      if (Math.abs(gi - b) <= idealSpan * 0.35 && Math.abs(gi - b) < Math.abs(nearestGap(gapIdx, b) - b)) b = gi;
    }
    if (b <= a) b = Math.min(V, a + Math.max(1, Math.round(idealSpan)));
    const midV = Math.min(V - 1, Math.max(0, Math.floor((a + b) / 2)));
    const midF = voicedFrames[midV] ?? Math.round((timeOf(a) / frameMs));
    const runCount = runs.filter((r) => voicedFrames[a] >= r.from && voicedFrames[a] <= r.to).length;
    out.push({
      midMs: timeOf(midF),
      conf: clamp(peakConf * (runs.length === N ? 1 : 0.85) - (runCount ? 0 : 0.05), 0.15, 0.9),
    });
  }
  return out;
}

/**
 * إسناد مقاطع الصوت إلى الكلمات: تقسيمٌ monotonic للمقاطع على الكلمات يقلّل
 * مجموع الفروق النسبية بين زمن كل كلمة وزمنها المتوقَّع. يضمن أن كل كلمة
 * تنال مقطعًا واحدًا على الأقل، فلا تبتلع كلمةٌ جارتَها ولا تضيع كلمةٌ في
 * آخر الآية.
 */
function matchRunsToWords(
  runs: { from: number; to: number }[],
  expectedMs: number[],
  frameMs: number,
): { midMs: number; penalty: number }[] | null {
  const R = runs.length;
  const N = expectedMs.length;
  if (R < N) return null;

  // زمن كل مقطع ومركزه الزمنيّ
  const dur = runs.map((r) => (r.to - r.from + 1) * frameMs);
  // مجموع أزمنة المقاطع k..j-1
  const pre = new Float64Array(R + 1);
  for (let i = 0; i < R; i++) pre[i + 1] = pre[i] + dur[i];
  const sumRuns = (k: number, j: number) => pre[j] - pre[k];

  const INF = Infinity;
  const dp: number[][] = Array.from({ length: N + 1 }, () => new Array<number>(R + 1).fill(INF));
  const back: number[][] = Array.from({ length: N + 1 }, () => new Array<number>(R + 1).fill(-1));
  dp[0][0] = 0;
  for (let i = 1; i <= N; i++) {
    for (let j = i; j <= R - (N - i); j++) {
      let best = INF;
      let bk = -1;
      for (let k = i - 1; k < j; k++) {
        if (dp[i - 1][k] === INF) continue;
        const c = dp[i - 1][k] + Math.abs(sumRuns(k, j) - expectedMs[i - 1]) / expectedMs[i - 1];
        if (c < best) {
          best = c;
          bk = k;
        }
      }
      dp[i][j] = best;
      back[i][j] = bk;
    }
  }
  if (dp[N][R] === INF) return null;

  // استرجاع التقسيم
  const bounds: number[] = new Array(N + 1);
  bounds[N] = R;
  for (let i = N; i >= 1; i--) bounds[i - 1] = back[i][bounds[i]];

  const out: { midMs: number; penalty: number }[] = [];
  for (let i = 0; i < N; i++) {
    const k = bounds[i];
    const j = bounds[i + 1];
    if (j <= k) return null;
    // مركز الزمن المصوت داخل مقاطع هذه الكلمة
    let voiced = 0;
    for (let x = k; x < j; x++) voiced += dur[x];
    let acc = 0;
    let midF = runs[k].from;
    for (let x = k; x < j; x++) {
      if (acc + dur[x] >= voiced / 2) {
        const inside = (voiced / 2 - acc) / frameMs;
        midF = runs[x].from + Math.min(runs[x].to - runs[x].from, Math.max(0, Math.round(inside)));
        break;
      }
      acc += dur[x];
    }
    const penalty = Math.min(0.35, Math.abs(voiced - expectedMs[i]) / (2 * expectedMs[i]));
    out.push({ midMs: midF * frameMs + frameMs / 2, penalty });
  }
  return out;
}

/** أقرب حدّ سكتةٍ إلى موضعٍ على خطّ الصوت */
function nearestGap(gapIdx: number[], at: number): number {
  let best = -1;
  let bd = Infinity;
  for (const g of gapIdx) {
    if (g < 0) continue;
    const d = Math.abs(g - at);
    if (d < bd) {
      bd = d;
      best = g;
    }
  }
  return best < 0 ? at : best;
}
