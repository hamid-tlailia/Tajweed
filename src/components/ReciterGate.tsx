'use client';

import { RECITERS } from '@/lib/reciter';
import { TEMPO_META } from '@/lib/tajweed';
import { PASS_SCORE } from '@/lib/types';
import { useTahqiq } from '@/store';
import { Badge, IconShieldCheck, Panel } from './ui';

/**
 * التحكيم بالقارئ المعتمد: تُقيَّم تلاوةُ القارئ المرجعي نفسِها بمحرك التطبيق
 * (فتُخزَّن أزمنة كلماته)، ثم تُقارن بها تلاوةُ المستخدم بعد كل تسجيل — فإن
 * بلغت المطابقة حدّ الاجتياز جازت الآية. مرجعٌ واحد لكل (آية، رواية، مرتبة)
 * يُجلب مرة واحدة ويبقى محفوظًا على الجهاز.
 */
export default function ReciterGate() {
  const data = useTahqiq((s) => s.surahCache[s.selectedSurahId] ?? null);
  const scope = useTahqiq((s) => s.scope);
  const selectedAyah = useTahqiq((s) => s.selectedAyah);
  const riwayah = useTahqiq((s) => s.riwayah);
  const tempo = useTahqiq((s) => s.tempo);
  const refEval = useTahqiq((s) => s.refEval);
  const refCache = useTahqiq((s) => s.refCache);
  const evaluateReciter = useTahqiq((s) => s.evaluateReciter);
  const useGate = useTahqiq((s) => s.useReciterGate);
  const setUseGate = useTahqiq((s) => s.setUseReciterGate);

  const key = `${data?.id ?? 0}:${selectedAyah}:${riwayah}:${tempo}`;
  const cached = refCache[key];
  const state = refEval.key === key ? refEval : { status: cached ? 'ready' : 'idle', key, stage: '', error: null };
  const loading = state.status === 'loading';
  const reciter = RECITERS[riwayah];
  const scopeOk = scope === 'ayah';

  return (
    <Panel
      title="التحكيم بالقارئ المعتمد"
      subtitle="تُقيَّم تلاوة القارئ المعتمد مرجعًا، ثم تُقارن بها تلاوتك كلمةً كلمة — فإذا صحّت المطابقة اجتزت الآية"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[12px] font-semibold text-slate-200">
            {reciter.name}
            <span className="ms-2 font-normal text-slate-400">
              {riwayah === 'warsh' ? 'برواية ورش عن نافع' : 'برواية حفص عن عاصم'}
            </span>
          </p>
          {data ? (
            <p className="mt-1 text-[10.5px] text-slate-500">
              الآية {selectedAyah} من {data.meta.name} · مرتبة {TEMPO_META[tempo]?.label ?? 'ترتيل'} · حدّ الاجتياز مطابقة{' '}
              {PASS_SCORE}٪
            </p>
          ) : null}
        </div>

        <button
          type="button"
          onClick={() => void evaluateReciter()}
          disabled={loading || !scopeOk || !data}
          className={`flex h-10 shrink-0 items-center gap-2 rounded-lg border px-3.5 text-xs font-semibold transition disabled:opacity-50 ${
            cached
              ? 'border-mint-500/50 bg-mint-500/10 text-mint-300 hover:bg-mint-500/20'
              : 'border-gold-600/50 bg-gold-500/15 text-gold-200 hover:bg-gold-500/25'
          }`}
        >
          {loading ? (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-gold-500/30 border-t-gold-400" />
          ) : (
            <IconShieldCheck className="h-4 w-4" />
          )}
          {loading ? 'جارٍ التقييم…' : cached ? 'مرجع جاهز ✓ — إعادة التقييم' : 'قيّم تلاوة القارئ المعتمد'}
        </button>
      </div>

      {loading && state.stage ? <p className="mt-3 text-[11px] text-slate-400">{state.stage}</p> : null}

      {state.status === 'error' ? (
        <p className="mt-3 rounded-xl border border-danger-500/40 bg-danger-500/10 px-3 py-2.5 text-[11px] leading-relaxed text-danger-300">
          {state.error}
        </p>
      ) : null}

      {cached && state.status !== 'error' ? (
        <div className="mt-3 rounded-xl border border-mint-500/40 bg-mint-500/10 p-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[11.5px] leading-relaxed text-slate-200">
              <span className="font-semibold text-mint-300">المرجع جاهز.</span> قياسُ تلاوة القارئ على محرك التطبيق:{' '}
              <span className="font-brand font-semibold text-gold-300">{cached.score}%</span> · {cached.words.length} كلمة
              موقَّتة.
            </p>
            {useGate ? <Badge tone="mint">الاجتياز بمطابقة القارئ: مفعّل</Badge> : <Badge tone="slate">الاجتياز بمطابقة القارئ: متوقف</Badge>}
          </div>
          <p className="mt-1.5 text-[10.5px] leading-relaxed text-slate-400">
            بعد كل تسجيل تُقارن أزمنة كلماتك بأزمنته بعدلة سرعتك — فمن حافظ على نسقه في المدود والغنن والتمطيط طابقه، ومن
            خالف ظهرت مخالفته في كلمتها.
          </p>
        </div>
      ) : null}

      {/* مفتاح التحكيم */}
      <button
        type="button"
        onClick={() => setUseGate(!useGate)}
        role="switch"
        aria-checked={useGate}
        disabled={!cached}
        className="mt-3.5 flex w-full items-center justify-between gap-3 rounded-xl border border-line bg-ink-850/60 px-3.5 py-3 text-start transition hover:border-gold-600/40 disabled:opacity-60"
      >
        <span className="min-w-0">
          <span className="block text-[11.5px] font-semibold text-slate-200">الاجتياز بمطابقة القارئ المعتمد</span>
          <span className="mt-0.5 block text-[10px] leading-relaxed text-slate-500">
            {cached
              ? 'عند التفعيل: اجتياز الآية مشروط بمطابقة تلاوتك للقارئ (٧٠٪ فأعلى). عند الإيقاف: يعود الحكم للدرجة الذاتية.'
              : 'هيّئ المرجع أولًا (زرّ «قيّم تلاوة القارئ المعتمد») لتفعيل هذا الخيار.'}
          </span>
        </span>
        <span
          className={`relative h-6 w-11 shrink-0 rounded-full transition ${useGate && cached ? 'bg-mint-500' : 'bg-ink-700'}`}
        >
          <span
            className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
              useGate && cached ? 'start-[22px]' : 'start-0.5'
            }`}
          />
        </span>
      </button>

      {!scopeOk ? (
        <p className="mt-3 rounded-xl border border-warn-500/40 bg-warn-500/10 px-3 py-2.5 text-[10.5px] leading-relaxed text-warn-300">
          التحكيم متاح في وضع «آية واحدة» — اختر آية من التمرين لتفعيله.
        </p>
      ) : (
        <p className="mt-3 text-[10px] leading-relaxed text-slate-500">
          يحتاج جلبُ صوت القارئ اتصالًا بالإنترنت (مرة واحدة لكل آية، ثم يُحفظ على جهازك) — وصوتك أنت لا يُرفَع أبدًا،
          والمقارنة تجري على جهازك بالكامل.
        </p>
      )}
    </Panel>
  );
}
