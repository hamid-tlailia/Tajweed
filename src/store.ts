// TAHQĪQ — global app store (zustand)

import { create } from 'zustand';
import { engineAlign, engineLoadModel } from '@/lib/engine';
import { compareWithReciter } from '@/lib/compare';
import { decodeBlobTo16k } from '@/lib/audio';
import { fetchSurah, fetchSurahs, buildTarget } from '@/lib/quran';
import { fetchReciterBlob, resolveReciter, stylesFor } from '@/lib/reciter';
import type { RecitationStyle, ReciterProfile } from '@/lib/reciter';
import type {
  AlignmentResult,
  AppTab,
  AyahRecord,
  ModelSize,
  ModelStatus,
  RefAlignment,
  Riwayah,
  SurahData,
  SurahMeta,
  Tempo,
  ThemeMode,
} from '@/lib/types';
import { PASS_SCORE } from '@/lib/types';

const surahCache = new Map<number, SurahData>();
const fileProgress = new Map<string, number>();
const PROGRESS_KEY = 'tahqiq-progress-v1';
const SETTINGS_KEY = 'tahqiq-settings-v1';
// v3: صار المرجعُ مفتاحُه (السورة:الآية:القارئ) — فلكل مرتبةٍ ونوع تلاوةٍ قارئُها — وأُصلحت
// عتبة الصوت في المقاطع المقصوصة (كانت تُفسد قياس مقاطع القرّاء القصيرة): تُهمَل مراجع v2.
const REF_KEY = 'tahqiq-ref-v3';

function loadProgress(): Record<string, Record<number, AyahRecord>> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(PROGRESS_KEY);
    return raw ? (JSON.parse(raw) as Record<string, Record<number, AyahRecord>>) : {};
  } catch {
    return {};
  }
}

function saveProgress(p: Record<string, Record<number, AyahRecord>>) {
  try {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(p));
  } catch {
    /* quota */
  }
}

type PersistedSettings = Partial<
  Pick<
    TahqiqStore,
    | 'tempo'
    | 'tau'
    | 'riwayah'
    | 'modelSize'
    | 'alertOn'
    | 'theme'
    | 'useReciterGate'
    | 'instantEval'
    | 'referenceChoice'
    | 'recitationStyle'
  >
>;

function loadSettings(): PersistedSettings {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveSettings(s: {
  tempo: Tempo;
  tau: number;
  riwayah: Riwayah;
  modelSize: ModelSize;
  alertOn: boolean;
  theme: ThemeMode;
  useReciterGate: boolean;
  instantEval: boolean;
  referenceChoice: string;
  recitationStyle: RecitationStyle;
}) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    /* quota */
  }
}

/** مراجع القارئ المعتمد المخزَّنة (أزمنة الكلمات فقط — لا صوت) */
function loadRefs(): Record<string, RefAlignment> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(REF_KEY);
    const j = raw ? JSON.parse(raw) : {};
    return j && typeof j === 'object' ? (j as Record<string, RefAlignment>) : {};
  } catch {
    return {};
  }
}

function saveRefs(r: Record<string, RefAlignment>) {
  try {
    localStorage.setItem(REF_KEY, JSON.stringify(r));
  } catch {
    /* quota */
  }
}

/** تطبيق الثيم على عنصر <html> وشريط المتصفح */
export function applyTheme(mode: ThemeMode) {
  if (typeof document === 'undefined') return;
  document.documentElement.classList.toggle('theme-day', mode === 'day');
  const chrome = mode === 'day' ? '#F4F0E7' : '#070B10';
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', chrome));
}

interface RefEvalState {
  status: 'idle' | 'loading' | 'ready' | 'error';
  key: string; // مفتاح المرجع الجاري/الأخير
  stage: string;
  error: string | null;
  /** بدأ تلقائيًّا (لا بضغط المستخدم) — فلا يُعرض خطؤه إلا تنبيهًا خفيفًا */
  auto?: boolean;
}

/** مفتاح مرجع القارئ لآية: (السورة:الآية:القارئ) */
export function refKey(surahId: number, ayah: number, reciterId: string): string {
  return `${surahId}:${ayah}:${reciterId}`;
}

/**
 * ضمُّ التحكيم بالقارئ المعتمد إلى نتيجة التلاوة: تُقارن كلماتها بأزمنته، وتُحمل
 * المقارنة في النتيجة. فإن كان «الاجتياز بمطابقة القارئ» مفعّلًا فلا تُجاز الآية إلا
 * إذا اجتازت **الدرجة الذاتية ومطابقة القارئ معًا** — فلا تُجاز تلاوةٌ خالفت القارئ
 * بيّنًا وإن حسُنت درجتُها الذاتية (ولا العكس).
 */
function withReference(
  result: AlignmentResult,
  ref: RefAlignment | undefined,
  reciter: ReciterProfile,
  tau: number,
  tempo: Tempo,
  useGate: boolean,
): AlignmentResult {
  if (!ref || result.demo) return result;
  const textOk = result.textCheck === 'ok' || result.textCheck === 'demo';
  const cmp = compareWithReciter(result.words, ref, tau, textOk, ref.label, result.textCheck, {
    tempo,
    refPace: reciter.pace,
  });
  if (!cmp) return result;
  return { ...result, reciter: cmp, passed: useGate ? result.passed && cmp.passed && textOk : result.passed };
}

interface TahqiqStore {
  surahs: SurahMeta[];
  surahsStatus: 'loading' | 'ready' | 'error';
  selectedSurahId: number;
  surahCache: Record<number, SurahData>;
  surahStatus: 'idle' | 'loading' | 'ready' | 'error';
  selectedAyah: number;
  scope: 'ayah' | 'surah';
  riwayah: Riwayah;
  tempo: Tempo;
  activeTab: AppTab;
  progress: Record<string, Record<number, AyahRecord>>;
  theme: ThemeMode;

  modelSize: ModelSize;
  tau: number;
  modelStatus: ModelStatus;
  modelProgress: number;
  modelMessage: string | null;

  recording: boolean;
  micError: string | null;
  processing: boolean;
  stage: string;
  result: AlignmentResult | null;
  activeWord: number;
  alertOn: boolean;

  /**
   * التقييم اللحظي: تُعرض النتيجة فور إيقاف التسجيل (قياسُ أزمنةٍ بلا سماع
   * ذكي)، ثم يُستأنف التحليل الأدقّ في الخلفية ويُستبدل بالنتيجة إن اختلف.
   */
  instantEval: boolean;
  /** التحليل الأدقّ جارٍ في الخلفية بعد نتيجةٍ لحظية */
  refining: boolean;
  setInstantEval: (b: boolean) => void;
  setRefining: (b: boolean) => void;

  /** التحكيم بالقارئ المعتمد */
  refEval: RefEvalState;
  refCache: Record<string, RefAlignment>;
  useReciterGate: boolean;
  /**
   * القارئ المرجعي: 'auto' (بحسب الرواية والمرتبة ونوع التلاوة) أو معرّف قارئٍ بعينه.
   * ومرجعٌ ما حاضرٌ في كل تحليل وإن لم يختر المستخدم شيخًا.
   */
  referenceChoice: string;
  /** نوع التلاوة المرجعية: مرتَّل / مجوَّد */
  recitationStyle: RecitationStyle;
  setReferenceChoice: (id: string) => void;
  setRecitationStyle: (s: RecitationStyle) => void;
  /** القارئ المرجعي الفعلي الآن (المختار أو التلقائي) */
  referenceOf: () => { reciter: ReciterProfile; auto: boolean };
  /**
   * تقييم تلاوة القارئ المعتمد للآية الحالية (جلب صوته وقياسه بالمحرّك) — يدويًّا
   * بالزرّ، أو تلقائيًّا في الخلفية (auto) عند اختيار الآية وبعد كل تسجيل.
   */
  evaluateReciter: (opts?: { auto?: boolean; fastOnly?: boolean }) => Promise<void>;
  setUseReciterGate: (b: boolean) => void;
  refKeyOf: () => string; // مفتاح مرجع الآية والقارئ الحاليَّين
  /** ضمُّ مرجع القارئ (إن حضر) إلى النتيجة الحالية — يُستدعى متى جهز المرجع بعد النتيجة */
  applyReference: () => void;
  /** تهيئة مرجع الآية الحالية تلقائيًّا في الخلفية بعد مهلةٍ يسيرة (إن لم يكن محفوظًا) */
  schedulePrefetch: (delayMs?: number) => void;

  init: () => Promise<void>;
  /** تجهيز السماع الذكي تلقائيًّا إن لم يكن قد جُهِّز (ولا يُعاد بعد فشل) */
  autoLoadModel: () => void;
  setTheme: (t: ThemeMode) => void;
  setAlertOn: (b: boolean) => void;
  selectSurah: (id: number) => void;
  selectAyah: (n: number) => void;
  setScope: (s: 'ayah' | 'surah') => void;
  setRiwayah: (r: Riwayah) => void;
  setTempo: (t: Tempo) => void;
  setActiveTab: (t: AppTab) => void;
  setModelSize: (s: ModelSize) => void;
  setTau: (t: number) => void;
  loadModel: () => Promise<void>;
  setRecording: (r: boolean, micError?: string | null) => void;
  setProcessing: (p: boolean, stage?: string) => void;
  setResult: (r: AlignmentResult | null) => void;
  setActiveWord: (i: number) => void;
  advanceAyah: () => boolean;
  progressKey: () => string;
}

function persistSettings(get: () => TahqiqStore) {
  const s = get();
  saveSettings({
    tempo: s.tempo,
    tau: s.tau,
    riwayah: s.riwayah,
    modelSize: s.modelSize,
    alertOn: s.alertOn,
    theme: s.theme,
    useReciterGate: s.useReciterGate,
    instantEval: s.instantEval,
    referenceChoice: s.referenceChoice,
    recitationStyle: s.recitationStyle,
  });
}

/** مؤقّت التهيئة التلقائية لمرجع الآية (يُلغى إن تغيّرت الآية قبل انقضائه) */
let prefetchTimer: ReturnType<typeof setTimeout> | null = null;

/** النتيجة بلا تحكيم (حين يتبدّل القارئ المرجعي: لا تبقى مقارنةٌ بقارئٍ لم يعد مرجعًا) */
function selfOnly(r: AlignmentResult | null): AlignmentResult | null {
  if (!r || r.selfPassed === undefined || !r.reciter) return r;
  return { ...r, passed: r.selfPassed, reciter: undefined };
}

export const useTahqiq = create<TahqiqStore>()((set, get) => ({
  surahs: [],
  surahsStatus: 'loading',
  selectedSurahId: 1,
  surahCache: {},
  surahStatus: 'idle',
  selectedAyah: 1,
  scope: 'ayah',
  riwayah: 'hafs',
  tempo: 'tartil',
  activeTab: 'practice',
  progress: {},
  theme: 'night',

  // «الأدقّ» هي الأصل: بوّابة النصّ كلها قائمةٌ على تمييز الألفاظ، والنموذج الأصغر
  // يُخفق في تمييزها فتُردّ تلاوةٌ سليمة. (٨٠ م.ب تُنزَّل مرةً ثم تُخزَّن في المتصفح،
  // ومن اختار «السريعة» من الإعدادات بقي اختياره.)
  modelSize: 'base',
  tau: 0.8,
  modelStatus: 'idle',
  modelProgress: 0,
  modelMessage: null,

  recording: false,
  micError: null,
  processing: false,
  stage: '',
  result: null,
  activeWord: -1,
  alertOn: true,
  instantEval: true,
  refining: false,

  refEval: { status: 'idle', key: '', stage: '', error: null },
  refCache: {},
  useReciterGate: true,
  referenceChoice: 'auto',
  recitationStyle: 'murattal',

  setTheme: (theme) => {
    set({ theme });
    applyTheme(theme);
    persistSettings(get);
  },

  setInstantEval: (instantEval) => {
    set({ instantEval });
    persistSettings(get);
  },
  setRefining: (refining) => set({ refining }),
  setUseReciterGate: (useReciterGate) => {
    set({ useReciterGate });
    persistSettings(get);
    get().applyReference();
  },

  setAlertOn: (alertOn) => {
    set({ alertOn });
    persistSettings(get);
  },

  referenceOf: () => {
    const { riwayah, tempo, recitationStyle, referenceChoice } = get();
    return resolveReciter(riwayah, tempo, recitationStyle, referenceChoice);
  },

  refKeyOf: () => refKey(get().selectedSurahId, get().selectedAyah, get().referenceOf().reciter.id),

  setReferenceChoice: (referenceChoice) => {
    set({ referenceChoice, refEval: { status: 'idle', key: '', stage: '', error: null }, result: selfOnly(get().result) });
    persistSettings(get);
    void get().evaluateReciter({ auto: true });
  },

  setRecitationStyle: (recitationStyle) => {
    const ok = stylesFor(get().riwayah).includes(recitationStyle) ? recitationStyle : 'murattal';
    set({
      recitationStyle: ok,
      referenceChoice: 'auto',
      refEval: { status: 'idle', key: '', stage: '', error: null },
      result: selfOnly(get().result),
    });
    persistSettings(get);
    void get().evaluateReciter({ auto: true });
  },

  evaluateReciter: async (opts) => {
    const auto = !!opts?.auto;
    const { scope, surahCache, selectedSurahId, selectedAyah, riwayah, tempo, tau, modelSize, refEval, refCache, modelStatus } =
      get();
    const data = surahCache[selectedSurahId];
    if (scope !== 'ayah' || !data) return;
    const { reciter } = get().referenceOf();
    const key = refKey(selectedSurahId, selectedAyah, reciter.id);
    if (refEval.status === 'loading' && refEval.key === key) return;
    // التلقائي لا يُعيد ما فشل للآية نفسها (لا إلحاح على شبكةٍ منقطعة)، ولا يعمل بلا اتصال
    if (auto && refEval.status === 'error' && refEval.key === key) return;
    if (auto && typeof navigator !== 'undefined' && navigator.onLine === false) return;

    const cached = refCache[key];
    // مرجع محفوظ سابقًا → جاهز فورًا. وما قِيس بالصوت وحده (قبل تجهيز السماع الذكي)
    // يُرقّى إلى القياس الكامل متى جُهِّز — والمستخدم لا يسجّل ولا يُحلَّل له شيء.
    const busy = get().processing || get().recording;
    const upgrade = !!cached && cached.quality === 'fast' && modelStatus === 'ready' && !busy && !opts?.fastOnly;
    if (cached && !upgrade) {
      set({ refEval: { status: 'ready', key, stage: '', error: null, auto } });
      get().applyReference();
      return;
    }
    // التهيئة التلقائية لا تزاحم تسجيلًا جاريًا أو تحليلًا (وتُستأنف بعده من setResult)
    if (auto && busy) return;

    const stage = (t: string) =>
      set({ refEval: { status: 'loading', key, stage: t, error: null, auto } });
    stage(`جلب صوت القارئ المعتمد (${reciter.name})…`);
    try {
      const blob = await fetchReciterBlob(reciter.id, selectedSurahId, selectedAyah);
      stage('فكّ ترميز الصوت…');
      const samples = await decodeBlobTo16k(blob);

      // القياس الكامل (بالسماع الذكي) إن كان جاهزًا؛ وإلا فقياس الصوت وحده في الخيط —
      // فلا يُزاحم تهيئةُ المرجع التلقائية تحليلَ تلاوة المستخدم في العامل.
      const full = modelStatus === 'ready' && !opts?.fastOnly;
      const target = buildTarget(data, 'ayah', selectedAyah);
      const res = await engineAlign(
        { samples, url: null, demo: false },
        {
          tau,
          modelSize,
          target,
          riwayah,
          tempo,
          fast: !full,
          reference: { id: reciter.id, name: reciter.name, pace: reciter.pace },
        },
        {
          stage: (t) => stage(t),
          model: (e) => {
            if (e.status === 'loading') set({ modelStatus: 'loading', modelProgress: e.progress ?? 0 });
            else if (e.status === 'ready') set({ modelStatus: 'ready', modelProgress: 1, modelMessage: null });
          },
        },
      );

      const ref: RefAlignment = {
        label: reciter.name,
        reciterId: reciter.id,
        quality: full ? 'full' : 'fast',
        durationMs: res.durationMs,
        score: res.overallScore,
        words: res.words.map((w) => ({ startMs: w.startMs, endMs: w.endMs })),
      };
      const next = { ...get().refCache, [key]: ref };
      saveRefs(next);
      set({ refCache: next, refEval: { status: 'ready', key, stage: '', error: null, auto } });
      get().applyReference();
    } catch (e: any) {
      set({
        refEval: {
          status: 'error',
          key,
          stage: '',
          auto,
          error:
            e?.message === 'OFFLINE'
              ? 'تعذّر جلب صوت القارئ المعتمد — هذه الخطوة تحتاج اتصالًا بالإنترنت (مرة واحدة لكل آية). ويبقى القارئ المرجعي مسطرةً للسرعة في كل تحليل.'
              : (e?.message ?? 'تعذّر تقييم تلاوة القارئ المعتمد — أعد المحاولة.'),
        },
      });
    }
  },

  schedulePrefetch: (delayMs = 1500) => {
    if (prefetchTimer) clearTimeout(prefetchTimer);
    prefetchTimer = setTimeout(() => {
      prefetchTimer = null;
      // التهيئة المسبقة بقياس الصوت وحده (في الخيط، عشرات الملّي ثانية): لا تُشغل العامل
      // فيتأخّر التحقّق اللحظي إن بدأ القارئ التسجيل — وتُرقّى بعد أول تحليل
      void get().evaluateReciter({ auto: true, fastOnly: true });
    }, delayMs);
  },

  applyReference: () => {
    const { result, selectedSurahId, selectedAyah, scope, tau, tempo, useReciterGate, refCache, progress, riwayah } = get();
    if (!result || result.demo || scope !== 'ayah') return;
    if (result.targetKey !== `${selectedSurahId}:ayah:${selectedAyah}`) return;
    const { reciter } = get().referenceOf();
    const ref = refCache[refKey(selectedSurahId, selectedAyah, reciter.id)];
    if (!ref) return;
    // النتيجة الأصلية (بلا تحكيم) هي أساس الضمّ — فلا يتراكم تحكيمٌ على تحكيم
    const base: AlignmentResult = result.selfPassed === undefined ? result : { ...result, passed: result.selfPassed, reciter: undefined };
    let final: AlignmentResult = { ...withReference(base, ref, reciter, tau, tempo, useReciterGate), selfPassed: base.passed };
    const key = `${selectedSurahId}:${riwayah}`;
    const prev = progress[key]?.[selectedAyah];
    let nextProgress = progress;
    const setPassed = (passed: boolean) => {
      nextProgress = {
        ...progress,
        [key]: {
          ...(progress[key] ?? {}),
          [selectedAyah]: { ...(prev ?? { bestScore: result.overallScore, lastScore: result.overallScore, at: 0 }), passed, at: Date.now() },
        },
      };
      saveProgress(nextProgress);
    };
    if (final.passed && !prev?.passed) {
      setPassed(true);
      final = { ...final, progressGranted: true };
    } else if (!final.passed && prev?.passed && result.progressGranted) {
      // أجازت الدرجةُ الذاتية الآيةَ قبل أن يحضر المرجع، ثم خالفته التلاوة: يُسحب الاجتياز
      setPassed(false);
      final = { ...final, progressGranted: false };
    }
    set({ result: final, progress: nextProgress });
  },

  init: async () => {
    const saved = loadSettings();
    const progress = loadProgress();
    const refs = loadRefs();
    set({
      progress,
      refCache: refs,
      ...(saved.tempo ? { tempo: saved.tempo } : {}),
      ...(typeof saved.tau === 'number' ? { tau: saved.tau } : {}),
      ...(saved.riwayah ? { riwayah: saved.riwayah } : {}),
      ...(saved.modelSize ? { modelSize: saved.modelSize } : {}),
      ...(typeof saved.alertOn === 'boolean' ? { alertOn: saved.alertOn } : {}),
      ...(saved.theme ? { theme: saved.theme } : {}),
      ...(typeof saved.useReciterGate === 'boolean' ? { useReciterGate: saved.useReciterGate } : {}),
      ...(typeof saved.instantEval === 'boolean' ? { instantEval: saved.instantEval } : {}),
      ...(typeof saved.referenceChoice === 'string' ? { referenceChoice: saved.referenceChoice } : {}),
      ...(saved.recitationStyle === 'murattal' || saved.recitationStyle === 'mujawwad'
        ? { recitationStyle: saved.recitationStyle }
        : {}),
    });
    applyTheme(get().theme);
    if (get().surahsStatus === 'ready') return;
    set({ surahsStatus: 'loading' });
    try {
      const surahs = await fetchSurahs();
      set({ surahs, surahsStatus: 'ready' });
      get().selectSurah(get().selectedSurahId || 1);
    } catch {
      set({ surahsStatus: 'error' });
    }
    // السماع الذكي شرطُ الاجتياز (التحقّق من أنّ المقروء هو الآية)، فيُجهَّز تلقائيًّا
    // عند الفتح — مرةً واحدة ثم يُخزَّن في المتصفّح ويعمل دون إنترنت.
    get().autoLoadModel();
  },

  autoLoadModel: () => {
    if (get().modelStatus !== 'idle') return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
    void get().loadModel();
  },

  selectSurah: (id) => {
    set({ selectedSurahId: id, selectedAyah: 1, result: null, activeWord: -1 });
    void (async () => {
      const cached = surahCache.get(id);
      if (cached) {
        set((s) => ({ surahCache: { ...s.surahCache, [id]: cached }, surahStatus: 'ready' }));
        get().schedulePrefetch();
        return;
      }
      set({ surahStatus: 'loading' });
      try {
        const d = await fetchSurah(id);
        surahCache.set(id, d);
        set((s) => ({ surahCache: { ...s.surahCache, [id]: d }, surahStatus: 'ready' }));
        get().schedulePrefetch();
      } catch {
        set({ surahStatus: 'error' });
      }
    })();
  },

  selectAyah: (n) => {
    set({ selectedAyah: n, result: null, activeWord: -1, refEval: { status: 'idle', key: '', stage: '', error: null } });
    // القارئ المرجعي حاضرٌ في كل تحليل: يُهيَّأ مرجعُ الآية في الخلفية ولو لم يُطلب
    get().schedulePrefetch();
  },
  setScope: (scope) => set({ scope }),
  setRiwayah: (riwayah) => {
    // القارئ المختار من روايةٍ أخرى لا يصلح مرجعًا: يعود الاختيار تلقائيًّا
    const { referenceChoice, recitationStyle } = get();
    const keep = referenceChoice === 'auto' || resolveReciter(riwayah, get().tempo, recitationStyle, referenceChoice).auto === false;
    set({
      riwayah,
      result: null,
      activeWord: -1,
      refEval: { status: 'idle', key: '', stage: '', error: null },
      ...(keep ? {} : { referenceChoice: 'auto' }),
      ...(stylesFor(riwayah).includes(recitationStyle) ? {} : { recitationStyle: 'murattal' as RecitationStyle }),
    });
    persistSettings(get);
    get().schedulePrefetch();
  },
  setTempo: (tempo) => {
    set({ tempo, result: null, activeWord: -1, refEval: { status: 'idle', key: '', stage: '', error: null } });
    persistSettings(get);
    get().schedulePrefetch();
  },
  setActiveTab: (activeTab) => set({ activeTab }),
  setModelSize: (modelSize) => {
    set({ modelSize, modelStatus: 'idle', modelProgress: 0, modelMessage: null });
    persistSettings(get);
  },
  setTau: (tau) => {
    set({ tau });
    persistSettings(get);
  },

  loadModel: async () => {
    const size = get().modelSize;
    fileProgress.clear();
    set({ modelStatus: 'loading', modelProgress: 0, modelMessage: null });
    try {
      await engineLoadModel(size, (p) => {
        fileProgress.set(p.file || 'file', p.progress ?? 0);
        const vals = [...fileProgress.values()];
        const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
        set({ modelProgress: Math.max(0, Math.min(1, avg)) });
      });
      set({ modelStatus: 'ready', modelProgress: 1 });
    } catch (e: any) {
      set({
        modelStatus: 'error',
        modelMessage: e?.message ?? 'تعذّر تحميل النموذج — سيُستخدم المحرّك الاحتياطي تلقائيًا',
      });
    }
  },

  setRecording: (recording, micError = null) => set({ recording, micError }),
  setProcessing: (processing, stage = '') => set({ processing, stage, ...(processing ? { activeTab: 'result' as const } : {}) }),
  setActiveWord: (activeWord) => set({ activeWord }),

  progressKey: () => `${get().selectedSurahId}:${get().riwayah}`,

  setResult: (result) => {
    if (!result) {
      set({ result: null, activeWord: -1 });
      return;
    }
    const { selectedSurahId, selectedAyah, scope, riwayah, tempo, tau, progress, useReciterGate, refCache } = get();

    // التحكيم بالقارئ المعتمد: إن وُجد مرجعٌ لهذه الآية فتُقارن به تلاوةُ المستخدم،
    // ويُشترط للاجتياز (إن كان مفعّلًا) أن تجتاز الدرجةُ الذاتية ومطابقةُ القارئ معًا.
    // وإن لم يكن المرجع جاهزًا بعدُ هُيِّئ في الخلفية وضُمّ إلى النتيجة متى جهز.
    const { reciter } = get().referenceOf();
    let final: AlignmentResult = { ...result, selfPassed: result.passed };
    let needRef = false;
    if (!result.demo && scope === 'ayah') {
      const ref = refCache[refKey(selectedSurahId, selectedAyah, reciter.id)];
      if (ref) final = { ...withReference(result, ref, reciter, tau, tempo, useReciterGate), selfPassed: result.passed };
      needRef = !ref || ref.quality === 'fast';
    }

    let nextProgress = progress;
    if (scope === 'ayah') {
      const key = `${selectedSurahId}:${riwayah}`;
      const prev = progress[key]?.[selectedAyah];
      const passed = final.passed || !!prev?.passed;
      // اجتيازٌ منحته هذه النتيجة الآن (لم يكن قبلها) — فإن جاء مرجعُ القارئ بعدها
      // فخالفته التلاوة سُحب (applyReference)؛ فالمرجع هو الفيصل متى حضر.
      final = { ...final, progressGranted: final.passed && !prev?.passed };
      const rec: AyahRecord = {
        bestScore: Math.max(prev?.bestScore ?? 0, final.overallScore),
        lastScore: final.overallScore,
        passed,
        at: Date.now(),
      };
      nextProgress = { ...progress, [key]: { ...(progress[key] ?? {}), [selectedAyah]: rec } };
      saveProgress(nextProgress);
    }
    set({ result: final, activeWord: -1, activeTab: 'result', progress: nextProgress });
    // بعد أن تفرغ الواجهة من التحليل (processing) يُهيَّأ المرجع أو يُرقّى، ثم يُضمّ
    if (needRef) {
      if (prefetchTimer) clearTimeout(prefetchTimer);
      prefetchTimer = setTimeout(() => {
        prefetchTimer = null;
        void get().evaluateReciter({ auto: true });
      }, 600);
    }
  },

  advanceAyah: () => {
    const { selectedSurahId, selectedAyah, surahCache } = get();
    const data = surahCache[selectedSurahId];
    const last = data?.meta.numberOfAyahs ?? 0;
    if (!last || selectedAyah >= last) return false;
    set({ selectedAyah: selectedAyah + 1, result: null, activeWord: -1, activeTab: 'practice', scope: 'ayah' });
    return true;
  },
}));

export { PASS_SCORE };
