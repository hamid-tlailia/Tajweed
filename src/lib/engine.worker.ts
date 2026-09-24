// TAHQĪQ — عامل السماع الذكي (Web Worker)
//
// يُحمَّل نموذج Whisper ويُشغَّل هنا لا في الخيط الرئيس: فالتعرّف على الكلام
// يستغرق ثوانيَ يتجمّد فيها الخيطُ الرئيس — وتتعطّل معه حلقةُ مستوى الصوت التي
// تُغذّي المرافقة الحية، وتتأخّر الواجهة. وبفصله هنا يمكن أيضًا **الاستماع أثناء
// التسجيل** (التحقّق اللحظي من أن المقروء هو الآية) دون أن يضطرب القياس.
//
// الرسائل: load (تنزيل/تهيئة النموذج) · align (التحليل الكامل) · transcribe
// (تفريغ مقطعٍ فحسب) — وتُنفَّذ الطلبات بالتتابع لأن النموذج واحد.

/// <reference lib="webworker" />

import { runAlignment } from './alignment';
import type { AlignOpts } from './alignment';
import { loadWhisper, whisperTranscribeChunked } from './whisper';
import type { ModelSize } from './types';

export type EngineRequest =
  | { type: 'ping'; id: number }
  | { type: 'load'; id: number; size: ModelSize }
  | { type: 'align'; id: number; samples: Float32Array; demo: boolean; opts: AlignOpts }
  | { type: 'transcribe'; id: number; size: ModelSize; samples: Float32Array };

export type EngineResponse =
  | { type: 'pong'; id: number }
  | { type: 'progress'; id: number; file: string; progress: number }
  | { type: 'stage'; id: number; text: string }
  | { type: 'model'; id: number; status: 'loading' | 'ready' | 'error'; progress?: number; message?: string }
  | { type: 'done'; id: number; result?: unknown; text?: string }
  | { type: 'error'; id: number; message: string };

const ctx = self as unknown as DedicatedWorkerGlobalScope;

function post(msg: EngineResponse, transfer?: Transferable[]): void {
  if (transfer?.length) ctx.postMessage(msg, transfer);
  else ctx.postMessage(msg);
}

/** الطلبات بالتتابع: نموذجٌ واحد لا يُشغَّل على طلبين معًا */
let queue: Promise<void> = Promise.resolve();
function enqueue(job: () => Promise<void>): void {
  queue = queue.then(job, job);
}

ctx.onmessage = (ev: MessageEvent<EngineRequest>) => {
  const m = ev.data;
  if (!m || typeof m !== 'object') return;
  if (m.type === 'ping') {
    post({ type: 'pong', id: m.id });
    return;
  }
  enqueue(async () => {
    const id = m.id;
    try {
      if (m.type === 'load') {
        await loadWhisper(m.size, (p) => post({ type: 'progress', id, file: p.file, progress: p.progress }));
        post({ type: 'done', id });
      } else if (m.type === 'align') {
        const result = await runAlignment(
          { samples: m.samples, demo: m.demo },
          m.opts,
          {
            stage: (text) => post({ type: 'stage', id, text }),
            model: (e) => post({ type: 'model', id, status: e.status, progress: e.progress, message: e.message }),
          },
        );
        const transfer: Transferable[] = [];
        if (result.samples && result.samples.buffer instanceof ArrayBuffer) transfer.push(result.samples.buffer);
        post({ type: 'done', id, result }, transfer);
      } else if (m.type === 'transcribe') {
        const b = await loadWhisper(m.size);
        const t = await whisperTranscribeChunked(b, m.samples, 2);
        post({ type: 'done', id, text: t.text });
      }
    } catch (e: any) {
      post({ type: 'error', id, message: e?.message ?? String(e) });
    }
  });
};
