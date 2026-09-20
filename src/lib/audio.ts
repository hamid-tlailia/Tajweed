// TAHQĪQ — audio I/O: microphone recorder, 16k mono decode, energy envelope, demo synthesis

import type { WordTajweed } from './types';
import { mulberry32 } from './util';

export class Recorder {
  private stream: MediaStream | null = null;
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private rec: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private raf = 0;

  onWave: ((td: Float32Array) => void) | null = null;
  micError: string | null = null;

  async start(): Promise<void> {
    this.micError = null;
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
      });
    } catch (e: any) {
      this.micError =
        e?.name === 'NotAllowedError'
          ? 'تم رفض إذن الميكروفون — استعمل «رفع ملفّ صوتي» أو «تجربة سريعة».'
          : 'الميكروفون غير متوفّر في هذه البيئة — استعمل «رفع ملفّ صوتي» أو «تجربة سريعة».';
      throw new Error('MIC_UNAVAILABLE');
    }
    const AC: typeof AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    this.ctx = new AC();
    const srcNode = this.ctx.createMediaStreamSource(this.stream);
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0.55;
    srcNode.connect(this.analyser);

    const mime =
      ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'].find(
        (m) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m),
      ) ?? '';
    this.rec = new MediaRecorder(this.stream, mime ? { mimeType: mime } : undefined);
    this.chunks = [];
    this.rec.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data);
    };
    this.rec.start(250);
  }

  startWaveLoop(): void {
    const loop = () => {
      if (!this.analyser || !this.onWave) return;
      const td = new Float32Array(this.analyser.fftSize);
      this.analyser.getFloatTimeDomainData(td);
      this.onWave(td);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stopWaveLoop(): void {
    cancelAnimationFrame(this.raf);
  }

  stop(): Promise<Blob> {
    return new Promise((resolve) => {
      const r = this.rec;
      if (!r) {
        this.cleanup();
        resolve(new Blob());
        return;
      }
      r.onstop = () => {
        const blob = new Blob(this.chunks, { type: r.mimeType || 'audio/webm' });
        this.cleanup();
        resolve(blob);
      };
      try {
        r.stop();
      } catch {
        this.cleanup();
        resolve(new Blob(this.chunks));
      }
    });
  }

  private cleanup(): void {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.ctx?.close().catch(() => {});
    this.stream = null;
    this.ctx = null;
    this.analyser = null;
    this.rec = null;
  }
}

/** Decode any audio Blob → mono Float32Array @ 16kHz (Whisper input spec) */
export async function decodeBlobTo16k(blob: Blob): Promise<Float32Array> {
  const ab = await blob.arrayBuffer();
  const AC: typeof AudioContext = window.AudioContext || (window as any).webkitAudioContext;
  const ac = new AC();
  const buf = await ac.decodeAudioData(ab);
  await ac.close().catch(() => {});
  if (buf.sampleRate === 16000 && buf.numberOfChannels === 1) return (buf.getChannelData(0) as Float32Array).slice();
  const off = new OfflineAudioContext(1, Math.max(1600, Math.ceil(buf.duration * 16000)), 16000);
  const src = off.createBufferSource();
  src.buffer = buf;
  src.connect(off.destination);
  src.start(0);
  const rendered = await off.startRendering();
  return rendered.getChannelData(0);
}

/** RMS energy envelope at 40ms frames (= Whisper encoder frame rate, 25 fps) */
export function energyEnvelope(samples: Float32Array, frameMs = 40): Float32Array {
  const sr = 16000;
  const frame = Math.max(1, Math.round((sr * frameMs) / 1000));
  const n = Math.max(1, Math.floor(samples.length / frame));
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    const start = i * frame;
    for (let j = 0; j < frame; j++) {
      const v = samples[start + j] ?? 0;
      s += v * v;
    }
    out[i] = Math.sqrt(s / frame);
  }
  return out;
}

/**
 * Demo mode: synthesize a plausible recitation-like 16kHz signal whose word
 * boundaries & durations follow the tajweed model (with realistic variation),
 * so the full pipeline can be exercised without a microphone.
 */
export function makeDemoSamples(tjs: WordTajweed[], seed = 20260918): Float32Array {
  const sr = 16000;
  const rng = mulberry32(seed);
  const parts: Float32Array[] = [];
  for (const tj of tjs) {
    const durSec = (tj.expectedMs * (0.78 + rng() * 0.5)) / 1000;
    const n = Math.max(Math.floor(sr * 0.12), Math.floor(durSec * sr));
    const seg = new Float32Array(n);
    const f0 = 105 + rng() * 110;
    const f1 = 240 + rng() * 260;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const env = Math.pow(Math.sin((Math.PI * i) / n), 0.7);
      const vib = 1 + 0.08 * Math.sin(2 * Math.PI * 4.5 * t);
      let v = 0;
      for (let h = 1; h <= 4; h++) v += Math.sin(2 * Math.PI * f0 * h * vib * t) / h;
      v += 0.35 * Math.sin(2 * Math.PI * f1 * t) * Math.sin((Math.PI * t) / Math.max(1e-6, durSec));
      seg[i] = v * env * 0.3 + (rng() - 0.5) * 0.025;
    }
    parts.push(seg);
    const gapSec = 0.055 + rng() * 0.075;
    parts.push(new Float32Array(Math.floor(gapSec * sr)).fill(0));
  }
  const total = parts.reduce((a, b) => a + b.length, 0);
  const out = new Float32Array(total);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}
