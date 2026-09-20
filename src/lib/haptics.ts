// اهتزاز وصوت خفيف عند النتيجة — لا يعتمد على مكتبات خارجية

let alertCtx: AudioContext | null = null;

function ensureAudio(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  try {
    if (!alertCtx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      alertCtx = new AC();
    }
    if (alertCtx.state === 'suspended') void alertCtx.resume();
    return alertCtx;
  } catch {
    return null;
  }
}

export function beep(freq: number, ms = 90, gainV = 0.05) {
  const ctx = ensureAudio();
  if (!ctx) return;
  try {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.value = freq;
    g.gain.value = gainV;
    o.connect(g).connect(ctx.destination);
    o.start();
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + ms / 1000);
    o.stop(ctx.currentTime + ms / 1000 + 0.02);
  } catch {
    /* noop */
  }
}

export function vibrate(pattern: number | number[]) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* noop */
  }
}

/** عند الهبوط على كلمة مخالفة أثناء التشغيل */
export function wordViolation(status: string) {
  vibrate(status === 'silent' ? [70, 50, 70] : [45, 35, 45]);
  beep(status === 'silent' ? 392 : 880);
}

/** عند ظهور النتيجة: نجاح نغمة صاعدة، وإلا اهتزاز أوضح */
export function resultPulse(passed: boolean) {
  if (passed) {
    vibrate([30, 40, 70, 40, 110]);
    beep(523, 110, 0.045);
    window.setTimeout(() => beep(659, 140, 0.04), 120);
  } else {
    vibrate([80, 50, 80, 50, 140]);
    beep(330, 140, 0.05);
  }
}
