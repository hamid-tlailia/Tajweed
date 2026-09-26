'use client';

/** نتيجة التعرّف الأصلي في المتصفح. قد تستخدم بعض المتصفحات خدمةً سحابية؛
 * لذلك هي قناة اختيارية مساعدة وليست بديلًا قسريًا عن التحليل المحلي. */
export interface BrowserSpeechUpdate {
  text: string;
  final: boolean;
}

type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: any) => void) | null;
  onerror: ((event: any) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
};

export function browserSpeechAvailable(): boolean {
  if (typeof window === 'undefined') return false;
  const w = window as any;
  return !!(w.SpeechRecognition || w.webkitSpeechRecognition);
}

/** يشغّل Web Speech API بالتوازي مع التسجيل ويعيد النص النهائي والمؤقت مجتمعين. */
export function startBrowserSpeech(onUpdate: (u: BrowserSpeechUpdate) => void): { stop: () => void; text: () => string } | null {
  if (!browserSpeechAvailable()) return null;
  const w = window as any;
  const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
  const rec: Recognition = new Ctor();
  rec.lang = 'ar-SA';
  rec.continuous = true;
  rec.interimResults = true;
  rec.maxAlternatives = 1;
  let settled = '';
  let latest = '';
  let stopped = false;
  rec.onresult = (event: any) => {
    let interim = '';
    for (let i = event.resultIndex ?? 0; i < event.results.length; i++) {
      const phrase = String(event.results[i]?.[0]?.transcript ?? '').trim();
      if (!phrase) continue;
      if (event.results[i].isFinal) settled = `${settled} ${phrase}`.trim();
      else interim = `${interim} ${phrase}`.trim();
    }
    latest = `${settled} ${interim}`.trim();
    onUpdate({ text: latest, final: !interim });
  };
  rec.onerror = () => {};
  rec.onend = () => {
    // Chrome قد ينهي جلسة الاستماع تلقائيًا بعد صمت؛ أعدها ما دام التسجيل مستمرًا.
    if (!stopped) {
      try { rec.start(); } catch { /* جلسة ما زالت تُغلق */ }
    }
  };
  try { rec.start(); } catch { return null; }
  return {
    stop: () => {
      stopped = true;
      try { rec.stop(); } catch { /* noop */ }
    },
    text: () => latest.trim(),
  };
}
