// TAHQĪQ — global app store (zustand)

import { create } from 'zustand';
import { fetchSurah, fetchSurahs } from '@/lib/quran';
import type {
  AlignmentResult,
  AppTab,
  AyahRecord,
  ModelSize,
  ModelStatus,
  Riwayah,
  SurahData,
  SurahMeta,
  Tempo,
} from '@/lib/types';
import { PASS_SCORE } from '@/lib/types';
import { loadWhisper } from '@/lib/whisper';

const surahCache = new Map<number, SurahData>();
const fileProgress = new Map<string, number>();
const PROGRESS_KEY = 'tahqiq-progress-v1';
const SETTINGS_KEY = 'tahqiq-settings-v1';

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

function loadSettings(): Partial<Pick<TahqiqStore, 'tempo' | 'tau' | 'riwayah' | 'modelSize' | 'alertOn'>> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveSettings(s: { tempo: Tempo; tau: number; riwayah: Riwayah; modelSize: ModelSize; alertOn: boolean }) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    /* quota */
  }
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

  init: () => Promise<void>;
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
  saveSettings({ tempo: s.tempo, tau: s.tau, riwayah: s.riwayah, modelSize: s.modelSize, alertOn: s.alertOn });
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

  setAlertOn: (alertOn) => {
    set({ alertOn });
    persistSettings(get);
  },

  init: async () => {
    const saved = loadSettings();
    const progress = loadProgress();
    set({
      progress,
      ...(saved.tempo ? { tempo: saved.tempo } : {}),
      ...(typeof saved.tau === 'number' ? { tau: saved.tau } : {}),
      ...(saved.riwayah ? { riwayah: saved.riwayah } : {}),
      ...(saved.modelSize ? { modelSize: saved.modelSize } : {}),
      ...(typeof saved.alertOn === 'boolean' ? { alertOn: saved.alertOn } : {}),
    });
    if (get().surahsStatus === 'ready') return;
    set({ surahsStatus: 'loading' });
    try {
      const surahs = await fetchSurahs();
      set({ surahs, surahsStatus: 'ready' });
      get().selectSurah(get().selectedSurahId || 1);
    } catch {
      set({ surahsStatus: 'error' });
    }
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

  selectAyah: (n) => set({ selectedAyah: n, result: null, activeWord: -1 }),
  setScope: (scope) => set({ scope }),
  setRiwayah: (riwayah) => {
    set({ riwayah, result: null, activeWord: -1 });
    persistSettings(get);
  },
  setTempo: (tempo) => {
    set({ tempo, result: null, activeWord: -1 });
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
      await loadWhisper(size, (p) => {
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
    const { selectedSurahId, selectedAyah, scope, riwayah, progress } = get();
    let nextProgress = progress;
    if (scope === 'ayah') {
      const key = `${selectedSurahId}:${riwayah}`;
      const prev = progress[key]?.[selectedAyah];
      const passed = result.overallScore >= PASS_SCORE || !!prev?.passed;
      const rec: AyahRecord = {
        bestScore: Math.max(prev?.bestScore ?? 0, result.overallScore),
        lastScore: result.overallScore,
        passed,
        at: Date.now(),
      };
      nextProgress = { ...progress, [key]: { ...(progress[key] ?? {}), [selectedAyah]: rec } };
      saveProgress(nextProgress);
    }
    set({ result, activeWord: -1, activeTab: 'result', progress: nextProgress });
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
