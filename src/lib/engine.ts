// TAHQĪQ — واجهة محرّك السماع الذكي من الخيط الرئيس
//
// تُشغِّل التحليلَ الكامل وتنزيلَ النموذج والتفريغَ اللحظي في عاملٍ (Web Worker)
// إن أمكن — فلا يتجمّد الخيط الرئيس أثناء التعرّف على الكلام، ويمكن الاستماع
// أثناء التسجيل نفسه. وإن تعذّر العامل (متصفّح قديم، أو فشل التحميل) عادت إلى
// التشغيل في الخيط نفسه كما كان — الوظيفة واحدة، والعامل تحسينٌ لا شرط.
//
// التقييم اللحظي (fast) والعرض التجريبي لا يحتاجان النموذج فيُنفَّذان في الخيط
// مباشرةً (عشرات الملّي ثانية) ولا ينتظران طابور العامل.

import type { AlignHooks, AlignInput, AlignOpts } from './alignment';
import type { AlignmentResult, ModelSize } from './types';
import type { EngineRequest, EngineResponse } from './engine.worker';

type Pending = {
  resolve: (v: any) => void;
  reject: (e: Error) => void;
  hooks?: AlignHooks;
  onProgress?: (p: { file: string; progress: number }) => void;
};

let worker: Worker | null | undefined; // undefined = لم يُجرَّب بعد
let ready: Promise<boolean> | null = null;
let seq = 0;
const pending = new Map<number, Pending>();

function failAll(message: string): void {
  for (const [, p] of pending) p.reject(new Error(message));
  pending.clear();
}

/** إنشاء العامل مع مصافحةٍ قصيرة: إن لم يُجب في مهلته عُدّ متعذّرًا */
function ensureWorker(): Promise<boolean> {
  if (ready) return ready;
  ready = new Promise<boolean>((resolve) => {
    if (typeof window === 'undefined' || typeof Worker === 'undefined') {
      worker = null;
      resolve(false);
      return;
    }
    let w: Worker;
    try {
      w = new Worker(new URL('./engine.worker.ts', import.meta.url), { type: 'module' });
    } catch (e) {
      console.warn('[TAHQIQQ] engine worker unavailable → in-thread:', e);
      worker = null;
      resolve(false);
      return;
    }
    let settled = false;
    const timer = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      window.clearInterval(pinger);
      console.warn('[TAHQIQQ] engine worker did not answer → in-thread');
      try {
        w.terminate();
      } catch {
        /* noop */
      }
      worker = null;
      resolve(false);
    }, 8000);
    // تُعاد المصافحة حتى يُجيب (الرسالة الأولى قد تسبق تهيئة العامل في بعض المتصفحات)
    const pinger = window.setInterval(() => {
      if (settled) {
        window.clearInterval(pinger);
        return;
      }
      w.postMessage({ type: 'ping', id: 0 } satisfies EngineRequest);
    }, 400);
    w.onmessage = (ev: MessageEvent<EngineResponse>) => {
      const m = ev.data;
      if (!m) return;
      if (m.type === 'pong') {
        if (!settled) {
          settled = true;
          window.clearTimeout(timer);
          window.clearInterval(pinger);
          worker = w;
          resolve(true);
        }
        return;
      }
      const p = pending.get(m.id);
      if (!p) return;
      switch (m.type) {
        case 'progress':
          p.onProgress?.({ file: m.file, progress: m.progress });
          break;
        case 'stage':
          p.hooks?.stage(m.text);
          break;
        case 'model':
          p.hooks?.model?.({ status: m.status, progress: m.progress, message: m.message });
          break;
        case 'done':
          pending.delete(m.id);
          p.resolve(m.result ?? m.text ?? undefined);
          break;
        case 'error':
          pending.delete(m.id);
          p.reject(new Error(m.message));
          break;
      }
    };
    w.onerror = (e) => {
      console.warn('[TAHQIQQ] engine worker error:', e?.message ?? e);
      if (!settled) {
        settled = true;
        window.clearTimeout(timer);
        window.clearInterval(pinger);
        worker = null;
        resolve(false);
      }
      // عاملٌ معطوب: تُرفض طلباته المعلَّقة ويُعاد المحاولة في الخيط لاحقًا
      failAll(e?.message ?? 'worker error');
      try {
        w.terminate();
      } catch {
        /* noop */
      }
      worker = null;
      ready = null;
    };
    w.postMessage({ type: 'ping', id: 0 } satisfies EngineRequest);
  });
  return ready;
}

function send<T>(req: EngineRequest, p: Omit<Pending, 'resolve' | 'reject'>, transfer?: Transferable[]): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const w = worker;
    if (!w) {
      reject(new Error('no worker'));
      return;
    }
    pending.set(req.id, { ...p, resolve, reject });
    if (transfer?.length) w.postMessage(req, transfer);
    else w.postMessage(req);
  });
}

/** هل يعمل السماع الذكي في عاملٍ منفصل؟ (يُعرف بعد أول استعمال) */
export function engineInWorker(): boolean {
  return !!worker;
}

/** تنزيل/تهيئة النموذج (في العامل إن أمكن) */
export async function engineLoadModel(
  size: ModelSize,
  onProgress?: (p: { file: string; progress: number }) => void,
): Promise<void> {
  if (await ensureWorker()) {
    await send<void>({ type: 'load', id: ++seq, size }, { onProgress });
    return;
  }
  const { loadWhisper } = await import('./whisper');
  await loadWhisper(size, onProgress);
}

/**
 * التحليل الكامل. يعمل في العامل إلا في اللحظي والتجريبي (لا نموذج فيهما).
 * العيّنات تُنقل إلى العامل نقلًا (transfer) وتعود مع النتيجة، فلا تُنسخ.
 */
export async function engineAlign(input: AlignInput, opts: AlignOpts, hooks: AlignHooks): Promise<AlignmentResult> {
  const inThread = async () => {
    const { runAlignment } = await import('./alignment');
    return runAlignment(input, opts, hooks);
  };
  if (opts.fast || input.demo) return inThread();
  if (!(await ensureWorker())) return inThread();
  // نسخةٌ للنقل: الأصل قد يُحتاج إليه في الخيط (إعادة التقييم)
  const samples = input.samples.slice();
  try {
    const res = await send<AlignmentResult>(
      { type: 'align', id: ++seq, samples, demo: !!input.demo, opts },
      { hooks },
      [samples.buffer],
    );
    return { ...res, audioUrl: input.url ?? null };
  } catch (e) {
    if (!worker) return inThread(); // انهار العامل → الخيط
    throw e;
  }
}

/** تفريغ مقطعٍ إلى نصّ فحسب (للتحقّق اللحظي أثناء التسجيل) */
export async function engineTranscribe(samples: Float32Array, size: ModelSize): Promise<string> {
  if (await ensureWorker()) {
    const copy = samples.slice();
    return send<string>({ type: 'transcribe', id: ++seq, size, samples: copy }, {}, [copy.buffer]);
  }
  const { loadWhisper, whisperTranscribeChunked } = await import('./whisper');
  const b = await loadWhisper(size);
  return (await whisperTranscribeChunked(b, samples, 2)).text;
}
