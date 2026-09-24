// TAHQĪQ — global app store (zustand)

import { create } from 'zustand';
import { engineAlign, engineLoadModel } from '@/lib/engine';
import { compareWithReciter } from '@/lib/compare';
import { decodeBlobTo16k } from '@/lib/audio';
import { fetchSurah, fetchSurahs, buildTarget } from '@/lib/quran';
import { RECITERS, fetchReciterBlob } from '@/lib/reciter';
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
// v2: أُعيد بناء محرّك قياس أزمنة الكلمات، فأزمنةُ القارئ المرجعي المخزَّنة
// بالإصدار الأول مقاسة بقياسٍ مُنحرف — تُهمَل لئلا يُحاكَم القارئ إليها.
const REF_KEY = 'tahqiq-ref-v2';

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
    'tempo' | 'tau' | 'riwayah' | 'modelSize' | 'alertOn' | 'theme' | 'useReciterGate' | 'instantEval'
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
  evaluateReciter: () => Promise<void>;
  setUseReciterGate: (b: boolean) => void;
  refKeyOf: () => string; // مفتاح مرجع الآية/الرواية/المرتبة الحالية

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
  });
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

  modelSize: 'tiny',
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
  },

  setAlertOn: (alertOn) => {
    set({ alertOn });
    persistSettings(get);
  },

  refKeyOf: () => `${get().selectedSurahId}:${get().selectedAyah}:${get().riwayah}:${get().tempo}`,

  evaluateReciter: async () => {
    const { scope, surahCache, selectedSurahId, selectedAyah, riwayah, tempo, tau, modelSize, refEval, refCache } =
      get();
    if (refEval.status === 'loading') return;
    const data = surahCache[selectedSurahId];
    if (scope !== 'ayah' || !data) return;
    const key = `${selectedSurahId}:${selectedAyah}:${riwayah}:${tempo}`;

    // مرجع محفوظ سابقًا → جاهز فورًا
    if (refCache[key]) {
      set({ refEval: { status: 'ready', key, stage: '', error: null } });
      return;
    }

    set({ refEval: { status: 'loading', key, stage: 'جلب صوت القارئ المعتمد…', error: null } });
    try {
      const blob = await fetchReciterBlob(riwayah, selectedSurahId, selectedAyah);
      set({ refEval: { status: 'loading', key, stage: 'فكّ ترميز الصوت…', error: null } });
      const samples = await decodeBlobTo16k(blob);

      const target = buildTarget(data, 'ayah', selectedAyah);
      const res = await engineAlign(
        { samples, url: null, demo: false },
        { tau, modelSize, target, riwayah, tempo },
        {
          stage: (s) => set({ refEval: { status: 'loading', key, stage: s, error: null } }),
          model: (e) => {
            if (e.status === 'loading') set({ modelStatus: 'loading', modelProgress: e.progress ?? 0 });
            else if (e.status === 'ready') set({ modelStatus: 'ready', modelProgress: 1, modelMessage: null });
          },
        },
      );

      const ref: RefAlignment = {
        label: RECITERS[riwayah].name,
        durationMs: res.durationMs,
        score: res.overallScore,
        words: res.words.map((w) => ({ startMs: w.startMs, endMs: w.endMs })),
      };
      const next = { ...get().refCache, [key]: ref };
      saveRefs(next);
      set({ refCache: next, refEval: { status: 'ready', key, stage: '', error: null } });
    } catch (e: any) {
      set({
        refEval: {
          status: 'error',
          key,
          stage: '',
          error:
            e?.message === 'OFFLINE'
              ? 'تعذّر جلب صوت القارئ المعتمد — هذه الخطوة تحتاج اتصالًا بالإنترنت (مرة واحدة لكل آية).'
              : (e?.message ?? 'تعذّر تقييم تلاوة القارئ المعتمد — أعد المحاولة.'),
        },
      });
    }
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
        return;
      }
      set({ surahStatus: 'loading' });
      try {
        const d = await fetchSurah(id);
        surahCache.set(id, d);
        set((s) => ({ surahCache: { ...s.surahCache, [id]: d }, surahStatus: 'ready' }));
      } catch {
        set({ surahStatus: 'error' });
      }
    })();
  },

  selectAyah: (n) => set({ selectedAyah: n, result: null, activeWord: -1, refEval: { status: 'idle', key: '', stage: '', error: null } }),
  setScope: (scope) => set({ scope }),
  setRiwayah: (riwayah) => {
    set({ riwayah, result: null, activeWord: -1, refEval: { status: 'idle', key: '', stage: '', error: null } });
    persistSettings(get);
  },
  setTempo: (tempo) => {
    set({ tempo, result: null, activeWord: -1, refEval: { status: 'idle', key: '', stage: '', error: null } });
    persistSettings(get);
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
    // والمطابقة ≥ حدّ الاجتياز هي التي تُجيز العبور («فإن صحّت جتاز»).
    let final: AlignmentResult = result;
    if (!result.demo && scope === 'ayah' && useReciterGate) {
      const ref = refCache[`${selectedSurahId}:${selectedAyah}:${riwayah}:${tempo}`];
      if (ref) {
        // بوّابة النصّ واحدة في البابين: لا يُجيز التوقيتُ (ولا مطابقةُ القارئ) نصًّا لم يتبيّن
        const textOk = result.textCheck === 'ok' || result.textCheck === 'demo';
        const cmp = compareWithReciter(result.words, ref, tau, textOk, ref.label, result.textCheck);
        if (cmp) final = { ...result, reciter: cmp, passed: cmp.passed && textOk };
      }
    }

    let nextProgress = progress;
    if (scope === 'ayah') {
      const key = `${selectedSurahId}:${riwayah}`;
      const prev = progress[key]?.[selectedAyah];
      const passed = final.passed || !!prev?.passed;
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
