// TAHQĪQ — global app store (zustand)

import { create } from 'zustand';
import { fetchSurah, fetchSurahs } from '@/lib/quran';
import type { AlignmentResult, ModelSize, ModelStatus, Riwayah, SurahData, SurahMeta } from '@/lib/types';
import { loadWhisper } from '@/lib/whisper';

const surahCache = new Map<number, SurahData>();
const fileProgress = new Map<string, number>();

interface TahqiqStore {
  surahs: SurahMeta[];
  surahsStatus: 'loading' | 'ready' | 'error';
  selectedSurahId: number;
  surahCache: Record<number, SurahData>;
  surahStatus: 'idle' | 'loading' | 'ready' | 'error';
  selectedAyah: number;
  scope: 'ayah' | 'surah';
  riwayah: Riwayah;

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
  setModelSize: (s: ModelSize) => void;
  setTau: (t: number) => void;
  loadModel: () => Promise<void>;
  setRecording: (r: boolean, micError?: string | null) => void;
  setProcessing: (p: boolean, stage?: string) => void;
  setResult: (r: AlignmentResult | null) => void;
  setActiveWord: (i: number) => void;
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

  setAlertOn: (alertOn) => set({ alertOn }),

  init: async () => {
    if (get().surahsStatus === 'ready') return;
    set({ surahsStatus: 'loading' });
    try {
      const surahs = await fetchSurahs();
      set({ surahs, surahsStatus: 'ready' });
      get().selectSurah(1);
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

  selectAyah: (n) => set({ selectedAyah: n }),
  setScope: (scope) => set({ scope }),
  // تغيير الرواية يُبطِل نتيجةً حُلِّلت بغيرها من الأصول
  setRiwayah: (riwayah) => set({ riwayah, result: null, activeWord: -1 }),
  setModelSize: (modelSize) => set({ modelSize, modelStatus: 'idle', modelProgress: 0, modelMessage: null }),
  setTau: (tau) => set({ tau }),

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
  setProcessing: (processing, stage = '') => set({ processing, stage }),
  setResult: (result) => set({ result, activeWord: -1 }),
  setActiveWord: (activeWord) => set({ activeWord }),
}));
