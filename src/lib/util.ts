// TAHQĪQ — small shared utilities

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);

/**
 * ألوان الرسم على لوحات الموجة من متغيّرات الثيم — تُخزَّن مؤقتًا حتى يتغيّر
 * صنف الثيم على <html>، فلا تُقرأ الأنماط في كل إطار رسم.
 */
let waveColorCache: { cls: string; c: Record<string, string> } | null = null;
export function waveThemeColors(): {
  center: string;
  idle: string;
  playhead: string;
  done: string;
  todo: string;
} {
  const fallback = {
    center: 'rgba(255,255,255,0.05)',
    idle: 'rgba(139,150,169,0.28)',
    playhead: 'rgba(241,220,155,0.9)',
    done: 'rgba(212,175,55,0.9)',
    todo: 'rgba(100,116,139,0.28)',
  };
  if (typeof document === 'undefined') return fallback;
  const cls = document.documentElement.className;
  if (!waveColorCache || waveColorCache.cls !== cls) {
    const cs = getComputedStyle(document.documentElement);
    const get = (k: string, d: string) => cs.getPropertyValue(k).trim() || d;
    waveColorCache = {
      cls,
      c: {
        center: get('--wave-center', fallback.center),
        idle: get('--wave-idle', fallback.idle),
        playhead: get('--wave-playhead', fallback.playhead),
        done: get('--wave-done', fallback.done),
        todo: get('--wave-todo', fallback.todo),
      },
    };
  }
  return waveColorCache.c as ReturnType<typeof waveThemeColors>;
}

export function fmtTime(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function fmtSec(ms: number): string {
  return (ms / 1000).toFixed(2) + ' ث';
}

/** Deterministic PRNG for the demo simulator */
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
