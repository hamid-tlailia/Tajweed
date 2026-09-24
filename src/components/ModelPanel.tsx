'use client';

import { TEMPO_META } from '@/lib/tajweed';
import type { ModelSize, Tempo } from '@/lib/types';
import { useTahqiq } from '@/store';
import { Badge, Panel } from './ui';

const TEMPOS: Tempo[] = ['hadr', 'tadwir', 'tartil'];

const SIZES: { id: ModelSize; label: string; size: string; hint: string }[] = [
  { id: 'tiny', label: 'سريعة', size: '٤٣ م.ب', hint: 'تنزيل أخفّ — تكفي للتدريب اليومي' },
  { id: 'base', label: 'أدقّ', size: '٨٠ م.ب', hint: 'تمييز أدقّ لأصوات الحروف — يُوصى بها' },
];

// صرامة التقييم: ثلاث درجات صريحة بدل شريطٍ متصل — أوضح للمتعلّم وأسهل للمقارنة.
type TauBand = 'lenient' | 'balanced' | 'strict';
const TAUS: { id: TauBand; label: string; value: number; hint: string }[] = [
  { id: 'lenient', label: 'متساهل', value: 0.2, hint: 'في أول التعلّم — يتجاوز عن القصور اليسير' },
  { id: 'balanced', label: 'متوازن', value: 0.5, hint: 'الوسط — يذكّر ولا يُثقل' },
  { id: 'strict', label: 'صارم', value: 0.8, hint: 'كما للممتازين — يطالب بالمقدار التامّ' },
];
/** الدرجة المعروضة من قيمة tau محفوظة (وقد تكون من شريطٍ قديم غير مضبوط على القيم الثلاث) */
const tauBand = (tau: number): TauBand => (tau < 0.35 ? 'lenient' : tau < 0.7 ? 'balanced' : 'strict');

export default function ModelPanel() {
  const modelSize = useTahqiq((s) => s.modelSize);
  const setModelSize = useTahqiq((s) => s.setModelSize);
  const tau = useTahqiq((s) => s.tau);
  const setTau = useTahqiq((s) => s.setTau);
  const tempo = useTahqiq((s) => s.tempo);
  const setTempo = useTahqiq((s) => s.setTempo);
  const instantEval = useTahqiq((s) => s.instantEval);
  const setInstantEval = useTahqiq((s) => s.setInstantEval);
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
      ? 'جاهز ✓'
      : modelStatus === 'loading'
        ? `يُنزَّل… ${Math.round(modelProgress * 100)}%`
        : modelStatus === 'error'
          ? 'تعذّر التنزيل — أعد المحاولة'
          : 'لم يُنزَّل بعد (يبدأ تلقائيًّا عند الاتصال)';

  return (
    <Panel
      title="إعدادات التقييم"
      subtitle="اختر مرتبة قراءتك ودقة السماع ومدى صرامة الحكم على نطقك"
    >
      <div className="mb-5">
        <p className="mb-2 text-xs font-semibold text-slate-200">مرتبة القراءة</p>
        <div className="grid grid-cols-3 gap-2">
          {TEMPOS.map((id) => {
            const meta = TEMPO_META[id];
            const sel = tempo === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setTempo(id)}
                className={`rounded-xl border p-2.5 text-start transition ${
                  sel ? 'border-gold-500/70 bg-gold-500/10 shadow-[0_0_14px_rgba(212,175,55,0.15)]' : 'border-line bg-ink-850/60 hover:border-gold-600/40'
                }`}
              >
                <span className={`block text-sm font-semibold ${sel ? 'text-gold-200' : 'text-slate-200'}`}>{meta.label}</span>
                <span className="mt-1 block text-[10px] leading-snug text-slate-500">{meta.hint}</span>
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-[10px] leading-relaxed text-slate-500">
          عدد حركات المدّ والغنّة لا يتغيّر؛ تتغيّر مدة الحركة فقط. إن قرأت بالحدر فلا تُحاكَم بأزمنة الترتيل.
        </p>
      </div>

      {/* دقة النموذج */}
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
                <span className={`text-sm font-semibold ${sel ? 'text-gold-200' : 'text-slate-200'}`}>
                  {sz.label}
                </span>
                <span className="text-[10px] text-slate-400">{sz.size}</span>
              </div>
              <p className="mt-1 text-[10px] leading-snug text-slate-500">{sz.hint}</p>
            </button>
          );
        })}
      </div>

      {/* صرامة التقييم */}
      <div className="mt-5">
        <p className="text-xs font-semibold text-slate-200">صرامة التقييم</p>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {TAUS.map((t) => {
            const sel = tauBand(tau) === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTau(t.value)}
                aria-pressed={sel}
                className={`rounded-xl border p-2.5 text-start transition ${
                  sel ? 'border-gold-500/70 bg-gold-500/10 shadow-[0_0_14px_rgba(212,175,55,0.15)]' : 'border-line bg-ink-850/60 hover:border-gold-600/40'
                }`}
              >
                <span className={`block text-sm font-semibold ${sel ? 'text-gold-200' : 'text-slate-200'}`}>{t.label}</span>
                <span className="mt-1 block text-[10px] leading-snug text-slate-500">{t.hint}</span>
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-[10px] leading-relaxed text-slate-500">
          كلما زادت الصرامة طالبَ التطبيقُ نطقَك بأدقّ مقدارٍ للمدود والغنن (طبيعي حركتان، متصل ٤–٥، لازم ٦…).
        </p>
      </div>

      {/* التقييم اللحظي */}
      <div className="mt-5 rounded-xl border border-line bg-ink-850/70 p-3.5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-slate-200">التقييم اللحظي</p>
            <p className="mt-1 text-[10px] leading-relaxed text-slate-500">
              إن لم يكن السماع الذكي مُجهَّزًا ظهرت النتيجةُ <b className="text-slate-300">فور إيقاف التسجيل</b>
              (قياسُ أزمنة الكلمات من صوتك وحده) — نتيجةٌ واحدة لا تتبدّل بعدها، ولا يُعتمد بها الاجتياز حتى يُجهَّز
              السماع. وإن كان مُجهَّزًا جُلبت النتيجة الكاملة مرةً واحدة. فلا تظهر نتيجتان مختلفتان لتسجيلٍ واحد.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={instantEval}
            aria-label="التقييم اللحظي"
            onClick={() => setInstantEval(!instantEval)}
            className={`relative h-6 w-11 shrink-0 rounded-full border transition ${
              instantEval ? 'border-gold-500/70 bg-gold-500/30' : 'border-line bg-ink-700'
            }`}
          >
            <span
              className={`absolute top-0.5 h-4.5 w-4.5 rounded-full transition-all ${
                instantEval ? 'start-[22px] bg-gold-300' : 'start-0.5 bg-slate-500'
              }`}
              style={{ height: 18, width: 18 }}
            />
          </button>
        </div>
        {!instantEval ? (
          <p className="mt-2 text-[10px] leading-relaxed text-slate-500">
            مُطفأ: تنتظر النتيجةُ التحليلَ الكامل دائمًا (سماعًا ذكيًّا إن كان مُجهَّزًا) — أدقّ في تمييز الألفاظ وأبطأ.
          </p>
        ) : null}
      </div>

      {/* تجهيز السماع الذكي */}
      <div className="mt-5 rounded-xl border border-line bg-ink-850/70 p-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-[11px] font-semibold text-slate-300">السماع الذكي</span>
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
            ? '✓ جاهز — ثمّ يعمل دون إنترنت'
            : modelStatus === 'loading'
              ? 'يُنزَّل الآن…'
              : modelStatus === 'error'
                ? 'إعادة محاولة التنزيل'
                : 'تجهيز السماع الذكي الآن (يُجهَّز تلقائيًّا عند فتح التطبيق)'}
        </button>
        {modelMessage && modelStatus === 'error' && (
          <p className="mt-2 text-[10px] leading-relaxed text-danger-300">{modelMessage}</p>
        )}
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-line/60 bg-ink-900/60 p-2.5">
          <Badge tone="gold" className="mt-0.5 shrink-0">
            بلا إنترنت
          </Badge>
          <p className="text-[10px] leading-relaxed text-slate-500">
            بعد أول تجهيز يعمل التطبيق كاملًا دون اتصال بالإنترنت. ولو تعذّر السماع الذكي استُكمل قياسُ الأزمنة
            صوتيًّا (كشفُ مخالفات المدود والغنن) — غير أنّ الاجتياز يبقى موقوفًا على التحقّق من نصّ التلاوة بالسماع الذكي.
          </p>
        </div>
      </div>
    </Panel>
  );
}
