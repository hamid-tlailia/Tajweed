// TAHQĪQ — shared domain types

export type ModelSize = 'tiny' | 'base';
export type EngineId = 'whisper-attn' | 'whisper-ts' | 'whisper-energy' | 'offline-dtw';
export type ModelStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface SurahMeta {
  id: number;
  name: string;
  englishName: string;
  englishNameTranslation: string;
  revelationType: string; // 'Meccan' | 'Medinan'
  numberOfAyahs: number;
}

export interface Ayah {
  number: number;
  numberInSurah: number;
  text: string; // Uthmani text with full tashkeel
}

export interface SurahData {
  id: number;
  meta: SurahMeta;
  ayahs: Ayah[];
}

export interface WordTajweed {
  word: string;
  syllables: number;
  isMadd: boolean;
  maddType: string | null; // 'مَدٌّ طَبِيعِي' | 'مَدٌّ وَاجِبٌ مُتَّصِل' | 'مَدٌّ وَاجِبٌ مُنْفَصِل' | 'مَدٌّ تَعْويضي'
  isGhunna: boolean;
  ghunnaType: string | null; // 'غُنّة مَدِّية' | 'غُنّة إخفاء' | 'غُنّة إدغام' | 'غُنّة خَفِيّة'
  rules: { label: string; tone: 'gold' | 'mint' | 'slate' }[]; // all detected rules (display)
  expectedMs: number; // model expected duration for tajweed timing
}

export type WordStatus = 'excellent' | 'ok' | 'short' | 'long' | 'silent';

export interface WordAlignment {
  index: number;
  ayah: number;
  word: string;
  startMs: number;
  endMs: number;
  confidence: number; // 0..1
  status: WordStatus;
  tajweed: WordTajweed;
}

export interface AlignmentResult {
  targetKey: string;
  targetLabel: string;
  engine: EngineId;
  transcript: string;
  transcriptMatch: number; // 0..1 — captured target words ratio
  predWords: { word: string; ok: boolean }[];
  overallScore: number; // 0..100
  verdict: string;
  durationMs: number;
  words: WordAlignment[];
  demo: boolean;
  createdAt: number;
  audioUrl: string | null;
  samples: Float32Array | null;
}

export interface TargetSpec {
  key: string;
  label: string;
  words: { word: string; ayah: number }[];
}

export interface ModelEvent {
  status: 'loading' | 'ready' | 'error';
  progress?: number;
  message?: string;
}
