'use client';

import type { ModelSize } from '@/lib/types';
import { useTahqiq } from '@/store';
import { Badge, Panel } from './ui';

const SIZES: { id: ModelSize; label: string; size: string; hint: string }[] = [
  { id: 'tiny', label: 'Whisper-tiny', size: '~43MB', hint: 'أخفُّ — تحميل أسرع ومعالجة فورية' },
  { id: 'base', label: 'Whisper-base', size: '~80MB', hint: 'أدق — أعلى مطابقة لتفاصيل النطق' },
];

export default function ModelPanel() {
  const modelSize = useTahqiq((s) => s.modelSize);
  const setModelSize = useTahqiq((s) => s.setModelSize);
  const tau = useTahqiq((s) => s.tau);
  const setTau = useTahqiq((s) => s.setTau);
  const modelStatus = useTahqiq((s) => s.modelStatus);
  const modelProgress = useTahqiq((s) => s.modelProgress);
  const modelMessage = useTahqiq((s) => s.modelMessage);
  const loadModel = useTahqiq((s) => s.loadModel);

  const statusDot =
    modelStatus === 'ready'
      ? 'bg-mint-400'
      : modelStatus === 'loading'
        ? 'bg-warn-400 animate-pulse'
        : modelStatus === 'error'
          ? 'bg-danger-400 animate-pulse'
          : 'bg-slate-500';
  const statusText =
    modelStatus === 'ready'
      ? 'مُحمَّل على الجهاز ✓'
      : modelStatus === 'loading'
        ? `جارٍ التحميل ${Math.round(modelProgress * 100)}%`
        : modelStatus === 'error'
          ? 'تعذّر — المحرّك الاحتياطي يعمل'
          : 'لم يُحمَّل بعد';

  return (
    <Panel
      title="إعدادات محرِّك التَّراصُف"
      subtitle="Forced Alignment — Whisper on ONNX Runtime Web"
      latin="Alignment Model"
      className="mb-5"
    >
      {/* model size */}
      <div className="grid grid-cols-2 gap-2.5">
        {SIZES.map((sz) => {
          const sel = modelSize === sz.id;
          return (
            <button
              key={sz.id}
              onClick={() => setModelSize(sz.id)}
              className={`rounded-xl border p-3 text-start transition ${
                sel
                  ? 'border-gold-500/70 bg-gold-500/10 shadow-[0_0_14px_rgba(212,175,55,0.15)]'
                  : 'border-line bg-ink-850/60 hover:border-gold-600/40'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className={`font-brand text-[11px] font-semibold sm:text-[13px] ${sel ? 'text-gold-200' : 'text-slate-200'}`}>
                  {sz.label}
                </span>
                <span className="font-brand text-[10px] text-slate-400">{sz.size}</span>
              </div>
              <p className="mt-1 text-[10px] leading-snug text-slate-500">{sz.hint}</p>
            </button>
          );
        })}
      </div>

      {/* τ slider */}
      <div className="mt-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label htmlFor="tau" className="text-xs text-slate-300">
            معيار المطابقة <span className="font-brand text-gold-300">τ (Match Threshold)</span>
          </label>
          <span className="rounded-md border border-line bg-ink-800 px-2 py-0.5 font-brand text-xs text-mint-300">
            {tau.toFixed(2)}
          </span>
        </div>
        <input
          id="tau"
          dir="ltr"
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={tau}
          onChange={(e) => setTau(Number(e.target.value))}
          className="mt-3 w-full"
        />
        <div className="mt-1.5 flex justify-between text-[10px] text-slate-500">
          <span>0.0 · مُيسَّر (±60%)</span>
          <span>1.0 · تجويد صارم (±15%)</span>
        </div>
        <p className="mt-1.5 text-[10px] leading-relaxed text-slate-500">
          τ يضبط سماحية مطابقة مدة الكلمة المُقاسة إلى مدّتها النموذجية المستنبطة من التشكيل (المدود، الغنن).
        </p>
      </div>

      {/* backend + load */}
      <div className="mt-5 rounded-xl border border-line bg-ink-850/70 p-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="min-w-0 text-[11px] text-slate-400">
            المُشغِّل: <b className="font-brand text-slate-200">ONNX Runtime Web · WASM</b>
          </span>
          <span className="flex items-center gap-1.5 text-[11px] text-slate-300">
            <span className={`h-2 w-2 shrink-0 rounded-full ${statusDot}`} />
            {statusText}
          </span>
        </div>
        {modelStatus === 'loading' && (
          <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-ink-700">
            <div
              className="h-full rounded-full bg-gradient-to-l from-gold-500 to-mint-500 transition-[width] duration-300"
              style={{ width: `${Math.max(4, modelProgress * 100)}%` }}
            />
          </div>
        )}
        <button
          onClick={() => void loadModel()}
          disabled={modelStatus === 'loading'}
          className="mt-3 w-full rounded-lg border border-gold-600/50 bg-gold-500/15 py-2 text-sm font-semibold text-gold-200 transition hover:bg-gold-500/25 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {modelStatus === 'ready'
            ? '✓ النموذج جاهز — يعمل على جهازك'
            : modelStatus === 'loading'
              ? 'جارٍ تنزيل النموذج…'
              : modelStatus === 'error'
                ? 'إعادة محاولة التحميل'
                : 'تحميل النموذج (يُخزَّن مؤقتًا في المتصفح)'}
        </button>
        {modelMessage && modelStatus === 'error' && (
          <p className="mt-2 text-[10px] leading-relaxed text-danger-300">{modelMessage}</p>
        )}
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-line/60 bg-ink-900/60 p-2.5">
          <Badge tone="warn" className="mt-0.5 shrink-0">
            نسخ احتياطية
          </Badge>
          <p className="text-[10px] leading-relaxed text-slate-500">
            التسلسل: <b className="font-brand text-slate-400">Whisper+انتباه متقاطع ← Whisper+طرائقي ← Energy-DTW</b>. عند أي
            عطل في WASM/ONNX (بلا شبكة، صلاحيات، موارد) ينقل المحرّك التحليل تلقائيًا إلى المستوى التالي دون انقطاع.
          </p>
        </div>
      </div>
    </Panel>
  );
}
